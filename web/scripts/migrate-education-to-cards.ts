import 'dotenv/config'

import { createHash } from 'node:crypto'

// 用相对路径而不是 #shared 别名：这个脚本用裸 tsx 跑，别名要靠 .nuxt/tsconfig 的 paths，
// 而 .nuxt 是 dev 或 build 时才生成的——一次性脚本不该依赖那个。
import { MATERIAL_TYPE_SPECS } from '../shared/material-types'

import { prisma } from '../server/lib/prisma'

/**
 * 一次性命令：把个人主档案里的教育背景搬成教育素材卡。
 *
 * 为什么要搬：素材库成为教育的唯一编辑入口之后，简历和网申都从教育卡取数；
 * 主档案里的 educations 只剩"还没迁移的人"的兜底。搬完卡片就在素材库里，可以挑着引用。
 *
 * 幂等：每张卡的 legacySourceKey 由「用户 + 来源字段 + 序号 + 原始内容」哈希得到，
 * 唯一约束是 [userId, legacySourceKey]，所以重复跑不会重复建卡。
 *
 * 跑法（在 web/ 下）：
 *   corepack pnpm tsx scripts/migrate-education-to-cards.ts --dry-run   # 先看会建哪些
 *   corepack pnpm tsx scripts/migrate-education-to-cards.ts             # 真的写库
 *
 * 建议先 `pg_dump` 备份。脚本不删除主档案里的原始数据，只是多建一份卡片。
 */

/** 教育卡允许的 facts 键，直接从注册表推，避免和注册表脱节。 */
const ALLOWED_KEYS = new Set(
  MATERIAL_TYPE_SPECS.EDUCATION.fields.flatMap(field => (field.kind === 'dateRange' ? [field.key, 'endDate'] : [field.key])),
)

type EducationRecord = Record<string, unknown>

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** 旧数据里学历可能存在 degree 上（schema 里那条注释写过），补一个回退。 */
function toFacts(entry: EducationRecord): Record<string, unknown> {
  const facts: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entry)) {
    if (key === 'school' || !ALLOWED_KEYS.has(key)) continue
    if (value === undefined || value === null || value === '') continue
    facts[key] = value
  }
  if (facts.educationLevel === undefined && text(entry.degree)) facts.educationLevel = text(entry.degree)
  return facts
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const profiles = await prisma.personalProfile.findMany({ select: { id: true, userId: true, educations: true } })
  if (!profiles.length) {
    console.log('没有找到个人主档案，无需迁移。')
    return
  }

  let created = 0
  let skipped = 0
  for (const profile of profiles) {
    const educations = Array.isArray(profile.educations) ? (profile.educations as EducationRecord[]) : []
    for (const [index, entry] of educations.entries()) {
      if (!entry || typeof entry !== 'object') continue
      const school = text(entry.school)
      const facts = toFacts(entry)
      // 学校和字段全空的条目不值得建卡
      if (!school && !Object.keys(facts).length) continue

      const legacySourceKey = createHash('sha256')
        .update(JSON.stringify({ userId: profile.userId, sourceField: 'educations', index, value: entry }))
        .digest('hex')

      const existing = await prisma.materialCard.findFirst({
        where: { userId: profile.userId, legacySourceKey },
        select: { id: true },
      })
      if (existing) {
        skipped += 1
        continue
      }

      console.log(`${dryRun ? '[dry-run] ' : ''}建卡：${school || `教育背景 ${index + 1}`} → ${JSON.stringify(facts)}`)
      if (dryRun) continue

      await prisma.materialCard.create({
        data: {
          userId: profile.userId,
          type: 'EDUCATION',
          title: school || `教育背景 ${index + 1}`,
          tags: ['legacy-import'],
          facts,
          legacySourceKey,
          variants: { create: { name: '默认', content: '' } },
        },
      })
      created += 1
    }
  }

  console.log(`\n${dryRun ? '预演结束' : '迁移完成'}：新建 ${created} 张，跳过 ${skipped} 张（已存在）。`)
  if (dryRun) console.log('去掉 --dry-run 再跑一次就会真的写库。')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
