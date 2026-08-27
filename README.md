# ec-mcp

Lightweight Model Context Protocol server for Japanese marketplaces. Mercari is implemented first.

## Install / Run

```bash
bun install
```

## Run

```bash
bun src/index.ts
```

The MCP Streamable HTTP endpoint is `http://localhost:3001/mcp`. `PORT` is configurable.

```bash
curl http://localhost:3001/health
```

## Development

```bash
bun test
bun run typecheck
bun run smoke
```

## Tools

- `mercari_search`: searches products with Mercari's public search filters.
- `mercari_get_item`: accepts an item ID (`m12345678901`) or full product URL.
- `mercari_get_categories`: filters Mercari's category master by keyword, parent ID, or root level.

The search tool tries Mercari's signed internal API first. If that endpoint reports zero results for a keyword or rejects access, it falls back to Mercari's server-rendered crawler HTML. Item detail parsing also uses server-rendered product data.
