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
import { MarketplaceError } from './errors.ts';
import type { SearchParams } from './types.ts';
import type { CategoriesOptions } from './types.ts';

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
            exclude_keyword: { type: 'string', description: 'Words to exclude; space separated is accepted by the upstream URL filter.' },
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
