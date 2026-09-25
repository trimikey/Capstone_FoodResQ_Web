const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const inputPath = path.join(root, 'docs', 'foodresq.dbml');
const outputPath = path.join(root, 'docs', 'foodresq.drawio');

const dbml = fs.readFileSync(inputPath, 'utf8');

function escXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escHtml(value) {
  return escXml(value).replace(/\n/g, '<br>');
}

function tableSections(source) {
  const tables = [];
  const re = /Table\s+([A-Za-z0-9_"]+)\s*\{/g;
  let match;
  while ((match = re.exec(source))) {
    const name = match[1].replace(/"/g, '');
    let depth = 1;
    let i = re.lastIndex;
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      if (source[i] === '}') depth -= 1;
      if (depth === 0) break;
    }
    tables.push({ name, body: source.slice(re.lastIndex, i) });
    re.lastIndex = i + 1;
  }
  return tables;
}

function parseTables(source) {
  return tableSections(source).map(({ name, body }) => {
    const columns = [];
    const refs = [];
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line === 'indexes {' || line === '}' || line.startsWith('(')) continue;
      const attrStart = line.indexOf('[');
      const definition = (attrStart === -1 ? line : line.slice(0, attrStart)).trim();
      const attrs = attrStart === -1 ? '' : line.slice(attrStart);
      const column = definition.match(/^"?(?<name>[A-Za-z0-9_]+)"?\s+(?<type>.+)$/);
      if (!column) continue;
      const columnName = column.groups.name;
      const type = column.groups.type.trim().replace(/^"|"$/g, '');
      const columnInfo = {
        name: columnName,
        type,
        pk: /\bpk\b/.test(attrs),
        fk: false,
        unique: /\bunique\b/.test(attrs),
        nullable: !/\bnot null\b/.test(attrs),
      };
      columns.push(columnInfo);
      const ref = attrs.match(/ref:\s*[<>-]\s*([A-Za-z0-9_"]+)\.([A-Za-z0-9_"]+)/);
      if (ref) {
        columnInfo.fk = true;
        refs.push({
          fromTable: name,
          fromColumn: columnName,
          toTable: ref[1].replace(/"/g, ''),
          toColumn: ref[2].replace(/"/g, ''),
        });
      }
    }
    return { name, columns, refs };
  });
}

const tables = parseTables(dbml);
const tableByName = new Map(tables.map((table) => [table.name, table]));

const groups = [
  { title: 'Users & Profiles', names: ['users', 'provider_profiles', 'receiver_profiles', 'volunteer_profiles', 'volunteer_specializations', 'volunteer_availability', 'delivery_shift_registrations', 'liability_waivers', 'refresh_tokens', 'verification_requests'] },
  { title: 'Listings / Reservations / Delivery', names: ['food_listings', 'reservations', 'reservation_messages', 'deliveries', 'shipper_task_offers', 'bulk_runs', 'bulk_run_stops'] },
  { title: 'Kitchen Campaigns', names: ['kitchen_campaigns', 'campaign_shifts', 'campaign_volunteer_assignments', 'campaign_change_requests', 'campaign_provider_requests', 'campaign_donations', 'campaign_transports', 'campaign_ingredient_pickups', 'provider_proposals', 'campaign_experiences'] },
  { title: 'Recipes / Kitchen Ops', names: ['recipes', 'recipe_ingredients', 'campaign_menu_items', 'campaign_dish_steps', 'kitchen_safety_logs', 'meal_distributions', 'meal_feedback', 'receiver_handoff_qr_tokens', 'meal_handoffs', 'beneficiary_feedback'] },
  { title: 'Catalog / Trust / System', names: ['food_catalog_categories', 'food_catalog_items', 'ratings', 'trust_score_history', 'dedication_points_history', 'reports', 'notifications', 'audit_logs', 'system_configs', 'esg_snapshots'] },
];

const groupColors = [
  { header: '#dbeafe', headerBorder: '#93c5fd', accent: '#2563eb', light: '#eff6ff', border: '#60a5fa', row: '#f8fbff', edge: '#1d4ed8' },
  { header: '#dcfce7', headerBorder: '#86efac', accent: '#16a34a', light: '#f0fdf4', border: '#4ade80', row: '#f7fef9', edge: '#15803d' },
  { header: '#fef3c7', headerBorder: '#fcd34d', accent: '#d97706', light: '#fffbeb', border: '#f59e0b', row: '#fffaf0', edge: '#b45309' },
  { header: '#ede9fe', headerBorder: '#c4b5fd', accent: '#7c3aed', light: '#f5f3ff', border: '#a78bfa', row: '#fbfaff', edge: '#6d28d9' },
  { header: '#ffe4e6', headerBorder: '#fda4af', accent: '#e11d48', light: '#fff1f2', border: '#fb7185', row: '#fff8f9', edge: '#be123c' },
];

const pageMargin = 80;
const tableWidth = 380;
const groupSpacing = 760;
const tableGap = 76;
const headerY = 54;
const firstTableY = 90;
const rowHeight = 34;
const tableHeaderHeight = 82;

const layout = new Map();
let maxBottom = 0;
groups.forEach((group, groupIndex) => {
  const x = pageMargin + groupIndex * groupSpacing;
  let y = firstTableY;
  for (const name of group.names) {
    const table = tableByName.get(name);
    if (!table) continue;
    const height = tableHeaderHeight + table.columns.length * rowHeight;
    layout.set(name, { x, y, width: tableWidth, height, groupIndex, colors: groupColors[groupIndex] });
    y += height + tableGap;
  }
  maxBottom = Math.max(maxBottom, y);
});

const pageWidth = pageMargin * 2 + (groups.length - 1) * groupSpacing + tableWidth;

let id = 2;
const idByTable = new Map();
const tableCells = [];
const cells = [
  '<mxCell id="0"/>',
  '<mxCell id="1" parent="0"/>',
];

cells.push(
  `<mxCell id="${id}" value="FoodResQ Database Design" style="text;html=1;strokeColor=none;fillColor=none;fontSize=28;fontStyle=1;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;" vertex="1" parent="1"><mxGeometry x="${pageMargin}" y="20" width="600" height="36" as="geometry"/></mxCell>`,
);
id += 1;

groups.forEach((group, groupIndex) => {
  const colors = groupColors[groupIndex];
  cells.push(
    `<mxCell id="${id}" value="${escXml(group.title)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=${colors.header};strokeColor=${colors.border};fontColor=${colors.edge};fontSize=16;fontStyle=1;align=center;verticalAlign=middle;arcSize=8;" vertex="1" parent="1"><mxGeometry x="${pageMargin + groupIndex * groupSpacing}" y="${headerY}" width="${tableWidth}" height="28" as="geometry"/></mxCell>`,
  );
  id += 1;
});

for (const table of tables) {
  const box = layout.get(table.name);
  if (!box) continue;
  const cellId = String(id);
  id += 1;
  idByTable.set(table.name, cellId);
  const colors = box.colors;
  const rows = table.columns.map((column) => {
    const marker = column.pk ? '🔑' : column.unique ? '◇' : column.nullable ? '□' : '■';
    return `<div style="display:flex;gap:6px;border-top:1px solid #e5e7eb;padding:3px 8px;"><span style="width:18px;color:#0f766e;">${marker}</span><span style="flex:1;">${escHtml(column.name)}</span><span style="color:#64748b;">${escHtml(column.type)}</span></div>`;
  });
  const label = `<div style="font-family:Arial;font-size:12px;"><div style="background:#e9edf3;border-bottom:1px solid #d5dbe5;padding:6px 8px;font-weight:700;">👁 public<br><span style="font-size:13px;">${escHtml(table.name)}</span></div>${rows.join('')}</div>`;
  const prettyRows = table.columns.map((column) => {
    const icon = column.pk
      ? '<span style="color:#eab308;">&#128273;</span>'
      : column.fk
        ? '<span style="color:#94a3b8;">&#128273;</span>'
        : `<span style="color:${colors.accent};">&#9647;</span>`;
    const rowBg = column.fk ? '#f8fafc' : colors.row;
    return `<div style="display:flex;align-items:flex-start;gap:8px;min-height:27px;border-top:1px solid ${colors.headerBorder};padding:5px 10px;line-height:1.35;background:${rowBg};"><span style="width:16px;font-size:14px;text-align:center;">${icon}</span><span style="flex:1;color:#1f2937;white-space:normal;word-break:break-word;">${escHtml(column.name)} <span style="color:#475569;">${escHtml(column.type)}</span></span></div>`;
  });
  const prettyLabel = [
    '<div style="font-family:Arial;font-size:12px;color:#374151;">',
    `<div style="height:34px;background:${colors.header};border-bottom:1px solid ${colors.headerBorder};display:flex;align-items:center;padding:0 8px;">`,
    `<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:24px;border:1px solid ${colors.border};border-radius:4px;background:#ffffff;color:${colors.edge};font-size:16px;">&#128065;</span>`,
    '</div>',
    `<div style="display:flex;align-items:center;gap:8px;height:24px;border-bottom:1px solid ${colors.headerBorder};padding:0 10px;background:${colors.light};">`,
    `<span style="color:${colors.accent};font-size:17px;">&#9671;</span><span>public</span>`,
    '</div>',
    `<div style="display:flex;align-items:center;gap:8px;height:24px;border-bottom:1px solid ${colors.headerBorder};padding:0 10px;font-weight:700;background:#ffffff;">`,
    `<span style="color:${colors.accent};font-size:16px;">&#9638;</span><span style="color:${colors.edge};">${escHtml(table.name)}</span>`,
    '</div>',
    prettyRows.join(''),
    '</div>',
  ].join('');
  tableCells.push(
    `<mxCell id="${cellId}" value="${escXml(prettyLabel)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=${colors.border};strokeWidth=2;shadow=0;arcSize=4;spacing=0;overflow=fill;" vertex="1" parent="1"><mxGeometry x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" as="geometry"/></mxCell>`,
  );
}

function sideForRef(ref, sequence) {
  const sourceBox = layout.get(ref.fromTable);
  const targetBox = layout.get(ref.toTable);
  if (targetBox.x > sourceBox.x) return { exitSide: 'right', entrySide: 'left' };
  if (targetBox.x < sourceBox.x) return { exitSide: 'left', entrySide: 'right' };
  return sequence % 2 === 0
    ? { exitSide: 'right', entrySide: 'right' }
    : { exitSide: 'left', entrySide: 'left' };
}

function sideX(box, side) {
  return side === 'right' ? box.x + box.width : box.x;
}

function portStyle(prefix, side, fraction) {
  const x = side === 'right' ? 1 : 0;
  return `${prefix}X=${x};${prefix}Y=${fraction.toFixed(3)};${prefix}Perimeter=1`;
}

function columnPortFraction(tableName, columnName) {
  const table = tableByName.get(tableName);
  const box = layout.get(tableName);
  const columnIndex = Math.max(0, table.columns.findIndex((column) => column.name === columnName));
  return (tableHeaderHeight + columnIndex * rowHeight + rowHeight / 2) / box.height;
}

function nextPortFraction(counts, used, tableName, columnName, side) {
  const key = `${tableName}:${columnName}:${side}`;
  const total = counts.get(key) ?? 1;
  const current = used.get(key) ?? 0;
  used.set(key, current + 1);
  const offset = (current - (total - 1) / 2) * 0.012;
  return Math.min(0.96, Math.max(0.04, columnPortFraction(tableName, columnName) + offset));
}

function laneFor(lanes, key) {
  const lane = lanes.get(key) ?? 0;
  lanes.set(key, lane + 1);
  return lane;
}

function routePoints(sourceBox, targetBox, exitSide, entrySide, sourceY, targetY, lane) {
  const sameColumn = sourceBox.x === targetBox.x;
  let laneX;
  if (sameColumn) {
    const side = exitSide === 'right' ? 1 : -1;
    laneX = side === 1
      ? sourceBox.x + sourceBox.width + 28 + lane * 14
      : sourceBox.x - 28 - lane * 14;
  } else {
    const leftBox = sourceBox.x < targetBox.x ? sourceBox : targetBox;
    const rightBox = sourceBox.x < targetBox.x ? targetBox : sourceBox;
    const gapStart = leftBox.x + leftBox.width;
    const gapEnd = rightBox.x;
    const gapWidth = gapEnd - gapStart;
    laneX = gapWidth > 38
      ? gapStart + 24 + ((lane * 18) % Math.max(24, gapWidth - 48))
      : (sideX(sourceBox, exitSide) + sideX(targetBox, entrySide)) / 2;
  }
  return [
    { x: laneX, y: sourceY },
    { x: laneX, y: targetY },
  ];
}

function mxPoints(points) {
  return `<Array as="points">${points.map((point) => `<mxPoint x="${point.x.toFixed(1)}" y="${point.y.toFixed(1)}"/>`).join('')}</Array>`;
}

const edgeCells = [];
const refs = [];
for (const table of tables) {
  for (const ref of table.refs) {
    if (!idByTable.has(ref.fromTable) || !idByTable.has(ref.toTable)) continue;
    refs.push({ ...ref, ...sideForRef(ref, refs.length) });
  }
}

const portCounts = new Map();
for (const ref of refs) {
  for (const [tableName, columnName, side] of [[ref.fromTable, ref.fromColumn, ref.exitSide], [ref.toTable, ref.toColumn, ref.entrySide]]) {
    const key = `${tableName}:${columnName}:${side}`;
    portCounts.set(key, (portCounts.get(key) ?? 0) + 1);
  }
}

const usedPorts = new Map();
const lanes = new Map();
for (const ref of refs) {
  const source = idByTable.get(ref.fromTable);
  const target = idByTable.get(ref.toTable);
  if (!source || !target) continue;
  const sourceBox = layout.get(ref.fromTable);
  const targetBox = layout.get(ref.toTable);
  const edgeColor = sourceBox.colors.edge;
  const exitY = nextPortFraction(portCounts, usedPorts, ref.fromTable, ref.fromColumn, ref.exitSide);
  const entryY = nextPortFraction(portCounts, usedPorts, ref.toTable, ref.toColumn, ref.entrySide);
  const sourceY = sourceBox.y + sourceBox.height * exitY;
  const targetY = targetBox.y + targetBox.height * entryY;
  const laneKey = `${Math.min(sourceBox.x, targetBox.x)}:${Math.max(sourceBox.x, targetBox.x)}:${ref.exitSide}:${ref.entrySide}`;
  const lane = laneFor(lanes, laneKey);
  const points = routePoints(sourceBox, targetBox, ref.exitSide, ref.entrySide, sourceY, targetY, lane);
  const style = [
    'edgeStyle=orthogonalEdgeStyle',
    'rounded=0',
    'orthogonalLoop=1',
    'jettySize=auto',
    'html=1',
    'endArrow=ERone',
    'startArrow=ERmany',
    `strokeColor=${edgeColor}`,
    'strokeWidth=1.5',
    'fontSize=9',
    'fontColor=#334155',
    'labelBackgroundColor=#ffffff',
    portStyle('exit', ref.exitSide, exitY),
    portStyle('entry', ref.entrySide, entryY),
  ].join(';');
  edgeCells.push(
    `<mxCell id="${id}" value="" style="${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry">${mxPoints(points)}</mxGeometry></mxCell>`,
  );
  id += 1;
}

for (const table of []) {
  for (const ref of table.refs) {
    const source = idByTable.get(ref.fromTable);
    const target = idByTable.get(ref.toTable);
    if (!source || !target) continue;
    cells.push(
      `<mxCell id="${id}" value="${escXml(ref.fromColumn)} → ${escXml(ref.toColumn)}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=ERoneToMany;startArrow=ERone;strokeColor=#64748b;fontSize=10;" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
    );
    id += 1;
  }
}

const xml = `<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="Codex" version="24.7.17" type="device">
  <diagram id="foodresq-erd" name="FoodResQ ERD">
    <mxGraphModel dx="2200" dy="1200" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${Math.max(1600, maxBottom + pageMargin)}" math="0" shadow="0">
      <root>
        ${cells.concat(edgeCells, tableCells).join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;

fs.writeFileSync(outputPath, xml);
console.log(`Wrote ${path.relative(root, outputPath)} (${tables.length} tables)`);
