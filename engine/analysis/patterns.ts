/**
 * Phoneme vectors + n-gram pattern detection.
 *
 * Vectors flatten the corpus into one record per phoneme with positional
 * provenance (line/word/syllable/abs_pos). Patterns slide windows of sizes
 * 3..5 across the phoneme-ID stream and report any n-gram that recurs.
 */

import type { PatternMatch, PatternOccurrence, PhonemeVector } from '../../types';
import { isVowel, bareSymbol } from '../phonemes/ipa';
import type { IndexedWord } from './tokens';

export type PatternsResult = {
  phoneme_vectors: PhonemeVector[];
  patterns: PatternMatch[];
};

function syllableOfPhone(phoneIdx: number, syllableStarts: number[]): number {
  let s = 0;
  for (let i = 0; i < syllableStarts.length; i++) {
    if (syllableStarts[i] <= phoneIdx) s = i;
    else break;
  }
  return s;
}

export function computePatterns(words: IndexedWord[]): PatternsResult {
  const symbolToId = new Map<string, number>();
  const idToSymbol: string[] = [];
  const idOf = (s: string) => {
    let id = symbolToId.get(s);
    if (id === undefined) {
      id = idToSymbol.length;
      idToSymbol.push(s);
      symbolToId.set(s, id);
    }
    return id;
  };

  const vectors: PhonemeVector[] = [];
  const idStream: number[] = [];
  // Parallel array tracking which vector each id-stream position came from,
  // for occurrence reconstruction.
  const streamOrigin: number[] = [];

  let abs = 0;
  for (const w of words) {
    if (!w.pron) continue;
    for (let i = 0; i < w.pron.ipa.length; i++) {
      const tok = w.pron.ipa[i];
      const bare = bareSymbol(tok);
      const sIdx = w.pron.syllables.length > 0 ? syllableOfPhone(i, w.pron.syllables) : 0;
      const stress = isVowel(tok) ? (w.pron.stress[sIdx] ?? null) : null;
      const id = idOf(bare);
      vectors.push({
        abs_pos: abs,
        line: w.lineIndex,
        word: w.wordIndex,
        syllable: sIdx,
        phoneme: bare,
        phoneme_id: id,
        is_vowel: isVowel(tok),
        stress,
        word_text: w.clean,
      });
      idStream.push(id);
      streamOrigin.push(abs);
      abs++;
    }
  }

  const patterns: PatternMatch[] = [];
  const seen = new Set<string>();

  for (const window of [3, 4, 5]) {
    if (idStream.length < window) continue;
    const occurrencesByKey = new Map<string, number[]>(); // key → list of stream indices
    for (let i = 0; i + window <= idStream.length; i++) {
      const slice = idStream.slice(i, i + window);
      const key = slice.join(',');
      if (!occurrencesByKey.has(key)) occurrencesByKey.set(key, []);
      occurrencesByKey.get(key)!.push(i);
    }

    for (const [key, positions] of occurrencesByKey) {
      if (positions.length < 2) continue;
      if (seen.has(key)) continue;
      seen.add(key);

      const ids = key.split(',').map(Number);
      const symbols = ids.map((id) => idToSymbol[id]);

      const occs: PatternOccurrence[] = positions.map((streamIdx) => {
        const v = vectors[streamOrigin[streamIdx]];
        return { abs_pos: v.abs_pos, line: v.line, word: v.word, word_text: v.word_text };
      });

      patterns.push({
        pattern: ids,
        pattern_str: symbols.join(' '),
        count: positions.length,
        occurrences: occs,
      });
    }
  }

  // Stronger first: longer + more frequent.
  patterns.sort((a, b) => b.pattern.length * b.count - a.pattern.length * a.count);

  return { phoneme_vectors: vectors, patterns: patterns.slice(0, 50) };
}
