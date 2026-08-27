// Live end-to-end probe of the production code paths. Not run in CI.
import { searchMercariItems } from '../src/providers/mercari/search.ts';
import { fetchMercariItem } from '../src/providers/mercari/item.ts';
import { fetchAllCategories, filterCategories } from '../src/providers/mercari/categories.ts';

function line(label: string, value: unknown) {
  console.log(`  ${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
}

async function main() {
  // 1. keyword
  console.log('== keyword iPhone ==');
  const kw = await searchMercariItems({ keyword: 'iPhone', limit: 5 });
  line('count', kw.items.length);
  line('total', kw.total_count);
  line('sample', kw.items.slice(0, 3).map(i => `${i.price} ${i.name.slice(0, 20)}`));

  // 2. price range
  console.log('== price 10000-20000 (keyword iPhone) ==');
  const pr = await searchMercariItems({ keyword: 'iPhone', price_min: 10000, price_max: 20000, limit: 30 });
  const outOfRange = pr.items.filter(i => i.price < 10000 || i.price > 20000);
  line('count', pr.items.length);
  line('outOfRange', outOfRange.map(i => i.price));

  // 3. exclude keyword
  console.log('== keyword iPhone exclude iPhone ==');
  const ex = await searchMercariItems({ keyword: 'iPhone', exclude_keyword: 'iPhone', limit: 20 });
  const leaked = ex.items.filter(i => i.name.toLowerCase().includes('iphone'));
  line('count', ex.items.length);
  line('leaked', leaked.map(i => i.name.slice(0, 30)));

  // 4. category only
  console.log('== category_id 5 only ==');
  const cat = await searchMercariItems({ category_id: 5, limit: 5 });
  line('count', cat.items.length);
  line('sample', cat.items.slice(0, 3).map(i => i.name.slice(0, 25)));

  // 5. keyword + category (verify by fetching item detail of first result)
  console.log('== keyword iPhone + category_id 5 ==');
  const kc = await searchMercariItems({ keyword: 'iPhone', category_id: 5, limit: 5 });
  line('count', kc.items.length);
  line('sample', kc.items.slice(0, 3).map(i => i.name.slice(0, 30)));
  if (kc.items[0]) {
    const detail = await fetchMercariItem(kc.items[0].id);
    line('first item category chain', detail.category.map(c => `${c.id}:${c.name}`));
  }

  // 6. sort price asc
  console.log('== sort price asc ==');
  const sa = await searchMercariItems({ keyword: 'iPhone', sort: 'price', order: 'asc', limit: 30 });
  const prices = sa.items.map(i => i.price);
  let ascOk = true;
  for (let i = 1; i < prices.length; i++) if (prices[i]! < prices[i - 1]!) ascOk = false;
  line('prices', prices.slice(0, 15));
  line('ascending', ascOk);

  // 6b. sort price desc
  const sd = await searchMercariItems({ keyword: 'iPhone', sort: 'price', order: 'desc', limit: 30 });
  const dprices = sd.items.map(i => i.price);
  let descOk = true;
  for (let i = 1; i < dprices.length; i++) if (dprices[i]! > dprices[i - 1]!) descOk = false;
  line('desc prices', dprices.slice(0, 15));
  line('descending', descOk);

  // 7. seller_id only
  console.log('== seller_id only ==');
  try {
    const sellerId = process.env.PROBE_SELLER_ID ?? '276296408';
    const se = await searchMercariItems({ seller_id: sellerId, limit: 10 });
    line('count', se.items.length);
    line('sample', se.items.slice(0, 3).map(i => i.name.slice(0, 25)));
    if (se.items[0]) {
      const d = await fetchMercariItem(se.items[0].id);
      line('first item seller', d.seller?.id);
    }
  } catch (e) {
    line('ERROR', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }

  // 8. shipping_from_area
  console.log('== shipping_from_area 13 (Tokyo) ==');
  try {
    const sf = await searchMercariItems({ keyword: 'iPhone', shipping_from_area: 13, limit: 5 });
    line('count', sf.items.length);
    if (sf.items[0]) {
      const d = await fetchMercariItem(sf.items[0].id);
      line('first area', `${d.shipping_from_area_id}:${d.shipping_from_area_name}`);
    }
  } catch (e) {
    line('ERROR', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }

  // 9. get_item
  console.log('== get_item ==');
  if (kw.items[0]) {
    const d = await fetchMercariItem(kw.items[0].id);
    line('id/name/price', `${d.id} / ${d.name.slice(0, 20)} / ${d.price}`);
    line('status', d.status);
    line('condition', `${d.condition_id}:${d.condition_name}`);
    line('shipping_payer', `${d.shipping_payer_id}:${d.shipping_payer_name}`);
    line('likes/comments', `${d.likes_count}/${d.comments_count}`);
    line('created/updated', `${d.created_at}/${d.updated_at}`);
    line('category', d.category.map(c => `${c.id}:${c.name}`));
  }

  // 10. categories parent_id 98 and nested
  console.log('== categories ==');
  const records = await fetchAllCategories();
  line('total records', records.length);
  line('roots', filterCategories(records, { root_only: true }).length);
  line('children of 98', filterCategories(records, { parent_id: 98 }).map(r => `${r.id}:${r.name}`));
  line('children of 848', filterCategories(records, { parent_id: 848 }).map(r => `${r.id}:${r.name}`));
  line('keyword ポケモン', filterCategories(records, { keyword: 'ポケモン' }).slice(0, 5).map(r => r.pathNames.join('/')));
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
