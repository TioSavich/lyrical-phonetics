/**
 * Paronym detection — pairs of words that differ by exactly one phoneme
 * substitution (no insert/delete). Derrida's "trace": meaning is structured
 * by the minimal sonic difference that nonetheless changes everything.
 *
 * This is the trace structure: pas/bas, mer/mère (no — that's homophones),
 * cap/cape, lyre/lire, son/sont (homo), tape/tope, chat/char.
 *
 * We bucket words by length, then compare within-bucket pairs. O(N²) per
 * bucket but length-bucketing keeps it tractable for typical poems.
 */

import { isOneSegmentApart } from '../phonemes/ipa';
import type { WordEntry } from './cascades';

export type ParonymPair = {
  id: string;
  a: { surface: string; lineIndex: number; wordIndex: number; ipa: string[] };
  b: { surface: string; lineIndex: number; wordIndex: number; ipa: string[] };
  /** Position (0-indexed in the IPA sequence) where the phoneme differs. */
  pos: number;
  from: string;
  to: string;
};

export function findParonyms(words: WordEntry[], minLength: number = 3): ParonymPair[] {
  // Group by IPA length. Skip very short words: a 1- or 2-phoneme paronym
  // is just "any two short words", which produces noise (la↔pas, et↔à).
  const byLen = new Map<number, WordEntry[]>();
  for (const w of words) {
    if (!w.pron || w.pron.ipa.length < minLength) continue;
    const len = w.pron.ipa.length;
    if (!byLen.has(len)) byLen.set(len, []);
    byLen.get(len)!.push(w);
  }

  const seen = new Set<string>();
  const result: ParonymPair[] = [];
  let id = 0;
  for (const bucket of byLen.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i];
        const b = bucket[j];
        if (a.surface.toLowerCase() === b.surface.toLowerCase()) continue;
        const cmp = isOneSegmentApart(a.pron.ipa, b.pron.ipa);
        if (!cmp.yes) continue;

        // Deduplicate symmetric pairs (lineA:wordA → lineB:wordB).
        const key = [a.surface.toLowerCase(), b.surface.toLowerCase()].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);

        result.push({
          id: `paronym-${id++}`,
          a: { surface: a.surface, lineIndex: a.lineIndex, wordIndex: a.wordIndex, ipa: a.pron.ipa },
          b: { surface: b.surface, lineIndex: b.lineIndex, wordIndex: b.wordIndex, ipa: b.pron.ipa },
          pos: cmp.pos!,
          from: cmp.from!,
          to: cmp.to!,
        });
      }
    }
  }
  return result;
}
