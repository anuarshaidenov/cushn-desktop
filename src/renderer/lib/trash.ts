import { TRASH_RETENTION_DAYS } from "@shared/constants";

const DAY = 24 * 60 * 60 * 1000;

/** Whole days until the startup purge may remove a trashed budget; 0 once it is due. */
export const trashDaysLeft = (deletedAt: number, now = Date.now()) =>
  Math.max(0, Math.ceil((deletedAt + TRASH_RETENTION_DAYS * DAY - now) / DAY));

export const formatTrashDaysLeft = (daysLeft: number) =>
  daysLeft === 0
    ? "Deleted at next launch"
    : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
