import { generateDpopJwt } from '../src/providers/mercari/dpop.ts';

const itemId = process.argv[2] ?? 'm68826920542';
const base = 'https://api.mercari.jp';
const candidates = [
  `${base}/items/get?id=${itemId}`,
  `${base}/items/${itemId}`,
  `${base}/v2/items/${itemId}`,
  `${base}/v2/items:get?item_id=${itemId}`,
  `${base}/services/item/v1/items/${itemId}`,
  `${base}/services/item/v1/get_item?item_id=${itemId}`,
  `${base}/services/bff/items/v1/items/${itemId}`,
  `${base}/services/bff/items/v1/item/${itemId}`,
  `${base}/services/bff/items/v1/item:get?item_id=${itemId}`
];

for (const endpoint of candidates) {
  try {
    const response = await fetch(endpoint, {
      headers: {
        accept: 'application/json',
        'accept-language': 'ja-JP,ja;q=0.9',
        dpop: await generateDpopJwt('GET', endpoint),
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'x-country-code': 'JP',
        'x-platform': 'web'
      }
    });
    const body = await response.text();
    console.log('\nURL', endpoint, 'STATUS', response.status, 'TYPE', response.headers.get('content-type'));
    if (process.env.MERCARI_SAVE_ITEM) {
      await Bun.write(process.env.MERCARI_SAVE_ITEM, body);
    } else {
      console.log(body.slice(0, 100000));
    }
  } catch (error) {
    console.log('\nURL', endpoint, 'ERROR', error);
  }
}
