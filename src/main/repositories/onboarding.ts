/**
 * Onboarding: whether the first-run walkthrough was completed, an ISO
 * timestamp under `app_meta` (not backed up). The `onboarded_at` migration
 * marks installs from before it as onboarded.
 */
import { eq } from "drizzle-orm";
import type { MethodName, ResultOf } from "@shared/api";
import type { AppDatabase } from "../db";
import { appMeta } from "../db/schema";

type Result<M extends MethodName<"onboarding">> = ResultOf<"onboarding", M>;

export const ONBOARDED_AT_KEY = "onboarded_at";

export function get(db: AppDatabase): Result<"get"> {
  const row = db.select().from(appMeta).where(eq(appMeta.key, ONBOARDED_AT_KEY)).get();
  return { completedAt: row ? Date.parse(row.value) : null };
}

export function complete(db: AppDatabase, now: number = Date.now()): Result<"complete"> {
  return db.transaction((tx) => {
    tx.insert(appMeta)
      .values({ key: ONBOARDED_AT_KEY, value: new Date(now).toISOString() })
      .onConflictDoNothing()
      .run();
    return { success: true };
  });
}
