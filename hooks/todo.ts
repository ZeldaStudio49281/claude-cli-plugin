// TODO.md-formatet: varje uppgift är en rubrik `## [ ] Rubrik` (eller `## [x]`),
// och raderna fram till nästa `## ` är dess innehåll. Text före första
// uppgiften lämnas orörd.

export type Task = {
  // 1-baserat nummer, så som panelen och verktygen visar det.
  number: number
  // Radnumret (0-baserat) för rubriken i filen.
  line: number
  header: string
  isDone: boolean
  content: string[]
}

export const TEMPLATE = '# TODO\n'
const HEAD = /^##\s+\[( |x|X)\]\s+(.*)$/
const ANY_HEAD = /^##\s/

const linesOf = (text: string) => text.split(/\r?\n/)
const eolOf = (text: string) => (text.includes('\r\n') ? '\r\n' : '\n')

export function parse(text: string): Task[] {
  const tasks: Task[] = []
  let current: Task | undefined
  for (const [line, raw] of linesOf(text).entries()) {
    const head = HEAD.exec(raw)
    if (head) {
      current = {
        number: tasks.length + 1,
        line,
        header: (head[2] ?? '').trim(),
        isDone: head[1] !== ' ',
        content: [],
      }
      tasks.push(current)
    } else if (ANY_HEAD.test(raw)) {
      current = undefined
    } else if (current) {
      current.content.push(raw)
    }
  }
  for (const task of tasks) {
    while (task.content.length > 0 && task.content[task.content.length - 1]?.trim() === '') {
      task.content.pop()
    }
    while (task.content.length > 0 && task.content[0]?.trim() === '') task.content.shift()
  }

  return tasks
}

// Uppgiften som `ref` pekar ut: ett nummer, eller rubriken (skiftlägesokänsligt).
export function find(tasks: Task[], ref: unknown): Task | undefined {
  if (typeof ref === 'number') return tasks.find(task => task.number === ref)
  if (typeof ref !== 'string') return undefined
  const asNumber = Number(ref)
  if (Number.isInteger(asNumber) && ref.trim() !== '') {
    return tasks.find(task => task.number === asNumber)
  }
  const wanted = ref.trim().toLowerCase()

  return tasks.find(task => task.header.toLowerCase() === wanted)
}

export function setDone(text: string, task: Task, isDone: boolean): string {
  const lines = linesOf(text)
  lines[task.line] = `## [${isDone ? 'x' : ' '}] ${task.header}`

  return lines.join(eolOf(text))
}

// Stryker uppgiften (rubrik och innehåll) ur texten: den försvinner, den
// markeras inte som klar.
export function remove(text: string, task: Task): string {
  const lines = linesOf(text)
  let end = task.line + 1
  while (end < lines.length && !ANY_HEAD.test(lines[end] ?? '')) end++
  lines.splice(task.line, end - task.line)
  const out = lines.join(eolOf(text)).replace(/\s*$/, '')

  return out + eolOf(text)
}

export function append(
  text: string,
  items: readonly { header: string; content?: string }[],
): string {
  const eol = eolOf(text)
  let out = text.replace(/\s*$/, '')
  for (const item of items) {
    out += `${eol}${eol}## [ ] ${item.header.trim()}`
    const body = item.content?.trim()
    if (body) out += eol + body.split(/\r?\n/).join(eol)
  }

  return out + eol
}

export function summary(tasks: Task[], withContent: boolean): string {
  if (tasks.length === 0) return 'TODO.md har inga uppgifter.'

  return tasks
    .map(task => {
      const head = `${task.number}. [${task.isDone ? 'x' : ' '}] ${task.header}`
      const body = withContent && !task.isDone && task.content.length > 0
        ? '\n' + task.content.map(line => `   ${line}`).join('\n')
        : ''

      return head + body
    })
    .join('\n')
}
