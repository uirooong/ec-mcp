export type MarketplaceErrorCode =
  | 'MCP_INVALID_ARGUMENT'
  | 'MCP_NOT_FOUND'
  | 'MCP_PROVIDER_ERROR'
  | 'MCP_RATE_LIMITED'
  | 'MCP_UPSTREAM_UNAVAILABLE';

export class MarketplaceError extends Error {
  readonly code: MarketplaceErrorCode;
  readonly details?: unknown;

  constructor(code: MarketplaceErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'MarketplaceError';
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export class MercariHttpError extends MarketplaceError {
  constructor(
    readonly httpStatus: number,
    message: string,
    details?: unknown
  ) {
    super('MCP_UPSTREAM_UNAVAILABLE', message, details);
    this.name = 'MercariHttpError';
  }
}

export class MercariRateLimitError extends MercariHttpError {
  constructor(readonly retryAfterSeconds: number | null, message = 'Mercari API rate limited') {
    super(429, message, { retryAfterSeconds });
    this.name = 'MercariRateLimitError';
  }
}

export class MercariApiError extends MarketplaceError {
  constructor(message: string, details?: unknown) {
    super('MCP_PROVIDER_ERROR', message, details);
    this.name = 'MercariApiError';
  }
}

export class MercariParseError extends MarketplaceError {
  constructor(message: string, details?: unknown) {
    super('MCP_PROVIDER_ERROR', message, details);
    this.name = 'MercariParseError';
  }
}

export class MercariUnsupportedFilterError extends MarketplaceError {
  constructor(message: string, details?: unknown) {
    super('MCP_INVALID_ARGUMENT', message, details);
    this.name = 'MercariUnsupportedFilterError';
  }
}

export class MercariNotFoundError extends MarketplaceError {
  constructor(message: string) {
    super('MCP_NOT_FOUND', message);
    this.name = 'MercariNotFoundError';
  }
}
