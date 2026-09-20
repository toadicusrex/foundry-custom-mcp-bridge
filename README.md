# Foundry MCP Connector

**Foundry MCP Connector** is the local Docker service that connects the installed **Foundry Custom MCP Bridge** module to Codex and CharacterStudio.

It is not a second Foundry module. The module remains installed in the Forge world; this container runs locally on the computer currently in use.

```text
Foundry browser module ── ws://127.0.0.1:47811 ──> Docker connector
Codex MCP client ── http://127.0.0.1:47811 ─────> Docker connector
CharacterStudio ── Docker host address ─────────> Docker connector
```

The container publishes only `127.0.0.1:47811`, not the LAN or internet. The Foundry module can keep its existing Server URL:

```text
ws://127.0.0.1:47811/foundry-custom-mcp
```

Because the module runs in the active browser, `127.0.0.1` refers to whichever computer is currently running the container.

## Run locally

```powershell
Copy-Item .env.example .env
# Set the one shared FOUNDRY_MCP_TOKEN in .env.
docker compose up -d --build
```

The same token must be entered in **Game Settings → Foundry Custom MCP Bridge → Auth Token**.

Check the service:

```powershell
docker compose ps
docker compose logs connector
```

## Repository layout

- `src/connector-daemon.js` — Docker process that owns the Foundry WebSocket connection.
- `src/mcp-client.js` — lightweight stdio MCP client launched by Codex.
- `src/foundry-connector.js` — WebSocket connection and authenticated local APIs.
- `src/tools.js` — validated Codex tool definitions.
- `module.json`, `scripts/`, `templates/` — installed Foundry Custom MCP Bridge module. They remain at the repository root so the published Forge manifest URL remains valid.

## Other machine

See [SETUP-ON-OTHER-MACHINE.md](SETUP-ON-OTHER-MACHINE.md). Clone this repository, create the untracked `.env` with the same token, start Compose, then use the Foundry module’s **Test connection** button.

## Safety

Codex forwarding is authenticated and loopback-only. Foundry's configured write mode and collection allowlist remain the authority for document writes. Keep the module in `read-only` or `actor-write-only` unless broader writes are actually required.
