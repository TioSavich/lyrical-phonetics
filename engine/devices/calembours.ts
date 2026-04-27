/**
 * Calembour detection — multi-word homophones across a sliding window.
 *
 * The classic French move: "la mort" sounds like "l'amor"; "Gérard de Nerval"
 * → "j'errerai d'un air vrai" (Lacan via Saussure). We slide a window over
 * the input, concatenate the phonemes of consecutive words, and look for any
 * single word (or other concatenation in the same text) that matches.
 *
 * To keep the search bounded:
 *   - window sizes 2 and 3 only (longer puns are rare and noisy)
 *   - matches must span ≥ 3 phonemes (kills trivial coincidences)
 *   - we report the n-gram and what single-word string it sounds like
 */

import type { WordEntry } from './cascades';

export type Calembour = {
  id: string;
  /** The multi-word phrase as it appears in the text. */
  phrase: string;
  phraseStart: { lineIndex: number; wordIndex: number };
  phraseEnd: { lineIndex: number; wordIndex: number };
  /** The shared IPA. */
  ipa: string;
  /** What the phrase sounds like — either another phrase or a single word in the text. */
  sounds_like: string;
  soundsLikeAt?: { lineIndex: number; wordIndex: number };
};

function ngrams(words: WordEntry[], n: number): { entries: WordEntry[]; ipa: string }[] {
  const out: { entries: WordEntry[]; ipa: string }[] = [];
  for (let i = 0; i + n <= words.length; i++) {
    const window = words.slice(i, i + n);
    if (window.some((w) => !w.pron || w.pron.ipa.length === 0)) continue;
    // Skip windows that span a line break (they don't form a real phrase).
    const sameLine = window.every((w) => w.lineIndex === window[0].lineIndex);
    if (!sameLine) continue;
    const ipa = window.map((w) => w.pron.ipa.join('')).join('');
    if (ipa.length < 3) continue;
    out.push({ entries: window, ipa });
  }
  return out;
}

export function findCalembours(words: WordEntry[]): Calembour[] {
  // Build an index: ipa-string → list of (kind, words[], surface).
  // kind = 'word' (single word) or 'phrase' (n-gram, n>1).
  type Hit = { kind: 'word' | 'phrase'; entries: WordEntry[]; ipa: string };
  const index = new Map<string, Hit[]>();

  for (const w of words) {
    if (!w.pron || w.pron.ipa.length === 0) continue;
    const ipa = w.pron.ipa.join('');
    if (ipa.length < 3) continue;
    const hit: Hit = { kind: 'word', entries: [w], ipa };
    if (!index.has(ipa)) index.set(ipa, []);
    index.get(ipa)!.push(hit);
  }
  for (const n of [2, 3]) {
    for (const ng of ngrams(words, n)) {
      const hit: Hit = { kind: 'phrase', entries: ng.entries, ipa: ng.ipa };
      if (!index.has(ng.ipa)) index.set(ng.ipa, []);
      index.get(ng.ipa)!.push(hit);
    }
  }

  const result: Calembour[] = [];
  let id = 0;
  const seen = new Set<string>();
  for (const [ipa, hits] of index.entries()) {
    if (hits.length < 2) continue;
    // Only emit if at least one hit is multi-word (the "phrase sounds like X" insight).
    const phrases = hits.filter((h) => h.kind === 'phrase');
    if (phrases.length === 0) continue;

    for (const phrase of phrases) {
      // Pair with any hit that's not itself.
      for (const other of hits) {
        if (other === phrase) continue;
        if (other.entries[0] === phrase.entries[0]) continue;
        const phraseSurface = phrase.entries.map((w) => w.surface).join(' ');
        const otherSurface = other.entries.map((w) => w.surface).join(' ');
        // Skip if surfaces are too similar (e.g. exact word repetition).
        if (phraseSurface.toLowerCase().replace(/\s+/g, '') === otherSurface.toLowerCase().replace(/\s+/g, '')) continue;
        const dedup = [phraseSurface, otherSurface].sort().join('|') + '@' + ipa;
        if (seen.has(dedup)) continue;
        seen.add(dedup);

        const start = phrase.entries[0];
        const end = phrase.entries[phrase.entries.length - 1];
        result.push({
          id: `calembour-${id++}`,
          phrase: phraseSurface,
          phraseStart: { lineIndex: start.lineIndex, wordIndex: start.wordIndex },
          phraseEnd: { lineIndex: end.lineIndex, wordIndex: end.wordIndex },
          ipa,
          sounds_like: otherSurface,
          soundsLikeAt: other.kind === 'word'
            ? { lineIndex: other.entries[0].lineIndex, wordIndex: other.entries[0].wordIndex }
            : undefined,
        });
      }
    }
  }

  return result;
}
