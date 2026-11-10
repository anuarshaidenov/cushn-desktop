ALTER TABLE `budgets` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `budgets_deleted_idx` ON `budgets` (`deleted_at`);