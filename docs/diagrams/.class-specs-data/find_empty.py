"""Find all method rows in the generated docx that have an empty Description cell."""
import sys
from docx import Document
from docx.oxml.ns import qn

doc = Document(sys.argv[1] if len(sys.argv) > 1 else r"d:\Do_An\foodresq\docs\diagrams\class-specs.docx")

# Walk paragraphs to track current H1/H2/H3 context
ctx = {"file": "", "section": "", "class": ""}
rows = []
for p in doc.paragraphs:
    style = p.style.name
    if style == "Heading 1":
        ctx["file"] = p.text
        ctx["section"] = ""
        ctx["class"] = ""
    elif style == "Heading 2":
        ctx["section"] = p.text
        ctx["class"] = ""
    elif style == "Heading 3":
        ctx["class"] = p.text

# We need to associate tables with their preceding H3. python-docx doesn't expose
# tree order easily; iterate body elements in order instead.
body = doc.element.body
ctx = {"file": "", "section": "", "class": ""}
empty_count = 0
for elem in body.iterchildren():
    tag = elem.tag
    if tag.endswith("}p"):
        # paragraph
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
            if not desc and method and not method.startswith(("+", "-", "#", "~")):
                continue
            if not desc:
                empty_count += 1
                rows.append((ctx["file"], ctx["section"], ctx["class"], method))

print(f"Empty description rows: {empty_count}")
print()
# Group by class
from collections import defaultdict
by_class = defaultdict(list)
for f, s, c, m in rows:
    by_class[(f, s, c)].append(m)

for (f, s, c), methods in sorted(by_class.items()):
    print(f"=== {f} / {s} / {c} ({len(methods)} methods) ===")
    for m in methods:
        print(f"  {m}")
    print()