"""Extract Draw Steel Heroes v1.01b PDF text into reference markdown files.

Usage:
  python dnd/ai-reference/scripts/extract-heroes-v101b.py C:/path/Draw_Steel_Heroes_v1.01b.pdf
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from pypdf import PdfReader


REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "dnd" / "ai-reference" / "source" / "rules-v1.01b"


CHAPTERS = [
    ("introduction", "Introduction and Glossary", 8, 16, "front-matter"),
    ("chapter-01-the-basics", "Chapter 1: The Basics", 18, 29, "chapters"),
    ("chapter-02-making-a-hero", "Chapter 2: Making a Hero", 30, 35, "chapters"),
    ("chapter-03-ancestries", "Chapter 3: Ancestries", 36, 67, "chapters"),
    ("chapter-04-background", "Chapter 4: Background", 68, 83, "chapters"),
    ("chapter-05-classes", "Chapter 5: Classes", 84, 231, "chapters"),
    ("chapter-06-kits", "Chapter 6: Kits", 232, 241, "chapters"),
    ("chapter-07-perks", "Chapter 7: Perks", 242, 247, "chapters"),
    ("chapter-08-complications", "Chapter 8: Complications", 248, 263, "chapters"),
    ("chapter-09-tests", "Chapter 9: Tests", 264, 279, "chapters"),
    ("chapter-10-combat", "Chapter 10: Combat", 280, 297, "chapters"),
    ("chapter-11-negotiation", "Chapter 11: Negotiation", 298, 307, "chapters"),
    ("chapter-12-downtime-projects", "Chapter 12: Downtime Projects", 308, 327, "chapters"),
    ("chapter-13-rewards", "Chapter 13: Rewards", 328, 367, "chapters"),
    ("chapter-14-gods-and-religion", "Chapter 14: Gods and Religion", 368, 387, "chapters"),
    ("chapter-15-for-the-director", "Chapter 15: For the Director", 388, 415, "chapters"),
]


CLASSES = [
    ("censor", "Censor", 93, 108),
    ("conduit", "Conduit", 109, 126),
    ("elementalist", "Elementalist", 127, 144),
    ("fury", "Fury", 145, 160),
    ("null", "Null", 161, 174),
    ("shadow", "Shadow", 175, 188),
    ("tactician", "Tactician", 189, 200),
    ("talent", "Talent", 201, 216),
    ("troubadour", "Troubadour", 217, 231),
]


def clean_text(text: str) -> str:
    text = text.replace("\u00ad\n", "")
    text = text.replace("\u00ad", "")
    text = re.sub(r"\bY (ou(?:ng(?:er)?|rs?)?)\b", r"Y\1", text)
    text = re.sub(r"\bT ([a-z]{1,})\b", r"T\1", text)
    text = text.replace("A verage", "Average")
    text = text.replace("A void", "Avoid")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def page_text(reader: PdfReader, page_number: int) -> str:
    if page_number < 1 or page_number > len(reader.pages):
        raise ValueError(f"PDF page {page_number} is outside 1-{len(reader.pages)}")
    return clean_text(reader.pages[page_number - 1].extract_text() or "")


def render_section(reader: PdfReader, title: str, start_page: int, end_page: int) -> str:
    parts = [
        f"# {title}",
        "",
        f"_Source: Draw Steel Heroes v1.01b PDF pages {start_page}-{end_page}._",
        "",
    ]
    for page_number in range(start_page, end_page + 1):
        text = page_text(reader, page_number)
        if not text:
            continue
        parts.extend([f"<!-- PDF page {page_number} -->", "", text, ""])
    return "\n".join(parts).rstrip() + "\n"


def write_index(output_dir: Path) -> None:
    chapter_rows = "\n".join(
        f"| {title} | `{folder}/{slug}.md` |" for slug, title, _start, _end, folder in CHAPTERS
    )
    class_rows = "\n".join(f"| {title} | `classes/{slug}.md` |" for slug, title, _start, _end in CLASSES)
    content = f"""# Rules Source Index - Draw Steel Heroes v1.01b

These files were generated from `Draw_Steel_Heroes_v1.01b.pdf`.

## Chapter Files

| Topic | File |
|---|---|
{chapter_rows}

## Whole-Class Files

Use these for class ability authoring. Each file contains the full extracted class section from the v1.01b Heroes book.

| Class | File |
|---|---|
{class_rows}
"""
    (output_dir / "INDEX.md").write_text(content, encoding="utf-8")


def main() -> int:
    if len(sys.argv) not in (2, 3):
        print("Usage: python extract-heroes-v101b.py <pdf-path> [output-dir]", file=sys.stderr)
        return 2

    pdf_path = Path(sys.argv[1]).expanduser().resolve()
    output_dir = Path(sys.argv[2]).expanduser().resolve() if len(sys.argv) == 3 else DEFAULT_OUTPUT_DIR
    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        return 1

    reader = PdfReader(str(pdf_path))
    for subdir in ("front-matter", "chapters", "classes"):
        (output_dir / subdir).mkdir(parents=True, exist_ok=True)

    for slug, title, start_page, end_page, folder in CHAPTERS:
        (output_dir / folder / f"{slug}.md").write_text(
            render_section(reader, title, start_page, end_page),
            encoding="utf-8",
        )

    for slug, title, start_page, end_page in CLASSES:
        (output_dir / "classes" / f"{slug}.md").write_text(
            render_section(reader, title, start_page, end_page),
            encoding="utf-8",
        )

    write_index(output_dir)
    print(f"Wrote v1.01b rules markdown to {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
