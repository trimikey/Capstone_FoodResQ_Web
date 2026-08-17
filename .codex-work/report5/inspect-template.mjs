import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/cps/Downloads/Report5_Test Report.xlsx";
const outDir = path.resolve(".codex-work/report5/inspect");
await fs.mkdir(outDir, { recursive: true });

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const overview = await workbook.inspect({
  kind: "workbook,sheet,table,drawing,formula",
  maxChars: 20000,
  tableMaxRows: 12,
  tableMaxCols: 12,
  tableMaxCellChars: 120,
});
await fs.writeFile(path.join(outDir, "overview.ndjson"), overview.ndjson, "utf8");

const sheets = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 4000,
});
await fs.writeFile(path.join(outDir, "sheets.ndjson"), sheets.ndjson, "utf8");
console.log(sheets.ndjson);

for (const line of sheets.ndjson.trim().split(/\r?\n/)) {
  if (!line.trim()) continue;
  const record = JSON.parse(line);
  const sheetName = record.name;
  if (!sheetName) continue;
  const region = await workbook.inspect({
    kind: "region,table,computedStyle",
    sheetId: sheetName,
    range: "A1:Z80",
    maxChars: 12000,
    tableMaxRows: 30,
    tableMaxCols: 16,
    tableMaxCellChars: 120,
  });
  await fs.writeFile(path.join(outDir, `${sheetName.replace(/[\\/:*?"<>|]/g, "_")}.ndjson`), region.ndjson, "utf8");

  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(path.join(outDir, `${sheetName.replace(/[\\/:*?"<>|]/g, "_")}.png`), new Uint8Array(await preview.arrayBuffer()));
}
