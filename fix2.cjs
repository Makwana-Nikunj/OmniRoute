const fs = require('fs');

// Fix validation.ts safely
let valCode = fs.readFileSync('src/lib/providers/validation.ts', 'utf8');
valCode = valCode.replace(/\s*validateJulesProvider,\s*/, ' ');
valCode = valCode.replace(/\s*validateDevinCloudAgentProvider,\s*/, ' ');
valCode = valCode.replace(/\s*validateAuggieProvider,\s*/, ' ');
valCode = valCode.replace(/\s*jules:\s*validateJulesProvider,\s*/, '\n');
valCode = valCode.replace(/\s*\/\*\s*devin\s*\*\/[\s\S]*?devin:\s*validateDevinCloudAgentProvider,\s*/, '\n');
valCode = valCode.replace(/\s*\/\/\s*["']devin["'].*?\n\s*\/\/.*?\n\s*\/\/.*?\n\s*devin:\s*validateDevinCloudAgentProvider,\s*/, '\n');
valCode = valCode.replace(/\s*devin:\s*validateDevinCloudAgentProvider,\s*/, '\n');
valCode = valCode.replace(/\s*auggie:\s*validateAuggieProvider,\s*/, '\n');
fs.writeFileSync('src/lib/providers/validation.ts', valCode);

// Fix open-sse/executors/index.ts safely
let execCode = fs.readFileSync('open-sse/executors/index.ts', 'utf8');

const toRemove = [
  'chatgpt-web-codex', 'auggie', 'cheaperinference', 'julesApi', 'chatgpt-web',
  'cloudflare-ai', 'perplexity-web', 'gemini-web', 'blackbox-web', 'muse-spark-web',
  'devin-desktop', 'devin-cli', 'devin-cli-agentic', 'deepseek-web-with-auto-refresh',
  'adapta-web', 'copilot-web', 'copilot-m365-web', 'adobe-firefly', 'duckduckgo-web',
  't3-chat-web', 'notion-web', 'doubao-web', 'inner-ai', 'claude-web', 'qoder', 'bytez'
];

for(let id of toRemove) {
  // Replace import statement
  let rImport = new RegExp(`^.*?import.*?['"\`].*?${id}.*?['"\`].*?$`, 'gm');
  execCode = execCode.replace(rImport, '');
  
  // Replace mapping inside the executors dictionary:
  // e.g. "chatgpt-web-codex": createChatGptWebCodexExecutor,
  // or case 'chatgpt-web-codex': return new ...
  // Since it's a map (presumably):
  let keyRegex = new RegExp(`\s*["']?${id}["']?\s*:\s*[\w.]+,\n?`, 'g');
  execCode = execCode.replace(keyRegex, '\n');
}

fs.writeFileSync('open-sse/executors/index.ts', execCode);

