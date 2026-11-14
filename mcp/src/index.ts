#!/usr/bin/env node
// Stdio MCP server for the Media Terminal adverse media API (https://media.unbackoffice.com).
// Reads the API key from MEDIA_API_KEY. The search and classification run on Media Terminal's servers: every tool
// call is an HTTPS request to the API. A person or company search uses one search from the key; a vessel or port, two.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const VERSION = "0.1.0";
const BASE_URL = (process.env.MEDIA_API_URL || "https://media.unbackoffice.com").replace(/\/+$/, "");
const TOP_HITS = 10;

type Json = Record<string, unknown>;
type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const text = (body: unknown, isError = false): ToolResult => ({
  content: [{ type: "text", text: typeof body === "string" ? body : JSON.stringify(body, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

const NO_KEY =
  "MEDIA_API_KEY is not set. Get a free key at https://media.unbackoffice.com/key " +
  "(sign in with a work Google account) and add it to this server's environment.";

async function call(path: string, body: Json): Promise<{ ok: true; data: Json } | { ok: false; result: ToolResult }> {
  const key = process.env.MEDIA_API_KEY;
  if (!key) return { ok: false, result: text(NO_KEY, true) };
  let res: Response;
  try {
    res = await fetch(BASE_URL + path, {
      method: "POST",
      headers: {
        "X-API-Key": key,
        "Content-Type": "application/json",
        "User-Agent": `argus-media-mcp/${VERSION}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000), // a search usually takes 10 to 25 s
    });
  } catch (e) {
    return { ok: false, result: text(`Request to ${BASE_URL}${path} failed: ${(e as Error).message}`, true) };
  }
  const raw = await res.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* not JSON: keep the text */
  }
  if (!res.ok) {
    const detail = typeof parsed === "object" && parsed !== null && "detail" in parsed ? (parsed as Json).detail : parsed;
    const hint: Record<number, string> = {
      401: "The key is missing, invalid or revoked. Check MEDIA_API_KEY.",
      402: "The key has no searches left. See https://media.unbackoffice.com/tiers",
      403: "This key can't call that endpoint.",
      422: "The request was rejected as invalid.",
      429: "Rate limited. Wait a minute and retry.",
      502: "The search could not run and was given back. Retry shortly.",
      503: "The search could not run and was given back. Retry shortly.",
    };
    return { ok: false, result: text({ status: res.status, detail, hint: hint[res.status] }, true) };
  }
  return { ok: true, data: parsed as Json };
}

const HIT_FIELDS = ["headline", "source", "date", "url", "summary", "typologies", "severity", "about_subject"];

function summarise(d: Json): Json {
  const hits = Array.isArray(d.hits) ? (d.hits as Json[]) : [];
  const out: Json = {};
  for (const k of ["subject", "articles_reviewed", "overall"]) if (d[k] !== undefined) out[k] = d[k];
  out.hits = hits.slice(0, TOP_HITS).map((h) => {
    const o: Json = {};
    for (const k of HIT_FIELDS) if (h[k] !== undefined) o[k] = h[k];
    return o;
  });
  if (hits.length > TOP_HITS) out.more_hits = hits.length - TOP_HITS;
  for (const k of ["cache", "screened_at"]) if (d[k] !== undefined) out[k] = d[k];
  out.note = "A hit is a lead: read the articles before acting. none means nothing found in this search.";
  return out;
}

const server = new McpServer({ name: "argus-media", version: VERSION });

server.registerTool(
  "adverse_media_search",
  {
    title: "Search adverse media on a name",
    description:
      "Search news and the web for adverse media on a person, company, vessel or port via Media Terminal " +
      "(POST /v1/adverse-media). Articles are checked against the subject (namesakes left out) and mapped to FATF " +
      "offence categories. Returns overall.risk (severe, high, medium, low or none), adverse_hit, the typologies, " +
      "the reasoning and the adverse articles, most severe first. Takes 10 to 25 seconds. A person or company search " +
      "uses one search from the key, a vessel or port two. Give context (role, employer, city, IMO) to avoid namesakes.",
    inputSchema: {
      name: z.string().min(2).max(200).describe("The person, company, vessel or port, as written"),
      kind: z
        .enum(["person", "company", "vessel", "port"])
        .optional()
        .describe("What the subject is. Leave out and a name mentioning a yacht or ship is a vessel, else a person."),
      country: z.string().max(56).optional().describe("Country name or ISO code. Helps tell namesakes apart."),
      dob: z.string().max(10).optional().describe("Date of birth, YYYY-MM-DD. People only."),
      context: z
        .string()
        .max(500)
        .optional()
        .describe("Anything that identifies the subject: role, employer, city, flag, IMO number, former names"),
      full: z.boolean().optional().describe("Return the whole API response instead of a summary"),
    },
  },
  async ({ full, ...q }) => {
    const body: Json = {};
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") body[k] = v;
    const r = await call("/v1/adverse-media", body);
    if (!r.ok) return r.result;
    return text(full ? r.data : summarise(r.data));
  },
);

await server.connect(new StdioServerTransport());
