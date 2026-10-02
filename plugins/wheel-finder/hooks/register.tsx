import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Kind, Suggestion } from '../types'

const TOOL = 'mcp__wheel-finder__set_links'
const items = atom({ plugin: 'wheel-finder', key: 'items' } as const, [] as Suggestion[])
const page = atom({ plugin: 'wheel-finder', key: 'page' } as const, 0)

// the description is fixed for the whole session, so registering it never changes the cached prompt prefix
const DESCRIPTION = `Show the user existing open-source options above their prompt, so they do not rebuild what already exists. The user clicks a link to read more; this tool never installs or runs anything.

When the conversation is about to build something, or needs a capability that an existing GitHub project, MCP server, skill or plugin might already provide, first search for it (for example \`gh search repos\` or web search), check what you found, then call this tool with the 1 to 3 best candidates. Replace the whole list on every call. Call it with an empty list when the topic has moved on. Do not call it when nothing relevant exists or the conversation is not about building or choosing tools.

Only use URLs you actually saw in search results or on the page; never write a URL from memory. Keep "why" to one short line about why it fits this conversation. Fill stars, updated and license only from what you saw.`

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short name, e.g. "owner/repo".' },
          url: { type: 'string', description: 'https URL you actually saw in a search result.' },
          kind: { type: 'string', enum: ['mcp', 'skill', 'plugin', 'project', 'other'] },
          why: { type: 'string', description: 'One short line: why it fits this conversation.' },
          stars: { type: 'string', description: 'e.g. "12.3k", only if seen.' },
          updated: { type: 'string', description: 'e.g. "2026-09", only if seen.' },
          license: { type: 'string', description: 'e.g. "MIT", only if seen.' }
        },
        required: ['name', 'url', 'kind', 'why']
      }
    }
  },
  required: ['items']
}

const KINDS: Kind[] = ['mcp', 'skill', 'plugin', 'project', 'other']
const KIND_COLOR: Record<Kind, string> = { mcp: 'magenta', skill: 'cyan', plugin: 'blue', project: 'green', other: 'gray' }
const KIND_HEX: Record<Kind, string> = { mcp: '#8B6CD9', skill: '#1F9EB0', plugin: '#3B7FD8', project: '#2FA062', other: '#7D7D78' }

// a soft pill: the colour at low opacity behind a bold sans label; an image, so it reads in light and dark
const chip = (label: string, hex: string) => {
  const w = Math.round(label.length * 7.4 + 18)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" viewBox="0 0 ${w} 20"><rect width="${w}" height="20" rx="6" fill="${hex}" fill-opacity="0.16" stroke="${hex}" stroke-opacity="0.55"/><text x="${w / 2}" y="14" text-anchor="middle" font-family="-apple-system, 'PingFang SC', 'Helvetica Neue', Arial, sans-serif" font-size="11.5" font-weight="700" letter-spacing="0.3" fill="${hex}">${label}</text></svg>`
}

const KIND_LABEL: Record<Kind, string> = { mcp: 'MCP', skill: 'Skill', plugin: 'Plugin', project: 'Project', other: 'Other' }

// a Link with a bad href refuses the whole tree, so the URL is normalised the way `new URL(href).href` spells it:
// https only, no user info, ASCII only (non-ASCII is percent-encoded by URL, a raw "@" is encoded here)
const cleanUrl = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'https:' || u.username || u.password) return null
    const href = u.href.replace(/@/g, '%40')
    return href.length <= 2048 && /^[\x21-\x7e]+$/.test(href) ? href : null
  } catch {
    return null
  }
}

// the host is shown next to any link that is not on github.com, so a look-alike address is visible before the click
const hostOf = (href: string) => {
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.tool.register({ name: 'set_links', description: DESCRIPTION, inputSchema: SCHEMA })
    return result
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    let given: unknown = e.items
    if (typeof given === 'string') {
      try {
        given = JSON.parse(given) // some models send the array as a JSON string
      } catch {
        given = []
      }
    }
    const raw = (Array.isArray(given) ? given : []).filter(x => x && typeof x === 'object') as Record<string, unknown>[]
    const clean: Suggestion[] = []
    for (const r of raw.slice(0, 3)) {
      const href = cleanUrl(r.url)
      const name = str(r.name, 80)
      if (!href || !name) continue
      const kind = KINDS.includes(r.kind as Kind) ? (r.kind as Kind) : 'other'
      clean.push({
        name,
        href,
        kind,
        why: str(r.why, 140),
        stars: str(r.stars, 12) || undefined,
        updated: str(r.updated, 12) || undefined,
        license: str(r.license, 24) || undefined
      })
    }
    await update($, items, () => clean)
    await update($, page, () => 0)
    const dropped = raw.length - clean.length
    return { result: `Shown: ${clean.length}.${dropped > 0 ? ` Dropped ${dropped} with a missing name or a URL that is not a clean https link.` : ''}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, items)
    if (e.props.hasSurvey || list.length === 0) return next(e)

    const { Box, Button, Link, Svg, Text } = $.ui.resolve(e)
    const at = Math.min(Math.max(await read($, page), 0), list.length - 1)
    const s = list[at]
    const host = hostOf(s.href)
    const meta = [host !== 'github.com' && host !== '' ? `↗ ${host}` : '', s.updated, s.license].filter(Boolean).join(' · ')
    const go = (to: number) => update($, page, () => (to + list.length) % list.length)

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box flexDirection="row" alignItems="center" justifyContent="space-between">
          <Box flexDirection="row" alignItems="center" gap={1}>
            {Svg ? (
              <Svg
                source={chip(KIND_LABEL[s.kind], KIND_HEX[s.kind])}
                alt={KIND_LABEL[s.kind]}
                width={Math.round(KIND_LABEL[s.kind].length * 7.4 + 18)}
                height={20}
              />
            ) : (
              <Text inverse bold color={KIND_COLOR[s.kind]}>{` ${KIND_LABEL[s.kind]} `}</Text>
            )}
            <Link href={s.href} label={s.name} />
            {s.stars && <Text color="#C4923A">{`★ ${s.stars}`}</Text>}
            {meta !== '' && <Text dimColor>{meta}</Text>}
          </Box>
          <Box flexDirection="row" alignItems="center" gap={1}>
            {list.length > 1 && <Button key="prev" plain dimColor label="‹" onPress={() => go(at - 1)} />}
            {list.length > 1 && <Text dimColor>{`${at + 1}/${list.length}`}</Text>}
            {list.length > 1 && <Button key="next" plain dimColor label="›" onPress={() => go(at + 1)} />}
            <Button key="clear" plain dimColor label="×" onPress={() => update($, items, () => [])} />
          </Box>
        </Box>
        {s.why !== '' && <Text dimColor wrap="truncate">{`↳ ${s.why}`}</Text>}
      </Box>
    )
  })
}
