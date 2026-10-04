const fs = require('fs');
let code = fs.readFileSync('src/lib/providers/validation/webProvidersB.ts', 'utf8');
code = code.replace(/export async function validateJulesProvider[\s\S]*?\}\s*\}[\s\S]*?\}\s*\}/, '');
fs.writeFileSync('src/lib/providers/validation/webProvidersB.ts', code);
