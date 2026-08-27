import { fetchWithTimeout } from '../../http.ts';
import { MarketplaceError } from '../../errors.ts';
import {
  BROWSER_ACCEPT_LANGUAGE, CRAWLER_USER_AGENT, MERCARI_WEB_BASE_URL
} from './constants.ts';
import type { CategoryTier, ItemDetail } from '../../types.ts';

interface HtmlItemPayload {
  id?: string;
  name?: string;
  price?: number | string;
  description?: string;
  status?: string;
  photos?: string[];
  thumbnails?: string[];
  item_category?: { id: number; name: string; parent_category_id?: number; parent_category_name?: string; root_category_id?: number; root_category_name?: string };
  parent_categories_ntiers?: Array<{ id: number; name: string }>;
  item_condition?: { id?: number | string; name?: string };
  shipping_payer?: { id?: number | string; name?: string };
  shipping_method?: { id?: number | string; name?: string };
  shipping_from_area?: { id?: number | string; name?: string };
  shipping_duration?: { name?: string };
  num_likes?: number | string;
  comments?: unknown[];
  num_comments?: number | string;
  seller?: {
    id?: number | string;
    name?: string;
    ratings?: { good?: number; normal?: number; bad?: number };
    num_sell_items?: number;
  };
  updated?: number | string;
  created?: number | string;
}

export function normalizeItemId(itemIdOrUrl: string): string {
  const raw = itemIdOrUrl.trim();
  const fromUrl = raw.match(/\/item\/(?<id>m\d+)/i)?.groups?.id ?? raw.match(/^(?<id>m\d+)$/i)?.groups?.id;
  if (!fromUrl) {
    throw new MarketplaceError('MCP_INVALID_ARGUMENT', `Invalid Mercari item ID or URL: ${raw}`);
  }
  return fromUrl.toLowerCase();
}

function decodeHtml(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ');
}

function payloadFromRsc(html: string): HtmlItemPayload | undefined {
  const anchorIndex = html.indexOf('/items/get');
  if (anchorIndex < 0) return undefined;
  const dataIndex = html.indexOf('"data":{', anchorIndex);
  if (dataIndex < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = dataIndex + 7; index < html.length; index++) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) {
        const candidate = html.slice(dataIndex + 7, index + 1);
        try {
          return JSON.parse(candidate) as HtmlItemPayload;
        } catch {
          try {
            return JSON.parse(`"${candidate.replace(/"/g, '\\"')}"`) as unknown as HtmlItemPayload;
          } catch {
            return undefined;
          }
        }
      }
    }
  }
  return undefined;
}

export function buildDetail(payload: HtmlItemPayload, itemId: string): ItemDetail {
  const categoryTier: CategoryTier[] = [];
  if (payload.item_category) {
    if (payload.item_category.root_category_id !== undefined) {
      categoryTier.push({
        id: String(payload.item_category.root_category_id),
        name: payload.item_category.root_category_name ?? ''
      });
    }
    if (payload.item_category.parent_category_id !== undefined) {
      categoryTier.push({
        id: String(payload.item_category.parent_category_id),
        name: payload.item_category.parent_category_name ?? ''
      });
    }
    categoryTier.push({ id: String(payload.item_category.id), name: payload.item_category.name });
  }
  if (categoryTier.length === 0 && payload.parent_categories_ntiers?.length) {
    for (const parent of payload.parent_categories_ntiers) {
      categoryTier.push({ id: String(parent.id), name: parent.name });
    }
  }
  const status = payload.status === 'on_sale' ? 'on_sale'
    : payload.status === 'sold_out' ? 'sold_out'
    : payload.status === 'trading' ? 'trading' : 'unknown';
  const numeric = (value: number | string | undefined): number | null => {
    if (value === undefined || value === null || value === '') return null;
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  };
  return {
    id: String(payload.id ?? itemId),
    name: payload.name ?? '',
    price: Number(payload.price ?? 0),
    status,
    description: payload.description ?? '',
    photos: payload.photos?.length ? payload.photos : payload.thumbnails?.length ? payload.thumbnails : [],
    category: categoryTier,
    condition_id: payload.item_condition ? numeric(payload.item_condition.id) : null,
    condition_name: payload.item_condition?.name ?? null,
    shipping_payer_id: payload.shipping_payer ? numeric(payload.shipping_payer.id) : null,
    shipping_payer_name: payload.shipping_payer?.name ?? null,
    shipping_method_id: payload.shipping_method ? numeric(payload.shipping_method.id) : null,
    shipping_method_name: payload.shipping_method?.name ?? null,
    shipping_from_area_id: payload.shipping_from_area ? numeric(payload.shipping_from_area.id) : null,
    shipping_from_area_name: payload.shipping_from_area?.name ?? null,
    shipping_duration_name: payload.shipping_duration?.name ?? null,
    likes_count: numeric(payload.num_likes),
    comments_count: payload.comments?.length ?? numeric(payload.num_comments),
    seller: payload.seller ? {
      id: String(payload.seller.id ?? ''),
      name: payload.seller.name ?? '',
      ratings_good: payload.seller.ratings?.good ?? null,
      ratings_normal: payload.seller.ratings?.normal ?? null,
      ratings_bad: payload.seller.ratings?.bad ?? null,
      items_count: payload.seller.num_sell_items ?? null
    } : null,
    url: `${MERCARI_WEB_BASE_URL}/item/${itemId}`,
    updated_at: numeric(payload.updated),
    created_at: numeric(payload.created)
  };
}

function detailByHtmlTags(html: string, itemId: string): Partial<ItemDetail> & { id: string } {
  const title = decodeHtml((html.match(/<h1[^>]*>(?<value>[\s\S]*?)<\/h1>/)?.groups?.value ?? '').replace(/<[^>]+>/g, '')).trim();
  const price = Number(html.match(/<meta name="product:price:amount" content="(?<value>[\d.]+)"/)?.groups?.value ?? '0');
  const ogImage = html.match(/<meta property="og:image" content="(?<url>[^"]+)"/)?.groups?.url;
  const getTestValue = (testId: string): string | null => {
    const expression = new RegExp(`data-testid="${testId}">(?<value>[\\s\\S]*?)</span>`);
    return decodeHtml((html.match(expression)?.groups?.value ?? '').replace(/<[^>]+>/g, '')).trim() || null;
  };
  const categoryLinks = [...html.matchAll(/href="\/search\?category_id=(?<id>\d+)"[^>]*>(?<name>[^<]+)<\/a>/g)]
    .map(match => ({ id: match.groups!.id!, name: decodeHtml(match.groups!.name!).trim() }));
  const sellerMatch = html.match(/data-testid="seller-link"[\s\S]*?<a href="\/user\/profile\/(?<id>\d+)"/);
  return {
    id: itemId,
    name: title,
    price: Number.isFinite(price) ? price : 0,
    description: '',
    photos: ogImage ? [ogImage] : [],
    category: categoryLinks.length > 0 ? categoryLinks.reverse().map(category => ({ id: category.id, name: category.name })) : [],
    condition_name: getTestValue('商品の状態'),
    shipping_payer_name: getTestValue('配送料の負担'),
    shipping_method_name: getTestValue('配送の方法'),
    shipping_from_area_name: getTestValue('発送元の地域'),
    shipping_duration_name: getTestValue('発送までの日数'),
    seller: sellerMatch ? {
      id: sellerMatch.groups!.id!,
      name: decodeHtml(html.match(/data-testid="seller-link"[\s\S]*?<p class="[^"]*">(?<name>[^<]+)<\/p>/)?.groups?.name ?? ''),
      ratings_good: null,
      ratings_normal: null,
      ratings_bad: null,
      items_count: null
    } : null
  };
}

export async function fetchMercariItem(itemIdOrUrl: string): Promise<ItemDetail> {
  const itemId = normalizeItemId(itemIdOrUrl);
  const url = `${MERCARI_WEB_BASE_URL}/item/${itemId}`;
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      headers: {
        'user-agent': CRAWLER_USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': BROWSER_ACCEPT_LANGUAGE
      }
    });
  } catch (error) {
    throw new MarketplaceError(
      'MCP_UPSTREAM_UNAVAILABLE', `Failed to fetch item page: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (response.status === 404) throw new MarketplaceError('MCP_NOT_FOUND', `Mercari item not found: ${itemId}`);
  if (!response.ok) throw new MarketplaceError('MCP_UPSTREAM_UNAVAILABLE', `Mercari item page HTTP ${response.status}`);
  const html = await response.text();
  const payload = payloadFromRsc(html);
  if (!payload) {
    const fallback = detailByHtmlTags(html, itemId);
    if (!fallback.name) throw new MarketplaceError('MCP_PROVIDER_ERROR', `Could not parse Mercari item ${itemId}`);
    return {
      ...buildDetail({}, itemId),
      name: fallback.name ?? '',
      price: fallback.price ?? 0,
      description: fallback.description ?? '',
      photos: fallback.photos ?? [],
      category: fallback.category ?? [],
      condition_id: null,
      condition_name: fallback.condition_name ?? null,
      shipping_payer_id: null,
      shipping_payer_name: fallback.shipping_payer_name ?? null,
      shipping_method_id: null,
      shipping_method_name: fallback.shipping_method_name ?? null,
      shipping_from_area_id: null,
      shipping_from_area_name: fallback.shipping_from_area_name ?? null,
      shipping_duration_name: fallback.shipping_duration_name ?? null,
      likes_count: null,
      comments_count: null,
      seller: fallback.seller ?? null
    };
  }
  return buildDetail(payload, itemId);
}
