'use strict'

const DEFAULT_PAGE_SIZE = 100
const MIN_KEYWORD_LENGTH = 3

const resolveClient = client =>
  typeof client === 'function' ? client() : client

const stripeLookup = (client, { pageSize = DEFAULT_PAGE_SIZE } = {}) => {
  if (client == null) {
    throw new TypeError(
      '`client` must be a Stripe client or a function returning one'
    )
  }
  return async function * ({ domain, keyword }) {
    if (keyword.length < MIN_KEYWORD_LENGTH) return
    const query = `email~"@${domain}" AND email~"${keyword}"`
    for await (const customer of resolveClient(client).customers.search({
      query,
      limit: pageSize
    })) {
      yield customer.email
    }
  }
}

module.exports = stripeLookup
module.exports.stripeLookup = stripeLookup
