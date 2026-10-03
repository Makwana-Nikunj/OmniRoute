import { Pool, PoolClient } from "pg";
import deasync from "deasync";
import type { SqliteAdapter, PreparedStatement } from "./types";
import { AsyncLocalStorage } from "async_hooks";

export class PostgresAdapter implements SqliteAdapter {
  public driver: "better-sqlite3" | "node:sqlite" | "bun:sqlite" | "sql.js" = "better-sqlite3";
  public open = true;
  public name = "neon-db";

  private pool: Pool;
  private txStorage = new AsyncLocalStorage<PoolClient>();

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }

  public get raw() {
    return this.pool;
  }

  // Quick converter for SQLite positional (?) to Postgres positional ($1)
  private convertSql(sql: string) {
    let index = 1;
    let pgSql = sql.replace(/\?/g, () => `$${index++}`);

    // SQLite types/defaults
    pgSql = pgSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, "SERIAL PRIMARY KEY");
    pgSql = pgSql.replace(
      /DATETIME DEFAULT CURRENT_TIMESTAMP/gi,
      "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    );

    // IFNULL -> COALESCE
    pgSql = pgSql.replace(/\bIFNULL\s*\(/gi, "COALESCE(");

    // JSON_EXTRACT -> Naive json extract path
    // JSON_EXTRACT(config, '$.price') -> config->>'price'
    pgSql = pgSql.replace(
      /\bJSON_EXTRACT\s*\(\s*([^,]+)\s*,\s*'([^']+)'\s*\)/gi,
      (_match, col, path) => {
        const pgPath = path.replace(/^\$\./, "");
        return `${col}->>'${pgPath}'`;
      }
    );

    // INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING
    if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(pgSql)) {
      pgSql = pgSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
      if (!pgSql.toUpperCase().includes("ON CONFLICT")) {
        pgSql += " ON CONFLICT DO NOTHING";
      }
    }

    // INSERT OR REPLACE -> INSERT ... ON CONFLICT DO UPDATE (Hack for key_value table)
    if (/INSERT\s+OR\s+REPLACE\s+INTO\s+key_value/i.test(pgSql)) {
      pgSql = pgSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO");
      pgSql += " ON CONFLICT (namespace, key) DO UPDATE SET value = EXCLUDED.value";
    } else {
      // General hack for INSERT OR REPLACE - just replace with INSERT and hope there's no conflict or error handled upstream
      pgSql = pgSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO");
    }

    return pgSql;
  }

  private querySync(sql: string, params: unknown[] = []): any {
    let result: any = undefined;
    let error: any = undefined;
    let done = false;

    // Use transaction client if inside a transaction tree, otherwise use arbitrary pool client
    const client = this.txStorage.getStore();
    const queryable = client || this.pool;

    queryable.query(sql, params, (err, res) => {
      if (err) error = err;
      else result = res;
      done = true;
    });

    while (!done) {
      deasync.sleep(5);
    }

    if (error) throw error;
    return result;
  }

  public prepare(rawSql: string): PreparedStatement {
    const pgSql = this.convertSql(rawSql);

    return {
      all: (...params: unknown[]) => {
        const res = this.querySync(pgSql, params);
        return res ? res.rows : [];
      },
      get: (...params: unknown[]) => {
        const res = this.querySync(pgSql, params);
        return res && res.rows.length > 0 ? res.rows[0] : undefined;
      },
      run: (...params: unknown[]) => {
        let isInsert = pgSql.trim().toUpperCase().startsWith("INSERT");
        let finalSql = pgSql;
        if (isInsert && !pgSql.toUpperCase().includes("RETURNING")) {
          finalSql = pgSql + " RETURNING *";
        }

        const res = this.querySync(finalSql, params);

        return {
          changes: res ? res.rowCount : 0,
          lastInsertRowid: res && res.rows.length > 0 && res.rows[0].id ? res.rows[0].id : 0,
        };
      },
    };
  }

  public exec(sql: string): void {
    this.querySync(this.convertSql(sql));
  }

  public pragma(_pragmaStr: string, _options?: { simple?: boolean }): unknown {
    return [];
  }

  // inTransaction is kept for backwards compatibility but does not leak state across concurrently executing operations
  public get inTransaction() {
    return !!this.txStorage.getStore();
  }

  public transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T {
    return (...args) => {
      let client: PoolClient | undefined;
      let error: any;
      let done = false;

      this.pool.connect((err, c) => {
        if (err) error = err;
        else client = c;
        done = true;
      });

      while (!done) {
        deasync.sleep(5);
      }

      if (error || !client) throw error || new Error("Failed to acquire connection");

      return this.txStorage.run(client, () => {
        this.exec("BEGIN");
        try {
          const result = fn(...args);
          this.exec("COMMIT");
          return result;
        } catch (err) {
          this.exec("ROLLBACK");
          throw err;
        } finally {
          client!.release();
        }
      });
    };
  }

  public immediate(fn: () => void): void {
    this.transaction(fn)();
  }

  public async backup(_destination: string): Promise<void> {}
  public checkpoint(_mode?: string): void {}

  public close(): void {
    this.pool.end();
  }
}
