from pypdf import PdfReader


path = r"C:/Users/cps/Downloads/Report7_Final report.pdf"
reader = PdfReader(path)
print("pages", len(reader.pages))
for page_index, page in enumerate(reader.pages):
    text = page.extract_text() or ""
    if "Testing Documentation" in text or "Software Testing" in text or "Test Statistics" in text:
        print("PAGE", page_index + 1)
        print(text[:2500])
