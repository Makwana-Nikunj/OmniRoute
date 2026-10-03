const fs = require("fs");
const path = require("path");

const dirsToRemove = [
  "open-sse/mcp-server",
  "src/lib/a2a",
  "src/lib/skills",
  "src/lib/cloudAgent",
  "src/lib/memory",
  "src/lib/db/memoryVec.ts",
];

for (const dir of dirsToRemove) {
  const p = path.join(__dirname, dir);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log(`Removed ${dir}`);
  } else {
    console.log(`${dir} not found`);
  }
}
