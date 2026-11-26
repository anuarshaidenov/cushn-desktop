import type { IconSvgElement } from "@hugeicons/react";
import {
  ChatGptIcon,
  ClaudeIcon,
  CommandIcon,
} from "@hugeicons/core-free-icons";
import type { AgentKind } from "@shared/api";

export const agentTitles: Record<AgentKind, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "claude-desktop": "Claude Desktop",
  raycast: "Raycast",
};

/** One Settings row per provider; its switch connects every installed client in `kinds`. */
export interface AgentGroup {
  id: string;
  title: string;
  icon: IconSvgElement;
  /** The provider's brand colours for the icon box; neutral where the brand isn't ours to use. */
  iconClassName: string;
  /** The first one with an account speaks for the row. */
  kinds: readonly AgentKind[];
  installHint: string;
}

export const agentGroups: readonly AgentGroup[] = [
  {
    id: "claude",
    title: "Claude",
    icon: ClaudeIcon,
    iconClassName: "bg-[#d97757] text-white",
    kinds: ["claude-code", "claude-desktop"],
    installHint:
      "Install Claude Code or the Claude desktop app, then come back here.",
  },
  {
    id: "codex",
    title: "Codex",
    icon: ChatGptIcon,
    iconClassName: "bg-black text-white dark:bg-white dark:text-black",
    kinds: ["codex"],
    installHint: "Install the ChatGPT desktop app or the Codex CLI, then come back here.",
  },
  {
    id: "raycast",
    title: "Raycast",
    icon: CommandIcon,
    iconClassName: "bg-muted text-foreground",
    kinds: ["raycast"],
    installHint:
      "Install Raycast and the Cushn extension, then come back here.",
  },
];

/** Onboarding offers the AI agents; Raycast waits in Settings. */
export const onboardingAgentGroups = agentGroups.filter(
  (group) => group.id !== "raycast",
);
