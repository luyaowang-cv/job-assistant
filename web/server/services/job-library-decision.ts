// 岗位库里「我对这个岗位怎么想」的纯逻辑。
// 独立成文件、不 import prisma，方便单测直接引用（同 job-library-sync.ts 的做法）。

// 从岗位库直接建投递记录时的默认值。
// 渠道固定 OTHER：岗位库里没有渠道信息，之后可以在看板详情里改。
// 只有「已投递」才补投递日期（默认当天）；「收藏」还没投出去，日期留空。
export function buildApplicationFromJobSeed(status: 'SAVED' | 'APPLIED', now: Date = new Date()) {
  return {
    channel: 'OTHER' as const,
    appliedAt: status === 'APPLIED' ? now : null,
  }
}
