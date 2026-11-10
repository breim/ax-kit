# Agentic commerce

- **Reviewed:** 2026-11
- **Pillar:** Transact
- **Checks:** group `transact.payment-protocol` (Watch) = `transact.acp`, `transact.ucp`, `transact.x402`, `transact.mpp`
- **Template:** none

## Why agents need it

A checkout page is made for a person. It has a card form, a confirmation step in a bank app, and often a CAPTCHA.
An agent that buys for a user needs four things from a machine interface. It needs the payment method, the price, a limit that the user approved, and a receipt.
The payment protocols for agents give these things.

**This area changes fast.** Each fact below was read in 2026-11. Read the current specification before you implement a protocol.

## Status of the standard

No protocol in this playbook is a finished standard. All the Transact checks are in the Watch bucket, and they do not change the AX Score.

| Protocol | Maintainer | Status in 2026-11 | How an agent discovers it | Adopt it when |
|---|---|---|---|---|
| ACP, Agentic Commerce Protocol | OpenAI and Stripe | Beta. The last dated version is `2026-04-17` | `/.well-known/acp.json` | A store sells through agents that use ACP checkout |
| UCP, Universal Commerce Protocol | Google, Shopify, and other companies | Dated versions. The specification shows `2026-08-25` | The profile at `/.well-known/ucp` | A store wants one profile for checkout through REST, MCP, or A2A |
| x402 | The x402 Foundation | Version 2 | The 402 response of the paid URL | An API sells each request, and the buyers pay with a blockchain asset |
| MPP, Machine Payments Protocol | Tempo and Stripe. The core is the IETF draft `draft-httpauth-payment` | Internet-Draft, version 01 | The 402 response, and `x-payment-info` in the OpenAPI document | An API sells requests, sessions, or subscriptions with more than one payment method |
| AP2, Agent Payments Protocol | Google. The work continues in the FIDO Alliance | Version 0.2 | It has no discovery document. A UCP profile can declare it | A checkout needs signed proof of what the user approved |

## Implement

### 1. Publish prices that a machine can read

Put the price in structured data on each product page and each pricing page. Use the schema.org types `Product` and `Offer`.
Do this step first. It helps each agent, with or without a payment protocol. Read [structured-data.md](structured-data.md).

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Acme Pro plan",
  "offers": { "@type": "Offer", "price": "49.00", "priceCurrency": "USD", "availability": "https://schema.org/InStock" }
}
</script>
```

### 2. Select a protocol

- A store with a checkout selects ACP or UCP. Select the protocol that the agents of the buyers use.
- An API that sells each call selects x402 or MPP.
- A checkout that needs proof of the approval of the user adds AP2 mandates.
- Do not implement all the protocols. Each one is a payment surface that the team must secure and maintain.

### 3. ACP: publish the discovery document

Serve `/.well-known/acp.json` at the root of the origin, with `Content-Type: application/json` and no authentication.

```json
{
  "protocol": { "name": "acp", "version": "2026-04-17", "supported_versions": ["2026-04-17"] },
  "api_base_url": "https://acme.example/api",
  "transports": ["rest"],
  "capabilities": { "services": ["checkout"] }
}
```

- `protocol.name` is always `acp`. `protocol.version` is a date. `protocol.supported_versions` has the oldest version first.
- `transports` must contain `rest`. `capabilities.services` lists the services, for example `checkout`, `orders`, `carts`, and `delegate_payment`.
- Send `Cache-Control: public, max-age=3600` or longer.

### 4. UCP: publish the profile

Serve a JSON profile at `/.well-known/ucp`.

```json
{
  "ucp": {
    "version": "2026-08-25",
    "services": {
      "dev.ucp.shopping": [
        { "version": "2026-08-25", "transport": "rest", "endpoint": "https://acme.example/ucp/v1",
          "spec": "https://ucp.dev/2026-08-25/specification/overview/",
          "schema": "https://ucp.dev/2026-08-25/services/shopping/rest.openapi.json" }
      ]
    },
    "capabilities": {
      "dev.ucp.shopping.checkout": [
        { "version": "2026-08-25",
          "spec": "https://ucp.dev/2026-08-25/specification/shopping/checkout",
          "schema": "https://ucp.dev/2026-08-25/schemas/shopping/checkout.json" }
      ]
    },
    "payment_handlers": {}
  }
}
```

- `ucp.version`, `ucp.services`, and `ucp.payment_handlers` are required. The two registries must be present when they are empty.
- To declare AP2, add the capability `dev.ucp.common.payment.ap2_mandate`.

### 5. x402: answer with a payment requirement

Return status 402 with the header `PAYMENT-REQUIRED`. The value is the `PaymentRequired` object as base64 JSON.

```json
{
  "x402Version": 2,
  "resource": { "url": "https://api.acme.example/report" },
  "accepts": [{ "scheme": "exact", "network": "eip155:84532", "amount": "10000", "asset": "<token address>", "payTo": "<address>", "maxTimeoutSeconds": 60 }]
}
```

The client sends the request again with the header `PAYMENT-SIGNATURE`. The server answers with the header `PAYMENT-RESPONSE`.
Version 1 put the object in the response body and used the header `X-PAYMENT`. Use version 2 for new work.

### 6. MPP: answer with a Payment challenge

```http
HTTP/1.1 402 Payment Required
Cache-Control: no-store
WWW-Authenticate: Payment id="x7Tg2pLqR9mKvNwY3hBcZa", realm="api.acme.example", method="stripe", intent="charge", request="<base64url JSON>"
```

- The parameters `id`, `realm`, `method`, `intent`, and `request` are required.
- The client sends the request again with a Payment credential in the `Authorization` header. The server can return a `Payment-Receipt` header.
- The 402 challenge has the final payment terms. A price in the OpenAPI document is only a hint.
- For discovery, add `x-payment-info` to each paid operation of the OpenAPI document at `/openapi.json`:

```json
"x-payment-info": { "offers": [{ "amount": "100", "currency": "usd", "intent": "charge", "method": "stripe", "description": "One report" }] }
```

### 7. AP2: add mandates to a checkout

AP2 defines two signed credentials. The Checkout Mandate goes to the merchant.
The Payment Mandate goes to the credential provider, the payment networks, and the payment processor of the merchant.
AP2 works together with a checkout protocol. Read <https://ap2-protocol.org> for the current formats.

## Stack notes

- **Commerce platform:** find out if the platform already publishes an ACP or UCP document for the store. Do not add a second document.
- **Next.js:** `app/.well-known/ucp/route.ts`. Set the `Content-Type` in the response, because the path has no extension.
- **API framework:** return the 402 response from a middleware. The handler must not run for a request with no payment.

For other stacks, read [stacks.md](stacks.md).

## Verify

```bash
curl -s https://<host>/.well-known/acp.json
curl -s https://<host>/.well-known/ucp
curl -i https://<api-host>/<paid-path>
node <skill-dir>/scripts/ax.mjs scan https://<api-host>/<paid-path> --profile api --json
```

- `transact.acp` passes when the document has each required member. It is partial when `protocol.name` is `acp` and a required member is missing.
- `transact.ucp` passes when the profile has `ucp.version` as a date, `ucp.services`, and `ucp.payment_handlers`. It is partial when one of them is missing.
- `transact.x402` passes when the scanned URL returns status 402 with a version 2 `PAYMENT-REQUIRED` header. It is partial for a version 1 body.
- `transact.mpp` passes when the scanned URL returns status 402 with a complete `Payment` challenge. For the `api` profile, it also passes when an OpenAPI operation has `x-payment-info`.
- The x402 and MPP checks read only the scanned URL. Scan a paid URL to assess them.
- The scanner has no check for AP2, because the AP2 specification defines no discovery document.

Do not complete a payment on a live site to verify these checks.

## Security notes

- **Make the payment authorization explicit and bounded.** The user approves an amount, a currency, a merchant, and an end time. Reject a payment outside these limits.
- **Verify the mandate of the agent.** Check the signature, the issuer, the end time, and the binding to this checkout. Reject a mandate that was used before.
- **Do nothing for an unpaid request.** The request that gets the 402 response must not change data.
- **Accept an idempotency key** on each operation that takes a payment. A retry then does not pay two times.
- **Do not cache a challenge.** Send `Cache-Control: no-store` with a 402 response.
- **Do not log a payment credential.** It gives the power to move money.
- **Treat a published price as a hint.** The client must compare the amount, the currency, and the recipient in the challenge with what the user approved.
- Put no secret and no merchant identifier in a discovery document.

## Common mistakes

- **Too many protocols.** A team implements five protocols and maintains none of them.
- **A 402 response with only an HTML body.** The agent gets no payment requirement that it can parse.
- **A price that only a script or an image shows.** The agent cannot compare offers.
- **A discovery document behind bot protection or a login.** An agent must read the document with no credentials.
- **An old version or code from an article.** These protocols changed many times in 2026. Copy from the current specification.
