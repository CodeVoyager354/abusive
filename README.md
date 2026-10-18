# abusive

<p align="center">
  <br>
  <img src="https://i.imgur.com/Mh13XWB.gif" alt="abusive">
  <br>
</p>

![Last version](https://img.shields.io/github/tag/kikobeats/abusive.svg?style=flat-square)
[![Coverage Status](https://img.shields.io/coveralls/kikobeats/abusive.svg?style=flat-square)](https://coveralls.io/github/kikobeats/abusive)
[![NPM Status](https://img.shields.io/npm/dm/abusive.svg?style=flat-square)](https://www.npmjs.org/package/abusive)

> Detect repeat signups abusing your free plan: numbered, +tag and dotted variants of addresses you already have, plus free email providers.

Free plans attract people who sign up again and again with addresses like these:

```
derek1@gmail.com
derek2@gmail.com
d.erek+3@gmail.com
destek1@aramamotorukayit.com
destek2@aramamotorukayit.com
```

**abusive** recognizes each as a **sibling** of an address you already have, so you can refuse the next one without banning the whole domain. Different people still sign up as usual: `jane@acme.com` and `john@acme.com`, or `jane@gmail.com` and `john@gmail.com`.

## Install

```bash
$ npm install abusive --save
```

**abusive** ships no domain list. Bring the one you trust, for example [free-email-domains](https://github.com/Kikobeats/free-email-domains):

```bash
$ npm install free-email-domains --save
```

## Usage

```js
const { findSibling, isFreeEmail } = require('abusive')({
  dataset: require('free-email-domains'),
  lookup: ({ domain, keyword }) => db.emailsAtDomain(domain, keyword)
})

async function signupRejection (email) {
  if (isFreeEmail(email)) return 'Sign up with your work email.'
  if (await findSibling(email)) return 'This email cannot be used to create an account.'
  return null
}

// signupRejection('someone@yopmail.com')          => 'Sign up with your work email.'
// signupRejection('destek6@aramamotorukayit.com') => 'This email cannot be used to create an account.'
// signupRejection('jane@acme.com')                => null
```

Keep the refusal message neutral. Saying that a similar account exists tells an attacker which addresses are registered.

## How it works

Two addresses are **siblings** when they are different addresses at the same domain with the same mailbox. The mailbox is the part before the `@` with any `+tag`, digits, `.`, `_` and `-` removed:

| Address | Mailbox |
|---|---|
| `derek@gmail.com` | `derek` |
| `derek2@gmail.com` | `derek` |
| `d.e.r.e.k+promo@gmail.com` | `derek` |
| `destek6@aramamotorukayit.com` | `destek` |
| `john.doe@acme.com` | `johndoe` |

This catches numbered variants (`derek1`, `derek2`), `+tag` subaddresses and Gmail's ignored dots in one rule:

| Candidate | Registered | Sibling? |
|---|---|---|
| `derek2@gmail.com` | `derek1@gmail.com` | yes |
| `d.erek7+x@gmail.com` | `derek@gmail.com` | yes |
| `d.e.r.e.k@gmail.com` | `derek@gmail.com` | yes |
| `destek6@aramamotorukayit.com` | `destek@aramamotorukayit.com` | yes |
| `destek+6@acme.com` | `destek@acme.com` | yes |
| `jane@gmail.com` | `john@gmail.com` | no, different mailbox |
| `destek1@sub.aramamotorukayit.com` | `destek@aramamotorukayit.com` | no, different domain |

Domains are compared exactly: `acme.com` and `sub.acme.com` are different, and so are `gmail.com` and `googlemail.com`.

It also matches people who happen to share a name: `john1990@gmail.com` is a sibling of `john@gmail.com`. A mailbox that is empty after the rule, such as `12345@gmail.com`, has no siblings, because unrelated people would all collapse into it.

Before comparing, every address is put in canonical form: Unicode NFKC, format characters and variation selectors removed, full-width dots (`。．｡`) read as `.`, trailing dots dropped, and everything lowercased.

## API

### abusive(options)

Returns an object with the methods below. Create it once and reuse it: the dataset is indexed when the object is created.

#### options

##### dataset

*Required*<br>
Type: `Iterable<string>`

The free and disposable email provider domains used by `isFreeEmail`, for example `require('free-email-domains')`. Domains are compared case-insensitively.

##### lookup

Type: `({ domain: string, keyword: string }) => Iterable<string> | AsyncIterable<string> | Promise<Iterable<string>>`

Returns the addresses already registered at `domain`. Required by `findSibling`.

- `domain` is canonical and always a plain hostname (`a-z`, `0-9`, `-` and dots).
- `keyword` is the longest run of letters in the candidate mailbox, like `destek` for `destek6`. When that run is shorter than 3 characters, `keyword` is the mailbox with separators removed, like `derek` for `d.e.r.e.k`. Most siblings contain it, so you can use it to narrow a large domain such as `gmail.com`. Returning every address at `domain` and ignoring `keyword` is always correct, just slower.

Both are safe to put in a query: `lookup` is never called for a malformed address or for one with characters outside `a-z`, `0-9`, `.`, `_`, `+` and `-`.

Entries that are not strings are skipped. An error it throws rejects `findSibling`; deciding whether to fail open is up to you.

##### limit

Type: `number`<br>
Default: `Infinity`

The maximum number of addresses `findSibling` reads from `lookup` before giving up. It bounds the work on domains with many registered users.

### .findSibling(email)

Returns a `Promise` that resolves to the first registered address that is a sibling of `email`, or `null`.

### .isSibling(candidate, existing)

Returns `true` when the two addresses are siblings. Each argument is an address string or the result of `parseEmail`.

Available on the instance and as `require('abusive').isSibling`.

### .isFreeEmail(email)

Returns `true` when the address is hosted by a provider in `dataset`.

### .isFreeEmailDomain(domain)

Returns `true` when the domain, or any parent of it, is in `dataset`.

### parseEmail(email)

Returns `{ local, domain }` in canonical form, split at the last `@`, or `null` when the address is malformed.

Available on the instance and as `require('abusive').parseEmail`.

## Lookups

### Stripe

Uses your Stripe customers as the registered addresses, through the [customer search API](https://docs.stripe.com/api/customers/search). Each lookup searches `email~"@<domain>" AND email~"<keyword>"`. When `keyword` is shorter than the 3 characters Stripe needs, it searches nothing: scanning a whole domain like `gmail.com` takes seconds, so short mailboxes such as `ab1@` are not checked. A dotted address is still checked: `d.e.r.e.k@gmail.com` is searched as `derek`.

```js
const Stripe = require('stripe')
const stripeLookup = require('abusive/stripe')

const { findSibling } = require('abusive')({
  dataset: require('free-email-domains'),
  lookup: stripeLookup(new Stripe(process.env.STRIPE_SECRET_KEY)),
  limit: 500
})
```

#### stripeLookup(client, [options])

##### client

*Required*<br>
Type: `Stripe | () => Stripe`

A Stripe client, or a function that returns one. The function is called on every lookup, so the client can be created lazily.

##### options

###### pageSize

Type: `number`<br>
Default: `100`

How many customers each search request returns. Pair it with `limit` to bound how many customers are read in total.

Stripe search can take about a minute to see a new customer, so two signups seconds apart can both pass. A registered address that splits the keyword, like `d.erek@gmail.com` for the keyword `derek`, is not found by the search.

## License

**abusive** © [Jose Francisco 'Kiko' Verdú Gambín](https://kikobeats.com), released under the [MIT](https://github.com/kikobeats/abusive/blob/master/LICENSE.md) License.<br>
Authored and maintained by [Jose Francisco 'Kiko' Verdú Gambín](https://kikobeats.com) with help from [contributors](https://github.com/kikobeats/abusive/contributors).

> [kikobeats.com](https://kikobeats.com) · GitHub [Jose Francisco 'Kiko' Verdú Gambín](https://github.com/kikobeats) · Twitter [@kikobeats](https://twitter.com/kikobeats)
