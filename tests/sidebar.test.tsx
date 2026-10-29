import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'sidebar',
  component: 'Pane',
  requestId: 'sidebar',
  surface: 'terminal',
  props: {
    title: 'Sidebar',
    isFocused: true,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const entry = (name: string, kind: 'file' | 'dir') => ({
  name,
  kind,
  size: 0,
  mtimeMs: 0,
  isLink: false,
})

const TREE: Record<string, ReturnType<typeof entry>[]> = {
  '': [entry('TODO.md', 'file'), entry('src', 'dir'), entry('.git', 'dir')],
  src: [entry('main.ts', 'file')],
}

const ROOT = 'C:\\projekt\\demo'

type Mounted = Awaited<ReturnType<Parameters<Parameters<typeof test>[1]>[0]['ui']['mount']>>

// Klickar på ett val i den öppna menyn: menyns ram ligger där regionen ritade
// den, valen en rad var innanför ramen.
async function choose(ui: Mounted, region: string, label: string) {
  const boxes = await ui.findAll({ in: region, type: 'Box' })
  const menu = boxes.find(box => (box.props as { position?: string }).position === 'absolute')
  expect(menu).toBeDefined()
  const { top, left } = menu!.props as { top: number; left: number }
  const items = await ui.findAll({ in: region, type: 'Text' })
  const labels = items.map(item => item.text ?? '').filter(text => /^ \S/.test(text))
  const index = labels.findIndex(text => text.includes(label))
  expect(index).toBeGreaterThanOrEqual(0)
  await ui.pointer({ in: region, type: 'down', x: left + 2, y: top + 1 + index, button: 'left' })
}

test('filträdet fäller ut en mapp', async ($, on) => {
  on('session.cwd', () => ({ value: ROOT }))
  on('session.root', () => ({ value: ROOT }))
  on('fs.list', (_, e) => ({ value: /[\\/]src$/.test(e.path) ? TREE.src : TREE[''] }))
  on('fs.read', () => {
    throw new Error('ENOENT')
  })

  const ui = await $.ui.mount(PANE)

  expect(await ui.find({ text: /\$ tree demo\// })).toBeDefined()
  expect(await ui.find({ in: 'tree', text: /src\// })).toBeDefined()
  expect(await ui.find({ in: 'tree', text: /\.git/ })).toBeUndefined()
  expect(await ui.find({ in: 'tree', text: /main\.ts/ })).toBeUndefined()
  expect(await ui.find({ text: /Ingen TODO\.md/ })).toBeDefined()

  // Rad 0 är src/ (mappar först).
  await ui.pointer({ in: 'tree', type: 'down', x: 3, y: 0, button: 'left' })
  expect(await ui.find({ in: 'tree', text: /main\.ts/ })).toBeDefined()

  // Högerklick på en mapp: trädets meny, med Fäll ihop alla.
  await ui.pointer({ in: 'tree', type: 'down', x: 3, y: 0, button: 'right' })
  await choose(ui, 'tree', 'Fäll ihop alla')
  expect(await ui.find({ in: 'tree', text: /main\.ts/ })).toBeUndefined()

  await ui.unmount()
})

test('utan Client (vscode) fälls en mapp ut med en knapp', async ($, on) => {
  on('session.cwd', () => ({ value: ROOT }))
  on('session.root', () => ({ value: ROOT }))
  on('fs.list', (_, e) => ({ value: /[\\/]src$/.test(e.path) ? TREE.src : TREE[''] }))
  on('fs.read', () => {
    throw new Error('ENOENT')
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })
  await ui.press({ key: `dir:${ROOT}\\src` })
  expect(await ui.find({ text: /main\.ts/ })).toBeDefined()

  await ui.unmount()
})

test('trädet följer agentens cwd, TODO.md stannar i projektroten', async ($, on) => {
  const listed: string[] = []
  const read: string[] = []
  on('session.cwd', () => ({ value: ROOT }))
  on('session.root', () => ({ value: ROOT }))
  on('fs.list', (_, e) => {
    listed.push(e.path)
    return { value: /[\\/]src$/.test(e.path) ? TREE.src : TREE[''] }
  })
  on('fs.read', (_, e) => {
    read.push(e.path)
    return { value: '# TODO\n\n## [ ] Ett steg\n' }
  })
  // Står för motorn under pluginet, som inte gör något mer med händelsen.
  on('classic.CwdChanged', () => ({}))

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /\$ tree demo\// })).toBeDefined()
  expect(await ui.find({ in: 'tree', text: /main\.ts/ })).toBeUndefined()

  // Agenten gör `cd src`: trädet ritas om därifrån, utan något klick.
  await $.classic.CwdChanged({ old_cwd: ROOT, new_cwd: `${ROOT}\\src` } as never)
  expect(await ui.find({ text: /\$ tree demo\/src\// })).toBeDefined()
  expect(await ui.find({ in: 'tree', text: /main\.ts/ })).toBeDefined()
  expect(listed.at(-1)).toBe(`${ROOT}\\src`)
  // Listan läses fortfarande från roten, inte från src.
  expect(await ui.find({ in: 'tasks', text: /Ett steg/ })).toBeDefined()
  expect(read.at(-1)).toBe(`${ROOT}\\TODO.md`)

  // Utanför projektet visas hela sökvägen.
  await $.classic.CwdChanged({ old_cwd: `${ROOT}\\src`, new_cwd: 'D:\\annat' } as never)
  expect(await ui.find({ text: /\$ tree D:\/annat\// })).toBeDefined()

  await ui.unmount()
})

// TODO.md i minnet, och promptarna som pluginet skickar.
function fakeProject(on: Parameters<Parameters<typeof test>[1]>[1]) {
  const project = { file: undefined as string | undefined, prompts: [] as string[] }
  on('session.cwd', () => ({ value: ROOT }))
  on('session.root', () => ({ value: ROOT }))
  on('fs.list', () => ({ value: [] }))
  on('fs.read', () => {
    if (project.file === undefined) throw new Error('ENOENT')
    return { value: project.file }
  })
  on('fs.write', (_, e) => {
    project.file = e.text
    return { value: undefined }
  })
  on('prompt.submit', (_, e) => {
    project.prompts.push(e.text)
    return { text: e.text }
  })

  return project
}

const TWO_TASKS = {
  tool: 'mcp__sidebar__todo_add',
  tasks: [
    { header: 'Skapa API', content: 'Endpoints för /users\nMed tester' },
    { header: 'Skriv README' },
  ],
} as never

test('agenten lägger till och bockar av; användaren kan inte bocka av', async ($, on) => {
  const project = fakeProject(on)

  const added = await $.tool.call(TWO_TASKS)
  expect(added).toMatchObject({ result: expect.stringContaining('1. [ ] Skapa API') })
  expect(project.file).toBe(
    '# TODO\n\n## [ ] Skapa API\nEndpoints för /users\nMed tester\n\n## [ ] Skriv README\n',
  )

  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ text: /0\/2 klara/ })).toBeDefined()

  const done = await $.tool.call({ tool: 'mcp__sidebar__todo_done', task: 1 } as never)
  expect(done).toMatchObject({ result: expect.stringContaining('Nästa: 2. Skriv README') })
  expect(project.file).toContain('## [x] Skapa API')
  expect(await ui.find({ text: /1\/2 klara/ })).toBeDefined()

  // Användaren kan lägga till uppgifter åt agenten.
  await ui.input({ key: 'todo-new', text: 'Deploya' })
  expect(project.file).toContain('## [ ] Deploya')

  const missing = await $.tool.call({ tool: 'mcp__sidebar__todo_done', task: 'Finns inte' } as never)
  expect(missing).toMatchObject({ deny: expect.stringContaining('Ingen uppgift') })

  await ui.unmount()
})

test('i terminalen: klick fäller ut, högerklick öppnar menyn med Starta och Ta bort', async ($, on) => {
  const project = fakeProject(on)
  await $.tool.call(TWO_TASKS)
  const ui = await $.ui.mount(PANE)

  expect(await ui.find({ in: 'tasks', text: /\[>\] Skapa API/ })).toBeDefined()
  expect(await ui.find({ in: 'tasks', text: /Endpoints/ })).toBeUndefined()

  // Rad 0 är uppgift 1:s rubrik.
  await ui.pointer({ in: 'tasks', type: 'down', x: 2, y: 0, button: 'left' })
  expect(await ui.find({ in: 'tasks', text: /Endpoints för \/users/ })).toBeDefined()
  expect(project.file).toContain('## [ ] Skapa API')
  expect(project.prompts).toHaveLength(0)

  // Utfälld: rad 0–2 är uppgift 1, rad 3 är uppgift 2. Högerklick öppnar
  // menyn och startar ingenting än.
  await ui.pointer({ in: 'tasks', type: 'down', x: 2, y: 3, button: 'right' })
  expect(project.prompts).toHaveLength(0)
  expect(await ui.find({ in: 'tasks', text: /Starta/ })).toBeDefined()
  expect(await ui.find({ in: 'tasks', text: /Ta bort/ })).toBeDefined()

  await choose(ui, 'tasks', 'Starta')
  expect(project.prompts).toHaveLength(1)
  expect(project.prompts[0]).toContain('Börja med uppgift 2 i TODO.md: Skriv README')
  // Valet stänger menyn, och att starta bockar inte av.
  expect(await ui.find({ in: 'tasks', text: /Ta bort/ })).toBeUndefined()
  expect(project.file).toContain('## [ ] Skriv README')

  // Ett klick utanför menyn stänger den utan att göra något.
  await ui.pointer({ in: 'tasks', type: 'down', x: 2, y: 0, button: 'right' })
  expect(await ui.find({ in: 'tasks', text: /Ta bort/ })).toBeDefined()
  await ui.pointer({ in: 'tasks', type: 'down', x: 45, y: 3, button: 'left' })
  expect(await ui.find({ in: 'tasks', text: /Ta bort/ })).toBeUndefined()
  expect(project.file).toContain('## [ ] Skapa API')

  // Ta bort stryker uppgift 1 ur filen, utan att bocka av den.
  await ui.pointer({ in: 'tasks', type: 'down', x: 2, y: 0, button: 'right' })
  await choose(ui, 'tasks', 'Ta bort')
  expect(project.file).toBe('# TODO\n\n## [ ] Skriv README\n')
  expect(await ui.find({ in: 'tasks', text: /Skapa API/ })).toBeUndefined()

  await ui.unmount()
})

test('utan Client (vscode): klick fäller ut, ▶ startar och ✕ tar bort', async ($, on) => {
  const project = fakeProject(on)
  await $.tool.call(TWO_TASKS)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })

  await ui.press({ key: 'task:1' })
  expect(await ui.find({ text: /Endpoints för \/users/ })).toBeDefined()

  await ui.press({ key: 'start:1' })
  expect(project.prompts[0]).toContain('Börja med uppgift 1 i TODO.md: Skapa API')
  expect(project.prompts[0]).toContain('Endpoints för /users')

  await ui.press({ key: 'remove:2' })
  expect(project.file).not.toContain('Skriv README')
  expect(project.file).toContain('## [ ] Skapa API')

  await ui.unmount()
})

test('högerklick under uppgifterna fångas av regionen (klistrar inte in i terminalen)', async ($, on) => {
  const project = fakeProject(on)
  const ui = await $.ui.mount(PANE)

  // Utan uppgifter finns regionen ändå, så ett högerklick där ger menyn.
  await ui.pointer({ in: 'tasks', type: 'down', x: 5, y: 2, button: 'right' })
  expect(await ui.find({ in: 'tasks', text: /Uppdatera/ })).toBeDefined()
  await ui.pointer({ in: 'tasks', type: 'down', x: 40, y: 9, button: 'left' })

  await $.tool.call(TWO_TASKS)
  // Panelen tar hela sin höjd, och regionen växer ner till fältet.
  const outer = await ui.drawn()
  expect(outer.props).toMatchObject({ height: PANE.props.scroll.bodyRows })
  expect((await ui.find({ type: 'Client', key: 'tasks' }))?.props).toMatchObject({ flexGrow: 1 })

  // Långt under sista raden: regionens egen meny, ingen uppgift pekas ut.
  await ui.pointer({ in: 'tasks', type: 'down', x: 5, y: 12, button: 'right' })
  expect(await ui.find({ in: 'tasks', text: /Uppdatera/ })).toBeDefined()
  expect(await ui.find({ in: 'tasks', text: /Ta bort/ })).toBeUndefined()
  await choose(ui, 'tasks', 'Uppdatera')
  expect(project.prompts).toHaveLength(0)
  expect(project.file).toContain('## [ ] Skapa API')

  // Tipsraden ligger nu i regionen.
  expect(await ui.find({ in: 'tasks', text: /högerklick: meny/ })).toBeDefined()

  await ui.unmount()
})
