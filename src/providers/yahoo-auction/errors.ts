import { MarketplaceError } from '../../errors.ts';

// Yahoo! Auctions provider-specific errors. They subclass the shared
// MarketplaceError so the MCP layer keeps a stable error code, while preserving
// provider context (endpoint, HTTP status, provider error code) for debugging.

export class YahooAuctionHttpError extends MarketplaceError {
  constructor(
    readonly httpStatus: number,
    message: string,
    details?: unknown
  ) {
    super('MCP_UPSTREAM_UNAVAILABLE', message, details);
    this.name = 'YahooAuctionHttpError';
  }
}

export class YahooAuctionRateLimitError extends YahooAuctionHttpError {
  constructor(readonly retryAfterSeconds: number | null, message = 'Yahoo! Auctions API rate limited') {
    super(429, message, { retryAfterSeconds });
    this.name = 'YahooAuctionRateLimitError';
  }
}

export class YahooAuctionApiError extends MarketplaceError {
  constructor(message: string, details?: unknown) {
    super('MCP_PROVIDER_ERROR', message, details);
    this.name = 'YahooAuctionApiError';
  }
}

export class YahooAuctionParseError extends MarketplaceError {
  constructor(message: string, details?: unknown) {
    super('MCP_PROVIDER_ERROR', message, details);
    this.name = 'YahooAuctionParseError';
  }
}

export class YahooAuctionUnsupportedFilterError extends MarketplaceError {
  constructor(message: string, details?: unknown) {
    super('MCP_INVALID_ARGUMENT', message, details);
    this.name = 'YahooAuctionUnsupportedFilterError';
  }
}

export class YahooAuctionNotFoundError extends MarketplaceError {
  constructor(message: string) {
    super('MCP_NOT_FOUND', message);
    this.name = 'YahooAuctionNotFoundError';
  }
}
