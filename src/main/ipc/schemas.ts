/** zod building blocks for IPC args. Main treats every IPC argument as untrusted. */
import { z } from "zod";
import { type TableName, asId } from "@shared/domain";

/** A non-empty string, typed as an id of `table`. Existence is the repository's job (404). */
export function id<T extends TableName>(_table: T) {
  return z
    .string()
    .min(1)
    .transform((value) => asId<T>(value));
}
