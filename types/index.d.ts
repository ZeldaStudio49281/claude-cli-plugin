declare module 'claude-code' {
  interface PluginState {
    sidebar: {
      // Absoluta sökvägar till utfällda mappar i filträdet.
      expanded: Shaped<string[]>
      // Räknare som ritar om panelen när filer kan ha ändrats.
      tick: Shaped<number>
      // Rubriker på uppgifter i TODO.md vars innehåll är utfällt.
      openTasks: Shaped<string[]>
      // Agentens aktuella arbetskatalog, absolut; tom innan någon ändring setts.
      agentCwd: Shaped<string>
      // Den senast öppnade filen, absolut; tom innan någon öppnats. Markeras i trädet.
      selectedFile: Shaped<string>
    }
  }
}

// Rubrikerna på de utfällda uppgifterna.
export type OpenTaskHeaders = string[]
