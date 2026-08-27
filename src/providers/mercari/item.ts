import { generateDpopJwt } from './dpop.ts';
import { ENDPOINTS, MERCARI_WEB_BASE_URL } from './constants.ts';
import { debugLog, mercariRest } from './rest-client.ts';
import { MarketplaceError, MercariApiError, MercariParseError } from '../../errors.ts';
import type { CategoryTier, ItemDetail } from '../../types.ts';

interface ApiCategoryNode {
  id?: number | string;
  name?: string;
}

interface ApiItemPayload {
  id?: string;
  name?: string;
  price?: number | string;
  description?: string;
  status?: string;
  photos?: string[];
  thumbnails?: string[];
  item_category?: {
    id?: number | string;
    name?: string;
    parent_category_id?: number | string;
    parent_category_name?: string;
    root_category_id?: number | string;
    root_category_name?: string;
  };
  item_category_ntiers?: ApiCategoryNode & {
    parent_category_id?: number | string;
    parent_category_name?: string;
    root_category_id?: number | string;
    root_category_name?: string;
  };
  parent_categories_ntiers?: ApiCategoryNode[];
  item_condition?: { id?: number | string; name?: string };
  shipping_payer?: { id?: number | string; name?: string };
  shipping_method?: { id?: number | string; name?: string };
  shipping_from_area?: { id?: number | string; name?: string };
  shipping_duration?: { id?: number | string; name?: string };
  num_likes?: number | string;
  num_comments?: number | string;
  comments?: unknown[];
  seller?: {
    id?: number | string;
    name?: string;
    ratings?: { good?: number; normal?: number; bad?: number };
    num_sell_items?: number | string;
  };
  updated?: number | string;
  created?: number | string;
}

interface ApiItemResponse {
  result?: string;
  data?: ApiItemPayload;
  errors?: Array<{ code?: string; message?: string }>;
}

export function normalizeItemId(itemIdOrUrl: string): string {
  const raw = itemIdOrUrl.trim();
  const fromUrl = raw.match(/\/item\/(?<id>m\d+)/i)?.groups?.id ?? raw.match(/^(?<id>m\d+)$/i)?.groups?.id;
  if (!fromUrl) {
    throw new MarketplaceError('MCP_INVALID_ARGUMENT', `Invalid Mercari item ID or URL: ${raw}`);
  }
  return fromUrl.toLowerCase();
}

function numeric(value: number | string | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function normalizeStatus(value: string | undefined): ItemDetail['status'] {
  if (value === 'on_sale' || value === 'ITEM_STATUS_ON_SALE') return 'on_sale';
  if (value === 'sold_out' || value === 'ITEM_STATUS_SOLD_OUT') return 'sold_out';
  if (value === 'trading' || value === 'ITEM_STATUS_TRADING') return 'trading';
  return 'unknown';
}

/**
 * Category chain: parent_categories_ntiers is the root-to-leaf ancestry and
 * item_category_ntiers is the leaf tier; item_category is a legacy display
 * field that can disagree with the ntiers chain, so it is only a fallback.
 * Duplicate IDs are dropped while preserving order.
 */
export function buildCategoryTiers(payload: ApiItemPayload): CategoryTier[] {
  const tiers: CategoryTier[] = [];
  const seen = new Set<string>();
  const push = (id: number | string | undefined, name: string | undefined): void => {
    if (id === undefined || id === null || id === '') return;
    const normalizedId = String(id);
    if (seen.has(normalizedId)) return;
    seen.add(normalizedId);
    tiers.push({ id: normalizedId, name: name ?? '' });
  };
  for (const parent of payload.parent_categories_ntiers ?? []) {
    push(parent.id, parent.name);
  }
  if (payload.item_category_ntiers) {
    push(payload.item_category_ntiers.id, payload.item_category_ntiers.name);
  }
  if (tiers.length === 0 && payload.item_category) {
    const category = payload.item_category;
    push(category.root_category_id, category.root_category_name);
    push(category.parent_category_id, category.parent_category_name);
    push(category.id, category.name);
  }
  return tiers;
}

export function buildItemDetail(payload: ApiItemPayload, itemId: string): ItemDetail {
  const commentsCount = numeric(payload.num_comments) ?? payload.comments?.length ?? null;
  return {
    id: String(payload.id ?? itemId),
    name: payload.name ?? '',
    price: numeric(payload.price) ?? 0,
    status: normalizeStatus(payload.status),
    description: payload.description ?? '',
    photos: payload.photos?.length ? payload.photos : payload.thumbnails ?? [],
    category: buildCategoryTiers(payload),
    condition_id: numeric(payload.item_condition?.id),
    condition_name: payload.item_condition?.name ?? null,
    shipping_payer_id: numeric(payload.shipping_payer?.id),
    shipping_payer_name: payload.shipping_payer?.name ?? null,
    shipping_method_id: numeric(payload.shipping_method?.id),
    shipping_method_name: payload.shipping_method?.name ?? null,
    shipping_from_area_id: numeric(payload.shipping_from_area?.id),
    shipping_from_area_name: payload.shipping_from_area?.name ?? null,
    shipping_duration_name: payload.shipping_duration?.name ?? null,
    likes_count: numeric(payload.num_likes),
    comments_count: commentsCount,
    seller: payload.seller ? {
      id: String(payload.seller.id ?? ''),
      name: payload.seller.name ?? '',
      ratings_good: payload.seller.ratings?.good ?? null,
      ratings_normal: payload.seller.ratings?.normal ?? null,
      ratings_bad: payload.seller.ratings?.bad ?? null,
      items_count: numeric(payload.seller.num_sell_items)
    } : null,
    url: `${MERCARI_WEB_BASE_URL}/item/${itemId}`,
    updated_at: numeric(payload.updated),
    created_at: numeric(payload.created)
  };
}

export async function fetchMercariItem(itemIdOrUrl: string): Promise<ItemDetail> {
  debugLog('tool', 'mercari_get_item');
  debugLog('input', { item: itemIdOrUrl });
  const itemId = normalizeItemId(itemIdOrUrl);
  const endpoint = `${ENDPOINTS.itemGet}?id=${encodeURIComponent(itemId)}`;
  const dpopJwt = await generateDpopJwt('GET', endpoint);
  const payload = await mercariRest<ApiItemResponse>(endpoint, dpopJwt, { method: 'GET' });
  if (payload.result === 'error' || payload.data === undefined) {
    const message = payload.errors?.[0]?.message ?? 'empty payload';
    throw new MercariApiError(`Mercari item API error for ${itemId}: ${message}`, payload.errors);
  }
  const detail = buildItemDetail(payload.data, itemId);
  if (!detail.id || !detail.name) {
    throw new MercariParseError(`Mercari item API returned an unusable payload for ${itemId}`);
  }
  debugLog('item detail', { id: detail.id, name: detail.name, price: detail.price });
  return detail;
}
