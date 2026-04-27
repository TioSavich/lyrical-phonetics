import type { PhoneticGroup } from '../../types';
import { bareSymbol } from '../phonemes/ipa';
import type { IndexedWord } from './tokens';

const VOWEL_NAMES: Record<string, string> = {
  i: 'Long E', ɪ: 'Short I', e: 'Long A', ɛ: 'Short E', æ: 'Short A',
  ɑ: 'Open A', ɒ: 'Open A', ɔ: 'Open O', o: 'Long O', ʊ: 'Short OO',
  u: 'Long OO', ʌ: 'Short U', ə: 'Schwa', ɝ: 'R-Colored', ɚ: 'R-Colored',
  y: 'Front Y', ø: 'Front Eu', œ: 'Open Eu', a: 'Bright A',
};

function nameFromVowel(v: string): string {
  return VOWEL_NAMES[v] ?? `/${v}/`;
}

function rhymeTail(w: IndexedWord): string | null {
  if (w.lastStressedVowelIdx < 0 || !w.pron) return null;
  const tail: string[] = [];
  for (let i = w.lastStressedVowelIdx; i < w.pron.ipa.length; i++) {
    tail.push(bareSymbol(w.pron.ipa[i]));
  }
  return tail.join(' ');
}

/**
 * Rhyme groups — words sharing the same rhyme tail (last stressed vowel +
 * everything after it). Min 2 distinct surface forms.
 */
export function findRhymes(words: IndexedWord[]): PhoneticGroup[] {
  const buckets = new Map<string, IndexedWord[]>();
  for (const w of words) {
    const tail = rhymeTail(w);
    if (!tail) continue;
    if (!buckets.has(tail)) buckets.set(tail, []);
    buckets.get(tail)!.push(w);
  }

  const groups: PhoneticGroup[] = [];
  let id = 0;
  for (const [tail, members] of buckets) {
    const distinctSurfaces = new Set(members.map((m) => m.clean.toLowerCase()));
    if (distinctSurfaces.size < 2) continue;
    groups.push({
      id: `rhyme-${id++}`,
      name: Array.from(distinctSurfaces).slice(0, 4).join('/'),
      words: members.map((m) => ({ lineIndex: m.lineIndex, wordIndex: m.wordIndex })),
    });
    void tail; // tail is the bucket key; not stored on the group itself
  }
  return groups;
}

/**
 * Assonance groups — words sharing the same primary stressed vowel nucleus.
 * Min 2 distinct surface forms per group.
 */
export function findAssonance(words: IndexedWord[]): PhoneticGroup[] {
  const buckets = new Map<string, IndexedWord[]>();
  for (const w of words) {
    if (w.primaryVowelIdx < 0 || !w.pron) continue;
    const v = bareSymbol(w.pron.ipa[w.primaryVowelIdx]);
    if (!buckets.has(v)) buckets.set(v, []);
    buckets.get(v)!.push(w);
  }

  const groups: PhoneticGroup[] = [];
  let id = 0;
  for (const [vowel, members] of buckets) {
    const distinctSurfaces = new Set(members.map((m) => m.clean.toLowerCase()));
    if (distinctSurfaces.size < 2) continue;
    groups.push({
      id: `assonance-${id++}`,
      name: nameFromVowel(vowel),
      words: members.map((m) => ({ lineIndex: m.lineIndex, wordIndex: m.wordIndex })),
    });
  }
  return groups;
}

/**
 * Alliteration groups — words sharing the same first initial consonant.
 * Min 3 occurrences per Python original (set higher than 2 because initial
 * consonants are common and noisy).
 */
export function findAlliteration(words: IndexedWord[], minOccurrences = 3): PhoneticGroup[] {
  const buckets = new Map<string, IndexedWord[]>();
  for (const w of words) {
    if (w.initials.length === 0) continue;
    const key = w.initials[0];
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(w);
  }

  const groups: PhoneticGroup[] = [];
  let id = 0;
  for (const [initial, members] of buckets) {
    if (members.length < minOccurrences) continue;
    const distinctSurfaces = new Set(members.map((m) => m.clean.toLowerCase()));
    if (distinctSurfaces.size < 2) continue;
    groups.push({
      id: `alliteration-${id++}`,
      name: `Initial /${initial}/`,
      words: members.map((m) => ({ lineIndex: m.lineIndex, wordIndex: m.wordIndex })),
    });
  }
  return groups;
}
