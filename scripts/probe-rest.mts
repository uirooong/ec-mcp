import { generateDpopJwt } from '../src/providers/mercari/dpop.ts';
import { buildApiSearchCondition } from '../src/providers/mercari/search-condition.ts';
const MERCARI_API_BASE_URL = 'https://api.mercari.jp';
const BROWSER_ACCEPT_LANGUAGE = 'ja-JP,ja;q=0.9';

const inputs = process.argv.slice(2).map(value => JSON.parse(value) as Record<string, unknown>);
for (const input of inputs) {
  const endpoint = `${MERCARI_API_BASE_URL}/v2/entities:search`;
  const deviceId = crypto.randomUUID();
  const condition: Record<string, unknown> = {
    ...buildApiSearchCondition(input as any),
    attributes: [],
    shopIds: [],
    excludeShippingMethodIds: []
  };
  const request = {
    userId: '',
    config: { responseToggles: ['QUERY_SUGGESTION_WEB_1'] },
    pageSize: 10,
    pageToken: '',
    searchSessionId: crypto.randomUUID(),
    source: 'BaseSerp',
    indexRouting: 'INDEX_ROUTING_UNSPECIFIED',
    thumbnailTypes: [],
    searchCondition: condition,
    serviceFrom: 'suruga',
    withItemBrand: true,
    withItemSize: false,
    withItemPromotions: true,
    withItemSizes: true,
    withShopname: false,
    useDynamicAttribute: true,
    withSuggestedItems: true,
    withOfferPricePromotion: true,
    withProductSuggest: true,
    withParentProducts: Boolean((input as any).show_product_list),
    withProductArticles: true,
    withSearchConditionId: false,
    withAuction: true,
    laplaceDeviceUuid: deviceId
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      dpop: await generateDpopJwt('POST', endpoint, deviceId),
      'x-platform': 'web',
      'x-country-code': 'JP',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
      'accept-language': BROWSER_ACCEPT_LANGUAGE
    },
    body: JSON.stringify(request)
  });
  const text = await response.text();
  console.log('\nINPUT', JSON.stringify(input));
  console.log('STATUS', response.status);
  console.log('CONDITION', JSON.stringify(request.searchCondition));
  try {
    const payload = JSON.parse(text) as any;
    console.log('KEYS', Object.keys(payload));
    if (!Array.isArray(payload.items)) console.log('RAW', text.slice(0, 4000));
    console.log('META', JSON.stringify(payload.meta));
    console.log('ITEM_COUNT', Array.isArray(payload.items) ? payload.items.length : undefined);
    for (const item of payload.items?.slice(0, 3) ?? []) console.log('ITEM', JSON.stringify(item));
  } catch {
    console.log(text.slice(0, 1000));
  }
}
