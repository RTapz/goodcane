// Empties every app table in the test database. Checks the name of the database the client
// is actually connected to, so it refuses to truncate anything that does not end in _test,
// even if a caller passes the wrong client.
import type postgres from 'postgres'

export async function resetTestDatabase(sql: postgres.Sql) {
  const [row] = await sql<{ name: string }[]>`select current_database() as "name"`
  const name = row?.name ?? ''
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to reset database "${name}": its name does not end in _test.`)
  }
  await sql`truncate table "order_history", "payments", "order_items", "reminders", "turned_away", "forecast_snapshots", "consent_events", "access_tokens", "orders", "customers", "menu_items", "drops" cascade`
}
