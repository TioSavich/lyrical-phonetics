import type { LineData, Section, SyllableMismatch } from '../../types';

/**
 * Strip trailing dash+digits to get the section's "base label." Sections
 * sharing a base label are considered parallel and compared position-wise.
 *   "section-1" → "section"   "verse-2a" → "verse-2a"   "chorus" → "chorus"
 */
function baseLabel(label: string): string {
  return label.replace(/-\d+$/, '');
}

/**
 * Across parallel sections (same base label), compare syllable counts at
 * each position. Reports the largest delta first.
 */
export function computeSyllableSymmetry(lines: LineData[], sections: Section[]): SyllableMismatch[] {
  const groups = new Map<string, Section[]>();
  for (const s of sections) {
    const base = baseLabel(s.label);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push(s);
  }

  const out: SyllableMismatch[] = [];
  for (const [base, group] of groups) {
    if (group.length < 2) continue;
    const maxLen = Math.max(...group.map((s) => s.line_count));
    for (let pos = 0; pos < maxLen; pos++) {
      const counts: number[] = [];
      const sectionLabels: string[] = [];
      for (const s of group) {
        const lineId = s.start_line + pos;
        if (lineId > s.end_line) continue;
        counts.push(lines[lineId]?.syllables ?? 0);
        sectionLabels.push(s.label);
      }
      if (counts.length < 2) continue;
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      const delta = max - min;
      if (delta === 0) continue;
      out.push({
        position: pos,
        base_label: base,
        sections: sectionLabels,
        counts,
        delta,
        max_count: max,
        min_count: min,
      });
    }
  }

  return out.sort((a, b) => b.delta - a.delta);
}
