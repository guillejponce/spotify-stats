import { createServerSupabaseClient } from "./supabase";
import { asRows, numeric } from "./rank-delta";
import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";
import { DISPLAY_TIME_ZONE } from "./chile-time";
import { sendWebPush, type PushSubscriptionJSON } from "./web-push";

export type RankRow = {
  entity_id: string;
  entity_name: string;
  rank: number;
  play_count: number;
};

export type RankingRise = {
  entity_type: "track" | "artist";
  entity_id: string;
  entity_name: string;
  from_rank: number | null;
  to_rank: number;
  kind: "top100_rise" | "big_jump";
};

async function fetchAllTimeRanks(
  entityType: "track" | "artist" | "album",
  asOf: Date
): Promise<RankRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_all_time_ranks", {
    entity_type: entityType,
    as_of: asOf.toISOString(),
  });
  if (error) throw error;
  return asRows(data).map((r) => ({
    entity_id: String(r.entity_id ?? ""),
    entity_name: String(r.entity_name ?? ""),
    rank: numeric(r.rank),
    play_count: numeric(r.play_count),
  }));
}

async function loadSnapshotMap(
  entityType: "track" | "artist",
  snapshotDate: string
): Promise<Map<string, RankRow>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ranking_snapshots")
    .select("entity_id, entity_name, rank, play_count")
    .eq("entity_type", entityType)
    .eq("snapshot_date", snapshotDate);

  if (error) throw error;
  const map = new Map<string, RankRow>();
  for (const r of data ?? []) {
    map.set(String(r.entity_id), {
      entity_id: String(r.entity_id),
      entity_name: String(r.entity_name),
      rank: Number(r.rank),
      play_count: Number(r.play_count),
    });
  }
  return map;
}

async function saveSnapshot(
  entityType: "track" | "artist" | "album",
  snapshotDate: string,
  rows: RankRow[]
): Promise<void> {
  const supabase = createServerSupabaseClient();
  // Reemplazar el día por si el cron corre más de una vez.
  await supabase
    .from("ranking_snapshots")
    .delete()
    .eq("entity_type", entityType)
    .eq("snapshot_date", snapshotDate);

  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk).map((r) => ({
      snapshot_date: snapshotDate,
      entity_type: entityType,
      entity_id: r.entity_id,
      entity_name: r.entity_name,
      rank: r.rank,
      play_count: r.play_count,
    }));
    const { error } = await supabase.from("ranking_snapshots").insert(slice);
    if (error) throw error;
  }
}

function detectRises(
  entityType: "track" | "artist",
  today: RankRow[],
  yesterday: Map<string, RankRow>,
  monthAgo: Map<string, RankRow>
): RankingRise[] {
  const rises: RankingRise[] = [];

  for (const row of today) {
    const y = yesterday.get(row.entity_id);
    const m = monthAgo.get(row.entity_id);

    // Top 100: cualquier subida vs ayer.
    if (row.rank <= 100 && y && row.rank < y.rank) {
      rises.push({
        entity_type: entityType,
        entity_id: row.entity_id,
        entity_name: row.entity_name,
        from_rank: y.rank,
        to_rank: row.rank,
        kind: "top100_rise",
      });
      continue;
    }

    // Fuera del top 100: solo salto de +100 puestos en ~1 mes.
    if (row.rank > 100 && m && m.rank - row.rank >= 100) {
      rises.push({
        entity_type: entityType,
        entity_id: row.entity_id,
        entity_name: row.entity_name,
        from_rank: m.rank,
        to_rank: row.rank,
        kind: "big_jump",
      });
    }
  }

  return rises;
}

async function filterUnsent(
  snapshotDate: string,
  rises: RankingRise[]
): Promise<RankingRise[]> {
  if (rises.length === 0) return [];
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("ranking_notifications_sent")
    .select("entity_type, entity_id, kind")
    .eq("snapshot_date", snapshotDate);

  const sent = new Set(
    (data ?? []).map((r) => `${r.entity_type}:${r.entity_id}:${r.kind}`)
  );

  return rises.filter(
    (r) => !sent.has(`${r.entity_type}:${r.entity_id}:${r.kind}`)
  );
}

async function markSent(snapshotDate: string, rises: RankingRise[]) {
  if (rises.length === 0) return;
  const supabase = createServerSupabaseClient();
  await supabase.from("ranking_notifications_sent").insert(
    rises.map((r) => ({
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      snapshot_date: snapshotDate,
      kind: r.kind,
      from_rank: r.from_rank,
      to_rank: r.to_rank,
    }))
  );
}

function riseMessage(r: RankingRise): { title: string; body: string; url: string } {
  const label = r.entity_type === "track" ? "Canción" : "Artista";
  const path = r.entity_type === "track" ? "/tracks" : "/artists";
  if (r.kind === "top100_rise") {
    return {
      title: `${label} subió en el top 100`,
      body: `“${r.entity_name}” subió del #${r.from_rank} al #${r.to_rank}`,
      url: path,
    };
  }
  const jumped = (r.from_rank ?? r.to_rank) - r.to_rank;
  return {
    title: `${label}: salto grande`,
    body: `“${r.entity_name}” subió ${jumped} puestos (ahora #${r.to_rank})`,
    url: path,
  };
}

async function broadcastRises(rises: RankingRise[]): Promise<{
  sent: number;
  pruned: number;
}> {
  const supabase = createServerSupabaseClient();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error) throw error;
  if (!subs?.length) return { sent: 0, pruned: 0 };

  let sent = 0;
  let pruned = 0;
  const goneIds: string[] = [];

  for (const rise of rises) {
    const msg = riseMessage(rise);
    for (const sub of subs) {
      const subscription: PushSubscriptionJSON = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      const result = await sendWebPush(subscription, {
        title: msg.title,
        body: msg.body,
        url: msg.url,
        tag: `rank-${rise.entity_type}-${rise.entity_id}-${rise.kind}`,
      });
      if (result.ok) sent += 1;
      if (result.gone) goneIds.push(sub.id);
    }
  }

  if (goneIds.length) {
    await supabase.from("push_subscriptions").delete().in("id", goneIds);
    pruned = goneIds.length;
  }

  return { sent, pruned };
}

/**
 * Snapshot diario all-time + notificaciones de subidas (tracks/artists).
 */
export async function runRankingAlertsJob(now: Date = new Date()): Promise<{
  snapshotDate: string;
  rises: number;
  notified: number;
  pruned: number;
  trackCount: number;
  artistCount: number;
}> {
  const snapshotDate = formatInTimeZone(now, DISPLAY_TIME_ZONE, "yyyy-MM-dd");
  const yesterdayDate = formatInTimeZone(
    subDays(now, 1),
    DISPLAY_TIME_ZONE,
    "yyyy-MM-dd"
  );
  const monthAgoDate = formatInTimeZone(
    subDays(now, 30),
    DISPLAY_TIME_ZONE,
    "yyyy-MM-dd"
  );

  const [tracks, artists, albums] = await Promise.all([
    fetchAllTimeRanks("track", now),
    fetchAllTimeRanks("artist", now),
    fetchAllTimeRanks("album", now),
  ]);

  await Promise.all([
    saveSnapshot("track", snapshotDate, tracks),
    saveSnapshot("artist", snapshotDate, artists),
    saveSnapshot("album", snapshotDate, albums),
  ]);

  const [yTracks, yArtists, mTracks, mArtists] = await Promise.all([
    loadSnapshotMap("track", yesterdayDate),
    loadSnapshotMap("artist", yesterdayDate),
    loadSnapshotMap("track", monthAgoDate),
    loadSnapshotMap("artist", monthAgoDate),
  ]);

  // Primer día sin historial: no spamear; solo guardar snapshot.
  if (yTracks.size === 0 && yArtists.size === 0) {
    return {
      snapshotDate,
      rises: 0,
      notified: 0,
      pruned: 0,
      trackCount: tracks.length,
      artistCount: artists.length,
    };
  }

  const rises = [
    ...detectRises("track", tracks, yTracks, mTracks),
    ...detectRises("artist", artists, yArtists, mArtists),
  ];

  const fresh = await filterUnsent(snapshotDate, rises);
  // Cap diario para no inundar el dispositivo.
  const capped = fresh.slice(0, 25);
  const { sent, pruned } = await broadcastRises(capped);
  await markSent(snapshotDate, capped);

  return {
    snapshotDate,
    rises: capped.length,
    notified: sent,
    pruned,
    trackCount: tracks.length,
    artistCount: artists.length,
  };
}
