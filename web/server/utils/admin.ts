// 判断邮箱是否在管理员列表（环境变量 ADMIN_EMAILS，逗号分隔）。
// 独立成文件，避免拖入 prisma 依赖，便于单测直接引用。
export function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
  return list.includes(email.toLowerCase())
}
