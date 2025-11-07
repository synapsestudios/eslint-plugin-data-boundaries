import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';

export const organization = pgTable('organization', {
  id: uuid('id').primaryKey().defaultRandom(),
  identityOrganizationId: text('identity_organization_id').unique(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  settings: jsonb('settings'),
});
