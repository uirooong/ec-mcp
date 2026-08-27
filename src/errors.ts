export type MarketplaceErrorCode =
  | 'MCP_INVALID_ARGUMENT'
  | 'MCP_NOT_FOUND'
  | 'MCP_PROVIDER_ERROR'
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
