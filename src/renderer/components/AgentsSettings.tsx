import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import type { AgentKind, AgentStatus } from "@shared/api";
import { toast } from "@/components/ui/toast";
import {
  useAgentSocket,
  useAgents,
  useConnectAgents,
  useDisconnectAgents,
} from "@/data/agents";
import { type AgentGroup, agentGroups, agentTitles } from "@/lib/agents";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "./ui/item";
import { Spinner } from "./ui/spinner";
import { Switch } from "./ui/switch";
import { cn } from "@/lib/utils";

const fade =
  "transition-opacity duration-200 ease-out-quint starting:opacity-0";

export const AgentsSettings = () => {
  const { data: agents, error, refetch, isFetching } = useAgents();
  // Results cached from an earlier visit are just there; only ones that land while watching fade in.
  const [fadeIn] = useState(agents === undefined);

  if (error && !agents) {
    return (
      <AgentsError error={error} refetch={refetch} isFetching={isFetching} />
    );
  }

  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="border-b px-4 [.border-b]:pb-6">
        <CardTitle>Connect an agent</CardTitle>
        <CardDescription>
          Agents can read your budgets and make changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 py-0">
        <SocketAlert />
        <AgentList agents={agents} fadeIn={fadeIn} />
      </CardContent>
    </Card>
  );
};

export const AgentsError = (props: {
  error: Error;
  refetch: () => unknown;
  isFetching: boolean;
}) => (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} />
      </EmptyMedia>
      <EmptyTitle>Couldn't check for agents</EmptyTitle>
      <EmptyDescription>{props.error.message}</EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button
        size="sm"
        variant="outline"
        disabled={props.isFetching}
        onClick={() => void props.refetch()}
      >
        {props.isFetching && <Spinner />}
        Try again
      </Button>
    </EmptyContent>
  </Empty>
);

/** One row per provider; `agents` is `undefined` while detecting. */
export const AgentList = (props: {
  agents: AgentStatus[] | undefined;
  fadeIn: boolean;
}) => (
  <ul className="flex flex-col" role="list" aria-busy={!props.agents}>
    {agentGroups.map((group) => (
      <li key={group.id} role="listitem">
        <AgentRow
          group={group}
          statuses={props.agents?.filter((agent) =>
            group.kinds.includes(agent.kind),
          )}
          fadeIn={props.fadeIn}
        />
      </li>
    ))}
  </ul>
);

/** Nothing while the socket starts or listens; when it failed, why agents can't connect. */
export const SocketAlert = () => {
  const { data: socket } = useAgentSocket();
  if (socket?.state !== "failed") return null;

  return (
    <Item role="alert" className="rounded-none border-b bg-destructive/5">
      <ItemMedia variant="icon" className="text-destructive">
        <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>Agents can't reach Cushn</ItemTitle>
        <ItemDescription>{socket.message}</ItemDescription>
      </ItemContent>
    </Item>
  );
};

const AgentRow = (props: {
  group: AgentGroup;
  /** `undefined` while detecting: the switch shows off and can't be flipped yet. */
  statuses: AgentStatus[] | undefined;
  fadeIn: boolean;
}) => {
  const { group, statuses, fadeIn } = props;
  const connect = useConnectAgents();
  const disconnect = useDisconnectAgents();
  const isPending = connect.isPending || disconnect.isPending;
  const detected = statuses !== undefined;
  // Ones uninstalled after connecting count too, so they can still be disconnected.
  const present = (statuses ?? []).filter(
    (status) => status.installation || status.connected,
  );
  const toConnect = present.filter((status) => !status.connected);
  const toDisconnect = present.filter((status) => status.connected);
  const connected = connect.isPending
    ? true
    : disconnect.isPending
      ? false
      : toDisconnect.length > 0 && toConnect.length === 0;
  const primary =
    present.find((status) => status.account.status !== "unknown") ?? present[0];
  const status = !detected
    ? undefined
    : present.length === 0
      ? group.installHint
      : statusLine(primary);

  const onError = (error: Error) =>
    toast.add({ type: "error", title: error.message });

  return (
    <Item>
      <ItemMedia
        variant="icon"
        className={cn(
          "shadow-(--custom-shadow-control-solid)",
          group.iconClassName,
        )}
      >
        <HugeiconsIcon icon={group.icon} strokeWidth={2} />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{group.title}</ItemTitle>
        <ItemDescription className="truncate">
          <Line text={status} fadeIn={fadeIn} />
        </ItemDescription>
        {group.kinds.length > 1 && (
          <ItemDescription className="truncate text-xs">
            <Line text={clientsLine(group, present)} fadeIn={fadeIn} />
          </ItemDescription>
        )}
      </ItemContent>
      <ItemActions>
        {isPending && <Spinner className="text-muted-foreground" />}
        <Switch
          checked={connected}
          readOnly={!detected}
          disabled={isPending || (detected && present.length === 0)}
          aria-label={`Connect ${group.title}`}
          onCheckedChange={(checked) => {
            if (!checked) {
              disconnect.mutate({ kinds: kindsOf(toDisconnect) }, { onError });
              return;
            }
            const kinds = kindsOf(toConnect);
            connect.mutate(
              { kinds },
              {
                onError,
                onSuccess: () => {
                  if (kinds.includes("claude-desktop")) {
                    toast.add({
                      type: "success",
                      title: "Restart Claude Desktop to load Cushn's tools.",
                    });
                  }
                },
              },
            );
          }}
        />
      </ItemActions>
    </Item>
  );
};

/** Holds its height while blank; keyed by text so only changed text fades in. */
const Line = (props: { text: string | undefined; fadeIn: boolean }) => (
  <span key={props.text} className={cn(props.fadeIn && fade)}>
    {props.text ?? " "}
  </span>
);

/** Which clients the switch covers; a partial connection says what turning it on adds. */
function clientsLine(group: AgentGroup, present: AgentStatus[]): string {
  const done = present.filter((status) => status.connected);
  const missing = present.filter((status) => !status.connected);
  if (done.length > 0 && missing.length > 0) {
    return `${titles(kindsOf(done))} connected. Turn on to add ${titles(kindsOf(missing))}.`;
  }
  return titles(present.length > 0 ? kindsOf(present) : group.kinds);
}

function statusLine(status: AgentStatus | undefined): string {
  if (!status?.installation) return "Not installed";
  const { account, installation } = status;
  if (account.status === "signed-in") {
    const plan = account.plan && capitalize(account.plan);
    return [account.email, plan].filter(Boolean).join(" · ") || "Signed in";
  }
  if (account.status === "signed-out") return "Signed out";
  return installation.version
    ? `Installed · version ${installation.version}`
    : "Installed";
}

function kindsOf(list: AgentStatus[]): AgentKind[] {
  return list.map((status) => status.kind);
}

function titles(kinds: readonly AgentKind[]): string {
  return kinds.map((kind) => agentTitles[kind]).join(" and ");
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
