const fs = require('fs');

function removeMatches(file, regex) {
  if (fs.existsSync(file)) {
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(regex, '');
    fs.writeFileSync(file, code);
  }
}

removeMatches('src/lib/providers/validation/webProvidersB.ts', /^.*julesApi.*$/gm);
removeMatches('src/lib/providers/validation/specialtyInline.ts', /^\s*\/\*[\s\S]*?\*\/|(?<=\n)\s*\/\/.*auggie.*(?:(?:\r*\n\s*)+\w+.*)?/gm);

