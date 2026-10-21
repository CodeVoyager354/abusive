'use strict'

const test = require('ava').default

const dataset = require('free-email-domains')
const createAbusive = require('..')

const FULLWIDTH_GMAIL = String.fromCodePoint(
  0xff27,
  0xff2d,
  0xff21,
  0xff29,
  0xff2c
)
const IDEOGRAPHIC_DOT = String.fromCodePoint(0x3002)
const FULLWIDTH_DOT = String.fromCodePoint(0xff0e)
const HALFWIDTH_DOT = String.fromCodePoint(0xff61)
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b)
const LEFT_TO_RIGHT_MARK = String.fromCodePoint(0x200e)
const SOFT_HYPHEN = String.fromCodePoint(0xad)
const VARIATION_SELECTOR = String.fromCodePoint(0xfe0f)
const VARIATION_SELECTOR_SUPPLEMENT = String.fromCodePoint(0xe0100)
const CYRILLIC_SMALL_E = String.fromCodePoint(0x435)

const { isFreeEmail, isFreeEmailDomain, isSibling, parseEmail } = createAbusive(
  { dataset }
)

async function * asyncEmails (...emails) {
  yield * emails
}

const recordingLookup = (...emails) => {
  const targets = []
  const lookup = target => {
    targets.push(target)
    return emails
  }
  return { targets, lookup }
}

test('parseEmail splits the canonical address at the last @', t => {
  t.deepEqual(parseEmail('Kiko@Microlink.io'), {
    local: 'kiko',
    domain: 'microlink.io'
  })
  t.deepEqual(parseEmail('  kiko@microlink.io.  '), {
    local: 'kiko',
    domain: 'microlink.io'
  })
  t.deepEqual(parseEmail(`KIKO+1@${FULLWIDTH_GMAIL}.COM`), {
    local: 'kiko+1',
    domain: 'gmail.com'
  })
  t.deepEqual(parseEmail(`kiko@gmail${IDEOGRAPHIC_DOT}com`), {
    local: 'kiko',
    domain: 'gmail.com'
  })
  t.deepEqual(parseEmail(`kiko@gmail${HALFWIDTH_DOT}com`), {
    local: 'kiko',
    domain: 'gmail.com'
  })
  t.deepEqual(parseEmail('kiko@googlemail.com'), {
    local: 'kiko',
    domain: 'gmail.com'
  })
  t.deepEqual(parseEmail(`${LEFT_TO_RIGHT_MARK}kiko@gmail.com`), {
    local: 'kiko',
    domain: 'gmail.com'
  })
  t.deepEqual(parseEmail(`ki${VARIATION_SELECTOR}ko@gmail.com`), {
    local: 'kiko',
    domain: 'gmail.com'
  })
  t.deepEqual(parseEmail(`ki${VARIATION_SELECTOR_SUPPLEMENT}ko@gmail.com`), {
    local: 'kiko',
    domain: 'gmail.com'
  })
  t.deepEqual(parseEmail(`kiko@yopmail.com${ZERO_WIDTH_SPACE}`), {
    local: 'kiko',
    domain: 'yopmail.com'
  })
  t.deepEqual(parseEmail('"a@microlink.io"@yopmail.com'), {
    local: '"a@microlink.io"',
    domain: 'yopmail.com'
  })
})

test('parseEmail returns null for malformed input', t => {
  for (const email of ['', 'not-an-email', '@gmail.com', 'kiko@', 'kiko@...']) {
    t.is(parseEmail(email), null, email)
  }
})

test('parseEmail is also exported without a dataset', t => {
  t.is(createAbusive.parseEmail, parseEmail)
  t.is(createAbusive.createAbusive, createAbusive)
})

test('isFreeEmailDomain matches a provider and its subdomains', t => {
  for (const domain of [
    'gmail.com',
    'hotmail.com',
    'yopmail.com',
    'YOPMAIL.COM',
    'yopmail.com.',
    'sub.mailinator.com',
    'kiko.33mail.com'
  ]) {
    t.true(isFreeEmailDomain(domain), domain)
  }
  for (const domain of [
    'microlink.io',
    'company.co.uk',
    'aramamotorukayit.com',
    'gmail.com.evil.io'
  ]) {
    t.false(isFreeEmailDomain(domain), domain)
  }
})

test('isFreeEmail reads the domain of an address', t => {
  t.true(isFreeEmail('someone@yopmail.com'))
  t.true(isFreeEmail(`someone@yopmail${FULLWIDTH_DOT}com`))
  t.true(isFreeEmail(`someone@yo${SOFT_HYPHEN}pmail.com`))
  t.true(isFreeEmail('"a@microlink.io"@yopmail.com'))
  t.false(isFreeEmail('kiko@microlink.io'))
  t.false(isFreeEmail('not-an-email'))
})

test('createAbusive uses only the provided dataset', t => {
  const abusive = createAbusive({ dataset: new Set(['Corp-Mail.example.']) })
  t.true(abusive.isFreeEmail('someone@corp-mail.example'))
  t.true(abusive.isFreeEmailDomain('sub.corp-mail.example'))
  t.false(abusive.isFreeEmail('someone@gmail.com'))
})

test('createAbusive validates its options', t => {
  for (const invalid of [undefined, null, 42, 'gmail.com', {}]) {
    t.throws(
      () => createAbusive({ dataset: invalid }),
      { instanceOf: TypeError, message: /dataset/ },
      String(invalid)
    )
  }
  t.throws(() => createAbusive(), { instanceOf: TypeError })
  t.throws(() => createAbusive({ dataset, lookup: [] }), {
    instanceOf: TypeError,
    message: /lookup/
  })
})

test('isSibling catches numbered variants on any domain', t => {
  const siblings = [
    ['derek2@gmail.com', 'derek1@gmail.com'],
    ['derek3@gmail.com', 'derek@gmail.com'],
    ['1derek@hotmail.com', 'derek@hotmail.com'],
    ['destek6@aramamotorukayit.com', 'destek@aramamotorukayit.com'],
    ['Destek6@AramaMotoruKayit.com', 'destek1@aramamotorukayit.com'],
    ['de.stek-2@acme.com', 'destek@acme.com'],
    ['john.doe@acme.com', 'johndoe@acme.com']
  ]
  for (const [a, b] of siblings) t.true(isSibling(a, b), `${a} ~ ${b}`)
})

test('isSibling catches same-inbox tricks', t => {
  const siblings = [
    ['derek+promo@gmail.com', 'derek@gmail.com'],
    ['d.e.r.e.k@gmail.com', 'derek@gmail.com'],
    ['D.Erek+x@gmail.com', 'derek@gmail.com'],
    ['d.erek@googlemail.com', 'derek@googlemail.com'],
    ['derek@gmail.com', 'derek@googlemail.com'],
    [`d${CYRILLIC_SMALL_E}rek@gmail.com`, 'derek@gmail.com'],
    ['dérék@gmail.com', 'derek@gmail.com'],
    ['destek+6@acme.com', 'destek@acme.com'],
    ['destek+a@acme.com', 'destek+b@acme.com'],
    ['d.erek7+x@gmail.com', 'derek@gmail.com'],
    ['destek+6@aramamotorukayit.com', 'destek2@aramamotorukayit.com'],
    ['de_rek@acme.com', 'derek@acme.com'],
    [`destek${VARIATION_SELECTOR}6@acme.com`, 'destek@acme.com'],
    [`destek${VARIATION_SELECTOR_SUPPLEMENT}6@acme.com`, 'destek@acme.com'],
    [`destek${LEFT_TO_RIGHT_MARK}6@acme.com`, 'destek@acme.com']
  ]
  for (const [a, b] of siblings) t.true(isSibling(a, b), `${a} ~ ${b}`)
})

test('isSibling is also exported without a dataset', t => {
  t.is(createAbusive.isSibling, isSibling)
})

test('isSibling keeps different people, the same address and other domains apart', t => {
  const strangers = [
    ['destek1@aramamotorukayit.com', 'destek1@aramamotorukayit.com'],
    ['DESTEK1@aramamotorukayit.com', 'destek1@aramamotorukayit.com'],
    ['destek1@other.com', 'destek@aramamotorukayit.com'],
    ['destek1@sub.aramamotorukayit.com', 'destek@aramamotorukayit.com'],
    ['hello@microlink.io', 'joseba@microlink.io'],
    ['jane@gmail.com', 'john@gmail.com'],
    ['destekci@acme.com', 'destek@acme.com'],
    ['123@gmail.com', '456@gmail.com'],
    ['not-an-email', 'destek@acme.com']
  ]
  for (const [a, b] of strangers) t.false(isSibling(a, b), `${a} !~ ${b}`)
  t.true(
    isSibling(parseEmail('destek6@acme.com'), parseEmail('destek@acme.com'))
  )
})

test('findSibling returns the first registered sibling', async t => {
  const { lookup } = recordingLookup(
    'boss@gmail.com',
    null,
    'derek1@gmail.com',
    'derek2@gmail.com'
  )
  const { findSibling } = createAbusive({ dataset, lookup })
  t.is(await findSibling('derek3@gmail.com'), 'derek1@gmail.com')
  t.is(await findSibling('jane@gmail.com'), null)
  t.is(await findSibling('derek1@gmail.com'), 'derek2@gmail.com')
})

test('findSibling passes the canonical domain and a keyword to the lookup', async t => {
  const { targets, lookup } = recordingLookup()
  const { findSibling } = createAbusive({ dataset, lookup })
  await findSibling('Destek6@AramaMotoruKayit.COM.')
  await findSibling('derek.smithson7@gmail.com')
  await findSibling('derek+promotions@gmail.com')
  await findSibling('42ab@acme.com')
  await findSibling('smithson.derek@gmail.com')
  await findSibling('d.e.r.e.k@gmail.com')
  await findSibling('a1b2c@acme.com')
  await findSibling('abc.def@gmail.com')
  t.deepEqual(targets, [
    { domain: 'aramamotorukayit.com', keyword: 'destek' },
    { domain: 'gmail.com', keyword: 'smithson' },
    { domain: 'gmail.com', keyword: 'derek' },
    { domain: 'acme.com', keyword: 'ab' },
    { domain: 'gmail.com', keyword: 'smithson' },
    { domain: 'gmail.com', keyword: 'derek' },
    { domain: 'acme.com', keyword: 'abc' },
    { domain: 'gmail.com', keyword: 'abc' }
  ])
})

test('findSibling skips lookup entries that are not strings', async t => {
  const { findSibling } = createAbusive({
    dataset,
    lookup: () => [{ email: 'destek@acme.com' }, 42, 'destek@acme.com']
  })
  t.is(await findSibling('destek6@acme.com'), 'destek@acme.com')
})

test('findSibling still matches when format characters hide the mailbox', async t => {
  const { targets, lookup } = recordingLookup('destek@acme.com')
  const { findSibling } = createAbusive({ dataset, lookup })
  t.is(
    await findSibling(`destek${LEFT_TO_RIGHT_MARK}6@acme.com`),
    'destek@acme.com'
  )
  t.deepEqual(targets, [{ domain: 'acme.com', keyword: 'destek' }])
})

test('findSibling matches confusable and accented mailbox letters', async t => {
  const { targets, lookup } = recordingLookup('derek@gmail.com')
  const { findSibling } = createAbusive({ dataset, lookup })
  t.is(await findSibling(`d${CYRILLIC_SMALL_E}rek@gmail.com`), 'derek@gmail.com')
  t.is(await findSibling('dérék@googlemail.com'), 'derek@gmail.com')
  t.deepEqual(targets, [
    { domain: 'gmail.com', keyword: 'derek' },
    { domain: 'gmail.com', keyword: 'derek' }
  ])
})

test('findSibling reads sync, async and promised iterables', async t => {
  const email = 'destek6@acme.com'
  t.is(
    await createAbusive({
      dataset,
      lookup: () => ['destek@acme.com']
    }).findSibling(email),
    'destek@acme.com'
  )
  t.is(
    await createAbusive({
      dataset,
      lookup: () => asyncEmails('destek@acme.com')
    }).findSibling(email),
    'destek@acme.com'
  )
  t.is(
    await createAbusive({
      dataset,
      lookup: async () => ['destek@acme.com']
    }).findSibling(email),
    'destek@acme.com'
  )
})

test('findSibling never looks up what cannot be safely queried or matched', async t => {
  const { targets, lookup } = recordingLookup('destek@acme.com')
  const { findSibling } = createAbusive({ dataset, lookup })
  const unsafe = [
    'destek1@acme".com',
    'destek1@acme',
    'destek1@exa mple.com',
    'destek1@acme.com/x',
    `destek1@m${String.fromCodePoint(0xfc)}nchen.de`,
    'destek1@acme.com" OR email~"x',
    'des"tek1@acme.com',
    '"destek1"@acme.com',
    'destek\\1@acme.com',
    '12345@acme.com',
    'not-an-email',
    ''
  ]
  for (const email of unsafe) t.is(await findSibling(email), null, email)
  t.deepEqual(targets, [])
})

test('findSibling without a lookup rejects', async t => {
  await t.throwsAsync(
    createAbusive({ dataset }).findSibling('destek1@acme.com'),
    { instanceOf: TypeError, message: /lookup/ }
  )
})

test('findSibling stops after `limit` addresses', async t => {
  const strangers = Array.from({ length: 500 }, (_, index) =>
    `person${index}x@big.com`.replace(/\d/g, digit => 'abcdefghij'[digit])
  )
  const lookup = () => asyncEmails(...strangers, 'destek@big.com')
  t.is(
    await createAbusive({ dataset, lookup, limit: 500 }).findSibling(
      'destek1@big.com'
    ),
    null
  )
  t.is(
    await createAbusive({ dataset, lookup, limit: 501 }).findSibling(
      'destek1@big.com'
    ),
    'destek@big.com'
  )
  t.is(
    await createAbusive({ dataset, lookup }).findSibling('destek1@big.com'),
    'destek@big.com'
  )
})

test('findSibling lets a lookup failure reach the caller', async t => {
  const { findSibling } = createAbusive({
    dataset,
    lookup: () => {
      throw new Error('store down')
    }
  })
  await t.throwsAsync(findSibling('destek1@acme.com'), {
    message: 'store down'
  })
})
