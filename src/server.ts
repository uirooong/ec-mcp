import {
  Server
} from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { getProvider } from './provider-registry.ts';
import { yahooFleamarketProvider } from './providers/yahoo/index.ts';
import { yahooAuctionProvider } from './providers/yahoo-auction/index.ts';
import { MarketplaceError } from './errors.ts';
import type { SearchParams } from './types.ts';
import type { CategoriesOptions } from './types.ts';
import type { YahooCategoriesOptions, YahooSearchParams } from './providers/yahoo/types.ts';
import type {
  YahooAuctionCategoriesOptions,
  YahooAuctionSearchParams
} from './providers/yahoo-auction/types.ts';

export function createServer(): Server {
  const server = new Server(
    { name: 'ec-mcp', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'mercari_search',
        description: 'Search Mercari items using the public web search filters.',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: 'Search keyword.' },
            exclude_keyword: { type: 'string', description: 'Words to exclude; space-separated words are each excluded from item names.' },
            category_id: { oneOf: [{ type: 'integer' }, { type: 'array', items: { type: 'integer' } }, { type: 'string', pattern: '^\\d+(,\\d+)*$' }] },
            size_id: { oneOf: [{ type: 'integer' }, { type: 'array', items: { type: 'integer' } }, { type: 'string', pattern: '^\\d+(,\\d+)*$' }] },
            brand_id: { oneOf: [{ type: 'integer' }, { type: 'array', items: { type: 'integer' } }, { type: 'string', pattern: '^\\d+(,\\d+)*$' }] },
            seller_id: { oneOf: [{ type: 'integer' }, { type: 'array', items: { type: 'integer' } }, { type: 'string', pattern: '^\\d+(,\\d+)*$' }] },
            price_min: { type: 'integer', minimum: 0 },
            price_max: { type: 'integer', minimum: 0 },
            item_condition_id: { oneOf: [{ type: 'integer' }, { type: 'array', items: { type: 'integer' } }, { type: 'string', pattern: '^\\d+(,\\d+)*$' }] },
            shipping_payer_id: { oneOf: [{ type: 'integer' }, { type: 'array', items: { type: 'integer' } }, { type: 'string', pattern: '^\\d+(,\\d+)*$' }] },
            shipping_from_area: { oneOf: [{ type: 'integer' }, { type: 'array', items: { type: 'integer' } }, { type: 'string', pattern: '^\\d+(,\\d+)*$' }] },
            status: { type: ['array', 'string'], items: { enum: ['on_sale', 'trading', 'sold_out'] } },
            shipping_method: { type: ['array', 'string'], items: { enum: ['anonymous', 'japan_post', 'no_option'] } },
            color_id: { oneOf: [{ type: 'integer' }, { type: 'array', items: { type: 'integer' } }, { type: 'string', pattern: '^\\d+(,\\d+)*$' }] },
            item_types: { type: ['array', 'string'], items: { enum: ['beyond', 'mercari'] } },
            has_coupon: { type: 'boolean' },
            created_after_date: { type: 'string', format: 'date' },
            sort: { enum: ['created_time', 'num_likes', 'score', 'price'] },
            order: { enum: ['asc', 'desc'] },
            limit: { type: 'integer', minimum: 1, maximum: 120 },
            page_token: { type: 'string' },
            sku_ids: { type: ['array', 'string'], items: { type: 'string' } },
            show_product_list: { type: 'boolean' }
          }
        }
      },
      {
        name: 'mercari_get_item',
        description: 'Get normalized Mercari item details from an m-prefixed ID or item URL.',
        inputSchema: {
          type: 'object',
          required: ['item'],
          properties: {
            item: { type: 'string', minLength: 1 }
          }
        }
      },
      {
        name: 'mercari_get_categories',
        description: 'Get and filter the Mercari category tree to identify category IDs.',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string' },
            parent_id: { type: ['integer', 'string'], pattern: '^\\d+$' },
            root_only: { type: 'boolean', default: false }
          }
        }
      },
      {
        name: 'yahoo_fleamarket_search',
        description: 'Search Yahoo! Flea Market (Yahoo!フリマ) listings via its structured JSON API.',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: 'Search keyword (UTF-8, Japanese supported).' },
            exclude_keyword: { type: 'string', description: 'Words to exclude; applied natively via query and re-checked against titles.' },
            category_id: { oneOf: [{ type: 'integer' }, { type: 'array', items: { type: 'integer' } }, { type: 'string', pattern: '^\\d+(,\\d+)*$' }], description: 'Yahoo genre category id(s).' },
            price_min: { type: 'integer', minimum: 0 },
            price_max: { type: 'integer', minimum: 0 },
            condition: { type: ['array', 'string'], description: 'Item condition code(s): new, used10, used20, used40, used60.' },
            status: { enum: ['on_sale', 'sold_out'], description: 'Listing status; defaults to on_sale.' },
            seller_id: { type: 'string', description: 'Restrict to a seller id.' },
            sort: { enum: ['price'], description: 'Sort key; omit for relevance.' },
            order: { enum: ['asc', 'desc'] },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            offset: { type: 'integer', minimum: 0 }
          }
        }
      },
      {
        name: 'yahoo_fleamarket_get_item',
        description: 'Get normalized Yahoo! Flea Market item details (description, photos, condition, delivery, seller) from an item ID or item URL.',
        inputSchema: {
          type: 'object',
          required: ['item'],
          properties: {
            item: { type: 'string', minLength: 1 }
          }
        }
      },
      {
        name: 'yahoo_fleamarket_get_categories',
        description: 'Get and filter the Yahoo! Flea Market category tree. Use parent_id to list children, keyword to search all levels.',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string' },
            parent_id: { type: ['integer', 'string'], pattern: '^\\d+$' },
            root_only: { type: 'boolean', default: false }
          }
        }
      },
      {
        name: 'yahoo_fleamarket_get_seller',
        description: 'Get a Yahoo! Flea Market seller profile (rating, nickname) via the public users API.',
        inputSchema: {
          type: 'object',
          required: ['seller_id'],
          properties: {
            seller_id: { type: 'string', minLength: 1 }
          }
        }
      },
      {
        name: 'yahoo_auction_search',
        description: 'Search Yahoo! Auctions (ヤフオク!) listings with auction-aware filters (current price, buy-it-now, bids, end time).',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: 'Search keyword (UTF-8, Japanese supported). Required unless category_id is given.' },
            exclude_keyword: { type: 'string', description: 'Words to exclude; applied natively in the query and re-checked against titles.' },
            category_id: { oneOf: [{ type: 'integer' }, { type: 'array', items: { type: 'integer' } }, { type: 'string', pattern: '^\d+(,\d+)*$' }], description: 'Yahoo! Auctions category id(s).' },
            price_min: { type: 'integer', minimum: 0, description: 'Minimum current price (JPY).' },
            price_max: { type: 'integer', minimum: 0, description: 'Maximum current price (JPY).' },
            buy_now_price_min: { type: 'integer', minimum: 0 },
            buy_now_price_max: { type: 'integer', minimum: 0 },
            has_buy_now: { type: 'boolean', description: 'Only auctions offering Buy It Now.' },
            condition: { type: ['array', 'string'], description: 'Condition code(s): NEW, USED10, USED20, USED40, USED60.' },
            status: { enum: ['open', 'closed'], description: 'Auction status; defaults to open.' },
            free_shipping: { type: 'boolean' },
            shipping_from_area: { oneOf: [{ type: 'integer' }, { type: 'array', items: { type: 'integer' } }, { type: 'string' }], description: 'Prefecture code(s), e.g. 13 for Tokyo.' },
            min_bids: { type: 'integer', minimum: 0, description: 'MCP-side filter over the returned JSON.' },
            max_bids: { type: 'integer', minimum: 0, description: 'MCP-side filter over the returned JSON.' },
            ending_within_minutes: { type: 'integer', minimum: 1, description: 'MCP-side filter: auctions ending within N minutes.' },
            sort: { enum: ['current_price', 'buy_now_price', 'start_price', 'end_time', 'bid_count', 'watch_count'] },
            order: { enum: ['asc', 'desc'] },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            offset: { type: 'integer', minimum: 0 }
          }
        }
      },
      {
        name: 'yahoo_auction_get_item',
        description: 'Get normalized Yahoo! Auctions detail (current/starting/buy-now price, bids, end time, shipping, seller) from an auction ID or URL.',
        inputSchema: {
          type: 'object',
          required: ['item'],
          properties: {
            item: { type: 'string', minLength: 1 }
          }
        }
      },
      {
        name: 'yahoo_auction_get_categories',
        description: 'Get and filter the Yahoo! Auctions category tree: children by parent_id, top genres via root_only, or search all levels by keyword.',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string' },
            parent_id: { type: ['integer', 'string'], pattern: '^\d+$' },
            root_only: { type: 'boolean', default: false }
          }
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;
      switch (request.params.name) {
        case 'mercari_search': {
          const result = await getProvider('mercari').search(args as SearchParams);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'mercari_get_item': {
          if (typeof args.item !== 'string') {
            throw new MarketplaceError('MCP_INVALID_ARGUMENT', 'item must be a string');
          }
          const result = await getProvider('mercari').getItem(args.item);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'mercari_get_categories': {
          const categoriesOptions: CategoriesOptions = {};
          if (typeof args.keyword === 'string') categoriesOptions.keyword = args.keyword;
          if (args.parent_id !== undefined) categoriesOptions.parent_id = Number(args.parent_id);
          if (args.root_only !== undefined) categoriesOptions.root_only = Boolean(args.root_only);
          const result = await getProvider('mercari').getCategories(categoriesOptions);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'yahoo_fleamarket_search': {
          const result = await yahooFleamarketProvider.search(args as YahooSearchParams);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'yahoo_fleamarket_get_item': {
          if (typeof args.item !== 'string') {
            throw new MarketplaceError('MCP_INVALID_ARGUMENT', 'item must be a string');
          }
          const result = await yahooFleamarketProvider.getItem(args.item);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'yahoo_fleamarket_get_categories': {
          const options: YahooCategoriesOptions = {};
          if (typeof args.keyword === 'string') options.keyword = args.keyword;
          if (args.parent_id !== undefined) options.parent_id = Number(args.parent_id);
          if (args.root_only !== undefined) options.root_only = Boolean(args.root_only);
          const result = await yahooFleamarketProvider.getCategories(options);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'yahoo_fleamarket_get_seller': {
          if (typeof args.seller_id !== 'string') {
            throw new MarketplaceError('MCP_INVALID_ARGUMENT', 'seller_id must be a string');
          }
          const result = await yahooFleamarketProvider.getSeller(args.seller_id);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'yahoo_auction_search': {
          const result = await yahooAuctionProvider.search(args as YahooAuctionSearchParams);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'yahoo_auction_get_item': {
          if (typeof args.item !== 'string') {
            throw new MarketplaceError('MCP_INVALID_ARGUMENT', 'item must be a string');
          }
          const result = await yahooAuctionProvider.getItem(args.item);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        case 'yahoo_auction_get_categories': {
          const options: YahooAuctionCategoriesOptions = {};
          if (typeof args.keyword === 'string') options.keyword = args.keyword;
          if (args.parent_id !== undefined) options.parent_id = String(args.parent_id);
          if (args.root_only !== undefined) options.root_only = Boolean(args.root_only);
          const result = await yahooAuctionProvider.getCategories(options);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        default:
          throw new McpError(ErrorCode.InvalidRequest, `Unknown tool: ${request.params.name}`);
      }
    } catch (error) {
      if (error instanceof MarketplaceError) {
        return {
          isError: true,
          content: [{ type: 'text', text: error.message }],
          structuredContent: { code: error.code, details: error.details ?? null }
        };
      }
      const code = error instanceof McpError ? error.code : ErrorCode.InternalError;
      throw new McpError(code, error instanceof Error ? error.message : String(error));
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));
  server.setRequestHandler(ReadResourceRequestSchema, async () => ({ contents: [] }));

  return server;
}
