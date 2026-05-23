# mcp-composer

> **Orchestrate multiple MCP servers together.** Chain Shopify, Gmail, Notion, Klaviyo, and any other MCP server into multi-step AI workflows — with a single natural language prompt.

[![npm version](https://img.shields.io/npm/v/mcp-composer?style=flat)](https://www.npmjs.com/package/mcp-composer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-Compatible-blue?style=flat)](https://modelcontextprotocol.io)

Right now every MCP server is a silo. `mcp-composer` is a meta-server that chains them.

## The problem

```
# Today — you need 4 separate tools and 4 manual steps:
1. Open Notion → find client notes
2. Open Gmail → search related emails  
3. Open Shopify → create a discount
4. Open Klaviyo → schedule an email

# With mcp-composer — one prompt:
"Find my Notion notes about Ahmed, pull related Gmail threads,
 create a 20% Shopify discount for him, and schedule a Klaviyo
 follow-up email for tomorrow."
```

## Quickstart

```bash
npm install -g mcp-composer
```

Configure in `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "composer": {
      "command": "mcp-composer",
      "args": ["--config", "~/.mcp-composer/config.json"]
    }
  }
}
```

Configure your servers in `~/.mcp-composer/config.json`:

```json
{
  "servers": {
    "shopify": {
      "command": "shopify-mcp-server",
      "env": {
        "SHOPIFY_STORE_DOMAIN": "your-store.myshopify.com",
        "SHOPIFY_ACCESS_TOKEN": "shpat_xxx"
      }
    },
    "gmail": {
      "url": "https://gmail-mcp.example.com/sse",
      "headers": { "Authorization": "Bearer xxx" }
    },
    "notion": {
      "command": "notion-mcp-server",
      "env": { "NOTION_TOKEN": "secret_xxx" }
    },
    "klaviyo": {
      "command": "klaviyo-mcp-server",
      "env": { "KLAVIYO_API_KEY": "pk_xxx" }
    }
  }
}
```

Now Claude Code sees one unified composer server that can orchestrate all of them.

## Workflow examples

### E-commerce client follow-up
```
Find Notion notes tagged "vip-client" created this week,
cross-reference with Gmail for any replies from those clients,
create a 15% Shopify discount for each one who hasn't ordered
in 30 days, and add them to the Klaviyo "win-back" flow.
```

### Financial advisory (loan matching)
```
Read the PDF at ~/docs/bank_criteria.pdf,
search my Gmail for emails from client Ahmed about his loan,
extract his income and employment details,
then create a Notion page with a ranked bank comparison.
```

### Product launch workflow
```
Get the top 10 products from Shopify by sales this month,
draft a Klaviyo email campaign announcing the bestsellers,
create a Notion doc with the campaign brief,
and send me a Gmail summary.
```

## How it works

```
Claude → mcp-composer (meta-server)
              ↓
    ┌─────────────────────┐
    │  Workflow Planner    │  ← Claude breaks prompt into steps
    └─────────┬───────────┘
              ↓
    ┌─────────────────────┐
    │  Tool Router        │  ← Maps steps to correct MCP servers
    └─────────┬───────────┘
              ↓
    ┌──────────────────────────────────────┐
    │  shopify │ gmail │ notion │ klaviyo  │  ← Executes in parallel where possible
    └──────────────────────────────────────┘
              ↓
    ┌─────────────────────┐
    │  Result Aggregator  │  ← Combines outputs, passes context between steps
    └─────────────────────┘
```

## Features

- **Auto-discovery** — connects to any MCP server (stdio or SSE), reads their tool manifests automatically
- **Parallel execution** — independent steps run concurrently, dependent steps chain correctly
- **Context passing** — output of step 1 becomes input to step 2 automatically
- **Retry + fallback** — configurable retry logic per server
- **Dry run mode** — preview the execution plan before running
- **Audit log** — full JSON log of every tool call and result

## CLI

```bash
# Start the composer server (for Claude Code)
mcp-composer serve --config ~/.mcp-composer/config.json

# List all available tools across all connected servers
mcp-composer tools list

# Test a workflow without executing
mcp-composer run "create discount for vip customers" --dry-run

# Show execution plan
mcp-composer plan "find notion notes and send klaviyo email"
```

## Configuration reference

```json
{
  "servers": {
    "<name>": {
      "command": "...",          // stdio server command
      "args": [],                // command arguments
      "env": {},                 // environment variables
      "url": "...",             // OR: SSE server URL
      "headers": {},            // headers for SSE auth
      "timeout_ms": 30000,      // per-tool timeout
      "retry": { "attempts": 3, "delay_ms": 1000 }
    }
  },
  "composer": {
    "max_parallel": 5,           // max concurrent tool calls
    "audit_log": "~/.mcp-composer/audit.jsonl",
    "dry_run": false
  }
}
```

## Roadmap

- [ ] Web UI for workflow visualization
- [ ] Workflow templates library (e-commerce, CRM, finance)
- [ ] Conditional branching (if/else in workflows)
- [ ] Scheduled workflows (cron)
- [ ] Webhook triggers
- [ ] SaaS hosted version

## License

MIT © [Alper Nabil Gabra Zakher](https://github.com/AlperNab)

---

<div align="center">

**The missing layer between MCP servers.**

⭐ Star if you've ever wished your AI tools could talk to each other

</div>
