import path from "node:path";

const toNumber = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  bridgeHost: process.env.FOUNDRY_MCP_HOST || "127.0.0.1",
  bridgePort: toNumber(process.env.FOUNDRY_MCP_PORT, 47811),
  bridgePath: process.env.FOUNDRY_MCP_PATH || "/foundry-custom-mcp",
  bridgeToken: process.env.FOUNDRY_MCP_TOKEN || "",
  characterStudioApiPath:
    process.env.CHARACTERSTUDIO_FOUNDRY_API_PATH || "/characterstudio/foundry",
  characterStudioApiToken:
    process.env.CHARACTERSTUDIO_FOUNDRY_API_TOKEN || process.env.FOUNDRY_MCP_TOKEN || "",
  mcpConnectorApiPath:
    process.env.FOUNDRY_MCP_CONNECTOR_API_PATH || "/foundry-mcp-connector/mcp",
  mcpConnectorToken:
    process.env.FOUNDRY_MCP_CONNECTOR_TOKEN || process.env.FOUNDRY_MCP_TOKEN || "",
  mcpConnectorUrl:
    process.env.FOUNDRY_MCP_CONNECTOR_URL || "http://127.0.0.1:47811/foundry-mcp-connector/mcp",
  queryTimeoutMs: toNumber(process.env.FOUNDRY_MCP_QUERY_TIMEOUT_MS, 10000),
  auditLogPath:
    process.env.FOUNDRY_MCP_AUDIT_LOG_PATH ||
    path.resolve(process.cwd(), "runtime", "audit", "foundry-custom-mcp.audit.jsonl"),
  backupDir:
    process.env.FOUNDRY_MCP_BACKUP_DIR ||
    path.resolve(process.cwd(), "runtime", "backups")
};
