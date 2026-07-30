/**
 * A D1-compatible binding backed by an in-memory SQLite database.
 *
 * Tests exercise the real SQL in worker/db.js against the repository schema.sql,
 * so schema drift is caught without ever pointing a test at production D1.
 */
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SCHEMA_PATH = new URL("../../schema.sql", import.meta.url);

export async function readSchemaSql() {
  return readFile(fileURLToPath(SCHEMA_PATH), "utf8");
}

function statement(database, sql, boundArgs) {
  return {
    bind(...args) {
      return statement(database, sql, args);
    },
    async all() {
      const results = database.prepare(sql).all(...boundArgs);
      return { results, success: true, meta: { rows_read: results.length } };
    },
    async run() {
      const info = database.prepare(sql).run(...boundArgs);
      return {
        success: true,
        meta: {
          changes: info.changes,
          last_row_id: Number(info.lastInsertRowid)
        }
      };
    },
    async first(column) {
      const row = database.prepare(sql).get(...boundArgs) ?? null;
      if (row && column) {
        return row[column] ?? null;
      }
      return row;
    }
  };
}

/**
 * @returns {Promise<{ DB: object, database: DatabaseSync, close: () => void }>}
 */
export async function createLocalD1() {
  const database = new DatabaseSync(":memory:");
  const schema = await readSchemaSql();
  database.exec(schema);

  return {
    DB: {
      prepare(sql) {
        return statement(database, sql, []);
      }
    },
    database,
    close() {
      database.close();
    }
  };
}
