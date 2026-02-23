// ── Word & Line ──

export interface WordToken {
  text: string;
  clean: string;
  ipa?: string;
  index: number;
}

export interface LineData {
  id: number;
  text: string;
  syllables: number;
  words: WordToken[];
}

// ── Device Groups ──

export interface WordReference {
  lineIndex: number;
  wordIndex: number;
}

export interface PhoneticGroup {
  id: string;
  name?: string;
  words: WordReference[];
  color?: string;
}

// ── Phase 2: Phoneme Vectors & Patterns ──

export interface PhonemeVector {
  abs_pos: number;
  line: number;
  word: number;
  syllable: number;
  phoneme: string;
  phoneme_id: number;
  is_vowel: boolean;
  stress: number | null;
  word_text: string;
}

export interface PatternOccurrence {
  abs_pos: number;
  line: number;
  word: number;
  word_text: string;
}

export interface PatternMatch {
  pattern: number[];
  pattern_str: string;
  count: number;
  occurrences: PatternOccurrence[];
}

// ── Phase 2/3: Sections ──

export interface Section {
  id: number;
  label: string;
  start_line: number;
  end_line: number;
  line_count: number;
}

// ── Phase 3: Device Clustering ──

export interface LineDevice {
  line_id: number;
  devices: string[];
  device_count: number;
  device_density: number;
  // Phase 4 additions
  is_repeated?: boolean;
  adjusted_density?: number;
}

export interface RegularityObservation {
  type: 'regularity' | 'high_density' | 'low_density' | 'parallel_assonance' | 'break';
  description: string;
  sections_involved: number[];
}

// ── Phase 4: Anaphora Detection ──

export interface AnaphoraGroup {
  id: string;
  normalized: string;
  line_ids: number[];
  count: number;
}

// ── Phase 4: Syllable Symmetry ──

export interface SyllableMismatch {
  position: number;
  base_label: string;
  sections: string[];
  counts: number[];
  delta: number;
  max_count: number;
  min_count: number;
}

// ── Phase 4: Hot Word Suggestions ──

export interface WordSuggestion {
  word: string;
  reason: string;
  device: string;
  group_id?: string;
}

export interface HotWordSuggestion {
  line_id: number;
  line_text: string;
  density: number;
  suggestions: WordSuggestion[];
}

// ── Phase 4: Cascade Expansion ──

export interface CascadeExpansionSuggestion {
  word: string;
  vowel: string;
}

export interface CascadeSuggestion {
  cascade_id: string;
  name: string;
  skeleton: string;
  existing_vowels: string[];
  suggestions: CascadeExpansionSuggestion[];
}

// ── Full Analysis Result ──

export interface AnalysisResult {
  // Phase 1
  lines: LineData[];
  rhymes: PhoneticGroup[];
  assonance: PhoneticGroup[];
  alliteration: PhoneticGroup[];
  cascades: PhoneticGroup[];
  // Phase 2
  phoneme_vectors?: PhonemeVector[];
  patterns?: PatternMatch[];
  sections?: Section[];
  // Phase 3
  line_devices?: LineDevice[];
  regularity?: RegularityObservation[];
  // Phase 4
  anaphora?: AnaphoraGroup[];
  syllable_symmetry?: SyllableMismatch[];
  suggestions?: HotWordSuggestion[];
  cascade_suggestions?: CascadeSuggestion[];
}

// ── UI State ──

export enum AppView {
  LOAD = 'LOAD',
  MANUSCRIPT = 'MANUSCRIPT',
  XRAY = 'XRAY',
  WORKSHOP = 'WORKSHOP',
}

export type DeviceType = 'rhymes' | 'assonance' | 'alliteration' | 'cascades';

export const DEVICE_TYPES: DeviceType[] = ['rhymes', 'assonance', 'alliteration', 'cascades'];