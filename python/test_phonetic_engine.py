"""
test_phonetic_engine.py — Unit tests for the phonetic analysis engine.

Run with: python -m pytest test_phonetic_engine.py -v
"""

import pytest
from phonetic_engine import (
    tokenize_text,
    get_phonemes,
    count_syllables_from_phones,
    count_syllables_for_word,
    get_stress_pattern,
    find_rhymes,
    find_assonance,
    find_alliteration,
    find_cascades,
    _build_word_infos,
    _get_rhyme_tail,
    _rhyme_similarity,
    clean_word,
    analyze,
    # Phase 2-3
    build_phoneme_vectors,
    find_phoneme_patterns,
    # Phase 4
    detect_anaphora,
    compare_syllable_symmetry,
    suggest_cascade_expansions,
    detect_sections,
    cluster_lines_by_devices,
    find_pattern_regularity,
    _phoneme_to_id,
)


# ---------------------------------------------------------------------------
# Tokenization
# ---------------------------------------------------------------------------

class TestTokenize:
    def test_basic(self):
        text = "Hello world\nFoo bar"
        lines = tokenize_text(text)
        assert len(lines) == 2
        assert lines[0]["id"] == 0
        assert lines[0]["text"] == "Hello world"
        assert len(lines[0]["words"]) == 2
        assert lines[0]["words"][0]["clean"] == "Hello"

    def test_punctuation_stripping(self):
        assert clean_word("hello,") == "hello"
        assert clean_word('"test"') == "test"
        assert clean_word("\u201chello\u201d") == "hello"
        assert clean_word("don't") == "don't"

    def test_empty_lines(self):
        text = "Line one\n\nLine three"
        lines = tokenize_text(text)
        assert len(lines) == 3
        assert lines[1]["text"] == ""
        assert lines[1]["words"] == []


# ---------------------------------------------------------------------------
# Phoneme lookup
# ---------------------------------------------------------------------------

class TestPhonemes:
    def test_known_word(self):
        phones = get_phonemes("hello")
        assert phones is not None
        assert len(phones) > 0

    def test_unknown_word(self):
        phones = get_phonemes("xyzzyplugh")
        assert phones is None

    def test_case_insensitive(self):
        phones_lower = get_phonemes("mountain")
        phones_upper = get_phonemes("Mountain")
        assert phones_lower == phones_upper

    def test_with_punctuation(self):
        phones = get_phonemes("hello,")
        assert phones is not None


# ---------------------------------------------------------------------------
# Syllable counting
# ---------------------------------------------------------------------------

class TestSyllables:
    def test_mountain(self):
        phones = get_phonemes("mountain")
        assert phones is not None
        assert count_syllables_from_phones(phones) == 2

    def test_electric(self):
        phones = get_phonemes("electric")
        assert phones is not None
        assert count_syllables_from_phones(phones) == 3

    def test_monosyllabic(self):
        phones = get_phonemes("cat")
        assert phones is not None
        assert count_syllables_from_phones(phones) == 1

    def test_word_function(self):
        assert count_syllables_for_word("mountain") == 2
        assert count_syllables_for_word("electric") == 3
        assert count_syllables_for_word("cat") == 1


# ---------------------------------------------------------------------------
# Stress patterns
# ---------------------------------------------------------------------------

class TestStress:
    def test_basic(self):
        phones = get_phonemes("electric")
        assert phones is not None
        pattern = get_stress_pattern(phones)
        assert len(pattern) == 3  # 3 syllables
        assert all(s in (0, 1, 2) for s in pattern)

    def test_monosyllabic_stress(self):
        phones = get_phonemes("cat")
        assert phones is not None
        pattern = get_stress_pattern(phones)
        assert len(pattern) == 1


# ---------------------------------------------------------------------------
# Rhyme detection
# ---------------------------------------------------------------------------

class TestRhymes:
    def _make_word_infos(self, words: list[str]) -> list[dict]:
        """Helper: build word_infos from a flat list of words."""
        infos = []
        for i, w in enumerate(words):
            phones = get_phonemes(w)
            infos.append({
                "line_idx": i,  # Each word on its own "line" for simplicity
                "word_idx": 0,
                "text": w,
                "clean": w,
                "phones": phones,
                "pos": None,
            })
        return infos

    def test_perfect_rhyme(self):
        infos = self._make_word_infos(["cat", "hat", "dog"])
        rhymes = find_rhymes(infos)
        # cat and hat should be in the same group
        cat_hat_group = None
        for g in rhymes:
            members = {w["lineIndex"] for w in g["words"]}
            if 0 in members and 1 in members:
                cat_hat_group = g
                break
        assert cat_hat_group is not None, "cat/hat should rhyme"

    def test_flame_blame_same(self):
        infos = self._make_word_infos(["flame", "blame", "same"])
        rhymes = find_rhymes(infos)
        # All three should be in one group
        assert len(rhymes) >= 1
        biggest = max(rhymes, key=lambda g: len(g["words"]))
        assert len(biggest["words"]) == 3

    def test_non_rhyme(self):
        infos = self._make_word_infos(["cat", "tree"])
        rhymes = find_rhymes(infos)
        # These should NOT be grouped
        for g in rhymes:
            members = {w["lineIndex"] for w in g["words"]}
            assert not (0 in members and 1 in members), "cat/tree should not rhyme"

    def test_rhyme_similarity_perfect(self):
        tail_a = get_phonemes("cat")
        tail_b = get_phonemes("hat")
        if tail_a and tail_b:
            rt_a = _get_rhyme_tail(tail_a)
            rt_b = _get_rhyme_tail(tail_b)
            rtype, score = _rhyme_similarity(rt_a, rt_b)
            assert score >= 0.9
            assert rtype in ("perfect",)


# ---------------------------------------------------------------------------
# Assonance detection
# ---------------------------------------------------------------------------

class TestAssonance:
    def test_long_i_sound(self):
        """Words like 'light', 'fire', 'high', 'eye' share AY vowel."""
        words = ["light", "fire", "high", "eye", "cat", "dog"]
        infos = []
        for i, w in enumerate(words):
            phones = get_phonemes(w)
            infos.append({
                "line_idx": i,
                "word_idx": 0,
                "text": w,
                "clean": w,
                "phones": phones,
                "pos": None,
            })
        groups = find_assonance(infos, min_group_size=2)
        # There should be a group with AY vowel containing light, fire, high, eye
        ay_group = None
        for g in groups:
            if "AY" in g["id"].upper() or "Long I" in g.get("name", ""):
                ay_group = g
                break
        assert ay_group is not None, "Should find AY/Long I assonance group"
        member_lines = {w["lineIndex"] for w in ay_group["words"]}
        # At least light(0), high(2), eye(3) should be there
        assert 0 in member_lines or 2 in member_lines


# ---------------------------------------------------------------------------
# Alliteration detection
# ---------------------------------------------------------------------------

class TestAlliteration:
    def test_b_alliteration(self):
        """'bowed', 'back', 'bent' all start with B."""
        words = ["bowed", "back", "bent", "cat", "dog"]
        infos = []
        for i, w in enumerate(words):
            phones = get_phonemes(w)
            infos.append({
                "line_idx": i,
                "word_idx": 0,
                "text": w,
                "clean": w,
                "phones": phones,
                "pos": None,
            })
        groups = find_alliteration(infos, min_group_size=3)
        b_group = None
        for g in groups:
            if "b" in g["id"].lower():
                b_group = g
                break
        assert b_group is not None, "Should find B alliteration group"
        assert len(b_group["words"]) >= 3


# ---------------------------------------------------------------------------
# Cascade detection
# ---------------------------------------------------------------------------

class TestCascades:
    def test_drip_drop_drape(self):
        """'drip', 'drop', 'drape' share DR_P consonant frame with shifting vowel."""
        words = ["drip", "drop", "drape"]
        infos = []
        for i, w in enumerate(words):
            phones = get_phonemes(w)
            infos.append({
                "line_idx": i,
                "word_idx": 0,
                "text": w,
                "clean": w,
                "phones": phones,
                "pos": None,
            })
        cascades = find_cascades(infos, min_cascade_length=2)
        assert len(cascades) >= 1, "Should detect drip/drop/drape cascade"


# ---------------------------------------------------------------------------
# Phase 2: Phoneme Vectors
# ---------------------------------------------------------------------------

class TestPhonemeVectors:
    def _make_word_infos(self, words):
        infos = []
        for i, w in enumerate(words):
            phones = get_phonemes(w)
            infos.append({
                "line_idx": 0, "word_idx": i,
                "text": w, "clean": w, "phones": phones, "pos": None,
            })
        return infos

    def test_vector_structure(self):
        infos = self._make_word_infos(["cat", "hat"])
        vectors = build_phoneme_vectors(infos)
        assert len(vectors) > 0
        v = vectors[0]
        assert "abs_pos" in v
        assert "line" in v
        assert "word" in v
        assert "phoneme" in v
        assert "phoneme_id" in v
        assert "is_vowel" in v
        assert "stress" in v or v["stress"] is None

    def test_absolute_positions_monotonic(self):
        infos = self._make_word_infos(["hello", "world"])
        vectors = build_phoneme_vectors(infos)
        positions = [v["abs_pos"] for v in vectors]
        assert positions == sorted(positions)
        assert len(set(positions)) == len(positions), "positions should be unique"

    def test_phoneme_id_mapping(self):
        assert _phoneme_to_id("AH1") == 2  # AH → 2
        assert _phoneme_to_id("K") == 23
        assert _phoneme_to_id("ZZZZZ") == -1  # unknown

    def test_vowel_detection(self):
        infos = self._make_word_infos(["cat"])
        vectors = build_phoneme_vectors(infos)
        vowels = [v for v in vectors if v["is_vowel"]]
        consonants = [v for v in vectors if not v["is_vowel"]]
        assert len(vowels) >= 1, "cat has at least one vowel"
        assert len(consonants) >= 1, "cat has at least one consonant"


# ---------------------------------------------------------------------------
# Phase 2: Pattern Recognition
# ---------------------------------------------------------------------------

class TestPatternRecognition:
    def test_repeated_sequence(self):
        """A repeated phrase should produce pattern matches."""
        text = "blame flame\nblame flame"
        result = analyze(text)
        # We should find at least one repeating pattern
        assert len(result["patterns"]) > 0

    def test_no_patterns_short(self):
        """Very short input shouldn't crash pattern recognition."""
        text = "hi"
        result = analyze(text)
        assert "patterns" in result


# ---------------------------------------------------------------------------
# Phase 2: Section Detection
# ---------------------------------------------------------------------------

class TestSectionDetection:
    def test_auto_detect_from_blanks(self):
        lines = tokenize_text("line one\nline two\n\nline four\nline five")
        sections = detect_sections(lines)
        assert len(sections) == 2
        assert sections[0]["start_line"] == 0
        assert sections[0]["end_line"] == 1
        assert sections[1]["start_line"] == 3
        assert sections[1]["end_line"] == 4

    def test_explicit_labels(self):
        lines = tokenize_text("line one\nline two\n\nline four")
        sections = detect_sections(lines, labels=["verse", "chorus"])
        assert sections[0]["label"] == "verse"
        assert sections[1]["label"] == "chorus"

    def test_single_section(self):
        lines = tokenize_text("line one\nline two\nline three")
        sections = detect_sections(lines)
        assert len(sections) == 1
        assert sections[0]["line_count"] == 3


# ---------------------------------------------------------------------------
# Phase 3: Device Clustering
# ---------------------------------------------------------------------------

class TestDeviceClustering:
    def test_line_devices_structure(self):
        text = "flame blame same\ncat hat bat\n\ndog log fog"
        result = analyze(text)
        line_devices = result["line_devices"]
        assert len(line_devices) > 0
        ld = line_devices[0]
        assert "line_id" in ld
        assert "devices" in ld
        assert "device_count" in ld
        assert "device_density" in ld

    def test_density_calculation(self):
        text = "flame blame same"
        result = analyze(text)
        ld = result["line_devices"][0]
        # Line with rhyming words should have devices
        assert ld["device_count"] > 0
        assert 0 < ld["device_density"] <= 10  # reasonable range


# ---------------------------------------------------------------------------
# Phase 3: Pattern Regularity
# ---------------------------------------------------------------------------

class TestPatternRegularity:
    def test_regularity_output(self):
        # Multi-section text with repeating patterns
        text = ("cat hat\ndog log\n\n"
                "bat sat\nfog jog\n\n"
                "mat flat\nhog bog")
        result = analyze(text)
        assert "regularity" in result
        # Should be a list (may be empty for short text)
        assert isinstance(result["regularity"], list)


# ---------------------------------------------------------------------------
# Full pipeline integration
# ---------------------------------------------------------------------------

class TestFullPipeline:
    def test_cougar_excerpt(self):
        """Test on a short excerpt from the Cougar lyrics."""
        text = """When the owls woke, rustling the leaves
Giant moon rose between the mountains
You sung a foggy crystal fountain
You told me where there's smoke, there's flame
But cold breath ain't the same thing"""
        result = analyze(text)

        # Check Phase 1 structure
        assert "lines" in result
        assert "rhymes" in result
        assert "assonance" in result
        assert "alliteration" in result
        assert "cascades" in result

        # Check Phase 2-3 structure
        assert "phoneme_vectors" in result
        assert "patterns" in result
        assert "sections" in result
        assert "line_devices" in result
        assert "regularity" in result

        # Check line count
        assert len(result["lines"]) == 5

        # Check syllable counts are reasonable (non-zero for non-empty lines)
        for line in result["lines"]:
            if line["text"].strip():
                assert line["syllables"] > 0, f"Line '{line['text']}' has 0 syllables"

        # mountains/fountain should rhyme
        rhyme_names = [g["name"] for g in result["rhymes"]]
        found_mountain_fountain = any(
            "mountain" in n and "fountain" in n
            for n in rhyme_names
        )
        assert found_mountain_fountain, (
            f"mountains/fountain should be detected as rhyming. "
            f"Found rhyme groups: {rhyme_names}"
        )

        # Phoneme vectors should exist and have correct structure
        assert len(result["phoneme_vectors"]) > 0
        assert result["phoneme_vectors"][0]["abs_pos"] == 0

        # Single section (no blank lines in excerpt)
        assert len(result["sections"]) == 1

    def test_empty_input(self):
        result = analyze("")
        assert result["lines"] == [{"id": 0, "text": "", "words": [], "syllables": 0}]

    def test_single_word(self):
        result = analyze("hello")
        assert len(result["lines"]) == 1
        assert result["lines"][0]["syllables"] == 2

    def test_section_labels(self):
        """Test analyze with explicit section labels."""
        text = "line one\nline two\n\nline four"
        result = analyze(text, section_labels=["verse", "chorus"])
        assert len(result["sections"]) == 2
        assert result["sections"][0]["label"] == "verse"
        assert result["sections"][1]["label"] == "chorus"


# ---------------------------------------------------------------------------
# Anaphora Detection (Phase 4)
# ---------------------------------------------------------------------------

class TestAnaphora:
    def test_detects_exact_duplicates(self):
        lines = [
            {"id": 0, "text": "Hello world", "words": []},
            {"id": 1, "text": "Something different", "words": []},
            {"id": 2, "text": "Hello world", "words": []},
        ]
        ana = detect_anaphora(lines)
        assert len(ana) == 1
        assert ana[0]["line_ids"] == [0, 2]
        assert ana[0]["normalized"] == "hello world"

    def test_normalizes_punctuation(self):
        lines = [
            {"id": 0, "text": "Don't you know?", "words": []},
            {"id": 1, "text": "don't you know", "words": []},
        ]
        ana = detect_anaphora(lines)
        assert len(ana) == 1
        assert ana[0]["count"] == 2

    def test_no_anaphora_for_unique_lines(self):
        lines = [
            {"id": 0, "text": "Line one", "words": []},
            {"id": 1, "text": "Line two", "words": []},
        ]
        ana = detect_anaphora(lines)
        assert len(ana) == 0


# ---------------------------------------------------------------------------
# Syllable Symmetry (Phase 4)
# ---------------------------------------------------------------------------

class TestSyllableSymmetry:
    def test_detects_mismatches(self):
        lines = [
            {"id": 0, "text": "a", "words": [], "syllables": 8},
            {"id": 1, "text": "b", "words": [], "syllables": 6},
            {"id": 2, "text": "c", "words": [], "syllables": 5},
            {"id": 3, "text": "d", "words": [], "syllables": 6},
        ]
        sections = [
            {"id": 0, "label": "verse-1", "start_line": 0, "end_line": 1},
            {"id": 1, "label": "verse-2", "start_line": 2, "end_line": 3},
        ]
        mismatches = compare_syllable_symmetry(sections, lines)
        assert len(mismatches) > 0
        # Position 0: 8 vs 5, delta=3
        pos0 = next(m for m in mismatches if m["position"] == 0)
        assert pos0["delta"] == 3

    def test_no_mismatches_when_equal(self):
        lines = [
            {"id": 0, "text": "a", "words": [], "syllables": 8},
            {"id": 1, "text": "b", "words": [], "syllables": 8},
        ]
        sections = [
            {"id": 0, "label": "verse-1", "start_line": 0, "end_line": 0},
            {"id": 1, "label": "verse-2", "start_line": 1, "end_line": 1},
        ]
        mismatches = compare_syllable_symmetry(sections, lines)
        assert len(mismatches) == 0

    def test_single_section_no_comparison(self):
        lines = [{"id": 0, "text": "a", "words": [], "syllables": 8}]
        sections = [{"id": 0, "label": "verse-1", "start_line": 0, "end_line": 0}]
        assert compare_syllable_symmetry(sections, lines) == []


# ---------------------------------------------------------------------------
# Cascade Expansion (Phase 4)
# ---------------------------------------------------------------------------

class TestCascadeExpansion:
    def test_suggests_new_vowels(self):
        word_infos = [
            {"line_idx": 0, "word_idx": 0, "clean": "drip",
             "phones": ["D", "R", "IH1", "P"]},
            {"line_idx": 1, "word_idx": 0, "clean": "drop",
             "phones": ["D", "R", "AA1", "P"]},
        ]
        cascades = [{
            "id": "cascade-0", "name": "drip/drop",
            "words": [
                {"lineIndex": 0, "wordIndex": 0},
                {"lineIndex": 1, "wordIndex": 0},
            ],
        }]
        result = suggest_cascade_expansions(cascades, word_infos)
        assert len(result) > 0
        # Should suggest words with vowels other than IH and AA
        existing = set(result[0]["existing_vowels"])
        for s in result[0]["suggestions"]:
            assert s["vowel"] not in existing

    def test_empty_cascades(self):
        assert suggest_cascade_expansions([], []) == []


# ---------------------------------------------------------------------------
# Full Pipeline Phase 4 Output
# ---------------------------------------------------------------------------

class TestPhase4Output:
    def test_analyze_includes_phase4_keys(self):
        result = analyze("hello world")
        assert "anaphora" in result
        assert "syllable_symmetry" in result
        assert "suggestions" in result
        assert "cascade_suggestions" in result

    def test_line_devices_have_adjusted_density(self):
        result = analyze("hello world")
        for ld in result["line_devices"]:
            assert "adjusted_density" in ld
            assert "is_repeated" in ld


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

