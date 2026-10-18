export interface EmailParts {
  local: string
  domain: string
}

type MaybeEmail = string | null | undefined

export interface LookupTarget {
  domain: string
  keyword: string
}

export type Lookup = (target: LookupTarget) =>
  Iterable<MaybeEmail> | AsyncIterable<MaybeEmail> | Promise<Iterable<MaybeEmail>>

export interface AbusiveOptions {
  dataset: Iterable<string>
  lookup?: Lookup
  limit?: number
}

export interface Abusive {
  findSibling: (email: string) => Promise<string | null>
  isFreeEmail: (email: string) => boolean
  isFreeEmailDomain: (domain: string) => boolean
  isSibling: (candidate: string | EmailParts, existing: string | EmailParts) => boolean
  parseEmail: (email: string) => EmailParts | null
}

export function parseEmail (email: string): EmailParts | null
export function isSibling (candidate: string | EmailParts, existing: string | EmailParts): boolean
export function createAbusive (options: AbusiveOptions): Abusive

declare const _default: typeof createAbusive & {
  createAbusive: typeof createAbusive
  isSibling: typeof isSibling
  parseEmail: typeof parseEmail
}
export default _default
