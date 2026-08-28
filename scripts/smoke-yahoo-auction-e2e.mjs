import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const url = process.env.EC_MCP_URL ?? 'http://localhost:3015/mcp';
const c = new Client({ name: 'auction-e2e', version: '0.0.0' });
await c.connect(new StreamableHTTPClientTransport(new URL(url)));
const tools = (await c.listTools()).tools.map(t => t.name);
console.log('tools=', tools.join(','));

const s = await c.callTool({ name: 'yahoo_auction_search', arguments: { keyword: 'iPhone', has_buy_now: true, price_min: 5000, price_max: 50000, sort: 'end_time', order: 'asc', limit: 5 } });
const d = JSON.parse(s.content[0].text);
console.log('search count=', d.items.length, 'total=', d.total_count, 'next_offset=', d.next_offset);
const it = d.items[0];
console.log('item0=', it.id, '| cur=', it.current_price, '| buyNow=', it.buy_now_price, '| bids=', it.bid_count, '| ends=', it.end_time, '| left=', it.remaining_seconds + 's');
console.log('inRange=', d.items.every(i => i.current_price >= 5000 && i.current_price <= 50000), '| allBuyNow=', d.items.every(i => i.has_buy_now));

const gi = await c.callTool({ name: 'yahoo_auction_get_item', arguments: { item: `https://auctions.yahoo.co.jp/jp/auction/${it.id}` } });
const det = JSON.parse(gi.content[0].text);
console.log('detail id=', det.id, '| status=', det.status, '| start=', det.starting_price, '| cur=', det.current_price, '| buyNow=', det.buy_now_price);
console.log('detail bids=', det.bid_count, '| watch=', det.watch_count, '| qty=', det.quantity, '| photos=', det.photos.length, '| descLen=', det.description?.length);
console.log('detail cats=', det.category.map(x => x.id).join('>'), '| seller=', det.seller?.good_rating_ratio);

const cats = await c.callTool({ name: 'yahoo_auction_get_categories', arguments: { parent_id: 23960 } });
console.log('cats(23960)=', JSON.parse(cats.content[0].text).slice(0,3).map(r => `${r.id}:${r.name}`).join(', '));
const kw = await c.callTool({ name: 'yahoo_auction_get_categories', arguments: { keyword: 'カメラ' } });
console.log('cats(keyword)=', JSON.parse(kw.content[0].text).slice(0,3).map(r => r.pathNames.join('/')).join(' | '));

const bad = await c.callTool({ name: 'yahoo_auction_search', arguments: { keyword: 'x', sort: 'relevance' } });
console.log('bad sort isError=', Boolean(bad.isError), 'code=', bad.structuredContent?.code);
const bad2 = await c.callTool({ name: 'yahoo_auction_get_item', arguments: { item: 'not-an-auction' } });
console.log('bad id isError=', Boolean(bad2.isError), 'code=', bad2.structuredContent?.code);
await c.close(); process.exit(0);
