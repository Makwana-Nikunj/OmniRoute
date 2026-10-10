import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  convertSql,
  normalizeQueryParams,
  splitSqlStatements,
} from "../../../src/lib/db/adapters/postgresAdapter";

describe("postgresAdapter SQL conversion", () => {
  test("converts INTEGER PRIMARY KEY AUTOINCREMENT to SERIAL PRIMARY KEY", () => {
    const sql = "CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, val TEXT)";
    assert.ok(convertSql(sql).includes("SERIAL PRIMARY KEY"));
  });

  test("converts BLOB to BYTEA", () => {
    const sql = "CREATE TABLE test (data BLOB)";
    assert.ok(convertSql(sql).includes("BYTEA"));
  });

  test("converts IFNULL to COALESCE", () => {
    const sql = "SELECT IFNULL(a, b) FROM test";
    assert.ok(convertSql(sql).includes("COALESCE(a, b)"));
  });

  test("converts datetime('now') to NOW()", () => {
    const sql = "SELECT datetime('now')";
    assert.ok(convertSql(sql).includes("NOW()"));
  });

  test("converts randomblob to gen_random_bytes", () => {
    const sql = "SELECT randomblob(16)";
    assert.ok(convertSql(sql).includes("gen_random_bytes(16)"));
  });

  test("converts hex(randomblob) to encode(gen_random_bytes, 'hex')", () => {
    const sql = "SELECT hex(randomblob(16))";
    assert.ok(convertSql(sql).includes("encode(gen_random_bytes(16), 'hex')"));
  });

  test("converts json_type to jsonb_typeof", () => {
    const sql = "SELECT json_type(data, 'key') FROM test";
    assert.ok(convertSql(sql).includes("jsonb_typeof"));
  });

  test("converts json_extract with $.field and $[index]", () => {
    const sql = "SELECT json_extract(data, '$.userId'), json_extract(arr, '$[0]') FROM test";
    const converted = convertSql(sql);
    assert.ok(converted.includes("data::jsonb->>'userId'"));
    assert.ok(converted.includes("arr::jsonb->>0"));
  });

  test("converts json_type with $.field = 'text' to jsonb_typeof = 'string'", () => {
    const sql = "SELECT * FROM test WHERE json_type(data, '$.name') = 'text'";
    const converted = convertSql(sql);
    assert.ok(converted.includes("jsonb_typeof(data::jsonb->'name') = 'string'"));
  });

  test("converts json_type with $[index] = 'text' to jsonb_typeof = 'string'", () => {
    const sql = "SELECT * FROM test WHERE json_type(arr, '$[0]') = 'text'";
    const converted = convertSql(sql);
    assert.ok(converted.includes("jsonb_typeof(arr::jsonb->0) = 'string'"));
  });

  test("converts json_array and json_array_length", () => {
    const sql = "SELECT json_array('a', 'b'), json_array_length(data) FROM test";
    const converted = convertSql(sql);
    assert.ok(converted.includes("jsonb_build_array('a', 'b')"));
    assert.ok(converted.includes("jsonb_array_length(data::jsonb)"));
  });

  test("converts json_valid to IS NOT NULL", () => {
    const sql = "SELECT json_valid(data) FROM test";
    assert.ok(convertSql(sql).includes("IS NOT NULL"));
  });

  test("converts char(N) to chr(N)", () => {
    const sql = "SELECT char(10)";
    assert.ok(convertSql(sql).includes("chr(10)"));
  });

  test("converts IS NOT 'value' to <> 'value'", () => {
    const sql = "SELECT * FROM test WHERE status IS NOT 'unavailable'";
    assert.ok(convertSql(sql).includes("<> 'unavailable'"));
    assert.ok(!convertSql(sql).includes("IS NOT 'unavailable'"));
  });

  test("preserves IS NOT NULL", () => {
    const sql = "SELECT * FROM test WHERE data IS NOT NULL";
    assert.ok(convertSql(sql).includes("IS NOT NULL"));
  });

  test("converts INSERT OR IGNORE to ON CONFLICT DO NOTHING", () => {
    const sql = "INSERT OR IGNORE INTO test (id) VALUES (1)";
    assert.ok(convertSql(sql).includes("ON CONFLICT DO NOTHING"));
  });

  test("converts INSERT OR REPLACE to ON CONFLICT for key_value", () => {
    const sql = "INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('ns', 'k', 'v')";
    const converted = convertSql(sql);
    assert.ok(
      converted.includes("ON CONFLICT (namespace, key) DO UPDATE SET value = EXCLUDED.value")
    );
  });

  test("converts PRAGMA table_info to information_schema query", () => {
    const sql = "PRAGMA table_info(test)";
    assert.ok(convertSql(sql).includes("information_schema.columns"));
  });

  test("converts sqlite_master query to information_schema.tables", () => {
    const sql = "SELECT name FROM sqlite_master WHERE type='table' AND name=$1";
    assert.ok(convertSql(sql).includes("information_schema.tables"));
    assert.ok(convertSql(sql).includes("table_name = $1"));
  });

  test("converts COLLATE NOCASE equality to LOWER comparison", () => {
    // getComboByNameInsensitive (#4446 lowercased-slug lookup) relies on this
    const sql = "SELECT id FROM combos WHERE name = ? COLLATE NOCASE";
    const converted = convertSql(sql);
    assert.ok(converted.includes("LOWER(name) = LOWER($1)"), converted);
    assert.ok(!converted.includes("COLLATE"));
  });

  test("converts COLLATE NOCASE ordering to LOWER", () => {
    const sql = "SELECT id FROM combos ORDER BY sort_order ASC, name COLLATE NOCASE ASC";
    const converted = convertSql(sql);
    assert.ok(converted.includes("LOWER(name) ASC"), converted);
    assert.ok(!converted.includes("COLLATE"));
  });
});

describe("postgresAdapter normalizeQueryParams", () => {
  test("keeps PostgreSQL :: casts intact while binding @named params", () => {
    const sql = "SELECT data::jsonb->>'k' FROM t WHERE id = @id";
    const { sql: converted, params } = normalizeQueryParams(sql, [{ id: 7 }]);
    assert.equal(converted, "SELECT data::jsonb->>'k' FROM t WHERE id = $1");
    assert.deepEqual(params, [7]);
  });

  test("keeps ::timestamp casts produced by the datetime(column) rule", () => {
    // Real trigger: convertSql rewrites datetime(timestamp) to a ::timestamp cast,
    // then getAuditLog binds named params — the cast must survive binding.
    const converted = convertSql(
      "SELECT * FROM config_audit_log ORDER BY datetime(timestamp) DESC LIMIT @limit OFFSET @offset"
    );
    const bound = normalizeQueryParams(converted, [{ limit: 10, offset: 5 }]);
    assert.ok(bound.sql.includes("::timestamp"), bound.sql);
    assert.deepEqual(bound.params, [10, 5]);
  });

  test("does not treat a leading colon-only token as a parameter", () => {
    const { sql: converted, params } = normalizeQueryParams("SELECT 1::int AS x", [{}]);
    assert.equal(converted, "SELECT 1::int AS x");
    assert.deepEqual(params, []);
  });
});

describe("postgresAdapter splitSqlStatements", () => {
  test("splits simple statements", () => {
    const sql = "CREATE TABLE a (id INT); CREATE TABLE b (id INT);";
    const stmts = splitSqlStatements(sql);
    assert.equal(stmts.length, 2);
    assert.ok(stmts[0].includes("CREATE TABLE a"));
    assert.ok(stmts[1].includes("CREATE TABLE b"));
  });

  test("handles semicolons inside string literals", () => {
    const sql = "INSERT INTO test (val) VALUES ('a;b;c');";
    const stmts = splitSqlStatements(sql);
    assert.equal(stmts.length, 1);
    assert.ok(stmts[0].includes("'a;b;c'"));
  });

  test("skips standalone BEGIN/END", () => {
    const sql = "BEGIN; CREATE TABLE test (id INT); END;";
    const stmts = splitSqlStatements(sql);
    assert.equal(stmts.length, 1);
    assert.ok(stmts[0].includes("CREATE TABLE test"));
  });

  test("treats CREATE TRIGGER ... END as single statement", () => {
    const sql = `
      CREATE TRIGGER update_timestamp
      AFTER UPDATE ON test
      BEGIN
        UPDATE test SET updated_at = NOW() WHERE id = NEW.id;
      END;
      CREATE TABLE test2 (id INT);
    `;
    const stmts = splitSqlStatements(sql);
    assert.equal(stmts.length, 2);
    assert.ok(stmts[0].includes("CREATE TRIGGER"));
    assert.ok(stmts[1].includes("CREATE TABLE test2"));
  });

  test("handles multiple triggers in one migration", () => {
    const sql = `
      CREATE TRIGGER t1 AFTER INSERT ON a BEGIN SELECT 1; END;
      CREATE TRIGGER t2 AFTER UPDATE ON b BEGIN SELECT 2; END;
      INSERT INTO log VALUES ('done');
    `;
    const stmts = splitSqlStatements(sql);
    assert.equal(stmts.length, 3);
    assert.ok(stmts[0].includes("CREATE TRIGGER t1"));
    assert.ok(stmts[1].includes("CREATE TRIGGER t2"));
    assert.ok(stmts[2].includes("INSERT INTO log"));
  });

  test("handles comments", () => {
    const sql = "-- comment\nCREATE TABLE test (id INT);";
    const stmts = splitSqlStatements(sql);
    assert.equal(stmts.length, 1);
    assert.ok(stmts[0].includes("CREATE TABLE test"));
  });
});
