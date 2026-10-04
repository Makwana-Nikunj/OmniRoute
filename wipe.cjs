const fs = require('fs');

const file = 'open-sse/executors/index.ts';
let code = fs.readFileSync(file, 'utf8');

const toRemoveKeys = [
  'chatgpt-web-codex', 'cgpt-codex',
  'auggie', 'aie', // whatever auggie alias is
  'cheaperinference', 'chi',
  'julesApi',
  'chatgpt-web', 'cgpt-web',
  'cloudflare-ai', 'cf-ai',
  'perplexity-web', 'perp-web',
  'gemini-web', 'gem-web',
  'blackbox-web', 'bb-web',
  'muse-spark-web', 'ms-web',
  'devin-desktop',
  'devin-cli', 'devin',
  'devin-cli-agentic',
  'deepseek-web', 'ds-web',
  'adapta-web', 'adp-web',
  'copilot-web', 'cpl-web',
  'copilot-m365-web', 'm365-web',
  'adobe-firefly', 'firefly',
  'duckduckgo-web', 'ddg-web',
  't3-chat-web', 't3-web',
  'notion-web', 'not-web',
  'doubao-web', 'db-web',
  'inner-ai',
  'claude-web', 'cld-web',
  'qoder',
  'bytez',
  'coze' // just in case
];

for (const key of toRemoveKeys) {
  const regex = new RegExp(`\\s*["']?${key}["']?\\s*:\\s*\\(\\)\\s*=>[\\s\\S]*?\\)\\s*,?(?:\\s*\\/\\/.*)?`, 'g');
  // Wait, `[\s\S]*?)` is too greedy and will match all the way to the LAST parenthesis of the file!
  // It needs to match until the FIRST `),` or `) // Alias`
  // A safer regex:
  const safeRegex = new RegExp(`\\s*["']?${key}["']?\\s*:\\s*\\(\\)\\s*=>[^]*?\\.then\\([^\\)]+\\)\\) *(?:,|(?:\\/\\/.*))?`, 'g');
  code = code.replace(safeRegex, '');
}

// Clean up any stray commas
code = code.replace(/,\s*,/g, ',');
fs.writeFileSync(file, code);
