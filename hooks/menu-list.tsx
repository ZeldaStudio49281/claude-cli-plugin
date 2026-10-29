import type { ClientModule } from 'claude-code'

// En region av rader med en flytande högerklicksmeny. Vänsterklick på en rad
// skickar radens `left`; högerklick öppnar menyn där man klickade, med radens
// `menu`, eller regionens `menu` på en tom yta. Ett val skickas till pluginet
// som `{ action, id }`; regionen gör ingenting själv.

export type MenuItem = { action: string; label: string; color?: string }

export type RowPart = { text: string; color?: string; dim?: boolean; bold?: boolean; strike?: boolean }

export type MenuRow = {
  // Vad raden pekar ut, för pluginet: en uppgifts nummer, en mapps sökväg.
  id: string
  parts: RowPart[]
  left?: string
  menu?: MenuItem[]
}

export type MenuListProps = { rows: MenuRow[]; menu?: MenuItem[] }

export type MenuListPost = { action: string; id: string }

type OpenMenu = { x: number; y: number; id: string; items: MenuItem[] }
type State = { menu?: OpenMenu }

// Ramen tar en kolumn och en rad på varje sida.
const menuWidth = (items: MenuItem[]) => Math.max(...items.map(item => item.label.length)) + 4

// Var menyn ritas: där man klickade, flyttad in i regionen när den annars
// skulle sticka ut (0 innan regionen har lagts ut: då ingen flytt).
function placeMenu(menu: OpenMenu, columns: number, rows: number) {
  const width = menuWidth(menu.items)
  const height = menu.items.length + 2
  const left = columns > 0 ? Math.max(0, Math.min(menu.x, columns - width)) : menu.x
  const top = rows > 0 ? Math.max(0, Math.min(menu.y, rows - height)) : menu.y

  return { left, top, width, height }
}

const MenuList: ClientModule<MenuListProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const { rows } = props
  const menu = surface.state?.menu
  const placed = menu && placeMenu(menu, surface.columns, surface.rows)

  // Lyssnaren byts ut vid varje ritning, så den läser alltid det senaste läget.
  surface.onPointer(event => {
    if (event.type !== 'down') return
    if (menu && placed) {
      // Med menyn öppen stänger varje klick den; ett klick på ett val utför det.
      const index = event.y - placed.top - 1
      const isInside =
        event.x >= placed.left && event.x < placed.left + placed.width &&
        index >= 0 && index < menu.items.length
      const item = isInside && event.button === 'left' ? menu.items[index] : undefined
      surface.setState({})
      if (item) surface.post({ action: item.action, id: menu.id } satisfies MenuListPost)
      return
    }
    const row = rows[event.y]
    if (event.button === 'right') {
      const items = row?.menu ?? props.menu ?? []
      if (items.length > 0) {
        surface.setState({ menu: { x: event.x, y: event.y, id: row?.id ?? '', items } })
      }
      return
    }
    if (event.button === 'left' && row?.left) {
      surface.post({ action: row.left, id: row.id } satisfies MenuListPost)
    }
  })

  return (
    <Box flexDirection="column" flexGrow={1}>
      {rows.map(row => (
        <Text wrap="truncate-end">
          {row.parts.map(part => (
            <Text
              color={part.color}
              dimColor={part.dim}
              strikethrough={part.strike}
              weight={part.bold ? 'bold' : 'regular'}
            >
              {part.text}
            </Text>
          ))}
        </Text>
      ))}
      {menu && placed && (
        <Box
          position="absolute"
          top={placed.top}
          left={placed.left}
          width={placed.width}
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          backgroundColor="black"
        >
          {menu.items.map(item => (
            <Text color={item.color} wrap="truncate-end">
              {` ${item.label}`}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  )
}

export default MenuList
