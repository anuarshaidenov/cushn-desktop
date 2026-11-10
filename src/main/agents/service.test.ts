import { describe, expect, it } from "vitest";
import type { AgentKind, McpSocketStatus } from "@shared/api";
import { CushnError } from "@shared/errors";
import type { Connections } from "./connections";
import { type AgentServiceDependencies, createAgentService } from "./service";

function setup(options: { failConnect?: boolean } = {}) {
  let socket: McpSocketStatus = { state: "starting" };
  const connected = new Set<AgentKind>();
  const log: string[] = [];
  const connections: Connections = {
    isConnected: async (kind) => connected.has(kind),
    async connect(kind, { launcherPath, cliPath }) {
      log.push(`connect ${kind} ${launcherPath} ${cliPath}`);
      if (options.failConnect) throw new CushnError("CONFLICT", "Already there");
      connected.add(kind);
    },
    async disconnect(kind, { cliPath } = {}) {
      log.push(`disconnect ${kind} ${cliPath}`);
      connected.delete(kind);
    },
  };
  const deps: AgentServiceDependencies = {
    detector: {
      detect: async () => ({
        installation: { path: "/bin/x", version: "1.0" },
        account: { status: "unknown" },
      }),
      resolveCli: async (kind) => (kind === "claude-desktop" ? null : `/bin/${kind}`),
    },
    connections,
    launcher: {
      write: async () => {
        log.push("write launcher");
        return "/home/.cushn/bin/cushn-mcp";
      },
      remove: async () => {
        log.push("remove launcher");
      },
    },
    socketStatus: () => socket,
  };
  const setSocket = (status: McpSocketStatus) => {
    socket = status;
  };
  return { service: createAgentService(deps), log, connected, setSocket };
}

describe("agent service", () => {
  it("lists every kind with its detection and connection", async () => {
    const { service, connected } = setup();
    connected.add("codex");
    const list = await service.list();
    expect(list.map(({ kind, connected }) => [kind, connected])).toEqual([
      ["claude-code", false],
      ["codex", true],
      ["claude-desktop", false],
    ]);
    expect(list[0].installation).toEqual({ path: "/bin/x", version: "1.0" });
  });

  it("writes the launcher, then registers it with the resolved CLI", async () => {
    const { service, log } = setup();
    const status = await service.connect("claude-code");
    expect(status.connected).toBe(true);
    expect(log).toEqual([
      "write launcher",
      "connect claude-code /home/.cushn/bin/cushn-mcp /bin/claude-code",
    ]);
  });

  it("removes the launcher when a connect fails and nothing else uses it", async () => {
    const { service, log } = setup({ failConnect: true });
    await expect(service.connect("codex")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(log.at(-1)).toBe("remove launcher");
  });

  it("keeps the launcher while another client is connected", async () => {
    const { service, log } = setup();
    await service.connect("codex");
    await service.connect("claude-desktop");
    await service.disconnect("codex");
    expect(log).not.toContain("remove launcher");
    const status = await service.disconnect("claude-desktop");
    expect(status.connected).toBe(false);
    expect(log.at(-1)).toBe("remove launcher");
    expect(log).toContain("disconnect claude-desktop null");
  });

  it("refreshes the launcher only while a client is connected", async () => {
    const { service, log } = setup();
    await service.refreshLauncher();
    expect(log).toEqual([]);
    await service.connect("codex");
    await service.refreshLauncher();
    expect(log.filter((line) => line === "write launcher")).toHaveLength(2);
  });

  it("reports the socket's current state on each call", () => {
    const { service, setSocket } = setup();
    expect(service.socket()).toEqual({ state: "starting" });
    setSocket({ state: "failed", message: "Another app is using Cushn's agent socket." });
    expect(service.socket()).toEqual({
      state: "failed",
      message: "Another app is using Cushn's agent socket.",
    });
  });
});
