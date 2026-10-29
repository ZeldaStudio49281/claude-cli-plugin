import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { TEMPLATE, append, find, parse, remove, setDone, summary } from './todo'
import type { Task } from './todo'
import { fileIcon, folderIcon, iconSetOf, taskIcon } from './icons'
import type { Icon, TaskState } from './icons'
import type { MenuItem, MenuListPost, MenuRow, RowPart } from './menu-list'

const PANE = 'sidebar'
const TITLE = 'Sidebar'
const TODO_FILE = 'TODO.md'
// Mappar som aldrig listas: stora eller ointressanta i ett filträd.
const HIDDEN = new Set(['.git', 'node_modules', '.DS_Store'])
// Verktyg som kan ändra filer: trädet och listan ritas om när de körts klart.
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell'])

const expanded = atom({ plugin: 'sidebar', key: 'expanded' } as const, [], {
  shape: 'expanded-2',
})
const tick = atom({ plugin: 'sidebar', key: 'tick' } as const, 0, {
  shape: 'tick-1',
})
// Agentens aktuella arbetskatalog, absolut; tom tills sessionen har startat.
const agentCwd = atom({ plugin: 'sidebar', key: 'agentCwd' } as const, '', {
  shape: 'agent-cwd-1',
})
const openTasks = atom({ plugin: 'sidebar', key: 'openTasks' } as const, [], {
  shape: 'open-tasks-1',
})
// Den senast öppnade filen, absolut; tom innan någon öppnats. Markeras i trädet.
const selectedFile = atom({ plugin: 'sidebar', key: 'selectedFile' } as const, '', {
  shape: 'selected-file-1',
})

type Row =
  | { kind: 'dir'; path: string; prefix: string; name: string; isOpen: boolean }
  | { kind: 'file'; path: string; prefix: string; name: string }
  | { kind: 'more'; prefix: string; count: number }

// Går igenom de utfällda mapparna och bygger trädets rader, högst `limit` stycken.
async function walk(
  $: EngineInterface,
  dir: string,
  prefix: string,
  open: ReadonlySet<string>,
  rows: Row[],
  limit: number,
): Promise<void> {
  const entries = await $.fs.list(dir).catch(() => [])
  const shown = entries
    .filter(entry => !HIDDEN.has(entry.name))
    .sort((a, b) =>
      a.kind === b.kind
        ? a.name.localeCompare(b.name)
        : a.kind === 'dir' ? -1 : b.kind === 'dir' ? 1 : 0,
    )

  for (const [index, entry] of shown.entries()) {
    if (rows.length >= limit) {
      rows.push({ kind: 'more', prefix, count: shown.length - index })
      return
    }
    const isLast = index === shown.length - 1
    const branch = prefix + (isLast ? '└─' : '├─')
    const path = joinPath(dir, entry.name)
    if (entry.kind === 'dir') {
      const isOpen = open.has(path)
      rows.push({ kind: 'dir', path, prefix: branch, name: entry.name, isOpen })
      if (isOpen) {
        await walk($, path, prefix + (isLast ? '  ' : '│ '), open, rows, limit)
        if (rows.length > limit) return
      }
    } else {
      rows.push({ kind: 'file', path, prefix: branch, name: entry.name })
    }
  }
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

// Fogar ihop med katalogens egen avgränsare (`\` på Windows).
function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') ? '\\' : '/'
  return `${dir.replace(/[\\/]+$/, '')}${sep}${name}`
}

const normalized = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

// Trädets rubrik: katalogen relativt projektroten när den ligger under den.
function cwdLabel(cwd: string, root: string): string {
  const [c, r] = [normalized(cwd), normalized(root)]
  if (c === r) return `${baseName(root)}/`
  if (c.startsWith(`${r}/`)) {
    return `${baseName(root)}/${cwd.replace(/\\/g, '/').slice(r.length + 1).replace(/\/+$/, '')}/`
  }

  return `${cwd.replace(/\\/g, '/').replace(/\/+$/, '')}/`
}

// Katalogen trädet visar: agentens cwd, eller sessionens innan någon ändring setts.
const treeDir = async ($: EngineInterface) => (await read($, agentCwd)) || $.session.cwd()

// TODO.md ligger alltid i projektroten, så listan följer inte med när agenten
// gör `cd` ner i en underkatalog.
const todoPath = async ($: EngineInterface) => joinPath(await $.session.root(), TODO_FILE)

// TODO.md, eller undefined när den saknas.
const readTodo = async ($: EngineInterface) =>
  $.fs.read(await todoPath($)).then(
    text => (typeof text === 'string' ? text : undefined),
    () => undefined,
  )

async function writeTodo($: EngineInterface, text: string) {
  await $.fs.write(await todoPath($), text)
  await update($, tick, n => n + 1)
}

const toggleTaskHeader = ($: EngineInterface, header: string) =>
  update($, openTasks, headers =>
    headers.includes(header) ? headers.filter(h => h !== header) : [...headers, header],
  )

// Ber agenten börja med uppgiften: en prompt med dess rubrik och innehåll.
async function startTask($: EngineInterface, number: number) {
  const task = find(parse((await readTodo($)) ?? ''), number)
  if (!task) return
  if (task.isDone) {
    $.ui.toast(`Uppgift ${task.number} är redan klar.`)
    return
  }
  const body = task.content.length > 0 ? `\n\n${task.content.join('\n')}` : ''
  $.ui.toast(`Startar uppgift ${task.number}: ${task.header}`)
  await $.prompt.submit({
    text:
      `Börja med uppgift ${task.number} i ${TODO_FILE}: ${task.header}${body}\n\n` +
      'Bocka av den med todo_done när den är klar och verifierad.',
  })
}

// Användarens sätt att bli av med en uppgift: den stryks, den bockas inte av.
async function removeTask($: EngineInterface, number: number) {
  const text = await readTodo($)
  const task = text === undefined ? undefined : find(parse(text), number)
  if (text === undefined || !task) return
  await writeTodo($, remove(text, task))
  $.ui.toast(`Tog bort uppgift ${task.number}: ${task.header}`)
}

const toggleDir = ($: EngineInterface, path: string) =>
  update($, expanded, paths =>
    paths.includes(path) ? paths.filter(p => p !== path) : [...paths, path],
  )

const refresh = ($: EngineInterface) => update($, tick, n => n + 1)

// Hur VS Code startas utan skal. På Windows är `code` en .cmd-fil, som bara
// cmd.exe kan köra, och cmd.exe skulle tolka `&` eller `|` i ett filnamn som
// kommandon. Därför görs det `code.cmd` gör: Code.exe kör sin cli.js som Node.
async function vscodeCommand($: EngineInterface): Promise<{ argv: string[]; env?: Record<string, string> }> {
  const where = await $.process.run(['where.exe', 'code.cmd'], { timeoutMs: 5000 }).catch(() => undefined)
  const script = where?.exitCode === 0 ? where.stdout.split(/\r?\n/)[0]?.trim() : undefined
  if (!script) return { argv: ['code'] }
  const bin = script.replace(/[\\/][^\\/]+$/, '')
  const install = bin.replace(/[\\/][^\\/]+$/, '')
  // code.cmd pekar ut cli.js under en versionskatalog: `"%~dp0..\<version>\…\cli.js"`.
  const text = await $.fs.read(script).then(t => (typeof t === 'string' ? t : ''), () => '')
  const cli = /%~dp0\.\.\\([^"]*cli\.js)/.exec(text)?.[1]
  if (!cli) return { argv: ['code'] }

  return {
    argv: [joinPath(install, 'Code.exe'), joinPath(install, cli)],
    env: { ELECTRON_RUN_AS_NODE: '1', VSCODE_DEV: '' },
  }
}

// Startar VS Code med sökvägen och säger i en toast hur det gick.
async function runVSCode($: EngineInterface, flag: string, path: string) {
  const { argv, env } = await vscodeCommand($)
  const ran = await $.process
    .run([...argv, flag, path], { timeoutMs: 15000, ...(env ? { env } : {}) })
    .catch(() => undefined)
  $.ui.toast(
    ran?.exitCode === 0
      ? `Öppnar ${baseName(path)} i VS Code`
      : 'Kunde inte starta VS Code: finns kommandot `code` på PATH?',
  )
}

// Öppnar filen i VS Code, i fönstret som redan är öppet om det finns ett.
async function openInEditor($: EngineInterface, path: string) {
  await update($, selectedFile, () => path)
  await runVSCode($, '--reuse-window', path)
}

// Öppnar mappen i ett nytt VS Code-fönster: i det öppna skulle den ersätta
// arbetsytan som redan finns där.
const openFolderInEditor = ($: EngineInterface, path: string) =>
  runVSCode($, '--new-window', path)

// Skriver in filens sökväg i prompten där markören står: relativt agentens
// katalog när filen ligger under den, annars absolut; inom citattecken om
// den innehåller mellanslag.
async function insertPath($: EngineInterface, path: string) {
  const dir = normalized(await treeDir($))
  const file = path.replace(/\\/g, '/')
  const relative = normalized(path).startsWith(`${dir}/`) ? file.slice(dir.length + 1) : file
  const text = /\s/.test(relative) ? `"${relative}"` : relative
  const filled = await $.prompt.fill({ text: `${text} `, mode: 'insert' })
  if (!filled.isFilled) $.ui.toast('Prompten tar inte emot text just nu.')
}

// Menyerna, som `menu-list.tsx` visar vid högerklick.
// På en mapp och på trädets tomma yta (där pekar `open-dir` ut katalogen
// trädet visar).
const TREE_MENU: MenuItem[] = [
  { action: 'open-dir', label: 'Öppna i VS Code', color: 'cyan' },
  { action: 'refresh', label: 'Uppdatera' },
  { action: 'collapse', label: 'Fäll ihop alla' },
]
const FILE_MENU: MenuItem[] = [
  { action: 'open', label: 'Öppna i VS Code', color: 'cyan' },
  { action: 'insert', label: 'Infoga sökväg' },
]
const TASKS_MENU: MenuItem[] = [{ action: 'refresh', label: 'Uppdatera' }]
const taskMenu = (task: Task): MenuItem[] => [
  ...(task.isDone ? [] : [{ action: 'start', label: '▶ Starta', color: 'cyan' }]),
  { action: 'remove', label: '✕ Ta bort', color: 'red' },
]

// Indata till ett registrerat verktyg ligger direkt på händelsen.
const inputOf = (e: object) => e as Record<string, unknown>

// En ikon och mellanslaget efter den, eller ingenting när ikoner är avstängda.
const iconParts = (icon: Icon | undefined): RowPart[] =>
  icon ? [icon.color ? { text: `${icon.glyph} `, color: icon.color } : { text: `${icon.glyph} ` }] : []

export const register: Register = (on, options) => {
  // Inställningen `icons` i plugin.json: unicode (standard), nerdfont eller none.
  const icons = iconSetOf(options.icons)

  // Trädet följer agenten: en `cd` i Bash (eller /cd) flyttar det dit.
  on('classic.CwdChanged', async ($, e, next) => {
    await update($, agentCwd, () => e.new_cwd).catch(() => {})

    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sidebar',
      description: 'Visa sidopanelen med filträd och TODO.md',
    })
    await $.tool.register({
      name: 'todo_add',
      description:
        'Lägger till uppgifter sist i projektets TODO.md, som visas för användaren i sidopanelen. ' +
        'Använd det för att skriva ner de återstående stegen i arbetet innan du börjar. ' +
        '`header` är en kort rubrik; `content` är detaljer (markdown), som användaren fäller ut med ett klick.',
      inputSchema: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                header: { type: 'string', description: 'Kort rubrik, en rad' },
                content: { type: 'string', description: 'Detaljer, valfritt' },
              },
              required: ['header'],
            },
          },
        },
        required: ['tasks'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'todo_done',
      description:
        'Bockar av en uppgift i TODO.md när den är klar (eller öppnar den igen med `done: false`). ' +
        'Bara agenten bockar av: gör det direkt när steget är klart, inte i förväg.',
      inputSchema: {
        type: 'object',
        properties: {
          task: {
            type: ['integer', 'string'],
            description: 'Uppgiftens nummer (1-baserat) eller exakta rubrik',
          },
          done: { type: 'boolean', description: 'Standard true' },
        },
        required: ['task'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'todo_list',
      description: 'Listar uppgifterna i projektets TODO.md med nummer, status och innehåll.',
      inputSchema: { type: 'object', properties: {} },
      isDeferred: false,
    })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'sidebar' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Sidopanelen är öppen.' }
  })

  on('tool.call', { tool: 'mcp__sidebar__todo_list' }, async $ => {
    const text = await readTodo($)
    if (text === undefined) return { result: `${TODO_FILE} finns inte än.` }

    return { result: summary(parse(text), true) }
  })

  on('tool.call', { tool: 'mcp__sidebar__todo_add' }, async ($, e) => {
    const raw = inputOf(e).tasks
    const items = (Array.isArray(raw) ? raw : [])
      .filter((item): item is { header: string; content?: string } =>
        typeof item?.header === 'string' && item.header.trim() !== '')
    if (items.length === 0) return { deny: 'Ange minst en uppgift med `header`.' }
    const text = append((await readTodo($)) ?? TEMPLATE, items)
    await writeTodo($, text)

    return { result: `Tillagt.\n${summary(parse(text), false)}` }
  })

  on('tool.call', { tool: 'mcp__sidebar__todo_done' }, async ($, e) => {
    const input = inputOf(e)
    const text = await readTodo($)
    if (text === undefined) return { deny: `${TODO_FILE} finns inte.` }
    const tasks = parse(text)
    const task = find(tasks, input.task)
    if (!task) return { deny: `Ingen uppgift matchar ${JSON.stringify(input.task)}.\n${summary(tasks, false)}` }
    const isDone = input.done !== false
    const changed = setDone(text, task, isDone)
    await writeTodo($, changed)
    const left = parse(changed).filter(one => !one.isDone)
    const nextUp = left[0] ? `Nästa: ${left[0].number}. ${left[0].header}` : 'Alla uppgifter är klara.'

    return { result: `${task.number}. ${task.header}: ${isDone ? 'klar' : 'öppen igen'}. ${nextUp}` }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (FILE_TOOLS.has(e.tool)) await update($, tick, n => n + 1).catch(() => {})

    return ran
  })

  // Agenten styrs av listan: de öppna uppgifterna följer med varje prompt.
  on('prompt.submit', async ($, e, next) => {
    const text = await readTodo($)
    const note = text === undefined
      ? `Projektet saknar ${TODO_FILE}. Skapa den med todo_add när arbetet har flera steg.`
      : `Aktuell ${TODO_FILE} (bocka av med todo_done när ett steg är klart):\n${summary(parse(text), true)}`

    return next({ ...e, context: [...(e.context ?? []), note] })
  })

  // Klick och menyval från de två regionerna i panelen.
  on('ui.message', async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { action, id = '' } = e.data as Partial<MenuListPost>
    if (action === 'refresh') {
      await refresh($)
    } else if (e.element === 'tree') {
      if (action === 'toggle') await toggleDir($, id)
      if (action === 'collapse') await update($, expanded, () => [])
      if (action === 'open') await openInEditor($, id)
      if (action === 'open-dir') await openFolderInEditor($, id || (await treeDir($)))
      if (action === 'insert') await insertPath($, id)
    } else if (e.element === 'tasks') {
      const number = Number(id)
      if (action === 'start') await startTask($, number)
      if (action === 'remove') await removeTask($, number)
      if (action === 'toggle') {
        const task = find(parse((await readTodo($)) ?? ''), number)
        if (task) await toggleTaskHeader($, task.header)
      }
    } else {
      return next(e)
    }

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    // Mobil-ytan saknar Input: där visas listan utan inmatningsfält.
    const Input = 'Input' in elements ? elements.Input : undefined
    // Högerklick kräver pekarhändelser, som bara en Client i terminalen får;
    // på övriga ytor startas en uppgift med ▶-knappen.
    const Client = e.surface === 'terminal' && 'Client' in elements ? elements.Client : undefined
    const bodyRows = Math.max(10, e.props.scroll.bodyRows)
    const width = e.props.bodyColumns
    const treeRows = Math.floor(bodyRows / 2)
    // Rubriken tar en rad av trädets halva.
    const treeRoom = Math.max(1, treeRows - 1)

    await read($, tick)
    const open = new Set(await read($, expanded))
    const shownTasks = new Set(await read($, openTasks))
    const dir = await treeDir($)
    const label = cwdLabel(dir, await $.session.root())
    const todoText = await readTodo($)
    const tasks: Task[] = todoText === undefined ? [] : parse(todoText)

    const rows: Row[] = []
    await walk($, dir, '', open, rows, treeRoom - 1)

    const selected = await read($, selectedFile)

    const doneCount = tasks.filter(task => task.isDone).length
    const current = tasks.find(task => !task.isDone)

    // Radernas delar, som både menyregionerna och knapparna (utan Client) ritar.
    const dirParts = (row: Extract<Row, { kind: 'dir' }>): RowPart[] => [
      { text: row.prefix, dim: true },
      { text: row.isOpen ? '▾ ' : '▸ ', color: 'yellow' },
      ...iconParts(folderIcon(row.isOpen, icons)),
      { text: `${row.name}/`, color: 'blue', bold: true },
    ]
    const fileParts = (row: Extract<Row, { kind: 'file' }>): RowPart[] => [
      { text: `${row.prefix}─ `, dim: true },
      ...iconParts(fileIcon(row.name, icons)),
      row.path === selected ? { text: `${row.name} ◂`, color: 'cyan', bold: true } : { text: row.name },
    ]
    const taskParts = (task: Task): RowPart[] => {
      const isShown = shownTasks.has(task.header)
      const state: TaskState = task.isDone ? 'done' : task === current ? 'current' : 'open'

      return [
        { text: task.content.length > 0 ? (isShown ? '▾ ' : '▸ ') : '  ', color: 'yellow' },
        ...iconParts(taskIcon(state, icons)),
        { text: task.header, dim: task.isDone, bold: state === 'current', strike: task.isDone },
      ]
    }
    const drawParts = (parts: RowPart[]) =>
      parts.map(part => (
        <Text
          color={part.color}
          dimColor={part.dim}
          strikethrough={part.strike}
          weight={part.bold ? 'bold' : 'regular'}
        >
          {part.text}
        </Text>
      ))

    // Raderna som menyregionerna ritar, en per skärmrad.
    const treeMenuRows: MenuRow[] = rows.map(row =>
      row.kind === 'dir'
        ? { id: row.path, left: 'toggle', menu: TREE_MENU, parts: dirParts(row) }
        : row.kind === 'file'
          ? { id: row.path, left: 'open', menu: FILE_MENU, parts: fileParts(row) }
          : { id: '', menu: TREE_MENU, parts: [{ text: `${row.prefix}└─ … ${row.count} till`, dim: true }] },
    )
    const taskMenuRows: MenuRow[] = tasks.flatMap(task => {
      const base = { id: String(task.number), left: 'toggle', menu: taskMenu(task) }

      return [
        { ...base, parts: taskParts(task) },
        ...(shownTasks.has(task.header)
          ? task.content.map(line => ({ ...base, parts: [{ text: `      ${line}`, dim: true }] }))
          : []),
      ]
    })

    return (
      // Dockad tar panelen hela sin höjd, så att nedre halvans region kan växa
      // ner till fältet; infälld (inline) är den så hög som innehållet.
      <Box
        flexDirection="column"
        width={width}
        {...(e.props.placement === 'dock' ? { height: e.props.scroll.bodyRows } : {})}
      >
        <Box flexDirection="column" height={treeRows} overflow="hidden">
          <Box flexDirection="row" justifyContent="space-between">
            <Text color="green" weight="bold">
              $ tree {label}
            </Text>
            <Button key="tree-refresh" plain onPress={() => refresh($)}>
              <Text dimColor>↻</Text>
            </Button>
          </Box>
          {Client && (
            <Client
              key="tree"
              module="./menu-list.tsx"
              height={treeRoom}
              props={{ rows: treeMenuRows, menu: TREE_MENU }}
            />
          )}
          {!Client &&
            rows.map(row =>
              row.kind === 'dir' ? (
                <Button key={`dir:${row.path}`} plain onPress={() => toggleDir($, row.path)}>
                  {drawParts(dirParts(row))}
                </Button>
              ) : row.kind === 'file' ? (
                <Button key={`file:${row.path}`} plain onPress={() => openInEditor($, row.path)}>
                  {drawParts(fileParts(row))}
                </Button>
              ) : (
                <Text dimColor>
                  {row.prefix}└─ … {row.count} till
                </Text>
              ),
            )}
        </Box>

        <Text dimColor>{'─'.repeat(Math.max(1, width))}</Text>

        <Box flexDirection="column" flexGrow={1}>
          <Text color="green" weight="bold">
            $ cat {TODO_FILE}{' '}
            <Text dimColor weight="regular">
              ({doneCount}/{tasks.length} klara)
            </Text>
          </Text>
          {todoText === undefined && (
            <Text dimColor>Ingen {TODO_FILE} här än: agenten skapar den när arbetet har flera steg.</Text>
          )}
          {todoText !== undefined && tasks.length === 0 && <Text dimColor>Inga uppgifter.</Text>}
          {/* Regionen ritas även utan uppgifter och fyller ytan ner till fältet:
              ett högerklick utanför den når terminalen, som klistrar in urklippet. */}
          {Client && (
            <Client
              key="tasks"
              module="./menu-list.tsx"
              flexGrow={1}
              props={{
                rows: tasks.length > 0
                  ? [...taskMenuRows, { id: '', parts: [{ text: 'klick: fäll ut · högerklick: meny', dim: true }] }]
                  : [],
                menu: TASKS_MENU,
              }}
            />
          )}
          {!Client &&
            tasks.map(task => {
              const isShown = shownTasks.has(task.header)

              return (
                <Box key={`task-box:${task.number}`} flexDirection="column">
                  <Box flexDirection="row" justifyContent="space-between">
                    <Button key={`task:${task.number}`} plain onPress={() => toggleTaskHeader($, task.header)}>
                      {drawParts(taskParts(task))}
                    </Button>
                    <Box flexDirection="row" gap={1}>
                      {!task.isDone && (
                        <Button key={`start:${task.number}`} plain onPress={() => startTask($, task.number)}>
                          <Text color="cyan">▶</Text>
                        </Button>
                      )}
                      <Button key={`remove:${task.number}`} plain onPress={() => removeTask($, task.number)}>
                        <Text color="red">✕</Text>
                      </Button>
                    </Box>
                  </Box>
                  {isShown &&
                    task.content.map(line => (
                      <Text dimColor>
                        {'      '}
                        {line}
                      </Text>
                    ))}
                </Box>
              )
            })}
          {Input && (
            <Input
              key="todo-new"
              placeholder="Ny uppgift till agenten…"
              value=""
              submitLabel="lägg till"
              onSubmit={async (value: string) => {
                const header = value.trim()
                if (header === '') return
                await writeTodo($, append((await readTodo($)) ?? TEMPLATE, [{ header }]))
              }}
            />
          )}
        </Box>
      </Box>
    )
  })
}

