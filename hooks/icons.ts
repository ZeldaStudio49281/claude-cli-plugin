// Ikonerna framför raderna i filträdet och uppgiftslistan.
//
// Varje ikon är ett tecken som tar exakt en cell, så att en rad i panelen
// förblir en skärmrad och ett klick hamnar på rätt rad. Därför inga emoji:
// deras bredd skiljer sig mellan terminaler.
//
// - `unicode` (standard): tecken ur WGL4, som Consolas, Cascadia och andra
//   vanliga terminaltypsnitt har.
// - `nerdfont`: filtypsikoner ur Nerd Fonts, för den som har ett sådant typsnitt.
// - `none`: inga ikoner; uppgifterna märks med `[ ]`, `[>]` och `[x]`.

export type IconSet = 'unicode' | 'nerdfont' | 'none'

export type Icon = { glyph: string; color?: string }

export const ICON_SETS: readonly IconSet[] = ['unicode', 'nerdfont', 'none']

export const iconSetOf = (value: unknown): IconSet =>
  ICON_SETS.includes(value as IconSet) ? (value as IconSet) : 'unicode'

type Kind = 'code' | 'config' | 'doc' | 'image' | 'lock' | 'other'

const GLYPHS: Record<Exclude<IconSet, 'none'>, Record<Kind | 'dir' | 'dirOpen', string>> = {
  unicode: {
    dir: '■',
    dirOpen: '□',
    code: 'λ',
    config: '≡',
    doc: '¶',
    image: '◊',
    lock: '§',
    other: '∙',
  },
  nerdfont: {
    dir: '',
    dirOpen: '',
    code: '',
    config: '',
    doc: '',
    image: '',
    lock: '',
    other: '',
  },
}

const COLORS: Record<Kind, string | undefined> = {
  code: 'yellow',
  config: 'magenta',
  doc: 'cyan',
  image: 'green',
  lock: 'red',
  other: undefined,
}

const EXTENSIONS: Record<string, Kind> = {
  ts: 'code', tsx: 'code', js: 'code', jsx: 'code', mjs: 'code', cjs: 'code', mts: 'code', cts: 'code',
  py: 'code', rb: 'code', go: 'code', rs: 'code', java: 'code', kt: 'code', cs: 'code', c: 'code',
  h: 'code', cpp: 'code', hpp: 'code', swift: 'code', php: 'code', lua: 'code', sh: 'code',
  ps1: 'code', bat: 'code', cmd: 'code', css: 'code', scss: 'code', html: 'code', vue: 'code', svelte: 'code', sql: 'code',
  json: 'config', jsonc: 'config', yaml: 'config', yml: 'config', toml: 'config', ini: 'config',
  xml: 'config', env: 'config', cfg: 'config', conf: 'config',
  md: 'doc', mdx: 'doc', txt: 'doc', rst: 'doc', pdf: 'doc', doc: 'doc', docx: 'doc',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image', ico: 'image', bmp: 'image',
  lock: 'lock', pem: 'lock', key: 'lock',
}

// Filer som känns igen på namnet i stället för ändelsen.
const NAMES: Record<string, Kind> = {
  license: 'lock',
  'license.md': 'lock',
  '.gitignore': 'config',
  '.gitattributes': 'config',
  '.editorconfig': 'config',
  '.npmrc': 'config',
  dockerfile: 'config',
  makefile: 'config',
}

function kindOf(name: string): Kind {
  const lower = name.toLowerCase()
  const byName = NAMES[lower]
  if (byName) return byName
  if (lower.startsWith('.env')) return 'config'
  const dot = lower.lastIndexOf('.')

  return dot > 0 ? (EXTENSIONS[lower.slice(dot + 1)] ?? 'other') : 'other'
}

// En Clients props är JSON: färgen utelämnas hellre än att vara undefined.
const icon = (glyph: string, color: string | undefined): Icon => (color ? { glyph, color } : { glyph })

export function fileIcon(name: string, set: IconSet): Icon | undefined {
  if (set === 'none') return undefined
  const kind = kindOf(name)

  return icon(GLYPHS[set][kind], COLORS[kind])
}

export function folderIcon(isOpen: boolean, set: IconSet): Icon | undefined {
  if (set === 'none') return undefined

  return icon(GLYPHS[set][isOpen ? 'dirOpen' : 'dir'], 'blue')
}

export type TaskState = 'done' | 'current' | 'open'

const TASK_GLYPHS: Record<IconSet, Record<TaskState, string>> = {
  unicode: { done: '√', current: '►', open: '○' },
  nerdfont: { done: '', current: '', open: '' },
  none: { done: '[x]', current: '[>]', open: '[ ]' },
}

const TASK_COLORS: Record<TaskState, string | undefined> = {
  done: 'green',
  current: 'cyan',
  open: undefined,
}

export const taskIcon = (state: TaskState, set: IconSet): Icon =>
  icon(TASK_GLYPHS[set][state], TASK_COLORS[state])
