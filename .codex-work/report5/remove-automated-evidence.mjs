import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = path.resolve("outputs/report5-foodresq/FoodResQ_Report5_Test_Report.xlsx");
const outputPath = inputPath;
const outputDir = path.dirname(outputPath);

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

try {
  const ws = workbook.worksheets.getItem("Automated Evidence");
  ws.delete();
} catch {
  // Sheet already absent; keep workbook as-is.
}

const sheets = await workbook.inspect({
  kind: "sheet",
  include: "name,index",
  maxChars: 6000,
});
await fs.writeFile(path.join(outputDir, "sheets-after-manual-only.ndjson"), sheets.ndjson, "utf8");

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
await fs.writeFile(path.join(outputDir, "formula-errors.ndjson"), errors.ndjson, "utf8");

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
