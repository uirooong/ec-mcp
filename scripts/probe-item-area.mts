
import { generateDpopJwt } from '../src/providers/mercari/dpop.ts';
// pick item from area 13 test later; here fetch one item detail to see shipping_from_area shape
const id = process.argv[2] ?? 'm87581943641';
const url = `https://api.mercari.jp/items/get?id=${id}&include_item_attributes=false`;
const res = await fetch(url, { headers: { accept: 'application/json', dpop: await generateDpopJwt('GET', url), 'x-platform': 'web' } });
console.log('STATUS', res.status);
const payload: any = await res.json();
if (payload.data) {
  const d = payload.data;
  console.log('shipping_from_area:', JSON.stringify(d.shipping_from_area));
  console.log('status:', d.status, 'price:', d.price);
  console.log('created:', d.created, 'updated:', d.updated);
  console.log('condition:', JSON.stringify(d.item_condition));
  console.log('cat ntiers:', JSON.stringify(d.item_category_ntiers && { id: d.item_category_ntiers.id, name: d.item_category_ntiers.name }));
} else {
  console.log(JSON.stringify(payload).slice(0, 500));
}
