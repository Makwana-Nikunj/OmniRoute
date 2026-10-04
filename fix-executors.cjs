const fs = require('fs');

let code = fs.readFileSync('open-sse/executors/index.ts', 'utf8');

// Remove any mapping or import lines that reference deleted files
const deletedExecutors = [
  'chatgpt-web-codex',
  'auggie',
  'cheaperinference',
  'julesApi',
  'chatgpt-web',
  'cloudflare-ai',
  'perplexity-web',
  'gemini-web',
  'blackbox-web',
  'muse-spark-web',
  'devin-desktop',
  'devin-cli',
  'devin-cli-agentic',
  'deepseek-web-with-auto-refresh',
  'adapta-web',
  'copilot-web',
  'copilot-m365-web',
  'adobe-firefly',
  'duckduckgo-web',
  't3-chat-web',
  'notion-web',
  'doubao-web',
  'inner-ai',
  'claude-web',
  'qoder',
  'bytez'
];

let lines = code.split('\n');
lines = lines.filter(line => {
  return !deletedExecutors.some(name => line.includes(name));
});

fs.writeFileSync('open-sse/executors/index.ts', lines.join('\n'));
