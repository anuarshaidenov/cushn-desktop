import * as onboarding from "../repositories/onboarding";
import { type CushnHandlers, noArgs } from "./handler";

export const onboardingHandlers: CushnHandlers["onboarding"] = {
  get: {
    args: noArgs,
    run: ({ db }) => onboarding.get(db),
  },
  complete: {
    args: noArgs,
    run: ({ db }) => onboarding.complete(db),
  },
};
