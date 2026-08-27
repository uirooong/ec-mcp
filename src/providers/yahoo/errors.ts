import { MarketplaceError } from '../../errors.ts';

// Yahoo! Flea Market provider-specific errors. They subclass the shared
// MarketplaceError so the MCP layer keeps a stable error code, while preserving
// provider context (endpoint, HTTP status, provider error code) for debugging.

export class YahooFleamarketHttpError extends MarketplaceError {
  constructor(
    readonly httpStatus: number,
    message: string,
    details?: unknown
  ) {
    super('MCP_UPSTREAM_UNAVAILABLE', message, details);
    this.name = 'YahooFleamarketHttpError';
  }
}

export class YahooFleamarketRateLimitError extends YahooFleamarketHttpError {
  constructor(readonly retryAfterSeconds: number | null, message = 'Yahoo! Flea Market API rate limited') {
    super(429, message, { retryAfterSeconds });
    this.name = 'YahooFleamarketRateLimitError';
  }
}

export class YahooFleamarketApiError extends MarketplaceError {
  constructor(message: string, details?: unknown) {
    super('MCP_PROVIDER_ERROR', message, details);
    this.name = 'YahooFleamarketApiError';
  }
}

export class YahooFleamarketParseError extends MarketplaceError {
  constructor(message: string, details?: unknown) {
    super('MCP_PROVIDER_ERROR', message, details);
    this.name = 'YahooFleamarketParseError';
  }
}

export class YahooFleamarketUnsupportedFilterError extends MarketplaceError {
  constructor(message: string, details?: unknown) {
    super('MCP_INVALID_ARGUMENT', message, details);
    this.name = 'YahooFleamarketUnsupportedFilterError';
  }
}

export class YahooFleamarketNotFoundError extends MarketplaceError {
  constructor(message: string) {
    super('MCP_NOT_FOUND', message);
    this.name = 'YahooFleamarketNotFoundError';
  }
}

