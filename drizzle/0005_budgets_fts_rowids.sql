CREATE INDEX `budgets_created_idx` ON `budgets` (`created_at`);
--> statement-breakpoint
-- The search index's triggers find a budget's `budgets_fts` row by rowid, looked
-- up in `budgets_fts_rowids`, instead of scanning `budgets_fts` for its
-- `budget_id` (FTS5 can't index it), which made bulk deletes quadratic.
-- `fts_rowid` is an INTEGER PRIMARY KEY, so unlike `budgets`' implicit rowid it
-- survives VACUUM. Both tables are rebuilt from `budgets`.
DROP TRIGGER IF EXISTS `budgets_fts_after_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `budgets_fts_after_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `budgets_fts_after_update`;
--> statement-breakpoint
DROP TABLE IF EXISTS `budgets_fts`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `budgets_fts` USING fts5(
	`budget_id` UNINDEXED,
	`title`,
	tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TABLE `budgets_fts_rowids` (
	`fts_rowid` integer PRIMARY KEY,
	`budget_id` text NOT NULL UNIQUE
);
--> statement-breakpoint
INSERT INTO `budgets_fts_rowids` (`budget_id`) SELECT `id` FROM `budgets` ORDER BY `created_at`, `id`;
--> statement-breakpoint
INSERT INTO `budgets_fts` (`rowid`, `budget_id`, `title`)
	SELECT `budgets_fts_rowids`.`fts_rowid`, `budgets`.`id`, `budgets`.`title`
	FROM `budgets` JOIN `budgets_fts_rowids` ON `budgets_fts_rowids`.`budget_id` = `budgets`.`id`;
--> statement-breakpoint
CREATE TRIGGER `budgets_fts_after_insert` AFTER INSERT ON `budgets` BEGIN
	INSERT INTO `budgets_fts_rowids` (`budget_id`) VALUES (new.`id`);
	INSERT INTO `budgets_fts` (`rowid`, `budget_id`, `title`) VALUES (
		(SELECT `fts_rowid` FROM `budgets_fts_rowids` WHERE `budget_id` = new.`id`),
		new.`id`,
		new.`title`
	);
END;
--> statement-breakpoint
CREATE TRIGGER `budgets_fts_after_delete` AFTER DELETE ON `budgets` BEGIN
	DELETE FROM `budgets_fts`
		WHERE `rowid` = (SELECT `fts_rowid` FROM `budgets_fts_rowids` WHERE `budget_id` = old.`id`);
	DELETE FROM `budgets_fts_rowids` WHERE `budget_id` = old.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `budgets_fts_after_update` AFTER UPDATE OF `id`, `title` ON `budgets` BEGIN
	UPDATE `budgets_fts` SET `budget_id` = new.`id`, `title` = new.`title`
		WHERE `rowid` = (SELECT `fts_rowid` FROM `budgets_fts_rowids` WHERE `budget_id` = old.`id`);
	UPDATE `budgets_fts_rowids` SET `budget_id` = new.`id` WHERE `budget_id` = old.`id`;
END;
