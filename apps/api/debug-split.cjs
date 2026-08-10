const fs = require('fs');
const sql = fs.readFileSync('prisma/migrations/20260809000000_add_campaign_dish_steps/migration.sql', 'utf8');
const stmts = sql.split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(s => s && !s.startsWith('--'));
console.log('Count:', stmts.length);
stmts.forEach((s, i) => {
  console.log(`[${i + 1}] ${s.slice(0, 60).replace(/\n/g, ' ')}`);
});