import openpyxl


path = r"C:/Users/cps/Downloads/FoodResQ_Report5_Test_Report_v7.xlsx"
wb = openpyxl.load_workbook(path, data_only=True)
ws = wb["Campaign Kitchen Ops"]

for row in range(1, 90):
    values = [ws.cell(row, col).value for col in range(1, 8)]
    if any(value is not None for value in values):
        print(row, values)
