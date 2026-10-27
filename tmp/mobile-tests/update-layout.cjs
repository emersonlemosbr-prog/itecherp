const fs = require('fs');
const path = require('path');
const parser = require('../../frontend/node_modules/@babel/parser');
const traverse = require('../../frontend/node_modules/@babel/traverse').default;
const root = path.resolve(__dirname, '../../frontend/src');
const changed = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!/\.(jsx|tsx)$/.test(file) || /Print\.|PublicTracking\.|ModalFrame\./.test(file)) continue;
    let source = fs.readFileSync(file, 'utf8');
    const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    const edits = [];
    let modal = false;
    traverse(ast, {
      JSXElement(p) {
        const el = p.node;
        const name = el.openingElement.name.name;
        const attr = el.openingElement.attributes.find(a => a.name?.name === 'className');
        const cls = attr?.value?.value || '';
        if (name === 'table' && !cls.includes('print')) {
          const parent = p.parentPath.node;
          const parentClass = parent.type === 'JSXElement' && parent.openingElement.attributes.find(a => a.name?.name === 'className')?.value;
          if (parentClass?.type === 'StringLiteral' && /overflow-(x-auto|auto)/.test(parentClass.value)) {
            edits.push([parentClass.start + 1, parentClass.start + 1, 'table-scroll ']);
          } else {
            edits.push([el.start, el.start, '<div className="table-scroll" tabIndex={0} role="region" aria-label="Tabela com rolagem horizontal">']);
            edits.push([el.end, el.end, '</div>']);
          }
        }
        if (name === 'div' && (/fixed inset-0/.test(cls) && /z-50/.test(cls) || cls === 'modal-backdrop')) {
          modal = true;
          edits.push([el.openingElement.name.start, el.openingElement.name.end, 'ModalFrame']);
          edits.push([el.closingElement.name.start, el.closingElement.name.end, 'ModalFrame']);
          // Saving state belongs to the existing enclosing component.
          const component = p.getFunctionParent();
          if (component && source.slice(component.node.start, el.start).includes('[saving, setSaving]')) {
            edits.push([el.openingElement.name.end, el.openingElement.name.end, ' busy={saving}']);
          }
        }
      }
    });
    if (!edits.length) continue;
    for (const [start,end,text] of edits.sort((a,b)=>b[0]-a[0] || b[1]-a[1])) source=source.slice(0,start)+text+source.slice(end);
    if (modal) {
      let relative=path.relative(path.dirname(file),path.join(root,'components/UI/ModalFrame')).replaceAll('\\','/');
      if (!relative.startsWith('.')) relative='./'+relative;
      source=`import ModalFrame from '${relative}'\n`+source;
    }
    fs.writeFileSync(file,source);
    changed.push(path.relative(root,file));
  }
}
walk(root);
fs.writeFileSync(path.join(__dirname,'layout-changed.json'),JSON.stringify(changed,null,2));
console.log(changed.join('\n'));
