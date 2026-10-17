// Empties every app table in the test database. Only ever call it with a client from
// testDatabaseUrl(), which refuses any database whose name does not end in _test.
import type postgres from 'postgres'

export async function resetTestDatabase(sql: postgres.Sql) {
  await sql`truncate table "order_history", "payments", "order_items", "reminders", "turned_away", "forecast_snapshots", "consent_events", "access_tokens", "orders", "customers", "menu_items", "drops" cascade`
}
