/**
 * Wiktionary REST adapter — definitions for any language.
 *
 * Endpoint: https://{lang}.wiktionary.org/api/rest_v1/page/definition/{word}
 *
 * Response shape: an object keyed by language code; each value is an array
 * of "part of speech" sections, each containing definitions (HTML) and
 * examples. We strip HTML to plain text and keep one short gloss per sense.
 *
 * We hit the *target* language's Wiktionary (fr.wiktionary.org for French
 * words) because the entries there are most complete for that language.
 */

import type { LanguageCode } from '../languages/Language';
import type { SemanticResource, SemanticSense } from '../languages/Language';
import { cacheGet, cacheSet } from './cache';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const inflight = new Map<string, Promise<SemanticSense[]>>();

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function endpoint(_lang: LanguageCode, word: string): string {
  // Always hit en.wiktionary.org. The /page/definition/ endpoint is only
  // enabled on the English wiki; fr.wiktionary.org returns 501 for every
  // word. The English wiki happens to contain entries (and structured
  // sense data) for every language as separately-keyed sections, so this
  // is strictly an upgrade.
  return `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
}

async function fetchSenses(lang: LanguageCode, word: string): Promise<SemanticSense[]> {
  const cacheKey = `wiktionary:${lang}:${word}`;
  const cached = await cacheGet<SemanticSense[]>(cacheKey);
  if (cached) return cached;

  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const promise = (async (): Promise<SemanticSense[]> => {
    let resp: Response;
    try {
      resp = await fetch(endpoint(lang, word), {
        headers: { 'Accept': 'application/json' },
      });
    } catch {
      return [];
    }
    if (!resp.ok) {
      // 404 = no entry; cache the empty result so we don't re-hit.
      await cacheSet(cacheKey, [], TTL_MS);
      return [];
    }
    let data: any;
    try {
      data = await resp.json();
    } catch {
      return [];
    }

    const out: SemanticSense[] = [];
    // Prefer the section in the target language; fall back to others.
    const langKeys = [lang, ...Object.keys(data).filter((k) => k !== lang)];
    for (const key of langKeys) {
      const sections = data[key];
      if (!Array.isArray(sections)) continue;
      for (const section of sections) {
        const pos = String(section.partOfSpeech ?? '').toLowerCase();
        const defs = Array.isArray(section.definitions) ? section.definitions : [];
        for (const def of defs) {
          const gloss = stripHtml(String(def.definition ?? ''));
          if (!gloss) continue;
          // Keep glosses short — first sentence only.
          const short = gloss.split(/(?<=\.)\s/)[0].slice(0, 200);
          out.push({ pos, gloss: short, source: `wiktionary:${key}` });
        }
      }
      if (out.length > 0) break;
    }

    await cacheSet(cacheKey, out, TTL_MS);
    return out;
  })().finally(() => {
    inflight.delete(cacheKey);
  });

  inflight.set(cacheKey, promise);
  return promise;
}

export function wiktionarySemantics(lang: LanguageCode): SemanticResource {
  return {
    async getSenses(word: string): Promise<SemanticSense[]> {
      const clean = word.toLowerCase().replace(/^[^\p{L}']+|[^\p{L}']+$/gu, '');
      if (!clean) return [];
      return fetchSenses(lang, clean);
    },
    async prefetch(words: string[]): Promise<void> {
      // Run with bounded concurrency to be polite.
      const queue = [...new Set(words.map((w) => w.toLowerCase()))];
      const workers = Array.from({ length: 4 }, async () => {
        while (queue.length > 0) {
          const w = queue.shift();
          if (!w) return;
          await fetchSenses(lang, w).catch(() => {});
        }
      });
      await Promise.all(workers);
    },
  };
}
