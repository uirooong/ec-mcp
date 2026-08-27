import { generateDpopJwt } from './dpop.ts';
import { CATEGORY_CACHE_TTL_MS, ENDPOINTS } from './constants.ts';
import { debugLog, mercariRest } from './rest-client.ts';
import { MarketplaceError } from '../../errors.ts';
import type { CategoriesOptions, CategoryRecord } from '../../types.ts';

interface MasterCategory {
  id?: string | number;
  name?: string;
  status?: string;
  displayOrder?: string | number;
  parentCategoryId?: string | number;
}

interface CategoryMasterPayload {
  itemCategories?: MasterCategory[];
}

interface CategoryCache {
  fetchedAt: number;
  records: CategoryRecord[];
}

let categoryCache: CategoryCache | undefined;

/**
 * Fetches the category master dataset from the same REST endpoint the Mercari
 * web client uses, then caches it in-process; the dataset is ~3.6MB and rarely
 * changes, so a TTL cache keeps category lookups off the request path.
 */
export async function fetchAllCategories(forceRefresh = false): Promise<CategoryRecord[]> {
  if (!forceRefresh && categoryCache && Date.now() - categoryCache.fetchedAt < CATEGORY_CACHE_TTL_MS) {
    return categoryCache.records;
  }
  const dpopJwt = await generateDpopJwt('GET', ENDPOINTS.categoryMaster);
  debugLog('tool', 'mercari_get_categories');
  debugLog('request URL', ENDPOINTS.categoryMaster);
  const payload = await mercariRest<CategoryMasterPayload>(ENDPOINTS.categoryMaster, dpopJwt, { method: 'GET' });
  const source = payload.itemCategories ?? [];
  if (source.length === 0) {
    throw new MarketplaceError('MCP_PROVIDER_ERROR', 'Mercari category master returned no categories');
  }
  const categories = source
    .filter(category => category.status !== 'inactive')
    .map(category => ({
      id: Number(category.id),
      name: category.name ?? '',
      parentId: category.parentCategoryId === undefined ? null : Number(category.parentCategoryId)
    }))
    .filter(category => Number.isFinite(category.id) && (category.parentId === null || Number.isFinite(category.parentId)));
  debugLog('category master', { total: source.length, active: categories.length });
  const records = buildCategoryRecords(categories);
  categoryCache = { fetchedAt: Date.now(), records };
  return records;
}

export function buildCategoryRecords(
  input: Array<{ id: number; name: string; parentId: number | null }>
): CategoryRecord[] {
  const byId = new Map<number, CategoryRecord>();
  for (const item of input) {
    byId.set(item.id, {
      id: item.id,
      name: item.name,
      parentId: item.parentId,
      level: 0,
      pathNames: []
    });
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
    // Keyword search spans every hierarchy level, not just roots.
    result = result.filter(record =>
      record.name.toLowerCase().includes(keyword) ||
      record.pathNames.some(name => name.toLowerCase().includes(keyword))
    );
  }
  return result.sort((left, right) =>
    left.pathNames.join('/').localeCompare(right.pathNames.join('/'), 'ja')
  );
}
