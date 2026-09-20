import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AuditManager } from "./audit.js";
import { config } from "./config.js";
import { RemoteFoundryConnector } from "./remote-connector.js";
import { callTool, listTools } from "./tools.js";

const connector = new RemoteFoundryConnector({ url: config.mcpConnectorUrl, token: config.mcpConnectorToken, queryTimeoutMs: config.queryTimeoutMs });
const audit = new AuditManager({ auditLogPath: config.auditLogPath, backupDir: config.backupDir });
const server = new Server({ name: "foundry-mcp-connector-client", version: "0.2.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools() }));
server.setRequestHandler(CallToolRequestSchema, async (request) => callTool(request.params.name, request.params.arguments ?? {}, { connector, audit }));

async function main() {
  await audit.ensureReady();
  await server.connect(new StdioServerTransport());
}

main().catch((error) => { console.error("[foundry-mcp-connector-client] fatal error", error); process.exit(1); });
