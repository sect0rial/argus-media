# argus-media

Media Terminal is an HTTP API that searches news and the web for adverse media on a person, company, vessel or port. Each article is checked against your subject, namesakes are left out, and the adverse ones are mapped to a FATF offence category.
This repo holds the API spec, short client examples and a small MCP server. The search and classification engine is not in this repo.

- API docs: https://media.unbackoffice.com/docs
- Plain-text guide for agents: https://media.unbackoffice.com/llms.txt
- Tiers: https://media.unbackoffice.com/tiers
- Free key: https://media.unbackoffice.com/key (sign in with a work Google account)

## Try it

```sh
export MEDIA_API_KEY=...   # your key

curl -s https://media.unbackoffice.com/v1/adverse-media \
  -H "X-API-Key: $MEDIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Jane Example", "kind": "person", "country": "GB", "context": "CEO, Example Trading Ltd"}'
```

A search usually takes 10 to 25 seconds. Set your HTTP timeout to at least 60 seconds.

## Endpoint

Base URL `https://media.unbackoffice.com`. Send the key in the `X-API-Key` header.

| Method | Path | Body |
|---|---|---|
| POST | `/v1/adverse-media` | `name` (required, 2 to 200 chars), `kind` (`person`, `company`, `vessel` or `port`), `country`, `dob` (`YYYY-MM-DD`), `context` (up to 500 chars: role, employer, city, flag, IMO number, former names) |

Leave `kind` out and a name that mentions a yacht or ship is searched as a vessel, anything else as a person. `context` is the best way to avoid namesakes.

The full spec is in [`openapi.json`](openapi.json).

## Response

Trimmed.

```json
{
  "subject": {"name": "Jane Example", "country": "GB", "dob": null, "kind": "person"},
  "articles_reviewed": 24,
  "overall": {
    "adverse_hit": true,
    "risk": "high",
    "typologies_hit": ["fraud"],
    "typology_labels": ["Fraud"],
    "rationale": "Two reports describe a fraud charge against the CEO of Example Trading Ltd …",
    "disambiguation": "Matched on the employer and city; a namesake athlete was excluded.",
    "coverage_note": ""
  },
  "hits": [
    {
      "headline": "Example Trading chief charged over investor fraud",
      "source": "example-news.com",
      "date": "2026-03-14",
      "url": "https://example-news.com/…",
      "summary": "Charged with fraud over a 2024 investment scheme.",
      "typologies": ["fraud"],
      "severity": 4,
      "about_subject": "high"
    }
  ],
  "screened_at": "2026-10-12T09:30:00Z"
}
```

- `overall.risk`: `severe`, `high`, `medium`, `low` or `none`, from the most severe adverse article about the subject.
- `hits[]`: the adverse articles, most severe first. `severity` runs from 1 to 5. `about_subject` is `high` or `medium`; articles not about the subject are left out.
- `overall.coverage_note` is set when the web search returned nothing and only the news archive was read. Search again later before you rely on `none`.
- For a vessel, `overall` also gives the `owner` named in the coverage, with `owner_role`, `owner_confidence` and `owner_basis` (the article wording it rests on).
- A port result counts only financial crime at or through that port.

A hit is a lead. Read the articles before you act on it, and treat `none` as "nothing found in this search", not as proof there is nothing.

## Limits

- Your first key comes with free searches (the number is on https://media.unbackoffice.com/docs). A person or company search counts as 1, a vessel or port search as 2.
- Invalid requests (`422`) are not charged. A search that could not run (`502`/`503`) is given back.
- Too many requests per minute for a key or an IP gets `429`.
- More searches: https://media.unbackoffice.com/tiers

| Status | Meaning |
|---|---|
| 401 | Missing, invalid or revoked key |
| 402 | No searches left on the key |
| 403 | The key can't call that endpoint |
| 422 | Invalid request, e.g. a one-letter name |
| 429 | Too many requests. Wait and retry |
| 502 / 503 | The search could not run and was given back. Retry shortly |

Errors are JSON with a `detail` field.

## Your data

The name and details you search are sent to news and web search providers to find coverage, and to Anthropic to read it. Reports are kept under your account for 12 months. You need a lawful basis to search a person, such as customer due diligence. Adverse media is not a credit, employment or tenant check. See https://media.unbackoffice.com/terms and https://media.unbackoffice.com/privacy.

## Examples

Both read `MEDIA_API_KEY`, search one name and print the risk and the articles.

```sh
# Python 3.9+, needs requests
pip install requests
python examples/python/search.py "Jane Example" --kind person --country GB --context "CEO, Example Trading Ltd"

# TypeScript, Node 18+, no dependencies
npx tsx examples/typescript/search.ts "Jane Example" person GB "CEO, Example Trading Ltd"
```

## MCP server

A stdio MCP server that wraps the API, so an MCP client can search adverse media. It runs straight from GitHub with `npx`.
Each call uses searches from your key as above.

Tool:

- `adverse_media_search`: `name`, optional `kind`, `country`, `dob`, `context` and `full`. Returns the subject, the overall risk and reasoning and the top 10 articles, or the whole response with `full: true`.

**Claude Code**

```sh
claude mcp add argus-media -e MEDIA_API_KEY=your-key -- npx -y github:sect0rial/argus-media
```

**Claude Desktop** (`claude_desktop_config.json`) and **Cursor** (`~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project) take the same block:

```json
{
  "mcpServers": {
    "argus-media": {
      "command": "npx",
      "args": ["-y", "github:sect0rial/argus-media"],
      "env": { "MEDIA_API_KEY": "your-key" }
    }
  }
}
```

Restart the client after editing the file.

From a clone:

```sh
npm install
npm run build          # compiles mcp/src to mcp/dist (mcp/dist is committed, so npx needs no build step)
npm run verify         # starts the server, runs initialize and tools/list, calls adverse_media_search once
```

`MEDIA_API_URL` overrides the base URL. It defaults to `https://media.unbackoffice.com`.

## openapi.json

Saved from the live service and pretty-printed:

```sh
curl -s https://media.unbackoffice.com/openapi.json | python3 -m json.tool --indent 2 --no-ensure-ascii > openapi.json
```

Fetched on 14 November 2026. The live document is the reference if the two differ.

## What is not here

The search, matching and classification run on Media Terminal's servers. They are not in this repo and not under its licence.

## Licence

The code in this repo is MIT licensed. See [LICENSE](LICENSE).
