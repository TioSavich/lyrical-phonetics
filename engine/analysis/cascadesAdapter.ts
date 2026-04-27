import type { PhoneticGroup } from '../../types';
import type { Cascade } from '../devices/cascades';

/**
 * Convert engine/devices/cascades.ts output (richer, slot-aware) into the
 * PhoneticGroup shape the legacy components expect. We preserve the
 * skeleton + direction in the name so the UI still surfaces the cascade
 * identity.
 */
export function cascadesToGroups(cascades: Cascade[]): PhoneticGroup[] {
  return cascades.map((c, i) => ({
    id: `cascade-${i}`,
    name: `${c.skeleton} (${c.direction})`,
    words: c.members.map((m) => ({ lineIndex: m.lineIndex, wordIndex: m.wordIndex })),
  }));
}
