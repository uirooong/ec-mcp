
import { generateDpopJwt } from '../src/providers/mercari/dpop.ts';
const url = 'https://api.mercari.jp/master/get_shipping_from_areas';
const res = await fetch(url, { headers: { accept: 'application/json', dpop: await generateDpopJwt('GET', url), 'x-platform': 'web' } });
console.log('STATUS', res.status);
const text = await res.text();
console.log(text.slice(0, 3000));
