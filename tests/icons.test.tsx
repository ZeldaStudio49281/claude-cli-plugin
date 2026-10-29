import { expect, test } from 'claude-code/testing'

import { fileIcon, folderIcon, taskIcon } from '../hooks/icons'
import type { IconSet } from '../hooks/icons'

const ROOT = 'C:\\projekt\\demo'

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

const TODO = '# TODO\n\n## [x] Klart steg\n\n## [ ] Pågående steg\n\n## [ ] Senare steg\n'

function fakeProject(on: Parameters<Parameters<typeof test>[1]>[1]) {
  on('session.cwd', () => ({ value: ROOT }))
  on('session.root', () => ({ value: ROOT }))
  on('fs.list', (_, e) => ({
    value: /[\\/]src$/.test(e.path)
      ? [entry('main.ts', 'file'), entry('logo.png', 'file')]
      : [entry('src', 'dir'), entry('package.json', 'file'), entry('README.md', 'file'), entry('LICENSE', 'file'), entry('okänd.xyz', 'file')],
  }))
  on('fs.read', () => ({ value: TODO }))
}

test('varje ikon är ett enda smalt tecken, inga emoji', () => {
  const names = ['a.ts', 'a.json', 'a.md', 'a.png', 'LICENSE', 'a.xyz', '.gitignore', '.env.local', 'Dockerfile']
  for (const set of ['unicode', 'nerdfont'] as IconSet[]) {
    const glyphs = [
      ...names.map(name => fileIcon(name, set)?.glyph),
      folderIcon(false, set)?.glyph,
      folderIcon(true, set)?.glyph,
      taskIcon('done', set).glyph,
      taskIcon('current', set).glyph,
      taskIcon('open', set).glyph,
    ]
    for (const glyph of glyphs) {
      // En UTF-16-enhet: inget surrogatpar (där de flesta emoji ligger) och ingen
      // variantväljare som ber om emojiform.
      expect(glyph).toHaveLength(1)
      expect(/\p{Extended_Pictographic}/u.test(glyph!)).toBe(false)
    }
  }
})

test('filtyper känns igen på ändelse och namn', () => {
  expect(fileIcon('main.tsx', 'unicode')).toEqual({ glyph: 'λ', color: 'yellow' })
  expect(fileIcon('package.json', 'unicode')).toEqual({ glyph: '≡', color: 'magenta' })
  expect(fileIcon('.env.local', 'unicode')?.glyph).toBe('≡')
  expect(fileIcon('README.md', 'unicode')).toEqual({ glyph: '¶', color: 'cyan' })
  expect(fileIcon('logo.PNG', 'unicode')?.glyph).toBe('◊')
  expect(fileIcon('LICENSE', 'unicode')?.glyph).toBe('§')
  expect(fileIcon('bun.lock', 'unicode')?.glyph).toBe('§')
  // Okänd typ: ingen färg, och ingen nyckel som är undefined.
  expect(fileIcon('okänd.xyz', 'unicode')).toEqual({ glyph: '∙' })
  expect(fileIcon('a.ts', 'none')).toBeUndefined()
})

test('i terminalen: ikoner framför mappar, filer och uppgifter', async ($, on) => {
  fakeProject(on)
  const ui = await $.ui.mount(PANE)

  expect(await ui.find({ in: 'tree', text: /▸ ■ src\// })).toBeDefined()
  expect(await ui.find({ in: 'tree', text: /≡ package\.json/ })).toBeDefined()
  expect(await ui.find({ in: 'tree', text: /¶ README\.md/ })).toBeDefined()
  expect(await ui.find({ in: 'tree', text: /§ LICENSE/ })).toBeDefined()
  expect(await ui.find({ in: 'tree', text: /∙ okänd\.xyz/ })).toBeDefined()

  // Utfälld mapp: öppen ikon, och filerna under den har sina egna.
  await ui.pointer({ in: 'tree', type: 'down', x: 3, y: 0, button: 'left' })
  expect(await ui.find({ in: 'tree', text: /▾ □ src\// })).toBeDefined()
  expect(await ui.find({ in: 'tree', text: /λ main\.ts/ })).toBeDefined()
  expect(await ui.find({ in: 'tree', text: /◊ logo\.png/ })).toBeDefined()
  // Rad 1 är fortfarande main.ts: ikonerna lägger inga rader.
  await ui.pointer({ in: 'tree', type: 'down', x: 3, y: 1, button: 'right' })
  expect(await ui.find({ in: 'tree', text: /Infoga sökväg/ })).toBeDefined()
  await ui.pointer({ in: 'tree', type: 'down', x: 45, y: 9, button: 'left' })

  expect(await ui.find({ in: 'tasks', text: /√ Klart steg/ })).toBeDefined()
  expect(await ui.find({ in: 'tasks', text: /► Pågående steg/ })).toBeDefined()
  expect(await ui.find({ in: 'tasks', text: /○ Senare steg/ })).toBeDefined()

  await ui.unmount()
})

test('inställningen nerdfont ger Nerd Font-ikoner', { options: { icons: 'nerdfont' } }, async ($, on) => {
  fakeProject(on)
  const ui = await $.ui.mount(PANE)

  expect(await ui.find({ in: 'tree', text: /\uf07b src\// })).toBeDefined()
  expect(await ui.find({ in: 'tasks', text: /\uf058 Klart steg/ })).toBeDefined()

  await ui.unmount()
})

test('inställningen none: inga ikoner, uppgifterna märks med [ ], [>] och [x]', { options: { icons: 'none' } }, async ($, on) => {
  fakeProject(on)
  const ui = await $.ui.mount(PANE)

  expect(await ui.find({ in: 'tree', text: /▸ src\// })).toBeDefined()
  expect(await ui.find({ in: 'tree', text: /─ package\.json/ })).toBeDefined()
  expect(await ui.find({ in: 'tasks', text: /\[x\] Klart steg/ })).toBeDefined()
  expect(await ui.find({ in: 'tasks', text: /\[>\] Pågående steg/ })).toBeDefined()
  expect(await ui.find({ in: 'tasks', text: /\[ \] Senare steg/ })).toBeDefined()

  await ui.unmount()
})

test('utan Client (vscode-ytan): samma ikoner på knapparna', async ($, on) => {
  fakeProject(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode' })

  expect((await ui.find({ key: `dir:${ROOT}\\src` }))?.text).toContain('■ src/')
  expect((await ui.find({ key: 'task:2' }))?.text).toContain('► Pågående steg')

  await ui.unmount()
})
