# CapyParse MCP Server

Convert PDF bank statements into verified, structured data (Markdown, JSON,
CSV, JSONL) from any MCP-compatible AI agent. Every transaction comes with
source citations (page/line of the original statement) and balance-verification
checks, so agents can audit the numbers they use.

Get an API key at [capyparse.com/dashboard/settings/api-keys](https://capyparse.com/dashboard/settings/api-keys).
Conversions cost 1 credit per page (new accounts include free credits).

## Two ways to connect

**Hosted (no install)** — streamable HTTP:

```
URL:    https://capyparse.com/mcp
Header: Authorization: Bearer cpk_live_...
```

**Local (this package)** — runs on your machine, so agents can convert local
files by path:

```bash
CAPYPARSE_API_KEY=cpk_live_... npx -y capyparse-mcp
```

## Install

### Claude Code

```bash
claude mcp add capyparse -e CAPYPARSE_API_KEY=cpk_live_... -- npx -y capyparse-mcp
# or hosted:
claude mcp add --transport http capyparse https://capyparse.com/mcp \
  --header "Authorization: Bearer cpk_live_..."
```

### Claude Desktop / Cursor / Windsurf

```json
{
  "mcpServers": {
    "capyparse": {
      "command": "npx",
      "args": ["-y", "capyparse-mcp"],
      "env": { "CAPYPARSE_API_KEY": "cpk_live_..." }
    }
  }
}
```

## Tools

| tool | description |
|---|---|
| `convert_bank_statement` | Start a conversion from a local `file_path` or a `file_url` |
| `get_conversion` | Poll status; completed conversions include per-account verification |
| `get_conversion_result` | Fetch transactions as markdown / json / csv / jsonl, with optional source citations (`provenance`) |
| `list_conversions` | Recent conversions for your team |
| `get_credits` | Remaining page credits |

## Example

> "Convert ~/Downloads/chase-january.pdf and give me the transactions as CSV."

The agent calls `convert_bank_statement(file_path=...)`, polls
`get_conversion`, then `get_conversion_result(format="csv")`.

Docs: [capyparse.com/developers](https://capyparse.com/developers)

## Releasing (maintainers)

Future releases: bump with `npm version patch` (or `minor`), then `npm publish`.

