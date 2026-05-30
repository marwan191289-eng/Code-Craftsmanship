import { pgTable, text, serial, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  mode: text("mode").notNull(),
  m3uUrl: text("m3u_url"),
  m3uContent: text("m3u_content"),
  epgUrl: text("epg_url"),
  serverUrl: text("server_url"),
  username: text("username"),
  password: text("password"),
  favorites: jsonb("favorites").$type<string[]>().default([]),
  continueWatching: jsonb("continue_watching").$type<Record<string, { time: number; duration: number }>>().default({}),
});

export const insertProfileSchema = createInsertSchema(profiles).omit({ id: true });

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;
