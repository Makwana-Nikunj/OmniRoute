#!/usr/bin/env node
/**
 * Remove suppression entries whose files no longer exist.
 * Phase 1+2 deleted many files; their suppression entries need pruning.
 */
import { readFileSync, writeFileSync } from "node:fs";

const suppressionsPath = new URL("../../config/quality/eslint-suppressions.json", import.meta.url);
const obj = JSON.parse(readFileSync(suppressionsPath, "utf8"));

// Get all tracked files via git ls-files (run from project root)
import { execSync } from "node:child_process";
const gitRoot = new URL("../../", import.meta.url);
const files = execSync("git ls-files", { cwd: gitRoot }).toString().split("\n").filter(Boolean);
const fileSet = new Set(files);

const before = Object.keys(obj).length;
let removed = 0;
for (const key of Object.keys(obj)) {
  if (!fileSet.has(key)) {
    delete obj[key];
    removed++;
  }
}

writeFileSync(suppressionsPath, JSON.stringify(obj, null, 2) + "\n");
console.log(`Removed ${removed} stale entries (${before} → ${before - removed})`);
