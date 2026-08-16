"""Filter only methods (skip fields) that need description added."""
import sys
import re
from docx import Document

doc = Document(sys.argv[1] if len(sys.argv) > 1 else r"d:\Do_An\foodresq\docs\diagrams\class-specs.docx")

body = doc.element.body
ctx = {"file": "", "section": "", "class": ""}
items = []
for elem in body.iterchildren():
    tag = elem.tag
    if tag.endswith("}p"):
        from docx.text.paragraph import Paragraph
        p = Paragraph(elem, doc)
        style = p.style.name
        if style == "Heading 1":
            ctx = {"file": p.text, "section": "", "class": ""}
        elif style == "Heading 2":
            ctx["section"] = p.text
            ctx["class"] = ""
        elif style == "Heading 3":
            ctx["class"] = p.text
    elif tag.endswith("}tbl"):
        from docx.table import Table
        t = Table(elem, doc)
        for ri, row in enumerate(t.rows):
            if ri == 0:
                continue
            cells = row.cells
            if len(cells) < 2:
                continue
            method = cells[0].text.strip()
            desc = cells[1].text.strip()
            if not desc or not method:
                continue
            # Skip private fields (start with -)
            if method.startswith("-"):
                continue
            items.append((ctx["file"], ctx["section"], ctx["class"], method))

print(f"Methods without description (after skipping private fields): {len(items)}")
print()
# Group by class
from collections import defaultdict
by_class = defaultdict(list)
for f, s, c, m in items:
    by_class[(f, s, c)].append(m)

for (f, s, c), methods in sorted(by_class.items()):
    print(f"=== {f} / {s} / {c} ({len(methods)}) ===")
    for m in methods:
        print(f"  {m}")
    print()