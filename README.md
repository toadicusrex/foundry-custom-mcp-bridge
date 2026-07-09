# Foundry Custom MCP Bridge

This repository contains the Foundry VTT module portion of the custom MCP bridge.

The module is intended to run in a Foundry world and connect back to a separately hosted MCP server over WebSocket or secure WebSocket.

## What this module does

- connects a Foundry world to a local or tunneled MCP bridge
- exposes guarded document operations through a narrow message contract
- supports read-only, actor-write-only, and full-write modes
- includes preflight validation for risky operations such as token placement and folder moves

## Forge note

If you run your world on The Forge, this module still runs in your browser. The bridge server remains separate and can run on your machine.

## Included files

- `module.json`
- `scripts/bridge.js`

## Repository URLs

- Repository: `https://github.com/toadicusrex/foundry-custom-mcp-bridge`
- Manifest: `https://raw.githubusercontent.com/toadicusrex/foundry-custom-mcp-bridge/main/module.json`

## Release shape

This repository is intentionally module-only so the manifest and installable package can be hosted independently from the broader local MCP server project.
