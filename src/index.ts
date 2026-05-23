#!/usr/bin/env node
/**
 * mcp-composer — orchestrate multiple MCP servers in one meta-server
 * Entry point: reads config, connects to all child servers, exposes unified tool list
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import { ServerManager } from "./servers/manager.js";
import { WorkflowPlanner } from "./composer/planner.js";
import { AuditLog } from "./composer/audit.js";

// ── Config loading ───────────────────────────────────────────────────────────

interface ComposerConfig {
  servers: Record<string, ServerConfig>;
  composer?: {
    max_parallel?: number;
    audit_log?: string;
    dry_run?: boolean;
  };
}

interface ServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  timeout_ms?: number;
  retry?: { attempts: number; delay_ms: number };
}

function loadConfig(configPath?: string): ComposerConfig {
  const paths = [
    configPath,
    join(homedir(), ".mcp-composer", "config.json"),
    join(process.cwd(), "mcp-composer.json"),
  ].filter(Boolean) as string[];

  for (const p of paths) {
    const resolved = resolve(p.replace("~", homedir()));
    if (existsSync(resolved)) {
      const raw = readFileSync(resolved, "utf-8");
      return JSON.parse(raw) as ComposerConfig;
    }
  }

  throw new Error(
    `No config found. Create ~/.mcp-composer/config.json\n` +
    `See: https://github.com/AlperNab/mcp-composer#configuration-reference`
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const configIdx = args.indexOf("--config");
  const configPath = configIdx >= 0 ? args[configIdx + 1] : undefined;

  let config: ComposerConfig;
  try {
    config = loadConfig(configPath);
  } catch (e: any) {
    console.error(`[mcp-composer] Config error: ${e.message}`);
    process.exit(1);
  }

  const auditLogPath = config.composer?.audit_log?.replace("~", homedir());
  const audit = new AuditLog(auditLogPath);
  const manager = new ServerManager(config.servers, config.composer?.max_parallel ?? 5);
  const planner = new WorkflowPlanner(manager);

  // Connect to all child MCP servers
  console.error(`[mcp-composer] Connecting to ${Object.keys(config.servers).length} servers...`);
  await manager.connectAll();
  console.error(`[mcp-composer] Ready — ${manager.totalTools} tools across ${manager.connectedCount} servers`);

  // Build the meta-server
  const server = new Server(
    { name: "mcp-composer", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // Expose all tools from all child servers, namespaced by server name
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: manager.getAllTools(),
  }));

  // Route tool calls to correct child server
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const start = Date.now();

    try {
      // Special composer tools
      if (name === "composer_run_workflow") {
        const prompt = (args as any)?.prompt as string;
        const dryRun = (args as any)?.dry_run as boolean ?? config.composer?.dry_run ?? false;
        const result = await planner.run(prompt, { dryRun });
        audit.log({ type: "workflow", prompt, duration_ms: Date.now() - start, dry_run: dryRun });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      if (name === "composer_list_servers") {
        return {
          content: [{
            type: "text",
            text: JSON.stringify(manager.getServerStatus(), null, 2),
          }],
        };
      }

      // Route to child server
      const result = await manager.callTool(name, args ?? {});
      audit.log({ type: "tool_call", tool: name, duration_ms: Date.now() - start });
      return result;

    } catch (error: any) {
      audit.log({ type: "error", tool: name, error: error.message, duration_ms: Date.now() - start });
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[mcp-composer] Fatal:", err);
  process.exit(1);
});
