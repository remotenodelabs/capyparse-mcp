#!/usr/bin/env node
/**
 * CapyParse MCP server (stdio).
 *
 * Thin client of the CapyParse public API — converts PDF bank statements to
 * verified, structured data. Unlike the hosted server at
 * https://capyparse.com/mcp, this one runs on the agent's machine and can
 * therefore read local files (file_path).
 *
 * Env:
 *   CAPYPARSE_API_KEY  (required) — create at capyparse.com/dashboard/settings/api-keys
 *   CAPYPARSE_API_URL  (optional) — defaults to https://capyparse.com
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = (process.env.CAPYPARSE_API_URL || "https://capyparse.com").replace(/\/$/, "");
const API_KEY = process.env.CAPYPARSE_API_KEY;

function requireKey(): string {
  if (!API_KEY) {
    throw new Error(
      "CAPYPARSE_API_KEY is not set. Create an API key at " +
        "https://capyparse.com/dashboard/settings/api-keys and export it."
    );
  }
  return API_KEY;
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${requireKey()}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: { message?: string } | string };
      const detail = body?.detail;
      message = typeof detail === "string" ? detail : detail?.message || message;
    } catch {
      // keep the status line
    }
    throw new Error(`CapyParse API error: ${message}`);
  }
  return response;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

async function jsonText(response: Response) {
  return textResult(JSON.stringify(await response.json(), null, 2));
}

const server = new McpServer({
  name: "capyparse",
  version: "0.1.0",
});

server.registerTool(
  "convert_bank_statement",
  {
    description:
      "Convert a PDF bank statement with CapyParse. Pass a local file_path or a " +
      "downloadable file_url. Costs 1 credit per page. Returns a conversion id — " +
      "poll get_conversion until status is 'completed' (typically 1-3 minutes, " +
      "wait ~30s between polls), then call get_conversion_result.",
    inputSchema: {
      file_path: z.string().optional().describe("Path to a local PDF/PNG/JPG file"),
      file_url: z.string().optional().describe("Downloadable http(s) URL of the statement"),
    },
  },
  async ({ file_path, file_url }) => {
    if (!file_path && !file_url) {
      throw new Error("Provide file_path or file_url.");
    }
    let response: Response;
    if (file_path) {
      const bytes = await readFile(file_path);
      const form = new FormData();
      form.set("file", new Blob([bytes], { type: "application/pdf" }), basename(file_path));
      response = await api("/api/v1/conversions", { method: "POST", body: form });
    } else {
      response = await api("/api/v1/conversions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_url }),
      });
    }
    return jsonText(response);
  }
);

server.registerTool(
  "get_conversion",
  {
    description:
      "Check a conversion's status (queued | processing | completed | failed). " +
      "When completed, includes a per-account summary with verification status.",
    inputSchema: {
      conversion_id: z.string(),
    },
  },
  async ({ conversion_id }) =>
    jsonText(await api(`/api/v1/conversions/${encodeURIComponent(conversion_id)}`))
);

server.registerTool(
  "get_conversion_result",
  {
    description:
      "Fetch the converted transactions for a completed conversion. " +
      "format: markdown (default, ready-to-read tables), json (signed amounts: " +
      "deposits positive / withdrawals negative), csv, or jsonl. " +
      "provenance: none | summary (default — page/line citations, verbatim source " +
      "text, verification status per row) | full (adds per-field sources).",
    inputSchema: {
      conversion_id: z.string(),
      format: z.enum(["markdown", "json", "csv", "jsonl"]).default("markdown"),
      provenance: z.enum(["none", "summary", "full"]).default("summary"),
      account: z.number().int().min(0).optional().describe("Account index for multi-account statements"),
    },
  },
  async ({ conversion_id, format, provenance, account }) => {
    const params = new URLSearchParams({ format, provenance });
    if (account !== undefined) params.set("account", String(account));
    const response = await api(
      `/api/v1/conversions/${encodeURIComponent(conversion_id)}/result?${params}`
    );
    return textResult(await response.text());
  }
);

server.registerTool(
  "list_conversions",
  {
    description:
      "List the team's recent conversions (newest first), including ones started " +
      "from the CapyParse dashboard. Use this to find a conversion id.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).default(10),
    },
  },
  async ({ limit }) => jsonText(await api(`/api/v1/conversions?limit=${limit}`))
);

server.registerTool(
  "get_credits",
  {
    description:
      "Check remaining CapyParse credits (1 credit = 1 statement page). Call " +
      "before converting large documents or after an insufficient-credits error.",
    inputSchema: {},
  },
  async () => jsonText(await api("/api/v1/me"))
);

const transport = new StdioServerTransport();
await server.connect(transport);
