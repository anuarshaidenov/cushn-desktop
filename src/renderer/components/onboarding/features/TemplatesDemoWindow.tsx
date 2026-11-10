import type { CSSProperties } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  Layers01Icon,
  Luggage01Icon,
  SidebarLeftIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

// The dialog starts on the October budget's template, as the app picks the latest budget's.
export const TEMPLATE_FROM = "50/30/20";
export const TEMPLATE_CHOSEN = "Travel";
const templates = [TEMPLATE_CHOSEN, TEMPLATE_FROM, "75/10/15"];

const october = [
  {
    name: "Needs",
    spent: "2,247.80",
    planned: "2,500",
    grow: 2500,
    fill: "89.912%",
  },
  {
    name: "Wants",
    spent: "499.63",
    planned: "1,500",
    grow: 1500,
    fill: "33.3087%",
  },
  { name: "Savings", spent: "0", planned: "1,000", grow: 1000, fill: "0%" },
];

const biggest = [
  { name: "Rent", allocation: "Needs", amount: "$1,450", fill: "52.78%" },
  {
    name: "Health insurance",
    allocation: "Needs",
    amount: "$214",
    fill: "7.79%",
  },
  { name: "Groceries", allocation: "Needs", amount: "$164.20", fill: "5.98%" },
  {
    name: "Concert tickets",
    allocation: "Wants",
    amount: "$140",
    fill: "5.1%",
  },
  { name: "Groceries", allocation: "Needs", amount: "$131.85", fill: "4.8%" },
];

const allocations = [
  {
    name: "Getting there",
    description: "Flights, trains and transfers",
    amount: 700,
  },
  { name: "Stay", description: "Hotels and rentals", amount: 800 },
  { name: "Food & fun", description: "Meals, tours and tickets", amount: 500 },
];

const fill = (value: string) => ({ "--fill": value }) as CSSProperties;

// The dialog's select chips, as the app's SelectTrigger draws them at size sm.
const chip =
  "relative flex h-8 w-fit items-center gap-2 rounded-full bg-transparent px-2 text-xs whitespace-nowrap shadow-(--custom-shadow-control) dark:bg-input/30 [&_svg]:shrink-0";

const SidebarToggle = () => (
  <div className="relative mr-2 inline-flex size-7 shrink-0 items-center justify-center rounded-full [&_svg]:size-4 [&_svg]:text-muted-foreground">
    <HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={2} />
  </div>
);

const BudgetGlyph = () => (
  <div className="-ml-2 inline-flex size-12 shrink-0 items-center justify-center rounded-xl">
    <HugeiconsIcon
      icon={Luggage01Icon}
      strokeWidth={1.75}
      className="size-8 text-foreground"
    />
  </div>
);

const SectionTitle = ({ children }: { children: string }) => (
  <h2 className="text-xs font-medium text-muted-foreground">{children}</h2>
);

// Home, behind the New budget dialog: the Lisbon trip doesn't exist yet.
const HomePage = ({ hidden }: { hidden: boolean }) => (
  <div data-page="home" className="absolute inset-0" hidden={hidden}>
    <div className="flex h-full flex-col">
      <header className="flex h-12 items-center rounded-t-xl bg-background px-4 py-2 pl-20">
        <SidebarToggle />
      </header>
      <div className="flex-1 overflow-hidden">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col p-4 pb-20 @min-[480px]:p-10 @min-[480px]:pt-6">
          <div className="flex min-w-0 flex-col gap-6">
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <SectionTitle>Current budget</SectionTitle>
              </div>
              <div className="@container flex flex-col gap-5 rounded-xl bg-card p-4 text-card-foreground shadow-(--custom-shadow) @min-[480px]:p-5">
                <div className="flex items-baseline-last justify-between gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <h3 className="flex min-w-0 items-center gap-0.5 text-sm font-medium">
                      <span className="truncate">October budget</span>
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        strokeWidth={2}
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                    </h3>
                    <span className="text-2xl font-medium tracking-tight whitespace-nowrap tabular-nums @min-[480px]:text-3xl">
                      $2,252.57
                    </span>
                  </div>
                  <p className="shrink-0 text-right text-sm text-muted-foreground">
                    left of{" "}
                    <span className="whitespace-nowrap text-foreground tabular-nums">
                      $5,000
                    </span>
                  </p>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="flex h-3 w-full gap-0.5">
                    {october.map((row) => (
                      <div
                        key={row.name}
                        className="h-full min-w-0.5 overflow-hidden rounded-[3px] bg-primary/15"
                        style={{ flex: `${row.grow} 1 0px`, ...fill(row.fill) }}
                      >
                        <div className="h-full translate-x-[calc(var(--fill)-100%)] bg-primary" />
                      </div>
                    ))}
                  </div>
                  <ul className="grid grid-cols-1 gap-x-6 @md:grid-cols-2">
                    {october.map((row) => (
                      <li
                        key={row.name}
                        className="flex items-baseline justify-between gap-3 border-t border-border/60 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate">{row.name}</span>
                        <span className="shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">
                          <span className="text-foreground">{row.spent}</span> /{" "}
                          {row.planned}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <SectionTitle>Biggest expenses</SectionTitle>
                <span className="text-xs text-muted-foreground tabular-nums">
                  76% of spending
                </span>
              </div>
              <div className="flex flex-col rounded-xl bg-card p-1.5 text-card-foreground shadow-(--custom-shadow)">
                <ul className="flex flex-col">
                  {biggest.map((expense, index) => (
                    <li
                      key={index}
                      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="flex min-w-0 flex-1 items-baseline gap-1.5">
                            <span className="truncate">{expense.name}</span>
                            <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">
                              {expense.allocation}
                            </span>
                          </p>
                          <span className="shrink-0 whitespace-nowrap tabular-nums">
                            {expense.amount}
                          </span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-primary/15">
                          <div
                            className="h-full w-(--fill) rounded-full bg-primary"
                            style={fill(expense.fill)}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// The new Lisbon trip, split by Travel, before any expenses. Its blocks ([data-enter]) rise in when it opens.
const BudgetPage = ({ shown }: { shown: boolean }) => (
  <div
    data-page="budget"
    className="absolute inset-0"
    style={shown ? undefined : { opacity: 0 }}
  >
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-12 items-center rounded-t-xl border-b bg-background px-4 py-2 pl-20">
        <SidebarToggle />
        <ol className="flex flex-wrap items-center gap-1.5 text-sm break-words text-muted-foreground @min-[480px]:gap-2.5">
          <li className="inline-flex items-center gap-1.5">Budgets</li>
          <li className="[&>svg]:size-3.5">
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="truncate font-normal text-foreground">
              Lisbon trip
            </span>
          </li>
        </ol>
      </header>
      <div className="w-full border-b bg-background px-4 py-2">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs text-muted-foreground">October 1, 2026</span>
          <span className="text-xs text-muted-foreground">Travel</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto max-w-3xl p-4 @min-[480px]:p-10">
          <div
            data-enter=""
            className="mb-10 flex flex-col gap-4 @min-[480px]:gap-10"
          >
            <div className="flex flex-col gap-2">
              <BudgetGlyph />
              <div className="h-9 w-full min-w-0 content-center truncate text-2xl @min-[480px]:text-3xl">
                Lisbon trip
              </div>
            </div>
            <div className="tiptap ProseMirror mx-auto prose w-full max-w-none text-foreground dark:prose-invert prose-p:my-0">
              <p className="is-editor-empty" data-placeholder="Add description">
                <br />
              </p>
            </div>
          </div>
          <div data-enter="" className="mb-10">
            <div className="flex h-9 w-full min-w-0 items-center text-2xl @min-[480px]:text-3xl">
              <div className="h-9 min-w-0 flex-1 content-center truncate py-1 pl-0 tabular-nums">
                2{" "}000
              </div>
              <div className="inline-flex h-10 shrink-0 items-center justify-center rounded-full px-3.5 text-2xl font-medium text-muted-foreground uppercase shadow-(--custom-shadow-control) dark:bg-input/30">
                eur
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-14">
            {allocations.map((allocation) => (
              <div data-enter="" key={allocation.name}>
                <div className="mb-6 flex justify-between gap-4 @min-[480px]:items-start">
                  <div className="flex min-w-0 flex-col gap-2">
                    <div className="text-lg text-muted-foreground">
                      {allocation.name}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {allocation.description}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-lg font-medium text-muted-foreground tabular-nums">
                    {allocation.amount} €
                  </div>
                </div>
                <div className="flex h-9 w-full min-w-0 items-center rounded-full shadow-(--custom-shadow-control) dark:bg-input/30">
                  <div className="h-9 min-w-0 flex-1 content-center truncate px-3 py-1 text-base text-muted-foreground tabular-nums @min-[480px]:text-sm">
                    Add expense, e.g. Coffee 20k + 5k or Rent 200 usd
                  </div>
                  <div className="flex items-center py-1.5 pr-3">
                    <div className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary [&_svg]:size-3.5 [&_svg]:text-muted-foreground">
                      <HugeiconsIcon
                        icon={ArrowUp02Icon}
                        strokeWidth={2}
                        className="translate-y-[0.5px]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

// The New budget dialog, filled in for the trip. [data-rest] is where the pointer starts.
const NewBudgetDialog = ({
  hidden,
  template,
}: {
  hidden: boolean;
  template: string;
}) => (
  <div
    data-dialog=""
    hidden={hidden}
    className="absolute top-1/2 left-1/2 z-10 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover text-popover-foreground shadow-(--custom-shadow-overlay) @min-[480px]:max-w-lg"
  >
    <div className="flex flex-col gap-2 px-6 pt-5 text-left">
      <div className="text-sm font-normal text-muted-foreground/60">
        New budget
      </div>
    </div>
    <div className="px-6 pb-4">
      <div className="flex flex-col gap-2">
        <BudgetGlyph />
        <div className="h-9 w-full min-w-0 content-center truncate text-xl">
          Lisbon trip
        </div>
        <div
          data-rest=""
          className="min-h-16 w-full text-sm text-muted-foreground @min-[480px]:text-base"
        >
          Add description
        </div>
        <div className="mb-6 flex h-9 w-full min-w-0 items-center text-2xl @min-[480px]:text-3xl">
          <div className="h-9 min-w-0 flex-1 content-center truncate py-1 pl-0 text-xl tabular-nums">
            2{" "}000
          </div>
          <div className="flex items-center pr-3 text-lg font-medium text-muted-foreground">
            EUR
          </div>
        </div>
        <div className="flex flex-wrap content-start items-center gap-2">
          <div className={chip}>EUR</div>
          <div
            data-template-trigger=""
            className={cn(
              chip,
              "max-w-[140px] overflow-hidden transition-[background-color] duration-150 data-hover:dark:bg-input/50",
            )}
          >
            <span className="line-clamp-1 flex items-center gap-2">
              <span data-template-label="" className="truncate">
                {template}
              </span>
            </span>
          </div>
          <div className={cn(chip, "w-[100px]")}>
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="inline-block size-3 shrink-0 rounded-full"
                style={{ backgroundColor: "rgb(139, 92, 246)" }}
              />
              <span className="truncate">One-time</span>
            </span>
          </div>
          <div className={cn(chip, "max-w-[130px]")}>
            <HugeiconsIcon
              icon={Layers01Icon}
              strokeWidth={2}
              className="size-3 text-muted-foreground"
            />
            <span className="truncate">Trips</span>
          </div>
        </div>
      </div>
    </div>
    <div className="flex flex-row justify-end gap-2 border-t px-6 py-4">
      <div
        data-create=""
        className="relative inline-flex h-7 shrink-0 items-center justify-center rounded-full bg-foreground px-3 text-sm font-medium whitespace-nowrap text-background shadow-(--custom-shadow-control-solid) transition-[background-color] duration-150 data-hover:bg-foreground/90"
      >
        Create budget
      </div>
    </div>
    <div className="absolute top-5 right-5 rounded-full opacity-70 [&_svg]:size-4">
      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
    </div>
  </div>
);

// Base UI's select popup for the template chip. The story places it under the chip.
const TemplateMenu = ({ selected }: { selected: string }) => (
  <div
    data-menu=""
    hidden
    className="absolute top-0 left-0 z-10 min-w-[8rem] overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-(--custom-shadow-popover)"
  >
    <div className="w-full p-1">
      <div className="px-2 py-1.5 text-xs text-muted-foreground">
        Budget templates
      </div>
      {templates.map((name) => (
        <div
          key={name}
          data-template-item={name}
          data-selected={name === selected ? "" : undefined}
          className="group relative flex w-full items-center gap-2 rounded-lg py-1.5 pr-8 pl-2 text-sm data-highlighted:bg-accent data-highlighted:text-accent-foreground"
        >
          <span className="absolute right-2 flex size-3.5 items-center justify-center">
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2}
              className="invisible size-4 text-muted-foreground group-data-[selected]:visible"
            />
          </span>
          <span className="block w-24 truncate">{name}</span>
        </div>
      ))}
    </div>
  </div>
);

// Cushn in a narrow window, sidebar collapsed. `finished` renders where the story ends; otherwise where it starts.
export const TemplatesDemoWindow = ({ finished }: { finished: boolean }) => {
  const template = finished ? TEMPLATE_CHOSEN : TEMPLATE_FROM;
  return (
    <div className="relative h-full rounded-xl after:pointer-events-none after:absolute after:inset-0 after:rounded-xl after:shadow-(--custom-shadow-chrome)">
      <div className="@container pointer-events-none relative h-full overflow-hidden rounded-xl select-none">
        {/* The traffic lights stay above the scrim, as the native ones do. */}
        <div className="absolute top-[22px] left-[18px] z-20 flex gap-2">
          {["bg-[#ff5f57]", "bg-[#febc2e]", "bg-[#28c840]"].map((color) => (
            <span
              key={color}
              className={cn(
                "size-3 rounded-full shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]",
                color,
              )}
            />
          ))}
        </div>
        <div className="flex h-full w-full bg-sidebar p-1">
          <div className="relative h-full min-w-0 flex-1 overflow-hidden rounded-xl bg-background shadow-(--custom-shadow-raised)">
            <HomePage hidden={finished} />
            <BudgetPage shown={finished} />
          </div>
        </div>
        <div
          data-scrim=""
          hidden={finished}
          className="absolute inset-0 z-10 bg-black/50"
        />
        <NewBudgetDialog hidden={finished} template={template} />
        <TemplateMenu selected={template} />
      </div>
    </div>
  );
};
