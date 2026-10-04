const fs = require('fs');
let code = fs.readFileSync('src/lib/providers/validation/specialtyInline.ts', 'utf8');
code = code.replace(/\/\/ key to check upstream[\s\S]*?return \{ valid[\s\S]*?\}\n\}/, '');
fs.writeFileSync('src/lib/providers/validation/specialtyInline.ts', code);
