/**
 * Language interface — every language adapter implements this.
 *
 * The contract is intentionally narrow: give me a word, I give you an IPA
 * pronunciation, syllable boundaries, prominence (stress for EN/DE,
 * length-or-position for FR), and tokenization rules. Everything downstream
 * (cascades, homophones, paronyms, calembours, meter) reads only this shape.
 */

export type Pronunciation = {
  /** Flat IPA token sequence — one token per phoneme. */
  ipa: string[];
  /**
   * Syllable boundaries as indices into `ipa` where each syllable starts.
   * E.g. ipa = ['k','æ','t','s'], syllables = [0] for "cats".
   */
  syllables: number[];
  /**
   * Prominence per syllable. For accentual languages (EN/DE):
   *   0 = unstressed, 1 = primary, 2 = secondary
   * For syllabic languages (FR), prominence is uniform at the word level
   * but the final syllable carries phrase stress; we still emit per-syllable
   * 0/1 with 1 on the last full vowel.
   */
  stress: number[];
  /** True if this is one of multiple acceptable pronunciations. */
  variant?: boolean;
};

export type WordToken = {
  /** Original surface form including any punctuation. */
  text: string;
  /** Lowercased, stripped of leading/trailing punctuation. */
  clean: string;
  index: number;
};

export type LineToken = {
  id: number;
  text: string;
  words: WordToken[];
};

export type SemanticSense = {
  /** "noun", "verb", "adj", etc. — language-dependent labels are fine. */
  pos: string;
  /** Short gloss (one sentence). */
  gloss: string;
  /** Source label (e.g. "wiktionary:fr"). */
  source: string;
};

/**
 * The semantic resource is async because most useful sources are network-backed.
 * Returning [] is a valid "no senses found" response.
 */
export interface SemanticResource {
  getSenses(word: string): Promise<SemanticSense[]>;
  /** Best-effort warm-up so the first call isn't catastrophically slow. */
  prefetch?(words: string[]): Promise<void>;
}

export interface Language {
  /** ISO 639-1 code: "en", "fr", "de". */
  code: string;
  /** Display name in English: "English", "French", "German". */
  name: string;
  /** "accentual" → stress-timed meter (EN/DE); "syllabic" → syllable count (FR). */
  meterStyle: 'accentual' | 'syllabic';

  /** Async init — load any wordlists / WASM / dictionaries. Idempotent. */
  init(): Promise<void>;
  isReady(): boolean;

  /** Tokenize raw text into lines & words using language-aware rules. */
  tokenize(text: string): LineToken[];

  /**
   * Look up pronunciation for a single word. Returns null if unknown.
   * `context` lets future POS-aware heteronym disambiguation hook in.
   */
  lookup(word: string, context?: { pos?: string }): Pronunciation | null;

  /**
   * Iterate all known words. Used by homophone/paronym indexing.
   * For large dictionaries, this should be a generator-style iterable.
   */
  knownWords(): Iterable<string>;

  /** Per-language semantic resource. */
  semantics: SemanticResource;
}

export type LanguageCode = 'en' | 'fr' | 'de';
