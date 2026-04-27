/**
 * Hot-word + cascade-expansion suggestions.
 *
 * Both passes need a full pronouncing dictionary to mine candidates from.
 * For non-English languages we currently lack one, so they return empty
 * arrays gracefully.
 */

import type { Language } from '../languages/Language';
import type {
  AnaphoraGroup,
  CascadeExpansionSuggestion,
  CascadeSuggestion,
  HotWordSuggestion,
  LineData,
  LineDevice,
  PhoneticGroup,
  WordSuggestion,
} from '../../types';
import { isVowel, bareSymbol } from '../phonemes/ipa';
import type { IndexedWord } from './tokens';

type FrameInfo = { skeleton: string; vowels: { slot: number; ipa: string; pos: number }[] };

function frame(ipa: string[]): FrameInfo {
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
      parts.push(bareSymbol(t));
    }
  }
  return { skeleton: parts.join(' '), vowels };
}

function rhymeTailOfPron(ipa: string[], lastVowelIdx: number): string | null {
  if (lastVowelIdx < 0) return null;
  const tail: string[] = [];
  for (let i = lastVowelIdx; i < ipa.length; i++) tail.push(bareSymbol(ipa[i]));
  return tail.join(' ');
}

/**
 * For each cascade, scan the dictionary for words sharing the consonant
 * frame at the same slot but contributing a vowel not already in the
 * cascade. Caps at 6 suggestions per cascade.
 */
export function buildCascadeSuggestions(
  cascades: { id: string; skeleton: string; slotIndex: number; distinctVowels: string[]; direction: string }[],
  language: Language,
): CascadeSuggestion[] {
  if (cascades.length === 0) return [];

  type IndexedCandidate = { word: string; vowels: { slot: number; ipa: string }[]; skeleton: string };
  const dictByFrame = new Map<string, IndexedCandidate[]>();

  // One pass over the dictionary: index every word by its skeleton.
  for (const w of language.knownWords()) {
    const pron = language.lookup(w);
    if (!pron || pron.ipa.length === 0) continue;
    const f = frame(pron.ipa);
    if (f.vowels.length === 0) continue;
    const entry: IndexedCandidate = {
      word: w,
      vowels: f.vowels.map((v) => ({ slot: v.slot, ipa: v.ipa })),
      skeleton: f.skeleton,
    };
    if (!dictByFrame.has(f.skeleton)) dictByFrame.set(f.skeleton, []);
    dictByFrame.get(f.skeleton)!.push(entry);
  }

  const out: CascadeSuggestion[] = [];
  for (const c of cascades) {
    const candidates = dictByFrame.get(c.skeleton);
    if (!candidates) continue;
    const existingSet = new Set(c.distinctVowels);
    const seen = new Set<string>();
    const suggestions: CascadeExpansionSuggestion[] = [];
    for (const cand of candidates) {
      const v = cand.vowels.find((x) => x.slot === c.slotIndex);
      if (!v || existingSet.has(v.ipa)) continue;
      const key = `${cand.word}:${v.ipa}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({ word: cand.word, vowel: v.ipa });
      if (suggestions.length >= 6) break;
    }
    if (suggestions.length === 0) continue;
    out.push({
      cascade_id: c.id,
      name: `${c.skeleton} (${c.direction})`,
      skeleton: c.skeleton,
      existing_vowels: c.distinctVowels,
      suggestions,
    });
  }
  return out;
}

/**
 * Pick the N coldest non-repeated lines (by adjusted density), then for each
 * line look at its neighbors (±2 line range) for rhymes/assonance groups not
 * already present on the cold line itself. Suggest dictionary words that
 * extend those groups.
 */
export function buildHotWordSuggestions(
  lines: LineData[],
  lineDevices: LineDevice[],
  rhymes: PhoneticGroup[],
  assonance: PhoneticGroup[],
  anaphora: AnaphoraGroup[],
  words: IndexedWord[],
  language: Language,
  maxLines = 5,
): HotWordSuggestion[] {
  const repeated = new Set<number>();
  for (const a of anaphora) for (const id of a.line_ids) repeated.add(id);

  // Map from word ref to word for quick "what's on this line" lookups.
  const wordByLine = new Map<number, IndexedWord[]>();
  for (const w of words) {
    if (!wordByLine.has(w.lineIndex)) wordByLine.set(w.lineIndex, []);
    wordByLine.get(w.lineIndex)!.push(w);
  }

  // Pre-index the dictionary by rhyme tail (last vowel + tail) once.
  const dictByTail = new Map<string, string[]>();
  // Also by primary stressed vowel for assonance.
  const dictByVowel = new Map<string, string[]>();
  for (const w of language.knownWords()) {
    const pron = language.lookup(w);
    if (!pron || pron.ipa.length === 0) continue;
    let lastVowelIdx = -1;
    let firstVowelIdx = -1;
    for (let i = 0; i < pron.ipa.length; i++) {
      if (isVowel(pron.ipa[i])) {
        if (firstVowelIdx === -1) firstVowelIdx = i;
        lastVowelIdx = i;
      }
    }
    if (lastVowelIdx >= 0) {
      const tail = rhymeTailOfPron(pron.ipa, lastVowelIdx);
      if (tail) {
        if (!dictByTail.has(tail)) dictByTail.set(tail, []);
        dictByTail.get(tail)!.push(w);
      }
    }
    if (firstVowelIdx >= 0) {
      const v = bareSymbol(pron.ipa[firstVowelIdx]);
      if (!dictByVowel.has(v)) dictByVowel.set(v, []);
      dictByVowel.get(v)!.push(w);
    }
  }

  // Find cold lines.
  const candidates = lineDevices
    .filter((ld) => !repeated.has(ld.line_id))
    .filter((ld) => lines[ld.line_id]?.text.trim() !== '')
    .sort((a, b) => (a.adjusted_density ?? 0) - (b.adjusted_density ?? 0))
    .slice(0, maxLines);

  const out: HotWordSuggestion[] = [];

  // Map from line → groups touching it, for the "what's already on this line" check.
  const groupsByLine = (groupList: PhoneticGroup[]) => {
    const m = new Map<number, Set<string>>();
    for (const g of groupList) {
      for (const ref of g.words) {
        if (!m.has(ref.lineIndex)) m.set(ref.lineIndex, new Set());
        m.get(ref.lineIndex)!.add(g.id);
      }
    }
    return m;
  };
  const rhymeLines = groupsByLine(rhymes);
  const assonanceLines = groupsByLine(assonance);

  for (const cold of candidates) {
    const suggestions: WordSuggestion[] = [];
    const onColdRhymes = rhymeLines.get(cold.line_id) ?? new Set();
    const onColdAss = assonanceLines.get(cold.line_id) ?? new Set();
    const wordsAlreadyOnLine = new Set<string>(
      (wordByLine.get(cold.line_id) ?? []).map((w) => w.clean.toLowerCase()),
    );

    // Look at neighbours within ±2 lines.
    for (let offset = -2; offset <= 2 && suggestions.length < 3; offset++) {
      if (offset === 0) continue;
      const neighbourId = cold.line_id + offset;

      for (const g of rhymes) {
        if (suggestions.length >= 3) break;
        if (onColdRhymes.has(g.id)) continue;
        const member = g.words.find((ref) => ref.lineIndex === neighbourId);
        if (!member) continue;
        const w = words.find((ww) => ww.lineIndex === member.lineIndex && ww.wordIndex === member.wordIndex);
        if (!w || !w.pron || w.lastStressedVowelIdx < 0) continue;
        const tail = rhymeTailOfPron(w.pron.ipa, w.lastStressedVowelIdx);
        if (!tail) continue;
        const dictMatches = dictByTail.get(tail) ?? [];
        for (const cand of dictMatches) {
          if (wordsAlreadyOnLine.has(cand)) continue;
          if (cand === w.clean.toLowerCase()) continue;
          suggestions.push({
            word: cand,
            reason: `rhymes with "${w.clean}" on line ${neighbourId + 1}`,
            device: 'rhyme',
            group_id: g.id,
          });
          break;
        }
      }

      for (const g of assonance) {
        if (suggestions.length >= 3) break;
        if (onColdAss.has(g.id)) continue;
        const member = g.words.find((ref) => ref.lineIndex === neighbourId);
        if (!member) continue;
        const w = words.find((ww) => ww.lineIndex === member.lineIndex && ww.wordIndex === member.wordIndex);
        if (!w || !w.pron || w.primaryVowelIdx < 0) continue;
        const v = bareSymbol(w.pron.ipa[w.primaryVowelIdx]);
        const dictMatches = dictByVowel.get(v) ?? [];
        for (const cand of dictMatches) {
          if (wordsAlreadyOnLine.has(cand)) continue;
          if (cand === w.clean.toLowerCase()) continue;
          suggestions.push({
            word: cand,
            reason: `echoes the vowel in "${w.clean}" (line ${neighbourId + 1})`,
            device: 'assonance',
            group_id: g.id,
          });
          break;
        }
      }
    }

    if (suggestions.length === 0) continue;
    out.push({
      line_id: cold.line_id,
      line_text: lines[cold.line_id].text,
      density: cold.adjusted_density ?? cold.device_density,
      suggestions,
    });
  }

  return out;
}
