// Live end-to-end probe of the Yahoo! Auctions production code paths.
import { searchYahooAuctions } from '../src/providers/yahoo-auction/search.ts';
import { fetchYahooAuctionItem } from '../src/providers/yahoo-auction/item.ts';
import { getYahooAuctionCategories } from '../src/providers/yahoo-auction/categories.ts';

function line(label: string, value: unknown) {
  console.log(`  ${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
}

async function main() {
  console.log('== keyword iPhone ==');
  const kw = await searchYahooAuctions({ keyword: 'iPhone', limit: 5 });
  line('count', kw.items.length);
  line('total', kw.total_count);
  line('sample', kw.items.slice(0, 3).map(i => `${i.current_price}円 bids=${i.bid_count} ${i.name.slice(0, 14)}`));

  console.log('== Japanese keyword 地デジチューナー ==');
  const jp = await searchYahooAuctions({ keyword: '地デジチューナー', limit: 3 });
  line('count', jp.items.length);
  line('sample', jp.items.slice(0, 2).map(i => i.name.slice(0, 22)));

  console.log('== current price 10000-20000 ==');
  const pr = await searchYahooAuctions({ keyword: 'iPhone', price_min: 10000, price_max: 20000, limit: 40 });
  line('count', pr.items.length);
  line('outOfRange', pr.items.filter(i => i.current_price < 10000 || i.current_price > 20000).map(i => i.current_price));

  console.log('== has_buy_now ==');
  const bn = await searchYahooAuctions({ keyword: 'iPhone', has_buy_now: true, limit: 30 });
  line('count', bn.items.length);
  line('withoutBuyNow', bn.items.filter(i => !i.has_buy_now).length);

  console.log('== exclude keyword ケース ==');
  const ex = await searchYahooAuctions({ keyword: 'iPhone', exclude_keyword: 'ケース', limit: 30 });
  line('count', ex.items.length);
  line('leaked', ex.items.filter(i => i.name.includes('ケース')).length);

  console.log('== category 23632 only (no keyword) ==');
  const cat = await searchYahooAuctions({ category_id: 23632, limit: 20 });
  line('count', cat.items.length);
  line('inCategory', `${cat.items.filter(i => i.category.some(c => c.id === '23632')).length}/${cat.items.length}`);

  console.log('== keyword + unrelated category (iPhone in 本、雑誌=21600) ==');
  const kc = await searchYahooAuctions({ keyword: 'iPhone', category_id: 21600, limit: 20 });
  line('count', kc.items.length);
  line('allInCategory', kc.items.every(i => i.category.some(c => c.id === '21600')));

  console.log('== sort current_price asc/desc ==');
  const sa = await searchYahooAuctions({ keyword: 'Nintendo Switch', sort: 'current_price', order: 'asc', limit: 30 });
  const ap = sa.items.map(i => i.current_price);
  line('asc_ok', ap.every((p, i) => i === 0 || p >= ap[i - 1]!));
  line('asc_head', ap.slice(0, 6));
  const sd = await searchYahooAuctions({ keyword: 'Nintendo Switch', sort: 'current_price', order: 'desc', limit: 30 });
  const dp = sd.items.map(i => i.current_price);
  line('desc_ok', dp.every((p, i) => i === 0 || p <= dp[i - 1]!));
  line('desc_head', dp.slice(0, 4));

  console.log('== sort end_time asc (ending soon) ==');
  const et = await searchYahooAuctions({ keyword: 'iPhone', sort: 'end_time', order: 'asc', limit: 30 });
  const times = et.items.map(i => Date.parse(i.end_time ?? ''));
  line('end_asc_ok', times.every((t, i) => i === 0 || t >= times[i - 1]!));
  line('first_remaining_sec', et.items[0]?.remaining_seconds);

  console.log('== condition NEW ==');
  const cond = await searchYahooAuctions({ keyword: 'iPhone', condition: 'NEW', limit: 20 });
  line('conditions', [...new Set(cond.items.map(i => i.condition_id))]);

  console.log('== free shipping + prefecture 13 ==');
  const fs = await searchYahooAuctions({ keyword: 'iPhone', free_shipping: true, shipping_from_area: 13, limit: 20 });
  line('count', fs.items.length);
  line('allFree', fs.items.every(i => i.is_free_shipping === true));
  line('allTokyo', fs.items.every(i => i.shipping_from_prefecture_code === '13'));

  console.log('== min_bids post-filter ==');
  const mb = await searchYahooAuctions({ keyword: 'iPhone', min_bids: 1, sort: 'bid_count', order: 'desc', limit: 20 });
  line('count', mb.items.length);
  line('allHaveBids', mb.items.every(i => (i.bid_count ?? 0) >= 1));

  console.log('== pagination (offset) ==');
  const p0 = await searchYahooAuctions({ keyword: 'iPhone', limit: 5, offset: 0, sort: 'end_time', order: 'asc' });
  const p1 = await searchYahooAuctions({ keyword: 'iPhone', limit: 5, offset: 5, sort: 'end_time', order: 'asc' });
  line('p0_next_offset', p0.next_offset);
  line('overlap', p0.items.filter(a => p1.items.some(b => b.id === a.id)).length);

  console.log('== item detail by ID and URL ==');
  const target = mb.items[0] ?? kw.items[0];
  if (target) {
    const byId = await fetchYahooAuctionItem(target.id);
    line('id/status', `${byId.id} / ${byId.status}`);
    line('prices', `current=${byId.current_price} start=${byId.starting_price} buyNow=${byId.buy_now_price}`);
    line('bids/bidders/watch', `${byId.bid_count}/${byId.bidders_count}/${byId.watch_count}`);
    line('times', `${byId.start_time} -> ${byId.end_time} remaining=${byId.remaining_seconds}s`);
    line('desc_len', byId.description?.length ?? null);
    line('photos/cats', `${byId.photos.length}/${byId.category.map(c => c.id).join('>')}`);
    line('condition', byId.condition_name);
    line('shipping', `${byId.shipping_payer} | ${byId.shipping_methods.join(',')}`);
    line('seller', `${byId.seller?.id} ${byId.seller?.good_rating_ratio} good=${byId.seller?.good_rating_count} bad=${byId.seller?.bad_rating_count}`);
    const byUrl = await fetchYahooAuctionItem(`https://auctions.yahoo.co.jp/jp/auction/${target.id}`);
    line('url_matches_id', byId.id === byUrl.id && byId.name === byUrl.name);
  }

  console.log('== categories ==');
  const roots = await getYahooAuctionCategories({ root_only: true });
  line('root_count', roots.length);
  line('roots', roots.slice(0, 4).map(r => `${r.id}:${r.name}`));
  const lvl2 = await getYahooAuctionCategories({ parent_id: 23632 });
  line('children_23632', lvl2.slice(0, 4).map(r => `${r.id}:${r.name}`));
  const lvl3 = await getYahooAuctionCategories({ parent_id: 23960 });
  line('children_23960', lvl3.slice(0, 4).map(r => `${r.id}:${r.name}`));
  const lvl4 = await getYahooAuctionCategories({ parent_id: 2084317598 });
  line('children_2084317598', lvl4.map(r => `${r.id}:${r.name}(leaf=${r.isLeaf})`));
  const kwCat = await getYahooAuctionCategories({ keyword: 'スマートフォン' });
  line('keyword_matches', kwCat.slice(0, 4).map(r => `${r.id}:${r.pathNames.join('/')}`));
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
