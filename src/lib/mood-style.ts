const ALLOWED = [
  "hardcore",
  "metal",
  "punk",
  "industrial",
  "rock",
  "alternative",
  "indie",
  "emo",
  "post-rock",
  "pop",
  "edm",
  "house",
  "techno",
  "hip hop",
  "trap",
  "r&b",
  "soul",
  "reggaeton",
  "latin",
  "funk",
  "disco",
  "lo-fi",
  "ambient",
  "classical",
  "jazz",
  "folk",
  "acoustic",
  "singer-songwriter",
  "blues",
] as const;

const ALLOWED_SET = new Set<string>(ALLOWED);

const ALIASES: Record<string, string[]> = {
  metalcore: ["hardcore", "metal"],
  deathcore: ["hardcore", "metal"],
  grindcore: ["hardcore", "metal"],
  screamo: ["hardcore", "punk"],
  djent: ["metal"],
  thrash: ["metal"],
  "black metal": ["metal"],
  "death metal": ["metal"],
  "hip-hop": ["hip hop"],
  rap: ["hip hop"],
  rnb: ["r&b"],
  "rhythm and blues": ["r&b"],
  lofi: ["lo-fi"],
  "lo fi": ["lo-fi"],
  "singer songwriter": ["singer-songwriter"],
  "post rock": ["post-rock"],
  dance: ["edm"],
  electronica: ["edm"],
  house: ["house"],
  techno: ["techno"],
  reggaetón: ["reggaeton"],
  bossanova: ["jazz"],
  bossa: ["jazz"],
  soundtrack: ["ambient"],
  classical: ["classical"],
  piano: ["classical", "acoustic"],
  instrumental: ["ambient"],
};

const NAME_RULES: Array<{ re: RegExp; tags: string[] }> = [
  { re: /\b(hardcore|metalcore|deathcore|grindcore|screamo|beatdown)\b/i, tags: ["hardcore", "metal"] },
  { re: /\b(black metal|death metal|doom metal|thrash|djent|metal|punk|industrial)\b/i, tags: ["metal"] },
  { re: /\b(lo-?fi|ambient|classical|piano)\b/i, tags: ["lo-fi", "ambient"] },
  { re: /\bjazz\b/i, tags: ["jazz"] },
  { re: /\b(reggaeton|reggaetón|perreo|dembow)\b/i, tags: ["reggaeton", "latin"] },
  { re: /\b(techno|house|trance|edm|dubstep)\b/i, tags: ["edm"] },
  { re: /\b(hip[\s-]?hop|trap)\b/i, tags: ["hip hop"] },
  { re: /\b(singer-songwriter|ac[uú]stic[oa])\b/i, tags: ["acoustic", "singer-songwriter"] },
];

const AGGRESSIVE = new Set(["hardcore", "metal", "punk", "industrial"]);
const CALM = new Set([
  "lo-fi",
  "ambient",
  "classical",
  "jazz",
  "soul",
  "r&b",
  "folk",
  "acoustic",
  "singer-songwriter",
  "blues",
]);
const FOCUSED = new Set(["lo-fi", "ambient", "classical", "jazz", "acoustic", "folk", "post-rock"]);
const SAD = new Set(["emo", "blues", "folk", "singer-songwriter", "acoustic", "post-rock", "indie"]);
const PARTY = new Set(["edm", "house", "techno", "pop", "reggaeton", "latin", "funk", "disco", "hip hop", "trap"]);
const HAPPY = new Set(["pop", "edm", "house", "funk", "disco", "latin", "reggaeton"]);

export const STYLE_TAG_LIST = ALLOWED.join(", ");

function has(tags: string[], group: Set<string>): boolean {
  return tags.some((tag) => group.has(tag));
}

export function normalizeStyleTags(raw: string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const value of raw ?? []) {
    const text = value.trim().toLowerCase();
    if (!text || text === "unknown") continue;
    const mapped = ALIASES[text] ?? (ALLOWED_SET.has(text) ? [text] : []);
    for (const tag of mapped) {
      if (!out.includes(tag)) out.push(tag);
    }
  }
  return out;
}

export function inferStyleFromText(text: string): string[] {
  const tags: string[] = [];
  for (const rule of NAME_RULES) {
    if (!rule.re.test(text)) continue;
    for (const tag of rule.tags) {
      if (!tags.includes(tag)) tags.push(tag);
    }
  }
  if (has(tags, AGGRESSIVE)) return tags.filter((tag) => AGGRESSIVE.has(tag));
  return tags;
}

export function stylesForTrack(
  artistName: string,
  trackName: string,
  stored: string[] | null | undefined,
): string[] {
  const fromArtist = inferStyleFromText(artistName);
  if (has(fromArtist, AGGRESSIVE)) return fromArtist;
  const storedTags = normalizeStyleTags(stored);
  if (storedTags.length) return storedTags;
  if (fromArtist.length) return fromArtist;
  return inferStyleFromText(trackName);
}

const STRONG_CALM = new Set(["lo-fi", "ambient", "jazz", "classical"]);

export function styleMatchesMood(mood: string, tags: string[]): boolean {
  if (!tags.length) return false;
  const aggressive = has(tags, AGGRESSIVE);
  const party = has(tags, PARTY);
  const calm = has(tags, CALM);
  const partyBlocked = party && !has(tags, STRONG_CALM);
  switch (mood) {
    case "chill":
      return calm && !aggressive && !partyBlocked;
    case "focused":
      return has(tags, FOCUSED) && !aggressive && !partyBlocked;
    case "melancholic":
      return has(tags, SAD) && !aggressive && !party;
    case "intense":
      return aggressive;
    case "energetic":
      return has(tags, new Set(["rock", "alternative", "hip hop", "trap"])) && !aggressive && !calm;
    case "euphoric":
      return has(tags, HAPPY) && !aggressive && !has(tags, STRONG_CALM);
    case "party":
      return party && !aggressive && !has(tags, STRONG_CALM);
    case "balanced":
      return true;
    default:
      return false;
  }
}

export function styleLabel(tags: string[]): string {
  return tags.slice(0, 2).join(" · ");
}
