# sidebar

En sidopanel för Claude Code som hjälper till med vardagliga uppgifter. Den
visas bredvid chatten och har två halvor:

- **Filträd i terminalstil** för agentens aktuella katalog. Trädet följer med
  när agenten byter katalog (`cd`).
- **Projektets `TODO.md`**, listan över de steg som återstår. Agenten skriver
  in stegen, arbetar uppifrån och ned och bockar av dem när de är klara. Du
  följer arbetet i panelen och lägger till uppgifter åt agenten.

## Installera

Vid prompten i en terminalsession:

```
/plugin install sidebar --marketplace ZeldaStudio49281/claude-cli-plugin
```

Svara `y` på frågan om att lägga till marknadsplatsen och välj sedan scope
(användarscope står först).

Från ett skal:

```
claude plugin install sidebar --marketplace ZeldaStudio49281/claude-cli-plugin
```

I skrivbordsappen, där `/plugin` inte går att köra: klicka på + bredvid
promptrutan, sedan Plugins, Add marketplace med
`ZeldaStudio49281/claude-cli-plugin`, och sedan Add plugin.

Panelen öppnas när sessionen startar. Öppna den igen med `/sidebar`. I
terminalen dockas den bredvid chatten i helskärmsläget från ungefär 110
kolumner.

## Använda

### Filträdet

| Gör | Händer |
| --- | --- |
| Klick på en mapp | Fäller ut eller ihop den |
| Klick på en fil | Öppnar filen i VS Code (kräver kommandot `code`) |
| Högerklick på en fil | Meny: **Öppna i VS Code**, **Infoga sökväg** (skriver sökvägen i prompten) |
| Högerklick på en mapp eller tom yta | Meny: **Uppdatera**, **Fäll ihop alla** |
| `↻` | Läser om trädet |

`.git` och `node_modules` visas inte.

### Uppgiftslistan (`TODO.md`)

| Gör | Händer |
| --- | --- |
| Klick på en uppgift | Fäller ut eller ihop dess innehåll |
| Högerklick på en uppgift | Meny: **▶ Starta** (ber agenten börja med uppgiften), **✕ Ta bort** |
| Fältet längst ned | Lägger till en uppgift åt agenten |

Det är bara agenten som bockar av uppgifter. Att ta bort en uppgift stryker
den ur filen, och den markeras inte som klar. I VS Code och på mobilen, där
panelen inte får högerklick, har varje uppgift knapparna `▶` och `✕`.

`TODO.md` ligger i projektroten och har det här formatet:

```markdown
# TODO

## [ ] Kort rubrik
Detaljer om steget (markdown).

## [x] Ett klart steg
```

### För agenten

Modden ger agenten tre verktyg: `todo_add`, `todo_done` och `todo_list`. De
öppna uppgifterna följer också med varje prompt som kontext. Lägg gärna en
konvention i `~/.claude/CLAUDE.md` om att alltid använda `TODO.md` för de
återstående stegen, så att agenten planerar och arbetar i listan.

## Utveckla

Kör en session med modden laddad direkt från mappen:

```
claude --plugin-dir .
```

Kontrollera och testa:

```
claude plugin validate .
claude plugin test .
```

## Licens

MIT, se [LICENSE](LICENSE).
