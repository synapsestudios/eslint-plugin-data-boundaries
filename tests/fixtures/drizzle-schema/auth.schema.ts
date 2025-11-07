import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const identity_user = pgTable('identity_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const identity_session = pgTable('identity_session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  userId: text('user_id')
    .notNull()
    .references(() => identity_user.id, { onDelete: 'cascade' }),
});

export const identity_account = pgTable('identity_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => identity_user.id, { onDelete: 'cascade' }),
});
