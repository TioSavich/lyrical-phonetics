import type { AnaphoraGroup, LineData, LineDevice, PhoneticGroup } from '../../types';

/**
 * Per-line device participation + density.
 *
 * For each non-empty line, collect the set of device-group IDs whose member
 * words touch that line. device_density = |unique_groups| / max(word_count,1).
 * adjusted_density zeroes out lines that are anaphoric repeats (so a chorus
 * doesn't dominate the heat map).
 */
export function computeLineDevices(
  lines: LineData[],
  groups: { rhymes: PhoneticGroup[]; assonance: PhoneticGroup[]; alliteration: PhoneticGroup[]; cascades: PhoneticGroup[] },
  anaphora: AnaphoraGroup[],
): LineDevice[] {
  const repeatedLineIds = new Set<number>();
  for (const a of anaphora) for (const id of a.line_ids) repeatedLineIds.add(id);

  // For each line, build a set of "device:groupId" strings.
  const perLine = new Map<number, Set<string>>();
  const allGroupSets: Array<{ devices: PhoneticGroup[]; type: string }> = [
    { devices: groups.rhymes, type: 'rhyme' },
    { devices: groups.assonance, type: 'assonance' },
    { devices: groups.alliteration, type: 'alliteration' },
    { devices: groups.cascades, type: 'cascade' },
  ];

  for (const { devices, type } of allGroupSets) {
    for (const g of devices) {
      const seenLines = new Set<number>();
      for (const ref of g.words) {
        if (seenLines.has(ref.lineIndex)) continue;
        seenLines.add(ref.lineIndex);
        const key = `${type}:${g.id}`;
        if (!perLine.has(ref.lineIndex)) perLine.set(ref.lineIndex, new Set());
        perLine.get(ref.lineIndex)!.add(key);
      }
    }
  }

  const result: LineDevice[] = [];
  for (const line of lines) {
    if (line.text.trim() === '') continue;
    const ids = perLine.get(line.id) ?? new Set<string>();
    const wordCount = line.words.filter((w) => w.clean).length;
    const density = ids.size / Math.max(wordCount, 1);
    const isRepeated = repeatedLineIds.has(line.id);
    result.push({
      line_id: line.id,
      devices: Array.from(ids),
      device_count: ids.size,
      device_density: density,
      is_repeated: isRepeated,
      adjusted_density: isRepeated ? 0 : density,
    });
  }
  return result;
}
