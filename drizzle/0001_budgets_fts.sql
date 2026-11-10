-- Full-text search over budget titles.
--
-- A standalone FTS5 table keyed by the budget's UUID rather than an
-- external-content table keyed by rowid: `budgets` has a text primary key, so
-- its implicit rowid may change on VACUUM and would desync the index.
-- `unicode61 remove_diacritics 2` case-folds Latin and Cyrillic and ignores
-- accents. Query with prefix terms (`"groc"*`); see `src/main/db/search.ts`.
CREATE VIRTUAL TABLE `budgets_fts` USING fts5(
	`budget_id` UNINDEXED,
	`title`,
	tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
INSERT INTO `budgets_fts` (`budget_id`, `title`) SELECT `id`, `title` FROM `budgets`;
--> statement-breakpoint
CREATE TRIGGER `budgets_fts_after_insert` AFTER INSERT ON `budgets` BEGIN
	INSERT INTO `budgets_fts` (`budget_id`, `title`) VALUES (new.`id`, new.`title`);
END;
--> statement-breakpoint
CREATE TRIGGER `budgets_fts_after_delete` AFTER DELETE ON `budgets` BEGIN
	DELETE FROM `budgets_fts` WHERE `budget_id` = old.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `budgets_fts_after_update` AFTER UPDATE OF `id`, `title` ON `budgets` BEGIN
	UPDATE `budgets_fts` SET `budget_id` = new.`id`, `title` = new.`title` WHERE `budget_id` = old.`id`;
END;
