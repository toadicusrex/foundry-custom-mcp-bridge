import { config } from "./config.js";
import { FoundryConnector } from "./foundry-connector.js";

const connector = new FoundryConnector({
  host: config.bridgeHost,
  port: config.bridgePort,
  path: config.bridgePath,
  token: config.bridgeToken,
  characterStudioApiPath: config.characterStudioApiPath,
  characterStudioApiToken: config.characterStudioApiToken,
  mcpConnectorApiPath: config.mcpConnectorApiPath,
  mcpConnectorToken: config.mcpConnectorToken,
  queryTimeoutMs: config.queryTimeoutMs,
  logger: console
});

async function stop() {
  await connector.stop();
  process.exit(0);
}

connector.start()
  .then(() => console.error(`[foundry-mcp-connector] listening on ws://${config.bridgeHost}:${config.bridgePort}${config.bridgePath}`))
  .catch(async (error) => {
    console.error("[foundry-mcp-connector] fatal error", error);
    await stop();
  });

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
