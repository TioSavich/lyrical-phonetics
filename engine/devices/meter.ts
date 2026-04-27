/**
 * Meter / rhythm detection.
 *
 * Two algorithms keyed off Language.meterStyle:
 *   - 'accentual'  (English, German): syllable count + stress pattern,
 *      classified into iamb / trochee / anapest / dactyl / spondee / mixed.
 *   - 'syllabic'   (French): just syllable counts. We name common forms
 *      (alexandrin = 12, décasyllabe = 10, octosyllabe = 8, hexasyllabe = 6).
 *
 * This is conservative — we don't try to do scansion-level prosody. It tells
 * you "this poem is mostly iambic tetrameter" or "all lines are 12 syllables
 * (alexandrin)", which is what's useful for deterministic analysis.
 */

import type { Language, LineToken } from '../languages/Language';

export type LineMeter = {
  lineId: number;
  syllableCount: number;
  /** Per-syllable stress as 0/1/2 (accentual languages only; empty for syllabic). */
  stressPattern: number[];
  /** Foot label, e.g. "iambic", "trochaic", "syllabic-12". */
  foot: string;
};

export type MeterReport = {
  style: 'accentual' | 'syllabic';
  lines: LineMeter[];
  /** Human-readable summary of the dominant pattern. */
  summary: string;
};

const ACCENTUAL_NAMES: Record<number, string> = {
  2: 'dimeter', 3: 'trimeter', 4: 'tetrameter',
  5: 'pentameter', 6: 'hexameter', 7: 'heptameter',
};

const SYLLABIC_NAMES: Record<number, string> = {
  6: 'hexasyllabe', 7: 'heptasyllabe', 8: 'octosyllabe',
  9: 'ennéasyllabe', 10: 'décasyllabe', 11: 'hendécasyllabe',
  12: 'alexandrin',
};

/** Classify a stress pattern into a foot type (or "mixed"). */
function classifyAccentual(stress: number[]): string {
  const n = stress.length;
  if (n === 0) return 'silent';
  // Treat 2 as 1 for foot classification (both prominent).
  const s = stress.map((x) => (x > 0 ? 1 : 0));

  const isIamb = s.length >= 2 && s.every((v, i) => v === (i % 2 === 1 ? 1 : 0));
  const isTrochee = s.length >= 2 && s.every((v, i) => v === (i % 2 === 0 ? 1 : 0));
  if (isIamb) return 'iambic';
  if (isTrochee) return 'trochaic';

  // Triple meters: anapest (00 1 00 1) and dactyl (1 00 1 00).
  const isAnapest = s.length >= 3 && s.every((v, i) => v === ((i + 1) % 3 === 0 ? 1 : 0));
  const isDactyl = s.length >= 3 && s.every((v, i) => v === (i % 3 === 0 ? 1 : 0));
  if (isAnapest) return 'anapestic';
  if (isDactyl) return 'dactylic';

  // Mostly-iambic / mostly-trochaic heuristic.
  let iambicScore = 0, trochaicScore = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === 1 && i % 2 === 1) iambicScore++;
    if (s[i] === 1 && i % 2 === 0) trochaicScore++;
  }
  if (iambicScore >= trochaicScore + 2) return 'mostly iambic';
  if (trochaicScore >= iambicScore + 2) return 'mostly trochaic';
  return 'mixed';
}

/**
 * French syllable counting: count vowels excluding final e-muet (already
 * stripped at G2P time). For meter, also account for "diérèse" only if a
 * line is one syllable short of a target — but that's beyond MVP. We just
 * count syllables as the number of vowels in each word's pronunciation.
 */
export function analyzeMeter(text: string, language: Language): MeterReport {
  const lines = language.tokenize(text);
  const lineMeters: LineMeter[] = [];

  for (const line of lines) {
    if (line.text.trim().length === 0) {
      lineMeters.push({ lineId: line.id, syllableCount: 0, stressPattern: [], foot: 'silent' });
      continue;
    }

    let syllableCount = 0;
    const stressPattern: number[] = [];
    for (const w of line.words) {
      if (!w.clean) continue;
      const pron = language.lookup(w.clean);
      if (!pron) continue;
      syllableCount += pron.syllables.length;
      for (const s of pron.stress) stressPattern.push(s);
    }

    if (language.meterStyle === 'syllabic') {
      const name = SYLLABIC_NAMES[syllableCount] ?? `${syllableCount}-syllable`;
      lineMeters.push({
        lineId: line.id,
        syllableCount,
        stressPattern: [],
        foot: name,
      });
    } else {
      const foot = classifyAccentual(stressPattern);
      const feetCount = Math.floor(stressPattern.length / 2); // rough
      const meterName = ACCENTUAL_NAMES[feetCount] ?? `${feetCount}-feet`;
      lineMeters.push({
        lineId: line.id,
        syllableCount,
        stressPattern,
        foot: foot === 'mixed' ? 'mixed' : `${foot} ${meterName}`,
      });
    }
  }

  // Summary: most common foot label.
  const counts = new Map<string, number>();
  for (const lm of lineMeters) {
    if (lm.foot === 'silent') continue;
    counts.set(lm.foot, (counts.get(lm.foot) ?? 0) + 1);
  }
  let best = '';
  let bestN = 0;
  for (const [k, v] of counts) {
    if (v > bestN) { best = k; bestN = v; }
  }
  const total = lineMeters.filter((l) => l.foot !== 'silent').length;
  const summary = total === 0
    ? 'No metrically analyzable lines.'
    : `Dominant pattern: ${best} (${bestN}/${total} lines).`;

  return { style: language.meterStyle, lines: lineMeters, summary };
}
