import { useState } from "react";
import { PlugSocketIcon } from "@hugeicons/core-free-icons";
import {
  AgentList,
  AgentsError,
  SocketAlert,
} from "@/components/AgentsSettings";
import { useAgents } from "@/data/agents";
import { StepLayout } from "./StepLayout";

// The sample budgets answer both.
const prompts = [
  "How much is left for wants this month?",
  "Log a $14 lunch to this month's budget",
];

export const OnboardingAgents = () => {
  const { data: agents, error, refetch, isFetching } = useAgents();
  // Onboarding starts detecting as it opens, so usually the rows are filled by now.
  const [fadeIn] = useState(agents === undefined);

  return (
    <StepLayout
      icon={PlugSocketIcon}
      label="Connect an agent"
      title="Bring the agent you already use."
      body="Turn on Claude or Codex, and it can read your budgets and log what you spend, only when you ask. Change it any time in Settings."
    >
      <div className="overflow-hidden rounded-xl bg-card shadow-(--custom-shadow)">
        {error && !agents ? (
          <AgentsError error={error} refetch={refetch} isFetching={isFetching} />
        ) : (
          <>
            <SocketAlert />
            <AgentList agents={agents} fadeIn={fadeIn} />
          </>
        )}
      </div>
      <p className="mt-7 text-sm text-muted-foreground">
        Then ask it something like
      </p>
      <ul className="mt-2.5 flex flex-col items-start gap-1.5">
        {prompts.map((prompt) => (
          <li
            key={prompt}
            className="rounded-2xl rounded-bl-md bg-foreground/6 px-3.5 py-2 text-sm"
          >
            {prompt}
          </li>
        ))}
      </ul>
    </StepLayout>
  );
};
