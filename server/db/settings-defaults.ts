// Sample owner settings (spec 5.1 plus the timing settings used by reminders,
// retention and the forecast). All values are samples; the owner changes them on O4.

export type SettingKey =
  | 'drop_days'
  | 'lead_time_days'
  | 'capacity'
  | 'hold_minutes'
  | 'request_expiry_days'
  | 'buffer_setting'
  | 'delivery_areas'
  | 'pickup_window'
  | 'confirmation_mode'
  | 'reminder_days_before_cutoff'
  | 'retention_months'
  | 'forecast_checkpoint_days'

export interface DeliveryArea {
  /** Stable id the customer picks on C3; orders store the name and fee. */
  id: string
  name: string
  feePesewas: number
}

export const settingsDefaults = {
  drop_days: ['tuesday', 'friday'],
  lead_time_days: 3,
  capacity: 70,
  hold_minutes: 10,
  request_expiry_days: 2,
  buffer_setting: 'balanced',
  delivery_areas: [
    { id: 'sample-area-a', name: 'Area A', feePesewas: 1000 },
    { id: 'sample-area-b', name: 'Area B', feePesewas: 1500 }
  ] satisfies DeliveryArea[],
  // Africa/Accra local time.
  pickup_window: { start: '12:00', end: '18:00' },
  confirmation_mode: 'on_payment',
  reminder_days_before_cutoff: 2,
  retention_months: 6,
  forecast_checkpoint_days: 3
} satisfies Record<SettingKey, unknown>
