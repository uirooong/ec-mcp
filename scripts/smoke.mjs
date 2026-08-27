import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.env.EC_MCP_URL ?? 'http://localhost:3001/mcp';
const transport = new StreamableHTTPClientTransport(new URL(url));
const client = new Client({ name: 'ec-mcp-smoke', version: '0.1.0' });

await client.connect(transport);
const tools = await client.listTools();
console.log('tools=' + tools.tools.map(tool => tool.name).join(','));

const search = await client.callTool({
  name: 'mercari_search',
  arguments: { keyword: 'ポケモン', limit: 3 }
});
console.log(`search_is_error=${Boolean(search.isError)}`);
console.log(`search_source_matches=${/"source"\s*:\s*"(api|html)"/.test(String(search.content?.[0]?.text ?? ''))}`);

const categories = await client.callTool({
  name: 'mercari_get_categories',
  arguments: { keyword: 'ポケモン' }
});
console.log(`categories_is_error=${Boolean(categories.isError)}`);

await client.close();
process.exit(0);
