import { buildSearchUrl, stableQueryString } from '../../url.ts';
import { fetchWithTimeout, newUuid } from '../../http.ts';
import { MarketplaceError } from '../../errors.ts';
import { generateDpopJwt } from './dpop.ts';
import {
  BROWSER_ACCEPT_LANGUAGE, CRAWLER_USER_AGENT, MERCARI_API_BASE_URL,
  MERCARI_WEB_BASE_URL
} from './constants.ts';
import { buildApiSearchCondition } from './search-condition.ts';
import type { SearchItem, SearchResult, SearchParams } from '../../types.ts';

interface ApiEntitySearchResponse {
  meta?: { numFound?: string | number };
  items?: ApiSearchItem[];
}

interface ApiSearchItem {
  id?: string;
  name?: string;
  price?: string | number;
  status?: string;
  thumbnail?: string;
  type?: string;
}

function normalizeApiStatus(value: string | undefined): SearchItem['status'] {
  if (value === 'on_sale') return 'on_sale';
  if (value === 'sold_out') return 'sold_out';
  if (value === 'trading') return 'trading';
  if (value === 'ITEM_STATUS_ON_SALE') return 'on_sale';
  if (value === 'ITEM_STATUS_SOLD_OUT') return 'sold_out';
  if (value === 'ITEM_STATUS_TRADING') return 'trading';
  return 'unknown';
}

async function searchByApi(params: SearchParams): Promise<SearchResult> {
  const pageUrl = new URL(`${MERCARI_WEB_BASE_URL}/search`);
  const conditionUrl = buildSearchUrl(pageUrl.href, params);
  const searchSessionId = newUuid();

  const request = {
    userId: '',
    config: { responseToggles: ['QUERY_SUGGESTION_WEB_1'] },
    pageSize: params.limit === undefined ? 120 : Math.max(1, Math.min(120, params.limit)),
    pageToken: params.page_token ?? '',
    searchSessionId,
    source: 'BaseSerp',
    indexRouting: 'INDEX_ROUTING_UNSPECIFIED',
    thumbnailTypes: [],
    searchCondition: buildApiSearchCondition(params),
    serviceFrom: 'suruga',
    withItemBrand: true,
    withItemSize: false,
    withItemPromotions: true,
    withItemSizes: true,
    withShopname: false,
    useDynamicAttribute: true,
    withSuggestedItems: false,
    withOfferPricePromotion: true,
    withProductSuggest: true,
    withParentProducts: Boolean(params.show_product_list),
    withProductArticles: true,
    withSearchConditionId: false,
    withAuction: true,
    laplaceDeviceUuid: ''
  };

  const endpoint = `${MERCARI_API_BASE_URL}/v2/entities:search`;
  const dpopJwt = await generateDpopJwt('POST', endpoint);
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        dpop: dpopJwt,
        platform: 'web',
        'user-agent': CRAWLER_USER_AGENT,
        'accept-language': BROWSER_ACCEPT_LANGUAGE
      },
      body: JSON.stringify(request)
    });
  } catch (error) {
    throw Object.assign(new Error(`Mercari search API unreachable: ${error instanceof Error ? error.message : String(error)}`), {
      retriable: error instanceof Error && error.name !== 'AbortError'
    });
  }
  if (!response.ok) {
    throw Object.assign(new Error(`Mercari search API HTTP ${response.status}`), {
      retriable: response.status >= 500 || response.status === 429,
      httpStatus: response.status
    });
  }
  const payload = await response.json() as ApiEntitySearchResponse;
  const items = (payload.items ?? []).map(item => ({
    id: String(item.id ?? ''),
    name: item.name ?? '',
    price: Number(item.price ?? 0),
    status: normalizeApiStatus(item.status),
    thumbnail: item.thumbnail ?? null,
    url: `${MERCARI_WEB_BASE_URL}/item/${item.id ?? ''}`
  })).filter(item => /^[a-z]\d+$/i.test(item.id));

  const nextToken = (payload.meta as { nextPageToken?: string } | undefined)?.nextPageToken;
  return {
    items,
    total_count: payload.meta?.numFound === undefined ? null : Number(payload.meta.numFound),
    next_page_token: items.length > 0 && nextToken ? String(nextToken) : null,
    source: 'api'
  };
}

interface HtmlCapture {
  id: string;
  name: string;
  price: number;
  status: SearchItem['status'];
  thumbnail: string;
}

export function parseSearchHtml(html: string): HtmlCapture[] {
  const cells = [...html.matchAll(/<li data-testid="item-cell"/g)];
  const results: HtmlCapture[] = [];
  for (const cell of cells) {
    const chunk = html.slice(cell.index ?? 0, html.length);
    const end = chunk.indexOf('<li data-testid="item-cell"', 10);
    const fragment = end < 0 ? chunk : chunk.slice(0, end);
    const idMatch = fragment.match(/href="\/item\/(?<id>m\d+)"/);
    const nameMatch = fragment.match(/(?:itemName_[^"]*">|thumbnail-item-name" class="[^"]*">)(?<name>[\s\S]*?)<\/span>/);
    const priceMatch = fragment.match(/number__6b270ca7[^>]*>(?:[\s\S]*?)(?<price>[\d,]+)<\/span>/);
    if (!idMatch?.groups?.id || !nameMatch?.groups?.name || !priceMatch?.groups?.price) continue;
    const decodedName = nameMatch.groups.name
      .replace(/<[^>]+>/g, '')
      .replaceAll('&amp;', '&')
      .replaceAll('&quot;', '"')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .trim();
    const soldOut = /data-testid="[^"]*(?:sold|SOLD)[^"]*"/.test(fragment) || />SOLD</.test(fragment);
    results.push({
      id: idMatch.groups.id,
      name: decodedName,
      price: Number(priceMatch.groups.price.replace(/,/g, '')),
      status: soldOut ? 'sold_out' : 'on_sale',
      thumbnail: ''
    });
  }
  return results;
}

async function searchByHtmlFallback(params: SearchParams): Promise<SearchResult> {
  const url = buildSearchUrl(`${MERCARI_WEB_BASE_URL}/search`, params).href;
  const response = await fetchWithTimeout(url, {
    headers: {
      'user-agent': CRAWLER_USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': BROWSER_ACCEPT_LANGUAGE
    }
  });
  if (!response.ok) {
    throw new MarketplaceError('MCP_UPSTREAM_UNAVAILABLE', `Mercari search HTML HTTP ${response.status}`);
  }
  const captures = parseSearchHtml(await response.text());
  const limit = params.limit === undefined ? undefined : Math.max(1, Math.min(MAX_PAGE_SIZE_LIMIT, params.limit));
  const selectedItems = limit === undefined ? captures : captures.slice(0, limit);
  return {
    items: selectedItems.map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      status: item.status,
      thumbnail: item.thumbnail.length > 0 ? item.thumbnail : null,
      url: `${MERCARI_WEB_BASE_URL}/item/${item.id}`
    })),
    total_count: null,
    next_page_token: selectedItems.length > 0 && (!limit || captures.length >= limit) ? 'html-next' : null,
    source: 'html'
  };
}

const MAX_PAGE_SIZE_LIMIT = 120;

export async function searchMercariItems(params: SearchParams): Promise<SearchResult> {
  let apiError: unknown;
  try {
    const result = await searchByApi(params);
    if ((params.keyword ?? '').length > 0 && result.total_count === 0) {
      return await searchByHtmlFallback(params);
    }
    return result;
  } catch (error) {
    apiError = error;
  }
  try {
    return await searchByHtmlFallback(params);
  } catch (fallbackError) {
    throw new MarketplaceError(
      'MCP_PROVIDER_ERROR',
      `Both Mercari search strategies failed. API error: ${apiError instanceof Error ? apiError.message : String(apiError)}; HTML error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
    );
  } finally {
    void stableQueryString(new URL(`${MERCARI_WEB_BASE_URL}/search`));
  }
}
