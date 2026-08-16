from docx import Document
from docx.text.paragraph import Paragraph
from docx.table import Table

doc = Document(r'd:\Do_An\foodresq\docs\diagrams\class-specs.docx')
public_empty = 0
public_filled = 0
private_count = 0
for elem in doc.element.body.iterchildren():
    if elem.tag.endswith('}p'):
        p = Paragraph(elem, doc)
        # skip
    elif elem.tag.endswith('}tbl'):
        t = Table(elem, doc)
        for ri, row in enumerate(t.rows):
            if ri == 0: continue
            cells = row.cells
            if len(cells) < 2: continue
            method = cells[0].text.strip()
            desc = cells[1].text.strip()
            if method:
                if method.startswith('-'):
                    private_count += 1
                else:
                    if desc: public_filled += 1
                    else: public_empty += 1
print(f'PUBLIC methods: filled={public_filled}, empty={public_empty}')
print(f'PRIVATE fields (in tables): {private_count}')
print(f'Total public+private rows: {public_filled + public_empty + private_count}')
print()
# Show all H2
h2_list = [p.text for p in doc.paragraphs if p.style.name == 'Heading 2']
print(f'Sections ({len(h2_list)}):')
for h in h2_list:
    print(f'  {h}')