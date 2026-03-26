import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const casesTable = pgTable("cases", {
  id: serial("id").primaryKey(),
  clientName: text("client_name").notNull(),
  caseType: text("case_type").notNull(),
  workingCapitalData: jsonb("working_capital_data"),
  bankingData: jsonb("banking_data"),
  multiYearData: jsonb("multi_year_data"),
  gstItrData: jsonb("gst_itr_data"),
  workingCapitalResults: jsonb("working_capital_results"),
  bankingResults: jsonb("banking_results"),
  multiYearResults: jsonb("multi_year_results"),
  gstItrResults: jsonb("gst_itr_results"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCaseSchema = createInsertSchema(casesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof casesTable.$inferSelect;
