const fs = require('fs');

const file = 'open-sse/executors/index.ts';
let code = fs.readFileSync(file, 'utf8');

const toRemoveKeys = [
  'chatgpt-web-codex', 'cgpt-codex',
  'auggie', 
  'cheaperinference', 
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
  'bytez'
];

// For each key, we want to match:
// `"key": () => \n? import(...).then(...) \n? ),`
// Or similar.
for (const key of toRemoveKeys) {
  // Regex: 
  // maybe some whitespace
  // key (quoted or unquoted)
  // : () => 
  // maybe some newline/space
  // import( ... ) .then( ... )
  // maybe some newline/space/comments
  // ending with comma or just end of block
  
  // Since they are formatted somewhat uniformly:
  const regexLiteral = new RegExp(`\s*["']?${key}["']?\s*:\s*\(\)\s*=>[\s\S]*?\)\s*,?(?:\s*\/\/.*)?`, 'g');
  code = code.replace(regexLiteral, '');
}

fs.writeFileSync(file, code);
