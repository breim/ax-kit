# API catalog and API description

- **Reviewed:** 2026-11
- **Pillar:** Discover
- **Checks:** group `discover.api-description` = `discover.api-catalog`, `discover.service-desc-link`, `discover.openapi-path`
- **Template:** `assets/api-catalog.json`

## Why agents need it

An agent cannot call an API that it cannot find. A human reads the documentation site and copies a URL.
An agent needs a known location that lists the APIs and points to a machine-readable description of each one.

The group `discover.api-description` passes when one of its three members passes. The API catalog is the best of the three, because it is a standard location.

## Status of the standard

- The API catalog is RFC 9727, a stable IETF standard from June 2025.
- The `service-desc`, `service-doc`, `service-meta`, and `status` link relations are RFC 8631, stable.
- OpenAPI is stable. A file at `/openapi.json` is a convention, not a standard.

## Implement

### 1. Publish the API description

- Generate the OpenAPI file from the code. A file that a person edits by hand goes out of date.
- Serve it at a stable public URL. `/openapi.json` is the most common path.
- Serve JSON. If the project also has a YAML file, keep both. Many tools read only JSON, and the scanner assesses JSON first.
- `Content-Type`: `application/json` or `application/openapi+json`.
- Do not put the file behind a login.

For the content of the file, read [openapi-quality.md](openapi-quality.md).

### 2. Publish the catalog

RFC 9727 has these requirements:

- The path is `/.well-known/api-catalog`.
- A `GET` request returns a Linkset document with `Content-Type: application/linkset+json`.
- The media type should have the profile parameter `profile="https://www.rfc-editor.org/info/rfc9727"`.
- A `HEAD` request returns a `Link` header that contains `rel="api-catalog"`.
- The catalog must have links to the API endpoints.
- Serve the catalog over HTTPS only.

One entry for each API:

```json
{
  "linkset": [
    {
      "anchor": "https://api.acme.example/v1",
      "service-desc": [
        { "href": "https://api.acme.example/v1/openapi.json", "type": "application/openapi+json" }
      ],
      "service-doc": [
        { "href": "https://acme.example/docs/api", "type": "text/html" }
      ],
      "status": [
        { "href": "https://status.acme.example" }
      ]
    }
  ]
}
```

- `anchor` is the base URL of the API.
- `service-desc` points to the OpenAPI file.
- `service-doc` points to the documentation for humans.
- `status` points to the status page or the health endpoint.

Response headers:

```http
Content-Type: application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"
Link: </.well-known/api-catalog>; rel="api-catalog"
```

### 3. Point to the catalog

Add a `Link` header to the entry page of the site and to the root of the API:

```http
Link: </.well-known/api-catalog>; rel="api-catalog", </openapi.json>; rel="service-desc"
```

If the API has more than one version, give each version an entry in the catalog.

## Stack notes

- **FastAPI:** `/openapi.json` exists by default. Add a route for the catalog that builds the Linkset from `app.openapi_url`.
- **Hono and Elysia:** generate the OpenAPI file from the route schemas, then add one route for the catalog.
- **Next.js:** `app/.well-known/api-catalog/route.ts`. Set the `Content-Type` in the response, because the path has no extension.
- **Static host:** a file with no extension gets the wrong `Content-Type`. Set the header for that path in the host config.

For other stacks, read [stacks.md](stacks.md).

## Verify

```bash
curl -i -H 'Accept: application/linkset+json' https://<host>/.well-known/api-catalog
curl -I https://<host>/.well-known/api-catalog
```

- `discover.api-catalog` passes when the response is JSON with a `linkset` array that is not empty.
- `discover.service-desc-link` passes when a `service-desc` link on the entry page points to an API description.
- `discover.openapi-path` passes when an OpenAPI document is at a conventional path.

## Security notes

- Publish only the public API. Remove internal, admin, and partner operations from the public OpenAPI file.
- Do not publish server URLs of staging or internal environments.
- The catalog and the description need no credentials. The API operations keep their own authentication.

## Common mistakes

- **The wrong `Content-Type`.** A file with no extension is served as `application/octet-stream` or `text/html`.
- **An OpenAPI file that is one release behind the API.** Generate it in the build.
- **A catalog that points to an HTML documentation page as `service-desc`.** Use `service-doc` for HTML.
- **A catalog on the marketing host only.** An agent that starts at the API host does not find it. Publish it on each host, or add a `Link` header there.
