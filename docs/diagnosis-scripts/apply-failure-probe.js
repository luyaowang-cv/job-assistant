/**
 * 「AI 已给出建议，但页面控件未能应用」的定案脚本（交银亲属信息表那次）
 *
 * 用法：在出问题的网申页 F12 → Console。
 *   STEP 1  → 点「AI 填写」之前执行
 *   STEP 2  → 填写跑完之后执行
 *   STEP 3  → 任何时候执行（核对「是/否」单选组的真实提问 + 找远程搜索型下拉）
 *
 * 三个 STEP 可以一起粘，但 STEP 2 必须在一次填写之后才有意义。
 */

// ============================== STEP 1（填写前） ==============================
// 给当前所有控件打上位次标记。插件内部用的就是"控件在查询结果里的位次"当 id，
// 标记之后就能看出写回时到底落在哪个控件上。
;(() => {
  const SEL = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'
  const all = [...document.querySelectorAll(SEL)]
  all.forEach((el, i) => el.setAttribute('data-aifill-probe', String(i)))
  window.__aifillProbeCount = all.length
  console.log(`已给 ${all.length} 个控件打上位次标记。现在去跑「AI 填写」，跑完再粘 STEP 2。`)
})()

// ============================== STEP 2（填写后） ==============================
// 核对两件事：① 控件总数变没变（变了 = 位次 id 错位，这是头号嫌疑）
//            ② 插件标了绿/红/没标的控件，跟报告上的结论对不对得上
;(() => {
  const SEL = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'
  const now = [...document.querySelectorAll(SEL)]
  const before = window.__aifillProbeCount
  console.log(`填写前 ${before ?? '(没跑 STEP 1)'} 个控件，现在 ${now.length} 个`)
  if (before && now.length !== before) {
    console.warn(`控件数量变了（${before} → ${now.length}）→ 插件的位次 id 一定错位了，「未能应用」基本可以定案在这一条。`)
  }
  const rows = now.map((el, i) => ({
    当时位次: el.getAttribute('data-aifill-probe') ?? '(填写过程中新出现的)',
    现在位次: i,
    值: String(el.value ?? el.textContent ?? '').replace(/\s+/g, ' ').slice(0, 24),
    背景色: getComputedStyle(el).backgroundColor, // #dcfce7=插件认为成功  #fee2e2=插件认为失败
    name: el.name || '',
    placeholder: el.getAttribute?.('placeholder') || '',
  }))
  const interesting = rows.filter(r => r.值 || r.背景色 !== 'rgba(0, 0, 0, 0)')
  console.log(`有值或被插件标色过的控件 ${interesting.length} 个：`)
  console.table(interesting)
  copy(rows)
  return rows
})()

// ============================== STEP 3（随时） ==============================
// 3a：每个"是/否"单选组的真实提问是什么？插件给这组的标签是哪个选项的文字？
//     —— 用来判断报告里那 5 个「已填写｜是」是不是答错了。
// 3b：哪些下拉是"必须输入关键字才会出选项"的远程搜索型？
//     —— 用来判断「未能应用」是不是卡在"点开了但一个选项都没有"。
;(() => {
  const boxOf = el => el.closest('.el-form-item, .ant-form-item, .form-item, .form-group, .ud-formily-item, tr, fieldset, [role="group"]')
    || el.parentElement?.parentElement
  const optionText = el => String(el.closest('label')?.textContent ?? el.getAttribute('aria-label') ?? '').trim()

  const byName = new Map()
  ;[...document.querySelectorAll('input[type=radio]')].forEach((radio) => {
    const key = radio.name || '(无 name)'
    byName.set(key, [...(byName.get(key) ?? []), radio])
  })
  console.log('—— 3a. 单选组：真实提问 vs 插件会拿来当字段名的东西 ——')
  console.table([...byName].map(([name, group]) => {
    const first = group[0]
    const box = boxOf(first)
    const boxText = String(box?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const firstOption = optionText(first)
    return {
      name,
      真实提问: boxText.replace(firstOption, '').trim().slice(0, 50),
      插件用的标签: firstOption || '(空 → 未命名字段)',
      选项: group.map(optionText).filter(Boolean).join(' / '),
      已选中: group.find(r => r.checked)?.closest('label') ? '有' : '无',
    }
  }))

  console.log('—— 3b. 疑似"要输入关键字才出选项"的下拉 ——')
  const wrappers = [...document.querySelectorAll('.ud__select, .el-select, .ant-select, .arco-select, .semi-select, [role="combobox"]')]
  console.table(wrappers.map((container) => ({
    容器: String(container.className).slice(0, 40),
    当前显示: container.textContent.replace(/\s+/g, ' ').trim().slice(0, 24),
    内含input: container.querySelectorAll('input').length,
    页面上现有选项数: container.querySelectorAll('.ud__select-option, .ud__select-dropdown-option, .ud__select-option-item, .el-select-dropdown__item, .ant-select-item-option, .arco-select-option, .semi-select-option, [role="option"]').length,
    在iframe里: (() => { try { return window.top !== window.self } catch { return '(跨域，读不到)' } })(),
  })))
  console.log('「页面上现有选项数」是 0 的，就是插件点开后找不到选项、只能报「未能应用」的那一类。')
})()
