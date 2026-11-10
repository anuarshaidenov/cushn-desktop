import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { changelogUrl, type ChangeKind, type Release } from "@/lib/changelog";
import { currentRelease } from "@/lib/currentRelease";

const kindLabels: Record<ChangeKind, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
};

// Dates are plain `YYYY-MM-DD`, parsed as UTC midnight; format in UTC so they never shift a day.
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export const WhatsNewButton = ({ className }: { className?: string }) => {
  if (!currentRelease) return null;
  return (
    <Dialog scaleFromTrigger>
      <DialogTrigger
        render={<Button variant="ghost" size="xs" className={className} />}
      >
        What's new
      </DialogTrigger>
      <ChangelogDialogContent release={currentRelease} />
    </Dialog>
  );
};

const ChangelogDialogContent = ({ release }: { release: Release }) => {
  return (
    <DialogContent className="gap-0 p-0" showCloseButton={false}>
      <DialogHeader className="flex-row items-center justify-between border-b py-1.5 pr-5 pl-6">
        <DialogTitle>
          <a
            href={`${changelogUrl}#v${release.version}`}
            target="_blank"
            rel="noreferrer"
            // Pulled left by its padding so the text lines up with the body.
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "-ml-3 text-base font-semibold",
            )}
          >
            Changelog
            <HugeiconsIcon
              icon={ArrowUpRight01Icon}
              strokeWidth={2}
              className="size-4"
            />
          </a>
        </DialogTitle>
        <DialogClose render={<Button variant="ghost" size="icon-xs" />}>
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          <span className="sr-only">Close</span>
        </DialogClose>
      </DialogHeader>
      <div className="max-h-[min(30rem,65vh)] overflow-y-auto px-6 py-5">
        <ReleaseNotes release={release} />
      </div>
    </DialogContent>
  );
};

const ReleaseNotes = ({ release }: { release: Release }) => {
  return (
    <section>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium tabular-nums">v{release.version}</span>
        <time dateTime={release.date} className="text-muted-foreground">
          {dateFormat.format(new Date(release.date))}
        </time>
        <Badge variant="secondary" className="px-1.5 py-0">
          Latest
        </Badge>
      </div>
      <h3 className="mt-2 text-sm font-medium">{release.title}</h3>
      <ul className="mt-3 flex flex-col gap-2">
        {release.changes.map((change) => (
          <li key={change.text} className="flex items-baseline gap-3 text-sm">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">
              {kindLabels[change.kind]}
            </span>
            <span className="text-pretty">{change.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
