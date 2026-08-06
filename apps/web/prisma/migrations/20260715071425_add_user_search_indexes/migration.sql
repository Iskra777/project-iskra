-- Швидкий substring-пошук за username/display_name (case-insensitive).
-- Prisma-схема не має чистого способу оголосити GIN trigram-індекс без
-- preview-фіч, тож ця міграція написана вручну.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX users_username_trgm_idx ON users USING gin (username gin_trgm_ops);
CREATE INDEX users_display_name_trgm_idx ON users USING gin (display_name gin_trgm_ops);
