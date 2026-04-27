/**
 * Root / lemma recurrence — surfaces words that share a stem after stripping
 * common inflectional and derivational suffixes. Catches the morphological
 * threading that the phonetic groupers miss (e.g. souffl-: soufflée,
 * souffleur, souffler, soufflée; text-: texte, textes; théâtre: théâtre,
 * théâtral, théâtralité).
 *
 * This is deliberately conservative — no real morphological analyzer.
 * Suffixes are stripped longest-first from a curated language list, and we
 * require stems of ≥4 chars (French) or ≥3 chars (English) to avoid
 * collapsing function words into spurious groups.
 */

import type { Language, LanguageCode } from '../languages/Language';
import type { IndexedWord } from './tokens';

export type RootGroup = {
  id: string;
  stem: string;
  count: number;
  surfaces: string[];
  words: { lineIndex: number; wordIndex: number; surface: string }[];
};

const STOP_WORDS: Record<LanguageCode, Set<string>> = {
  en: new Set(['the', 'a', 'an', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'have', 'has', 'had', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'so', 'not', 'no', 'yes', 'too', 'than', 'then', 'when', 'where', 'why', 'how', 'who', 'what', 'which']),
  fr: new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du', 'd', 'et', 'ou', 'mais', 'si', 'que', 'qu', 'qui', 'à', 'au', 'aux', 'en', 'dans', 'sur', 'sous', 'avec', 'sans', 'pour', 'par', 'pas', 'ne', 'n', 'plus', 'moins', 'très', 'aussi', 'comme', 'cette', 'ce', 'ces', 'cela', 'ça', 'son', 'sa', 'ses', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs', 'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se', 's', 'lui', 'y', 'est', 'sont', 'était', 'étaient', 'fut', 'fût', 'été', 'avoir', 'avait', 'avaient', 'aura', 'auront', 'tel', 'telle']),
  de: new Set(['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines', 'und', 'oder', 'aber', 'doch', 'wenn', 'in', 'an', 'auf', 'mit', 'für', 'aus', 'zu', 'nicht', 'kein', 'keine', 'ist', 'sind', 'war', 'waren', 'gewesen', 'sein', 'haben', 'hat', 'hatte', 'werden', 'wird', 'wurde']),
};

const FR_SUFFIXES = [
  'issaient', 'iraient', 'eraient', 'aissaient',
  'issante', 'issantes', 'issants', 'aient', 'eront', 'aient',
  'âtes', 'âmes', 'èrent', 'asse', 'isse', 'usse',
  'tions', 'sions', 'ation', 'ations', 'ement', 'éments', 'ements',
  'ité', 'ités', 'eur', 'eurs', 'euse', 'euses',
  'isme', 'ismes', 'iste', 'istes',
  'aux', 'ales', 'ale', 'els', 'elles', 'elle',
  'ives', 'ive', 'if', 'ifs',
  'iques', 'ique', 'ant', 'ante', 'ants', 'antes',
  'ions', 'iez', 'ais', 'ait', 'ras', 'rai', 'rez',
  'ons', 'ent', 'ée', 'ées', 'és', 'é',
  'ai', 'as', 'es', 'er', 'ir', 'is', 'it',
  'x', 's', 'e',
];

const EN_SUFFIXES = [
  'iveness', 'ization', 'isations', 'ization', 'isation',
  'ational', 'fulness', 'ousness', 'iveness',
  'ities', 'ity', 'tion', 'tions', 'sion', 'sions', 'ment', 'ments',
  'ness', 'able', 'ible', 'ical', 'ically',
  'ing', 'ings', 'ed', 'er', 'ers', 'est',
  'ly', 'es', 's',
];

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function stem(word: string, code: LanguageCode): string {
  const lower = word.toLowerCase();
  const suffixes = code === 'fr' ? FR_SUFFIXES : code === 'en' ? EN_SUFFIXES : [];
  const minLen = code === 'fr' ? 4 : 3;

  for (const suffix of suffixes) {
    if (lower.length - suffix.length >= minLen && lower.endsWith(suffix)) {
      return lower.slice(0, lower.length - suffix.length);
    }
  }
  return lower;
}

/**
 * Bucket stems by a diacritic-folded prefix of length min(stem.length, 6).
 * The cap lets "inspir" (from inspirée → strip ée) and "inspira" (from
 * inspiration → strip tion) collapse to the same key "inspir", since both
 * truncate identically at 6 chars.
 */
function rootKey(s: string): string {
  const folded = stripDiacritics(s.toLowerCase());
  return folded.slice(0, Math.min(folded.length, 6));
}

/**
 * Strip French elided particles (d', l', n', qu', m', t', s', j', c'). For
 * "d'un" we want to drop the article entirely (it's then caught as the stop
 * word "un"), not stem it as if "d'un" were a content word.
 */
function deElide(word: string): string {
  return word.replace(/^(d|l|n|qu|m|t|s|j|c)['']/i, '');
}

export function findRoots(words: IndexedWord[], language: Language, minMembers = 2): RootGroup[] {
  const code = language.code as LanguageCode;
  const stops = STOP_WORDS[code] ?? new Set<string>();
  const minLen = code === 'fr' ? 4 : 3;

  type Bucket = {
    stem: string;
    members: { lineIndex: number; wordIndex: number; surface: string }[];
  };
  const buckets = new Map<string, Bucket>();

  for (const w of words) {
    if (!w.clean) continue;
    const cleaned = code === 'fr' ? deElide(w.clean) : w.clean;
    if (cleaned.length < minLen) continue;
    if (stops.has(cleaned)) continue;
    // Also skip pure punctuation residue.
    if (!/[\p{L}]/u.test(cleaned)) continue;

    const s = stem(cleaned, code);
    const key = rootKey(s);
    if (key.length < minLen) continue;

    if (!buckets.has(key)) {
      buckets.set(key, { stem: s, members: [] });
    }
    buckets.get(key)!.members.push({
      lineIndex: w.lineIndex,
      wordIndex: w.wordIndex,
      surface: w.clean,
    });
  }

  const groups: RootGroup[] = [];
  let id = 0;
  for (const bucket of buckets.values()) {
    const distinctSurfaces = new Set(bucket.members.map((m) => m.surface));
    // Pass if EITHER multiple inflected surfaces OR 3+ occurrences of a single form.
    const enoughSurfaces = distinctSurfaces.size >= minMembers;
    const enoughOccurrences = bucket.members.length >= 3;
    if (!enoughSurfaces && !enoughOccurrences) continue;

    groups.push({
      id: `root-${id++}`,
      stem: bucket.stem,
      count: bucket.members.length,
      surfaces: Array.from(distinctSurfaces).sort(),
      words: bucket.members,
    });
  }

  // Strongest first: more occurrences, then more distinct surfaces.
  groups.sort((a, b) => b.count - a.count || b.surfaces.length - a.surfaces.length);
  return groups;
}
