import type { components } from './generated/schema';

/** Prefix of every private query key: role, actor and company partition the cache. */
export type Scope = readonly [components['schemas']['Session']['role'], string, string | null];
