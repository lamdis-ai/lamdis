// Pure UI components — re-exported from @lamdis-ai/ui for backward compatibility
export * from '@lamdis-ai/ui';

// Business-logic components (depend on org/product context)
export { default as OrgSelector } from './components/base/OrgSelector';
export { default as ProductToggle } from './components/ui/ProductToggle';
export { ProductSwitcher } from './components/ui/ProductToggle';

// Auth and session utilities (server-side)
export * from './lib/auth';
export * from './lib/auth0';

// Auth context (client-side)
export * from './lib/authContext';

// Auth-aware fetch utilities
export * from './lib/authFetch';

// Formatting utilities
export * from './lib/format';

// Organization context (client-side)
export * from './lib/orgContext';

// Pricing utilities
export * from './lib/pricing';

// Product context (client-side)
export * from './lib/productContext';
