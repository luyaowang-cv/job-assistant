import 'dotenv/config'

// 数据初始化已由 `pnpm auth:bootstrap` 完成（创建所有者账号并迁移旧 local user 数据）。
// 此 seed 保留为占位，避免 `prisma db seed` 重建已废弃的 local@job-assistant.local 用户。
async function main() {
  console.log('数据初始化请使用 `pnpm auth:bootstrap`。')
}

main()
  .catch(async (error: unknown) => {
    console.error(error)
    process.exit(1)
  })
