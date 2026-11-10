# Structured data and page structure

- **Reviewed:** 2026-11
- **Pillar:** Read
- **Checks:** `read.metadata`, `read.headings`, `read.structured-data`, `read.accessible-names`, `read.pricing` (Review)
- **Template:** none

## Why agents need it

An agent uses the title and the description to decide if a page is relevant. It uses the headings to find a section.
JSON-LD gives the agent facts, for example a price or the name of a product. The agent does not guess them from the layout.
An agent that drives a browser reads the accessibility tree. A form control with no name there has no meaning for the agent.

## Status of the standard

- JSON-LD 1.1 is a W3C Recommendation. The vocabulary is <https://schema.org/>. The two are stable.
- The `<title>` element, the `description` metadata name, and the `lang` attribute are in the HTML Standard.
- The rule of one `<h1>` for each page is a convention. The W3C WAI tutorial on headings says not to skip heading ranks.
- The rules for accessible names are in two W3C documents: "Accessible Name and Description Computation" and "HTML Accessibility API Mappings".
- Open Graph (<https://ogp.me/>) is a set of `<meta>` tags for a title, a type, an image, and a URL. It is not a replacement for JSON-LD.

## Implement

### 1. Add the metadata

```html
<html lang="en">
<head>
  <title>Pricing - Acme Invoices</title>
  <meta name="description" content="Acme Invoices has three plans. The Starter plan costs 19 USD for each month.">
</head>
```

- Give each page its own title and its own description.
- Put facts in the description. An agent reads it before it reads the body.
- Set `lang` to the language of the content, for example `en` or `pt-BR`.

### 2. Put the headings in order

- Use one `<h1>` for the subject of the page.
- Do not skip a level on the way down. `<h2>` then `<h4>` is a jump. `<h4>` then `<h2>` is correct, because it starts a new section.
- Do not select a heading level for its size. Use CSS for the size.

### 3. Add JSON-LD

Put a `<script type="application/ld+json">` element in the HTML that the server sends. Give each item an `@context` and an `@type`. Use `@graph` to put two or more items in one element.

| Profile | Types that fit |
|---|---|
| `content` | `Organization`, `WebSite`, `BreadcrumbList`, `FAQPage` |
| `webapp`, `api` | `SoftwareApplication` with `offers`, `Organization`, `FAQPage` |
| `commerce` | `Product` with `offers`, `BreadcrumbList`, `Organization` |

The organization and the site, on the home page:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "name": "Acme", "url": "https://acme.example", "logo": "https://acme.example/logo.png" },
    { "@type": "WebSite", "name": "Acme Invoices", "url": "https://acme.example", "inLanguage": "en" }
  ]
}
```

A product with its offer, on the product page:

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Trail shoe",
  "description": "A light shoe for trail running.",
  "sku": "TS-100",
  "brand": { "@type": "Brand", "name": "Acme" },
  "offers": { "@type": "Offer", "price": "89.90", "priceCurrency": "EUR", "availability": "https://schema.org/InStock" }
}
```

Questions and answers, and the position of the page in the site:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "FAQPage", "mainEntity": [
      { "@type": "Question", "name": "Is there a free plan?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. The free plan has 1 user." } }
    ] },
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "item": { "@id": "https://acme.example/docs", "name": "Docs" } },
      { "@type": "ListItem", "position": 2, "item": { "@id": "https://acme.example/docs/billing", "name": "Billing" } }
    ] }
  ]
}
```

### 4. Make the prices machine-readable

The Review check `read.pricing` uses this step.

- Publish one public page with each plan, its price, its currency, its billing period, and its limits.
- Write the prices as text in the HTML. Do not put them only in an image or in data that JavaScript loads.
- If a plan has a custom price, say so in text, and keep the public prices of the other plans.
- Add one `Offer` for each plan. Write the `price` with digits and a `.` as the decimal point. Do not put a currency symbol in it.
- Write `priceCurrency` as an ISO 4217 code. Use `unitText` in a `UnitPriceSpecification` for the billing period.

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Acme Invoices",
  "applicationCategory": "BusinessApplication",
  "offers": [
    { "@type": "Offer", "name": "Starter", "description": "1 user. 100 invoices for each month.", "price": "19.00", "priceCurrency": "USD",
      "priceSpecification": { "@type": "UnitPriceSpecification", "price": "19.00", "priceCurrency": "USD", "unitText": "month" } }
  ]
}
```

### 5. Give each form control a name

The scanner counts these controls: `select`, `textarea`, `button`, and `input`. It ignores the `input` types `hidden`, `submit`, `button`, `image`, and `reset`.
A control has a name from one of these sources:

- A `<label>` with a `for` attribute that is equal to the `id` of the control.
- A `<label>` with no `for` attribute that contains the control.
- An `aria-label` attribute, an `aria-labelledby` attribute, or a `title` attribute. Use `title` only when no other source is possible.
- For a `button`: its text, or the `alt` or `aria-label` of an element in it.

```html
<label for="email">Email</label>
<input id="email" type="email" name="email">
<label>Country <select name="country"><option>Brazil</option></select></label>
<input type="search" name="q" aria-label="Search the documentation">
<button type="button" aria-label="Close"><svg aria-hidden="true"></svg></button>
```

A placeholder is not a label. The HTML Standard says not to use a placeholder as an alternative to a label. The scanner does not count it.

## Stack notes

- **Next.js:** export `metadata` or `generateMetadata` from a layout or a page. Render the JSON-LD as a `<script>` element in the layout or the page.
- **Next.js with `generateMetadata`:** Next.js can stream the metadata tags into the `<body>`. The `htmlLimitedBots` option in the Next.js config controls that behavior.
- **Astro and static sites:** put the metadata and the JSON-LD in the layout component or the base template.
- **Commerce platforms:** many themes write `Product` JSON-LD. Check the HTML before you add a second item for the same product.
- **All stacks:** build the JSON-LD from the same data as the visible page.

For other stacks, read [stacks.md](stacks.md).

## Verify

```bash
curl -s https://<host>/ | grep -i -o -E '<html[^>]*>|<title>[^<]*|<meta name="description"[^>]*>'
curl -s https://<host>/ | grep -c 'application/ld+json'
node <skill-dir>/scripts/ax.mjs scan https://<host> --json
```

- `read.metadata` passes with a title, a meta description, and a `lang` attribute. Two of the three give a partial result.
- `read.headings` passes with one `<h1>` and no jump. One failed rule gives a partial result. Two failed rules, or no `<h1>`, give a failure.
- `read.structured-data` passes when one JSON-LD item is valid JSON and has an `@type`.
- `read.structured-data` is partial for JSON-LD with no valid item that has a type, and for `og:title` with `og:type` and no JSON-LD.
- `read.accessible-names` passes when 90% or more of the form controls have a name, or the page has no form control. It fails below 50%.
- For `read.pricing`, request the pricing page with `curl`, and compare the prices in the HTML with the prices in a browser.

## Security notes

- Make the structured data equal to the visible content. A price in JSON-LD that differs from the price on the page misleads the agent and the buyer.
- Do not add reviews, ratings, or offers that the page does not show.
- If the JSON-LD has text from users, replace `<` with `<` in the serialized JSON. That prevents a script injection.
- Write an `aria-label` that describes the control. Do not put instructions for agents in a label.

## Common mistakes

- **JSON-LD that JavaScript adds.** A tag manager adds the element in the browser, so the first HTML does not have it.
- **Invalid JSON.** A comma after the last property or a quote with no escape breaks the item.
- **No `@type`.** The item is valid JSON, but an agent cannot tell what it describes.
- **A price as display text.** `"price": "$19/mo"` is not a number. Use `"19.00"` and `priceCurrency`.
- **The same title and description on each page.** The agent cannot tell the pages apart.
- **Two `<h1>` elements.** The logo is one `<h1>` and the page title is a second one.
- **A control with no name.** A field has only a placeholder, or a button has only an icon.
