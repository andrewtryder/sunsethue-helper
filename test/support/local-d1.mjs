/**
 * A D1-compatible binding backed by an in-memory SQLite database.
 *
 * Tests exercise the real SQL in worker/db.js against the real migration files,
 * so schema drift is caught without ever pointing a test at production D1.
 */
import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url);

export async function readMigrationFiles(dir = MIGRATIONS_DIR) {
  const entries = await readdir(dir);
  const files = entries.filter((entry) => entry.endsWith(".sql")).sort();
  const contents = [];
  for (const file of files) {
    contents.push({
      name: file,
      sql: await readFile(fileURLToPath(new URL(file, dir)), "utf8")
    });
  }
  return contents;
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
 * @returns {Promise<{ DB: object, database: DatabaseSync, appliedMigrations: string[], close: () => void }>}
 */
export async function createLocalD1() {
  const database = new DatabaseSync(":memory:");
  const migrations = await readMigrationFiles();
  const appliedMigrations = [];

  for (const migration of migrations) {
    database.exec(migration.sql);
    appliedMigrations.push(migration.name);
  }

  return {
    DB: {
      prepare(sql) {
        return statement(database, sql, []);
      }
    },
    database,
    appliedMigrations,
    close() {
      database.close();
    }
  };
}
