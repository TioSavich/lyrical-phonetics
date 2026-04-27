/**
 * Homophone detection — words with identical pronunciations but distinct
 * meanings. The Derridean core: différance/différence (sound-equivalent in
 * spoken French), pas/pas, mer/mère/maire, etc.
 *
 * Two flavors:
 *   1. In-text homophones: groups of words present in the input that share
 *      a pronunciation. Pure-deterministic, no network needed.
 *   2. Sense-distinguished homophones: same as (1), but we also fetch
 *      definitions and only surface groups whose senses are demonstrably
 *      different. This is async and best-effort.
 */

import type { Pronunciation, SemanticResource, SemanticSense } from '../languages/Language';
import type { WordEntry } from './cascades';

export type HomophoneGroup = {
  id: string;
  /** The shared IPA, joined for display. */
  ipa: string;
  /** Distinct surface forms in the group (lowercased). */
  surfaces: string[];
  /** All occurrences (one per word position). */
  occurrences: { lineIndex: number; wordIndex: number; surface: string }[];
  /**
   * Senses per surface form. Only populated after enrichWithSenses runs.
   * Empty array means "no senses found" (not "unknown").
   */
  sensesBySurface?: Record<string, SemanticSense[]>;
  /**
   * True if at least two surfaces have demonstrably different senses
   * (different POS, or different dominant gloss content). The Derridean flag.
   */
  semanticallyDistinct?: boolean;
};

function ipaKey(p: Pronunciation): string {
  // Normalize: drop any stress info (we already exclude stress from `ipa`),
  // join with space.
  return p.ipa.join(' ');
}

export function findHomophones(words: WordEntry[], minSurfaces: number = 2): HomophoneGroup[] {
  const buckets = new Map<string, { surfaces: Map<string, { lineIndex: number; wordIndex: number; surface: string }[]> }>();
  for (const w of words) {
    if (!w.pron || w.pron.ipa.length === 0) continue;
    const key = ipaKey(w.pron);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { surfaces: new Map() };
      buckets.set(key, bucket);
    }
    const surf = w.surface.toLowerCase();
    if (!bucket.surfaces.has(surf)) bucket.surfaces.set(surf, []);
    bucket.surfaces.get(surf)!.push({
      lineIndex: w.lineIndex,
      wordIndex: w.wordIndex,
      surface: w.surface,
    });
  }

  const result: HomophoneGroup[] = [];
  let id = 0;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.surfaces.size < minSurfaces) continue;
    const surfaces = Array.from(bucket.surfaces.keys()).sort();
    const occurrences: { lineIndex: number; wordIndex: number; surface: string }[] = [];
    for (const occList of bucket.surfaces.values()) occurrences.push(...occList);
    result.push({
      id: `homo-${id++}`,
      ipa: key,
      surfaces,
      occurrences,
    });
  }
  return result;
}

/**
 * Decide whether two sense-lists describe meaningfully different concepts.
 * Conservative: returns true if (a) POS sets differ, or (b) the dominant
 * glosses share fewer than 30% of their content words.
 */
function sensesDistinct(a: SemanticSense[], b: SemanticSense[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const posA = new Set(a.map((s) => s.pos));
  const posB = new Set(b.map((s) => s.pos));
  const posDiff = [...posA].some((p) => !posB.has(p)) || [...posB].some((p) => !posA.has(p));
  if (posDiff) return true;

  const tokens = (s: string): Set<string> => {
    return new Set(
      s.toLowerCase()
        .replace(/[^\p{L}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
  };
  const tokA = tokens(a[0].gloss);
  const tokB = tokens(b[0].gloss);
  if (tokA.size === 0 || tokB.size === 0) return false;
  let overlap = 0;
  for (const t of tokA) if (tokB.has(t)) overlap++;
  const denom = Math.max(tokA.size, tokB.size);
  return overlap / denom < 0.3;
}

/**
 * Best-effort enrichment: fetch senses for each surface in each group,
 * mark groups whose surfaces have demonstrably different meanings.
 */
export async function enrichWithSenses(
  groups: HomophoneGroup[],
  semantics: SemanticResource,
): Promise<HomophoneGroup[]> {
  const allSurfaces = new Set<string>();
  for (const g of groups) for (const s of g.surfaces) allSurfaces.add(s);

  // Prefetch in the background to warm the cache.
  if (semantics.prefetch) await semantics.prefetch([...allSurfaces]);

  for (const g of groups) {
    const sensesBySurface: Record<string, SemanticSense[]> = {};
    for (const surf of g.surfaces) {
      sensesBySurface[surf] = await semantics.getSenses(surf);
    }
    g.sensesBySurface = sensesBySurface;

    // Pairwise distinctness check.
    let distinct = false;
    const surfs = g.surfaces;
    outer: for (let i = 0; i < surfs.length; i++) {
      for (let j = i + 1; j < surfs.length; j++) {
        if (sensesDistinct(sensesBySurface[surfs[i]], sensesBySurface[surfs[j]])) {
          distinct = true;
          break outer;
        }
      }
    }
    g.semanticallyDistinct = distinct;
  }

  return groups;
}
