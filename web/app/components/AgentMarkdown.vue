<script setup lang="ts">
type InlinePart = { kind: 'text' | 'strong' | 'code'; text: string }
type Block = { type: 'heading' | 'paragraph' | 'quote' | 'code' | 'unordered' | 'ordered'; level?: number; text?: string; items?: string[] }

const props = defineProps<{ content: string }>()

function inlineParts(value: string): InlinePart[] {
  const parts: InlinePart[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let cursor = 0
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) parts.push({ kind: 'text', text: value.slice(cursor, index) })
    const token = match[0]
    parts.push(token.startsWith('**') ? { kind: 'strong', text: token.slice(2, -2) } : { kind: 'code', text: token.slice(1, -1) })
    cursor = index + token.length
  }
  if (cursor < value.length) parts.push({ kind: 'text', text: value.slice(cursor) })
  return parts.length ? parts : [{ kind: 'text', text: value }]
}

const blocks = computed<Block[]>(() => {
  const lines = props.content.replace(/\r/g, '').split('\n')
  const output: Block[] = []
  let index = 0
  while (index < lines.length) {
    const current = lines[index] ?? ''
    if (!current.trim()) { index++; continue }
    if (current.trim().startsWith('```')) {
      const code: string[] = []
      index++
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith('```')) code.push(lines[index++] ?? '')
      if (index < lines.length) index++
      output.push({ type: 'code', text: code.join('\n') })
      continue
    }
    const heading = current.match(/^(#{1,3})\s+(.+)$/)
    if (heading) { output.push({ type: 'heading', level: heading[1]?.length ?? 2, text: heading[2] ?? '' }); index++; continue }
    if (/^\s*[-*•]\s+/.test(current)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*•]\s+/.test(lines[index] ?? '')) items.push((lines[index++] ?? '').replace(/^\s*[-*•]\s+/, ''))
      output.push({ type: 'unordered', items })
      continue
    }
    if (/^\s*\d+[.)]\s+/.test(current)) {
      const items: string[] = []
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index] ?? '')) items.push((lines[index++] ?? '').replace(/^\s*\d+[.)]\s+/, ''))
      output.push({ type: 'ordered', items })
      continue
    }
    if (/^\s*>\s?/.test(current)) {
      const quotes: string[] = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index] ?? '')) quotes.push((lines[index++] ?? '').replace(/^\s*>\s?/, ''))
      output.push({ type: 'quote', text: quotes.join('\n') })
      continue
    }
    const paragraph: string[] = []
    while (index < lines.length && (lines[index] ?? '').trim() && !/^(#{1,3})\s+|^\s*```|^\s*[-*•]\s+|^\s*\d+[.)]\s+|^\s*>\s?/.test(lines[index] ?? '')) paragraph.push(lines[index++] ?? '')
    output.push({ type: 'paragraph', text: paragraph.join('\n') })
  }
  return output
})
</script>

<template>
  <div class="agent-markdown">
    <template v-for="(block, index) in blocks" :key="index">
      <component :is="`h${block.level}`" v-if="block.type === 'heading'">
        <template v-for="(part, partIndex) in inlineParts(block.text || '')" :key="partIndex"><strong v-if="part.kind === 'strong'">{{ part.text }}</strong><code v-else-if="part.kind === 'code'">{{ part.text }}</code><template v-else>{{ part.text }}</template></template>
      </component>
      <p v-else-if="block.type === 'paragraph'">
        <template v-for="(part, partIndex) in inlineParts(block.text || '')" :key="partIndex"><strong v-if="part.kind === 'strong'">{{ part.text }}</strong><code v-else-if="part.kind === 'code'">{{ part.text }}</code><template v-else>{{ part.text }}</template></template>
      </p>
      <blockquote v-else-if="block.type === 'quote'">{{ block.text }}</blockquote>
      <pre v-else-if="block.type === 'code'"><code>{{ block.text }}</code></pre>
      <component :is="block.type === 'ordered' ? 'ol' : 'ul'" v-else><li v-for="(item, itemIndex) in block.items" :key="itemIndex"><template v-for="(part, partIndex) in inlineParts(item)" :key="partIndex"><strong v-if="part.kind === 'strong'">{{ part.text }}</strong><code v-else-if="part.kind === 'code'">{{ part.text }}</code><template v-else>{{ part.text }}</template></template></li></component>
    </template>
  </div>
</template>

<style scoped>
/* 颜色统一走 --workbench-* 设计令牌：原来的冷蓝色（#26364f / #1f3b61）放在绿色系的
   消息底色上会显得突兀。字号只出现 12/14/16/18/20，圆角只用 4px 和 10px。 */
.agent-markdown{color:var(--workbench-ink);font-size:14px;line-height:1.78}
.agent-markdown :is(h1,h2,h3){margin:var(--space-4) 0 var(--space-2);color:var(--workbench-ink);font-weight:600;line-height:1.35}
.agent-markdown h1{font-size:20px}
.agent-markdown h2{font-size:18px}
.agent-markdown h3{font-size:16px}
.agent-markdown p{margin:var(--space-2) 0;white-space:pre-line}
.agent-markdown :is(ul,ol){display:grid;gap:var(--space-1);margin:var(--space-2) 0;padding-left:var(--space-6)}
.agent-markdown blockquote{margin:var(--space-3) 0;padding:var(--space-2) var(--space-3);border-left:3px solid var(--workbench-blue);background:rgba(228,239,232,.72);color:var(--workbench-subtle);white-space:pre-line}
.agent-markdown pre{overflow:auto;margin:var(--space-3) 0;padding:var(--space-3);border-radius:var(--radius-control);background:#202b3a;color:#dce6f3;font-size:12px}
.agent-markdown :not(pre)>code{padding:2px var(--space-1);border-radius:var(--space-1);background:rgba(228,239,232,.6);color:var(--workbench-blue-deep);font-size:.9em}
.agent-markdown strong{font-weight:700;color:var(--workbench-ink)}
</style>
