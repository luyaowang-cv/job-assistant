/**
 * The open-question conversation, kept on the client.
 *
 * The server holds no state: it receives the exchange so far and returns the
 * next answer. That makes the thread the client's responsibility, including
 * what to do when it grows — a long thread costs more on every turn and will
 * eventually be refused, so it is trimmed to whole turns before being sent.
 */

// Mirrors the server's caps in `server/schemas/open-question.ts`. Trimming here
// means the request is never rejected for length; the server still enforces.
export const MAX_TURNS = 24
export const MAX_CHARACTERS = 12_000

export function appendTurn(thread, question, answer) {
  const messages = Array.isArray(thread) ? [...thread] : []
  const asked = String(question ?? '').trim()
  if (!asked) return messages
  messages.push({ role: 'user', content: asked })
  const replied = String(answer ?? '').trim()
  if (replied) messages.push({ role: 'assistant', content: replied })
  return messages
}

/** Groups the exchange into turns, so trimming can never cut one in half. */
function toTurns(messages) {
  const turns = []
  for (const message of messages) {
    const current = turns.at(-1)
    if (!current || message.role === 'user') turns.push([message])
    else current.push(message)
  }
  return turns
}

/**
 * Keeps the newest whole turns that fit both caps. Older turns are dropped
 * first: the latest exchange is the one the next answer has to build on, and
 * the profile is re-sent with every request anyway.
 */
export function trimThread(messages) {
  const turns = toTurns(Array.isArray(messages) ? messages : [])
  const kept = []
  let turnCount = 0
  let characterCount = 0

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    const characters = turn.reduce((total, message) => total + String(message.content ?? '').length, 0)
    if (turnCount + turn.length > MAX_TURNS || characterCount + characters > MAX_CHARACTERS) break
    kept.unshift(turn)
    turnCount += turn.length
    characterCount += characters
  }

  return kept.flat()
}

/** The payload the answer endpoint expects. */
export function toRequestMessages(thread) {
  return trimThread(thread).map(message => ({ role: message.role, content: String(message.content ?? '') }))
}

export function threadKey(profileId) {
  return String(profileId ?? '')
}

/** Reads one profile's thread out of whatever `chrome.storage.local` holds. */
export function readThread(store, profileId) {
  const key = threadKey(profileId)
  const messages = store && typeof store === 'object' ? store[key] : null
  return Array.isArray(messages) ? messages : []
}

/** Returns a new store with one profile's thread replaced. */
export function writeThread(store, profileId, messages) {
  const next = store && typeof store === 'object' ? { ...store } : {}
  const key = threadKey(profileId)
  if (!key) return next
  if (Array.isArray(messages) && messages.length) next[key] = messages
  else delete next[key]
  return next
}
