-- Per-user visual theme; existing users keep the woodland look.
ALTER TABLE "User" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'woodland';
