import { filterCategories, fetchAllCategories } from './categories.ts';
import { searchMercariItems } from './search.ts';
import { fetchMercariItem } from './item.ts';
import type {
  CategoriesOptions, CategoryRecord, ItemDetail, MarketplaceProvider,
  SearchResult, SearchParams
} from '../../types.ts';

export class MercariProvider implements MarketplaceProvider {
  readonly id = 'mercari';

  async search(params: SearchParams): Promise<SearchResult> {
    return searchMercariItems(params);
  }

  async getItem(itemIdOrUrl: string): Promise<ItemDetail> {
    return fetchMercariItem(itemIdOrUrl);
  }

  async getCategories(options?: CategoriesOptions): Promise<CategoryRecord[]> {
    const records = await fetchAllCategories();
    return filterCategories(records, options);
  }
}

export const mercariProvider = new MercariProvider();
