/**
 * Script para poblar audio features desde Spotify API
 * 
 * Este script obtiene audio features (valence, energy, etc) de Spotify
 * para todos los tracks en la base de datos que aún no tienen features.
 * 
 * Usage:
 *   npx tsx scripts/fetch-audio-features.ts [--user-id=<uuid>] [--limit=100]
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const BATCH_SIZE = 100; // Spotify permite hasta 100 tracks por request

interface AudioFeatures {
  danceability: number;
  energy: number;
  valence: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  tempo: number;
  loudness: number;
  mode: number;
  key: number;
  time_signature: number;
  duration_ms: number;
}

async function getClientCredentialsToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
  }

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    throw new Error(`Spotify auth failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function fetchAudioFeaturesBatch(
  accessToken: string,
  trackIds: string[]
): Promise<Map<string, AudioFeatures>> {
  const url = `${SPOTIFY_API_BASE}/audio-features?ids=${encodeURIComponent(trackIds.join(","))}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const results = new Map<string, AudioFeatures>();

  if (data.audio_features) {
    for (const af of data.audio_features) {
      if (!af || !af.id) continue;

      results.set(af.id, {
        danceability: af.danceability ?? 0,
        energy: af.energy ?? 0,
        valence: af.valence ?? 0,
        acousticness: af.acousticness ?? 0,
        instrumentalness: af.instrumentalness ?? 0,
        speechiness: af.speechiness ?? 0,
        tempo: af.tempo ?? 0,
        loudness: af.loudness ?? 0,
        mode: af.mode ?? 0,
        key: af.key ?? 0,
        time_signature: af.time_signature ?? 4,
        duration_ms: af.duration_ms ?? 0,
      });
    }
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const userId = args.find((a) => a.startsWith("--user-id="))?.split("=")[1];
  const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const limit = limitArg ? parseInt(limitArg, 10) : 1000;

  console.log("🎵 Fetching audio features from Spotify...");
  if (userId) console.log(`👤 User ID filter: ${userId}`);
  console.log(`📊 Limit: ${limit} tracks`);

  // Setup Supabase client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get Spotify token
  console.log("\n🔑 Getting Spotify access token...");
  const accessToken = await getClientCredentialsToken();
  console.log("✓ Token obtained");

  // Get tracks that don't have audio features yet
  console.log("\n📋 Finding tracks without audio features...");

  let query = supabase
    .from("tracks")
    .select("id")
    .not("id", "in", supabase.from("track_audio_features").select("track_id"));

  // If user_id specified, only get tracks from that user's plays
  if (userId) {
    const { data: userTracks } = await supabase
      .from("plays")
      .select("track_id")
      .eq("user_id", userId);

    if (!userTracks || userTracks.length === 0) {
      console.log("❌ No tracks found for user");
      return;
    }

    const trackIds = [...new Set(userTracks.map((p) => p.track_id))];
    query = query.in("id", trackIds);
  }

  const { data: tracksToFetch, error: fetchError } = await query.limit(limit);

  if (fetchError) {
    throw new Error(`Error fetching tracks: ${fetchError.message}`);
  }

  if (!tracksToFetch || tracksToFetch.length === 0) {
    console.log("✨ All tracks already have audio features!");
    return;
  }

  console.log(`✓ Found ${tracksToFetch.length} tracks to process`);

  // Process in batches
  const trackIds = tracksToFetch.map((t) => t.id);
  let processed = 0;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < trackIds.length; i += BATCH_SIZE) {
    const batch = trackIds.slice(i, i + BATCH_SIZE);

    try {
      console.log(
        `\n🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(trackIds.length / BATCH_SIZE)}...`
      );

      const features = await fetchAudioFeaturesBatch(accessToken, batch);

      // Insert into database
      const records = Array.from(features.entries()).map(([trackId, af]) => ({
        track_id: trackId,
        ...af,
        updated_at: new Date().toISOString(),
      }));

      if (records.length > 0) {
        const { error: insertError } = await supabase
          .from("track_audio_features")
          .upsert(records, { onConflict: "track_id" });

        if (insertError) {
          console.error(`❌ Error inserting batch: ${insertError.message}`);
          errors += batch.length;
        } else {
          console.log(`✓ Inserted ${records.length} audio features`);
          inserted += records.length;
        }
      }

      processed += batch.length;

      // Rate limiting: wait 100ms between batches
      if (i + BATCH_SIZE < trackIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`❌ Error processing batch: ${error}`);
      errors += batch.length;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("📊 Summary:");
  console.log(`   Processed: ${processed} tracks`);
  console.log(`   Inserted: ${inserted} features`);
  console.log(`   Errors: ${errors}`);
  console.log("=".repeat(50));
  console.log("\n✨ Done!");
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});
