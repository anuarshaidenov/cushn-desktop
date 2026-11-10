/** The only reader of `window.cushn` besides `platform.ts` and `mainChanges.ts`; rejects with renderer-side `CushnError`s so `instanceof` works. */
import { createApiClient } from "@shared/api";

export const cushn = createApiClient(window.cushn);
