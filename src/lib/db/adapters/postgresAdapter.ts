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

function resolveJsonPath(col: string, path: string): string {
  const trimmedPath = path.trim();
  const arrMatch = trimmedPath.match(/^\$\[(\d+)\]$/);
  if (arrMatch) {
    return `${col}::jsonb->${arrMatch[1]}`;
  }
  const cleanPath = trimmedPath.replace(/^\$\./, "");
  if (!cleanPath.includes(".")) {
    return `${col}::jsonb->'${cleanPath}'`;
  }
  const parts = cleanPath.split(".");
  return `${col}::jsonb#>'{${parts.join(",")}}'`;
}

function resolveJsonText(col: string, path: string): string {
  const trimmedPath = path.trim();
  const arrMatch = trimmedPath.match(/^\$\[(\d+)\]$/);
  if (arrMatch) {
    return `(${col}::jsonb->>${arrMatch[1]})`;
  }
  const cleanPath = trimmedPath.replace(/^\$\./, "");
  if (!cleanPath.includes(".")) {
    return `(${col}::jsonb->>'${cleanPath}')`;
  }
  const parts = cleanPath.split(".");
  return `(${col}::jsonb#>>'{${parts.join(",")}}')`;
}

export function convertSql(sql: string): string {
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

  const debug = process.env.DEBUG_CONVERT_SQL === "1";

  const steps: [string, RegExp, string | ((match: string, ...args: string[]) => string)][] = [
    ["INT AUTOINCREMENT", /\bINTEGER PRIMARY KEY AUTOINCREMENT/gi, "SERIAL PRIMARY KEY"],
    ["BLOB", /\bBLOB\b/gi, "BYTEA"],
    ["WITHOUT ROWID", /\s*WITHOUT\s+ROWID\s*/gi, " "],
    ["typeof = text", /\btypeof\s*\(\s*([^)]+)\s*\)\s*=\s*'text'/gi, "$1 IS NOT NULL"],
    ["typeof <> text", /\btypeof\s*\(\s*([^)]+)\s*\)\s*<>\s*'text'/gi, "$1 IS NULL"],
    [
      "DATETIME DEFAULT CURRENT_TIMESTAMP",
      /DATETIME DEFAULT CURRENT_TIMESTAMP/gi,
      "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    ],
    ["IFNULL", /\bIFNULL\s*\(/gi, "COALESCE("],
    ["COLLATE NOCASE", /\s+COLLATE\s+NOCASE\b/gi, ""],
    [
      "datetime('now') parens",
      /\(\s*datetime\s*\(\s*'now'\s*\)\s*\)/gi,
      "to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')",
    ],
    [
      "datetime('now')",
      /\bdatetime\s*\(\s*'now'\s*\)/gi,
      "to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')",
    ],
    [
      "datetime(column)",
      /\bdatetime\s*\(\s*([a-zA-Z0-9_.]+)\s*\)/gi,
      "to_char(($1)::timestamp, 'YYYY-MM-DD HH24:MI:SS')",
    ],
    ["randomblob", /\brandomblob\s*\(/gi, "gen_random_bytes("],
    [
      "hex(randomblob)",
      /\bhex\s*\(\s*gen_random_bytes\s*\(([^)]+)\)\s*\)/gi,
      "encode(gen_random_bytes($1), 'hex')",
    ],
    ["hex", /\bhex\s*\(/gi, "encode("],
    [
      "strftime YYYY-MM-DDTHH:00:00Z",
      /\bstrftime\s*\(\s*'%Y-%m-%dT%H:00:00Z'\s*,\s*([^)]+)\s*\)/gi,
      'to_char($1::timestamp, \'YYYY-MM-DD"T"HH24:00:00"Z"\')',
    ],
    [
      "strftime YYYY-MM-DDTHH:MI:SSZ now",
      /\bstrftime\s*\(\s*'%Y-%m-%dT%H:%M:%SZ'\s*,\s*'now'\s*\)/gi,
      "to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')",
    ],
    [
      "strftime month start",
      /\bstrftime\s*\(\s*'%Y-%m-01T00:00:00.000Z'\s*,\s*'now'\s*(?:,\s*'\+1\s+month'\s*)?\)/gi,
      (match: string) => {
        if (match.includes("+1 month")) {
          return "to_char(DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month', 'YYYY-MM-DD\"T\"00:00:00.000\"Z\"')";
        }
        return "to_char(DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC'), 'YYYY-MM-DD\"T\"00:00:00.000\"Z\"')";
      },
    ],
    [
      "json_valid COALESCE",
      /\bjson_valid\s*\(\s*COALESCE\s*\(\s*([^,]+),\s*[^)]+\s*\)\s*\)/gi,
      "($1 IS NOT NULL)",
    ],
    ["json_valid =0", /\bjson_valid\s*\(\s*([^)]+)\s*\)\s*=\s*0/gi, "$1 IS NULL"],
    ["json_valid =1", /\bjson_valid\s*\(\s*([^)]+)\s*\)\s*=\s*1/gi, "$1 IS NOT NULL"],
    ["json_valid", /\bjson_valid\s*\(\s*([^)]+)\s*\)/gi, "($1 IS NOT NULL)"],
    [
      "json_type 2arg = text",
      /\bjson_type\s*\(\s*([^,\r\n]+),\s*'([^']+)'\s*\)\s*=\s*'text'/gi,
      (_m, col, p) => `jsonb_typeof(${resolveJsonPath(col, p)}) = 'string'`,
    ],
    [
      "json_type 2arg =",
      /\bjson_type\s*\(\s*([^,\r\n]+),\s*'([^']+)'\s*\)\s*=\s*'([^']+)'/gi,
      (_m, col, p, val) => `jsonb_typeof(${resolveJsonPath(col, p)}) = '${val}'`,
    ],
    [
      "json_type 2arg != text",
      /\bjson_type\s*\(\s*([^,\r\n]+),\s*'([^']+)'\s*\)\s*(?:!=|<>)\s*'text'/gi,
      (_m, col, p) =>
        `(jsonb_typeof(${resolveJsonPath(col, p)}) != 'string' OR ${resolveJsonPath(col, p)} IS NULL)`,
    ],
    [
      "json_type 2arg !=",
      /\bjson_type\s*\(\s*([^,\r\n]+),\s*'([^']+)'\s*\)\s*(?:!=|<>)\s*'([^']+)'/gi,
      (_m, col, p, val) =>
        `(jsonb_typeof(${resolveJsonPath(col, p)}) != '${val}' OR ${resolveJsonPath(col, p)} IS NULL)`,
    ],
    [
      "json_type 2arg IS NULL",
      /\bjson_type\s*\(\s*([^,\r\n]+),\s*'([^']+)'\s*\)\s*IS\s+NULL/gi,
      (_m, col, p) => `${resolveJsonPath(col, p)} IS NULL`,
    ],
    [
      "json_type 2arg IS NOT NULL",
      /\bjson_type\s*\(\s*([^,\r\n]+),\s*'([^']+)'\s*\)\s*IS\s+NOT\s+NULL/gi,
      (_m, col, p) => `${resolveJsonPath(col, p)} IS NOT NULL`,
    ],
    [
      "json_type 2arg catchall",
      /\bjson_type\s*\(\s*([^,\r\n]+),\s*'([^']+)'\s*\)/gi,
      (_m, col, p) => `jsonb_typeof(${resolveJsonPath(col, p)})`,
    ],
    [
      "json_type 1arg =",
      /\bjson_type\s*\(\s*([^)\r\n]+)\s*\)\s*=\s*'([^']+)'/gi,
      "jsonb_typeof($1::jsonb) = '$2'",
    ],
    [
      "json_type 1arg !=",
      /\bjson_type\s*\(\s*([^)\r\n]+)\s*\)\s*(?:!=|<>)\s*'([^']+)'/gi,
      "jsonb_typeof($1::jsonb) != '$2'",
    ],
    [
      "json_type 1arg IS NULL",
      /\bjson_type\s*\(\s*([^)\r\n]+)\s*\)\s*IS\s+NULL/gi,
      "$1::jsonb IS NULL",
    ],
    [
      "json_type 1arg IS NOT NULL",
      /\bjson_type\s*\(\s*([^)\r\n]+)\s*\)\s*IS\s+NOT\s+NULL/gi,
      "$1::jsonb IS NOT NULL",
    ],
    ["json_type 1arg catchall", /\bjson_type\s*\(\s*([^)\r\n]+)\s*\)/gi, "jsonb_typeof($1::jsonb)"],
    [
      "json_array_length",
      /\bjson_array_length\s*\(\s*([^)]+)\s*\)/gi,
      "jsonb_array_length($1::jsonb)",
    ],
    [
      "json_extract =1",
      /\bjson_extract\s*\(\s*([^,\r\n]+)\s*,\s*'([^']+)'\s*\)\s*=\s*1/gi,
      (_m, col, p) => `${resolveJsonText(col, p)}::boolean IS TRUE`,
    ],
    [
      "json_extract =0",
      /\bjson_extract\s*\(\s*([^,\r\n]+)\s*,\s*'([^']+)'\s*\)\s*=\s*0/gi,
      (_m, col, p) => `${resolveJsonText(col, p)}::boolean IS NOT TRUE`,
    ],
    [
      "json_extract",
      /\bjson_extract\s*\(\s*([^,\r\n]+)\s*,\s*'([^']+)'\s*\)/gi,
      (_m, col, p) => resolveJsonText(col, p),
    ],
    ["json_array", /\bjson_array\s*\(/gi, "jsonb_build_array("],
    ["json_group_array", /\bjson_group_array\s*\(/gi, "json_agg("],
    [
      "json_each 2arg",
      /\bjson_each\s*\(\s*([^,]+),\s*'([^']+)'\s*\)/gi,
      "jsonb_each_text($1::jsonb->'$2')",
    ],
    ["json_each", /\bjson_each\s*\(\s*([^)]+)\s*\)/gi, "jsonb_each_text($1::jsonb)"],
    [
      "char multi-arg to chr",
      /\bchar\s*\(\s*(\d+(?:\s*,\s*\d+)*)\s*\)/gi,
      (_match: string, args: string) => {
        return args
          .split(",")
          .map((n: string) => `chr(${n.trim()})`)
          .join(" || ");
      },
    ],
    ["char(N) to chr(N)", /\bchar\s*\(\s*(\d+)\s*\)/gi, "chr($1)"],
    [
      "json_insert",
      /\bjson_insert\s*\(\s*([^,]+),\s*'(\$\[#\])'\s*,\s*'([^']+)'\s*\)/gi,
      "($1::jsonb || '\"$3\"'::jsonb)",
    ],
    [
      "json_set",
      /\bjson_set\s*\(\s*([^,]+),\s*'([^']+)',\s*'([^']+)'\s*\)/gi,
      (_match: string, col: string, path: string, value: string) => {
        const pgPath = path.replace(/^\$\./, "").split(".").filter(Boolean);
        return `jsonb_set(${col}::jsonb, '{${pgPath.join(".")}}', '\"${value}\"'::jsonb)`;
      },
    ],
    [
      "json_remove",
      /\bjson_remove\s*\(\s*([^,]+),\s*('([^']+)'(?:,\s*'([^']+)')*)\s*\)/gi,
      (_match: string, col: string, pathsStr: string) => {
        const paths = pathsStr.match(/'([^']+)'/g)?.map((p) => p.slice(1, -1)) || [];
        const stripped = paths.map((p) => p.replace(/^\$\./, ""));
        const commonPrefix = stripped.reduce((prefix: string | null, path: string) => {
          const parts = path.split(".");
          if (parts.length > 1) {
            return prefix === null ? parts.slice(0, -1).join(".") : prefix;
          }
          return prefix;
        }, null);

        if (commonPrefix) {
          const keys = stripped.map((p) => p.split(".").pop()).filter(Boolean);
          return `jsonb_set(${col}::jsonb, '{${commonPrefix}}', (${col}::jsonb->'${commonPrefix}') - '${keys.join("' - '")}')`;
        }
        return `(${col}::jsonb - '${stripped.join("' - '")}')`;
      },
    ],
    [
      "CASE jsonb_typeof",
      /CASE\s+WHEN\s+([^\s]+)\s+IS\s+NOT\s+NULL\s+THEN\s+jsonb_typeof\(\1::jsonb\)\s*!=\s*'([^']+)'\s+ELSE\s+0\s+END/gi,
      "($1 IS NOT NULL AND jsonb_typeof($1::jsonb) != '$2')",
    ],
    ["IS NOT NULL keep", /\bIS\s+NOT\s+NULL\b/gi, "IS NOT NULL"],
    [
      "IS NOT value to <>",
      /\bIS\s+NOT\s+([0-9]+|'[^']*')(?=[\s;,)]|$)/gi,
      (_match: string, value: string) => `<> ${value}`,
    ],
    [
      "jsonb_typeof = text",
      /\bjsonb_typeof\s*\(([^)]+)\)\s*=\s*'text'/gi,
      "jsonb_typeof($1) = 'string'",
    ],
    [
      "jsonb_typeof != text",
      /\bjsonb_typeof\s*\(([^)]+)\)\s*(?:!=|<>)\s*'text'/gi,
      "jsonb_typeof($1) != 'string'",
    ],
    ["arrow array index $[N]", /->>\s*'\$\[(\d+)\]'/gi, "->>$1"],
    ["arrow array index single $[N]", /->\s*'\$\[(\d+)\]'/gi, "->$1"],
    ["arrow field $.field", /->>\s*'\$\.([^']+)'/gi, "->>'$1'"],
    ["arrow field single $.field", /->\s*'\$\.([^']+)'/gi, "->'$1'"],
  ];

  for (const [name, regex, replacement] of steps) {
    const before = pgSql;
    pgSql = pgSql.replace(regex, replacement as string);
    if (debug && before !== pgSql) {
      console.log(`[CONVERT] ${name}:`);
      console.log(pgSql);
      console.log("---");
    }
  }

  if (/^\s*PRAGMA\s+table_info\s*\(/i.test(pgSql)) {
    const tableMatch = pgSql.match(/PRAGMA\s+table_info\s*\(\s*([^)]+)\s*\)/i);
    if (tableMatch) {
      const tableName = tableMatch[1].trim();
      pgSql = `SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName.replace(/'/g, "''")}' ORDER BY ordinal_position`;
    } else {
      pgSql = "SELECT 1";
    }
  } else if (/^\s*PRAGMA/i.test(pgSql)) {
    pgSql = "SELECT 1";
  }

  if (/CREATE\s+TRIGGER/i.test(pgSql)) {
    pgSql = pgSql.replace(/CREATE\s+TRIGGER[\s\S]*?END\s*;?/gi, "");
    pgSql = pgSql.replace(/^\s*BEGIN\s*$/gm, "");
    pgSql = pgSql.replace(/^\s*END\s*;?\s*$/gm, "");
  }

  pgSql = pgSql.replace(
    /SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=\s*\$1/gi,
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1"
  );
  pgSql = pgSql.replace(
    /SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type\s+IN\s*\(\s*'table'\s*,\s*'view'\s*\)\s+AND\s+name\s*=\s*\$1/gi,
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1"
  );

  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(pgSql)) {
    pgSql = pgSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
    if (!pgSql.toUpperCase().includes("ON CONFLICT")) {
      pgSql = pgSql.replace(/;\s*$/, "");
      pgSql += " ON CONFLICT DO NOTHING";
    }
  }

  const replaceMatch = pgSql.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+([a-zA-Z0-9_]+)/i);
  if (replaceMatch) {
    const table = replaceMatch[1].toLowerCase();
    pgSql = pgSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO");

    if (!pgSql.toUpperCase().includes("ON CONFLICT")) {
      pgSql = pgSql.replace(/;\s*$/, "");
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

  return pgSql;
}

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inString = false;
  let stringChar = "";
  let inComment = false;
  let inTrigger = false;

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed && !/^(BEGIN|END)$/i.test(trimmed)) {
      statements.push(trimmed);
    }
    current = "";
  };

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    if (inComment) {
      current += char;
      if (char === "\n") {
        inComment = false;
      }
      continue;
    }

    if (!inString && (char === "'" || char === '"')) {
      inString = true;
      stringChar = char;
      current += char;
    } else if (inString && char === stringChar && sql[i - 1] !== "\\") {
      inString = false;
      current += char;
    } else if (!inString && char === "-" && sql[i + 1] === "-") {
      inComment = true;
      current += char;
      i++;
      current += sql[i];
    } else if (!inTrigger && /\bCREATE\s+TRIGGER\b/i.test(current + char)) {
      inTrigger = true;
      current += char;
    } else if (inTrigger && !inString) {
      if (char === "E" && sql.slice(i, i + 3).toUpperCase() === "END") {
        const afterEnd = sql.slice(i + 3).trimStart();
        if (
          afterEnd.startsWith(";") ||
          afterEnd.length === 0 ||
          afterEnd.startsWith("\n") ||
          afterEnd.startsWith("\r")
        ) {
          current += "END";
          i += 2;
          const nextTrimmed = sql.slice(i + 1).match(/^\s*;/);
          if (nextTrimmed) {
            current += nextTrimmed[0];
            i += nextTrimmed[0].length;
          }
          flush();
          inTrigger = false;
          continue;
        }
      }
      current += char;
    } else if (!inString && !inTrigger && char === ";") {
      flush();
    } else {
      current += char;
    }
  }

  flush();
  return statements;
}

function isPlainObject(obj: unknown): obj is Record<string, unknown> {
  return (
    typeof obj === "object" &&
    obj !== null &&
    !Array.isArray(obj) &&
    !(obj instanceof Date) &&
    !(obj instanceof Uint8Array)
  );
}

function normalizeQueryParams(sql: string, args: unknown[]): { sql: string; params: unknown[] } {
  const first = args[0];
  const hasNamed = /[@:][a-zA-Z0-9_]+/.test(sql);

  if (args.length === 1 && isPlainObject(first) && hasNamed) {
    const obj = first as Record<string, unknown>;
    const params: unknown[] = [];
    let paramIndex = 1;
    let convertedSql = "";
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
        convertedSql += char;
        continue;
      }

      if (!inString && (char === "@" || char === ":") && /[a-zA-Z_]/.test(sql[i + 1] || "")) {
        const rest = sql.slice(i + 1);
        const match = rest.match(/^[a-zA-Z0-9_]+/);
        if (match) {
          const paramName = match[0];
          const val = obj[paramName] !== undefined ? obj[paramName] : null;
          params.push(val);
          convertedSql += "$" + paramIndex++;
          i += paramName.length;
          continue;
        }
      }

      convertedSql += char;
    }
    return { sql: convertedSql, params };
  }

  // If query has no placeholders at all, params must be empty
  if (!/\$|\?|@[a-zA-Z_]|:[a-zA-Z_]/.test(sql)) {
    return { sql, params: [] };
  }

  const flatArgs = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  if (flatArgs.length === 1 && isPlainObject(flatArgs[0]) && !/\$[0-9]/.test(sql)) {
    return { sql, params: [] };
  }

  return { sql, params: flatArgs };
}

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

  public convertSql(sql: string): string {
    return convertSql(sql);
  }

  public splitSqlStatements(sql: string): string[] {
    return splitSqlStatements(sql);
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
    const pgSql = convertSql(rawSql);

    return {
      all: (...args: unknown[]) => {
        const { sql, params } = normalizeQueryParams(pgSql, args);
        const res = this.querySync(sql, params);
        return res ? res.rows : [];
      },
      get: (...args: unknown[]) => {
        const { sql, params } = normalizeQueryParams(pgSql, args);
        const res = this.querySync(sql, params);
        return res && res.rows.length > 0 ? res.rows[0] : undefined;
      },
      run: (...args: unknown[]) => {
        const { sql, params } = normalizeQueryParams(pgSql, args);
        let isInsert = sql.trim().toUpperCase().startsWith("INSERT");
        let finalSql = sql;
        if (isInsert && !sql.toUpperCase().includes("RETURNING")) {
          finalSql = sql + " RETURNING *";
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
    const statements = splitSqlStatements(sql);
    for (const stmt of statements) {
      const upper = stmt.trim().toUpperCase();
      if (upper.includes("CREATE TRIGGER") || upper.includes("DROP TRIGGER")) {
        continue;
      }
      this.querySync(convertSql(stmt));
    }
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
        this.querySync("BEGIN");
        try {
          const result = fn(...args);
          this.querySync("COMMIT");
          return result;
        } catch (err) {
          this.querySync("ROLLBACK");
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
