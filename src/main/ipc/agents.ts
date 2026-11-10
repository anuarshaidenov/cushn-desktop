import { z } from "zod";
import { AGENT_KINDS } from "@shared/api";
import type { AgentService } from "../agents/service";
import { type CushnHandlers, noArgs } from "./handler";

const kindArgs = z.object({ kind: z.enum(AGENT_KINDS) });

export function createAgentHandlers(agents: AgentService): CushnHandlers["agents"] {
  return {
    list: {
      args: noArgs,
      run: () => agents.list(),
    },
    connect: {
      args: kindArgs,
      run: (_context, { kind }) => agents.connect(kind),
    },
    disconnect: {
      args: kindArgs,
      run: (_context, { kind }) => agents.disconnect(kind),
    },
    socket: {
      args: noArgs,
      run: () => agents.socket(),
    },
  };
}
