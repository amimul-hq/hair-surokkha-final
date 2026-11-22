import { pgTable, text, jsonb, integer } from 'drizzle-orm/pg-core';

export const websiteDocuments = pgTable('website_documents', {
  id: text('id').primaryKey(),
  data: jsonb('data').notNull(),
  revision: integer('revision').notNull().default(1),
});
