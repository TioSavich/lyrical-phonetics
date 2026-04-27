/**
 * Vowel cascade detection — slot-aware.
 *
 * Old logic (Python phonetic_engine.py:753-832) keyed groups on the bare
 * consonant skeleton, replacing every vowel with `_V_`. That conflates words
 * whose vowels live in different slots: "tap"/"tape" and "tap"/"top" both
 * collapsed to T _V_ P, and the cascade name didn't track which slot moved.
 *
 * New logic: key on (consonant skeleton, vowel-slot index). A real cascade
 * is a set of words sharing the same consonant frame whose vowels differ at
 * the SAME slot — drip / drop / drape, not drip / draped.
 *
 * We also classify the direction of motion (front↔back, high↔low, etc.) so
 * the UI can label cascades meaningfully.
 */

import type { Pronunciation } from '../languages/Language';
import { isVowel, normalizePhoneme, bareSymbol } from '../phonemes/ipa';

export type WordEntry = {
  lineIndex: number;
  wordIndex: number;
  surface: string;
  pron: Pronunciation;
};

export type CascadeMember = {
  lineIndex: number;
  wordIndex: number;
  surface: string;
  vowel: string;
  vowels: string[]; // all vowels in word, for display
};

export type Cascade = {
  id: string;
  /** Consonant frame, e.g. "d ɹ _ p". */
  skeleton: string;
  /** Which vowel slot (0-indexed among the word's vowels) is varying. */
  slotIndex: number;
  /** Distinct vowels found at the varying slot. */
  distinctVowels: string[];
  /** Direction label, e.g. "front→back" or "high↔low". */
  direction: string;
  members: CascadeMember[];
};

/**
 * Build a "consonant frame" (skeleton) for a pronunciation, keyed by the
 * sequence of non-vowel tokens with vowel slots numbered:
 *   ['d', 'r', 'ɪ', 'p']  →  skeleton "d r _ p", vowels [{slot:0, ipa:'ɪ'}]
 *   ['t', 'eɪ', 'p']      →  skeleton "t _ p",   vowels [{slot:0, ipa:'eɪ'}]
 *   ['s', 'ɪ', 't', 'i']  →  skeleton "s _ t _", vowels [{slot:0,ipa:'ɪ'},{slot:1,ipa:'i'}]
 */
function frame(ipa: string[]): { skeleton: string; vowels: { slot: number; ipa: string; pos: number }[] } {
  const parts: string[] = [];
  const vowels: { slot: number; ipa: string; pos: number }[] = [];
  let slot = 0;
  for (let i = 0; i < ipa.length; i++) {
    const t = ipa[i];
    if (isVowel(t)) {
      parts.push('_');
      vowels.push({ slot, ipa: bareSymbol(t), pos: i });
      slot++;
    } else {
      parts.push(normalizePhoneme(t));
    }
  }
  return { skeleton: parts.join(' '), vowels };
}

// Rough vowel-space coordinates for direction classification.
const VOWEL_SPACE: Record<string, { height: number; backness: number }> = {
  i: { height: 3, backness: 0 },
  y: { height: 3, backness: 0 },
  ɪ: { height: 2, backness: 0 },
  e: { height: 2, backness: 0 },
  ø: { height: 2, backness: 0 },
  ɛ: { height: 1, backness: 0 },
  œ: { height: 1, backness: 0 },
  æ: { height: 0, backness: 0 },
  a: { height: 0, backness: 1 },
  ə: { height: 1, backness: 1 },
  ʌ: { height: 1, backness: 1 },
  ɝ: { height: 1, backness: 1 },
  ɑ: { height: 0, backness: 2 },
  ɒ: { height: 0, backness: 2 },
  ɔ: { height: 1, backness: 2 },
  o: { height: 2, backness: 2 },
  ʊ: { height: 2, backness: 2 },
  u: { height: 3, backness: 2 },
};

function describeDirection(vowels: string[]): string {
  const points = vowels
    .map((v) => {
      const head = v.length > 1 ? v[0] : v;
      return VOWEL_SPACE[head];
    })
    .filter(Boolean) as { height: number; backness: number }[];
  if (points.length < 2) return 'mixed';

  const heights = points.map((p) => p.height);
  const backs = points.map((p) => p.backness);
  const heightRange = Math.max(...heights) - Math.min(...heights);
  const backRange = Math.max(...backs) - Math.min(...backs);

  if (heightRange >= 2 && backRange < 1) return 'high↔low';
  if (backRange >= 2 && heightRange < 1) return 'front↔back';
  if (heightRange >= 1 && backRange >= 1) return 'diagonal';
  if (heightRange > backRange) return 'height shift';
  return 'backness shift';
}

export function findCascades(words: WordEntry[], minMembers: number = 2): Cascade[] {
  // Bucket key: `${skeleton}|${slotIndex}`. Each bucket collects words that
  // share the consonant frame AND have a vowel at the same numbered slot.
  type Bucket = {
    skeleton: string;
    slotIndex: number;
    members: CascadeMember[];
    vowelsAtSlot: Set<string>;
  };
  const buckets = new Map<string, Bucket>();

  for (const w of words) {
    if (!w.pron || w.pron.ipa.length === 0) continue;
    const { skeleton, vowels } = frame(w.pron.ipa);
    if (vowels.length === 0) continue;

    for (const v of vowels) {
      const key = `${skeleton}|${v.slot}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          skeleton,
          slotIndex: v.slot,
          members: [],
          vowelsAtSlot: new Set(),
        };
        buckets.set(key, bucket);
      }
      bucket.members.push({
        lineIndex: w.lineIndex,
        wordIndex: w.wordIndex,
        surface: w.surface,
        vowel: v.ipa,
        vowels: vowels.map((x) => x.ipa),
      });
      bucket.vowelsAtSlot.add(v.ipa);
    }
  }

  const cascades: Cascade[] = [];
  let id = 0;
  for (const bucket of buckets.values()) {
    // Require ≥ minMembers DISTINCT word positions and ≥2 distinct vowels.
    const positions = new Set(bucket.members.map((m) => `${m.lineIndex}:${m.wordIndex}`));
    if (positions.size < minMembers) continue;
    if (bucket.vowelsAtSlot.size < 2) continue;

    // Skeleton must have at least one consonant — otherwise we're matching
    // bare vowels against bare vowels, which is just assonance with extra
    // steps.
    const hasConsonant = bucket.skeleton.split(' ').some((tok) => tok && tok !== '_');
    if (!hasConsonant) continue;

    // De-duplicate same surface form to avoid one repeated word counting twice.
    const distinctSurfaces = new Set(bucket.members.map((m) => m.surface.toLowerCase()));
    if (distinctSurfaces.size < 2) continue;

    const distinctVowels = Array.from(bucket.vowelsAtSlot);
    cascades.push({
      id: `cascade-${id++}`,
      skeleton: bucket.skeleton,
      slotIndex: bucket.slotIndex,
      distinctVowels,
      direction: describeDirection(distinctVowels),
      members: bucket.members,
    });
  }

  return cascades;
}
