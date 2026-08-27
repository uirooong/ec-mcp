// Live end-to-end probe of the Yahoo! Flea Market production code paths.
import { searchYahooItems } from '../src/providers/yahoo/search.ts';
import { getYahooCategories } from '../src/providers/yahoo/categories.ts';
import { fetchYahooSeller } from '../src/providers/yahoo/seller.ts';
import { fetchYahooItem } from '../src/providers/yahoo/item.ts';

function line(label: string, value: unknown) {
  console.log(`  ${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
}

async function main() {
  console.log('== keyword iPhone ==');
  const kw = await searchYahooItems({ keyword: 'iPhone', limit: 5 });
  line('count', kw.items.length);
  line('total', kw.total_count);
  line('sample', kw.items.slice(0, 3).map(i => `${i.price} ${i.status} ${i.name.slice(0, 16)}`));

  console.log('== Japanese keyword 地デジチューナー ==');
  const jp = await searchYahooItems({ keyword: '地デジチューナー', limit: 3 });
  line('count', jp.items.length);
  line('sample', jp.items.slice(0, 3).map(i => i.name.slice(0, 20)));

  console.log('== price 10000-20000 ==');
  const pr = await searchYahooItems({ keyword: 'iPhone', price_min: 10000, price_max: 20000, limit: 40 });
  line('count', pr.items.length);
  line('outOfRange', pr.items.filter(i => i.price < 10000 || i.price > 20000).map(i => i.price));

  console.log('== exclude keyword ケース ==');
  const ex = await searchYahooItems({ keyword: 'iPhone', exclude_keyword: 'ケース', limit: 30 });
  line('count', ex.items.length);
  line('leaked', ex.items.filter(i => i.name.includes('ケース')).length);

  console.log('== category 2502 only ==');
  const cat = await searchYahooItems({ category_id: 2502, keyword: 'iPhone', limit: 20 });
  const inCat = cat.items.filter(i => i.category.some(c => c.id === '2502'));
  line('count', cat.items.length);
  line('in_category_2502', `${inCat.length}/${cat.items.length}`);

  console.log('== keyword + unrelated category (iPhone in 食品=2498) ==');
  const kc = await searchYahooItems({ keyword: 'iPhone', category_id: 2498, limit: 10 });
  line('count', kc.items.length);
  line('all_in_2498', kc.items.every(i => i.category.some(c => c.id === '2498')));

  console.log('== sort price asc/desc ==');
  const sa = await searchYahooItems({ keyword: 'Nintendo Switch', sort: 'price', order: 'asc', limit: 30 });
  const ap = sa.items.map(i => i.price);
  line('asc_ok', ap.every((p, i) => i === 0 || p >= ap[i - 1]!));
  line('asc_head', ap.slice(0, 6));
  const sd = await searchYahooItems({ keyword: 'Nintendo Switch', sort: 'price', order: 'desc', limit: 30 });
  const dp = sd.items.map(i => i.price);
  line('desc_ok', dp.every((p, i) => i === 0 || p <= dp[i - 1]!));
  line('desc_head', dp.slice(0, 6));

  console.log('== condition new ==');
  const cond = await searchYahooItems({ keyword: 'iPhone', condition: 'new', limit: 20 });
  line('conditions', [...new Set(cond.items.map(i => i.condition_id))]);

  console.log('== seller filter + seller profile ==');
  const sellerId = kw.items.find(i => i.seller)?.seller?.id;
  line('sellerId', sellerId);
  if (sellerId) {
    const se = await searchYahooItems({ seller_id: sellerId, limit: 10 });
    line('seller_items', se.items.length);
    line('all_same_seller', se.items.every(i => i.seller?.id === sellerId));
    const profile = await fetchYahooSeller(sellerId);
    line('profile', `${profile.nickname} rating=${profile.rating_total} good=${profile.good_ratio}%`);
  }

  console.log('== pagination (offset) ==');
  const p0 = await searchYahooItems({ keyword: 'iPhone', limit: 5, offset: 0, sort: 'price', order: 'asc' });
  const p1 = await searchYahooItems({ keyword: 'iPhone', limit: 5, offset: 5, sort: 'price', order: 'asc' });
  const overlap = p0.items.filter(a => p1.items.some(b => b.id === a.id)).length;
  line('p0_next_offset', p0.next_offset);
  line('overlap', overlap);

  console.log('== categories ==');
  const roots = await getYahooCategories({ root_only: true });
  line('root_count', roots.length);
  line('roots', roots.slice(0, 5).map(r => `${r.id}:${r.name}`));
  const children = await getYahooCategories({ parent_id: 2502 });
  line('children_of_2502', children.slice(0, 5).map(r => `${r.id}:${r.name}`));
  const grand = await getYahooCategories({ parent_id: 38338 });
  line('children_of_38338', grand.slice(0, 5).map(r => `${r.id}:${r.name}`));

  console.log('== get_item (expect config error without YAHOO_APP_ID) ==');
  try {
    await fetchYahooItem(`https://paypayfleamarket.yahoo.co.jp/item/${kw.items[0]?.id}`);
    line('detail', 'fetched');
  } catch (e) {
    line('error_code', e instanceof Error ? e.name : String(e));
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
