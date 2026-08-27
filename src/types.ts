export type SortOption = 'created_time' | 'num_likes' | 'score' | 'price';
export type OrderOption = 'asc' | 'desc';
export type StatusOption = 'on_sale' | 'trading' | 'sold_out';
export type ShippingMethodOption = 'anonymous' | 'japan_post' | 'no_option';
export type ItemTypeOption = 'beyond' | 'mercari';

export type ListInput = number[] | string | undefined;

export interface SearchConditionInput {
  keyword?: string;
  exclude_keyword?: string;
  category_id?: ListInput;
  size_id?: ListInput;
  brand_id?: ListInput;
  seller_id?: ListInput;
  price_min?: number;
  price_max?: number;
  item_condition_id?: ListInput;
  shipping_payer_id?: ListInput;
  shipping_from_area?: ListInput;
  status?: ListInput;
  shipping_method?: ListInput;
  color_id?: ListInput;
  item_types?: ListInput;
  has_coupon?: boolean;
  created_after_date?: string;
  sort?: SortOption;
  order?: OrderOption;
  limit?: number;
  page_token?: string;
  sku_ids?: string[] | string;
  show_product_list?: boolean;
}

export interface SearchParams extends SearchConditionInput {
  provider?: string;
}

export type ItemTypeResult = 'mercari' | 'beyond' | 'unknown';

export interface SearchItem {
  id: string;
  item_type: ItemTypeResult;
  name: string;
  price: number;
  status: StatusOption | 'unknown';
  thumbnail: string | null;
  url: string;
}

export interface SearchResult {
  items: SearchItem[];
  total_count: number | null;
  next_page_token: string | null;
  source: 'api' | 'html';
}

export interface SellerSummary {
  id: string;
  name: string;
  ratings_good: number | null;
  ratings_normal: number | null;
  ratings_bad: number | null;
  items_count: number | null;
}

export interface CategoryTier {
  id: string;
  name: string;
}

export interface ItemDetail {
  id: string;
  name: string;
  price: number;
  status: StatusOption | 'unknown';
  description: string;
  photos: string[];
  category: CategoryTier[];
  condition_id: number | null;
  condition_name: string | null;
  shipping_payer_id: number | null;
  shipping_payer_name: string | null;
  shipping_method_id: number | null;
  shipping_method_name: string | null;
  shipping_from_area_id: number | null;
  shipping_from_area_name: string | null;
  shipping_duration_name: string | null;
  likes_count: number | null;
  comments_count: number | null;
  seller: SellerSummary | null;
  url: string;
  updated_at: number | null;
  created_at: number | null;
}

export interface CategoriesOptions {
  keyword?: string;
  parent_id?: number | string;
  root_only?: boolean;
}

export interface CategoryRecord {
  id: number;
  name: string;
  parentId: number | null;
  level: number;
  pathNames: string[];
  childrenIds?: number[];
}

export interface MarketplaceProvider {
  readonly id: string;
  search(params: SearchParams): Promise<SearchResult>;
  getItem(itemIdOrUrl: string): Promise<ItemDetail>;
  getCategories(options?: CategoriesOptions): Promise<CategoryRecord[]>;
}
