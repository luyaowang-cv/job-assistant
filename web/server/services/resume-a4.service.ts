import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserType } from 'playwright-core'
import { resumeLayoutConfigSchema, type CompositionInput } from '../schemas/document-composition'
import { prisma } from '../lib/prisma'
import { resolveResumeDraft, resolveResumeVersion } from './document-composition.service'
import { getLocalUser } from './local-user'

type Draft = NonNullable<Awaited<ReturnType<typeof resolveResumeDraft>>>
type Resolved = Draft['resolved']
type ResumeLayoutConfig = ReturnType<typeof resumeLayoutConfigSchema.parse>
const esc = (v: unknown) => String(v ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
const labels: Record<string, string> = { internship: '实习经历', work: '工作经历', project: '项目经历', campus: '校园经历', award: '荣誉奖项', research: '科研经历', certificate: '证书', skill: '专业技能', self_evaluation: '个人总结', custom_answer: '补充信息', materials: '相关经历' }
const copy = (v: string) => `<ul>${v.split(/\r?\n/).map(x => x.trim()).filter(Boolean).map((line) => {
  const value = line.replace(/^[-•*]\s*/, '')
  const matched = value.match(/^([^：:]{1,12}[：:])\s*(.*)$/)
  return matched ? `<li><b>${esc(matched[1])}</b> ${esc(matched[2])}</li>` : `<li>${esc(value)}</li>`
}).join('')}</ul>`

const period = (facts: unknown) => {
  const value = facts && typeof facts === 'object' ? facts as Record<string, unknown> : {}
  return [value.startDate, value.endDate].filter(Boolean).map(esc).join(' — ')
}
const materialMeta = (facts: unknown) => {
  const value = facts && typeof facts === 'object' ? facts as Record<string, unknown> : {}
  return [value.role, value.organization, period(value)].filter(Boolean).map(esc).join(' | ')
}
const stack = (facts: unknown) => {
  const value = facts && typeof facts === 'object' ? facts as Record<string, unknown> : {}
  return Array.isArray(value.techStack) ? value.techStack.filter(item => typeof item === 'string' && item).map(esc).join(' / ') : ''
}

const displayMonth = (value: unknown) => typeof value === 'string' ? value.replace(/^([0-9]{4})-([0-9]{2})$/, '$1/$2') : value

function educationSupplement(reference: Resolved['references'][number]) {
  const facts = (reference.facts && typeof reference.facts === 'object' ? reference.facts : {}) as Record<string, unknown>
  const label = reference.type === 'RESEARCH' ? (facts.role || '科研经历') : reference.type === 'AWARD' ? '核心荣誉' : reference.type === 'CERTIFICATE' ? '核心证书' : reference.title
  const lines = reference.content.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const items = (lines.length ? lines : [reference.title]).map((line, index) => {
    const value = line.replace(/^[-•*]\s*/, '')
    const lead = index === 0 && value !== reference.title ? `${esc(reference.title)}：${esc(value)}` : esc(value)
    return `<li>${index === 0 ? `<b>${esc(label)}：</b> ` : ''}${lead}</li>`
  }).join('')
  return items
}

const inlineEducationLabels: Partial<Record<Resolved['references'][number]['type'], string>> = {
  AWARD: '核心荣誉',
  CERTIFICATE: '核心证书',
}

function inlineEducationValue(reference: Resolved['references'][number]) {
  const title = reference.title.trim()
  const meaningfulTitle = /[\p{L}\p{N}]/u.test(title) ? title : ''
  const lines = reference.content.split(/\r?\n/)
    .map(line => line.trim().replace(/^[-•*]\s*/, '').replace(/^(?:核心荣誉|荣誉奖项|核心证书|证书)[：:]\s*/, ''))
    .filter(Boolean)
  if (!lines.length) return meaningfulTitle
  if (!meaningfulTitle || lines.some(line => line === meaningfulTitle || line.startsWith(`${meaningfulTitle}：`) || line.startsWith(`${meaningfulTitle}:`))) return lines.join('；')
  return `${meaningfulTitle}：${lines.join('；')}`
}

function educationSupplements(references: Resolved['references']) {
  const groupedTypes = new Set<string>()
  return references.map((reference) => {
    const label = inlineEducationLabels[reference.type]
    if (!label) return educationSupplement(reference)
    if (groupedTypes.has(reference.type)) return ''
    groupedTypes.add(reference.type)
    const values = references.filter(item => item.type === reference.type).map(inlineEducationValue).filter(Boolean)
    return values.length ? `<li class="education-inline"><b>${esc(label)}：</b> ${values.map(esc).join('；')}</li>` : ''
  }).filter(Boolean).join('')
}

function educationUnit(educations: Resolved['educations'], references: Resolved['references']) {
  const records = educations.map(value => (value && typeof value === 'object' ? value : {}) as Record<string, unknown>)
  const linked = new Map<number, typeof references>()
  for (const reference of references) {
    const facts = (reference.facts && typeof reference.facts === 'object' ? reference.facts : {}) as Record<string, unknown>
    const organization = typeof facts.organization === 'string' ? facts.organization.trim() : ''
    const matched = organization ? records.findIndex((record) => {
      const school = typeof record.school === 'string' ? record.school.trim() : ''
      return school && (organization.includes(school) || school.includes(organization))
    }) : -1
    const target = matched >= 0 ? matched : 0
    linked.set(target, [...(linked.get(target) ?? []), reference])
  }
  const entries = records.map((x, index) => {
    const credential = x.academicDegree || x.educationLevel || x.degree
    const gpa = x.gpa !== undefined && x.gpa !== null ? `GPA ${x.gpa}${x.gpaScale ? ` / ${x.gpaScale}` : ''}${x.ranking ? `（${x.ranking}）` : ''}` : null
    const summary = [x.major, credential, gpa].filter(Boolean).map(esc).join(' · ')
    const dates = [displayMonth(x.startDate), displayMonth(x.endDate)].filter(Boolean).map(esc).join(' - ')
    const supplements = educationSupplements(linked.get(index) ?? [])
    return `<section class="unit education${index ? ' education-continuation' : ''}">${index === 0 ? '<h2>教育背景</h2>' : ''}<article class="education-entry"><div class="education-line"><strong>${esc(x.school)}</strong><span class="education-summary">${summary}</span><span class="education-period">${dates}</span></div>${supplements ? `<ul class="education-supplements">${supplements}</ul>` : ''}</article></section>`
  }).join('')
  const unmatched = records.length ? '' : references.map(educationSupplement).join('')
  if (!entries && !unmatched) return ''
  return entries || `<section class="unit education"><h2>教育背景</h2><article class="education-entry"><ul class="education-supplements">${unmatched}</ul></article></section>`
}

function units(resolved: Resolved) {
  const out: string[] = []
  const educationReferences = resolved.references.filter(reference => reference.section === 'education')
  const groups = new Map<string, typeof resolved.references>()
  for (const ref of resolved.references.filter(reference => reference.section !== 'education')) groups.set(ref.section, [...(groups.get(ref.section) ?? []), ref])
  let educationRendered = false
  for (const reference of resolved.references) {
    if (reference.section !== 'education' || educationRendered) continue
    const before = [...groups].filter(([, refs]) => refs[0] && refs[0].sortOrder < reference.sortOrder)
    for (const [section, refs] of before) {
      groups.delete(section)
      out.push(...refs.map((ref, index) => renderReferenceUnit(section, ref, index)))
    }
    const education = educationUnit(resolved.educations, educationReferences)
    if (education) out.push(education)
    educationRendered = true
  }
  if (!educationRendered) {
    const education = educationUnit(resolved.educations, educationReferences)
    if (education) out.push(education)
  }
  for (const [section, refs] of groups) out.push(...refs.map((ref, index) => renderReferenceUnit(section, ref, index)))
  if (resolved.legacyContent) out.push(`<section class="unit"><h2>简历内容</h2>${copy(resolved.legacyContent)}</section>`)
  return out.join('')
}

function renderReferenceUnit(section: string, ref: Resolved['references'][number], index: number) {
    const techStack = stack(ref.facts)
    const title = ref.title.trim()
    const meta = materialMeta(ref.facts)
    const line = title || meta ? `<div class="line">${title ? `<strong>${esc(title)}</strong>` : ''}${meta ? `<span>${meta}</span>` : ''}</div>` : ''
    return `<section class="unit">${index === 0 ? `<h2>${esc(labels[section] ?? section)}</h2>` : ''}<article class="material-entry">${line}${techStack ? `<p class="stack"><b>技术栈：</b>${techStack}</p>` : ''}<div class="copy">${copy(ref.content)}</div></article></section>`
}

const style = `*{box-sizing:border-box}html,body{margin:0;background:#e9edf3;color:#172033;font-family:"Microsoft YaHei","PingFang SC",Arial,sans-serif;-webkit-print-color-adjust:exact}.book{padding:24px 0}.page{position:relative;width:210mm;height:297mm;margin:0 auto 20px;background:#fff;box-shadow:0 14px 42px #1b294229;overflow:hidden}.inner{height:100%;padding:12mm;overflow:hidden}.header{min-height:29mm;display:grid;grid-template-columns:24mm minmax(0,1fr) 24mm;gap:5mm;align-items:center;padding-bottom:4mm;margin-bottom:3.6mm}.identity{grid-column:2;text-align:center}.header h1{margin:0 0 2.2mm;font-family:Georgia,"Songti SC",serif;font-size:23pt;letter-spacing:.8mm}.contact{display:flex;justify-content:center;flex-wrap:wrap;gap:1.6mm 4mm;font-size:9.3pt;color:#344157}.detail{margin-top:1.6mm;font-size:8.7pt;color:#697386}.photo{grid-column:3;width:24mm;height:32mm;object-fit:cover;border:1px solid #d7deea;background:#f3f5f8}.empty{display:grid;place-items:center;color:#9aa4b4;font-size:8pt}.unit{margin:0 0 3.1mm;break-inside:auto}.unit.education{padding-top:0}.unit.education:not(.education-continuation){border-top:1.2px solid #2458b8;padding-top:2.2mm}.unit.education-continuation{margin-top:-1.2mm}.unit h2{display:flex;align-items:center;gap:2mm;margin:0 0 1.7mm;font-size:11.6pt;color:#183765}.unit h2:after{content:"";height:1px;flex:1;background:#bfcce0}.unit article{margin:0 0 2mm;break-inside:auto}.unit.continued{margin-top:0}.unit.continued .material-entry{padding-top:0}.education-entry:last-child{margin-bottom:0}.education-line{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1.45fr) auto;align-items:baseline;gap:4mm}.education-line strong{font-size:9.8pt}.education-summary{font-size:9pt;color:#26354b}.education-period{font-size:8.5pt;color:#28364a;white-space:nowrap}.education-supplements{display:grid;gap:.45mm;margin:1.1mm 0 0;padding-left:5mm;font-size:8.5pt;line-height:1.42}.education-supplements li{break-inside:avoid}.line{display:flex;justify-content:space-between;gap:6mm}.line strong{font-size:9.7pt}.line span{font-size:8pt;color:#7a8493;white-space:nowrap}.unit p{margin:.6mm 0;font-size:8.5pt;color:#596579}.copy{font-size:8.65pt;line-height:1.48}.copy ul{margin:.7mm 0;padding-left:4mm;display:grid;gap:.45mm}.copy li{break-inside:avoid}.number{position:absolute;right:12mm;bottom:5.5mm;color:#9aa4b4;font:7.5pt Georgia}@page{size:A4;margin:0}@media print{html,body{background:#fff}.book{padding:0}.page{margin:0;box-shadow:none;break-after:page}}`
const cardStyle = `.material-entry{padding:2.2mm 0 2.4mm;background:transparent}.material-entry .line strong{color:#15386d;font-size:10pt}.material-entry .line span{color:#37465b;font-weight:600}.material-entry .stack{margin:1mm 0 .5mm;color:#40506a}.material-entry .stack b,.material-entry .copy b{color:#16243a}.material-entry .copy ul{margin-top:1mm}`
const layoutStyle = (layout: ResumeLayoutConfig) => `.inner{padding:${layout.verticalMarginMm}mm 12mm}.unit{margin-bottom:${layout.sectionGapMm}mm}.copy ul{gap:${layout.paragraphGapMm}mm}`

const pagination = `(async()=>{
  await document.fonts.ready;
  const book=document.getElementById('book');
  let page=book.querySelector('.page');
  let content=page.querySelector('[data-content]');
  const units=[...content.children];
  content.innerHTML='';
  let overflow=false;
  const isOverflowing=()=>{const inner=page.querySelector('.inner');return inner.scrollHeight>inner.clientHeight+1};
  const addPage=()=>{
    if(book.children.length>=3){overflow=true;return false}
    const number=book.children.length+1;
    const next=document.createElement('section');
    next.className='page';
    next.innerHTML='<div class="inner"><div data-content></div></div><span class="number">'+number+'</span>';
    book.appendChild(next);
    page=next;
    content=page.querySelector('[data-content]');
    return true;
  };
  const appendWhole=(unit)=>{
    content.appendChild(unit);
    if(!isOverflowing())return true;
    content.removeChild(unit);
    if(!addPage()){content.appendChild(unit);return false}
    content.appendChild(unit);
    if(isOverflowing())overflow=true;
    return !overflow;
  };
  const makePart=(unit,continued)=>{
    const part=unit.cloneNode(true);
    const list=part.querySelector('.copy ul, .education-supplements');
    list.innerHTML='';
    if(continued){
      part.classList.add('continued');
      part.querySelector('h2')?.remove();
      const title=part.querySelector('.line strong, .education-line strong');
      if(title)title.textContent=title.textContent+'（续）';
    }
    return {unit:part,list};
  };
  const appendSplit=(unit)=>{
    const sourceList=unit.querySelector('.material-entry .copy ul, .education-entry .education-supplements');
    if(!sourceList||sourceList.children.length<2)return appendWhole(unit);
    const items=[...sourceList.children].map(item=>item.cloneNode(true));
    let part=makePart(unit,false);
    content.appendChild(part.unit);
    if(isOverflowing()){
      content.removeChild(part.unit);
      if(!addPage()){content.appendChild(part.unit);return false}
      content.appendChild(part.unit);
    }
    for(const item of items){
      part.list.appendChild(item);
      if(!isOverflowing())continue;
      part.list.removeChild(item);
      if(part.list.children.length===0){
        content.removeChild(part.unit);
        if(!addPage()){content.appendChild(part.unit);part.list.appendChild(item);return false}
        content.appendChild(part.unit);
        part.list.appendChild(item);
      }else{
        if(!addPage()){part.list.appendChild(item);return false}
        part=makePart(unit,true);
        content.appendChild(part.unit);
        part.list.appendChild(item);
      }
      if(isOverflowing()){overflow=true;return false}
    }
    return true;
  };
  for(const unit of units){
    content.appendChild(unit);
    if(!isOverflowing())continue;
    content.removeChild(unit);
    if(!appendSplit(unit))break;
  }
  window.__resumeLayout={ready:true,pageCount:book.children.length,overflow};
  window.parent?.postMessage({type:'resume-layout',pageCount:book.children.length,overflow},'*');
})();`

function resolveLayout(value: unknown) {
  const parsed = resumeLayoutConfigSchema.safeParse(value)
  return parsed.success ? parsed.data : resumeLayoutConfigSchema.parse({})
}

export function buildA4ResumeHtml(input: { title: string, resolved: Resolved, photoDataUrl?: string | null, layout?: unknown }) {
  const b = input.resolved.basics as Record<string, unknown>
  const name = esc(b.fullName || input.title)
  const city = Array.isArray(b.targetCities) ? b.targetCities.join(' / ') : b.city
  const contact = [b.phone, b.email, city].filter(Boolean).map(esc).join(' · ')
  const detail = [b.gender, b.birthDate, b.politicalStatus].filter(Boolean).map(esc).join(' · ')
  const photo = input.photoDataUrl ? `<img class="photo" src="${input.photoDataUrl}" alt="证件照">` : '<div class="photo empty">证件照</div>'
  const page = `<section class="page"><div class="inner"><header class="header"><div class="identity"><h1>${name}</h1><div class="contact">${contact}</div><div class="detail">${detail}</div></div>${photo}</header><div data-content>${units(input.resolved)}</div></div><span class="number">1</span></section>`
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${style}${cardStyle}${layoutStyle(resolveLayout(input.layout))}</style></head><body><main id="book" class="book">${page}</main><script>${pagination}</script></body></html>`
}

function photoUrl(profile: { photoMimeType?: string | null, photoData?: Uint8Array | null } | null) {
  return profile?.photoMimeType && profile.photoData ? `data:${profile.photoMimeType};base64,${Buffer.from(profile.photoData).toString('base64')}` : null
}

export async function previewA4Resume(resumeId: string, composition: CompositionInput) {
  const draft = await resolveResumeDraft(resumeId, composition)
  return draft ? { html: buildA4ResumeHtml({ title: draft.resume.name, resolved: draft.resolved, photoDataUrl: photoUrl(draft.profile), layout: composition.config.layout }), templateId: 'A4_DENSE_V1', maxPages: 3 } : null
}

function browserPath() {
  const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter((value): value is string => Boolean(value))
  const standard = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  return [process.env.RESUME_CHROMIUM_PATH, ...standard, ...roots.flatMap(root => [join(root, 'Google/Chrome/Application/chrome.exe'), join(root, 'Microsoft/Edge/Application/msedge.exe')])].filter((value): value is string => Boolean(value)).find(existsSync) ?? null
}

export class ResumePdfError extends Error {
  constructor(message: string, readonly code: string, readonly statusCode: number) { super(message) }
}

export async function exportResumePdf(resumeId: string, versionId: string) {
  const result = await resolveResumeVersion(resumeId, versionId)
  if (!result) return null
  const user = await getLocalUser()
  const profile = await prisma.personalProfile.findUnique({ where: { userId: user.id } })
  const executablePath = browserPath()
  if (!executablePath) throw new ResumePdfError('未找到 Chrome 或 Edge；可设置 RESUME_CHROMIUM_PATH。', 'PDF_BROWSER_NOT_FOUND', 503)
  const config = result.version.composition?.config as { layout?: unknown } | null | undefined
  const html = buildA4ResumeHtml({ title: '简历', resolved: result.resolved, photoDataUrl: photoUrl(profile), layout: config?.layout })
  const playwrightModule = 'playwright-core'
  const { chromium } = await import(/* @vite-ignore */ playwrightModule) as { chromium: BrowserType }
  const browser = await chromium.launch({ executablePath, headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1120, height: 1580 } })
    await page.setContent(html, { waitUntil: 'load' })
    await page.waitForFunction(() => Boolean((window as unknown as { __resumeLayout?: { ready: boolean } }).__resumeLayout?.ready))
    const layout = await page.evaluate(() => (window as unknown as { __resumeLayout: { pageCount: number, overflow: boolean } }).__resumeLayout)
    if (layout.overflow) throw new ResumePdfError('简历超过三页或单张卡片过长，请精简后再导出。', 'RESUME_LAYOUT_OVERFLOW', 422)
    const pdf = await page.pdf({ format: 'A4', margin: { top: '0', right: '0', bottom: '0', left: '0' }, printBackground: true, preferCSSPageSize: true })
    return { pdf, pageCount: layout.pageCount }
  } finally { await browser.close() }
}
