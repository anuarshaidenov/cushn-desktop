-- Installs from before onboarding count as onboarded. Migrations run before seeding, so a new database has no `seeded_at` here.
INSERT INTO `app_meta` (`key`, `value`) SELECT 'onboarded_at', `value` FROM `app_meta` WHERE `key` = 'seeded_at' ON CONFLICT DO NOTHING;
