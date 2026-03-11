import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { runMigrations } from "../platform/storage/migrations.js";
import { createStorageRepositories } from "../platform/storage/repositories.js";
import { createDaemonServer } from "./http-server.js";

export function createEntrypointDatabase({ databasePath = ":memory:" } = {}) {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db, { direction: "up" });
  return db;
}

export function createEntrypointDaemon({ databasePath, ...serverOptions } = {}) {
  const storageDb = createEntrypointDatabase({ databasePath });
  const daemon = createDaemonServer({
    ...serverOptions,
    repositories: createStorageRepositories(storageDb)
  });

  return {
    daemon,
    storageDb
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { daemon, storageDb } = createEntrypointDaemon();
  // Hold storageDb reference to prevent GC from finalizing SQLite statements
  process.__storageDb = storageDb;

  daemon
    .start()
    .then(() => {
      const address = daemon.address();

      if (address) {
        console.info(`daemon listening on http://${address.address}:${address.port}`);
      }
    })
    .catch((error) => {
      console.error("daemon failed to start", error);
      process.exitCode = 1;
    });
}
