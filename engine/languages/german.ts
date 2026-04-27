/**
 * German placeholder. Returns no pronunciations until a real backend lands
 * (likely eSpeak NG WASM). The Language slot exists so the UI can list
 * German and the rest of the system stays language-agnostic.
 */

import type { Language, LineToken, Pronunciation, SemanticResource } from './Language';
import { wiktionarySemantics } from '../semantics/wiktionary';

class GermanLanguage implements Language {
  code = 'de' as const;
  name = 'German';
  meterStyle = 'accentual' as const;
  semantics: SemanticResource;
  private ready = false;

  constructor() {
    this.semantics = wiktionarySemantics('de');
  }

  isReady(): boolean { return this.ready; }
  async init(): Promise<void> { this.ready = true; }

  tokenize(text: string): LineToken[] {
    return text.split('\n').map((line, id) => {
      const rawWords = line.split(/\s+/).filter(Boolean);
      return {
        id,
        text: line,
        words: rawWords.map((w, index) => ({
          text: w,
          clean: w.replace(/^[^\p{L}']+|[^\p{L}']+$/gu, '').toLowerCase(),
          index,
        })),
      };
    });
  }

  lookup(_word: string): Pronunciation | null {
    return null;
  }

  *knownWords(): Iterable<string> {
    // empty until G2P backend lands
  }
}

export const germanLanguage = new GermanLanguage();
