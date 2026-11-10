const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);

export const formatRelativeTime = (time: number, now = Date.now()) => {
  const elapsed = now - time;

  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR)
    return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY)
    return relative.format(-Math.floor(elapsed / HOUR), "hour");

  // Calendar days, not 24-hour spans: 30 hours ago can be two days back.
  const days = Math.round((startOfDay(now) - startOfDay(time)) / DAY);
  if (days < 7) return relative.format(-days, "day");

  const date = new Date(time);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date(now).getFullYear()
        ? undefined
        : "numeric",
  });
};
