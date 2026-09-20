import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AuditManager } from "./audit.js";
import { config } from "./config.js";
import { FoundryConnector } from "./foundry-connector.js";
import { callTool, listTools } from "./tools.js";

const logger = console;

const connector = new FoundryConnector({
  host: config.bridgeHost,
  port: config.bridgePort,
  path: config.bridgePath,
  token: config.bridgeToken,
  characterStudioApiPath: config.characterStudioApiPath,
  characterStudioApiToken: config.characterStudioApiToken,
  queryTimeoutMs: config.queryTimeoutMs,
  logger
});

const audit = new AuditManager({
  auditLogPath: config.auditLogPath,
  backupDir: config.backupDir
});

const server = new Server(
  {
    name: "foundry-custom-mcp",
    version: "0.1.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: listTools() };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return callTool(name, args ?? {}, { connector, audit });
});

async function main() {
  await audit.ensureReady();
  await connector.start();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.error(
    `[foundry-custom-mcp] listening on ws://${config.bridgeHost}:${config.bridgePort}${config.bridgePath}`
  );
  logger.error(`[foundry-custom-mcp] audit log: ${config.auditLogPath}`);
  logger.error(`[foundry-custom-mcp] backups: ${config.backupDir}`);
}

main().catch(async (error) => {
  logger.error("[foundry-custom-mcp] fatal error", error);
  try {
    await connector.stop();
  } catch {
    // ignore shutdown errors
  }
  process.exit(1);
});

process.on("SIGINT", async () => {
  await connector.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await connector.stop();
  process.exit(0);
});
