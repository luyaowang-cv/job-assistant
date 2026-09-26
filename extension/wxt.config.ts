import { defineConfig } from 'wxt'

const WORKBENCH_ORIGIN = 'https://offerscoming.cn'

/**
 * Applicant-tracking vendors whose forms get embedded in a company's career
 * page. `activeTab` only covers the top frame's origin, so a form served from
 * one of these hosts inside an iframe is unreachable without a standing host
 * permission and the fill silently finds nothing.
 *
 * The list is deliberately vendors rather than `<all_urls>`: those embeds always
 * come from the vendor's own host, so this covers the case without asking for
 * every site. Add a host here when a new vendor shows up.
 */
const ATS_FORM_HOSTS = [
  'italent.cn', // 北森 iTalentX
  'beisen.com',
  'zhiye.com',
  'mokahr.com', // Moka
  'moka.com',
  'dayee.com', // 大易
  'wintalent.cn',
  'hotjob.cn',
  'jobs.feishu.cn', // 飞书招聘
  'nowcoder.com', // 牛客
  'zhaopin.com', // 智联招聘
  '51job.com', // 前程无忧
  'myworkdayjobs.com', // Workday
  'workday.com',
  'greenhouse.io', // Greenhouse
  'lever.co', // Lever
  'ashbyhq.com', // Ashby
  'oraclecloud.com', // Oracle Recruiting Cloud
  'successfactors.com', // SAP SuccessFactors
  'sapsf.com',
]

// A leading `*.` is documented as matching subdomains and does not state that it
// also matches the bare host, so each vendor lists both forms. Getting this
// wrong would drop an origin silently.
const atsHostPermissions = ATS_FORM_HOSTS.flatMap(host => [`https://*.${host}/*`, `https://${host}/*`])

export default defineConfig({
  manifest: {
    name: '求职助手',
    description: '连接本地求职工作台，保存岗位、生成话术并使用网申档案智能填写。',
    // `storage` keeps the open-question thread alive: the popup closes whenever
    // the user goes back to the page it was covering.
    permissions: ['activeTab', 'scripting', 'clipboardWrite', 'storage'],
    host_permissions: [`${WORKBENCH_ORIGIN}/*`, ...atsHostPermissions],
  },
})
