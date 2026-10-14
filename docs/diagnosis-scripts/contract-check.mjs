/**
 * 诊断脚本 1/3：核对服务端 form-fill 接口契约。
 *
 * 用途：证明「contenteditable 富文本框会打出 400 并中止剩余批次」以及
 * 「模型多返回一个字段 / 值超 4000 字 → 整批作废且会被当成可重试」。
 *
 * 从 web/ 目录运行（zod 由 web/node_modules 解析；用仓库里已有的 tsx）：
 *   cd web
 *   npx tsx ../docs/diagnosis-scripts/contract-check.mjs
 *
 * 也可以用 Node 22.6+ 原生跑（不需要装东西）：
 *   cd web
 *   node --experimental-strip-types ../docs/diagnosis-scripts/contract-check.mjs
 */
import { formFillPreviewSchema, isAiFillEligibleField, modelFormFillResponseSchema } from '../../web/server/schemas/form-fill.ts'

const field = (over = {}) => ({
  id: 'form-field-1',
  label: '姓名',
  context: '',
  name: '',
  placeholder: '',
  inputType: 'text',
  controlType: 'input',
  options: [],
  multiple: false,
  ...over,
})

function probe(name, payload) {
  const result = formFillPreviewSchema.safeParse(payload)
  if (result.success) {
    console.log(`[OK]   ${name}`)
    return
  }
  const first = result.error.issues[0]
  console.log(`[FAIL] ${name}\n        400 VALIDATION_ERROR -> path=${JSON.stringify(first.path)} code=${first.code} msg=${first.message}`)
}

const base = { profileId: 'p1', fields: [field()] }

probe('contenteditable 描述框 (controlType="div"，扫描器实际发出的形状)', {
  ...base,
  fields: [field({ id: 'form-field-9', label: '', placeholder: '请输入自我评价', inputType: 'contenteditable', controlType: 'div' })],
})
probe('普通 input (controlType="input")', base)
probe('textarea', { ...base, fields: [field({ controlType: 'textarea' })] })
probe('select 选项文案超长 (>500 字符)', { ...base, fields: [field({ controlType: 'select', options: ['x'.repeat(501)] })] })
probe('多选 select (multiple=true)', { ...base, fields: [field({ controlType: 'select', multiple: true })] })

const long = modelFormFillResponseSchema.safeParse({ fills: [{ fieldId: 'f1', value: 'x'.repeat(4001) }], unresolvedIds: [] })
console.log(`[${long.success ? 'OK' : 'FAIL'}] 模型返回 value 长度 4001 -> ${long.success ? 'accepted' : 'AI_PROVIDER_INVALID_RESPONSE（整个批次作废，且会被重试两次）'}`)
const empty = modelFormFillResponseSchema.safeParse({ fills: [{ fieldId: 'f1', value: '' }], unresolvedIds: [] })
console.log(`[${empty.success ? 'OK' : 'FAIL'}] 模型返回空字符串 value -> ${empty.success ? 'accepted' : 'AI_PROVIDER_INVALID_RESPONSE（整个批次作废）'}`)
const extra = modelFormFillResponseSchema.safeParse({ fills: [], unresolvedIds: [], note: 'hi' })
console.log(`[${extra.success ? 'OK' : 'FAIL'}] 模型多返回一个 note 字段 -> ${extra.success ? 'accepted' : 'AI_PROVIDER_INVALID_RESPONSE（整个批次作废）'}`)

const eligible = [
  field({ id: 'a', label: '姓名拼音' }),
  field({ id: 'b', label: '附件上传' }),
  field({ id: 'c', label: '隐私协议' }),
  field({ id: 'd', label: '个人证件' }),
  field({ id: 'e', label: '自我介绍', inputType: 'textarea', controlType: 'textarea' }),
].filter((candidate) => {
  const parsed = formFillPreviewSchema.safeParse({ profileId: 'p1', fields: [candidate] })
  return parsed.success && isAiFillEligibleField(parsed.data.fields[0])
}).map(candidate => candidate.label)
console.log(`\n路由层放行给模型的白名单字段: ${eligible.join(', ')}`)
