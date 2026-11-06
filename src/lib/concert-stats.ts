import type { RawSet, RawSetlist, RawSong } from "@/lib/setlistfm";

export interface RankedItem {
  id: string;
  name: string;
  detail?: string;
  count: number;
  href?: string;
}

export interface ConcertEntry {
  id: string;
  artistName: string;
  eventDate: string;
  venueName: string;
  cityName: string;
  countryName: string;
  countryCode: string;
  tour: string | null;
  url: string;
  songCount: number;
  hasEncore: boolean;
}

export interface ConcertStats {
  concerts: number;
  artistCount: number;
  venueCount: number;
  cityCount: number;
  countryCount: number;
  songCount: number;
  coverCount: number;
  missingSetlists: number;
  showsWithEncore: number;
  topSong: RankedItem | null;
  topArtist: RankedItem | null;
  topCity: RankedItem | null;
  songs: RankedItem[];
  artists: RankedItem[];
  venues: RankedItem[];
  cities: RankedItem[];
  tours: RankedItem[];
  covers: RankedItem[];
  years: Array<{ year: number; count: number }>;
  weekdays: number[];
  shows: ConcertEntry[];
}

function asList<T>(value: T | T[] | undefined): T[] {
  return !value ? [] : Array.isArray(value) ? value : [value];
}

function eventParts(value: string | undefined): { iso: string; year: number; month: number; day: number } | null {
  const [day, month, year] = (value ?? "").split("-").map(Number);
  if (!year || !month || !day) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return { iso: `${year}-${mm}-${dd}`, year, month, day };
}

function songKey(artist: string, title: string): string {
  return `${artist.trim().toLowerCase()}::${title.trim().toLowerCase()}`;
}

type Bucket = {
  name: string;
  detail?: string;
  href?: string;
  shows: Set<string>;
};

function bump(map: Map<string, Bucket>, id: string, showId: string, name: string, extra?: { detail?: string; href?: string }) {
  const current = map.get(id) ?? { name, detail: extra?.detail, href: extra?.href, shows: new Set<string>() };
  current.shows.add(showId);
  if (!current.detail && extra?.detail) current.detail = extra.detail;
  if (!current.href && extra?.href) current.href = extra.href;
  map.set(id, current);
}

function ranked(map: Map<string, Bucket>, limit = 40): RankedItem[] {
  return Array.from(map.entries())
    .map(([id, bucket]) => ({
      id,
      name: bucket.name,
      detail: bucket.detail,
      href: bucket.href,
      count: bucket.shows.size,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"))
    .slice(0, limit);
}

function liveSongs(set: RawSet): RawSong[] {
  return asList(set.song).filter((song) => song.tape !== true && Boolean(song.name?.trim()));
}

export function buildConcertStats(setlists: RawSetlist[]): ConcertStats {
  const artists = new Map<string, Bucket>();
  const venues = new Map<string, Bucket>();
  const cities = new Map<string, Bucket>();
  const countries = new Set<string>();
  const songs = new Map<string, Bucket>();
  const covers = new Map<string, Bucket>();
  const tours = new Map<string, Bucket>();
  const yearCounts = new Map<number, number>();
  const weekdays = [0, 0, 0, 0, 0, 0, 0];
  const shows: ConcertEntry[] = [];
  let missingSetlists = 0;
  let showsWithEncore = 0;

  for (const setlist of setlists) {
    const when = eventParts(setlist.eventDate);
    const showId = setlist.id || `${setlist.artist?.name ?? ""}-${setlist.eventDate ?? ""}`;
    if (!when) continue;

    const artistName = setlist.artist?.name?.trim() || "Artista";
    const artistId = setlist.artist?.mbid || artistName.toLowerCase();
    bump(artists, artistId, showId, artistName, { href: setlist.artist?.url });

    const venueName = setlist.venue?.name?.trim() || "Venue";
    const cityName = setlist.venue?.city?.name?.trim() || "";
    const countryName = setlist.venue?.city?.country?.name?.trim() || "";
    const countryCode = setlist.venue?.city?.country?.code?.trim() || "";
    const venueId = setlist.venue?.id || `${venueName}|${cityName}`.toLowerCase();
    bump(venues, venueId, showId, venueName, {
      detail: [cityName, countryName].filter(Boolean).join(", "),
      href: setlist.venue?.url,
    });

    if (cityName) {
      const cityId = setlist.venue?.city?.id || `${cityName}|${countryCode || countryName}`.toLowerCase();
      bump(cities, cityId, showId, cityName, { detail: countryName || undefined });
    }
    if (countryCode || countryName) countries.add(countryCode || countryName);

    const tour = setlist.tour?.name?.trim();
    if (tour) bump(tours, tour.toLowerCase(), showId, tour);

    const sets = asList(setlist.set);
    const heard = new Set<string>();
    let songCount = 0;
    let encore = false;
    for (const set of sets) {
      if (typeof set.encore === "number" && set.encore > 0) encore = true;
      for (const song of liveSongs(set)) {
        const title = song.name!.trim();
        songCount += 1;
        const key = songKey(artistName, title);
        if (heard.has(key)) continue;
        heard.add(key);
        const guest = song.with?.name?.trim();
        const original = song.cover?.name?.trim();
        const detail = [
          artistName,
          original ? `cover de ${original}` : "",
          guest ? `con ${guest}` : "",
        ].filter(Boolean).join(" · ");
        bump(songs, key, showId, title, { detail });
        if (original) {
          bump(covers, `${key}::${original.toLowerCase()}`, showId, title, {
            detail: `${artistName} · original de ${original}`,
          });
        }
      }
    }

    if (songCount === 0) missingSetlists += 1;
    if (encore) showsWithEncore += 1;
    yearCounts.set(when.year, (yearCounts.get(when.year) ?? 0) + 1);
    const weekday = new Date(when.year, when.month - 1, when.day).getDay();
    weekdays[(weekday + 6) % 7] += 1;

    shows.push({
      id: showId,
      artistName,
      eventDate: when.iso,
      venueName,
      cityName,
      countryName,
      countryCode,
      tour: tour || null,
      url: setlist.url || "https://www.setlist.fm",
      songCount,
      hasEncore: encore,
    });
  }

  shows.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  const songRank = ranked(songs);
  const artistRank = ranked(artists);
  const cityRank = ranked(cities);
  const years = Array.from(yearCounts.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year - b.year);

  return {
    concerts: shows.length,
    artistCount: artists.size,
    venueCount: venues.size,
    cityCount: cities.size,
    countryCount: countries.size,
    songCount: songs.size,
    coverCount: covers.size,
    missingSetlists,
    showsWithEncore,
    topSong: songRank[0] ?? null,
    topArtist: artistRank[0] ?? null,
    topCity: cityRank[0] ?? null,
    songs: songRank,
    artists: artistRank,
    venues: ranked(venues),
    cities: cityRank,
    tours: ranked(tours),
    covers: ranked(covers),
    years,
    weekdays,
    shows,
  };
}
