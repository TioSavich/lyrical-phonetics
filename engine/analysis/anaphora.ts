import type { AnaphoraGroup, LineData } from '../../types';

const NORMALIZE = (s: string): string =>
  s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, '').replace(/\s+/g, ' ').trim();

/**
 * Anaphora detection — group lines by normalized text. A group is reported
 * for every normalized form that appears 2+ times.
 */
export function detectAnaphora(lines: LineData[]): AnaphoraGroup[] {
  const buckets = new Map<string, number[]>();
  for (const line of lines) {
    const norm = NORMALIZE(line.text);
    if (!norm) continue;
    if (!buckets.has(norm)) buckets.set(norm, []);
    buckets.get(norm)!.push(line.id);
  }

  const groups: AnaphoraGroup[] = [];
  let id = 0;
  for (const [norm, lineIds] of buckets) {
    if (lineIds.length < 2) continue;
    groups.push({
      id: `anaphora-${id++}`,
      normalized: norm,
      line_ids: lineIds,
      count: lineIds.length,
    });
  }
  return groups;
}
