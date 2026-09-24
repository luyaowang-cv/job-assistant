import { runScheduledFeishuSyncs } from '../services/job-library.service'
import { nextFeishuAutoSyncAt } from '../services/job-library-sync'

const schedulerState = globalThis as typeof globalThis & { __feishuAutoSyncTimer?: ReturnType<typeof setTimeout> }

function scheduleNextRun() {
  const nextRunAt = nextFeishuAutoSyncAt()
  const delay = Math.max(1_000, nextRunAt.getTime() - Date.now())
  schedulerState.__feishuAutoSyncTimer = setTimeout(async () => {
    try {
      // 必须带 onlyIfMissed。cluster 模式下每个 worker 都持有自己的定时器，
      // 到点会各触发一次。importFeishuJobs 里的 syncStartedAt 抢占锁能挡住
      // "同时触发"的情况，但挡不住"一个 worker 的定时器被事件循环延迟、等
      // 另一个跑完才触发"——那时锁已释放，会白跑一遍完整同步。
      // onlyIfMissed 会比对 lastAutomaticSyncAt，第二个 worker 直接跳过。
      await runScheduledFeishuSyncs({ onlyIfMissed: true })
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
