import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = path.resolve("outputs/report5-foodresq/FoodResQ_Report5_Test_Report.xlsx");
const outputDir = path.resolve("outputs/report5-foodresq");
const outputPath = path.join(outputDir, "FoodResQ_Report5_Test_Report.xlsx");
const previewDir = path.join(outputDir, "previews");

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheetName = "Automated Evidence";
const ws = workbook.worksheets.getOrAdd(sheetName);
ws.showGridLines = false;

ws.getRange("A1:H40").clear({ applyTo: "all" });

ws.getRange("A1:H1").merge();
ws.getRange("A1").values = [["AUTOMATED TEST EXECUTION EVIDENCE"]];
ws.getRange("A1").format = {
  fill: "#1F4E78",
  font: { bold: true, color: "#FFFFFF", size: 14 },
  horizontalAlignment: "center",
};
ws.getRange("A1").format.rowHeight = 28;

ws.getRange("A3:B10").values = [
  ["Project", "FoodResQ - Food Rescue and Donation Platform"],
  ["Project Code", "SP26SE088"],
  ["Execution Date", new Date(Date.UTC(2026, 7, 15))],
  ["Test Type", "Backend Unit Test"],
  ["Command", "pnpm --filter @foodresq/api test"],
  ["Environment", "Local development workspace, Node.js v23.9.0 reported by test run"],
  ["Final Result", "Passed"],
  ["Evidence Summary", "9 test suites passed; 111 tests passed; 2 skipped; 0 failed; 0 snapshots"],
];
ws.getRange("A3:A10").format = {
  fill: "#D9EAF7",
  font: { bold: true, color: "#1F4E78" },
  borders: { preset: "all", style: "thin", color: "#A6A6A6" },
};
ws.getRange("B3:B10").format = {
  borders: { preset: "all", style: "thin", color: "#A6A6A6" },
  wrapText: true,
};
ws.getRange("B5").setNumberFormat("dd/mm/yyyy");

ws.getRange("A12:H12").values = [[
  "No",
  "Package/App",
  "Test Command",
  "Suites",
  "Tests Passed",
  "Skipped",
  "Failed",
  "Status",
]];
ws.getRange("A12:H12").format = {
  fill: "#333399",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  borders: { preset: "all", style: "thin", color: "#000000" },
};
ws.getRange("A13:H13").values = [[
  1,
  "@foodresq/api",
  "pnpm --filter @foodresq/api test",
  9,
  111,
  2,
  0,
  "Passed",
]];
ws.getRange("A13:H13").format = {
  borders: { preset: "all", style: "thin", color: "#A6A6A6" },
  wrapText: true,
};
ws.getRange("A13:A13").format.horizontalAlignment = "center";
ws.getRange("D13:G13").format.horizontalAlignment = "center";
ws.getRange("H13").format = {
  fill: "#C6EFCE",
  font: { bold: true, color: "#006100" },
  horizontalAlignment: "center",
  borders: { preset: "all", style: "thin", color: "#A6A6A6" },
};

ws.getRange("A15:H15").merge();
ws.getRange("A15").values = [["Execution Notes"]];
ws.getRange("A15").format = {
  fill: "#EEECE1",
  font: { bold: true, color: "#7F6000" },
  borders: { preset: "outside", style: "thin", color: "#A6A6A6" },
};
ws.getRange("A16:H20").merge();
ws.getRange("A16").values = [[
  "Initial backend unit-test run failed in two suites because test mocks were outdated: DeliveriesService mock missed delivery.findMany; NotificationsService mock missed user.findUnique/user.update. After updating those mocks and rerunning the same command, all backend unit tests passed. The warning about last_broadcast_at is intentionally covered by the delivery test and did not fail the suite.",
]];
ws.getRange("A16").format = {
  wrapText: true,
  verticalAlignment: "top",
  borders: { preset: "outside", style: "thin", color: "#A6A6A6" },
};
ws.getRange("A16").format.rowHeight = 95;

ws.getRange("A22:H22").values = [[
  "Mapped Report Area",
  "Evidence Type",
  "Related Workbook Sheets",
  "Actual Result",
  "How to Record in Manual Sheets",
  "",
  "",
  "",
]];
ws.getRange("A22:H22").format = {
  fill: "#548235",
  font: { bold: true, color: "#FFFFFF" },
  borders: { preset: "all", style: "thin", color: "#000000" },
  horizontalAlignment: "center",
};
ws.getRange("A23:H25").values = [
  [
    "Backend service/unit logic",
    "Automated Jest unit tests",
    "Login, Register eKYC, Food Listings, Reservations QR, Delivery Shipper, Bulk Notifications, Profile Trust",
    "Passed",
    "Use this sheet as automated-test evidence. Keep manual E2E/user-flow sheets separate unless those flows are executed manually.",
    "",
    "",
    "",
  ],
  [
    "Manual app flow testing",
    "Manual execution required",
    "All feature sheets",
    "Not executed in this command",
    "Do not mark new manual flows as passed from this command alone.",
    "",
    "",
    "",
  ],
  [
    "Backend e2e testing",
    "Separate command required",
    "Test Statistics / relevant feature sheets",
    "Pending",
    "Run pnpm --filter @foodresq/api test:e2e when DB/env are ready, then update this sheet.",
    "",
    "",
    "",
  ],
];
ws.getRange("A23:H25").format = {
  borders: { preset: "all", style: "thin", color: "#A6A6A6" },
  wrapText: true,
  verticalAlignment: "top",
};
ws.getRange("D23").format = { fill: "#C6EFCE", font: { bold: true, color: "#006100" } };
ws.getRange("D24:D25").format = { fill: "#FFF2CC", font: { bold: true, color: "#7F6000" } };

ws.getRange("A1:H40").format.font.name = "Calibri";
ws.getRange("A3:A25").format.font.size = 10;
ws.getRange("B3:H25").format.font.size = 10;
ws.getRange("A1:H40").format.wrapText = true;
ws.getRange("A:A").format.columnWidth = 24;
ws.getRange("B:B").format.columnWidth = 24;
ws.getRange("C:C").format.columnWidth = 34;
ws.getRange("D:D").format.columnWidth = 16;
ws.getRange("E:E").format.columnWidth = 22;
ws.getRange("F:G").format.columnWidth = 12;
ws.getRange("H:H").format.columnWidth = 16;
ws.freezePanes.freezeRows(12);

await fs.mkdir(previewDir, { recursive: true });

const check = await workbook.inspect({
  kind: "table",
  sheetId: sheetName,
  range: "A1:H25",
  include: "values,formulas",
  tableMaxRows: 30,
  tableMaxCols: 8,
  maxChars: 12000,
});
await fs.writeFile(path.join(outputDir, "automated-evidence-check.ndjson"), check.ndjson, "utf8");

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
await fs.writeFile(path.join(outputDir, "formula-errors.ndjson"), errors.ndjson, "utf8");

const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(path.join(previewDir, `${sheetName}.png`), new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
