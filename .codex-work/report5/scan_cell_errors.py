import openpyxl


path = r"D:/Capstone_FoodResQ_Web/outputs/report5-foodresq/FoodResQ_Report5_Test_Report_v11.xlsx"
wb = openpyxl.load_workbook(path, data_only=False)
terms = ("#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#N/A")
bad = []

for ws in wb.worksheets:
    for row in ws.iter_rows():
        for cell in row:
            value = cell.value
            if isinstance(value, str) and any(term in value for term in terms):
                bad.append((ws.title, cell.coordinate, value))

print("cell_formula_or_value_errors_count=", len(bad))
for item in bad[:20]:
    print(item)
