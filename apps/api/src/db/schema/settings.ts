import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey(),
  setupCompletedAt: integer("setup_completed_at").notNull(),
});
