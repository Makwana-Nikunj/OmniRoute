const fs = require('fs');

let code = fs.readFileSync('src/lib/providers/validation.ts', 'utf8');

// 1. Remove imports from webProvidersB
code = code.replace(/\s*validateJulesProvider,\s*/g, ' ');
code = code.replace(/\s*validateDevinCloudAgentProvider,\s*/g, ' ');

// 2. Remove imports from specialtyInline
code = code.replace(/\s*validateAuggieProvider,\s*/g, ' ');

// 3. Remove from SPECIALTY_VALIDATORS
code = code.replace(/\s*jules:\s*validateJulesProvider,\s*/g, '\n');
code = code.replace(/\s*\/\/\s*"devin".*?\n\s*\/\/.*?\n\s*\/\/.*?\n\s*devin:\s*validateDevinCloudAgentProvider,\s*/g, '\n');
code = code.replace(/\s*auggie:\s*validateAuggieProvider,\s*/g, '\n');

fs.writeFileSync('src/lib/providers/validation.ts', code);
