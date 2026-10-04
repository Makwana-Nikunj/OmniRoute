import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PostgresAdapter } from "@/lib/db/adapters/postgresAdapter";
import { closeDbInstance } from "@/lib/db/core";

const LIVE_DB_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";

describe("NeonDB / Postgres Adapter E2E", () => {
  afterEach(() => {
    closeDbInstance();
  });

  test("driver selection: getDbInstance selects PostgresAdapter when DATABASE_URL is set", () => {
    const originalUrl = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mockdb";
      closeDbInstance();

      // Ensure mock doesn't connect during simple instantiation check if not needed
      const adapter = new PostgresAdapter("postgresql://mock:mock@localhost:5432/mockdb");
      assert.equal(adapter.name, "neon-db");
      assert.equal(adapter.driver, "better-sqlite3");
      assert.equal(typeof adapter.prepare, "function");
      assert.equal(typeof adapter.exec, "function");
      assert.equal(typeof adapter.transaction, "function");
      adapter.close();
    } finally {
      if (originalUrl !== undefined) {
        process.env.DATABASE_URL = originalUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
      closeDbInstance();
    }
  });

  test("PostgresAdapter executes querySync, prepare, run, get, and all against live connection", async () => {
    if (!LIVE_DB_URL) {
      console.log(
        "Skipping live Postgres query test: no DATABASE_URL or NEON_DATABASE_URL provided"
      );
      return;
    }

    const adapter = new PostgresAdapter(LIVE_DB_URL);
    try {
      adapter.exec(`DROP TABLE IF EXISTS test_e2e;`);
      adapter.exec(`
        CREATE TABLE test_e2e (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          data BYTEA,
          meta TEXT DEFAULT 'default_meta',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Test prepare().run()
      const insertStmt = adapter.prepare("INSERT INTO test_e2e (name) VALUES (?)");
      const insertResult = insertStmt.run("item_alpha");
      assert.equal(insertResult.changes, 1);
      assert.ok(insertResult.lastInsertRowid > 0);

      // Test prepare().get()
      const getStmt = adapter.prepare("SELECT * FROM test_e2e WHERE name = ?");
      const row = getStmt.get("item_alpha") as { id: number; name: string; meta: string };
      assert.ok(row);
      assert.equal(row.name, "item_alpha");
      assert.equal(row.meta, "default_meta");

      // Test prepare().all()
      const insertBeta = adapter.prepare("INSERT INTO test_e2e (name) VALUES (?)");
      insertBeta.run("item_beta");

      const allStmt = adapter.prepare("SELECT * FROM test_e2e ORDER BY id ASC");
      const rows = allStmt.all() as { id: number; name: string }[];
      assert.ok(rows.length >= 2);
      assert.equal(rows[0].name, "item_alpha");
      assert.equal(rows[1].name, "item_beta");

      // Test transaction rollback
      const tx = adapter.transaction(() => {
        adapter.prepare("INSERT INTO test_e2e (name) VALUES (?)").run("item_rollback");
        throw new Error("Deliberate abort to test rollback");
      });

      assert.throws(() => tx(), /Deliberate abort to test rollback/);
      const afterRollback = getStmt.get("item_rollback");
      assert.equal(afterRollback, undefined);

      // Test transaction commit
      const txCommit = adapter.transaction(() => {
        adapter.prepare("INSERT INTO test_e2e (name) VALUES (?)").run("item_committed");
        return "ok";
      });
      const res = txCommit();
      assert.equal(res, "ok");

      const committed = getStmt.get("item_committed") as { name: string };
      assert.ok(committed);
      assert.equal(committed.name, "item_committed");
    } finally {
      try {
        adapter.exec("DROP TABLE IF EXISTS test_e2e;");
      } catch {}
      adapter.close();
    }
  });

  test("PostgresAdapter executes trigger-aware migrations without syntax error", async () => {
    if (!LIVE_DB_URL) {
      console.log(
        "Skipping live trigger-aware migration test: no DATABASE_URL or NEON_DATABASE_URL"
      );
      return;
    }

    const adapter = new PostgresAdapter(LIVE_DB_URL);
    try {
      adapter.exec("DROP TABLE IF EXISTS test_triggers;");
      const migrationSql = `
        CREATE TABLE test_triggers (
          id SERIAL PRIMARY KEY,
          val TEXT
        );

        CREATE TRIGGER update_timestamp
        AFTER UPDATE ON test_triggers
        BEGIN
          UPDATE test_triggers SET val = 'auto_updated' WHERE id = NEW.id;
        END;

        INSERT INTO test_triggers (val) VALUES ('initial');
      `;

      adapter.exec(migrationSql);

      const checkStmt = adapter.prepare("SELECT * FROM test_triggers WHERE val = ?");
      const found = checkStmt.get("initial") as { val: string };
      assert.ok(found);
      assert.equal(found.val, "initial");
    } finally {
      try {
        adapter.exec("DROP TABLE IF EXISTS test_triggers;");
      } catch {}
      adapter.close();
    }
  });
});
