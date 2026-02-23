"""
phonetic_engine.py — Pure Python phonetic analysis engine.

Deterministic analysis of text for rhyme, assonance, alliteration,
vowel cascades, syllable counts, and stress patterns using CMUDict
and spaCy. No LLM dependency.

Designed to scale from song lyrics to manuscript-length documents.
"""

import re
import string
from collections import defaultdict
from itertools import combinations
from typing import Optional

import pronouncing
import spacy

# ---------------------------------------------------------------------------
# Module-level setup
# ---------------------------------------------------------------------------

# Lazy-load spaCy model
_nlp = None

def _get_nlp():
    """Lazy-load the spaCy model so import is fast and tests can mock it."""
    global _nlp
    if _nlp is None:
        try:
            _nlp = spacy.load("en_core_web_sm")
        except OSError:
            # Fallback: if model isn't installed, return None and we skip POS
            _nlp = False  # sentinel: tried and failed
    return _nlp if _nlp is not False else None


# CMUDict vowels are phonemes containing a digit (stress marker 0, 1, or 2)
_VOWEL_RE = re.compile(r"[AEIOU]")
_STRESS_RE = re.compile(r"[012]")

# ARPAbet consonant categories for "family rhyme" detection
_CONSONANT_FAMILIES = {
    # Stops
    "P": "stop", "B": "stop", "T": "stop", "D": "stop",
    "K": "stop", "G": "stop",
    # Fricatives
    "F": "fricative", "V": "fricative", "TH": "fricative", "DH": "fricative",
    "S": "fricative", "Z": "fricative", "SH": "fricative", "ZH": "fricative",
    "HH": "fricative",
    # Affricates
    "CH": "affricate", "JH": "affricate",
    # Nasals
    "M": "nasal", "N": "nasal", "NG": "nasal",
    # Liquids
    "L": "liquid", "R": "liquid",
    # Glides
    "W": "glide", "Y": "glide",
}


# ---------------------------------------------------------------------------
# Heteronym map: word → {POS_tag: ARPAbet phones string}
# Only words where pronunciation genuinely differs by POS.
# ---------------------------------------------------------------------------

_HETERONYMS = {
    "tear": {
        "NN": "T EH1 R",     # a tear (rip)
        "VB": "T EH1 R",     # to tear (rip) — same sound
        # The "teardrop" sense:
        "NN_cry": "T IH1 R",
    },
    "read": {
        "VB": "R IY1 D",     # present tense
        "VBD": "R EH1 D",    # past tense
        "VBN": "R EH1 D",    # past participle
    },
    "lead": {
        "VB": "L IY1 D",
        "NN": "L EH1 D",     # the metal
    },
    "wind": {
        "NN": "W IH1 N D",   # breeze
        "VB": "W AY1 N D",   # to wind up
    },
    "bow": {
        "NN": "B OW1",       # ribbon bow
        "VB": "B AW1",       # to bow down
    },
    "close": {
        "VB": "K L OW1 Z",
        "JJ": "K L OW1 S",   # close (near)
    },
    "live": {
        "VB": "L IH1 V",
        "JJ": "L AY1 V",     # live performance
    },
    "bass": {
        "NN_fish": "B AE1 S",
        "NN_music": "B EY1 S",
    },
    "wound": {
        "NN": "W UW1 N D",   # an injury
        "VBD": "W AW1 N D",  # past tense of "wind"
    },
    "dove": {
        "NN": "D AH1 V",     # the bird
        "VBD": "D OW1 V",    # past tense of "dive"
    },
    "minute": {
        "NN": "M IH1 N AH0 T",
        "JJ": "M AY0 N UW1 T",  # tiny
    },
    "present": {
        "NN": "P R EH1 Z AH0 N T",
        "VB": "P R IH0 Z EH1 N T",
    },
    "record": {
        "NN": "R EH1 K ER0 D",
        "VB": "R IH0 K AO1 R D",
    },
    "object": {
        "NN": "AA1 B JH EH0 K T",
        "VB": "AH0 B JH EH1 K T",
    },
    "desert": {
        "NN": "D EH1 Z ER0 T",
        "VB": "D IH0 Z ER1 T",
    },
    "produce": {
        "NN": "P R OW1 D UW0 S",
        "VB": "P R AH0 D UW1 S",
    },
    "refuse": {
        "NN": "R EH1 F Y UW0 Z",
        "VB": "R IH0 F Y UW1 Z",
    },
    "content": {
        "NN": "K AA1 N T EH0 N T",
        "JJ": "K AH0 N T EH1 N T",
    },
    "project": {
        "NN": "P R AA1 JH EH0 K T",
        "VB": "P R AH0 JH EH1 K T",
    },
    "contest": {
        "NN": "K AA1 N T EH0 S T",
        "VB": "K AH0 N T EH1 S T",
    },
    "contract": {
        "NN": "K AA1 N T R AE2 K T",
        "VB": "K AH0 N T R AE1 K T",
    },
    "permit": {
        "NN": "P ER1 M IH0 T",
        "VB": "P ER0 M IH1 T",
    },
}


# ---------------------------------------------------------------------------
# Tokenization
# ---------------------------------------------------------------------------

def clean_word(word: str) -> str:
    """Strip punctuation from a word for phonetic lookup."""
    return word.strip(string.punctuation + "\u201c\u201d\u2018\u2019\u2014\u2013")


def tokenize_text(text: str) -> list[dict]:
    """
    Split text into lines, each line into words.

    Returns a list of line dicts:
        [{"id": 0, "text": "...", "words": [{"index": 0, "text": "When", "clean": "When"}, ...]}, ...]
    """
    lines = text.split("\n")
    result = []
    for i, line in enumerate(lines):
        raw_words = line.split()
        words = []
        for j, w in enumerate(raw_words):
            words.append({
                "index": j,
                "text": w,
                "clean": clean_word(w),
            })
        result.append({
            "id": i,
            "text": line,
            "words": words,
        })
    return result


# ---------------------------------------------------------------------------
# Phoneme lookup
# ---------------------------------------------------------------------------

def get_pos_tags(text: str) -> dict[int, list[str]]:
    """
    Run spaCy on the full text and return a mapping of
    (line_index, word_index) → POS tag for each token.

    Falls back to empty dict if spaCy is unavailable.
    """
    nlp = _get_nlp()
    if nlp is None:
        return {}

    doc = nlp(text)
    # Build a mapping from (char offset) → POS tag
    offset_to_pos = {}
    for token in doc:
        offset_to_pos[token.idx] = token.pos_  # Universal POS: NOUN, VERB, ADJ, etc.

    return offset_to_pos


def _universal_pos_to_penn(upos: str) -> str:
    """Convert universal POS to Penn Treebank tag (rough mapping for heteronym lookup)."""
    mapping = {
        "NOUN": "NN",
        "VERB": "VB",
        "ADJ": "JJ",
        "ADV": "RB",
        "PROPN": "NNP",
    }
    return mapping.get(upos, upos)


def get_phonemes(word: str, pos_tag: Optional[str] = None) -> Optional[list[str]]:
    """
    Look up ARPAbet phonemes for a word.

    Args:
        word: The word to look up (will be lowercased).
        pos_tag: Optional POS tag (Penn Treebank style) for heteronym disambiguation.

    Returns:
        List of ARPAbet phoneme strings, or None if word not in CMUDict.
    """
    clean = clean_word(word).lower()
    if not clean:
        return None

    # Check heteronym map first
    if clean in _HETERONYMS and pos_tag:
        het_map = _HETERONYMS[clean]
        # Try exact POS match
        if pos_tag in het_map:
            return het_map[pos_tag].split()
        # Try base POS (VBD → VB, NNS → NN, etc.)
        base_pos = pos_tag[:2]
        if base_pos in het_map:
            return het_map[base_pos].split()

    # Standard CMUDict lookup
    phones_list = pronouncing.phones_for_word(clean)
    if phones_list:
        return phones_list[0].split()

    return None


# ---------------------------------------------------------------------------
# Syllable counting & stress
# ---------------------------------------------------------------------------

def count_syllables_from_phones(phones: list[str]) -> int:
    """Count syllables by counting vowel phonemes (those with stress markers)."""
    return sum(1 for p in phones if any(c.isdigit() for c in p))


def get_stress_pattern(phones: list[str]) -> list[int]:
    """
    Extract stress pattern from phonemes.
    Returns list of stress values (0=unstressed, 1=primary, 2=secondary).
    """
    pattern = []
    for p in phones:
        for c in p:
            if c.isdigit():
                pattern.append(int(c))
    return pattern


def count_syllables_for_word(word: str, pos_tag: Optional[str] = None) -> int:
    """Count syllables for a single word. Falls back to vowel-counting heuristic."""
    phones = get_phonemes(word, pos_tag)
    if phones:
        return count_syllables_from_phones(phones)
    # Heuristic fallback for words not in CMUDict
    return _heuristic_syllable_count(clean_word(word).lower())


def _heuristic_syllable_count(word: str) -> int:
    """Rough syllable count for words not in CMUDict."""
    if not word:
        return 0
    # Count vowel groups
    count = len(re.findall(r'[aeiouy]+', word))
    # Subtract silent e
    if word.endswith('e') and count > 1:
        count -= 1
    # Words like "the" should be at least 1
    return max(count, 1) if word else 0


# ---------------------------------------------------------------------------
# Phoneme extraction helpers
# ---------------------------------------------------------------------------

def _get_vowel_phonemes(phones: list[str]) -> list[str]:
    """Extract just the vowel phonemes (with stress markers)."""
    return [p for p in phones if any(c.isdigit() for c in p)]


def _get_vowel_nucleus(phone: str) -> str:
    """Strip stress marker from a vowel phoneme: 'AH1' -> 'AH'."""
    return re.sub(r'[012]', '', phone)


def _get_stressed_vowels(phones: list[str]) -> list[str]:
    """Get vowels with primary or secondary stress."""
    return [p for p in phones if '1' in p or '2' in p]


def _get_rhyme_tail(phones: list[str]) -> Optional[list[str]]:
    """
    Get the "rhyme tail" — everything from the last stressed vowel onward.
    This is the core of rhyme detection.
    """
    # Find last stressed vowel
    last_stressed_idx = None
    for i, p in enumerate(phones):
        if '1' in p or '2' in p:
            last_stressed_idx = i
    if last_stressed_idx is None:
        # No stress found; use all vowels
        for i, p in enumerate(phones):
            if any(c.isdigit() for c in p):
                last_stressed_idx = i
    if last_stressed_idx is None:
        return None
    return phones[last_stressed_idx:]


def _get_initial_consonants(phones: list[str]) -> list[str]:
    """Get consonant phonemes before the first vowel."""
    result = []
    for p in phones:
        if any(c.isdigit() for c in p):
            break
        result.append(p)
    return result


# ---------------------------------------------------------------------------
# Analysis builders — each works over a flat list of "word info" dicts
# ---------------------------------------------------------------------------

def _build_word_infos(lines: list[dict], text: str) -> list[dict]:
    """
    Build a flat list of word info dicts with phoneme data.
    Runs spaCy once on the full text for POS tagging.

    Each entry: {
        "line_idx": int, "word_idx": int,
        "text": str, "clean": str,
        "phones": list[str] | None,
        "pos": str | None,
    }
    """
    nlp = _get_nlp()
    pos_map = {}  # (line_idx, word_idx) → universal POS

    if nlp:
        doc = nlp(text)
        # Align spaCy tokens back to our word indices
        # Strategy: walk through our lines/words and match by character offset
        char_offset = 0
        spacy_idx = 0
        for line in lines:
            line_text = line["text"]
            word_offset = 0
            for word_info in line["words"]:
                w = word_info["text"]
                # Find this word in the line
                pos_in_line = line_text.find(w, word_offset)
                if pos_in_line == -1:
                    pos_in_line = word_offset
                abs_start = char_offset + pos_in_line

                # Find the spaCy token closest to this position
                best_tok = None
                best_dist = float('inf')
                for tok in doc:
                    dist = abs(tok.idx - abs_start)
                    if dist < best_dist:
                        best_dist = dist
                        best_tok = tok
                    if dist == 0:
                        break

                if best_tok and best_dist < len(w) + 2:
                    pos_map[(line["id"], word_info["index"])] = best_tok.pos_

                word_offset = pos_in_line + len(w)

            char_offset += len(line_text) + 1  # +1 for \n

    # Now build word_infos with phonemes
    word_infos = []
    for line in lines:
        for word in line["words"]:
            clean = word["clean"]
            if not clean:
                continue

            upos = pos_map.get((line["id"], word["index"]))
            penn_pos = _universal_pos_to_penn(upos) if upos else None
            phones = get_phonemes(clean, penn_pos)

            word_infos.append({
                "line_idx": line["id"],
                "word_idx": word["index"],
                "text": word["text"],
                "clean": clean,
                "phones": phones,
                "pos": upos,
            })

    return word_infos


# ---------------------------------------------------------------------------
# Rhyme detection
# ---------------------------------------------------------------------------

def _rhyme_similarity(tail_a: list[str], tail_b: list[str]) -> tuple[str, float]:
    """
    Compare two rhyme tails and return (rhyme_type, similarity_score).

    Returns:
        ("perfect", 1.0) — identical tails
        ("near", 0.5-0.9) — shared vowel nucleus, partial consonant match
        ("family", 0.3-0.5) — consonants from same family
        ("none", 0.0)
    """
    if not tail_a or not tail_b:
        return ("none", 0.0)

    # Strip stress markers for comparison
    strip_a = [re.sub(r'[012]', '', p) for p in tail_a]
    strip_b = [re.sub(r'[012]', '', p) for p in tail_b]

    # Perfect rhyme: identical tails (ignoring stress level)
    if strip_a == strip_b:
        return ("perfect", 1.0)

    # Check shared vowel nucleus
    vowels_a = [p for p in strip_a if _VOWEL_RE.match(p)]
    vowels_b = [p for p in strip_b if _VOWEL_RE.match(p)]

    if not vowels_a or not vowels_b:
        return ("none", 0.0)

    # Primary vowel match (the stressed vowel itself)
    if vowels_a[0] == vowels_b[0]:
        # Shared vowel nucleus → at least near rhyme
        # Score based on how many trailing consonants match
        cons_a = [p for p in strip_a if not _VOWEL_RE.match(p)]
        cons_b = [p for p in strip_b if not _VOWEL_RE.match(p)]

        if cons_a == cons_b:
            return ("perfect", 0.95)  # Same consonants, same vowel

        # Check for family consonants
        matching_cons = 0
        max_cons = max(len(cons_a), len(cons_b), 1)
        for ca, cb in zip(cons_a, cons_b):
            if ca == cb:
                matching_cons += 1
            elif (_CONSONANT_FAMILIES.get(ca) and
                  _CONSONANT_FAMILIES.get(ca) == _CONSONANT_FAMILIES.get(cb)):
                matching_cons += 0.5

        score = 0.5 + 0.4 * (matching_cons / max_cons)
        return ("near", score)

    # Check if vowels are "close" (e.g., AH/AE, IH/IY)
    vowel_families = {
        frozenset({"AH", "AE", "AA"}): "open",
        frozenset({"IH", "IY", "EY"}): "front_high",
        frozenset({"UH", "UW"}): "back_high",
        frozenset({"EH", "EY", "AE"}): "front_mid",
        frozenset({"AO", "OW", "AA"}): "back_mid",
    }

    v_a, v_b = vowels_a[0], vowels_b[0]
    for family_set, _ in vowel_families.items():
        if v_a in family_set and v_b in family_set:
            return ("near", 0.4)

    # Family rhyme: consonants in same phonetic family
    cons_a = [p for p in strip_a if not _VOWEL_RE.match(p)]
    cons_b = [p for p in strip_b if not _VOWEL_RE.match(p)]

    if cons_a and cons_b:
        family_matches = sum(
            1 for ca, cb in zip(cons_a, cons_b)
            if _CONSONANT_FAMILIES.get(ca) and
               _CONSONANT_FAMILIES.get(ca) == _CONSONANT_FAMILIES.get(cb)
        )
        if family_matches > 0:
            return ("family", 0.3)

    return ("none", 0.0)


# Common function words to exclude from rhyme analysis (they create noise)
_RHYME_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "it", "its", "be", "am", "are",
    "was", "were", "has", "had", "do", "did", "will", "if", "so", "as",
    "that", "this", "he", "she", "we", "they", "me", "him", "her", "us",
    "them", "my", "his", "our", "your", "their", "who", "which", "what",
}


def find_rhymes(word_infos: list[dict], min_group_size: int = 2) -> list[dict]:
    """
    Find rhyme groups across all words.

    Uses direct grouping by normalized rhyme tail rather than transitive
    union-find clustering. This prevents "chain" effects where A→B and B→C
    cause A, B, and C to be grouped even when A and C don't truly rhyme.

    Returns list of PhoneticGroup dicts:
        [{"id": "rhyme-0", "name": "flame/blame/same", "words": [...]}, ...]
    """
    # Build rhyme tails for content words that have phonemes
    tailed = []
    for wi in word_infos:
        if not wi["phones"]:
            continue
        # Skip function words
        if wi["clean"].lower() in _RHYME_STOPWORDS:
            continue
        tail = _get_rhyme_tail(wi["phones"])
        if tail:
            tailed.append((wi, tail))

    # Group by normalized rhyme tail (strip stress markers)
    tail_groups = defaultdict(list)
    for wi, tail in tailed:
        # Normalize: strip stress markers from each phoneme
        norm_tail = tuple(re.sub(r'[012]', '', p) for p in tail)
        tail_groups[norm_tail].append(wi)

    # Build ALL groups first (including singletons), then merge, then filter
    all_groups = []  # list of (norm_tail, [word_infos])

    for norm_tail, members in tail_groups.items():
        # Deduplicate by position
        seen_positions = set()
        unique_members = []
        for m in members:
            pos = (m["line_idx"], m["word_idx"])
            if pos not in seen_positions:
                seen_positions.add(pos)
                unique_members.append(m)
        if unique_members:
            all_groups.append((norm_tail, unique_members))

    # Merge pass: merge groups with similar rhyme tails (near rhymes)
    # Build a representative tail (with stress) for each group
    group_tails = []
    for norm_tail, members in all_groups:
        # Find the original tailed entry for the first member
        rep_tail = None
        for wi, tail in tailed:
            if (wi["line_idx"] == members[0]["line_idx"] and
                wi["word_idx"] == members[0]["word_idx"]):
                rep_tail = tail
                break
        group_tails.append(rep_tail)

    merged_groups = []
    used = set()
    for i, (nt1, members1) in enumerate(all_groups):
        if i in used:
            continue
        current_members = list(members1)
        for j, (nt2, members2) in enumerate(all_groups):
            if j <= i or j in used:
                continue
            # Check rhyme similarity between group representatives
            if group_tails[i] and group_tails[j]:
                _, score = _rhyme_similarity(group_tails[i], group_tails[j])
                if score >= 0.75:
                    current_members.extend(members2)
                    used.add(j)
        merged_groups.append(current_members)
        used.add(i)

    # Final pass: filter by min_group_size and build output
    result = []
    group_id = 0
    for members in merged_groups:
        if len(members) < min_group_size:
            continue

        # Skip groups where all members are the exact same word and appear < 3 times
        distinct_words = set(m["clean"].lower() for m in members)
        if len(distinct_words) < 2 and len(members) < 3:
            continue

        name = "/".join(sorted(distinct_words))
        result.append({
            "id": f"rhyme-{group_id}",
            "name": name,
            "words": [
                {"lineIndex": m["line_idx"], "wordIndex": m["word_idx"]}
                for m in members
            ],
        })
        group_id += 1

    return result


# ---------------------------------------------------------------------------
# Assonance detection
# ---------------------------------------------------------------------------

def find_assonance(word_infos: list[dict], min_group_size: int = 2) -> list[dict]:
    """
    Find assonance groups — words sharing stressed vowel sounds.

    Groups by the nucleus of the primary stressed vowel.
    """
    vowel_groups = defaultdict(list)

    for wi in word_infos:
        if not wi["phones"]:
            continue
        stressed = _get_stressed_vowels(wi["phones"])
        if not stressed:
            continue
        # Use the primary stressed vowel (stress=1)
        primary = None
        for sv in stressed:
            if '1' in sv:
                primary = sv
                break
        if primary is None:
            primary = stressed[0]

        nucleus = _get_vowel_nucleus(primary)
        vowel_groups[nucleus].append(wi)

    # Build output
    result = []
    # Human-readable vowel names
    vowel_names = {
        "AA": "Open A (father)", "AE": "Flat A (cat)", "AH": "Schwa/Uh (but)",
        "AO": "Open O (law)", "AW": "Ow (cow)", "AY": "Long I (eye)",
        "EH": "Short E (bed)", "ER": "R-colored (bird)", "EY": "Long A (say)",
        "IH": "Short I (bit)", "IY": "Long E (see)", "OW": "Long O (go)",
        "OY": "Oy (boy)", "UH": "Short U (book)", "UW": "Long U (blue)",
    }

    for vowel, members in vowel_groups.items():
        if len(members) < min_group_size:
            continue
        # Deduplicate by position (same word in same position)
        seen = set()
        unique_members = []
        for m in members:
            key = (m["line_idx"], m["word_idx"])
            if key not in seen:
                seen.add(key)
                unique_members.append(m)
        if len(unique_members) < min_group_size:
            continue

        name = vowel_names.get(vowel, vowel)
        result.append({
            "id": f"assonance-{vowel.lower()}",
            "name": name,
            "words": [
                {"lineIndex": m["line_idx"], "wordIndex": m["word_idx"]}
                for m in unique_members
            ],
        })

    return result


# ---------------------------------------------------------------------------
# Alliteration detection
# ---------------------------------------------------------------------------

def find_alliteration(word_infos: list[dict], min_group_size: int = 3) -> list[dict]:
    """
    Find alliteration groups — words sharing initial consonant sounds.
    """
    initial_groups = defaultdict(list)

    for wi in word_infos:
        if not wi["phones"]:
            continue
        initials = _get_initial_consonants(wi["phones"])
        if initials:
            key = initials[0]  # Primary initial consonant
            initial_groups[key].append(wi)

    result = []
    for consonant, members in initial_groups.items():
        if len(members) < min_group_size:
            continue
        # Deduplicate
        seen = set()
        unique_members = []
        for m in members:
            key = (m["line_idx"], m["word_idx"])
            if key not in seen:
                seen.add(key)
                unique_members.append(m)
        if len(unique_members) < min_group_size:
            continue

        result.append({
            "id": f"alliteration-{consonant.lower()}",
            "name": f"Initial /{consonant}/",
            "words": [
                {"lineIndex": m["line_idx"], "wordIndex": m["word_idx"]}
                for m in unique_members
            ],
        })

    return result


# ---------------------------------------------------------------------------
# Cascade (vowel morphing) detection
# ---------------------------------------------------------------------------

def find_cascades(word_infos: list[dict], min_cascade_length: int = 2) -> list[dict]:
    """
    Find vowel cascades — sequences where the consonant frame stays
    similar but the vowel shifts (drip/drop/drape, tick/tock/tack).

    Strategy: Group words by their consonant "skeleton", then check
    if the group contains distinct vowels (a cascade, not just assonance).
    """
    # Build consonant skeleton for each word
    skeleton_groups = defaultdict(list)

    for wi in word_infos:
        if not wi["phones"]:
            continue
        phones = wi["phones"]

        # Build skeleton: replace vowels with "_"
        skeleton_parts = []
        vowel_in_word = None
        for p in phones:
            stripped = re.sub(r'[012]', '', p)
            if _VOWEL_RE.match(stripped):
                skeleton_parts.append("_V_")
                vowel_in_word = stripped
            else:
                skeleton_parts.append(stripped)

        skeleton = " ".join(skeleton_parts)

        # Only consider words with at least one consonant and one vowel
        if "_V_" in skeleton and any(not _VOWEL_RE.match(re.sub(r'[012]', '', p)) for p in phones):
            vowels = [_get_vowel_nucleus(p) for p in phones if any(c.isdigit() for c in p)]
            skeleton_groups[skeleton].append({
                **wi,
                "vowels": vowels,
                "skeleton": skeleton,
            })

    result = []
    cascade_id = 0
    for skeleton, members in skeleton_groups.items():
        if len(members) < min_cascade_length:
            continue

        # Check that there are at least 2 distinct primary vowels
        primary_vowels = set()
        for m in members:
            if m["vowels"]:
                primary_vowels.add(m["vowels"][0])

        if len(primary_vowels) < 2:
            continue  # Same vowel = assonance, not cascade

        # Deduplicate
        seen = set()
        unique_members = []
        for m in members:
            key = (m["line_idx"], m["word_idx"])
            if key not in seen:
                seen.add(key)
                unique_members.append(m)

        if len(unique_members) < min_cascade_length:
            continue

        name = "/".join(m["clean"].lower() for m in unique_members[:5])
        if len(unique_members) > 5:
            name += "/..."

        result.append({
            "id": f"cascade-{cascade_id}",
            "name": name,
            "words": [
                {"lineIndex": m["line_idx"], "wordIndex": m["word_idx"]}
                for m in unique_members
            ],
        })
        cascade_id += 1

    return result


# ---------------------------------------------------------------------------
# Union-find for clustering
# ---------------------------------------------------------------------------

def _cluster_edges(n: int, edges: list[tuple]) -> list[list[int]]:
    """
    Given n items and edges (i, j, type, score), cluster using union-find.
    Returns a list of groups, each group is a list of item indices.
    """
    parent = list(range(n))
    rank = [0] * n

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        rx, ry = find(x), find(y)
        if rx == ry:
            return
        if rank[rx] < rank[ry]:
            rx, ry = ry, rx
        parent[ry] = rx
        if rank[rx] == rank[ry]:
            rank[rx] += 1

    for i, j, _, _ in edges:
        union(i, j)

    groups = defaultdict(list)
    for i in range(n):
        groups[find(i)].append(i)

    return list(groups.values())


# ---------------------------------------------------------------------------
# Phase 2: Phoneme Vector Representation
# ---------------------------------------------------------------------------

# Complete ARPAbet → numeric ID mapping (39 phonemes)
_PHONEME_TO_ID = {
    # Vowels (0-14)
    "AA": 0, "AE": 1, "AH": 2, "AO": 3, "AW": 4, "AY": 5,
    "EH": 6, "ER": 7, "EY": 8, "IH": 9, "IY": 10, "OW": 11,
    "OY": 12, "UH": 13, "UW": 14,
    # Consonants (15-38)
    "B": 15, "CH": 16, "D": 17, "DH": 18, "F": 19, "G": 20,
    "HH": 21, "JH": 22, "K": 23, "L": 24, "M": 25, "N": 26,
    "NG": 27, "P": 28, "R": 29, "S": 30, "SH": 31, "T": 32,
    "TH": 33, "V": 34, "W": 35, "Y": 36, "Z": 37, "ZH": 38,
}

# Reverse mapping for display
_ID_TO_PHONEME = {v: k for k, v in _PHONEME_TO_ID.items()}


def _phoneme_to_id(phone: str) -> int:
    """Convert an ARPAbet phoneme (possibly with stress marker) to numeric ID."""
    stripped = re.sub(r'[012]', '', phone)
    return _PHONEME_TO_ID.get(stripped, -1)


def build_phoneme_vectors(word_infos: list[dict]) -> list[dict]:
    """
    Build a flat list of per-phoneme records with absolute positioning.

    Each record:
        {"abs_pos": int, "line": int, "word": int, "syl_in_word": int,
         "phoneme": str, "phoneme_id": int, "stress": int or None,
         "is_vowel": bool, "word_text": str}

    This is the fundamental data structure for Phase 2 pattern analysis.
    """
    vectors = []
    abs_pos = 0
    for wi in word_infos:
        if not wi["phones"]:
            continue
        syl_idx = 0
        for phone in wi["phones"]:
            stripped = re.sub(r'[012]', '', phone)
            is_vowel = bool(_VOWEL_RE.match(stripped))
            # Extract stress marker
            stress = None
            for c in phone:
                if c.isdigit():
                    stress = int(c)
                    break
            vectors.append({
                "abs_pos": abs_pos,
                "line": wi["line_idx"],
                "word": wi["word_idx"],
                "syl_in_word": syl_idx if is_vowel else syl_idx,
                "phoneme": stripped,
                "phoneme_id": _phoneme_to_id(phone),
                "stress": stress,
                "is_vowel": is_vowel,
                "word_text": wi["clean"],
            })
            if is_vowel:
                syl_idx += 1
            abs_pos += 1
    return vectors


# ---------------------------------------------------------------------------
# Phase 2: Numerical Pattern Recognition
# ---------------------------------------------------------------------------

def find_phoneme_patterns(
    vectors: list[dict],
    window_sizes: tuple[int, ...] = (3, 4, 5),
    min_occurrences: int = 2,
) -> list[dict]:
    """
    Find repeating phoneme sequences using sliding-window n-gram matching.

    Scans the phoneme vector with several window sizes, looking for
    phoneme-ID sequences that repeat at different positions.

    Returns list of pattern dicts:
        [{"pattern_ids": [0, 24, 30], "pattern_str": "AA L S",
          "length": 3, "occurrences": [{abs_pos, line, word}, ...]}]
    """
    if not vectors:
        return []

    id_seq = [v["phoneme_id"] for v in vectors]
    results = []

    for w in window_sizes:
        if len(id_seq) < w:
            continue
        seen = defaultdict(list)  # tuple of IDs → list of starting positions
        for i in range(len(id_seq) - w + 1):
            ngram = tuple(id_seq[i:i + w])
            # Skip if contains unknown phonemes
            if -1 in ngram:
                continue
            seen[ngram].append(i)

        for ngram, positions in seen.items():
            if len(positions) < min_occurrences:
                continue
            # Filter out overlapping occurrences (keep non-overlapping)
            filtered = [positions[0]]
            for p in positions[1:]:
                if p >= filtered[-1] + w:
                    filtered.append(p)
            if len(filtered) < min_occurrences:
                continue

            pattern_str = " ".join(_ID_TO_PHONEME.get(pid, "?") for pid in ngram)
            occurrences = []
            for p in filtered:
                v = vectors[p]
                occurrences.append({
                    "abs_pos": v["abs_pos"],
                    "line": v["line"],
                    "word": v["word"],
                    "word_text": v["word_text"],
                })
            results.append({
                "pattern_ids": list(ngram),
                "pattern_str": pattern_str,
                "length": w,
                "occurrences": occurrences,
                "count": len(occurrences),
            })

    # Deduplicate: remove shorter patterns that are subsets of longer ones
    results.sort(key=lambda x: (-x["length"], -x["count"]))

    # Keep only the top patterns (avoid flooding output)
    # Filter out trivially common patterns (all same phoneme)
    final = []
    for r in results:
        if len(set(r["pattern_ids"])) < 2:
            continue  # Skip monotone patterns like "AH AH AH"
        final.append(r)
        if len(final) >= 50:
            break

    return final


# ---------------------------------------------------------------------------
# Phase 2: Configurable Granularity / Section Detection
# ---------------------------------------------------------------------------

def detect_sections(
    lines: list[dict],
    labels: Optional[list[str]] = None,
) -> list[dict]:
    """
    Detect document sections from blank-line separators or explicit labels.

    Args:
        lines: list of line dicts from tokenize_text
        labels: optional list of section labels (e.g., ["verse", "chorus", ...])
            If provided, sections are assigned these labels in order.

    Returns list of section dicts:
        [{"id": 0, "label": "verse-1", "start_line": 0, "end_line": 7,
          "line_count": 8}, ...]
    """
    sections = []
    current_start = None
    section_idx = 0

    for i, line in enumerate(lines):
        is_empty = not line["text"].strip()
        if current_start is None and not is_empty:
            current_start = i
        elif is_empty and current_start is not None:
            # End of section
            label = (labels[section_idx]
                     if labels and section_idx < len(labels)
                     else f"section-{section_idx + 1}")
            sections.append({
                "id": section_idx,
                "label": label,
                "start_line": current_start,
                "end_line": i - 1,
                "line_count": i - current_start,
            })
            section_idx += 1
            current_start = None

    # Handle last section (no trailing blank line)
    if current_start is not None:
        label = (labels[section_idx]
                 if labels and section_idx < len(labels)
                 else f"section-{section_idx + 1}")
        sections.append({
            "id": section_idx,
            "label": label,
            "start_line": current_start,
            "end_line": len(lines) - 1,
            "line_count": len(lines) - current_start,
        })

    return sections


# ---------------------------------------------------------------------------
# Phase 3: Device Clustering (line-level fingerprints)
# ---------------------------------------------------------------------------

def _build_device_map(
    lines: list[dict],
    device_groups: list[dict],  # rhymes, assonance, etc.
    device_type: str,
) -> dict[int, list[str]]:
    """
    Map each line → list of device group IDs it participates in.
    """
    line_devices = defaultdict(list)
    for group in device_groups:
        for word_ref in group["words"]:
            line_idx = word_ref["lineIndex"]
            line_devices[line_idx].append(f"{device_type}:{group['id']}")
    return dict(line_devices)


def cluster_lines_by_devices(
    lines: list[dict],
    rhymes: list[dict],
    assonance: list[dict],
    alliteration: list[dict],
    cascades: list[dict],
) -> list[dict]:
    """
    Cluster lines by shared poetic devices.

    Each line gets a "device fingerprint" — the set of device groups it
    participates in. Lines with similar fingerprints are clustered.

    Returns list of line_device dicts:
        [{"line_id": 0, "devices": ["rhyme:rhyme-0", "assonance:assonance-ow"],
          "device_count": 2, "device_density": 0.4}, ...]
    """
    # Build per-line device maps
    all_devices = {}
    for dtype, groups in [("rhyme", rhymes), ("assonance", assonance),
                          ("alliteration", alliteration), ("cascade", cascades)]:
        dm = _build_device_map(lines, groups, dtype)
        for line_idx, devs in dm.items():
            if line_idx not in all_devices:
                all_devices[line_idx] = []
            all_devices[line_idx].extend(devs)

    result = []
    for line in lines:
        lid = line["id"]
        devices = all_devices.get(lid, [])
        word_count = len(line["words"])
        result.append({
            "line_id": lid,
            "devices": sorted(set(devices)),
            "device_count": len(set(devices)),
            "device_density": round(len(set(devices)) / max(word_count, 1), 2),
        })

    return result


# ---------------------------------------------------------------------------
# Phase 3: Pattern Regularity Reports
# ---------------------------------------------------------------------------

def find_pattern_regularity(
    sections: list[dict],
    line_devices: list[dict],
    rhymes: list[dict],
    assonance: list[dict],
) -> list[dict]:
    """
    Compare device usage across structurally analogous sections.

    Looks for patterns like:
    - "Sections 1 and 2 both end lines with /OW/ rhymes"
    - "Section 3 breaks the rhyme pattern established in 1-2"

    Returns list of observation dicts:
        [{"type": "regularity"|"break", "description": str,
          "sections_involved": [int, ...]}]
    """
    if len(sections) < 2:
        return []

    observations = []

    # Analyze end-line rhyme patterns per section
    section_end_rhymes = {}
    for sec in sections:
        end_line = sec["end_line"]
        # Find which rhyme groups the end line participates in
        end_devices = []
        for ld in line_devices:
            if ld["line_id"] == end_line:
                end_devices = [d for d in ld["devices"] if d.startswith("rhyme:")]
                break
        section_end_rhymes[sec["id"]] = end_devices

    # Check for consistent end-rhyme patterns across sections
    rhyme_group_to_sections = defaultdict(list)
    for sec_id, rhyme_devs in section_end_rhymes.items():
        for rd in rhyme_devs:
            rhyme_group_to_sections[rd].append(sec_id)

    for rgroup, sec_ids in rhyme_group_to_sections.items():
        if len(sec_ids) >= 2:
            # Find the rhyme group name
            group_name = rgroup
            for rg in rhymes:
                if rg["id"] == rgroup.replace("rhyme:", ""):
                    group_name = rg["name"]
                    break
            sec_labels = []
            for sid in sec_ids:
                for s in sections:
                    if s["id"] == sid:
                        sec_labels.append(s["label"])
            observations.append({
                "type": "regularity",
                "description": (
                    f"Sections {', '.join(sec_labels)} share end-line "
                    f"rhyme group '{group_name}'"
                ),
                "sections_involved": sec_ids,
            })

    # Check for device density patterns
    section_densities = []
    for sec in sections:
        densities = []
        for ld in line_devices:
            if sec["start_line"] <= ld["line_id"] <= sec["end_line"]:
                densities.append(ld["device_density"])
        avg = sum(densities) / len(densities) if densities else 0
        section_densities.append({
            "section_id": sec["id"],
            "label": sec["label"],
            "avg_density": round(avg, 2),
        })

    # Report sections with notably high or low density
    if section_densities:
        all_densities = [sd["avg_density"] for sd in section_densities]
        overall_avg = sum(all_densities) / len(all_densities) if all_densities else 0
        for sd in section_densities:
            if sd["avg_density"] > overall_avg * 1.5 and overall_avg > 0:
                observations.append({
                    "type": "high_density",
                    "description": (
                        f"Section '{sd['label']}' has high device density "
                        f"({sd['avg_density']:.2f} vs avg {overall_avg:.2f})"
                    ),
                    "sections_involved": [sd["section_id"]],
                })
            elif sd["avg_density"] < overall_avg * 0.5 and overall_avg > 0:
                observations.append({
                    "type": "low_density",
                    "description": (
                        f"Section '{sd['label']}' has low device density "
                        f"({sd['avg_density']:.2f} vs avg {overall_avg:.2f})"
                    ),
                    "sections_involved": [sd["section_id"]],
                })

    # Check for parallel structure across same-labeled sections
    label_groups = defaultdict(list)
    for sec in sections:
        # Normalize label for grouping (strip trailing numbers)
        base_label = re.sub(r'[-_]?\d+$', '', sec["label"])
        label_groups[base_label].append(sec)

    for base_label, secs_in_group in label_groups.items():
        if len(secs_in_group) < 2:
            continue
        # Compare assonance patterns across parallel sections
        sec_vowels = {}
        for sec in secs_in_group:
            vowels = set()
            for ag in assonance:
                for w in ag["words"]:
                    if sec["start_line"] <= w["lineIndex"] <= sec["end_line"]:
                        vowels.add(ag["name"])
                        break
            sec_vowels[sec["id"]] = vowels

        # Check if all parallel sections share vowel patterns
        all_vowel_sets = list(sec_vowels.values())
        if all_vowel_sets:
            shared = set.intersection(*all_vowel_sets) if all_vowel_sets else set()
            if shared:
                sec_labels = [s["label"] for s in secs_in_group]
                observations.append({
                    "type": "parallel_assonance",
                    "description": (
                        f"Sections {', '.join(sec_labels)} share assonance "
                        f"patterns: {', '.join(sorted(shared))}"
                    ),
                    "sections_involved": [s["id"] for s in secs_in_group],
                })

    return observations


# ---------------------------------------------------------------------------
# Phase 4: Anaphora Detection
# ---------------------------------------------------------------------------

def _normalize_line_text(text: str) -> str:
    """Normalize a line for anaphora comparison: lowercase, strip punctuation."""
    return re.sub(r'[^\w\s]', '', text.lower()).strip()


def detect_anaphora(lines: list[dict]) -> list[dict]:
    """
    Detect repeated (anaphoric) lines.

    Groups lines by normalized text and marks duplicates.

    Returns list of anaphora groups:
        [{"id": "anaphora-0", "normalized": "don't you know",
          "line_ids": [3, 10, 17], "count": 3}, ...]
    """
    norm_groups: dict[str, list[int]] = defaultdict(list)
    for line in lines:
        norm = _normalize_line_text(line["text"])
        if norm:  # skip empty lines
            norm_groups[norm].append(line["id"])

    result = []
    anaphora_id = 0
    for norm, line_ids in norm_groups.items():
        if len(line_ids) >= 2:
            result.append({
                "id": f"anaphora-{anaphora_id}",
                "normalized": norm,
                "line_ids": line_ids,
                "count": len(line_ids),
            })
            anaphora_id += 1

    return result


# ---------------------------------------------------------------------------
# Phase 4: Syllable Symmetry
# ---------------------------------------------------------------------------

def compare_syllable_symmetry(
    sections: list[dict],
    lines: list[dict],
) -> list[dict]:
    """
    Compare syllable counts across parallel sections (e.g., verse-1 vs verse-2).

    Groups sections by base label (stripping trailing numbers), then aligns
    lines positionally within each group.

    Returns list of mismatch dicts:
        [{"position": 1, "sections": ["verse-1", "verse-2"],
          "counts": [8, 5], "delta": 3, "max_count": 8, "min_count": 5}, ...]
    """
    if len(sections) < 2:
        return []

    # Build a line lookup by ID
    line_lookup = {line["id"]: line for line in lines}

    # Group sections by base label
    label_groups: dict[str, list[dict]] = defaultdict(list)
    for sec in sections:
        base_label = re.sub(r'[-_]?\d+$', '', sec["label"])
        label_groups[base_label].append(sec)

    mismatches = []
    for base_label, secs_in_group in label_groups.items():
        if len(secs_in_group) < 2:
            continue

        # Get the lines for each section, aligned by position
        section_lines: list[list[dict]] = []
        for sec in secs_in_group:
            sec_lines = []
            for lid in range(sec["start_line"], sec["end_line"] + 1):
                if lid in line_lookup:
                    sec_lines.append(line_lookup[lid])
            section_lines.append(sec_lines)

        # Compare by position within each section
        max_len = max(len(sl) for sl in section_lines)
        for pos in range(max_len):
            counts = []
            sec_labels = []
            for i, sl in enumerate(section_lines):
                if pos < len(sl):
                    counts.append(sl[pos].get("syllables", 0))
                    sec_labels.append(secs_in_group[i]["label"])
                else:
                    counts.append(0)
                    sec_labels.append(secs_in_group[i]["label"])

            if len(set(counts)) > 1:  # there's a difference
                mismatches.append({
                    "position": pos,
                    "base_label": base_label,
                    "sections": sec_labels,
                    "counts": counts,
                    "delta": max(counts) - min(counts),
                    "max_count": max(counts),
                    "min_count": min(counts),
                })

    # Sort by delta descending (biggest mismatches first)
    mismatches.sort(key=lambda m: m["delta"], reverse=True)
    return mismatches


# ---------------------------------------------------------------------------
# Phase 4: Hot Word Suggestions
# ---------------------------------------------------------------------------

def suggest_hot_words(
    lines: list[dict],
    word_infos: list[dict],
    line_devices: list[dict],
    rhymes: list[dict],
    assonance: list[dict],
    cascades: list[dict],
    anaphora: list[dict],
    max_cold_lines: int = 5,
    max_suggestions_per_line: int = 5,
    context_window: int = 3,
) -> list[dict]:
    """
    Suggest words from CMUDict that would add phonetic connections to cold lines.

    Identifies the N coldest non-repeated, non-empty lines and for each:
    - Looks at device groups in nearby lines (±context_window)
    - Searches CMUDict for words whose phonemes match nearby groups
    - Returns suggestions with reason

    Returns:
        [{"line_id": 5, "line_text": "...", "density": 0.3,
          "suggestions": [{"word": "gleam", "reason": "rhymes with 'dream'",
                           "device": "rhyme"}, ...]}, ...]
    """
    # Identify repeated line IDs (anaphora)
    repeated_ids = set()
    for a in anaphora:
        for lid in a["line_ids"]:
            repeated_ids.add(lid)

    # Find the coldest non-repeated, non-empty lines
    cold_candidates = []
    for ld in line_devices:
        lid = ld["line_id"]
        if lid in repeated_ids:
            continue
        # Find the line text
        line = next((l for l in lines if l["id"] == lid), None)
        if not line or not line.get("words"):
            continue
        cold_candidates.append({
            "line_id": lid,
            "line_text": line["text"],
            "density": ld.get("device_density", 0),
        })

    cold_candidates.sort(key=lambda c: c["density"])
    cold_lines = cold_candidates[:max_cold_lines]

    if not cold_lines:
        return []

    # Build a mapping of line_id → set of device group IDs
    line_device_lookup = {}
    for ld in line_devices:
        line_device_lookup[ld["line_id"]] = set(ld.get("devices", []))

    # Build lookup structures for device groups
    rhyme_tails: dict[str, tuple[str, list[str]]] = {}  # group_id → (name, tail)
    for rg in rhymes:
        # Get the rhyme tail from the first word in the group
        first_word_ref = rg["words"][0] if rg["words"] else None
        if first_word_ref:
            wi = next(
                (w for w in word_infos
                 if w["line_idx"] == first_word_ref["lineIndex"]
                 and w["word_idx"] == first_word_ref["wordIndex"]),
                None
            )
            if wi and wi.get("phones"):
                tail = _get_rhyme_tail(wi["phones"])
                rhyme_tails[rg["id"]] = (rg["name"], tail)

    assonance_vowels: dict[str, str] = {}  # group_id → vowel nucleus
    for ag in assonance:
        assonance_vowels[ag["id"]] = ag["name"]

    cascade_skeletons: dict[str, tuple[str, str]] = {}  # group_id → (name, skeleton)
    for cg in cascades:
        first_word_ref = cg["words"][0] if cg["words"] else None
        if first_word_ref:
            wi = next(
                (w for w in word_infos
                 if w["line_idx"] == first_word_ref["lineIndex"]
                 and w["word_idx"] == first_word_ref["wordIndex"]),
                None
            )
            if wi and wi.get("phones"):
                skeleton_parts = []
                for p in wi["phones"]:
                    stripped = re.sub(r'[012]', '', p)
                    if _VOWEL_RE.match(stripped):
                        skeleton_parts.append("_V_")
                    else:
                        skeleton_parts.append(stripped)
                skeleton = " ".join(skeleton_parts)
                cascade_skeletons[cg["id"]] = (cg["name"], skeleton)

    # For each cold line, find nearby device groups and suggest words
    result = []
    for cold in cold_lines:
        lid = cold["line_id"]
        nearby_devices: set[str] = set()
        for offset in range(-context_window, context_window + 1):
            neighbor_id = lid + offset
            if neighbor_id in line_device_lookup:
                nearby_devices |= line_device_lookup[neighbor_id]

        # Exclude devices already on this line
        own_devices = line_device_lookup.get(lid, set())
        target_devices = nearby_devices - own_devices

        suggestions = []

        # Rhyme suggestions
        for dev_id in target_devices:
            if not dev_id.startswith("rhyme:"):
                continue
            group_id = dev_id.replace("rhyme:", "")
            if group_id not in rhyme_tails:
                continue
            name, tail = rhyme_tails[group_id]
            if not tail:
                continue
            # Search CMUDict for words matching this rhyme tail
            tail_str = " ".join(tail)
            try:
                rhyming_words = pronouncing.rhymes(name.split("/")[0])
                for rw in rhyming_words[:3]:
                    suggestions.append({
                        "word": rw,
                        "reason": f"rhymes with '{name}'",
                        "device": "rhyme",
                        "group_id": group_id,
                    })
            except Exception:
                pass

        # Assonance suggestions — use a representative word from the
        # assonance group and find its rhymes (fast hash-based lookup),
        # then filter to those sharing the vowel.
        for dev_id in target_devices:
            if not dev_id.startswith("assonance:"):
                continue
            group_id = dev_id.replace("assonance:", "")
            if group_id not in assonance_vowels:
                continue
            vowel_name = assonance_vowels[group_id]
            # Find a representative word from this assonance group
            target_vowel = group_id.replace("assonance-", "").upper()
            rep_word = None
            for ag in assonance:
                if ag["id"] == group_id and ag["words"]:
                    wr = ag["words"][0]
                    wi = next(
                        (w for w in word_infos
                         if w["line_idx"] == wr["lineIndex"]
                         and w["word_idx"] == wr["wordIndex"]),
                        None
                    )
                    if wi:
                        rep_word = wi["clean"].lower()
                    break
            if not rep_word:
                continue
            try:
                rhyming = pronouncing.rhymes(rep_word)
                count = 0
                for rw in rhyming:
                    if rw in _RHYME_STOPWORDS or len(rw) <= 2:
                        continue
                    # Check if this word shares the target vowel
                    rw_phones = pronouncing.phones_for_word(rw)
                    if rw_phones:
                        rw_vowels = [
                            re.sub(r'[012]', '', p)
                            for p in rw_phones[0].split()
                            if _VOWEL_RE.match(re.sub(r'[012]', '', p))
                        ]
                        if target_vowel in rw_vowels:
                            suggestions.append({
                                "word": rw,
                                "reason": f"shares '{vowel_name}' vowel sound",
                                "device": "assonance",
                                "group_id": group_id,
                            })
                            count += 1
                            if count >= 3:
                                break
            except Exception:
                pass

        # Deduplicate and limit suggestions
        seen_words: set[str] = set()
        unique_suggestions = []
        for s in suggestions:
            if s["word"] not in seen_words:
                seen_words.add(s["word"])
                unique_suggestions.append(s)
            if len(unique_suggestions) >= max_suggestions_per_line:
                break

        if unique_suggestions:
            result.append({
                "line_id": lid,
                "line_text": cold["line_text"],
                "density": cold["density"],
                "suggestions": unique_suggestions,
            })

    return result


# ---------------------------------------------------------------------------
# Phase 4: Cascade Expansion Suggestions
# ---------------------------------------------------------------------------

def suggest_cascade_expansions(
    cascades: list[dict],
    word_infos: list[dict],
    max_suggestions_per_cascade: int = 5,
) -> list[dict]:
    """
    For each existing cascade, suggest words from CMUDict that share
    the consonant skeleton but use a different vowel.

    Returns:
        [{"cascade_id": "cascade-0", "name": "drip/drop",
          "skeleton": "D R _V_ P", "existing_vowels": ["IH", "AA"],
          "suggestions": [{"word": "drape", "vowel": "EY"}, ...]}, ...]
    """
    if not cascades:
        return []

    # Build a skeleton → [(word, vowels)] index from CMUDict.
    # cmudict.entries() returns [(word, [phones...]), ...] — fast (0.16s).
    cmudict_entries = pronouncing.cmudict.entries()

    skeleton_index: dict[str, list[tuple[str, list[str]]]] = defaultdict(list)
    for word, phone_list in cmudict_entries:
        # Build skeleton
        skel_parts = []
        vowels_in_word = []
        for p in phone_list:
            stripped = re.sub(r'[012]', '', p)
            if _VOWEL_RE.match(stripped):
                skel_parts.append("_V_")
                vowels_in_word.append(stripped)
            else:
                skel_parts.append(stripped)
        skel = " ".join(skel_parts)
        if vowels_in_word:  # only index words with vowels
            skeleton_index[skel].append((word, vowels_in_word))

    result = []

    for cg in cascades:
        # Reconstruct the consonant skeleton from the first word
        first_ref = cg["words"][0] if cg["words"] else None
        if not first_ref:
            continue

        wi = next(
            (w for w in word_infos
             if w["line_idx"] == first_ref["lineIndex"]
             and w["word_idx"] == first_ref["wordIndex"]),
            None
        )
        if not wi or not wi.get("phones"):
            continue

        phones = wi["phones"]

        # Build the consonant skeleton
        skeleton_parts = []
        for p in phones:
            stripped = re.sub(r'[012]', '', p)
            if _VOWEL_RE.match(stripped):
                skeleton_parts.append("_V_")
            else:
                skeleton_parts.append(stripped)
        skeleton = " ".join(skeleton_parts)

        # Collect existing vowels and words in this cascade
        existing_vowels: set[str] = set()
        existing_words: set[str] = set()
        for wr in cg["words"]:
            w = next(
                (ww for ww in word_infos
                 if ww["line_idx"] == wr["lineIndex"]
                 and ww["word_idx"] == wr["wordIndex"]),
                None
            )
            if w and w.get("phones"):
                existing_words.add(w["clean"].lower())
                for ph in w["phones"]:
                    s = re.sub(r'[012]', '', ph)
                    if _VOWEL_RE.match(s):
                        existing_vowels.add(s)

        # Look up words with same skeleton from our pre-built index
        candidates = skeleton_index.get(skeleton, [])
        suggestions = []
        for cand_word, cand_vowels in candidates:
            if cand_word.lower() in existing_words:
                continue
            # Check if this word has a novel vowel
            for v in cand_vowels:
                if v not in existing_vowels:
                    suggestions.append({"word": cand_word, "vowel": v})
                    break
            if len(suggestions) >= max_suggestions_per_cascade:
                break

        if suggestions:
            result.append({
                "cascade_id": cg["id"],
                "name": cg["name"],
                "skeleton": skeleton,
                "existing_vowels": sorted(existing_vowels),
                "suggestions": suggestions,
            })

    return result


# ---------------------------------------------------------------------------
# Full analysis pipeline
# ---------------------------------------------------------------------------

def analyze(
    text: str,
    section_labels: Optional[list[str]] = None,
    max_cold_lines: int = 5,
    max_suggestions_per_line: int = 5,
    max_suggestions_per_cascade: int = 5,
    suggestion_context_window: int = 3,
) -> dict:
    """
    Run the full phonetic analysis pipeline on input text.

    Args:
        text: The text to analyze.
        section_labels: Optional list of section labels (e.g., ["verse", "chorus"]).
            If None, sections are auto-detected from blank lines.
        max_cold_lines: Number of coldest lines to generate suggestions for.
        max_suggestions_per_line: Max hot word suggestions per cold line.
        max_suggestions_per_cascade: Max expansion suggestions per cascade.
        suggestion_context_window: Lines ± to look for nearby device groups.

    Returns a dict with Phase 1-4 analysis data.
    """
    # Step 1: Tokenize
    lines = tokenize_text(text)

    # Step 2: Build word infos with phonemes (runs spaCy once)
    word_infos = _build_word_infos(lines, text)

    # Step 3: Add syllable counts and IPA to line data
    wi_lookup = {}
    for wi in word_infos:
        wi_lookup[(wi["line_idx"], wi["word_idx"])] = wi

    for line in lines:
        total_syllables = 0
        for word in line["words"]:
            wi = wi_lookup.get((line["id"], word["index"]))
            if wi and wi["phones"]:
                syl = count_syllables_from_phones(wi["phones"])
                total_syllables += syl
                word["ipa"] = " ".join(wi["phones"])
            else:
                syl = _heuristic_syllable_count(word["clean"])
                total_syllables += syl
                word["ipa"] = ""
        line["syllables"] = total_syllables

    # Step 4: Detect poetic devices (Phase 1)
    rhymes = find_rhymes(word_infos)
    assonance = find_assonance(word_infos)
    alliteration = find_alliteration(word_infos)
    cascades = find_cascades(word_infos)

    # Step 5: Build phoneme vectors (Phase 2)
    phoneme_vectors = build_phoneme_vectors(word_infos)
    patterns = find_phoneme_patterns(phoneme_vectors)

    # Step 6: Detect sections (Phase 2/3)
    sections = detect_sections(lines, section_labels)

    # Step 7: Detect anaphora (Phase 4)
    anaphora = detect_anaphora(lines)

    # Step 8: Device clustering (Phase 3) — with anaphora-adjusted density
    repeated_ids = set()
    for a in anaphora:
        for lid in a["line_ids"]:
            repeated_ids.add(lid)

    line_devices = cluster_lines_by_devices(
        lines, rhymes, assonance, alliteration, cascades
    )
    # Add adjusted_density (discounting repeated lines)
    for ld in line_devices:
        ld["is_repeated"] = ld["line_id"] in repeated_ids
        if ld["is_repeated"]:
            ld["adjusted_density"] = 0.0
        else:
            ld["adjusted_density"] = ld["device_density"]

    # Step 9: Pattern regularity (Phase 3)
    regularity = find_pattern_regularity(
        sections, line_devices, rhymes, assonance
    )

    # Step 10: Syllable symmetry (Phase 4)
    syllable_symmetry = compare_syllable_symmetry(sections, lines)

    # Step 11: Hot word suggestions (Phase 4)
    suggestions = suggest_hot_words(
        lines, word_infos, line_devices, rhymes, assonance, cascades,
        anaphora,
        max_cold_lines=max_cold_lines,
        max_suggestions_per_line=max_suggestions_per_line,
        context_window=suggestion_context_window,
    )

    # Step 12: Cascade expansion suggestions (Phase 4)
    cascade_suggestions = suggest_cascade_expansions(
        cascades, word_infos,
        max_suggestions_per_cascade=max_suggestions_per_cascade,
    )

    return {
        "lines": lines,
        "rhymes": rhymes,
        "assonance": assonance,
        "alliteration": alliteration,
        "cascades": cascades,
        "phoneme_vectors": phoneme_vectors,
        "patterns": patterns,
        "sections": sections,
        "line_devices": line_devices,
        "regularity": regularity,
        "anaphora": anaphora,
        "syllable_symmetry": syllable_symmetry,
        "suggestions": suggestions,
        "cascade_suggestions": cascade_suggestions,
    }

