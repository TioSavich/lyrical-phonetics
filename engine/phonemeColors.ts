/**
 * Articulatory color mapping: each ARPAbet phoneme → HSL color.
 *
 * Colors are organized by manner/place of articulation so that
 * similar-sounding phonemes have similar colors:
 *   - Stops:       0°–55°   (warm reds/oranges)
 *   - Fricatives:  60°–115° (yellows/greens)
 *   - Affricates:  120°–130°
 *   - Nasals:      135°–155° (teals)
 *   - Liquids:     165°–200° (cool greens/blues)
 *   - Vowels:      200°–360° (blues → purples → magentas)
 */

export const VOWELS = new Set([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY',
  'EH', 'ER', 'EY',
  'IH', 'IY',
  'OW', 'OY',
  'UH', 'UW',
]);

export const CONSONANTS = new Set([
  'B', 'CH', 'D', 'DH', 'F', 'G', 'HH', 'JH',
  'K', 'L', 'M', 'N', 'NG', 'P', 'R', 'S',
  'SH', 'T', 'TH', 'V', 'W', 'Y', 'Z', 'ZH',
]);

export type HSL = [number, number, number]; // [hue, saturation%, lightness%]

/** Human-readable vowel descriptions */
export const VOWEL_NAMES: Record<string, string> = {
  AA: 'Open A (father)', AE: 'Flat A (cat)', AH: 'Schwa (but)',
  AO: 'Open O (law)', AW: 'Ow (cow)', AY: 'Long I (eye)',
  EH: 'Short E (bed)', ER: 'R-colored (bird)', EY: 'Long A (say)',
  IH: 'Short I (bit)', IY: 'Long E (see)',
  OW: 'Long O (go)', OY: 'Oy (boy)',
  UH: 'Short U (book)', UW: 'Long U (blue)',
};

const PHONEME_HSL: Record<string, HSL> = {
  // Stops — paired by voicing
  P:  [0,   75, 55], B:  [10,  75, 45],
  T:  [20,  80, 55], D:  [30,  80, 45],
  K:  [40,  75, 55], G:  [50,  75, 45],
  // Fricatives
  F:  [60,  60, 55], V:  [68,  60, 45],
  TH: [76,  55, 55], DH: [84,  55, 45],
  S:  [92,  70, 55], Z:  [100, 70, 45],
  SH: [108, 65, 55], ZH: [114, 65, 45],
  HH: [58,  40, 60],
  // Affricates
  CH: [120, 65, 55], JH: [128, 65, 45],
  // Nasals
  M:  [135, 55, 50], N:  [145, 55, 50], NG: [155, 55, 50],
  // Liquids & Glides
  L:  [165, 50, 50], R:  [175, 50, 50],
  W:  [185, 45, 50], Y:  [195, 45, 50],
  // Front vowels
  IY: [205, 70, 55], IH: [215, 65, 50],
  EY: [225, 70, 55], EH: [235, 65, 50],
  AE: [245, 60, 50],
  // Central vowels
  AH: [260, 50, 50], ER: [272, 55, 50],
  // Back vowels
  UW: [285, 70, 55], UH: [295, 65, 50],
  OW: [305, 70, 55], AO: [315, 60, 50],
  AA: [325, 55, 50],
  // Diphthongs
  AY: [335, 75, 55], AW: [345, 75, 55], OY: [355, 75, 55],
};

/** Strip stress marker (0, 1, 2) from an ARPAbet phoneme. */
export function stripStress(phoneme: string): string {
  return phoneme.replace(/[012]/g, '');
}

/** Check if a phoneme (with or without stress) is a vowel. */
export function isVowel(phoneme: string): boolean {
  return VOWELS.has(stripStress(phoneme));
}

/** Get HSL color for an ARPAbet phoneme. */
export function phonemeToHSL(phoneme: string): HSL {
  return PHONEME_HSL[stripStress(phoneme)] ?? [0, 0, 40];
}

/** Get CSS hsl() string for an ARPAbet phoneme. */
export function phonemeToCSS(phoneme: string): string {
  const [h, s, l] = phonemeToHSL(phoneme);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/** Get a brighter/more vivid version for highlights. */
export function phonemeToHighlightCSS(phoneme: string): string {
  const [h, s, l] = phonemeToHSL(phoneme);
  return `hsl(${h}, ${Math.min(s + 20, 100)}%, ${Math.min(l + 15, 85)}%)`;
}

/** Get a translucent background version. */
export function phonemeToBgCSS(phoneme: string, alpha = 0.25): string {
  const [h, s, l] = phonemeToHSL(phoneme);
  return `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
}
