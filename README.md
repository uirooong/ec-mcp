# ec-mcp

Lightweight Model Context Protocol server for Japanese marketplaces (Mercari and Yahoo! Flea Market). Every provider talks to structured JSON HTTP APIs only — no HTML scraping.

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

### Mercari

- `mercari_search`: searches products with Mercari's public search filters (classic and Mercari Shops / beyond items).
- `mercari_get_item`: accepts an item ID (`m12345678901`) or full product URL.
- `mercari_get_categories`: filters Mercari's category master by keyword, parent ID, or root level.

Mercari uses the signed internal REST API (`api.mercari.jp`) with a per-request anonymous DPoP token. No HTML is fetched or parsed.

### Yahoo! Flea Market (Yahoo!フリマ)

- `yahoo_fleamarket_search`: searches listings. Filters: `keyword`, `exclude_keyword`, `category_id`, `price_min`/`price_max`, `condition` (`new`,`used10`..`used60`), `status` (`on_sale`/`sold_out`, defaults `on_sale`), `seller_id`, `sort` (`price`) + `order`, `limit`, `offset`.
- `yahoo_fleamarket_get_item`: accepts an item ID or item URL; returns description, photos, category path, condition, delivery method/schedule, shipping origin, seller, like/PV counts, created time.
- `yahoo_fleamarket_get_categories`: lists children by `parent_id`, top genres via `root_only`, or searches all levels by `keyword`.
- `yahoo_fleamarket_get_seller`: returns a public seller profile (nickname, rating).

Yahoo uses the anonymous JSON APIs under `paypayfleamarket.yahoo.co.jp/api` (`/v1/search`, `/item/v2/items/{id}`, `/v1/categories/{id}/children`, `/v1/users/{id}`) — the same endpoints the web client's API modules call. No cookies, tokens, or special headers are required.

## Environment variables

- `PORT`: HTTP port (default `3001`).
- `MERCARI_DEBUG=true` / `YAHOO_FLEAMARKET_DEBUG=true`: redacted request/response trace to stderr.
- `MERCARI_INTEGRATION_TEST=true` / `YAHOO_FLEAMARKET_INTEGRATION_TEST=true`: enable the live integration tests.
