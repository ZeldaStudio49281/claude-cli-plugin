import { expect, test } from 'claude-code/testing'

const ROOT = 'C:\\projekt\\demo'
const MAIN = `${ROOT}\\src\\main.ts`
const INSTALL = 'C:\\Program\\VS Code'

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

const entry = (name: string, kind: 'file' | 'dir') => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })

type On = Parameters<Parameters<typeof test>[1]>[1]
type Mounted = Awaited<ReturnType<Parameters<Parameters<typeof test>[1]>[0]['ui']['mount']>>

// Ett projekt med src/main.ts och VS Code installerat; `runs` samlar det som
// startades, `filled` det som skrevs in i prompten.
function fakeProject(on: On, options: { hasCodeCmd: boolean }) {
  const runs: { argv: string[]; env?: Record<string, string> }[] = []
  const filled: { text: string; mode?: string }[] = []
  on('session.cwd', () => ({ value: ROOT }))
  on('session.root', () => ({ value: ROOT }))
  on('fs.list', (_, e) => ({
    value: /[\\/]src$/.test(e.path) ? [entry('main.ts', 'file')] : [entry('src', 'dir'), entry('TODO.md', 'file')],
  }))
  on('fs.read', (_, e) => {
    if (e.path === `${INSTALL}\\bin\\code.cmd`) {
      return { value: '@echo off\r\n"%~dp0..\\Code.exe" "%~dp0..\\abc123\\resources\\app\\out\\cli.js" %*\r\n' }
    }
    throw new Error('ENOENT')
  })
  on('process.run', (_, e) => {
    if (e.argv[0] === 'where.exe') {
      return {
        value: options.hasCodeCmd
          ? { exitCode: 0, stdout: `${INSTALL}\\bin\\code.cmd\r\n`, stderr: '' }
          : { exitCode: 1, stdout: '', stderr: '' },
      }
    }
    runs.push({ argv: [...e.argv], ...(e.init?.env ? { env: { ...e.init.env } } : {}) })
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('prompt.fill', (_, e) => {
    filled.push({ text: e.text, ...(e.mode ? { mode: e.mode } : {}) })
    return { isFilled: true, text: e.text, cursor: e.text.length } as never
  })
  on('ui.toast', () => ({ value: undefined }))

  return { runs, filled }
}

// Klickar på ett val i den öppna menyn (ramen där regionen ritade den).
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

test('klick på en fil öppnar den i VS Code, utan cmd.exe, och markerar den', async ($, on) => {
  const { runs } = fakeProject(on, { hasCodeCmd: true })
  const ui = await $.ui.mount(PANE)

  // Rad 0 src/; utfälld är rad 1 main.ts.
  await ui.pointer({ in: 'tree', type: 'down', x: 3, y: 0, button: 'left' })
  await ui.pointer({ in: 'tree', type: 'down', x: 6, y: 1, button: 'left' })

  expect(runs).toEqual([
    {
      argv: [`${INSTALL}\\Code.exe`, `${INSTALL}\\abc123\\resources\\app\\out\\cli.js`, '--reuse-window', MAIN],
      env: { ELECTRON_RUN_AS_NODE: '1', VSCODE_DEV: '' },
    },
  ])
  expect(runs.some(run => run.argv[0] === 'cmd.exe')).toBe(false)
  // Trädet står kvar; ingen förhandsvisning.
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  expect(await ui.find({ in: 'tree', text: /main\.ts ◂/ })).toBeDefined()

  await ui.unmount()
})

test('utan code.cmd (macOS, Linux) körs `code` direkt', async ($, on) => {
  const { runs } = fakeProject(on, { hasCodeCmd: false })
  const ui = await $.ui.mount(PANE)

  await ui.pointer({ in: 'tree', type: 'down', x: 3, y: 0, button: 'left' })
  await ui.pointer({ in: 'tree', type: 'down', x: 6, y: 1, button: 'left' })
  expect(runs).toEqual([{ argv: ['code', '--reuse-window', MAIN] }])

  await ui.unmount()
})

test('högerklick på en fil: menyn har Öppna i VS Code och Infoga sökväg', async ($, on) => {
  const { runs, filled } = fakeProject(on, { hasCodeCmd: true })
  const ui = await $.ui.mount(PANE)
  await ui.pointer({ in: 'tree', type: 'down', x: 3, y: 0, button: 'left' })

  await ui.pointer({ in: 'tree', type: 'down', x: 6, y: 1, button: 'right' })
  expect(await ui.find({ in: 'tree', text: /Öppna i VS Code/ })).toBeDefined()
  expect(await ui.find({ in: 'tree', text: /Infoga sökväg/ })).toBeDefined()
  // Bara de två valen på en fil.
  expect(await ui.find({ in: 'tree', text: /Fäll ihop alla/ })).toBeUndefined()

  await choose(ui, 'tree', 'Infoga sökväg')
  expect(filled).toEqual([{ text: 'src/main.ts ', mode: 'insert' }])
  expect(runs).toHaveLength(0)

  await ui.pointer({ in: 'tree', type: 'down', x: 6, y: 1, button: 'right' })
  await choose(ui, 'tree', 'Öppna i VS Code')
  expect(runs.at(-1)?.argv.slice(-2)).toEqual(['--reuse-window', MAIN])

  // På en mapp är menyn trädets egen.
  await ui.pointer({ in: 'tree', type: 'down', x: 3, y: 0, button: 'right' })
  expect(await ui.find({ in: 'tree', text: /Fäll ihop alla/ })).toBeDefined()
  expect(await ui.find({ in: 'tree', text: /Infoga sökväg/ })).toBeUndefined()

  await ui.unmount()
})

test('högerklick på en mapp eller tom yta öppnar mappen i ett nytt VS Code-fönster', async ($, on) => {
  const { runs } = fakeProject(on, { hasCodeCmd: false })
  const ui = await $.ui.mount(PANE)

  // Rad 0 är src/.
  await ui.pointer({ in: 'tree', type: 'down', x: 3, y: 0, button: 'right' })
  expect(await ui.find({ in: 'tree', text: /Uppdatera/ })).toBeDefined()
  expect(await ui.find({ in: 'tree', text: /Fäll ihop alla/ })).toBeDefined()
  await choose(ui, 'tree', 'Öppna i VS Code')
  expect(runs).toEqual([{ argv: ['code', '--new-window', `${ROOT}\\src`] }])
  // En mapp markeras inte som vald fil, och fälls inte ut av att öppnas.
  expect(await ui.find({ in: 'tree', text: /◂/ })).toBeUndefined()
  expect(await ui.find({ in: 'tree', text: /main\.ts/ })).toBeUndefined()

  // Långt under sista raden: katalogen som trädet visar.
  await ui.pointer({ in: 'tree', type: 'down', x: 10, y: 8, button: 'right' })
  await choose(ui, 'tree', 'Öppna i VS Code')
  expect(runs.at(-1)).toEqual({ argv: ['code', '--new-window', ROOT] })

  await ui.unmount()
})

test('utan Client (vscode-ytan) öppnar en filknapp filen i VS Code', async ($, on) => {
  const { runs } = fakeProject(on, { hasCodeCmd: false })
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })

  await ui.press({ key: `dir:${ROOT}\\src` })
  await ui.press({ key: `file:${MAIN}` })
  expect(runs).toEqual([{ argv: ['code', '--reuse-window', MAIN] }])

  await ui.unmount()
})
