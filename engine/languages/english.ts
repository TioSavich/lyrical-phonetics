/**
 * English language adapter — wraps CMUDict.
 *
 * Pronunciations come from the existing `public/cmudict.json` blob (ARPAbet),
 * which we convert to IPA on lookup. We deliberately do NOT replace the
 * existing SubstitutionEngine's CMUDict load — both share the same fetch.
 */

import type { Language, LineToken, Pronunciation, SemanticSense, SemanticResource } from './Language';
import { arpaPhoneToIpa } from '../phonemes/ipa';
import { wiktionarySemantics } from '../semantics/wiktionary';

type CMUDictRaw = Record<string, string>;

class EnglishLanguage implements Language {
  code = 'en' as const;
  name = 'English';
  meterStyle = 'accentual' as const;
  semantics: SemanticResource;

  private wordPhones = new Map<string, string[]>(); // ARPAbet, raw
  private ready = false;
  private loading: Promise<void> | null = null;

  constructor() {
    this.semantics = wiktionarySemantics('en');
  }

  isReady(): boolean { return this.ready; }

  async init(): Promise<void> {
    if (this.ready) return;
    if (this.loading) return this.loading;
    this.loading = this._load();
    await this.loading;
  }

  private async _load(): Promise<void> {
    const resp = await fetch('./cmudict.json');
    if (!resp.ok) throw new Error('Failed to load cmudict.json');
    const raw: CMUDictRaw = await resp.json();
    for (const [word, phonesStr] of Object.entries(raw)) {
      this.wordPhones.set(word, phonesStr.split(' '));
    }
    this.ready = true;
  }

  tokenize(text: string): LineToken[] {
    return text.split('\n').map((line, id) => {
      const rawWords = line.split(/\s+/).filter(Boolean);
      return {
        id,
        text: line,
        words: rawWords.map((w, index) => ({
          text: w,
          clean: w.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, '').toLowerCase(),
          index,
        })),
      };
    });
  }

  lookup(word: string): Pronunciation | null {
    const clean = word.toLowerCase().replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, '');
    const phones = this.wordPhones.get(clean);
    if (!phones) return null;

    const ipa: string[] = [];
    const stressByVowel: number[] = [];
    for (const p of phones) {
      const seg = arpaPhoneToIpa(p);
      if (!seg) continue;
      ipa.push(seg.ipa);
      if (seg.isVowel) stressByVowel.push(seg.stress ?? 0);
    }

    // English syllable boundaries: place each vowel as the start of a syllable.
    // (CMUDict gives us no explicit boundaries, and a maximum-onset
    // resyllabifier is overkill here — we only need it for meter, where the
    // count of vowels is what matters.)
    const syllables: number[] = [];
    for (let i = 0; i < ipa.length; i++) {
      if (arpaPhoneToIpa(phones[i] ?? '')?.isVowel) {
        // Syllable starts at the consonant cluster preceding this vowel,
        // or at the vowel itself if no consonants before it.
        let start = i;
        if (syllables.length > 0) {
          const prev = syllables[syllables.length - 1];
          // Naive: split midway through any inter-vocalic consonants.
          const midway = Math.ceil((prev + i) / 2);
          start = midway;
        } else {
          start = 0;
        }
        syllables.push(start);
      }
    }

    return { ipa, syllables, stress: stressByVowel };
  }

  *knownWords(): Iterable<string> {
    for (const w of this.wordPhones.keys()) yield w;
  }

  /** Escape hatch: get the raw ARPAbet phones for the substitution engine. */
  rawArpaPhones(word: string): string[] | null {
    return this.wordPhones.get(word.toLowerCase()) ?? null;
  }
}

export const englishLanguage = new EnglishLanguage();
