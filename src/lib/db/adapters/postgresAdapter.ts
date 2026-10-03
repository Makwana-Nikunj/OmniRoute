import { AsyncLocalStorage } from "async_hooks";
import { Worker, MessageChannel, receiveMessageOnPort } from "worker_threads";
import type { SqliteAdapter, PreparedStatement } from "./types";

const workerCode = `
const { parentPort } = require("worker_threads");
const pg = require("pg");

let port;
let pool;
let sharedView;
let clients = new Map();
let clientIdCounter = 1;

parentPort.on("message", (msg) => {
  if (msg.type === "init") {
    port = msg.port;
    sharedView = new Int32Array(msg.sharedBuffer);
    pool = new pg.Pool({
      connectionString: msg.dbUrl,
      ssl: { rejectUnauthorized: false }
    });

    port.on("message", async (req) => {
      try {
        if (req.type === "end") {
          await pool.end();
          port.postMessage({ id: req.id, result: 'ended' });
        } else if (req.type === "connect") {
          const client = await pool.connect();
          const cid = clientIdCounter++;
          clients.set(cid, client);
          port.postMessage({ id: req.id, result: cid });
        } else if (req.type === "release") {
          const client = clients.get(req.cid);
          if (client) {
            client.release();
            clients.delete(req.cid);
          }
          port.postMessage({ id: req.id, result: 'released' });
        } else if (req.type === "query") {
          const queryable = req.cid ? clients.get(req.cid) : pool;
          const res = await queryable.query(req.sql, req.params || []);
          port.postMessage({ id: req.id, result: { rows: res.rows, rowCount: res.rowCount } });
        }
      } catch (err) {
        port.postMessage({ id: req.id, error: err.message });
      } finally {
        Atomics.store(sharedView, 0, 1);
        Atomics.notify(sharedView, 0);
      }
    });
  }
});
`;

export class PostgresAdapter implements SqliteAdapter {
  public driver: "better-sqlite3" | "node:sqlite" | "bun:sqlite" | "sql.js" = "better-sqlite3";
  public open = true;
  public name = "neon-db";

  private worker: Worker;
  private channel: MessageChannel;
  private sharedView: Int32Array;
  private nextMsgId = 1;
  private txStorage = new AsyncLocalStorage<number>();

  constructor(connectionString: string) {
    this.worker = new Worker(workerCode, { eval: true });
    this.channel = new MessageChannel();
    const sharedBuffer = new SharedArrayBuffer(8);
    this.sharedView = new Int32Array(sharedBuffer);

    this.worker.postMessage(
      {
        type: "init",
        port: this.channel.port2,
        dbUrl: connectionString,
        sharedBuffer,
      },
      [this.channel.port2]
    );
  }

  public get raw() {
    return this;
  }

  private convertSql(sql: string) {
    let index = 1;
    let pgSql = "";
    let inString = false;
    let stringChar = "";

    for (let i = 0; i < sql.length; i++) {
      const char = sql[i];
      if ((char === "'" || char === '"') && (i === 0 || sql[i - 1] !== "\\")) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }

      if (char === "?" && !inString) {
        pgSql += "$" + index++;
      } else {
        pgSql += char;
      }
    }

    pgSql = pgSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, "SERIAL PRIMARY KEY");
    pgSql = pgSql.replace(
      /DATETIME DEFAULT CURRENT_TIMESTAMP/gi,
      "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    );
    pgSql = pgSql.replace(/\bIFNULL\s*\(/gi, "COALESCE(");

    pgSql = pgSql.replace(
      /\bstrftime\s*\(\s*'%Y-%m-%dT%H:00:00Z'\s*,\s*([^)]+)\s*\)/gi,
      'to_char($1::timestamp, \'YYYY-MM-DD"T"HH24:00:00"Z"\')'
    );
    pgSql = pgSql.replace(
      /\bstrftime\s*\(\s*'%Y-%m-%dT%H:%M:%SZ'\s*,\s*'now'\s*\)/gi,
      "to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')"
    );
    pgSql = pgSql.replace(
      /\bstrftime\s*\(\s*'%Y-%m-01T00:00:00.000Z'\s*,\s*'now'\s*(?:,\s*'\+1\s+month'\s*)?\)/gi,
      (match) => {
        if (match.includes("+1 month")) {
          return "to_char(DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month', 'YYYY-MM-DD\"T\"00:00:00.000\"Z\"')";
        }
        return "to_char(DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC'), 'YYYY-MM-DD\"T\"00:00:00.000\"Z\"')";
      }
    );

    pgSql = pgSql.replace(/\bjson_valid\s*\(\s*([^)]+)\s*\)/gi, "($1 IS NOT NULL)");

    pgSql = pgSql.replace(
      /\bJSON_EXTRACT\s*\(\s*([^,]+)\s*,\s*'([^']+)'\s*\)/gi,
      (_match, col, path) => {
        const pgPath = path.replace(/^\$\./, "");
        return `(${col}::jsonb->>'${pgPath}')`;
      }
    );

    pgSql = pgSql.replace(/\bjson_array\s*\(/gi, "jsonb_build_array(");
    pgSql = pgSql.replace(/\bjson_group_array\s*\(/gi, "json_agg(");
    pgSql = pgSql.replace(
      /\bjson_each\s*\(\s*([^)]+)\s*\)/gi,
      "json_array_elements_text($1::json)"
    );

    if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(pgSql)) {
      pgSql = pgSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
      if (!pgSql.toUpperCase().includes("ON CONFLICT")) {
        pgSql += " ON CONFLICT DO NOTHING";
      }
    }

    const replaceMatch = pgSql.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+([a-zA-Z0-9_]+)/i);
    if (replaceMatch) {
      const table = replaceMatch[1].toLowerCase();
      pgSql = pgSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO");

      if (!pgSql.toUpperCase().includes("ON CONFLICT")) {
        if (table === "key_value") {
          pgSql += " ON CONFLICT (namespace, key) DO UPDATE SET value = EXCLUDED.value";
        } else if (table === "semantic_cache") {
          pgSql +=
            " ON CONFLICT (id) DO UPDATE SET response = EXCLUDED.response, hit_count = EXCLUDED.hit_count, tokens_saved = EXCLUDED.tokens_saved";
        } else if (table === "provider_quota_state") {
          pgSql +=
            " ON CONFLICT (provider, date) DO UPDATE SET tokens = EXCLUDED.tokens, requests = EXCLUDED.requests, cost = EXCLUDED.cost";
        } else if (table === "free_proxies") {
          pgSql += " ON CONFLICT (url) DO UPDATE SET working = EXCLUDED.working";
        } else {
          pgSql += " ON CONFLICT DO NOTHING";
        }
      }
    }

    if (/^\s*PRAGMA/i.test(pgSql)) {
      pgSql = "SELECT 1";
    }

    return pgSql;
  }

  private sendSync(req: any): any {
    const id = this.nextMsgId++;
    Atomics.store(this.sharedView, 0, 0);
    this.channel.port1.postMessage({ id, ...req });

    Atomics.wait(this.sharedView, 0, 0);

    const res = receiveMessageOnPort(this.channel.port1);
    if (!res) throw new Error("Worker failed to respond");

    const msg = res.message;
    if (msg.error) {
      throw new Error(msg.error);
    }
    return msg.result;
  }

  private querySync(sql: string, params: unknown[] = []): any {
    const cid = this.txStorage.getStore();
    return this.sendSync({ type: "query", cid, sql, params });
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

  public get inTransaction() {
    return !!this.txStorage.getStore();
  }

  public transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T {
    return (...args) => {
      const cid = this.sendSync({ type: "connect" });
      return this.txStorage.run(cid, () => {
        this.exec("BEGIN");
        try {
          const result = fn(...args);
          this.exec("COMMIT");
          return result;
        } catch (err) {
          this.exec("ROLLBACK");
          throw err;
        } finally {
          this.sendSync({ type: "release", cid });
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
    if (this.open) {
      this.sendSync({ type: "end" });
      this.open = false;
      this.worker.terminate();
    }
  }
}
