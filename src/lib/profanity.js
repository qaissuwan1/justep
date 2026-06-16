// Bad-word filter for usernames (English + Arabic). Used by the Profile page so
// leaderboard display names stay clean. Not exhaustive — a pragmatic blocklist
// with obfuscation-resistant normalization.

const EN = [
  "fuck", "shit", "bitch", "cunt", "asshole", "bastard", "dick", "piss", "cock",
  "pussy", "slut", "whore", "fag", "faggot", "nigger", "nigga", "retard", "wank",
  "wanker", "twat", "douche", "prick", "bollocks", "arse", "motherfucker",
  "bullshit", "dipshit", "jackass", "dumbass", "skank", "boner", "jizz", "cum",
];

const AR = [
  "كس", "طيز", "زب", "نيك", "عرص", "شرموط", "شرموطة", "خول", "قحبة", "قحبه",
  "منيك", "منيوك", "كسمك", "كسم", "زبي", "طيزك", "نياك", "عاهرة", "متناك",
  "متناكة", "خرا", "خره", "زاني", "زانية", "داعر", "داعرة", "لبوة", "منيوكة",
];

const WORDS = [...EN, ...AR];

// Normalize so obfuscations like "f.u.c.k", "f u c k", "fuuuck", "f4ck" still
// match: lowercase, fold common leet digits to letters, drop every non-letter
// separator, then collapse runs of a repeated char down to one.
function normalize(text) {
  let t = String(text || "").toLowerCase();
  const leet = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };
  t = t.replace(/[013457@$]/g, (c) => leet[c] || c);
  t = t.replace(/[^\p{L}]/gu, "");        // keep letters of any script only
  t = t.replace(/(.)\1+/gu, "$1");        // collapse repeated chars
  return t;
}

export function hasProfanity(text) {
  if (!text) return false;
  const raw = String(text).toLowerCase();
  const norm = normalize(text);
  return WORDS.some((w) => {
    const wn = normalize(w);
    if (!wn) return false;
    return norm.includes(wn) || raw.includes(w.toLowerCase());
  });
}

// Returns { ok, error }. Rules: 3–24 chars; letters (any script), numbers,
// spaces and underscores only; no profanity.
export function validateUsername(name) {
  const v = String(name || "").trim();
  if (v.length < 3) return { ok: false, error: "Username must be at least 3 characters." };
  if (v.length > 24) return { ok: false, error: "Username must be 24 characters or fewer." };
  if (!/^[\p{L}\p{N} _]+$/u.test(v)) return { ok: false, error: "Use only letters, numbers, spaces and underscores." };
  if (hasProfanity(v)) return { ok: false, error: "Please choose a different username." };
  return { ok: true, error: null };
}
