import { mercariProvider } from './providers/mercari/index.ts';
import type { MarketplaceProvider } from './types.ts';

const providers = new Map<string, MarketplaceProvider>();
providers.set(mercariProvider.id, mercariProvider);

export function getProvider(providerId = 'mercari'): MarketplaceProvider {
  const provider = providers.get(providerId);
  if (!provider) {
    throw new Error(`Unknown marketplace provider: ${providerId}`);
  }
  return provider;
}
