CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `budget_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`budget_id` text NOT NULL,
	`category_name` text NOT NULL,
	`percentage` real NOT NULL,
	`amount` real NOT NULL,
	`description` text,
	`editable` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `budget_allocations_budget_idx` ON `budget_allocations` (`budget_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `budget_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `budget_labels_name_idx` ON `budget_labels` (`name`);--> statement-breakpoint
CREATE INDEX `budget_labels_created_at_idx` ON `budget_labels` (`created_at`);--> statement-breakpoint
CREATE TABLE `budget_views` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`is_favorite` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `budget_views_created_at_idx` ON `budget_views` (`created_at`);--> statement-breakpoint
CREATE INDEX `budget_views_favorite_idx` ON `budget_views` (`is_favorite`,`created_at`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`template_id` text,
	`income` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`currency` text NOT NULL,
	`label_id` text,
	`view_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`label_id`) REFERENCES `budget_labels`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`view_id`) REFERENCES `budget_views`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "budgets_status_check" CHECK("budgets"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE INDEX `budgets_status_created_idx` ON `budgets` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `budgets_status_income_idx` ON `budgets` (`status`,`income`,`created_at`);--> statement-breakpoint
CREATE INDEX `budgets_status_view_created_idx` ON `budgets` (`status`,`view_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `budgets_status_view_income_idx` ON `budgets` (`status`,`view_id`,`income`,`created_at`);--> statement-breakpoint
CREATE INDEX `budgets_view_idx` ON `budgets` (`view_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `budgets_label_idx` ON `budgets` (`label_id`);--> statement-breakpoint
CREATE INDEX `budgets_template_idx` ON `budgets` (`template_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`budget_id` text NOT NULL,
	`allocation_id` text NOT NULL,
	`amount` real NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`sort_order` integer NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`allocation_id`) REFERENCES `budget_allocations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `expenses_budget_allocation_idx` ON `expenses` (`budget_id`,`allocation_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `expenses_allocation_idx` ON `expenses` (`allocation_id`);--> statement-breakpoint
CREATE TABLE `template_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`name` text NOT NULL,
	`percentage` real NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`description` text,
	`editable` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `template_categories_template_idx` ON `template_categories` (`template_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `templates_is_default_idx` ON `templates` (`is_default`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`budget_view` text DEFAULT 'grid' NOT NULL,
	`language` text,
	`dark_mode` integer,
	CONSTRAINT "user_settings_single_row" CHECK("user_settings"."id" = 1),
	CONSTRAINT "user_settings_budget_view_check" CHECK("user_settings"."budget_view" in ('grid', 'list'))
);
