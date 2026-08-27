import { fetchWithTimeout } from '../../http.ts';
import { MarketplaceError } from '../../errors.ts';
import {
  BROWSER_ACCEPT_LANGUAGE, CRAWLER_USER_AGENT, MERCARI_WEB_BASE_URL
} from './constants.ts';

interface HtmlMasterCategory {
  id: string;
  name: string;
  level?: string;
  parentCategoryId?: string;
  rootCategoryId?: string;
}

export interface CategoryHtmlPayload {
  itemCategories?: HtmlMasterCategory[];
}

function unescapeRscText(input: string): string {
  return input
    .replaceAll('\\\\', '\\')
    .replaceAll('\\"', '"')
    .replaceAll('\\\\', '\\')
    .replaceAll('\\n', ' ')
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>')
}

export function extractCategoryPayload(html: string): CategoryHtmlPayload | undefined {
  const anchorIndex = html.indexOf('master/v2/datasets/item_categories');
  if (anchorIndex < 0) return undefined;
  const escapedKey = html.indexOf('\\"itemCategories\\":[');
  const plainKey = html.indexOf('"itemCategories":[', anchorIndex);
  const keyIndex = escapedKey < 0 ? plainKey : escapedKey;
  const isEscapedEmbed = keyIndex === escapedKey && keyIndex >= 0;
  if (keyIndex < 0) return undefined;
  const escapedCategoryKey = '\\"itemCategories\\":[';
  const categoryKey = isEscapedEmbed ? escapedCategoryKey : '"itemCategories":[';
  // The escaped RSC payload embeds one additional closing brace for its fallback map.
  const arrayStart = keyIndex + categoryKey.length;
  if (isEscapedEmbed) {
    const closingMarker = html.indexOf('\\"children\\":', arrayStart);
    if (closingMarker < 0) return undefined;
    const escapedRaw = html.slice(arrayStart - 3, closingMarker).trim();
    const decodedRaw = unescapeRscText(escapedRaw);
    const rawStart = decodedRaw.indexOf('[', decodedRaw.indexOf('"itemCategories"'));
    const rawEnd = decodedRaw.indexOf(']', rawStart) + 1;
    const raw = decodedRaw.slice(rawStart, rawEnd);
    return { itemCategories: JSON.parse(raw) as HtmlMasterCategory[] };
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = arrayStart; index < html.length; index++) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '[') depth++;
    else if (char === ']') {
      depth--;
      if (depth === 0) {
        const raw = html.slice(arrayStart, index).trim();
        return { itemCategories: JSON.parse(raw) as HtmlMasterCategory[] };
      }
    }
  }
  return undefined;
}

export async function fetchCategoriesFromPage(): Promise<CategoryHtmlPayload> {
  try {
    const response = await fetchWithTimeout(`${MERCARI_WEB_BASE_URL}/categories`, {
      headers: {
        'user-agent': CRAWLER_USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': BROWSER_ACCEPT_LANGUAGE
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = extractCategoryPayload(await response.text());
    if (!payload?.itemCategories?.length) throw new Error('category payload not found');
    return payload;
  } catch (error) {
    throw new MarketplaceError(
      'MCP_UPSTREAM_UNAVAILABLE',
      `Failed to fetch Mercari categories from web page: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
