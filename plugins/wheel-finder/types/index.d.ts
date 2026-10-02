export type Kind = 'mcp' | 'skill' | 'plugin' | 'project' | 'other'

export type Suggestion = {
  name: string
  href: string
  kind: Kind
  why: string
  stars?: string
  updated?: string
  license?: string
}

declare module 'claude-code' {
  interface PluginState {
    'wheel-finder': { items: Suggestion[]; page: number }
  }
}
