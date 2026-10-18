'use strict'

const test = require('ava').default

const dataset = require('free-email-domains')
const createAbusive = require('..')
const stripeLookup = require('../src/stripe')

async function * customers (...emails) {
  for (const email of emails) yield { email }
}

const fakeStripe = (...emails) => {
  const calls = []
  return {
    calls,
    customers: {
      search: params => {
        calls.push(params)
        return customers(...emails)
      }
    }
  }
}

test('narrows the search by domain and keyword', async t => {
  const client = fakeStripe('boss@acme.com', null, 'destek@acme.com')
  const emails = []
  for await (const email of stripeLookup(client)({
    domain: 'acme.com',
    keyword: 'destek'
  })) {
    emails.push(email)
  }
  t.deepEqual(emails, ['boss@acme.com', null, 'destek@acme.com'])
  t.deepEqual(client.calls, [
    { query: 'email~"@acme.com" AND email~"destek"', limit: 100 }
  ])
})

test('searches when the keyword is exactly 3 characters', async t => {
  const client = fakeStripe('abc@acme.com')
  const emails = []
  for await (const email of stripeLookup(client)({
    domain: 'acme.com',
    keyword: 'abc'
  })) {
    emails.push(email)
  }
  t.deepEqual(emails, ['abc@acme.com'])
  t.deepEqual(client.calls, [
    { query: 'email~"@acme.com" AND email~"abc"', limit: 100 }
  ])
})

test('skips the search when the keyword is too short for Stripe to narrow', async t => {
  const client = fakeStripe('ab@acme.com')
  for (const keyword of ['', 'a', 'ab']) {
    for await (const email of stripeLookup(client)({
      domain: 'gmail.com',
      keyword
    })) {
      t.fail(email)
    }
  }
  t.deepEqual(client.calls, [])
})

test('pageSize sets the search page size', async t => {
  const client = fakeStripe()
  for await (const email of stripeLookup(client, { pageSize: 20 })({
    domain: 'acme.com',
    keyword: 'destek'
  })) {
    t.fail(email)
  }
  t.deepEqual(client.calls, [
    { query: 'email~"@acme.com" AND email~"destek"', limit: 20 }
  ])
})

test('accepts a function that returns the client, called on each lookup', async t => {
  const client = fakeStripe('destek@acme.com')
  let resolved = 0
  const lookup = stripeLookup(() => {
    resolved++
    return client
  })
  t.is(resolved, 0)
  const { findSibling } = createAbusive({ dataset, lookup })
  t.is(await findSibling('destek6@acme.com'), 'destek@acme.com')
  t.is(resolved, 1)
})

test('searches a fully dotted address by its collapsed mailbox', async t => {
  const client = fakeStripe('derek1@gmail.com')
  const { findSibling } = createAbusive({
    dataset,
    lookup: stripeLookup(client)
  })
  t.is(await findSibling('d.e.r.e.k@gmail.com'), 'derek1@gmail.com')
  t.deepEqual(client.calls, [
    { query: 'email~"@gmail.com" AND email~"derek"', limit: 100 }
  ])
})

test('finds a Gmail sibling end to end', async t => {
  const client = fakeStripe('derek1@gmail.com')
  const { findSibling } = createAbusive({
    dataset,
    lookup: stripeLookup(client)
  })
  t.is(await findSibling('d.erek2+x@gmail.com'), 'derek1@gmail.com')
  t.deepEqual(client.calls, [
    { query: 'email~"@gmail.com" AND email~"erek"', limit: 100 }
  ])
})

test('finds a sibling end to end', async t => {
  const client = fakeStripe(
    'boss@aramamotorukayit.com',
    'destek@aramamotorukayit.com'
  )
  const { findSibling } = createAbusive({
    dataset,
    lookup: stripeLookup(client)
  })
  t.is(
    await findSibling('destek6@aramamotorukayit.com'),
    'destek@aramamotorukayit.com'
  )
  t.is(await findSibling('jane@aramamotorukayit.com'), null)
})

test('a malicious domain never reaches the Stripe query', async t => {
  const client = fakeStripe('destek@acme.com')
  const { findSibling } = createAbusive({
    dataset,
    lookup: stripeLookup(client)
  })
  t.is(await findSibling('destek1@acme.com" OR email~"x'), null)
  t.is(await findSibling('des"tek1@acme.com'), null)
  t.deepEqual(client.calls, [])
})

test('requires a client', t => {
  t.throws(() => stripeLookup(), { instanceOf: TypeError, message: /client/ })
  t.is(stripeLookup.stripeLookup, stripeLookup)
})
