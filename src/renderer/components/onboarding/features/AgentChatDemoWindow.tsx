import { Fragment, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Airplane01Icon,
  Alert02Icon,
  ArrowDown01Icon,
  ArrowUp02Icon,
  ClaudeIcon,
  Invoice01Icon,
  PieChartIcon,
} from "@hugeicons/core-free-icons";
import { Logo } from "@/components/Logo";

/*
  A desktop AI chat app, not Cushn: the person's Claude with Cushn's connector on. It renders
  the new chat (the story's first frame); AgentChatDemo plays the conversation into it.
*/

export const CHAT_TITLE = "October check-in";

const suggestions = [
  { icon: PieChartIcon, label: "Am I on track for October?", sent: true },
  { icon: Alert02Icon, label: "What's over budget right now?" },
  { icon: Invoice01Icon, label: "Log $42 dinner with Sam to Wants" },
  { icon: Airplane01Icon, label: "Plan a $2,000 Lisbon trip in euros" },
];

// Each word its own span, so the answer streams in without reflowing. No-break spaces hold "17 € over" together.
const Words = ({ text }: { text: string }) =>
  text.split(" ").map((word, i) => (
    <Fragment key={i}>
      {i > 0 && " "}
      <span className="acd-w">{word}</span>
    </Fragment>
  ));

const UserTurn = ({ text }: { text: string }) => (
  <div className="acd-user" data-turn="" hidden>
    <div className="acd-bubble">
      <span data-bubble-text="">{text}</span>
    </div>
  </div>
);

const ToolRow = ({ name }: { name: string }) => (
  <div className="acd-tool" data-tool="" data-state="done" hidden>
    <span className="acd-status">
      <svg viewBox="0 0 16 16" fill="none">
        <circle className="acd-status__track" cx="8" cy="8" r="6" />
        <circle
          className="acd-status__arc"
          cx="8"
          cy="8"
          r="6"
          pathLength="100"
        />
        <circle className="acd-status__disc" cx="8" cy="8" r="7" />
        <path
          className="acd-status__tick"
          d="M5.2 8.2 7.1 10l3.7-4"
          pathLength="1"
        />
      </svg>
    </span>
    <span className="acd-tool__app">Cushn</span>
    <span className="acd-tool__dot">·</span>
    <span className="acd-tool__name">{name}</span>
  </div>
);

const ReplyTurn = ({
  tools,
  children,
}: {
  tools: string[];
  children: ReactNode;
}) => (
  <div className="acd-reply" data-turn="" hidden>
    <span className="acd-avatar">
      <HugeiconsIcon icon={ClaudeIcon} strokeWidth={2} />
    </span>
    <div className="acd-reply__body">
      <div className="acd-tools" data-tools="">
        {tools.map((name) => (
          <ToolRow key={name} name={name} />
        ))}
      </div>
      <div className="acd-answer" data-answer="" style={{ height: 0 }}>
        {children}
      </div>
    </div>
  </div>
);

export const AgentChatDemoWindow = () => (
  <div className="agent-chat-app relative h-full rounded-xl after:pointer-events-none after:absolute after:inset-0 after:rounded-xl after:shadow-(--acd-chrome)">
    <div className="@container pointer-events-none relative h-full overflow-hidden rounded-xl select-none">
      <div className="absolute top-5 left-[18px] z-20 flex gap-2">
        <span className="size-3 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]" />
        <span className="size-3 rounded-full bg-[#febc2e] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]" />
        <span className="size-3 rounded-full bg-[#28c840] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]" />
      </div>

      <div className="acd-frame h-full p-1">
        <div className="acd-panel relative flex h-full flex-col rounded-xl">
          <div className="acd-titlebar">
            <div className="acd-title" data-title="">
              New chat
            </div>
          </div>

          <div className="acd-thread">
            <div className="acd-inner" data-thread-inner="">
              <div className="acd-col">
                <UserTurn text="Am I on track for October?" />
                <ReplyTurn tools={["get_home_summary", "list_expenses"]}>
                  <p>
                    <Words text="Mostly, yes. You've spent $2,747.43 of $5,000, so $2,252.57 is left." />
                  </p>
                  <ul>
                    <li>
                      <strong>
                        <Words text="Needs:" />
                      </strong>{" "}
                      <Words text="$2,247.80 of $2,500. Only $252.20 left, and rent's paid." />
                    </li>
                    <li>
                      <strong>
                        <Words text="Wants:" />
                      </strong>{" "}
                      <Words text="$499.63 of $1,500. Plenty of room." />
                    </li>
                    <li>
                      <strong>
                        <Words text="Savings:" />
                      </strong>{" "}
                      <Words text="$0 of $1,000. Nothing set aside yet." />
                    </li>
                  </ul>
                  <p>
                    <Words
                      text={
                        "One to watch: Food & fun on your Lisbon trip is 17 € over."
                      }
                    />
                  </p>
                </ReplyTurn>
                <UserTurn text="Log $42 dinner with Sam to Wants" />
                <ReplyTurn tools={["create_expenses"]}>
                  <p>
                    <Words text="Done. Dinner with Sam, $42, is in Wants. You have $958.37 left there." />
                  </p>
                </ReplyTurn>
              </div>
            </div>

            <div className="acd-empty" data-empty="">
              <div className="acd-greeting">
                <span className="acd-greeting__mark">
                  <HugeiconsIcon icon={ClaudeIcon} strokeWidth={2} />
                </span>
                <div className="acd-greeting__words">
                  What do you want to know about your money?
                </div>
              </div>
              <div className="acd-suggestions">
                {suggestions.map(({ icon, label, sent }) => (
                  <div
                    key={label}
                    className="acd-chip"
                    data-suggestion=""
                    data-suggestion-sent={sent ? "" : undefined}
                  >
                    <HugeiconsIcon
                      icon={icon}
                      strokeWidth={1.75}
                      className="acd-chip__icon"
                    />
                    <span data-label="">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="acd-dock">
            <div className="acd-composer" data-composer="">
              <div className="acd-field" data-field="">
                <span className="acd-placeholder" data-placeholder="">
                  Ask about your budgets…
                </span>
              </div>
              <div className="acd-toolbar">
                <span className="acd-iconbtn">
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} />
                </span>
                <span className="acd-connector">
                  <Logo size={14} className="acd-connector__mark" />
                  Cushn
                  <span className="acd-connector__on" />
                </span>
                <span className="acd-toolbar__gap" />
                <span className="acd-provider">
                  <HugeiconsIcon
                    icon={ClaudeIcon}
                    strokeWidth={2.25}
                    className="acd-provider__mark"
                  />
                  Claude
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    strokeWidth={2}
                    className="acd-provider__chevron"
                  />
                </span>
                <span className="acd-send" data-send="">
                  <HugeiconsIcon icon={ArrowUp02Icon} strokeWidth={2.25} />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);
