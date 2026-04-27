import type { Language, LanguageCode } from './Language';
import { englishLanguage } from './english';
import { frenchLanguage } from './french';
import { germanLanguage } from './german';

const REGISTRY: Record<LanguageCode, Language> = {
  en: englishLanguage,
  fr: frenchLanguage,
  de: germanLanguage,
};

export function getLanguage(code: LanguageCode): Language {
  const lang = REGISTRY[code];
  if (!lang) throw new Error(`Unknown language: ${code}`);
  return lang;
}

export function listLanguages(): Language[] {
  return Object.values(REGISTRY);
}
