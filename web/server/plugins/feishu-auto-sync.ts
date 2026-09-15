import { runScheduledFeishuSyncs } from '../services/job-library.service'
import { nextFeishuAutoSyncAt } from '../services/job-library-sync'

const schedulerState = globalThis as typeof globalThis & { __feishuAutoSyncTimer?: ReturnType<typeof setTimeout> }

function scheduleNextRun() {
  const nextRunAt = nextFeishuAutoSyncAt()
  const delay = Math.max(1_000, nextRunAt.getTime() - Date.now())
  schedulerState.__feishuAutoSyncTimer = setTimeout(async () => {
    try {
      await runScheduledFeishuSyncs()
    }
    catch (error) {
      console.warn('[feishu-auto-sync] scheduled run failed to start', error)
    }
    finally {
      scheduleNextRun()
    }
  }, delay)
}

export default defineNitroPlugin(() => {
  if (schedulerState.__feishuAutoSyncTimer) return
  void runScheduledFeishuSyncs({ onlyIfMissed: true }).catch(error => console.warn('[feishu-auto-sync] missed-run check failed', error))
  scheduleNextRun()
})
