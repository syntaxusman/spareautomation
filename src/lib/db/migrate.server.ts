import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { getServerConfig } from "../config.server";
import { shouldReportFailure, summarizeDatabaseError } from "./resilience";

let migrated = false;
let migrationPromise: Promise<boolean> | undefined;
let nextMigrationAttemptAt = 0;
let lastMigrationFailureLogAt = 0;
const MAX_MIGRATION_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 500;
const MIGRATION_FAILURE_COOLDOWN_MS = 60_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Apply pending Drizzle migrations on server boot. Idempotent: Drizzle records
 * applied migrations in a `__drizzle_migrations` table, so repeated calls are
 * safe. The migrations folder lives at the repo root (`./drizzle`) and is
 * copied into the Docker runtime image (see Dockerfile).
 */
export async function runMigrations(): Promise<boolean> {
  if (migrated) return true;
  if (migrationPromise) return migrationPromise;

  const now = Date.now();
  if (now < nextMigrationAttemptAt) return false;

  const { databaseUrl } = getServerConfig();
  if (!databaseUrl) {
    console.warn("[db] DATABASE_URL not set; skipping CMS migrations.");
    return false;
  }

  migrationPromise = (async () => {
    const folder = process.env.DRIZZLE_MIGRATIONS_FOLDER ?? "./drizzle";
    for (let attempt = 1; attempt <= MAX_MIGRATION_ATTEMPTS; attempt += 1) {
      const client = postgres(databaseUrl, { max: 1 });
      try {
        await migrate(drizzle(client), { migrationsFolder: folder });
        migrated = true;
        nextMigrationAttemptAt = 0;
        console.info("[db] CMS migrations applied.");
        return true;
      } catch (error) {
        if (attempt === MAX_MIGRATION_ATTEMPTS) {
          const failedAt = Date.now();
          nextMigrationAttemptAt = failedAt + MIGRATION_FAILURE_COOLDOWN_MS;
          if (shouldReportFailure(lastMigrationFailureLogAt, failedAt)) {
            lastMigrationFailureLogAt = failedAt;
            console.error(
              `[db] CMS migrations unavailable after ${MAX_MIGRATION_ATTEMPTS} attempts; retry paused for ${MIGRATION_FAILURE_COOLDOWN_MS / 1_000}s (${summarizeDatabaseError(error)}).`,
            );
          }
          return false;
        }
        const retryDelay = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
        console.warn(`[db] CMS migration attempt ${attempt} failed; retrying in ${retryDelay}ms.`);
        await delay(retryDelay);
      } finally {
        await client.end({ timeout: 5 });
      }
    }
    return false;
  })().finally(() => {
    if (!migrated) migrationPromise = undefined;
  });

  return migrationPromise;
}
