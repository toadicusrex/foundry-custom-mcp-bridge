# Set up Foundry MCP Connector on another machine

## 1. Clone and configure

```powershell
git clone https://github.com/toadicusrex/foundry-custom-mcp-bridge.git "D:\Projects\Foundry MCP"
Set-Location "D:\Projects\Foundry MCP"
Copy-Item .env.example .env
```

Set the single `FOUNDRY_MCP_TOKEN` value in `.env` to the same value used by the Foundry Custom MCP Bridge module. Do not commit `.env`.

## 2. Start the connector

```powershell
docker compose up -d --build
```

The connector publishes only `127.0.0.1:47811`. In Docker Desktop it appears as `foundry-mcp-connector` and restarts automatically.

## 3. Connect Foundry

Open the Forge world in the browser on this machine. In **Game Settings → Foundry Custom MCP Bridge**, keep:

```text
ws://127.0.0.1:47811/foundry-custom-mcp
```

Set **Auth Token** to the same `FOUNDRY_MCP_TOKEN`, save, then choose **Test connection**.

## 4. Configure Codex

Add this to `C:\Users\<you>\.codex\config.toml`, substituting the one shared token:

```toml
[mcp_servers.foundry-custom-mcp]
command = 'C:\Program Files\nodejs\node.exe'
args = ["D:\\Projects\\Foundry MCP\\src\\mcp-client.js"]

[mcp_servers.foundry-custom-mcp.env]
FOUNDRY_MCP_CONNECTOR_URL = "http://127.0.0.1:47811/foundry-mcp-connector/mcp"
FOUNDRY_MCP_TOKEN = "the-same-one-shared-token"
FOUNDRY_MCP_AUDIT_LOG_PATH = "D:\\Projects\\Foundry MCP\\runtime\\audit\\foundry-mcp-client.audit.jsonl"
FOUNDRY_MCP_BACKUP_DIR = "D:\\Projects\\Foundry MCP\\runtime\\backups"
```

Restart Codex after saving its configuration.

## Switching computers

On the computer you want to use, start its connector container, open the Forge world in that computer's browser, and click **Test connection**. The same localhost URL and token work on both machines. One Forge world has one active connector at a time.
