/**
 * Full analyzer — produces the AnalysisResult shape the legacy
 * Manuscript/XRay/Workshop components expect, computed entirely client-side
 * from a Language adapter (no Python backend).
 *
 * Phases are filled in incrementally:
 *   Phase 1 (this file): lines, rhymes, assonance, alliteration, cascades.
 *   Phase 2: sections, line_devices, anaphora.
 *   Phase 3: syllable_symmetry, regularity.
 *   Phase 5: suggestions, cascade_suggestions.
 *   Phase 6: phoneme_vectors, patterns.
 */

import type { Language } from '../languages/Language';
import type { AnalysisResult } from '../../types';
import { findCascades } from '../devices/cascades';
import { tokenize } from './tokens';
import { findRhymes, findAssonance, findAlliteration } from './groups';
import { cascadesToGroups } from './cascadesAdapter';
import { detectSections } from './sections';
import { detectAnaphora } from './anaphora';
import { computeLineDevices } from './density';
import { computeSyllableSymmetry } from './symmetry';
import { computeRegularity } from './regularity';
import { buildHotWordSuggestions, buildCascadeSuggestions } from './suggestions';
import { computePatterns } from './patterns';

export function analyzeFull(text: string, language: Language): AnalysisResult {
  const { lines, words } = tokenize(text, language);

  const cascadeEntries = words
    .filter((w) => w.pron && w.pron.ipa.length > 0)
    .map((w) => ({
      lineIndex: w.lineIndex,
      wordIndex: w.wordIndex,
      surface: w.clean,
      pron: w.pron!,
    }));

  const rhymes = findRhymes(words);
  const assonance = findAssonance(words);
  const alliteration = findAlliteration(words);
  const rawCascades = findCascades(cascadeEntries);
  const cascades = cascadesToGroups(rawCascades);
  const sections = detectSections(lines);
  const anaphora = detectAnaphora(lines);
  const line_devices = computeLineDevices(
    lines,
    { rhymes, assonance, alliteration, cascades },
    anaphora,
  );

  const syllable_symmetry = computeSyllableSymmetry(lines, sections);
  const regularity = computeRegularity(sections, line_devices);
  const cascade_suggestions = buildCascadeSuggestions(rawCascades, language);
  const suggestions = buildHotWordSuggestions(
    lines,
    line_devices,
    rhymes,
    assonance,
    anaphora,
    words,
    language,
  );

  const { phoneme_vectors, patterns } = computePatterns(words);

  return {
    lines,
    rhymes,
    assonance,
    alliteration,
    cascades,
    sections,
    line_devices,
    anaphora,
    syllable_symmetry,
    regularity,
    suggestions,
    cascade_suggestions,
    phoneme_vectors,
    patterns,
  };
}
