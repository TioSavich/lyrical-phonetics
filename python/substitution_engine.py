"""
substitution_engine.py — Phoneme substitution engine for PhonoPaint.

Given a word, finds all real English words that result from swapping
one phoneme at a given position. Uses CMUDict as the dictionary of
valid words.

Also provides:
- Articulatory color mapping (phoneme → HSL color)
- Paintable position detection (which positions can be swapped for
  a given poetic device)
- Substitution filtering by device type (alliteration, assonance, etc.)
"""

import re
from collections import defaultdict
from typing import Optional

import pronouncing

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Strip stress markers from ARPAbet phonemes
_STRESS_RE = re.compile(r"[012]")

# All ARPAbet phonemes in CMUDict
VOWELS = {
    "AA", "AE", "AH", "AO", "AW", "AY",
    "EH", "ER", "EY",
    "IH", "IY",
    "OW", "OY",
    "UH", "UW",
}

CONSONANTS = {
    "B", "CH", "D", "DH", "F", "G", "HH", "JH",
    "K", "L", "M", "N", "NG", "P", "R", "S",
    "SH", "T", "TH", "V", "W", "Y", "Z", "ZH",
}

ALL_PHONEMES = VOWELS | CONSONANTS


# ---------------------------------------------------------------------------
# Articulatory Color Mapping
# ---------------------------------------------------------------------------
# Maps each phoneme to an HSL hue (0-360) based on articulatory features.
# The principle: similar-sounding phonemes get nearby hues so the color
# wheel mirrors the "sound space."
#
# Layout:
#   0°-60°    : Stops (plosives) — bold, percussive
#   60°-120°  : Fricatives — airy, textured
#   120°-160° : Affricates, nasals
#   160°-200° : Liquids, glides — smooth, flowing
#   200°-360° : Vowels — mapped by height & frontness

PHONEME_COLORS = {
    # --- Consonants (0°-200°) ---
    # Stops (0°-55°) — paired by voicing
    "P": (0, 75, 55),      # voiceless bilabial
    "B": (10, 75, 45),     # voiced bilabial
    "T": (20, 80, 55),     # voiceless alveolar
    "D": (30, 80, 45),     # voiced alveolar
    "K": (40, 75, 55),     # voiceless velar
    "G": (50, 75, 45),     # voiced velar

    # Fricatives (60°-115°) — paired by voicing
    "F": (60, 60, 55),     # voiceless labiodental
    "V": (68, 60, 45),     # voiced labiodental
    "TH": (76, 55, 55),    # voiceless dental
    "DH": (84, 55, 45),    # voiced dental
    "S": (92, 70, 55),     # voiceless alveolar
    "Z": (100, 70, 45),    # voiced alveolar
    "SH": (108, 65, 55),   # voiceless postalveolar
    "ZH": (114, 65, 45),   # voiced postalveolar
    "HH": (58, 40, 60),    # glottal (breathy, sits near fricatives)

    # Affricates (120°-130°)
    "CH": (120, 65, 55),   # voiceless
    "JH": (128, 65, 45),   # voiced

    # Nasals (135°-155°)
    "M": (135, 55, 50),    # bilabial
    "N": (145, 55, 50),    # alveolar
    "NG": (155, 55, 50),   # velar

    # Liquids & Glides (160°-200°)
    "L": (165, 50, 50),    # lateral
    "R": (175, 50, 50),    # rhotic
    "W": (185, 45, 50),    # labial-velar glide
    "Y": (195, 45, 50),    # palatal glide

    # --- Vowels (200°-360°) ---
    # Mapped by vowel space: front→high hue, back→low hue
    # High vowels at brighter saturation

    # Front vowels (200°-250°)
    "IY": (205, 70, 55),   # high front (fleece)
    "IH": (215, 65, 50),   # near-high front (kit)
    "EY": (225, 70, 55),   # mid front (face) — diphthong
    "EH": (235, 65, 50),   # mid front (dress)
    "AE": (245, 60, 50),   # low front (trap)

    # Central vowels (255°-280°)
    "AH": (260, 50, 50),   # mid central (strut/schwa)
    "ER": (272, 55, 50),   # r-colored central (nurse)

    # Back vowels (280°-330°)
    "UW": (285, 70, 55),   # high back (goose)
    "UH": (295, 65, 50),   # near-high back (foot)
    "OW": (305, 70, 55),   # mid back (goat) — diphthong
    "AO": (315, 60, 50),   # low-mid back (thought)
    "AA": (325, 55, 50),   # low back (lot)

    # Diphthongs (330°-360°)
    "AY": (335, 75, 55),   # price
    "AW": (345, 75, 55),   # mouth
    "OY": (355, 75, 55),   # choice
}


def phoneme_to_hsl(phoneme: str) -> tuple[int, int, int]:
    """Get the HSL color for an ARPAbet phoneme.

    Args:
        phoneme: ARPAbet phoneme, with or without stress marker.

    Returns:
        (hue, saturation%, lightness%) tuple.
    """
    clean = _STRESS_RE.sub("", phoneme)
    return PHONEME_COLORS.get(clean, (0, 0, 40))  # gray fallback


def phoneme_to_css(phoneme: str) -> str:
    """Get a CSS hsl() color string for an ARPAbet phoneme."""
    h, s, l = phoneme_to_hsl(phoneme)
    return f"hsl({h}, {s}%, {l}%)"


def is_vowel(phoneme: str) -> bool:
    """Check if a phoneme is a vowel (has a stress marker digit)."""
    return _STRESS_RE.sub("", phoneme) in VOWELS


# ---------------------------------------------------------------------------
# Substitution Index
# ---------------------------------------------------------------------------

class SubstitutionIndex:
    """Pre-computed index for instant phoneme substitution lookup.

    Groups all CMUDict words by "skeleton" — the phoneme sequence with
    one position replaced by a wildcard. To find substitutions for a word
    at a given position, look up the skeleton with that position wildcarded.
    """

    def __init__(self):
        self._skeleton_index: dict[str, list[tuple[str, list[str]]]] = defaultdict(list)
        self._word_phones: dict[str, list[list[str]]] = {}
        self._built = False

    def build(self):
        """Build the substitution index from CMUDict. Takes ~1-2 seconds."""
        if self._built:
            return

        cmu = pronouncing.cmudict.dict()

        # Store all word → phones mappings
        for word, pron_list in cmu.items():
            # Skip entries with special characters
            if not word.isalpha():
                continue
            self._word_phones[word] = pron_list

            for prons in pron_list:
                stripped = [_STRESS_RE.sub("", p) for p in prons]
                length = len(stripped)

                # For each position, create a skeleton with that position wildcarded
                for i in range(length):
                    skeleton = list(stripped)
                    skeleton[i] = "_"
                    key = f"{length}:" + " ".join(skeleton)
                    self._skeleton_index[key].append((word, prons))

        self._built = True

    def get_phones(self, word: str) -> Optional[list[str]]:
        """Get the primary pronunciation for a word."""
        self.build()
        prons = self._word_phones.get(word.lower())
        if prons:
            return prons[0]
        return None

    def find_substitutions(
        self,
        word: str,
        position: int,
        target_phoneme: Optional[str] = None,
    ) -> list[dict]:
        """Find all valid word substitutions at a given phoneme position.

        Args:
            word: The source word.
            position: The phoneme position to substitute (0-indexed).
            target_phoneme: If given, only return words where the substituted
                phoneme matches this target (stress-stripped). If None, return
                all possible substitutions.

        Returns:
            List of dicts: [{"word": str, "phones": list[str], "substituted_phoneme": str}]
        """
        self.build()

        phones = self.get_phones(word)
        if phones is None:
            return []
        if position < 0 or position >= len(phones):
            return []

        # Build the skeleton for this position
        stripped = [_STRESS_RE.sub("", p) for p in phones]
        skeleton = list(stripped)
        original_phoneme = skeleton[position]
        skeleton[position] = "_"
        key = f"{len(stripped)}:" + " ".join(skeleton)

        # Look up all words matching this skeleton
        matches = self._skeleton_index.get(key, [])

        results = []
        seen_words = set()
        source_lower = word.lower()

        for match_word, match_phones in matches:
            # Skip the source word itself
            if match_word == source_lower:
                continue
            # Skip duplicates
            if match_word in seen_words:
                continue

            match_stripped = _STRESS_RE.sub("", match_phones[position])

            # Skip if it's the same phoneme (not actually a substitution)
            if match_stripped == original_phoneme:
                continue

            # Filter by target phoneme if specified
            if target_phoneme and match_stripped != _STRESS_RE.sub("", target_phoneme):
                continue

            seen_words.add(match_word)
            results.append({
                "word": match_word,
                "phones": match_phones,
                "substituted_phoneme": match_stripped,
            })

        # Sort alphabetically
        results.sort(key=lambda r: r["word"])
        return results

    def find_all_substitutions(self, word: str) -> dict[int, list[dict]]:
        """Find all possible substitutions at every phoneme position.

        Returns:
            Dict mapping position → list of substitution results.
        """
        self.build()

        phones = self.get_phones(word)
        if phones is None:
            return {}

        result = {}
        for i in range(len(phones)):
            subs = self.find_substitutions(word, i)
            if subs:
                result[i] = subs
        return result

    def find_device_substitutions(
        self,
        word: str,
        device: str,
        target_phoneme: Optional[str] = None,
    ) -> list[dict]:
        """Find substitutions that would create or enhance a specific poetic device.

        Args:
            word: The source word.
            device: One of "alliteration", "assonance", "consonance", "rhyme".
            target_phoneme: The phoneme to paint with (e.g., "S" for /s/ alliteration).

        Returns:
            List of dicts with word, phones, position, and device info.
        """
        self.build()

        phones = self.get_phones(word)
        if phones is None:
            return []

        stripped = [_STRESS_RE.sub("", p) for p in phones]
        results = []

        if device == "alliteration":
            # Only substitute the initial consonant(s) — position 0
            # (or first consonant before first vowel)
            for i, p in enumerate(stripped):
                if p in VOWELS:
                    break  # stop at first vowel
                if target_phoneme and target_phoneme in CONSONANTS:
                    subs = self.find_substitutions(word, i, target_phoneme)
                else:
                    subs = self.find_substitutions(word, i)
                    subs = [s for s in subs if s["substituted_phoneme"] in CONSONANTS]
                for s in subs:
                    s["position"] = i
                    s["device"] = "alliteration"
                results.extend(subs)

        elif device == "assonance":
            # Substitute vowel positions
            for i, p in enumerate(stripped):
                if p in VOWELS:
                    if target_phoneme and target_phoneme in VOWELS:
                        subs = self.find_substitutions(word, i, target_phoneme)
                    else:
                        subs = self.find_substitutions(word, i)
                        subs = [s for s in subs if s["substituted_phoneme"] in VOWELS]
                    for s in subs:
                        s["position"] = i
                        s["device"] = "assonance"
                    results.extend(subs)

        elif device == "consonance":
            # Substitute consonant positions (any, not just initial)
            for i, p in enumerate(stripped):
                if p in CONSONANTS:
                    if target_phoneme and target_phoneme in CONSONANTS:
                        subs = self.find_substitutions(word, i, target_phoneme)
                    else:
                        subs = self.find_substitutions(word, i)
                        subs = [s for s in subs if s["substituted_phoneme"] in CONSONANTS]
                    for s in subs:
                        s["position"] = i
                        s["device"] = "consonance"
                    results.extend(subs)

        elif device == "rhyme":
            # Substitute phonemes before the rhyme tail (everything up to
            # the last stressed vowel), keeping the tail intact
            # Find last stressed vowel
            last_stressed = None
            for i, p in enumerate(phones):
                if "1" in p or "2" in p:
                    last_stressed = i
            if last_stressed is not None:
                for i in range(last_stressed):
                    subs = self.find_substitutions(word, i)
                    for s in subs:
                        s["position"] = i
                        s["device"] = "rhyme"
                    results.extend(subs)

        # Deduplicate by word
        seen = set()
        unique = []
        for r in results:
            if r["word"] not in seen:
                seen.add(r["word"])
                unique.append(r)

        return unique

    def get_word_info(self, word: str) -> Optional[dict]:
        """Get detailed phoneme info for a word, with colors.

        Returns:
            Dict with word, phones, phoneme_colors, etc.
        """
        phones = self.get_phones(word)
        if phones is None:
            return None

        phoneme_details = []
        for i, p in enumerate(phones):
            clean = _STRESS_RE.sub("", p)
            phoneme_details.append({
                "position": i,
                "phoneme": p,
                "phoneme_clean": clean,
                "is_vowel": clean in VOWELS,
                "color_hsl": phoneme_to_hsl(clean),
                "color_css": phoneme_to_css(clean),
                "stress": int(p[-1]) if p[-1].isdigit() else None,
            })

        return {
            "word": word.lower(),
            "phones": phones,
            "phoneme_count": len(phones),
            "syllable_count": sum(1 for p in phones if p[-1].isdigit() if p[-1] in "012"),
            "phonemes": phoneme_details,
        }


# ---------------------------------------------------------------------------
# Module-level singleton for convenience
# ---------------------------------------------------------------------------

_index: Optional[SubstitutionIndex] = None


def get_index() -> SubstitutionIndex:
    """Get the global SubstitutionIndex singleton (lazy-built)."""
    global _index
    if _index is None:
        _index = SubstitutionIndex()
        _index.build()
    return _index


def find_substitutions(word: str, position: int, target_phoneme: Optional[str] = None) -> list[dict]:
    """Convenience wrapper around SubstitutionIndex.find_substitutions."""
    return get_index().find_substitutions(word, position, target_phoneme)


def find_all_substitutions(word: str) -> dict[int, list[dict]]:
    """Convenience wrapper around SubstitutionIndex.find_all_substitutions."""
    return get_index().find_all_substitutions(word)


def find_device_substitutions(word: str, device: str, target_phoneme: Optional[str] = None) -> list[dict]:
    """Convenience wrapper around SubstitutionIndex.find_device_substitutions."""
    return get_index().find_device_substitutions(word, device, target_phoneme)
