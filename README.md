# ec-mcp

Lightweight Model Context Protocol server for Japanese marketplaces. Mercari is implemented first.

## Install / Build

```bash
npm install
npm run build
```

Register this command as a stdio MCP server:

```bash
node dist/index.js
```

During development:

```bash
npm run dev
```

## Tools

- `mercari_search`: searches products with Mercari's public search filters.
- `mercari_get_item`: accepts an item ID (`m12345678901`) or full product URL.
- `mercari_get_categories`: filters Mercari's category master by keyword, parent ID, or root level.

The search tool tries Mercari's signed internal API first. If that endpoint reports zero results for a keyword or rejects access, it falls back to Mercari's server-rendered crawler HTML. Item detail parsing also uses server-rendered product data.
