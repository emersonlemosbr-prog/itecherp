const fs = require('node:fs');
const path = require('node:path');
const DB = require('../../backend/node_modules/better-sqlite3');
const files = [path.resolve(__dirname, '../../backend/db/itech.db'), 'C:/ProgramData/iTechERP/backend/db/itech.db'];
const reports = files.map(file => {
  const db = new DB(file, { readonly: true, fileMustExist: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const counts = Object.fromEntries(tables.map(t => [t.name, db.prepare('SELECT COUNT(*) n FROM ' + JSON.stringify(t.name)).get().n]));
  const integrity = db.pragma('integrity_check', { simple: true });
  db.close();
  return { file, integrity, counts };
});
const result = { reports, sameCounts: JSON.stringify(reports[0].counts) === JSON.stringify(reports[1].counts) };
fs.writeFileSync(path.join(__dirname, 'database-verification.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ integrity: reports.map(r => r.integrity), tables: Object.keys(reports[0].counts).length, sameCounts: result.sameCounts }));
