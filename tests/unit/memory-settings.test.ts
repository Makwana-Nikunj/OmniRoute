import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-memory-settings-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const {
  DEFAULT_MEMORY_SETTINGS,
  getMemorySettings,
  invalidateMemorySettingsCache,
  normalizeMemorySettings,
  toMemorySettingsUpdates,
} = await import("../../src/lib/memory/settings.ts");
const { updateSettings } = await import("../../src/lib/db/settings.ts");
const { resetDbInstance } = await import("../../src/lib/db/core.ts");

describe("memory settings", () => {
  test("normalizeMemorySettings falls back to defaults for missing keys", () => {
    const settings = normalizeMemorySettings({});
    assert.equal(settings.enabled, DEFAULT_MEMORY_SETTINGS.enabled);
    assert.equal(settings.retentionDays, DEFAULT_MEMORY_SETTINGS.retentionDays);
    assert.equal(settings.maxTokens, DEFAULT_MEMORY_SETTINGS.maxTokens);
  });

  test("getMemorySettings returns the persisted retention, not the hardcoded default", async () => {
    // Regression: the lean-gateway stub returned DEFAULT_MEMORY_SETTINGS
    // unconditionally, so the destructive Qdrant retention cleanup
    // (POST /api/settings/qdrant/cleanup) deleted points older than the
    // hardcoded 30 days instead of the operator-configured window.
    await updateSettings({ memoryRetentionDays: 90 });
    invalidateMemorySettingsCache();

    const settings = await getMemorySettings();
    assert.equal(settings.retentionDays, 90);
  });

  test("invalidateMemorySettingsCache re-reads persisted values", async () => {
    await updateSettings({ memoryRetentionDays: 15 });
    invalidateMemorySettingsCache();
    assert.equal((await getMemorySettings()).retentionDays, 15);

    await updateSettings({ memoryRetentionDays: 60 });
    invalidateMemorySettingsCache();
    assert.equal((await getMemorySettings()).retentionDays, 60);
  });

  test("toMemorySettingsUpdates round-trips through normalizeMemorySettings", () => {
    const updates = toMemorySettingsUpdates({ retentionDays: 45, strategy: "recent" });
    const normalized = normalizeMemorySettings(updates);
    assert.equal(normalized.retentionDays, 45);
    assert.equal(normalized.strategy, "recent");
  });

  test("out-of-range values are clamped to the documented bounds", () => {
    assert.equal(normalizeMemorySettings({ memoryRetentionDays: 0 }).retentionDays, 1);
    assert.equal(normalizeMemorySettings({ memoryRetentionDays: 9999 }).retentionDays, 365);
  });
});

test.after(async () => {
  invalidateMemorySettingsCache();
  resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
