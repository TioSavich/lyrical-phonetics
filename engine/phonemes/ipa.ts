/**
 * IPA utilities — language-agnostic vowel/consonant classification,
 * ARPAbet→IPA conversion, and phoneme distance for paronym/cascade work.
 *
 * Internally we store pronunciations as arrays of IPA tokens. A token is
 * one phoneme: a base symbol + optional combining diacritics (e.g. ɛ̃, ɔ̃).
 * Stress/length markers (ˈ, ˌ, ː) are NOT part of a token — they live in a
 * parallel `stress` array on the syllable level (see Language.lookup).
 */

// Base IPA vowel symbols across the languages we care about (en/fr/de + headroom).
export const IPA_VOWELS = new Set([
  // Cardinal & near-cardinal
  'i', 'y', 'ɨ', 'ʉ', 'ɯ', 'u',
  'ɪ', 'ʏ', 'ʊ',
  'e', 'ø', 'ɘ', 'ɵ', 'ɤ', 'o',
  'ɛ', 'œ', 'ɜ', 'ɞ', 'ʌ', 'ɔ',
  'æ', 'ɐ',
  'a', 'ɶ', 'ɑ', 'ɒ',
  // Reduced
  'ə', 'ɚ', 'ɝ',
]);

// Diphthong cores we keep as single tokens for English convenience.
export const IPA_DIPHTHONGS = new Set([
  'aɪ', 'aʊ', 'eɪ', 'oʊ', 'ɔɪ',
  'ɪə', 'ʊə', 'eə',
]);

export const IPA_CONSONANTS = new Set([
  // Plosives
  'p', 'b', 't', 'd', 'k', 'ɡ', 'g', 'ʔ',
  // Nasals
  'm', 'n', 'ɲ', 'ŋ', 'ɴ',
  // Trills/taps
  'r', 'ɾ', 'ʀ', 'ʁ',
  // Fricatives
  'f', 'v', 'θ', 'ð', 's', 'z', 'ʃ', 'ʒ',
  'ç', 'x', 'ɣ', 'χ', 'h', 'ɦ',
  // Affricates (kept as digraph tokens)
  'tʃ', 'dʒ', 'ts', 'pf',
  // Approximants & laterals
  'l', 'ʎ', 'ɫ', 'j', 'w', 'ɥ', 'ɹ',
]);

// Combining marks that may attach to a base vowel/consonant.
const NASAL_TILDE = '̃';   // ̃   nasalized
const LENGTH_MARK = 'ː';

/** Strip stress/length marks but keep nasalization etc. that change identity. */
export function normalizePhoneme(p: string): string {
  return p.replace(/[ˈˌ]/g, '').replace(LENGTH_MARK, '');
}

/** Strip everything that is not part of phonemic identity (incl. nasal tilde). */
export function bareSymbol(p: string): string {
  return normalizePhoneme(p).replace(NASAL_TILDE, '');
}

export function isVowel(p: string): boolean {
  const n = normalizePhoneme(p);
  if (IPA_DIPHTHONGS.has(n)) return true;
  // Nasal vowel: vowel + ̃
  if (n.length >= 2 && n.endsWith(NASAL_TILDE)) {
    return IPA_VOWELS.has(n.slice(0, -1));
  }
  return IPA_VOWELS.has(n);
}

export function isConsonant(p: string): boolean {
  if (!p) return false;
  return !isVowel(p);
}

export function isNasalVowel(p: string): boolean {
  const n = normalizePhoneme(p);
  return n.endsWith(NASAL_TILDE) && IPA_VOWELS.has(n.slice(0, -1));
}

// ── ARPAbet ↔ IPA ─────────────────────────────────────────────────────────
// Stress-bearing ARPAbet vowels carry a digit (0/1/2). We split into
// (ipaToken, stress) so the rest of the pipeline can treat stress uniformly.

const ARPABET_TO_IPA: Record<string, string> = {
  // Monophthongs
  AA: 'ɑ', AE: 'æ', AH: 'ʌ', AO: 'ɔ',
  EH: 'ɛ', ER: 'ɝ',
  IH: 'ɪ', IY: 'i',
  UH: 'ʊ', UW: 'u',
  // Diphthongs (kept as single tokens — see IPA_DIPHTHONGS)
  AW: 'aʊ', AY: 'aɪ', EY: 'eɪ', OW: 'oʊ', OY: 'ɔɪ',
  // Consonants
  B: 'b', CH: 'tʃ', D: 'd', DH: 'ð',
  F: 'f', G: 'ɡ', HH: 'h', JH: 'dʒ',
  K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ',
  P: 'p', R: 'ɹ', S: 's', SH: 'ʃ',
  T: 't', TH: 'θ', V: 'v', W: 'w', Y: 'j',
  Z: 'z', ZH: 'ʒ',
};

export type IpaSegment = {
  ipa: string;
  isVowel: boolean;
  stress: number | null; // 0 | 1 | 2 for vowels, null for consonants
};

/** Convert an ARPAbet phone string ("AH1") to an IpaSegment. */
export function arpaPhoneToIpa(phone: string): IpaSegment | null {
  const stressMatch = phone.match(/[012]/);
  const bare = phone.replace(/[012]/g, '');
  const ipa = ARPABET_TO_IPA[bare];
  if (!ipa) return null;
  const vowel = isVowel(ipa);
  return {
    ipa,
    isVowel: vowel,
    stress: vowel ? (stressMatch ? parseInt(stressMatch[0], 10) : 0) : null,
  };
}

/** Convert a full ARPAbet pronunciation to an IPA token sequence (no stress marks). */
export function arpaToIpa(phones: string[]): IpaSegment[] {
  const out: IpaSegment[] = [];
  for (const p of phones) {
    const seg = arpaPhoneToIpa(p);
    if (seg) out.push(seg);
  }
  return out;
}

// ── Phoneme distance (for paronym / "trace" detection) ────────────────────
// We use a feature-bag distance so that (s, z) is closer than (s, m).

type Features = {
  manner: string;
  place: string;
  voiced: boolean;
  height?: string;   // vowels
  backness?: string; // vowels
  rounded?: boolean; // vowels
  nasal?: boolean;
};

const CONS_FEATURES: Record<string, Features> = {
  p: { manner: 'stop', place: 'bilabial',     voiced: false },
  b: { manner: 'stop', place: 'bilabial',     voiced: true  },
  t: { manner: 'stop', place: 'alveolar',     voiced: false },
  d: { manner: 'stop', place: 'alveolar',     voiced: true  },
  k: { manner: 'stop', place: 'velar',        voiced: false },
  ɡ: { manner: 'stop', place: 'velar',        voiced: true  },
  g: { manner: 'stop', place: 'velar',        voiced: true  },
  f: { manner: 'fricative', place: 'labiodental', voiced: false },
  v: { manner: 'fricative', place: 'labiodental', voiced: true  },
  θ: { manner: 'fricative', place: 'dental',      voiced: false },
  ð: { manner: 'fricative', place: 'dental',      voiced: true  },
  s: { manner: 'fricative', place: 'alveolar',    voiced: false },
  z: { manner: 'fricative', place: 'alveolar',    voiced: true  },
  ʃ: { manner: 'fricative', place: 'postalveolar', voiced: false },
  ʒ: { manner: 'fricative', place: 'postalveolar', voiced: true  },
  ç: { manner: 'fricative', place: 'palatal',     voiced: false },
  x: { manner: 'fricative', place: 'velar',       voiced: false },
  ʁ: { manner: 'fricative', place: 'uvular',      voiced: true  },
  χ: { manner: 'fricative', place: 'uvular',      voiced: false },
  h: { manner: 'fricative', place: 'glottal',     voiced: false },
  m: { manner: 'nasal', place: 'bilabial', voiced: true, nasal: true },
  n: { manner: 'nasal', place: 'alveolar', voiced: true, nasal: true },
  ɲ: { manner: 'nasal', place: 'palatal',  voiced: true, nasal: true },
  ŋ: { manner: 'nasal', place: 'velar',    voiced: true, nasal: true },
  l: { manner: 'lateral', place: 'alveolar', voiced: true },
  ʎ: { manner: 'lateral', place: 'palatal',  voiced: true },
  ɹ: { manner: 'approximant', place: 'alveolar', voiced: true },
  r: { manner: 'trill', place: 'alveolar', voiced: true },
  j: { manner: 'approximant', place: 'palatal', voiced: true },
  w: { manner: 'approximant', place: 'labial-velar', voiced: true },
  ɥ: { manner: 'approximant', place: 'labial-palatal', voiced: true },
  tʃ: { manner: 'affricate', place: 'postalveolar', voiced: false },
  dʒ: { manner: 'affricate', place: 'postalveolar', voiced: true  },
  pf: { manner: 'affricate', place: 'labiodental', voiced: false },
  ts: { manner: 'affricate', place: 'alveolar', voiced: false },
};

const VOWEL_FEATURES: Record<string, Features> = {
  i: { manner: 'vowel', place: '', voiced: true, height: 'high', backness: 'front', rounded: false },
  y: { manner: 'vowel', place: '', voiced: true, height: 'high', backness: 'front', rounded: true  },
  ɪ: { manner: 'vowel', place: '', voiced: true, height: 'near-high', backness: 'front', rounded: false },
  e: { manner: 'vowel', place: '', voiced: true, height: 'mid-high', backness: 'front', rounded: false },
  ø: { manner: 'vowel', place: '', voiced: true, height: 'mid-high', backness: 'front', rounded: true  },
  ɛ: { manner: 'vowel', place: '', voiced: true, height: 'mid-low', backness: 'front', rounded: false },
  œ: { manner: 'vowel', place: '', voiced: true, height: 'mid-low', backness: 'front', rounded: true  },
  æ: { manner: 'vowel', place: '', voiced: true, height: 'near-low', backness: 'front', rounded: false },
  a: { manner: 'vowel', place: '', voiced: true, height: 'low', backness: 'front', rounded: false },
  ə: { manner: 'vowel', place: '', voiced: true, height: 'mid', backness: 'central', rounded: false },
  ʌ: { manner: 'vowel', place: '', voiced: true, height: 'mid-low', backness: 'central', rounded: false },
  ɐ: { manner: 'vowel', place: '', voiced: true, height: 'near-low', backness: 'central', rounded: false },
  ɝ: { manner: 'vowel', place: '', voiced: true, height: 'mid', backness: 'central', rounded: false },
  ɚ: { manner: 'vowel', place: '', voiced: true, height: 'mid', backness: 'central', rounded: false },
  u: { manner: 'vowel', place: '', voiced: true, height: 'high', backness: 'back', rounded: true  },
  ʊ: { manner: 'vowel', place: '', voiced: true, height: 'near-high', backness: 'back', rounded: true  },
  o: { manner: 'vowel', place: '', voiced: true, height: 'mid-high', backness: 'back', rounded: true  },
  ɔ: { manner: 'vowel', place: '', voiced: true, height: 'mid-low', backness: 'back', rounded: true  },
  ɑ: { manner: 'vowel', place: '', voiced: true, height: 'low', backness: 'back', rounded: false },
};

function featuresOf(p: string): Features | null {
  const bare = bareSymbol(p);
  if (CONS_FEATURES[bare]) return CONS_FEATURES[bare];
  if (VOWEL_FEATURES[bare]) return { ...VOWEL_FEATURES[bare], nasal: isNasalVowel(p) };
  // Diphthong: take first element
  if (IPA_DIPHTHONGS.has(bare)) {
    const head = bare[0];
    if (VOWEL_FEATURES[head]) return VOWEL_FEATURES[head];
  }
  return null;
}

/**
 * Phoneme distance in [0, 1]. Identical = 0, totally unrelated = 1.
 * Used by paronym detection to weight "near-misses" — voicing differences
 * count less than place differences, etc.
 */
export function phonemeDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (bareSymbol(a) === bareSymbol(b)) return 0.1; // nasalization only
  const fa = featuresOf(a);
  const fb = featuresOf(b);
  if (!fa || !fb) return 1;
  if ((fa.manner === 'vowel') !== (fb.manner === 'vowel')) return 1;

  if (fa.manner === 'vowel') {
    let d = 0;
    if (fa.height !== fb.height) d += 0.4;
    if (fa.backness !== fb.backness) d += 0.4;
    if (fa.rounded !== fb.rounded) d += 0.2;
    if (fa.nasal !== fb.nasal) d += 0.3;
    return Math.min(1, d);
  }

  let d = 0;
  if (fa.manner !== fb.manner) d += 0.5;
  if (fa.place !== fb.place) d += 0.4;
  if (fa.voiced !== fb.voiced) d += 0.15;
  return Math.min(1, d);
}

/** Levenshtein-like edit distance over phoneme arrays, with feature weighting. */
export function pronunciationDistance(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const sub = dp[i - 1][j - 1] + phonemeDistance(a[i - 1], b[j - 1]);
      const del = dp[i - 1][j] + 1;
      const ins = dp[i][j - 1] + 1;
      dp[i][j] = Math.min(sub, del, ins);
    }
  }
  return dp[m][n];
}

/**
 * True if two pronunciations differ by exactly one segment substitution
 * (not insertion/deletion). The "trace" / différance structure: two words
 * that are sonically a hair apart but semantically miles apart.
 */
export function isOneSegmentApart(a: string[], b: string[]): { yes: boolean; pos?: number; from?: string; to?: string } {
  if (a.length !== b.length) return { yes: false };
  let diff = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      if (diff !== -1) return { yes: false };
      diff = i;
    }
  }
  if (diff === -1) return { yes: false };
  return { yes: true, pos: diff, from: a[diff], to: b[diff] };
}
