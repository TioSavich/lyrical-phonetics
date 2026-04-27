import type { LineDevice, RegularityObservation, Section } from '../../types';

/**
 * Per-section regularity observations. Compares each section's mean
 * (anaphora-adjusted) density against the overall mean and flags outliers,
 * plus reports adjacent-section breaks where density swings sharply.
 *
 * The Python original computed several flavours (parallel_assonance, etc.)
 * that needed a heavier statistical pipeline; we keep the cheap and useful
 * ones: high_density, low_density, break.
 */
export function computeRegularity(
  sections: Section[],
  lineDevices: LineDevice[],
): RegularityObservation[] {
  if (sections.length === 0 || lineDevices.length === 0) return [];

  const ldByLine = new Map(lineDevices.map((ld) => [ld.line_id, ld]));

  const sectionAvg = sections.map((s) => {
    const lds: LineDevice[] = [];
    for (let id = s.start_line; id <= s.end_line; id++) {
      const ld = ldByLine.get(id);
      if (ld) lds.push(ld);
    }
    if (lds.length === 0) return { section: s, mean: 0 };
    const mean = lds.reduce((sum, ld) => sum + (ld.adjusted_density ?? ld.device_density), 0) / lds.length;
    return { section: s, mean };
  });

  const overall = sectionAvg.reduce((sum, x) => sum + x.mean, 0) / sectionAvg.length;
  const observations: RegularityObservation[] = [];

  // Outliers: ≥40% over or under the overall mean.
  for (const { section, mean } of sectionAvg) {
    if (mean >= overall * 1.4 && mean - overall > 0.05) {
      observations.push({
        type: 'high_density',
        description: `${section.label} runs ${Math.round(((mean - overall) / Math.max(overall, 0.01)) * 100)}% above average device density.`,
        sections_involved: [section.id],
      });
    } else if (mean <= overall * 0.6 && overall - mean > 0.05) {
      observations.push({
        type: 'low_density',
        description: `${section.label} sits ${Math.round(((overall - mean) / Math.max(overall, 0.01)) * 100)}% below average — sparse phonetic activity.`,
        sections_involved: [section.id],
      });
    }
  }

  // Adjacent-section breaks: density jumps by ≥0.5× the overall mean from one to the next.
  for (let i = 1; i < sectionAvg.length; i++) {
    const prev = sectionAvg[i - 1];
    const cur = sectionAvg[i];
    if (Math.abs(cur.mean - prev.mean) >= overall * 0.5 && overall > 0.05) {
      observations.push({
        type: 'break',
        description: `${prev.section.label} → ${cur.section.label}: density ${cur.mean > prev.mean ? 'jumps' : 'drops'} sharply.`,
        sections_involved: [prev.section.id, cur.section.id],
      });
    }
  }

  return observations;
}
