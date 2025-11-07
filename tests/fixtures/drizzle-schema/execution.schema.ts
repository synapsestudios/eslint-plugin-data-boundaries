import { pgTable, text, timestamp, uuid, integer, jsonb, doublePrecision } from 'drizzle-orm/pg-core';

export const execution = pgTable('execution', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  organizationId: uuid('organization_id').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at').notNull(),
});

export const message = pgTable('message', {
  id: text('id').primaryKey(),
  executionId: text('execution_id')
    .notNull()
    .references(() => execution.id, { onDelete: 'cascade' }),
  direction: text('direction').notNull(),
  sequenceNumber: integer('sequence_number').notNull(),
  content: text('content').notNull(),
});

export const llmCall = pgTable('llm_call', {
  id: text('id').primaryKey(),
  executionId: text('execution_id')
    .notNull()
    .references(() => execution.id, { onDelete: 'cascade' }),
  sequenceNumber: integer('sequence_number').notNull(),
  requestMessages: jsonb('request_messages').notNull(),
  responseContent: text('response_content').notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
});
