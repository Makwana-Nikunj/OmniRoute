/**
 * One-off analysis: walk src/ + open-sse/, resolve every relative and "@/..."
 * import, and report files whose imports do not resolve on disk.
 * Used to finish the lean-gateway pruning at the importer level (delete orphaned
 * routes / restore UI-backed modules). Throwaway — safe to delete after use.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const exts = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];

function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = path.join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith("@omniroute/open-sse/"))
    base = path.join(ROOT, "open-sse", spec.slice(20));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return "external";
  for (const e of exts) {
    const candidate = base + e;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const files = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "open-sse"))];
const broken = [];

for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const specs = new Set();
  const patterns = [
    /from\s*"([^"]+)"/g,
    /import\s*"([^"]+)"/g,
    /import\(\s*"([^"]+)"/g,
    /require\(\s*"([^"]+)"/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src))) specs.add(m[1]);
  }
  for (const spec of specs) {
    const resolved = resolveSpec(spec, f);
    if (resolved === null) {
      broken.push({ file: path.relative(ROOT, f), spec });
    }
  }
}

broken.sort((a, b) => a.spec.localeCompare(b.spec) || a.file.localeCompare(b.file));
const bySpec = new Map();
for (const b of broken) {
  if (!bySpec.has(b.spec)) bySpec.set(b.spec, []);
  bySpec.get(b.spec).push(b.file);
}
console.log(`BROKEN_FILES=${new Set(broken.map((b) => b.file)).size} MISSING_SPECS=${bySpec.size}`);
for (const [spec, importers] of [...bySpec.entries()].sort()) {
  console.log(`${spec} <- ${importers.join(", ")}`);
}
