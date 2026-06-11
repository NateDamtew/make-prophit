import { sql } from 'drizzle-orm'
import { char, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from '@/lib/db/schema/auth/tables'

/**
 * Admin dashboard audit trail. Written by `recordAuditEvent` on every mutating
 * admin action. Kept in its own additive schema file (and imported directly by
 * queries rather than through the shared schema index) so upstream merges never
 * touch it.
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    actor_user_id: text().references(() => users.id, { onDelete: 'set null' }),
    actor_label: text().notNull(),
    action: text().notNull(),
    target_type: text(),
    target_id: text(),
    summary: text(),
    diff: jsonb().$type<Record<string, unknown>>(),
    created_at: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    index('admin_audit_log_created_at_idx').on(table.created_at.desc()),
    index('admin_audit_log_target_idx').on(table.target_type, table.target_id),
  ],
)

export type AdminAuditLogRow = typeof adminAuditLog.$inferSelect
export type AdminAuditLogInsert = typeof adminAuditLog.$inferInsert
