import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../migrations"
);

function listMigrationNames() {
  const filenames = readdirSync(MIGRATIONS_DIR);
  const names = new Set();

  for (const filename of filenames) {
    if (filename.endsWith(".up.sql")) {
      names.add(filename.slice(0, -".up.sql".length));
    }
  }

  return [...names].sort();
}

function readMigrationSql(name, direction) {
  const filename = `${name}.${direction}.sql`;
  const filePath = path.join(MIGRATIONS_DIR, filename);
  return readFileSync(filePath, "utf8");
}

function ensureMigrationsTable(db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
  );
}

function appliedMigrationNames(db) {
  const rows = db
    .prepare("SELECT name FROM schema_migrations ORDER BY name")
    .all();
  return new Set(rows.map((row) => row.name));
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ direction?: 'up' | 'down' }} [options]
 */
export function runMigrations(db, options = {}) {
  const direction = options.direction ?? "up";
  if (direction !== "up" && direction !== "down") {
    throw new Error(`Unsupported migration direction: ${direction}`);
  }

  ensureMigrationsTable(db);
  const names = listMigrationNames();

  if (direction === "up") {
    const applied = appliedMigrationNames(db);
    const insertApplied = db.prepare(
      "INSERT INTO schema_migrations(name, applied_at) VALUES (?, ?)"
    );

    db.exec("BEGIN");
    try {
      for (const name of names) {
        if (applied.has(name)) {
          continue;
        }
        db.exec(readMigrationSql(name, "up"));
        insertApplied.run(name, new Date().toISOString());
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }

  const appliedDescending = db
    .prepare("SELECT name FROM schema_migrations ORDER BY name DESC")
    .all()
    .map((row) => row.name);
  const deleteApplied = db.prepare("DELETE FROM schema_migrations WHERE name = ?");

  db.exec("BEGIN");
  try {
    for (const name of appliedDescending) {
      db.exec(readMigrationSql(name, "down"));
      deleteApplied.run(name);
    }
    db.exec("DROP TABLE IF EXISTS schema_migrations");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
