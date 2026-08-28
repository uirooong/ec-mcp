# ec-mcp

Lightweight Model Context Protocol server for Japanese marketplaces (Mercari, Yahoo! Flea Market, and Yahoo! Auctions). Every provider talks to structured JSON HTTP APIs only — no HTML scraping.

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

### Yahoo! Auctions (ヤフオク!)

Read-only. No bidding, purchasing, or account operations.

- `yahoo_auction_search`: searches auctions. Requires `keyword` or `category_id`. Filters: `exclude_keyword`, `price_min`/`price_max` (current price), `buy_now_price_min`/`buy_now_price_max`, `has_buy_now`, `condition` (`NEW`,`USED10`,`USED20`,`USED40`,`USED60`), `status` (`open`/`closed`, defaults `open`), `free_shipping`, `shipping_from_area` (prefecture code), `min_bids`/`max_bids`, `ending_within_minutes`, `sort` (`current_price`, `buy_now_price`, `start_price`, `end_time`, `bid_count`, `watch_count`) + `order`, `limit` (max 100), `offset`.
- `yahoo_auction_get_item`: accepts an auction ID or URL; returns current/starting/buy-now price, bid and bidder counts, watch count, quantity, start/end time, `remaining_seconds`, photos, category path, condition, shipping, and seller ratings.
- `yahoo_auction_get_categories`: children by `parent_id` (arbitrary depth), top genres via `root_only`, or all-levels search by `keyword`.

Auction-specific notes: `price_min`/`price_max` filter the **current** price; buy-it-now has its own range plus `has_buy_now`. `min_bids`/`max_bids` and `ending_within_minutes` have no native API parameter and are applied MCP-side over the returned JSON. The API answers HTTP 423 to cookie-less clients, so the provider bootstraps an anonymous session cookie with a `HEAD` request to the site root (headers only — no page content is read) and refreshes it automatically; nothing is hardcoded and no login is involved. Avoid bursty crawling: the provider rate-limits with 423 and no `Retry-After`.

## Environment variables

- `PORT`: HTTP port (default `3001`).
- `MERCARI_DEBUG=true` / `YAHOO_FLEAMARKET_DEBUG=true` / `YAHOO_AUCTION_DEBUG=true`: redacted request/response trace to stderr.
- `MERCARI_INTEGRATION_TEST=true` / `YAHOO_FLEAMARKET_INTEGRATION_TEST=true` / `YAHOO_AUCTION_INTEGRATION_TEST=true`: enable the live integration tests.
