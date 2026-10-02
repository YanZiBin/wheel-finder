# wheel-finder

Don't reinvent the wheel. A [Claude Code mod](https://claude.dev/blog/getting-started-with-claude-code-mods/) that finds existing projects before you rebuild them.

A mod is code that runs inside your Claude Code session with the same access Claude Code has. Read the source before you install it; this one is a single short file, `plugins/wheel-finder/hooks/register.tsx`.

## Install

```
/plugin marketplace add YanZiBin/wheel-finder
/plugin install wheel-finder@wheel-finder
/reload-plugins
```

Needs a Claude Code build that supports mods (2.1.287 or later). The mod API can change between releases.

## What it does

Stops you rebuilding what already exists. When the conversation is about to build something, or needs a capability that a GitHub project, MCP server, skill or plugin might already provide, the model searches for it (for example with `gh search repos`) and puts the best one to three candidates in a small pager above the prompt.

Each candidate shows a kind tag (Project, MCP, Skill, Plugin, Other), the name as a link, stars, last update, license, and a one-line reason. `‹ 1/3 ›` pages through them and `×` clears the list.

- It does not search by itself. It registers one tool, `mcp__wheel-finder__set_links`, and its description tells the model when to search and to call it. The model decides, so how often it fires depends on how well the model follows that description.
- The mod answers calls to its own tool, `mcp__wheel-finder__set_links`, itself: it stores the list and returns a short status line. It does not stand in for any other tool.
- The tool never installs or runs anything; it only displays links.
- Links must be clean `https` URLs; anything else is dropped before drawing.
- The tool description is fixed for the whole session, so using it does not change the cached prompt prefix.
- Drawn with SVG on the desktop app; the terminal gets a plain-text fallback that I have not tested.

### 中文简介

对话里一旦要“做一个新东西”或需要某种能力，模型会先去 GitHub 搜有没有现成的项目、MCP、Skill 或插件，把最合适的 1 到 3 个放在输入框上方，可翻页、可点开、可清除。它只显示链接，不会安装或运行任何东西。

## License

MIT
