# Bot access

- **Reviewed:** 2026-11
- **Pillar:** Reach
- **Checks:** `reach.plain-fetch` (gate), `reach.robots-txt`, `reach.user-agents-allowed`, `reach.bot-policy-explicit`, `reach.verified-agents` (Review), `reach.content-signals`, `reach.aipref`, `reach.training-crawler-policy`, `reach.branded-agent-fetch` (Watch)
- **Template:** `assets/robots.txt`

## Why agents need it

An agent that gets a CAPTCHA or a block page cannot continue, because no human is there to solve it.
An agent that finds no rule must guess what the owner permits. An explicit policy removes the guess.

Three types of AI client use a site. Give each type its own decision.

| Type | What it does | Tokens from the vendor documentation |
|---|---|---|
| Training crawler | Collects content to train a model | `GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot`, `Applebot-Extended`, `Meta-ExternalAgent`, `Amazonbot`, `MistralAI-Training` |
| Search crawler | Builds the index for AI search results | `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, `Meta-WebIndexer`, `Amzn-SearchBot`, `MistralAI-Index` |
| User-directed agent | Gets one page because a person asked for it | `ChatGPT-User`, `Claude-User`, `Perplexity-User`, `Meta-ExternalFetcher`, `Amzn-User`, `MistralAI-User` |

The policy is the decision of the owner. A block on training crawlers is a valid decision, and it does not decrease the AX Score.

## Status of the standard

- `robots.txt` is RFC 9309, a stable IETF standard. It is a request to the client. It is not access control.
- Each vendor publishes its tokens. The vendors add tokens and change them. Read the vendor page before you copy a token.
- The documentation of OpenAI, Perplexity, and Google says that a fetch for a user does not always obey `robots.txt`.
- The Google documentation gives no `robots.txt` token for `Google-Agent`. Control that agent in the bot protection.
- Content Signals is a `robots.txt` directive from Cloudflare. Its source is <https://contentsignals.org/>. It is not an IETF standard. It is emerging.
- AIPREF is an IETF working group. Its documents are drafts: `draft-ietf-aipref-vocab-08` and `draft-ietf-aipref-attach-05`.
- The vocabulary draft says that its main sections have no consensus yet. The labels can change.
- Web Bot Auth is an IETF working group. Its protocol document is `draft-ietf-webbotauth-httpsig-protocol-01`. It uses HTTP Message Signatures, RFC 9421, which is stable.

## Implement

### 1. Get the decision of the owner

Ask the owner for one decision for each type of client: allow or block.
If the site has a block on training crawlers, keep it unless the user asks for a change.

### 2. Write robots.txt

Start from `assets/robots.txt`. Use one group for each type of client.

```
User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no
Allow: /
Disallow: /admin/

User-agent: ChatGPT-User
User-agent: Claude-User
User-agent: Perplexity-User
Allow: /
Disallow: /admin/

User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
Disallow: /

Sitemap: https://acme.example/sitemap.xml
```

- A client reads only the group that has its token. It reads the `*` group when no group has its token.
- Repeat the `Disallow` lines of the `*` group in each named group that allows access.
- Serve the file at `/robots.txt` with status 200 and `Content-Type: text/plain`.
- `Google-Extended` and `Applebot-Extended` are control tokens. They send no requests of their own.

### 3. Add Content Signals

Put one `Content-Signal` line in a group. The line is a list of `key=value` pairs with commas between them.

| Key | Use that it controls |
|---|---|
| `search` | A search index and search results with links and short excerpts. It does not include AI summaries. |
| `ai-input` | Input to an AI model for an answer, for example retrieval augmented generation or grounding |
| `ai-train` | Training or fine-tuning of AI models |

- The values are `yes` and `no`. Write the keys and the values in lowercase.
- A key that is absent gives no permission and no restriction.
- A path before the pairs limits the line to that path: `Content-Signal: /blog/ ai-train=no`.

### 4. Add AIPREF preferences (emerging)

AIPREF states a preference in `robots.txt` or in a response header. The name is `Content-Usage` in the two locations.

```
User-agent: *
Allow: /
Content-Usage: train-ai=n
Content-Usage: /ai-ok/ train-ai=y
```

```http
Content-Usage: train-ai=n, search=y
```

- The labels are `train-ai`, `ai-use`, and `search`. The values are `y` and `n`. The labels are case sensitive.
- The header applies to the content of that response. The rule applies to the paths that the client can crawl.
- Content Signals and AIPREF have similar keys, but they are different vocabularies. If you publish the two, give them the same decision.

### 5. Let permitted agents through the bot protection

1. Find the layer that sends the challenge: the CDN, the WAF, or a bot manager.
2. Keep the protection on. Add a rule that skips the challenge only for a verified agent.
3. Verify the agent with one of these methods: the verified bot list of the CDN, the IP ranges of the vendor, or a signature.

| Agent | Published IP ranges |
|---|---|
| `ChatGPT-User` | <https://openai.com/chatgpt-user.json> |
| `Claude-User` | <https://claude.com/crawling/bots.json> |
| `Perplexity-User` | <https://www.perplexity.ai/perplexity-user.json> |
| `Google-Agent` | <https://developers.google.com/static/crawling/ipranges/user-triggered-agents.json> |

A rule for IP ranges has two conditions: the user-agent string contains the token, and the source IP is in the range.
Update the ranges on a schedule, because the vendors change them.

### 6. Verify signed agents with Web Bot Auth

A signed agent sends three headers with each request:

```http
Signature: sig=:<signature bytes>:
Signature-Input: sig=("@authority" "signature-agent";key="sig");created=1700000000;expires=1700011111;keyid="<JWK thumbprint>";tag="web-bot-auth"
Signature-Agent: sig="https://signer.example.com"
```

To verify a request, the site does these steps:

1. Make sure that `tag` is `web-bot-auth`, and that the time is between `created` and `expires`.
2. Get the key set (a JWKS) from the HTTPS URL in `Signature-Agent`. Cache it.
3. Find the key that `keyid` names. Verify the signature as RFC 9421 section 3.2 specifies.
4. Apply the policy of the site to the URL in `Signature-Agent`.

Do the verification at the CDN when the CDN has this feature. If the origin does it, use a library for RFC 9421.
To ask a client for a signature, send the `Accept-Signature` header.

## Stack notes

- **Next.js:** `app/robots.ts` generates the file. From version 16.3.0, the `other` field of a rule adds a `Content-Signal` line. For an earlier version, use a static `app/robots.txt`.
- **Astro and static sites:** put `robots.txt` in the public directory.
- **Cloudflare:** a zone can add managed content before the `robots.txt` of the origin. Read the file at the production URL, and make sure that the two parts agree.
- **Other CDN or WAF:** find the list of verified bots in the documentation of the product. Use that list in the rule that skips the challenge.

For other stacks, read [stacks.md](stacks.md).

## Verify

```bash
curl -i https://<host>/robots.txt
curl -s -o /dev/null -w '%{http_code}\n' https://<host>/
node <skill-dir>/scripts/ax.mjs scan https://<host> --json
```

- `reach.plain-fetch` passes when a plain request gets the entry URL with no challenge.
- `reach.robots-txt` passes when `/robots.txt` is a text file with one `User-agent` group or more.
- `reach.user-agents-allowed` passes when `robots.txt` allows `ChatGPT-User`, `Claude-User`, `Perplexity-User`, and `*` on the entry path.
- `reach.bot-policy-explicit` passes when a group names an AI client, or when the file has a `Content-Signal` or `Content-Usage` line.
- `reach.content-signals` and `reach.aipref` pass when the line or the header has one valid pair or more.
- `reach.training-crawler-policy` and `reach.branded-agent-fetch` are observations. They have no verdict.
- For `reach.verified-agents`, show the rule that skips the challenge and one log entry of a verified agent.

## Security notes

- A user-agent string is easy to copy. Do not allow a client because of its user-agent string only.
- Verify an agent by its signature or by the published IP ranges of the vendor.
- Do not turn off the bot protection to pass a check. Add a narrow rule for verified agents.
- `robots.txt` is public, and a client can ignore it. Protect private content with authentication, and do not list secret paths.
- A valid signature shows who has the key. It does not show that the request is safe. Keep the rate limits and the authorization checks.

## Common mistakes

- **`Disallow: /` in the `*` group with no group for user-directed agents.** The file then blocks each agent that a person sends.
- **A blocklist that names all AI tokens.** A list for training crawlers that includes `ChatGPT-User` or `Claude-User` also blocks user requests.
- **A named group that does not repeat the `Disallow` lines.** The client of that group can then crawl the paths that the `*` group blocks.
- **A soft 404.** The server returns an HTML page with status 200 for `/robots.txt`, and the client finds no rules.
- **A rule that allows by user-agent string only.** Each client that copies the string gets through.
- **IP ranges that are out of date.** The rule then challenges the real agent.
