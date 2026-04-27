import type { LineData, Section } from '../../types';

/**
 * Section detection — split lines on blank-line boundaries. Each contiguous
 * run of non-empty lines becomes a Section. Labels are auto-generated as
 * "section-1", "section-2", … which lets syllable-symmetry's "strip trailing
 * digits to find parallel sections" pass through cleanly.
 */
export function detectSections(lines: LineData[]): Section[] {
  const sections: Section[] = [];
  let id = 0;
  let start: number | null = null;

  const close = (endIdx: number) => {
    if (start === null) return;
    sections.push({
      id,
      label: `section-${id + 1}`,
      start_line: start,
      end_line: endIdx,
      line_count: endIdx - start + 1,
    });
    id++;
    start = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const isBlank = lines[i].text.trim() === '';
    if (isBlank) {
      close(i - 1);
    } else if (start === null) {
      start = i;
    }
  }
  close(lines.length - 1);

  return sections;
}
