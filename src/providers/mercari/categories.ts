import { fetchJson } from '../../http.ts';
import { MarketplaceError } from '../../errors.ts';
import {
  BROWSER_ACCEPT_LANGUAGE, CRAWLER_USER_AGENT, MERCARI_MASTER_BASE_URL
} from './constants.ts';
import { fetchCategoriesFromPage } from './category-html.ts';
import type { CategoriesOptions, CategoryRecord } from '../../types.ts';

interface MasterCategory {
  id: string | number;
  name?: string;
  status?: string;
  order?: number;
  parent_category_id?: string | number;
  select_size_group_id?: string | number;
}

interface MasterDataset<T> {
  data?: T[];
}

export async function fetchAllCategories(): Promise<CategoryRecord[]> {
  const urls = [
    `${MERCARI_MASTER_BASE_URL}/datasets/item_categories`,
    `${MERCARI_MASTER_BASE_URL}/item_categories`
  ];
  let payload: MasterDataset<MasterCategory> | undefined;
  let lastError: unknown;
  for (const url of urls) {
    try {
      payload = await fetchJson<MasterDataset<MasterCategory>>(url, {
        headers: {
          'user-agent': CRAWLER_USER_AGENT,
          'accept-language': BROWSER_ACCEPT_LANGUAGE,
          accept: 'application/json'
        }
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!payload || !(payload.data?.length)) {
    const pagePayload = await fetchCategoriesFromPage();
    return buildCategoryRecords((pagePayload.itemCategories ?? []).map(category => ({
      id: Number(category.id),
      name: category.name,
      parentId: category.parentCategoryId === undefined ? null : Number(category.parentCategoryId)
    })).filter(category => Number.isFinite(category.id)));
  }
  if (!payload) {
    throw new MarketplaceError(
      'MCP_UPSTREAM_UNAVAILABLE',
      `Failed to fetch Mercari categories: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
  }

  const categories = (payload.data ?? [])
    .filter(category => category.status !== 'inactive')
    .map(category => ({
      id: Number(category.id),
      name: category.name ?? '',
      parentId: category.parent_category_id === undefined ? null : Number(category.parent_category_id)
    }))
    .filter(category => Number.isFinite(category.id));
  return buildCategoryRecords(categories);
}

export function buildCategoryRecords(
  input: Array<{ id: number; name: string; parentId: number | null }>
): CategoryRecord[] {
  const byId = new Map<number, CategoryRecord>();
  for (const [index, item] of input.entries()) {
    byId.set(item.id, {
      id: item.id,
      name: item.name,
      parentId: item.parentId,
      level: 0,
      pathNames: []
    });
    if (!byId.get(item.id)?.pathNames) continue;
    void index;
  }

  const children = new Map<number, number[]>();
  for (const record of byId.values()) {
    if (record.parentId === null) continue;
    const siblings = children.get(record.parentId) ?? [];
    siblings.push(record.id);
    children.set(record.parentId, siblings);
  }

  const rootCandidates = [...byId.values()].filter(record =>
    record.parentId === null || !byId.has(record.parentId)
  );
  const queue = rootCandidates.map(record => ({ id: record.id, path: [record.name] }));
  while (queue.length > 0) {
    const current = queue.shift()!;
    const record = byId.get(current.id);
    if (!record) continue;
    record.pathNames = current.path;
    record.level = current.path.length;
    const childIds = children.get(record.id) ?? [];
    if (childIds.length > 0) {
      record.childrenIds = childIds.sort((left, right) => left - right);
    }
    for (const childId of childIds) {
      const child = byId.get(childId);
      if (!child || child.level !== 0) continue;
      queue.push({ id: childId, path: [...current.path, child.name] });
    }
  }

  return [...byId.values()];
}

export function filterCategories(
  records: CategoryRecord[],
  options: CategoriesOptions = {}
): CategoryRecord[] {
  const keyword = options.keyword?.trim().toLowerCase();
  const parentId = options.parent_id === undefined ? undefined : Number(options.parent_id);
  if (options.parent_id !== undefined && !Number.isFinite(parentId)) {
    throw new MarketplaceError('MCP_INVALID_ARGUMENT', `Invalid parent_id: ${String(options.parent_id)}`);
  }

  let result = records;
  if (parentId !== undefined) {
    result = result.filter(record => record.parentId === parentId);
  } else if (options.root_only) {
    result = result.filter(record => record.level === 1);
  }
  if (keyword) {
    result = result.filter(record =>
      record.name.toLowerCase().includes(keyword) ||
      record.pathNames.some(name => name.toLowerCase().includes(keyword))
    );
  }
  return result.sort((left, right) =>
    left.pathNames.join('/').localeCompare(right.pathNames.join('/'), 'ja')
  );
}
