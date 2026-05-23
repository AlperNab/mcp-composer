/**
 * ServerManager — connects to child MCP servers, discovers their tools,
 * and routes tool calls to the right server.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";

interface ServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  timeout_ms?: number;
  retry?: { attempts: number; delay_ms: number };
}

interface ConnectedServer {
  name: string;
  client: Client;
  tools: Tool[];
  status: "connected" | "error";
  error?: string;
}

export class ServerManager {
  private servers: Map<string, ConnectedServer> = new Map();
  private toolToServer: Map<string, string> = new Map();
  private composerTools: Tool[];

  constructor(
    private configs: Record<string, ServerConfig>,
    private maxParallel: number = 5
  ) {
    this.composerTools = [
      {
        name: "composer_run_workflow",
        description:
          "Run a multi-step workflow across multiple MCP servers. Describe what you want in plain English — the composer will plan and execute the steps across the connected servers automatically.",
        inputSchema: {
          type: "object" as const,
          required: ["prompt"],
          properties: {
            prompt: {
              type: "string",
              description: "Natural language description of the workflow to execute",
            },
            dry_run: {
              type: "boolean",
              description: "If true, show the execution plan without running it",
              default: false,
            },
          },
        },
      },
      {
        name: "composer_list_servers",
        description: "List all connected MCP servers, their status, and the number of tools each exposes.",
        inputSchema: { type: "object" as const, properties: {} },
      },
    ];
  }

  async connectAll(): Promise<void> {
    const names = Object.keys(this.configs);

    // Connect in batches to respect maxParallel
    for (let i = 0; i < names.length; i += this.maxParallel) {
      const batch = names.slice(i, i + this.maxParallel);
      await Promise.all(batch.map((name) => this.connect(name, this.configs[name])));
    }
  }

  private async connect(name: string, config: ServerConfig): Promise<void> {
    const client = new Client({ name: `composer-${name}`, version: "0.1.0" }, { capabilities: {} });

    try {
      let transport;

      if (config.url) {
        // SSE transport
        transport = new SSEClientTransport(new URL(config.url), {
          requestInit: { headers: config.headers ?? {} },
        });
      } else if (config.command) {
        // Stdio transport
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args ?? [],
          env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
        });
      } else {
        throw new Error(`Server '${name}' needs either 'command' or 'url'`);
      }

      await client.connect(transport);
      const { tools } = await client.listTools();

      // Namespace tools: shopify_list_products stays as-is if unique,
      // otherwise prefixed with server name
      const namespacedTools = tools.map((t) => ({
        ...t,
        // Add server tag to description
        description: `[${name}] ${t.description}`,
      }));

      // Register tool→server mapping
      for (const tool of namespacedTools) {
        this.toolToServer.set(tool.name, name);
      }

      this.servers.set(name, { name, client, tools: namespacedTools, status: "connected" });
      console.error(`[mcp-composer] ✓ ${name} — ${tools.length} tools`);

    } catch (error: any) {
      console.error(`[mcp-composer] ✗ ${name} — ${error.message}`);
      this.servers.set(name, {
        name,
        client,
        tools: [],
        status: "error",
        error: error.message,
      });
    }
  }

  getAllTools(): Tool[] {
    const childTools: Tool[] = [];
    for (const server of this.servers.values()) {
      if (server.status === "connected") {
        childTools.push(...server.tools);
      }
    }
    return [...this.composerTools, ...childTools];
  }

  async callTool(toolName: string, args: Record<string, unknown>) {
    const serverName = this.toolToServer.get(toolName);
    if (!serverName) {
      throw new Error(`Tool '${toolName}' not found in any connected server`);
    }

    const server = this.servers.get(serverName);
    if (!server || server.status !== "connected") {
      throw new Error(`Server '${serverName}' is not connected`);
    }

    return await server.client.callTool({ name: toolName, arguments: args });
  }

  async callToolOnServer(serverName: string, toolName: string, args: Record<string, unknown>) {
    const server = this.servers.get(serverName);
    if (!server || server.status !== "connected") {
      throw new Error(`Server '${serverName}' is not connected`);
    }
    return await server.client.callTool({ name: toolName, arguments: args });
  }

  getServerStatus() {
    const result: Record<string, object> = {};
    for (const [name, server] of this.servers) {
      result[name] = {
        status: server.status,
        tools: server.tools.length,
        error: server.error,
      };
    }
    return result;
  }

  get totalTools(): number {
    let n = this.composerTools.length;
    for (const s of this.servers.values()) n += s.tools.length;
    return n;
  }

  get connectedCount(): number {
    let n = 0;
    for (const s of this.servers.values()) if (s.status === "connected") n++;
    return n;
  }

  getConnectedServers() {
    return Array.from(this.servers.values()).filter((s) => s.status === "connected");
  }
}
