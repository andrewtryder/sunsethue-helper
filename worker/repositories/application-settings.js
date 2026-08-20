export async function getApplicationSettingsRow(env) {
  return env.DB.prepare("SELECT * FROM application_settings WHERE id = 1").first();
}

export async function upsertApplicationSettings(env, settings) {
  await env.DB.prepare(
    `INSERT INTO application_settings (
      id, scheduleTimezone, displayTimezoneMode, displayTimezone, scheduleTimes,
      weeklySelfTestEnabled, weeklySelfTestMode, weeklySelfTestDay, weeklySelfTestTime,
      scheduledReportsEnabled, scheduledReportTimes, scheduledReportChannels, updatedAt
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      scheduleTimezone = excluded.scheduleTimezone,
      displayTimezoneMode = excluded.displayTimezoneMode,
      displayTimezone = excluded.displayTimezone,
      scheduleTimes = excluded.scheduleTimes,
      weeklySelfTestEnabled = excluded.weeklySelfTestEnabled,
      weeklySelfTestMode = excluded.weeklySelfTestMode,
      weeklySelfTestDay = excluded.weeklySelfTestDay,
      weeklySelfTestTime = excluded.weeklySelfTestTime,
      scheduledReportsEnabled = excluded.scheduledReportsEnabled,
      scheduledReportTimes = excluded.scheduledReportTimes,
      scheduledReportChannels = excluded.scheduledReportChannels,
      updatedAt = excluded.updatedAt`
  ).bind(
    settings.scheduleTimezone,
    settings.displayTimezoneMode,
    settings.displayTimezone,
    typeof settings.scheduleTimes === "string"
      ? settings.scheduleTimes
      : JSON.stringify(settings.scheduleTimes),
    settings.weeklySelfTestEnabled ? 1 : 0,
    settings.weeklySelfTestMode,
    settings.weeklySelfTestDay,
    settings.weeklySelfTestTime,
    settings.scheduledReportsEnabled ? 1 : 0,
    typeof settings.scheduledReportTimes === "string"
      ? settings.scheduledReportTimes
      : JSON.stringify(settings.scheduledReportTimes || []),
    typeof settings.scheduledReportChannels === "string"
      ? settings.scheduledReportChannels
      : JSON.stringify(settings.scheduledReportChannels || []),
    settings.updatedAt
  ).run();
}
