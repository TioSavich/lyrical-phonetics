import type { Language, Pronunciation } from '../languages/Language';
import type { LineData, WordToken } from '../../types';
import { isVowel, bareSymbol } from '../phonemes/ipa';

/**
 * One indexed word with full phonetic context. The groupers (rhyme,
 * assonance, alliteration, cascades) all consume this; LineData is derived
 * downstream for components that don't need phonetic detail.
 */
export type IndexedWord = {
  lineIndex: number;
  wordIndex: number;
  text: string;
  clean: string;
  pron: Pronunciation | null;

  /** Indices into pron.ipa where vowels occur. Empty if pron is null. */
  vowelIdx: number[];

  /**
   * Index in pron.ipa of the primary-stressed vowel (stress=1). Falls back
   * to first secondary, then first vowel, then -1 if no vowels.
   */
  primaryVowelIdx: number;

  /** Last vowel that carries stress >= 1, falling back to last vowel. -1 if none. */
  lastStressedVowelIdx: number;

  /** Bare initial consonants before the first vowel. Empty if word starts on a vowel. */
  initials: string[];
};

export type Tokenized = {
  /** For UI components — matches the Python AnalysisResult.lines shape. */
  lines: LineData[];
  /** Flat indexed-word list for groupers and cascade detection. */
  words: IndexedWord[];
};

function syllableStartOfPhone(phoneIdx: number, syllableStarts: number[]): number {
  // Return the syllable index whose [start, nextStart) contains phoneIdx.
  let s = 0;
  for (let i = 0; i < syllableStarts.length; i++) {
    if (syllableStarts[i] <= phoneIdx) s = i;
    else break;
  }
  return s;
}

function buildIndexedWord(
  lineIndex: number,
  wordIndex: number,
  text: string,
  clean: string,
  pron: Pronunciation | null,
): IndexedWord {
  if (!pron || pron.ipa.length === 0) {
    return {
      lineIndex,
      wordIndex,
      text,
      clean,
      pron,
      vowelIdx: [],
      primaryVowelIdx: -1,
      lastStressedVowelIdx: -1,
      initials: [],
    };
  }

  const vowelIdx: number[] = [];
  for (let i = 0; i < pron.ipa.length; i++) {
    if (isVowel(pron.ipa[i])) vowelIdx.push(i);
  }

  // Map each vowel to its syllable, then use stress[] (per-syllable) to find
  // the primary and the LAST stressed vowel position.
  let primaryVowelIdx = vowelIdx.length > 0 ? vowelIdx[0] : -1;
  let lastStressedVowelIdx = vowelIdx.length > 0 ? vowelIdx[vowelIdx.length - 1] : -1;

  if (pron.syllables.length > 0 && pron.stress.length > 0) {
    let bestPrimary = -1;
    let bestSecondary = -1;
    let lastStressed = -1;
    for (const vi of vowelIdx) {
      const sIdx = syllableStartOfPhone(vi, pron.syllables);
      const stress = pron.stress[sIdx] ?? 0;
      if (stress >= 1) lastStressed = vi;
      if (stress === 1 && bestPrimary === -1) bestPrimary = vi;
      if (stress === 2 && bestSecondary === -1) bestSecondary = vi;
    }
    if (bestPrimary !== -1) primaryVowelIdx = bestPrimary;
    else if (bestSecondary !== -1) primaryVowelIdx = bestSecondary;
    if (lastStressed !== -1) lastStressedVowelIdx = lastStressed;
  }

  // Initial consonants: walk from start until first vowel.
  const initials: string[] = [];
  for (const tok of pron.ipa) {
    if (isVowel(tok)) break;
    initials.push(bareSymbol(tok));
  }

  return {
    lineIndex,
    wordIndex,
    text,
    clean,
    pron,
    vowelIdx,
    primaryVowelIdx,
    lastStressedVowelIdx,
    initials,
  };
}

export function tokenize(text: string, language: Language): Tokenized {
  const lineTokens = language.tokenize(text);
  const lines: LineData[] = [];
  const words: IndexedWord[] = [];

  for (const lt of lineTokens) {
    const lineWords: WordToken[] = [];
    let syllableTotal = 0;

    for (const w of lt.words) {
      const pron = w.clean ? language.lookup(w.clean) : null;
      const indexed = buildIndexedWord(lt.id, w.index, w.text, w.clean, pron);
      words.push(indexed);

      const ipaStr = pron ? pron.ipa.join('') : undefined;
      lineWords.push({
        text: w.text,
        clean: w.clean,
        ipa: ipaStr,
        index: w.index,
      });

      if (pron) syllableTotal += Math.max(pron.syllables.length, pron.stress.length, 1);
    }

    lines.push({
      id: lt.id,
      text: lt.text,
      syllables: syllableTotal,
      words: lineWords,
    });
  }

  return { lines, words };
}
