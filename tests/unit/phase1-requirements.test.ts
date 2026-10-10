import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isComboActive, getCombo, getComboForModel } from "../../src/sse/services/model.ts";
import { parseAutoPrefix, VALID_VARIANTS } from "../../open-sse/services/autoCombo/autoPrefix.ts";
import {
  classifyTask,
  reorderByTaskWeight,
  MIN_TASK_ROUTING_CONFIDENCE,
} from "../../open-sse/services/taskAwareRouting.ts";
import { comboModelStepInputSchema } from "../../src/shared/validation/schemas/combo.ts";
import { normalizeComboStep } from "../../src/lib/combos/steps.ts";
import {
  resolveFeatureFlag,
  isPublicDeploymentEnvironment,
} from "../../src/shared/utils/featureFlags.ts";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-phase1-tests-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const combosDb = await import("../../src/lib/db/combos.ts");

test.beforeEach(async () => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("isComboActive respects isActive flag and is_active number", () => {
  assert.equal(isComboActive(null), false);
  assert.equal(isComboActive({ isActive: false }), false);
  assert.equal(isComboActive({ is_active: false }), false);
  assert.equal(isComboActive({ is_active: 0 }), false);
  assert.equal(isComboActive({ isActive: true, is_active: 1 }), true);
  assert.equal(isComboActive({}), true);
});

test("getCombo and getComboForModel filter out disabled combos", async () => {
  await combosDb.createCombo({
    name: "ACTIVE-COMBO",
    isActive: true,
    models: [{ provider: "groq", model: "llama-3.1-8b" }],
  });

  await combosDb.createCombo({
    name: "DISABLED-COMBO",
    isActive: false,
    models: [{ provider: "groq", model: "llama-3.1-8b" }],
  });

  const active = await getCombo("ACTIVE-COMBO");
  assert.ok(active, "Active combo must resolve");
  assert.equal((active as { name: string }).name, "ACTIVE-COMBO");

  const disabled = await getCombo("DISABLED-COMBO");
  assert.equal(disabled, null, "Disabled combo must not resolve by default");

  const disabledForModel = await getComboForModel("DISABLED-COMBO");
  assert.equal(disabledForModel, null, "Disabled combo must not resolve in getComboForModel");

  const disabledExplicit = await getCombo("DISABLED-COMBO", { includeDisabled: true });
  assert.ok(disabledExplicit, "Disabled combo resolves when includeDisabled: true");
  assert.equal((disabledExplicit as { name: string }).name, "DISABLED-COMBO");
});

test("autoPrefix recognizes prlens and embeddings presets", () => {
  assert.ok(VALID_VARIANTS.includes("prlens"));
  assert.ok(VALID_VARIANTS.includes("embeddings"));

  const prlens = parseAutoPrefix("auto/prlens");
  assert.equal(prlens.valid, true);
  assert.equal(prlens.variant, "prlens");

  const embeddings = parseAutoPrefix("auto/embeddings");
  assert.equal(embeddings.valid, true);
  assert.equal(embeddings.variant, "embeddings");
});

test("taskAwareRouting calculates confidence and gates reorderByTaskWeight", () => {
  const critical = classifyTask({
    reasoning: { effort: "high" },
    messages: [{ role: "user", content: "security vulnerability exploit audit" }],
  });
  assert.equal(critical.level, "critical");
  assert.ok(typeof critical.confidence === "number");
  assert.ok(critical.confidence >= 0.85);

  const targets = [
    {
      kind: "model" as const,
      stepId: "step-1",
      executionKey: "key-1",
      modelStr: "provider-a/haiku",
      provider: "provider-a",
      providerId: null,
      connectionId: null,
      weight: 1,
      label: null,
    },
    {
      kind: "model" as const,
      stepId: "step-2",
      executionKey: "key-2",
      modelStr: "provider-a/opus",
      provider: "provider-a",
      providerId: null,
      connectionId: null,
      weight: 1,
      label: null,
    },
  ];

  // Low confidence task classification
  const lowConfidenceTask = {
    ...critical,
    confidence: 0.4,
  };

  const unchanged = reorderByTaskWeight(
    targets,
    lowConfidenceTask,
    new Set(),
    MIN_TASK_ROUTING_CONFIDENCE
  );
  assert.deepEqual(
    unchanged,
    targets,
    "Targets should not reorder when confidence is below threshold"
  );
});

test("combo step schemas and normalization preserve per-model inference parameters", () => {
  const parsed = comboModelStepInputSchema.parse({
    kind: "model",
    model: "anthropic/claude-3-opus",
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 4096,
    max_completion_tokens: 4096,
  });

  assert.equal(parsed.temperature, 0.7);
  assert.equal(parsed.top_p, 0.9);
  assert.equal(parsed.max_tokens, 4096);
  assert.equal(parsed.max_completion_tokens, 4096);

  const normalized = normalizeComboStep({
    model: "anthropic/claude-3-opus",
    temperature: 0.5,
    top_p: 0.85,
    max_tokens: 2048,
  });

  assert.ok(normalized && normalized.kind === "model");
  assert.equal(normalized.temperature, 0.5);
  assert.equal(normalized.top_p, 0.85);
  assert.equal(normalized.max_tokens, 2048);
});

test("REQUIRE_API_KEY defaults to true in public deployment environments", () => {
  const originalRender = process.env.RENDER;
  const originalKey = process.env.REQUIRE_API_KEY;

  try {
    delete process.env.REQUIRE_API_KEY;

    process.env.RENDER = "true";
    assert.equal(isPublicDeploymentEnvironment(), true);
    assert.equal(resolveFeatureFlag("REQUIRE_API_KEY"), "true");

    delete process.env.RENDER;
    assert.equal(isPublicDeploymentEnvironment(), false);
    assert.equal(resolveFeatureFlag("REQUIRE_API_KEY"), "false");
  } finally {
    if (originalRender !== undefined) process.env.RENDER = originalRender;
    else delete process.env.RENDER;

    if (originalKey !== undefined) process.env.REQUIRE_API_KEY = originalKey;
    else delete process.env.REQUIRE_API_KEY;
  }
});
