import { memo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Calendar03Icon,
  DragDropVerticalIcon,
  MoreVerticalCircle01Icon,
  SidebarLeftIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

const ICON_BUTTON =
  "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-muted-foreground";

const EXPENSES = [
  { title: "Rent", amount: "1 450" },
  { title: "Transit pass", amount: "90" },
  { title: "Phone & internet", amount: "85" },
  { title: "Groceries", amount: "164.2" },
];

/*
  The budget page in a narrow window, sidebar collapsed, as captured from the
  app for the landing's NotesDemo. Inputs and buttons are plain divs, with the
  classes that draw them and none of their interactive states. The header has
  no `app-drag`: here it would drag the real window.

  Hooks for NotesDemo: [data-notes] is the editor in its finished state,
  [data-typed] the heading and list it types back in, [data-after-notes] what
  moves down as the notes grow. Memoised so React never re-renders what the
  story has rearranged.
*/
export const NotesDemoWindow = memo(function NotesDemoWindow() {
  return (
    <div className="relative h-full rounded-xl after:pointer-events-none after:absolute after:inset-0 after:rounded-xl after:shadow-(--custom-shadow-chrome)">
      <div className="@container relative h-full overflow-hidden rounded-xl">
        <div className="absolute top-[22px] left-[18px] z-20 flex gap-2">
          <span className="size-3 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]" />
          <span className="size-3 rounded-full bg-[#febc2e] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]" />
          <span className="size-3 rounded-full bg-[#28c840] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]" />
        </div>
        <div className="flex h-full w-full bg-sidebar p-1">
          <div className="h-full min-w-0 flex-1 rounded-xl bg-background shadow-(--custom-shadow-raised)">
            <div className="flex h-full flex-col overflow-hidden">
              <header className="flex h-12 items-center rounded-t-xl border-b bg-background py-2 pr-4 pl-20">
                <div
                  className={cn(
                    ICON_BUTTON,
                    "mr-2 size-7 [&_svg:not([class*='size-'])]:size-4",
                  )}
                >
                  <HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={2} />
                </div>
                <nav>
                  <ol className="flex flex-wrap items-center gap-1.5 text-sm break-words text-muted-foreground @min-[480px]:gap-2.5">
                    <li className="inline-flex items-center gap-1.5">
                      Budgets
                    </li>
                    <li className="[&>svg]:size-3.5">
                      <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
                    </li>
                    <li className="inline-flex items-center gap-1.5">
                      <span className="truncate text-foreground">
                        October budget
                      </span>
                    </li>
                  </ol>
                </nav>
              </header>
              <div className="h-auto w-full border-b bg-background px-4 py-2">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-xs text-muted-foreground">
                    October 24, 2026
                  </span>
                  <span className="text-xs text-muted-foreground">
                    50/30/20
                  </span>
                </div>
              </div>
              <div className="h-full min-h-0 flex-1">
                <div className="h-full overflow-hidden">
                  <div className="h-full pb-20">
                    <div className="mx-auto max-w-3xl p-4 @min-[480px]:p-10">
                      <div className="h-full pb-20 @min-[480px]:pb-0">
                        <div className="mb-10 flex flex-col gap-4 @min-[480px]:gap-10">
                          <div className="flex flex-col gap-2">
                            <div className="-ml-2 inline-flex size-12 shrink-0 items-center justify-center rounded-xl">
                              <HugeiconsIcon
                                icon={Calendar03Icon}
                                strokeWidth={1.75}
                                className="size-8 text-foreground"
                              />
                            </div>
                            <div className="h-9 w-full min-w-0 content-center truncate bg-background text-2xl @min-[480px]:text-3xl">
                              October budget
                            </div>
                          </div>
                          <div>
                            <div
                              data-notes
                              className="tiptap ProseMirror mx-auto prose w-full max-w-none text-foreground dark:prose-invert prose-h2:mt-4 prose-p:my-0"
                            >
                              <p>Paid on the 28th. Rent goes out first.</p>
                              <h3 data-typed>This month</h3>
                              <ul data-typed>
                                <li>
                                  <p>Car insurance renews on the 14th</p>
                                </li>
                                <li>
                                  <p>Move leftover Wants to savings</p>
                                </li>
                              </ul>
                            </div>
                          </div>
                        </div>
                        <div data-after-notes>
                          <div className="mb-10">
                            <div className="relative flex h-9 w-full min-w-0 items-center bg-background text-2xl @min-[480px]:text-3xl">
                              <div className="h-9 w-full min-w-0 flex-1 content-center truncate py-1 pr-3 text-2xl tabular-nums @min-[480px]:text-3xl">
                                5 000
                              </div>
                              <div className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-background px-3.5 text-2xl font-medium whitespace-nowrap text-muted-foreground uppercase shadow-(--custom-shadow-control) dark:bg-input/30">
                                usd
                              </div>
                            </div>
                          </div>
                          <div className="mb-10">
                            <div className="flex flex-col gap-14">
                              <div>
                                <AllocationHeader
                                  name="Needs"
                                  description="Essential expenses like rent, groceries, utilities, and transportation"
                                  total={"2 500"}
                                />
                                <div className="flex flex-col gap-5">
                                  {EXPENSES.map((expense) => (
                                    <ExpenseRow
                                      key={expense.title}
                                      {...expense}
                                    />
                                  ))}
                                </div>
                              </div>
                              <div>
                                <AllocationHeader
                                  name="Wants"
                                  description="Discretionary spending on entertainment, dining out, and hobbies"
                                  total={"1 500"}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const AllocationHeader = (props: {
  name: string;
  description: string;
  total: string;
}) => (
  <div className="mb-6 flex justify-between @min-[480px]:items-start">
    <div className="flex flex-col gap-2">
      <div className="text-lg text-muted-foreground">{props.name}</div>
      <p className="text-sm text-muted-foreground">{props.description}</p>
    </div>
    <div className="shrink-0 text-right text-muted-foreground">
      <div className="flex flex-col text-lg font-medium @min-[480px]:items-end">
        <div className="flex items-center gap-2 @min-[480px]:-mr-8">
          <span className="tabular-nums">
            {props.total} <span className="uppercase">$</span>
          </span>
          {/* The copy button, which shows only on hover. */}
          <span className="hidden size-6 shrink-0 @min-[480px]:block" />
        </div>
      </div>
    </div>
  </div>
);

const ExpenseRow = (props: { title: string; amount: string }) => (
  <div className="flex w-full items-center gap-2">
    <div className="flex items-center gap-2 @min-[480px]:-ml-8">
      <div className={cn(ICON_BUTTON, "text-muted-foreground")}>
        <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={2} />
      </div>
    </div>
    <div className="flex w-full min-w-0 items-center justify-between">
      <div className="h-9 w-full min-w-0 content-center truncate bg-background pb-1 text-lg @min-[480px]:text-xl">
        {props.title}
      </div>
      <div className="relative flex h-9 w-28 min-w-0 items-center bg-background @min-[480px]:w-48 @min-[480px]:text-3xl">
        <div className="block h-9 w-48 min-w-0 flex-1 content-center truncate pr-2 pb-1 text-right text-lg tabular-nums @min-[480px]:text-xl">
          {props.amount}
        </div>
        <div className="order-last flex h-auto items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground">
          <span className="flex items-center gap-2 pb-1 text-lg text-muted-foreground">
            $
          </span>
        </div>
      </div>
    </div>
    <div
      className={cn(ICON_BUTTON, "@min-[480px]:-mr-8 @min-[480px]:opacity-0")}
    >
      <HugeiconsIcon icon={MoreVerticalCircle01Icon} strokeWidth={2} />
    </div>
  </div>
);
