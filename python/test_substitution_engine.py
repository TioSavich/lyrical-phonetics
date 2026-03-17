"""
test_substitution_engine.py — Tests for the PhonoPaint substitution engine.

Run with: python -m pytest test_substitution_engine.py -v
"""

import time
import pytest
from substitution_engine import (
    SubstitutionIndex,
    find_substitutions,
    find_all_substitutions,
    find_device_substitutions,
    phoneme_to_hsl,
    phoneme_to_css,
    is_vowel,
    VOWELS,
    CONSONANTS,
    ALL_PHONEMES,
    PHONEME_COLORS,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def index():
    """Build the index once for all tests in this module."""
    idx = SubstitutionIndex()
    idx.build()
    return idx


# ---------------------------------------------------------------------------
# Core Substitution
# ---------------------------------------------------------------------------

class TestBasicSubstitution:
    def test_cat_initial_to_s_gives_sat(self, index):
        """Swapping K → S in 'cat' should yield 'sat'."""
        results = index.find_substitutions("cat", 0, "S")
        words = [r["word"] for r in results]
        assert "sat" in words

    def test_cat_initial_to_b_gives_bat(self, index):
        results = index.find_substitutions("cat", 0, "B")
        words = [r["word"] for r in results]
        assert "bat" in words

    def test_cat_final_to_n_gives_can(self, index):
        """Swapping T → N in 'cat' should yield 'can'."""
        results = index.find_substitutions("cat", 2, "N")
        words = [r["word"] for r in results]
        assert "can" in words

    def test_cat_vowel_swap_to_uh_gives_cut(self, index):
        """Swapping AE → AH in 'cat' should yield 'cut'."""
        results = index.find_substitutions("cat", 1, "AH")
        words = [r["word"] for r in results]
        assert "cut" in words

    def test_no_self_match(self, index):
        """The source word should never appear in its own substitutions."""
        results = index.find_substitutions("cat", 0)
        words = [r["word"] for r in results]
        assert "cat" not in words

    def test_all_results_are_real_words(self, index):
        """Every substitution result must be in CMUDict."""
        results = index.find_substitutions("cat", 0)
        for r in results:
            assert index.get_phones(r["word"]) is not None, \
                f"'{r['word']}' not in CMUDict"

    def test_unknown_word_returns_empty(self, index):
        results = index.find_substitutions("xyzzyplugh", 0)
        assert results == []

    def test_invalid_position_returns_empty(self, index):
        results = index.find_substitutions("cat", 99)
        assert results == []
        results = index.find_substitutions("cat", -1)
        assert results == []

    def test_results_have_correct_structure(self, index):
        results = index.find_substitutions("cat", 0)
        assert len(results) > 0
        r = results[0]
        assert "word" in r
        assert "phones" in r
        assert "substituted_phoneme" in r
        assert isinstance(r["phones"], list)


class TestAllSubstitutions:
    def test_cat_has_substitutions_at_every_position(self, index):
        """'cat' (K AE1 T) should have subs at all 3 positions."""
        all_subs = index.find_all_substitutions("cat")
        assert 0 in all_subs  # initial K
        assert 1 in all_subs  # vowel AE
        assert 2 in all_subs  # final T

    def test_unknown_word(self, index):
        assert index.find_all_substitutions("xyzzyplugh") == {}


# ---------------------------------------------------------------------------
# Device-Aware Substitution
# ---------------------------------------------------------------------------

class TestDeviceSubstitutions:
    def test_alliteration_with_s(self, index):
        """Paint /S/ alliteration on 'cat' → should get 'sat'."""
        results = index.find_device_substitutions("cat", "alliteration", "S")
        words = [r["word"] for r in results]
        assert "sat" in words
        # All results should have device = "alliteration"
        for r in results:
            assert r["device"] == "alliteration"

    def test_assonance_results_have_vowels(self, index):
        """Assonance substitutions should only change vowels."""
        results = index.find_device_substitutions("cat", "assonance")
        for r in results:
            assert r["substituted_phoneme"] in VOWELS

    def test_consonance_results_have_consonants(self, index):
        """Consonance substitutions should only change consonants."""
        results = index.find_device_substitutions("cat", "consonance")
        for r in results:
            assert r["substituted_phoneme"] in CONSONANTS

    def test_rhyme_preserves_tail(self, index):
        """Rhyme substitution on 'flame' should keep -AIM tail intact."""
        # 'flame' = F L EY1 M
        # Rhyme tail starts at EY1 (last stressed vowel)
        # So rhyme subs modify positions before that: F, L
        results = index.find_device_substitutions("flame", "rhyme")
        if results:
            # All results should rhyme with 'flame'
            flame_phones = index.get_phones("flame")
            for r in results:
                # The rhyme tail (from stressed vowel onward) should match
                r_phones = r["phones"]
                assert len(r_phones) == len(flame_phones)
                # Last 2 phonemes (EY M) should match
                for i in range(len(flame_phones) - 1, -1, -1):
                    if any(c.isdigit() for c in flame_phones[i]):
                        # Found the stressed vowel; everything from here on should match
                        # (stripped of stress markers)
                        import re
                        for j in range(i, len(flame_phones)):
                            a = re.sub(r"[012]", "", flame_phones[j])
                            b = re.sub(r"[012]", "", r_phones[j])
                            assert a == b, \
                                f"Rhyme tail mismatch at pos {j}: {a} vs {b} in {r['word']}"
                        break


# ---------------------------------------------------------------------------
# Articulatory Color Mapping
# ---------------------------------------------------------------------------

class TestColorMapping:
    def test_all_phonemes_have_colors(self):
        """Every ARPAbet phoneme should have a color mapping."""
        for p in ALL_PHONEMES:
            h, s, l = phoneme_to_hsl(p)
            assert 0 <= h <= 360, f"Hue out of range for {p}: {h}"
            assert 0 <= s <= 100, f"Saturation out of range for {p}: {s}"
            assert 0 <= l <= 100, f"Lightness out of range for {p}: {l}"

    def test_voiced_pairs_are_close(self):
        """Voiced/voiceless pairs should have nearby hues."""
        pairs = [("P", "B"), ("T", "D"), ("K", "G"), ("S", "Z"), ("F", "V")]
        for voiceless, voiced in pairs:
            h1 = phoneme_to_hsl(voiceless)[0]
            h2 = phoneme_to_hsl(voiced)[0]
            assert abs(h1 - h2) <= 15, \
                f"Voiced pair {voiceless}/{voiced} too far apart: {h1} vs {h2}"

    def test_vowels_and_consonants_separate(self):
        """Vowels and consonants should occupy different hue ranges."""
        vowel_hues = [phoneme_to_hsl(v)[0] for v in VOWELS]
        consonant_hues = [phoneme_to_hsl(c)[0] for c in CONSONANTS]
        # All vowels should be >= 200°
        for h in vowel_hues:
            assert h >= 200, f"Vowel hue {h} is in consonant range"
        # All consonants should be < 200°
        for h in consonant_hues:
            assert h < 200, f"Consonant hue {h} is in vowel range"

    def test_css_format(self):
        css = phoneme_to_css("S")
        assert css.startswith("hsl(")
        assert css.endswith(")")

    def test_stress_markers_stripped(self):
        """Stressed and unstressed versions of same vowel → same color."""
        assert phoneme_to_hsl("AE") == phoneme_to_hsl("AE1")
        assert phoneme_to_hsl("AE") == phoneme_to_hsl("AE0")

    def test_is_vowel(self):
        assert is_vowel("AE1") is True
        assert is_vowel("AE") is True
        assert is_vowel("K") is False
        assert is_vowel("S") is False


# ---------------------------------------------------------------------------
# Word Info
# ---------------------------------------------------------------------------

class TestWordInfo:
    def test_word_info_structure(self, index):
        info = index.get_word_info("cat")
        assert info is not None
        assert info["word"] == "cat"
        assert info["phoneme_count"] == 3
        assert len(info["phonemes"]) == 3

        # Check phoneme detail structure
        p = info["phonemes"][0]
        assert "position" in p
        assert "phoneme" in p
        assert "is_vowel" in p
        assert "color_hsl" in p
        assert "color_css" in p

    def test_unknown_word(self, index):
        assert index.get_word_info("xyzzyplugh") is None


# ---------------------------------------------------------------------------
# Performance
# ---------------------------------------------------------------------------

class TestPerformance:
    def test_index_build_time(self):
        """Index should build in under 5 seconds."""
        idx = SubstitutionIndex()
        start = time.time()
        idx.build()
        elapsed = time.time() - start
        assert elapsed < 5.0, f"Index build took {elapsed:.1f}s (max 5s)"

    def test_substitution_lookup_speed(self, index):
        """Single substitution lookup should be under 50ms."""
        start = time.time()
        for _ in range(100):
            index.find_substitutions("cat", 0)
        elapsed = (time.time() - start) / 100
        assert elapsed < 0.05, f"Avg lookup took {elapsed*1000:.1f}ms (max 50ms)"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
