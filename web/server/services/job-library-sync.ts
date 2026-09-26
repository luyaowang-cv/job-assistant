export type JobLibrarySyncMode = 'FULL' | 'INCREMENTAL'

export const FEISHU_AUTO_SYNC_TIME_ZONE = 'Asia/Shanghai'
export const FEISHU_AUTO_SYNC_TIME = '08:00'

// Feishu records/search rejects filters on the built-in last_modified_time field
// (error 1254018 InvalidFilter), so every sync reads the full table.
export function buildBitableRecordSearchBody() {
  return { automatic_fields: true }
}

export function shouldReconcileOffline(mode: JobLibrarySyncMode) {
  return mode === 'FULL'
}

export function isFeishuAutoSyncEnabled() {
  return process.env.FEISHU_AUTO_SYNC_ENABLED?.trim().toLowerCase() !== 'false'
}

function scheduledSyncAtForChinaDate(now: Date) {
  const chinaWallClock = new Date(now.getTime() + 8 * 60 * 60_000)
  return new Date(Date.UTC(chinaWallClock.getUTCFullYear(), chinaWallClock.getUTCMonth(), chinaWallClock.getUTCDate(), 0, 0, 0, 0))
}

export function nextFeishuAutoSyncAt(now = new Date()) {
  const todayAtEight = scheduledSyncAtForChinaDate(now)
  return todayAtEight.getTime() > now.getTime()
    ? todayAtEight
    : new Date(todayAtEight.getTime() + 24 * 60 * 60_000)
}

export function shouldRunMissedFeishuAutoSync(now: Date, lastAutomaticSyncAt: Date | null) {
  const todayAtEight = scheduledSyncAtForChinaDate(now)
  return now.getTime() >= todayAtEight.getTime() && (!lastAutomaticSyncAt || lastAutomaticSyncAt.getTime() < todayAtEight.getTime())
}
