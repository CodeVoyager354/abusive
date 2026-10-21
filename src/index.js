'use strict'

const INVISIBLE_CHARACTERS = /[\p{Cf}\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu
// NFKC folds U+FF0E to "." and U+FF61 to U+3002. U+3002 itself is unchanged.
const LABEL_DOTS = /\u3002/g
const TRAILING_DOTS = /\.+$/
const SUBADDRESS = /\+.*$/
const NUMBERING_AND_SEPARATORS = /[\d._-]/g
const SAFE_MAILBOX = /^[a-z0-9._+-]+$/
const COMBINING_MARKS = /\p{M}+/gu
const DOMAIN_ALIASES = new Map([['googlemail.com', 'gmail.com']])
const LETTER_RUNS = /[a-z]+/g
const HOSTNAME = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/
const CYRILLIC_CONFUSABLES = /[аесеорухіїјѕԁһ]/g
const GREEK_CONFUSABLES = /[αβγδεηικμνορτυχν]/g

const CYRILLIC_TO_LATIN = {
  а: 'a',
  с: 'c',
  е: 'e',
  і: 'i',
  ї: 'i',
  ј: 'j',
  о: 'o',
  р: 'p',
  ѕ: 's',
  у: 'y',
  х: 'x',
  ԁ: 'd',
  һ: 'h'
}

const GREEK_TO_LATIN = {
  α: 'a',
  β: 'b',
  γ: 'y',
  δ: 'd',
  ε: 'e',
  η: 'n',
  ι: 'i',
  κ: 'k',
  μ: 'm',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x'
}

const canonicalAddress = email =>
  String(email)
    .normalize('NFKC')
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(LABEL_DOTS, '.')
    .trim()
    .toLowerCase()

const parseEmail = email => {
  const address = canonicalAddress(email)
  const at = address.lastIndexOf('@')
  if (at <= 0) return null
  const domain = canonicalDomain(address.slice(at + 1))
  if (domain === '') return null
  return { local: address.slice(0, at), domain }
}

const toParts = email => (typeof email === 'string' ? parseEmail(email) : email)

const toDomainSet = dataset => {
  if (
    dataset == null ||
    typeof dataset === 'string' ||
    typeof dataset[Symbol.iterator] !== 'function'
  ) {
    throw new TypeError('`dataset` must be an iterable of free email domains')
  }
  return new Set(
    Array.from(dataset, domain =>
      canonicalAddress(domain).replace(TRAILING_DOTS, '')
    )
  )
}

const withoutSubaddress = local => local.replace(SUBADDRESS, '')

const normalizeConfusables = local =>
  local
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(CYRILLIC_CONFUSABLES, character => CYRILLIC_TO_LATIN[character])
    .replace(GREEK_CONFUSABLES, character => GREEK_TO_LATIN[character])

const normalizedLocal = local => normalizeConfusables(withoutSubaddress(local))

const canonicalDomain = domain =>
  DOMAIN_ALIASES.get(domain.replace(TRAILING_DOTS, '')) ??
  domain.replace(TRAILING_DOTS, '')

const mailboxOf = ({ local }) =>
  normalizedLocal(local).replace(NUMBERING_AND_SEPARATORS, '')

const longestLetterRun = local =>
  local
    .match(LETTER_RUNS)
    .reduce((longest, run) => (run.length > longest.length ? run : longest), '')

// A one- or two-letter run is too broad to search for, and Stripe ignores it.
// Fall back to the collapsed mailbox so d.e.r.e.k searches for derek.
const MIN_KEYWORD_LENGTH = 3

const keywordOf = candidate => {
  const run = longestLetterRun(normalizedLocal(candidate.local))
  return run.length >= MIN_KEYWORD_LENGTH ? run : mailboxOf(candidate)
}

const isSibling = (candidate, existing) => {
  const a = toParts(candidate)
  const b = toParts(existing)
  if (a == null || b == null || a.domain !== b.domain || a.local === b.local) {
    return false
  }
  const mailbox = mailboxOf(a)
  return mailbox !== '' && mailbox === mailboxOf(b)
}

const isSearchable = candidate =>
  HOSTNAME.test(candidate.domain) &&
  SAFE_MAILBOX.test(normalizedLocal(candidate.local)) &&
  mailboxOf(candidate) !== ''

const createAbusive = ({ dataset, lookup, limit = Infinity } = {}) => {
  const freeEmailDomains = toDomainSet(dataset)
  if (lookup != null && typeof lookup !== 'function') {
    throw new TypeError('`lookup` must be a function')
  }

  const isFreeEmailDomain = domain => {
    const labels = canonicalAddress(domain)
      .replace(TRAILING_DOTS, '')
      .split('.')
    return labels.some((_, index) =>
      freeEmailDomains.has(labels.slice(index).join('.'))
    )
  }

  const isFreeEmail = email => {
    const parts = parseEmail(email)
    return parts !== null && isFreeEmailDomain(parts.domain)
  }

  const registeredSibling = async candidate => {
    const keyword = keywordOf(candidate)
    let read = 0
    for await (const existing of await lookup({
      domain: candidate.domain,
      keyword
    })) {
      if (read++ >= limit) return null
      if (typeof existing === 'string' && isSibling(candidate, existing)) {
        return existing
      }
    }
    return null
  }

  const findSibling = async email => {
    if (lookup == null) {
      throw new TypeError('`lookup` is required to find siblings')
    }
    const candidate = parseEmail(email)
    if (candidate === null || !isSearchable(candidate)) return null
    return registeredSibling(candidate)
  }

  return { findSibling, isFreeEmail, isFreeEmailDomain, isSibling, parseEmail }
}

module.exports = createAbusive
module.exports.createAbusive = createAbusive
module.exports.isSibling = isSibling
module.exports.parseEmail = parseEmail
