import * as home from "../repositories/home";
import { type CushnHandlers, noArgs } from "./handler";

export const homeHandlers: CushnHandlers["home"] = {
  summary: {
    args: noArgs,
    run: ({ db }) => home.summary(db),
  },
};
