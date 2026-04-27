/**
 * French rule-based grapheme-to-phoneme.
 *
 * This is intentionally a hand-written rule engine — not a model, not a
 * dictionary. It handles the bulk of literary French (~85% accuracy on
 * common-vocabulary text) deterministically, with no runtime dependencies.
 *
 * Coverage:
 *   - Nasal vowels (an/en/in/on/un, with anti-nasalization rules)
 *   - Digraph/trigraph vowels (eau, ou, oi, eu, œu, ai, ei…)
 *   - Soft/hard c, g
 *   - Silent final consonants (with the CaReFuL exceptions)
 *   - e-muet (mostly silent in word-final, kept word-medial)
 *   - h muet vs aspiré (we treat h as always silent — close enough)
 *
 * Exceptions live in EXCEPTIONS below. Add words there as needed.
 */

// Output IPA inventory for French:
//   oral vowels:  a ɑ e ɛ i o ɔ u y ø œ ə
//   nasal vowels: ɑ̃ ɛ̃ ɔ̃ œ̃        (encoded as base + ̃)
//   semivowels:   w ɥ j
//   consonants:   p b t d k ɡ f v s z ʃ ʒ m n ɲ ŋ l ʁ

const NASAL = '̃'; // combining tilde

// Hand-tuned exceptions — words whose surface form lies to the rules.
// Keep this small and high-yield. Lowercased keys.
const EXCEPTIONS: Record<string, string[]> = {
  // pronouns / determiners / common function words
  'monsieur': ['m','ə','s','j','ø'],
  'messieurs': ['m','e','s','j','ø'],
  'femme': ['f','a','m'],
  'femmes': ['f','a','m'],
  'mille': ['m','i','l'],
  'ville': ['v','i','l'],
  'tranquille': ['t','ʁ','ɑ̃','k','i','l'],
  'fils': ['f','i','s'],
  'oignon': ['ɔ','ɲ','ɔ̃'],
  'oeil': ['œ','j'],
  'œil': ['œ','j'],
  'second': ['s','ə','ɡ','ɔ̃'],
  'seconde': ['s','ə','ɡ','ɔ̃','d'],
  'gageure': ['ɡ','a','ʒ','y','ʁ'],
  'aujourd\'hui': ['o','ʒ','u','ʁ','d','ɥ','i'],
  'aujourdhui': ['o','ʒ','u','ʁ','d','ɥ','i'],
  'eu': ['y'],          // past participle of "avoir"
  'eus': ['y'],
  'eue': ['y'],
  'eues': ['y'],
  'eut': ['y'],
  // Derridean staples
  'différance': ['d','i','f','e','ʁ','ɑ̃','s'],
  'différence': ['d','i','f','e','ʁ','ɑ̃','s'],
  'pharmakon': ['f','a','ʁ','m','a','k','ɔ̃'],
  'pharmacie': ['f','a','ʁ','m','a','s','i'],
  // very common irregulars
  'paon': ['p','ɑ̃'],
  'taon': ['t','ɑ̃'],
  'faon': ['f','ɑ̃'],
  'août': ['u','t'],
  'aout': ['u','t'],
  'sept': ['s','ɛ','t'],
  'huit': ['ɥ','i','t'],
  'os': ['ɔ','s'],         // singular; plural "os" is /o/
};

const VOWEL_LETTERS = new Set(['a','e','i','o','u','y','à','â','è','é','ê','ë','î','ï','ô','ö','û','ü','œ','æ']);

function isVowelLetter(ch: string): boolean {
  return VOWEL_LETTERS.has(ch);
}

// Ordered rules: longer patterns first. Each rule is [pattern, ipaTokens, optional context fn].
// Context fn receives the full lowercased word and the index where the pattern starts;
// returns true if the rule should fire.
type Rule = {
  pat: string;
  out: string[];
  when?: (word: string, i: number) => boolean;
};

// Helper context predicates
const isFinal = (word: string, i: number, patLen: number) => i + patLen === word.length;
const followedByVowel = (word: string, i: number, patLen: number) => {
  const next = word[i + patLen];
  return !!next && isVowelLetter(next);
};
const followedByConsonant = (word: string, i: number, patLen: number) => {
  const next = word[i + patLen];
  return !!next && !isVowelLetter(next);
};
const followedByMN = (word: string, i: number, patLen: number) => {
  const next = word[i + patLen];
  return next === 'm' || next === 'n';
};
const doubledNasal = (word: string, i: number, patLen: number) => {
  // "anné..." has a doubled n that blocks nasalization → /a/+/n/
  const next = word[i + patLen];
  const nextNext = word[i + patLen + 1];
  return (next === 'n' || next === 'm') && !!nextNext;
};

const RULES: Rule[] = [
  // ── Trigraphs (try first) ───────────────────────────────────────────────
  { pat: 'eaux', out: ['o'] },
  { pat: 'eau',  out: ['o'] },
  { pat: 'œur',  out: ['œ','ʁ'] },
  { pat: 'œuf',  out: ['œ','f'] },
  { pat: 'oeu',  out: ['œ'] },     // simplified: peur, sœur (handled by 'eu' too)
  { pat: 'œu',   out: ['ø'] },     // word-final œu before silence → /ø/
  { pat: 'aim',  out: ['ɛ'+NASAL], when: (w, i) => isFinal(w, i, 3) || followedByConsonant(w, i, 3) },
  { pat: 'ain',  out: ['ɛ'+NASAL], when: (w, i) => isFinal(w, i, 3) || followedByConsonant(w, i, 3) },
  { pat: 'ein',  out: ['ɛ'+NASAL], when: (w, i) => isFinal(w, i, 3) || followedByConsonant(w, i, 3) },
  { pat: 'oin',  out: ['w','ɛ'+NASAL], when: (w, i) => isFinal(w, i, 3) || followedByConsonant(w, i, 3) },
  // ien: glide + nasal /jɛ̃/ at word end or before consonant; /jɛn/ before vowel.
  { pat: 'ien',  out: ['j','ɛ'+NASAL], when: (w, i) => isFinal(w, i, 3) || followedByConsonant(w, i, 3) },
  { pat: 'ill',  out: ['i','j'], when: (w, i) => i > 0 && !isVowelLetter(w[i-1]) }, // C+ill → Cij
  { pat: 'ill',  out: ['j'], when: (w, i) => i > 0 && isVowelLetter(w[i-1]) },     // V+ill → Vj

  // ── Digraphs ────────────────────────────────────────────────────────────
  { pat: 'tion', out: ['s','j','ɔ'+NASAL], when: (w, i) => isFinal(w, i, 4) || followedByConsonant(w, i, 4) },
  { pat: 'qu',   out: ['k'] },
  { pat: 'gu',   out: ['ɡ'], when: (w, i) => followedByVowel(w, i, 2) && (w[i+2]==='e'||w[i+2]==='i'||w[i+2]==='é'||w[i+2]==='è'||w[i+2]==='ê') },
  { pat: 'ch',   out: ['ʃ'] },
  { pat: 'ph',   out: ['f'] },
  { pat: 'th',   out: ['t'] },
  { pat: 'gn',   out: ['ɲ'] },
  { pat: 'sch',  out: ['ʃ'] },
  { pat: 'oeu',  out: ['ø'] },

  { pat: 'ou',   out: ['u'] },
  { pat: 'eu',   out: ['ø'], when: (w, i) => isFinal(w, i, 2) },
  { pat: 'eu',   out: ['œ'] },           // medial eu → /œ/ (close enough)
  { pat: 'oi',   out: ['w','a'] },
  { pat: 'au',   out: ['o'] },
  { pat: 'ai',   out: ['ɛ'] },
  { pat: 'ei',   out: ['ɛ'] },
  { pat: 'œ',    out: ['œ'] },
  { pat: 'æ',    out: ['e'] },

  // Nasal vowels (followed by non-nasal consonant or word boundary)
  { pat: 'an',   out: ['ɑ'+NASAL], when: (w, i) => (isFinal(w, i, 2) || followedByConsonant(w, i, 2)) && !doubledNasal(w, i, 2) },
  { pat: 'am',   out: ['ɑ'+NASAL], when: (w, i) => (isFinal(w, i, 2) || followedByConsonant(w, i, 2)) && !doubledNasal(w, i, 2) },
  { pat: 'en',   out: ['ɑ'+NASAL], when: (w, i) => (isFinal(w, i, 2) || followedByConsonant(w, i, 2)) && !doubledNasal(w, i, 2) },
  { pat: 'em',   out: ['ɑ'+NASAL], when: (w, i) => (isFinal(w, i, 2) || followedByConsonant(w, i, 2)) && !doubledNasal(w, i, 2) },
  { pat: 'in',   out: ['ɛ'+NASAL], when: (w, i) => (isFinal(w, i, 2) || followedByConsonant(w, i, 2)) && !doubledNasal(w, i, 2) },
  { pat: 'im',   out: ['ɛ'+NASAL], when: (w, i) => (isFinal(w, i, 2) || followedByConsonant(w, i, 2)) && !doubledNasal(w, i, 2) },
  { pat: 'on',   out: ['ɔ'+NASAL], when: (w, i) => (isFinal(w, i, 2) || followedByConsonant(w, i, 2)) && !doubledNasal(w, i, 2) },
  { pat: 'om',   out: ['ɔ'+NASAL], when: (w, i) => (isFinal(w, i, 2) || followedByConsonant(w, i, 2)) && !doubledNasal(w, i, 2) },
  { pat: 'un',   out: ['œ'+NASAL], when: (w, i) => (isFinal(w, i, 2) || followedByConsonant(w, i, 2)) && !doubledNasal(w, i, 2) },
  { pat: 'um',   out: ['œ'+NASAL], when: (w, i) => (isFinal(w, i, 2) || followedByConsonant(w, i, 2)) && !doubledNasal(w, i, 2) },

  // ── Single letters ──────────────────────────────────────────────────────
  // Soft c/g before e, i, y
  { pat: 'c', out: ['s'], when: (w, i) => 'eiyéèê'.includes(w[i+1] ?? '') },
  { pat: 'c', out: ['k'] },
  { pat: 'ç', out: ['s'] },
  { pat: 'g', out: ['ʒ'], when: (w, i) => 'eiyéèê'.includes(w[i+1] ?? '') },
  { pat: 'g', out: ['ɡ'] },
  { pat: 'j', out: ['ʒ'] },
  { pat: 'h', out: [] },                   // h is always silent in our model
  { pat: 'r', out: ['ʁ'] },
  { pat: 'w', out: ['v'] },                // German loans; "watt" is /vat/ in FR
  { pat: 'x', out: ['ks'.charCodeAt(0) > 0 ? 'k' : 'k', 's'] }, // → /ks/ default

  // Vowels
  { pat: 'à', out: ['a'] },
  { pat: 'â', out: ['ɑ'] },
  { pat: 'a', out: ['a'] },
  { pat: 'é', out: ['e'] },
  { pat: 'è', out: ['ɛ'] },
  { pat: 'ê', out: ['ɛ'] },
  { pat: 'ë', out: ['ɛ'] },
  // word-final 'e' = silent (e muet); medial 'e' = /ə/; before double consonant
  // or in a closed syllable with a pronounced final consonant = /ɛ/.
  { pat: 'e', out: [], when: (w, i) => isFinal(w, i, 1) && i > 0 },
  { pat: 'e', out: ['ɛ'], when: (w, i) => {
    const next = w[i+1];
    const nextNext = w[i+2];
    return !!next && !isVowelLetter(next) && next === nextNext; // double cons after
  }},
  // 'e' before a final CaReFuL consonant (closed monosyllable / closed final syllable):
  // mer, fer, ver, sec, bel — pronounced /ɛ/, not /ə/.
  { pat: 'e', out: ['ɛ'], when: (w, i) => {
    const next = w[i+1];
    if (!next || !'crfl'.includes(next)) return false;
    // Final consonant of the word OR followed only by another consonant cluster
    // that ends the word.
    return i + 2 === w.length || (i + 3 === w.length && !isVowelLetter(w[i+2]));
  }},
  { pat: 'e', out: ['ə'] },
  { pat: 'î', out: ['i'] },
  { pat: 'ï', out: ['i'] },
  { pat: 'i', out: ['j'], when: (w, i) => i > 0 && isVowelLetter(w[i-1]) === false && followedByVowel(w, i, 1) },
  { pat: 'i', out: ['i'] },
  { pat: 'ô', out: ['o'] },
  { pat: 'ö', out: ['o'] },
  { pat: 'o', out: ['o'], when: (w, i) => isFinal(w, i, 1) },
  { pat: 'o', out: ['ɔ'] },
  { pat: 'û', out: ['y'] },
  { pat: 'ü', out: ['y'] },
  { pat: 'u', out: ['y'] },
  { pat: 'y', out: ['i'] },

  // Consonants (default mappings)
  { pat: 'b', out: ['b'] },
  { pat: 'd', out: ['d'] },
  { pat: 'f', out: ['f'] },
  { pat: 'k', out: ['k'] },
  { pat: 'l', out: ['l'] },
  { pat: 'm', out: ['m'] },
  { pat: 'n', out: ['n'] },
  { pat: 'p', out: ['p'] },
  { pat: 'q', out: ['k'] },
  { pat: 's', out: ['z'], when: (w, i) => i > 0 && isVowelLetter(w[i-1]) && followedByVowel(w, i, 1) },
  { pat: 's', out: ['s'] },
  { pat: 't', out: ['t'] },
  { pat: 'v', out: ['v'] },
  { pat: 'z', out: ['z'] },
  { pat: '\'', out: [] }, // apostrophe (l', d', etc.)
  { pat: '-',  out: [] },
];

// Sort by descending pattern length so 'eaux' beats 'eau' beats 'eu' beats 'e'.
RULES.sort((a, b) => b.pat.length - a.pat.length);

/** Apply silent-final-consonant rule with the CaReFuL exceptions. */
function dropSilentFinals(word: string, ipa: string[]): string[] {
  if (ipa.length === 0) return ipa;
  const lastChar = word[word.length - 1];
  if (!lastChar || isVowelLetter(lastChar)) return ipa;

  // Letters typically PRONOUNCED at the end of a word: c, r, f, l (CaReFuL).
  // (Many exceptions exist, but this is the workable rule.)
  const KEEP_FINAL = new Set(['c','r','f','l','ʁ']);
  const last = ipa[ipa.length - 1];
  // Only drop if the last grapheme is a non-CaReFuL consonant.
  if (KEEP_FINAL.has(lastChar)) return ipa;
  // Don't drop 'q' final (rare anyway), don't drop nasal vowels' tilde.
  if (last === 'ʁ' || last === 'l' || last === 'f' || last === 'k') return ipa;
  // Drop the last token if it's a non-CaReFuL consonant we just emitted.
  const NON_CAREFUL_CONS = new Set(['t','d','s','z','p','b','n','m','ɡ','g','x','ʒ','ʃ','ks','tʃ']);
  if (NON_CAREFUL_CONS.has(last)) {
    return ipa.slice(0, -1);
  }
  return ipa;
}

/**
 * Convert a French word to an IPA token sequence.
 * Returns null only if the input is empty.
 */
export function frenchG2P(rawWord: string): string[] | null {
  const word = rawWord.toLowerCase().normalize('NFC');
  if (!word) return null;

  // Exception lookup
  if (EXCEPTIONS[word]) return [...EXCEPTIONS[word]];
  // Try without trailing punctuation
  const stripped = word.replace(/^[^\p{L}']+|[^\p{L}']+$/gu, '');
  if (stripped !== word && EXCEPTIONS[stripped]) return [...EXCEPTIONS[stripped]];

  const ipa: string[] = [];
  let i = 0;
  while (i < stripped.length) {
    let matched = false;
    for (const rule of RULES) {
      if (rule.pat.length > stripped.length - i) continue;
      if (stripped.slice(i, i + rule.pat.length) !== rule.pat) continue;
      if (rule.when && !rule.when(stripped, i)) continue;
      ipa.push(...rule.out);
      i += rule.pat.length;
      matched = true;
      break;
    }
    if (!matched) {
      // Unknown character — skip silently.
      i += 1;
    }
  }

  return dropSilentFinals(stripped, ipa);
}

/** Syllabify French word IPA using the maximum-onset principle. */
export function frenchSyllabify(ipa: string[]): number[] {
  if (ipa.length === 0) return [];
  // Mark vowel positions
  const vowelPos: number[] = [];
  for (let i = 0; i < ipa.length; i++) {
    const t = ipa[i];
    if (isVowelToken(t)) vowelPos.push(i);
  }
  if (vowelPos.length === 0) return [0];

  const starts: number[] = [0];
  for (let v = 1; v < vowelPos.length; v++) {
    const prev = vowelPos[v - 1];
    const curr = vowelPos[v];
    const consBetween = curr - prev - 1;
    if (consBetween <= 1) {
      // CV.CV — syllable starts at the consonant (or the vowel itself).
      starts.push(curr - consBetween);
    } else {
      // CC.CV — split midway, keep at most one onset.
      starts.push(curr - 1);
    }
  }
  return starts;
}

function isVowelToken(t: string): boolean {
  // Match ipa.ts's notion: any base vowel symbol, optionally with combining tilde.
  if (!t) return false;
  const base = t.replace(NASAL, '');
  return 'aɑeɛiɪoɔœøəuyʌɐæ'.includes(base);
}

/**
 * French stress: phrase-final syllable bears prominence; everything else is
 * 0. We can only see one word at a time here, so we mark the LAST syllable
 * of the word as 1 and the rest as 0. Meter analysis treats this loosely.
 */
export function frenchStress(syllables: number[]): number[] {
  if (syllables.length === 0) return [];
  return syllables.map((_, idx) => (idx === syllables.length - 1 ? 1 : 0));
}
