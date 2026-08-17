from docx import Document


path = r"C:/Users/cps/Downloads/Report7_Final Project Report.docx"
doc = Document(path)

for index, paragraph in enumerate(doc.paragraphs):
    text = paragraph.text.strip()
    if not text:
        continue
    if (
        "Testing" in text
        or "Software Testing" in text
        or "Scope of Testing" in text
        or text.startswith("V.")
    ):
        print(index, paragraph.style.name, text[:240])
