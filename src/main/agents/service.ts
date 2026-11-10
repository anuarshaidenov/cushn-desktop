/**
 * Settings → Agents: each client's status, and Connect / Disconnect. Connect writes the
 * `cushn-mcp` launcher before registering it; the launcher goes once no client uses it.
 */
import { AGENT_KINDS, type AgentKind, type AgentStatus, type McpSocketStatus } from "@shared/api";
import type { Connections } from "./connections";
import type { Detector } from "./detect";

export interface AgentServiceDependencies {
  detector: Pick<Detector, "detect" | "resolveCli">;
  connections: Connections;
  launcher: {
    /** Writes the launcher for this copy of the app; returns its path. */
    write(): Promise<string>;
    remove(): Promise<void>;
  };
  /** The MCP socket's state right now; it changes once the socket listens or fails. */
  socketStatus(): McpSocketStatus;
}

export interface AgentService {
  list(): Promise<AgentStatus[]>;
  connect(kind: AgentKind): Promise<AgentStatus>;
  disconnect(kind: AgentKind): Promise<AgentStatus>;
  /** Rewrites the launcher while any client is connected, so it follows the app when it moves. */
  refreshLauncher(): Promise<void>;
  socket(): McpSocketStatus;
}

export function createAgentService({
  detector,
  connections,
  launcher,
  socketStatus,
}: AgentServiceDependencies): AgentService {
  async function status(kind: AgentKind): Promise<AgentStatus> {
    const [detection, connected] = await Promise.all([
      detector.detect(kind),
      connections.isConnected(kind),
    ]);
    return { kind, ...detection, connected };
  }

  async function anyConnected(): Promise<boolean> {
    const connected = await Promise.all(AGENT_KINDS.map((kind) => connections.isConnected(kind)));
    return connected.some(Boolean);
  }

  async function removeLauncherIfUnused(): Promise<void> {
    if (!(await anyConnected())) await launcher.remove();
  }

  return {
    list: () => Promise.all(AGENT_KINDS.map(status)),

    async connect(kind) {
      const launcherPath = await launcher.write();
      try {
        await connections.connect(kind, { launcherPath, cliPath: await detector.resolveCli(kind) });
      } catch (error) {
        await removeLauncherIfUnused();
        throw error;
      }
      return status(kind);
    },

    async disconnect(kind) {
      await connections.disconnect(kind, { cliPath: await detector.resolveCli(kind) });
      await removeLauncherIfUnused();
      return status(kind);
    },

    async refreshLauncher() {
      if (await anyConnected()) await launcher.write();
    },

    socket: () => socketStatus(),
  };
}
