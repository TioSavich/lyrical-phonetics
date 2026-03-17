/**
 * Client-side phoneme substitution engine.
 *
 * Loads CMUDict from a static JSON file and builds a skeleton index
 * for instant phoneme-swap lookups. All processing happens in-browser.
 */

import { stripStress, isVowel, VOWELS, CONSONANTS } from './phonemeColors';

export type PhonemeInfo = {
  position: number;
  phoneme: string;       // with stress marker
  clean: string;         // without stress marker
  isVowel: boolean;
  stress: number | null; // 0, 1, 2, or null for consonants
};

export type SubstitutionResult = {
  word: string;
  phones: string[];
  substitutedPhoneme: string;
  position?: number;
  device?: string;
};

export type WordInfo = {
  word: string;
  phones: string[];
  phonemeCount: number;
  syllableCount: number;
  phonemes: PhonemeInfo[];
};

/** The raw CMUDict data: word → "P1 P2 P3" space-separated phones string */
type CMUDictRaw = Record<string, string>;

/**
 * Substitution engine — singleton that loads CMUDict and builds
 * a skeleton index for instant phoneme substitution lookups.
 */
class SubstitutionEngine {
  private wordPhones = new Map<string, string[]>();
  private skeletonIndex = new Map<string, Array<[string, string[]]>>();
  private ready = false;
  private loading: Promise<void> | null = null;

  /** Load CMUDict and build the index. Idempotent — safe to call multiple times. */
  async init(): Promise<void> {
    if (this.ready) return;
    if (this.loading) return this.loading;

    this.loading = this._build();
    await this.loading;
  }

  private async _build(): Promise<void> {
    // Fetch CMUDict JSON from the public directory
    const resp = await fetch('./cmudict.json');
    if (!resp.ok) throw new Error('Failed to load cmudict.json');
    const raw: CMUDictRaw = await resp.json();

    // Build word → phones map and skeleton index
    for (const [word, phonesStr] of Object.entries(raw)) {
      const phones = phonesStr.split(' ');
      this.wordPhones.set(word, phones);

      const stripped = phones.map(stripStress);
      const len = stripped.length;

      for (let i = 0; i < len; i++) {
        const skeleton = [...stripped];
        skeleton[i] = '_';
        const key = `${len}:${skeleton.join(' ')}`;

        let bucket = this.skeletonIndex.get(key);
        if (!bucket) {
          bucket = [];
          this.skeletonIndex.set(key, bucket);
        }
        bucket.push([word, phones]);
      }
    }

    this.ready = true;
  }

  /** Check if the engine is ready. */
  isReady(): boolean {
    return this.ready;
  }

  /** Get the pronunciation for a word. */
  getPhones(word: string): string[] | null {
    const phones = this.wordPhones.get(word.toLowerCase());
    return phones ?? null;
  }

  /** Check if a word exists in CMUDict. */
  hasWord(word: string): boolean {
    return this.wordPhones.has(word.toLowerCase());
  }

  /** Get detailed phoneme info for a word. */
  getWordInfo(word: string): WordInfo | null {
    const phones = this.getPhones(word);
    if (!phones) return null;

    const phonemes: PhonemeInfo[] = phones.map((p, i) => {
      const clean = stripStress(p);
      const stressMatch = p.match(/[012]/);
      return {
        position: i,
        phoneme: p,
        clean,
        isVowel: isVowel(p),
        stress: stressMatch ? parseInt(stressMatch[0]) : null,
      };
    });

    return {
      word: word.toLowerCase(),
      phones,
      phonemeCount: phones.length,
      syllableCount: phones.filter(p => /[012]/.test(p)).length,
      phonemes,
    };
  }

  /**
   * Find all valid word substitutions at a given phoneme position.
   *
   * @param word - Source word
   * @param position - Phoneme position to substitute (0-indexed)
   * @param targetPhoneme - If given, only return words where the substituted
   *                        phoneme matches this target. If null, return all.
   */
  findSubstitutions(
    word: string,
    position: number,
    targetPhoneme: string | null = null,
  ): SubstitutionResult[] {
    const phones = this.getPhones(word);
    if (!phones || position < 0 || position >= phones.length) return [];

    const stripped = phones.map(stripStress);
    const originalPhoneme = stripped[position];
    const skeleton = [...stripped];
    skeleton[position] = '_';
    const key = `${stripped.length}:${skeleton.join(' ')}`;

    const matches = this.skeletonIndex.get(key);
    if (!matches) return [];

    const results: SubstitutionResult[] = [];
    const seen = new Set<string>();
    const sourceLower = word.toLowerCase();

    for (const [matchWord, matchPhones] of matches) {
      if (matchWord === sourceLower || seen.has(matchWord)) continue;

      const matchStripped = stripStress(matchPhones[position]);
      if (matchStripped === originalPhoneme) continue;

      if (targetPhoneme && matchStripped !== stripStress(targetPhoneme)) continue;

      seen.add(matchWord);
      results.push({
        word: matchWord,
        phones: matchPhones,
        substitutedPhoneme: matchStripped,
      });
    }

    results.sort((a, b) => a.word.localeCompare(b.word));
    return results;
  }

  /** Find all possible substitutions at every phoneme position. */
  findAllSubstitutions(word: string): Map<number, SubstitutionResult[]> {
    const phones = this.getPhones(word);
    if (!phones) return new Map();

    const result = new Map<number, SubstitutionResult[]>();
    for (let i = 0; i < phones.length; i++) {
      const subs = this.findSubstitutions(word, i);
      if (subs.length > 0) result.set(i, subs);
    }
    return result;
  }

  /**
   * Find substitutions that target a specific poetic device.
   *
   * @param device - "alliteration" | "assonance" | "consonance" | "rhyme"
   * @param targetPhoneme - The phoneme to "paint" with
   */
  findDeviceSubstitutions(
    word: string,
    device: string,
    targetPhoneme: string | null = null,
  ): SubstitutionResult[] {
    const phones = this.getPhones(word);
    if (!phones) return [];

    const stripped = phones.map(stripStress);
    const results: SubstitutionResult[] = [];

    if (device === 'alliteration') {
      // Substitute initial consonant(s) before first vowel
      for (let i = 0; i < stripped.length; i++) {
        if (VOWELS.has(stripped[i])) break;
        let subs: SubstitutionResult[];
        if (targetPhoneme && CONSONANTS.has(stripStress(targetPhoneme))) {
          subs = this.findSubstitutions(word, i, targetPhoneme);
        } else {
          subs = this.findSubstitutions(word, i)
            .filter(s => CONSONANTS.has(s.substitutedPhoneme));
        }
        for (const s of subs) { s.position = i; s.device = 'alliteration'; }
        results.push(...subs);
      }
    } else if (device === 'assonance') {
      // Substitute vowel positions
      for (let i = 0; i < stripped.length; i++) {
        if (!VOWELS.has(stripped[i])) continue;
        let subs: SubstitutionResult[];
        if (targetPhoneme && VOWELS.has(stripStress(targetPhoneme))) {
          subs = this.findSubstitutions(word, i, targetPhoneme);
        } else {
          subs = this.findSubstitutions(word, i)
            .filter(s => VOWELS.has(s.substitutedPhoneme));
        }
        for (const s of subs) { s.position = i; s.device = 'assonance'; }
        results.push(...subs);
      }
    } else if (device === 'consonance') {
      // Substitute any consonant position
      for (let i = 0; i < stripped.length; i++) {
        if (!CONSONANTS.has(stripped[i])) continue;
        let subs: SubstitutionResult[];
        if (targetPhoneme && CONSONANTS.has(stripStress(targetPhoneme))) {
          subs = this.findSubstitutions(word, i, targetPhoneme);
        } else {
          subs = this.findSubstitutions(word, i)
            .filter(s => CONSONANTS.has(s.substitutedPhoneme));
        }
        for (const s of subs) { s.position = i; s.device = 'consonance'; }
        results.push(...subs);
      }
    } else if (device === 'rhyme') {
      // Substitute phonemes BEFORE the rhyme tail (last stressed vowel onward)
      let lastStressed: number | null = null;
      for (let i = 0; i < phones.length; i++) {
        if (/[12]/.test(phones[i])) lastStressed = i;
      }
      if (lastStressed !== null) {
        for (let i = 0; i < lastStressed; i++) {
          const subs = this.findSubstitutions(word, i);
          for (const s of subs) { s.position = i; s.device = 'rhyme'; }
          results.push(...subs);
        }
      }
    }

    // Deduplicate by word
    const seen = new Set<string>();
    return results.filter(r => {
      if (seen.has(r.word)) return false;
      seen.add(r.word);
      return true;
    });
  }
}

// ── Singleton ──
let _engine: SubstitutionEngine | null = null;

export function getEngine(): SubstitutionEngine {
  if (!_engine) _engine = new SubstitutionEngine();
  return _engine;
}

export { SubstitutionEngine };
