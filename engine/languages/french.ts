/**
 * French language adapter — rule-based G2P, no static dictionary.
 *
 * Because we G2P on demand, `knownWords()` only iterates words we've already
 * seen via lookup. This is fine for the homophone/calembour detectors which
 * work over the input text, not a closed wordlist.
 */

import type { Language, LineToken, Pronunciation, SemanticResource } from './Language';
import { frenchG2P, frenchSyllabify, frenchStress } from '../g2p/french-rules';
import { wiktionarySemantics } from '../semantics/wiktionary';

class FrenchLanguage implements Language {
  code = 'fr' as const;
  name = 'French';
  meterStyle = 'syllabic' as const;
  semantics: SemanticResource;

  private cache = new Map<string, Pronunciation | null>();
  private seen = new Set<string>();
  private ready = false;

  constructor() {
    this.semantics = wiktionarySemantics('fr');
  }

  isReady(): boolean { return this.ready; }

  async init(): Promise<void> {
    // No assets to load — rules are baked in.
    this.ready = true;
  }

  tokenize(text: string): LineToken[] {
    return text.split('\n').map((line, id) => {
      // French tokenization: split on whitespace, preserve apostrophes
      // ("l'eau" stays as one token; we strip the apostrophe at G2P time).
      const rawWords = line.split(/\s+/).filter(Boolean);
      return {
        id,
        text: line,
        words: rawWords.map((w, index) => ({
          text: w,
          // Keep apostrophes inside, strip only outer punctuation.
          clean: w.replace(/^[^\p{L}']+|[^\p{L}']+$/gu, '').toLowerCase(),
          index,
        })),
      };
    });
  }

  lookup(word: string): Pronunciation | null {
    const clean = word.toLowerCase().replace(/^[^\p{L}']+|[^\p{L}']+$/gu, '');
    if (!clean) return null;
    if (this.cache.has(clean)) return this.cache.get(clean)!;

    const ipa = frenchG2P(clean);
    if (!ipa || ipa.length === 0) {
      this.cache.set(clean, null);
      return null;
    }
    const syllables = frenchSyllabify(ipa);
    const stress = frenchStress(syllables);
    const result: Pronunciation = { ipa, syllables, stress };
    this.cache.set(clean, result);
    this.seen.add(clean);
    return result;
  }

  *knownWords(): Iterable<string> {
    for (const w of this.seen) yield w;
  }
}

export const frenchLanguage = new FrenchLanguage();
