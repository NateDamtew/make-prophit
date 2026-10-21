import { sql } from 'drizzle-orm'
import { char, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const RECONCILIATION_STATUSES = ['ok', 'warn', 'fail', 'skipped'] as const
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number]

export const reconciliation_runs = pgTable(
  'reconciliation_runs',
  {
    id: char({ length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    /** Groups all checks of one run. */
    run_id: char({ length: 26 }).notNull(),
    ran_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    check_name: text().notNull(),
    currency: char({ length: 3 }),
    status: text().notNull().$type<ReconciliationStatus>(),
    expected: text(),
    actual: text(),
    delta: text(),
    details: jsonb().$type<Record<string, unknown>>(),
    acknowledged_by: char({ length: 26 }),
    acknowledged_at: timestamp({ withTimezone: true }),
    note: text(),
  },
  (table) => ({
    ranAtIdx: index('idx_reconciliation_runs_ran_at').on(table.ran_at),
    runIdx: index('idx_reconciliation_runs_run').on(table.run_id),
    statusIdx: index('idx_reconciliation_runs_status').on(table.status, table.ran_at),
  }),
)
