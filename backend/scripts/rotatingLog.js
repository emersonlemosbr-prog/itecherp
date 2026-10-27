const fs = require('node:fs');
const path = require('node:path');

function rotatingLog(filename, maxBytes = 5 * 1024 * 1024, backups = 3) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.closeSync(fs.openSync(filename, 'a'));
  return message => {
    const line = `${new Date().toISOString()} ${String(message).trimEnd()}\n`;
    if (fs.existsSync(filename) && fs.statSync(filename).size + Buffer.byteLength(line) > maxBytes) {
      for (let i = backups; i >= 1; i--) {
        const target = `${filename}.${i}`;
        const source = i === 1 ? filename : `${filename}.${i - 1}`;
        if (fs.existsSync(target)) fs.unlinkSync(target);
        if (fs.existsSync(source)) fs.renameSync(source, target);
      }
    }
    fs.appendFileSync(filename, line);
  };
}
module.exports = { rotatingLog };
