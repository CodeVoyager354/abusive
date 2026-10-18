import type { Lookup } from './index'

export interface StripeCustomerSearch {
  customers: {
    search: (params: { query: string, limit?: number }) => AsyncIterable<{ email?: string | null }>
  }
}

export interface StripeLookupOptions {
  pageSize?: number
}

export function stripeLookup (
  client: StripeCustomerSearch | (() => StripeCustomerSearch),
  options?: StripeLookupOptions
): Lookup

declare const _default: typeof stripeLookup & { stripeLookup: typeof stripeLookup }
export default _default
