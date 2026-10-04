const fs = require('fs');
let code = fs.readFileSync('src/instrumentation-node.ts', 'utf8');

// Replace these blocks:
code = code.replace(/\s*\/\/ Conductor bridge[\s\S]*?NON-FATAL\):\s*",\s*msg\s*\);\s*}\),/gi, '');
code = code.replace(/\s*\/\/ Conductor bridge[\s\S]*?failed to start \(non-fatal\):",\s*msg\s*\);\s*}\),/gi, '');
code = code.replace(/\s*\/\/ TV6 typed memory decay[\s\S]*?decay sweep failed to start \(non-fatal\):",\s*msg\s*\);\s*}\),/gi, '');
code = code.replace(/\s*\/\/ MemoryBackend provider pattern[\s\S]*?memory backend initialization failed \(non-fatal\):",\s*msg\s*\);\s*}\),/gi, '');
code = code.replace(/\s*\/\/ Backup schedule[\s\S]*?backup schedule job failed to start \(non-fatal\):",\s*msg\s*\);\s*}\),/gi, '');
code = code.replace(/\s*\/\/ Radar daily feed sync[\s\S]*?Radar sync scheduler failed to start \(non-fatal\):",\s*msg\s*\);\s*}\),/gi, '');

fs.writeFileSync('src/instrumentation-node.ts', code);
