// Search adverse media on one name with the Media Terminal API and print the risk and the articles.
//   export MEDIA_API_KEY=...       # free key: https://media.unbackoffice.com/key (work Google account)
//   npx tsx search.ts "Jane Example" person GB "CEO, Example Trading Ltd"
export {};

const BASE_URL = (process.env.MEDIA_API_URL || "https://media.unbackoffice.com").replace(/\/+$/, "");

const [name, kind, country, context] = process.argv.slice(2);
const key = process.env.MEDIA_API_KEY;
if (!name) {
  console.error("usage: search.ts <name> [kind] [country] [context]");
  process.exit(2);
}
if (!key) {
  console.error("Set MEDIA_API_KEY. Get a free key at https://media.unbackoffice.com/key");
  process.exit(2);
}

const body: Record<string, string> = { name };
if (kind) body.kind = kind;
if (country) body.country = country;
if (context) body.context = context;

const res = await fetch(`${BASE_URL}/v1/adverse-media`, {
  method: "POST",
  headers: { "X-API-Key": key, "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(120_000),
});
const data = await res.json().catch(() => null);
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${JSON.stringify(data?.detail ?? data)}`);
  process.exit(1);
}
const o = data.overall || {};
console.log(`risk:       ${o.risk}  (adverse hit: ${o.adverse_hit})`);
console.log(`typologies: ${(o.typology_labels || []).join(", ") || "-"}`);
console.log(`articles:   ${data.articles_reviewed} read  (searched ${data.screened_at})`);
console.log(`why:        ${o.rationale}`);
for (const h of (data.hits || []).slice(0, 10)) console.log(`  [${h.severity}] ${h.date}  ${h.headline}  ${h.url}`);
