/**
 * High-level analyzer: takes raw text + a Language, returns all device
 * findings in one shot. UI consumers just call `analyzeText`.
 */

import type { Language } from '../languages/Language';
import { findCascades, type Cascade, type WordEntry } from './cascades';
import { findHomophones, enrichWithSenses, type HomophoneGroup } from './homophones';
import { findParonyms, type ParonymPair } from './paronyms';
import { findCalembours, type Calembour } from './calembours';
import { analyzeMeter, type MeterReport } from './meter';

export type DeviceAnalysis = {
  language: string;
  totalWords: number;
  recognizedWords: number;
  cascades: Cascade[];
  homophones: HomophoneGroup[];
  paronyms: ParonymPair[];
  calembours: Calembour[];
  meter: MeterReport;
};

export function buildWordEntries(text: string, language: Language): WordEntry[] {
  const lines = language.tokenize(text);
  const entries: WordEntry[] = [];
  for (const line of lines) {
    for (const w of line.words) {
      if (!w.clean) continue;
      const pron = language.lookup(w.clean);
      if (!pron) continue;
      entries.push({
        lineIndex: line.id,
        wordIndex: w.index,
        surface: w.clean,
        pron,
      });
    }
  }
  return entries;
}

/** Synchronous analysis. Homophone groups have NO sense info yet. */
export function analyzeText(text: string, language: Language): DeviceAnalysis {
  const entries = buildWordEntries(text, language);
  const lines = language.tokenize(text);
  const totalWords = lines.reduce((sum, l) => sum + l.words.filter((w) => w.clean).length, 0);

  return {
    language: language.code,
    totalWords,
    recognizedWords: entries.length,
    cascades: findCascades(entries),
    homophones: findHomophones(entries),
    paronyms: findParonyms(entries),
    calembours: findCalembours(entries),
    meter: analyzeMeter(text, language),
  };
}

/** Async post-pass: enrich homophone groups with semantic info. */
export async function enrichSemantics(
  analysis: DeviceAnalysis,
  language: Language,
): Promise<DeviceAnalysis> {
  if (analysis.homophones.length === 0) return analysis;
  const enriched = await enrichWithSenses(analysis.homophones, language.semantics);
  return { ...analysis, homophones: enriched };
}
