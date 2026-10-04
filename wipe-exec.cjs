const fs = require('fs');

const file = 'open-sse/executors/index.ts';
let lines = fs.readFileSync(file, 'utf8').split('\n');
const toRemove = [
  'chatgpt-web-codex', 'auggie', 'cheaperinference', 'julesApi', 'chatgpt-web',
  'cloudflare-ai', 'perplexity-web', 'gemini-web', 'blackbox-web', 'muse-spark-web',
  'devin-desktop', 'devin-cli', 'devin-cli-agentic', 'deepseek-web-with-auto-refresh',
  'adapta-web', 'copilot-web', 'copilot-m365-web', 'adobe-firefly', 'duckduckgo-web',
  't3-chat-web', 'notion-web', 'doubao-web', 'inner-ai', 'claude-web', 'qoder', 'bytez'
];

lines = lines.map(line => {
  if (toRemove.some(id => line.includes(id))) {
    return '// removed ' + line.trim();
  }
  return line;
});

fs.writeFileSync(file, lines.join('\n'));
