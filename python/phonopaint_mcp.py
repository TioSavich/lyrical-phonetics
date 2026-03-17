#!/usr/bin/env python3
"""
PhonoPaint MCP Server — Exposes the phoneme substitution engine as tools
that any AI (Claude, GPT, etc.) can call via the Model Context Protocol.

Setup:
  python3 -m venv .venv
  source .venv/bin/activate
  pip install mcp pronouncing
  python phonopaint_mcp.py

Or configure in Claude Desktop / other MCP clients:
  {
    "mcpServers": {
      "phonopaint": {
        "command": "/path/to/lyrical-phonetics/python/.venv/bin/python",
        "args": ["/path/to/lyrical-phonetics/python/phonopaint_mcp.py"]
      }
    }
  }
"""

import json
import sys
import os

# Ensure the python/ directory is on the path so we can import the engine
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mcp.server.fastmcp import FastMCP
from substitution_engine import (
    get_index,
    phoneme_to_hsl,
    phoneme_to_css,
    is_vowel,
    VOWELS,
    CONSONANTS,
    ALL_PHONEMES,
)

# ── Create server ──
mcp = FastMCP(
    "PhonoPaint",
    description="Phoneme substitution engine for creative lyric writing. "
    "Find words that differ by a single phoneme, explore poetic devices "
    "(alliteration, assonance, consonance, rhyme), and get articulatory "
    "color mappings for phonemes.",
)

# Pre-build the index on startup
_index = get_index()


# ── Tools ──

@mcp.tool()
def get_pronunciation(word: str) -> str:
    """Get the ARPAbet pronunciation of a word from CMUDict.

    Returns the phoneme sequence with stress markers (0=no stress, 1=primary, 2=secondary).
    Example: "cat" → ["K", "AE1", "T"]
    """
    phones = _index.get_phones(word)
    if phones is None:
        return json.dumps({"error": f"'{word}' not found in CMUDict"})
    return json.dumps({"word": word.lower(), "phones": phones})


@mcp.tool()
def get_word_info(word: str) -> str:
    """Get detailed phoneme analysis of a word including articulatory colors.

    Returns each phoneme with its position, type (vowel/consonant), stress level,
    and HSL color based on manner and place of articulation.
    """
    info = _index.get_word_info(word)
    if info is None:
        return json.dumps({"error": f"'{word}' not found in CMUDict"})
    return json.dumps(info)


@mcp.tool()
def find_substitutions(word: str, position: int, target_phoneme: str = "") -> str:
    """Find all real English words formed by swapping one phoneme.

    Given a word and a phoneme position (0-indexed), returns all valid
    dictionary words that result from changing that phoneme.

    Args:
        word: The source word (e.g., "cat")
        position: Which phoneme to substitute (0-indexed). Use get_word_info
                  to see the phoneme positions.
        target_phoneme: Optional. If specified, only return words where the
                       new phoneme matches this (e.g., "S" to find "sat" from "cat").

    Example: find_substitutions("cat", 0) → bat, chat, fat, hat, mat, sat...
    """
    subs = _index.find_substitutions(
        word, position,
        target_phoneme if target_phoneme else None
    )
    # Simplify output for readability
    result = [{
        "word": s["word"],
        "new_phoneme": s["substituted_phoneme"],
    } for s in subs]
    return json.dumps({
        "source": word,
        "position": position,
        "count": len(result),
        "substitutions": result,
    })


@mcp.tool()
def find_all_substitutions(word: str) -> str:
    """Find ALL possible single-phoneme substitutions for a word.

    Returns substitutions grouped by phoneme position.

    Example: find_all_substitutions("cat") →
      position 0 (K): bat, chat, fat, hat...
      position 1 (AE): coat, cot, cut, kite...
      position 2 (T): cab, cad, can, cap...
    """
    phones = _index.get_phones(word)
    if phones is None:
        return json.dumps({"error": f"'{word}' not found in CMUDict"})

    all_subs = _index.find_all_substitutions(word)
    result = {}
    for pos, subs in all_subs.items():
        phoneme = phones[pos]
        result[str(pos)] = {
            "phoneme": phoneme,
            "count": len(subs),
            "words": [s["word"] for s in subs[:30]],  # Cap at 30 for readability
            "total": len(subs),
        }

    return json.dumps({
        "source": word,
        "phones": phones,
        "positions": result,
    })


@mcp.tool()
def find_device_substitutions(
    word: str,
    device: str,
    target_phoneme: str = "",
) -> str:
    """Find substitutions that target a specific poetic device.

    This is the key creative tool — it finds words that would create or
    enhance alliteration, assonance, consonance, or rhyme.

    Args:
        word: The source word
        device: One of "alliteration", "assonance", "consonance", "rhyme"
            - alliteration: changes initial consonant(s) (cat → sat, bat)
            - assonance: changes vowel sounds (cat → cot, cut)
            - consonance: changes any consonant (cat → cab, can)
            - rhyme: changes phonemes before the rhyme tail (flame → blame, claim)
        target_phoneme: Optional. Paint a specific phoneme (e.g., "S" for
                       /s/ alliteration). If omitted, shows all possibilities.

    Example: find_device_substitutions("light", "alliteration", "S") → cite, sight, site
    """
    subs = _index.find_device_substitutions(
        word, device,
        target_phoneme if target_phoneme else None
    )
    result = [{
        "word": s["word"],
        "new_phoneme": s.get("substituted_phoneme", ""),
    } for s in subs]
    return json.dumps({
        "source": word,
        "device": device,
        "target_phoneme": target_phoneme or None,
        "count": len(result),
        "substitutions": result[:50],  # Cap for readability
    })


@mcp.tool()
def analyze_line_phonetics(line: str) -> str:
    """Analyze a line of lyrics/poetry for its phonetic structure.

    Returns each word's pronunciation, phoneme colors, and the available
    substitution counts — useful for understanding the sonic "palette" of a line.
    """
    words = line.split()
    analysis = []
    for w in words:
        clean = w.strip(".,!?;:'\"()-").lower()
        if not clean:
            continue
        info = _index.get_word_info(clean)
        if info:
            # Count total available substitutions
            all_subs = _index.find_all_substitutions(clean)
            total_subs = sum(len(v) for v in all_subs.values())
            analysis.append({
                "word": clean,
                "display": w,
                "phones": info["phones"],
                "syllables": info["syllable_count"],
                "total_substitutions": total_subs,
            })
        else:
            analysis.append({
                "word": clean,
                "display": w,
                "phones": None,
                "syllables": None,
                "total_substitutions": 0,
                "note": "not in dictionary",
            })

    return json.dumps({
        "line": line,
        "word_count": len(analysis),
        "words": analysis,
    })


@mcp.tool()
def suggest_sonic_edits(
    line: str,
    target_device: str = "alliteration",
    target_phoneme: str = "",
) -> str:
    """Suggest phoneme-level edits to enhance a line's sonic qualities.

    Given a line of lyrics and a target poetic device, suggests specific
    word substitutions that would add more of that device to the line.

    This is the most useful tool for AI lyric writing — it shows
    concrete alternatives that preserve meaning proximity while
    enhancing sonic texture.

    Args:
        line: A line of lyrics or poetry
        target_device: "alliteration", "assonance", "consonance", or "rhyme"
        target_phoneme: Optional specific phoneme to paint with
    """
    words = line.split()
    suggestions = []

    for i, w in enumerate(words):
        clean = w.strip(".,!?;:'\"()-").lower()
        if not clean:
            continue

        subs = _index.find_device_substitutions(
            clean, target_device,
            target_phoneme if target_phoneme else None
        )

        if subs:
            suggestions.append({
                "position": i,
                "original": clean,
                "alternatives": [s["word"] for s in subs[:10]],
                "total_alternatives": len(subs),
            })

    return json.dumps({
        "line": line,
        "device": target_device,
        "target_phoneme": target_phoneme or None,
        "editable_words": len(suggestions),
        "suggestions": suggestions,
    })


@mcp.tool()
def get_phoneme_info(phoneme: str) -> str:
    """Get articulatory information about a phoneme.

    Returns the phoneme's type (vowel/consonant), articulatory category,
    HSL color, and which words commonly use it.

    Args:
        phoneme: ARPAbet phoneme (e.g., "S", "AE", "TH")
    """
    clean = phoneme.upper().strip()
    if clean not in ALL_PHONEMES:
        return json.dumps({"error": f"Unknown phoneme: '{phoneme}'. Valid: {sorted(ALL_PHONEMES)}"})

    h, s, l = phoneme_to_hsl(clean)
    return json.dumps({
        "phoneme": clean,
        "is_vowel": clean in VOWELS,
        "color_hsl": {"hue": h, "saturation": s, "lightness": l},
        "color_css": phoneme_to_css(clean),
    })


# ── Resources ──

@mcp.resource("phonopaint://phonemes")
def list_all_phonemes() -> str:
    """List all ARPAbet phonemes with their types and colors."""
    phonemes = []
    for p in sorted(ALL_PHONEMES):
        h, s, l = phoneme_to_hsl(p)
        phonemes.append({
            "phoneme": p,
            "type": "vowel" if p in VOWELS else "consonant",
            "color_css": f"hsl({h}, {s}%, {l}%)",
        })
    return json.dumps({"phonemes": phonemes})


@mcp.resource("phonopaint://devices")
def list_devices() -> str:
    """List available poetic devices and how they work."""
    return json.dumps({
        "devices": {
            "alliteration": {
                "description": "Repetition of initial consonant sounds",
                "example": "She sells sea shells",
                "affects": "Initial consonant(s) before first vowel",
            },
            "assonance": {
                "description": "Repetition of vowel sounds",
                "example": "How now brown cow",
                "affects": "All vowel positions",
            },
            "consonance": {
                "description": "Repetition of consonant sounds (anywhere)",
                "example": "Pitter patter",
                "affects": "All consonant positions",
            },
            "rhyme": {
                "description": "Matching sounds from last stressed vowel onward",
                "example": "flame / blame / claim",
                "affects": "Phonemes before the rhyme tail",
            },
        }
    })


# ── Run ──

if __name__ == "__main__":
    mcp.run()
