#!/usr/bin/env python3
"""
analyze.py — CLI entry point for phonetic analysis.

Usage:
    python analyze.py input.txt                     # JSON to stdout
    python analyze.py input.txt --output report.json  # JSON to file
    python analyze.py input.txt --format text       # Plain-text summary to stdout
    python analyze.py input.txt --format text --output report.txt
    python analyze.py input.txt --sections "verse,chorus,verse,bridge,chorus"
"""

import argparse
import json
import sys
import textwrap
from pathlib import Path

from phonetic_engine import analyze


def format_text_report(data: dict) -> str:
    """Format analysis results as a readable plain-text report."""
    lines_out = []
    lines_out.append("=" * 60)
    lines_out.append("  PHONETIC ANALYSIS REPORT")
    lines_out.append("=" * 60)

    # --- Sections ---
    sections = data.get("sections", [])
    if sections:
        lines_out.append("\n── STRUCTURE ──\n")
        for sec in sections:
            lines_out.append(
                f"  [{sec['label']}] Lines {sec['start_line']+1}-{sec['end_line']+1} "
                f"({sec['line_count']} lines)"
            )

    # --- Syllable counts per line ---
    lines_out.append("\n── LINE ANALYSIS ──\n")
    for line in data["lines"]:
        text = line["text"].strip()
        if not text:
            lines_out.append("")
            continue
        syl = line["syllables"]
        lines_out.append(f"  [{syl:2d} syl]  {text}")

    # --- Stress patterns ---
    lines_out.append("\n── STRESS PATTERNS ──\n")
    for line in data["lines"]:
        text = line["text"].strip()
        if not text:
            continue
        stress_symbols = []
        for word in line["words"]:
            ipa = word.get("ipa", "")
            if ipa:
                # Extract stress markers
                stresses = [c for c in ipa if c in "012"]
                pattern = "".join(
                    "×" if s == "0" else ("/" if s == "1" else "\\")
                    for s in stresses
                )
                stress_symbols.append(pattern)
            else:
                stress_symbols.append("?")
        lines_out.append(f"  {' '.join(stress_symbols):30s}  {text}")

    # --- Rhyme groups ---
    _format_groups(lines_out, "RHYMES", data.get("rhymes", []), data["lines"])

    # --- Assonance groups ---
    _format_groups(lines_out, "ASSONANCE", data.get("assonance", []), data["lines"])

    # --- Alliteration groups ---
    _format_groups(lines_out, "ALLITERATION", data.get("alliteration", []), data["lines"])

    # --- Cascade groups ---
    _format_groups(lines_out, "CASCADES", data.get("cascades", []), data["lines"])

    # --- Phoneme patterns (Phase 2) ---
    patterns = data.get("patterns", [])
    if patterns:
        lines_out.append(f"\n── REPEATING PHONEME PATTERNS ({len(patterns)} found) ──\n")
        for p in patterns[:20]:  # Show top 20
            lines_out.append(f"  ▸ [{p['pattern_str']}] ×{p['count']}")
            for occ in p["occurrences"]:
                lines_out.append(
                    f"      pos {occ['abs_pos']:3d} → L{occ['line']+1}:W{occ['word']+1} "
                    f"\"{occ['word_text']}\""
                )
            lines_out.append("")

    # --- Device density (Phase 3) ---
    line_devices = data.get("line_devices", [])
    if line_devices:
        lines_out.append("\n── DEVICE DENSITY PER LINE ──\n")
        for ld in line_devices:
            if ld["device_count"] == 0:
                continue
            # Find line text
            line_text = ""
            for line in data["lines"]:
                if line["id"] == ld["line_id"]:
                    line_text = line["text"].strip()
                    break
            if line_text:
                bar = "█" * min(ld["device_count"], 15)
                lines_out.append(
                    f"  L{ld['line_id']+1:2d} {bar:15s} "
                    f"({ld['device_count']:2d} devices, "
                    f"density={ld['device_density']:.2f})  {line_text[:50]}"
                )

    # --- Pattern regularity (Phase 3) ---
    regularity = data.get("regularity", [])
    if regularity:
        lines_out.append(f"\n── PATTERN OBSERVATIONS ({len(regularity)}) ──\n")
        for obs in regularity:
            icon = {"regularity": "🔁", "high_density": "🔥",
                    "low_density": "💤", "parallel_assonance": "🪞",
                    "break": "⚡"}.get(obs["type"], "•")
            lines_out.append(f"  {icon} {obs['description']}")

    lines_out.append("\n" + "=" * 60)
    return "\n".join(lines_out)


def _format_groups(lines_out: list, title: str, groups: list, lines: list):
    """Helper to format phonetic groups for text output."""
    lines_out.append(f"\n── {title} ({len(groups)} groups) ──\n")
    if not groups:
        lines_out.append("  (none detected)")
        return

    for group in groups:
        name = group.get("name", group["id"])
        lines_out.append(f"  ▸ {name}")
        for wref in group["words"]:
            li = wref["lineIndex"]
            wi = wref["wordIndex"]
            if li < len(lines) and wi < len(lines[li]["words"]):
                word_text = lines[li]["words"][wi]["text"]
                line_text = lines[li]["text"].strip()
                lines_out.append(f"      L{li+1}:W{wi+1} \"{word_text}\"  ← {line_text}")
        lines_out.append("")


def main():
    parser = argparse.ArgumentParser(
        description="Phonetic analysis of text for poetic devices.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              python analyze.py lyrics.txt
              python analyze.py manuscript.md --output analysis.json
              python analyze.py poem.txt --format text
              python analyze.py lyrics.txt --sections "verse,chorus,verse,bridge"
        """),
    )
    parser.add_argument("input", help="Input text file to analyze")
    parser.add_argument(
        "--output", "-o",
        help="Output file path (default: stdout)",
    )
    parser.add_argument(
        "--format", "-f",
        choices=["json", "text"],
        default="json",
        help="Output format (default: json)",
    )
    parser.add_argument(
        "--sections", "-s",
        help="Comma-separated section labels (e.g., 'verse,chorus,verse,bridge'). "
             "If omitted, sections are auto-detected from blank lines.",
    )

    args = parser.parse_args()

    # Read input
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    text = input_path.read_text(encoding="utf-8")

    # Parse section labels
    section_labels = None
    if args.sections:
        section_labels = [s.strip() for s in args.sections.split(",")]

    # Run analysis
    print("Analyzing...", file=sys.stderr)
    result = analyze(text, section_labels=section_labels)
    print("Done.", file=sys.stderr)

    # Format output
    if args.format == "json":
        output = json.dumps(result, indent=2, ensure_ascii=False)
    else:
        output = format_text_report(result)

    # Write output
    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"Report written to: {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
