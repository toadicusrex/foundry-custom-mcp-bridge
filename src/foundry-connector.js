import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

export class FoundryConnector {
  constructor({ host = "127.0.0.1", port, path, token, characterStudioApiPath = "/characterstudio/foundry", characterStudioApiToken = "", mcpConnectorApiPath = "/foundry-mcp-connector/mcp", mcpConnectorToken = "", queryTimeoutMs = 10000, logger = console }) {
    this.host = host;
    this.port = port;
    this.path = path;
    this.token = token;
    this.characterStudioApiPath = characterStudioApiPath.replace(/\/$/, "");
    this.characterStudioApiToken = characterStudioApiToken;
    this.mcpConnectorApiPath = mcpConnectorApiPath;
    this.mcpConnectorToken = mcpConnectorToken;
    this.queryTimeoutMs = queryTimeoutMs;
    this.logger = logger;
    this.httpServer = null;
    this.wsServer = null;
    this.socket = null;
    this.pendingQueries = new Map();
    this.queryIdCounter = 0;
  }

  async start() {
    if (this.httpServer) return;

    this.httpServer = createServer((req, res) => this.handleHttpRequest(req, res));

    this.wsServer = new WebSocketServer({ noServer: true });

    this.httpServer.on("upgrade", (req, socket, head) => {
      const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
      if (requestUrl.pathname !== this.path) {
        socket.destroy();
        return;
      }

      if (this.token) {
        const providedToken = requestUrl.searchParams.get("token") ?? "";
        if (providedToken !== this.token) {
          socket.destroy();
          return;
        }
      }

      this.wsServer.handleUpgrade(req, socket, head, (ws) => {
        this.wsServer.emit("connection", ws, req);
      });
    });

    this.wsServer.on("connection", (ws) => {
      this.logger.info("Foundry bridge connected");

      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.close(1000, "superseded");
      }

      this.socket = ws;

      ws.on("message", async (raw) => {
        try {
          const message = JSON.parse(raw.toString());
          this.handleMessage(message);
        } catch (error) {
          this.logger.error("Failed to parse message from Foundry bridge", error);
        }
      });

      ws.on("close", () => {
        if (this.socket === ws) {
          this.socket = null;
        }

        for (const [id, pending] of this.pendingQueries.entries()) {
          clearTimeout(pending.timeout);
          pending.reject(new Error(`Bridge connection closed while waiting for ${id}`));
        }
        this.pendingQueries.clear();
      });

      ws.on("error", (error) => {
        this.logger.error("Foundry bridge socket error", error);
      });
    });

    await new Promise((resolve, reject) => {
      this.httpServer.listen(this.port, this.host, () => resolve());
      this.httpServer.on("error", reject);
    });

    this.logger.info(`Foundry bridge listening on ws://${this.host}:${this.port}${this.path}`);
  }

  async handleHttpRequest(req, res) {
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    const respond = (status, body) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    if (requestUrl.pathname === this.mcpConnectorApiPath) return this.handleMcpConnectorRequest(req, res, respond);
    if (!requestUrl.pathname.startsWith(this.characterStudioApiPath)) return respond(404, { error: "Not found." });
    if (!this.characterStudioApiToken) return respond(503, { error: "CharacterStudio bridge API is not configured." });
    const authorization = req.headers.authorization ?? "";
    if (authorization !== `Bearer ${this.characterStudioApiToken}`) return respond(401, { error: "Unauthorized." });
    if (req.method !== "GET") return respond(405, { error: "Method not allowed." });
    try {
      if (requestUrl.pathname === `${this.characterStudioApiPath}/health`) return respond(200, { connected: this.isConnected() });
      if (requestUrl.pathname === `${this.characterStudioApiPath}/compendium/search`) {
        const packId = requestUrl.searchParams.get("packId") ?? "";
        if (!packId) return respond(400, { error: "packId is required." });
        const result = await this.query("foundry-custom-mcp.compendium.search", { packId, query: requestUrl.searchParams.get("query") ?? "", type: requestUrl.searchParams.get("type") ?? undefined, limit: Math.min(Number.parseInt(requestUrl.searchParams.get("limit") ?? "20", 10) || 20, 50) });
        return respond(200, result);
      }
      if (requestUrl.pathname === `${this.characterStudioApiPath}/compendium/entry`) {
        const packId = requestUrl.searchParams.get("packId") ?? "";
        const entryId = requestUrl.searchParams.get("entryId") ?? "";
        if (!packId || !entryId) return respond(400, { error: "packId and entryId are required." });
        return respond(200, await this.query("foundry-custom-mcp.compendium.getEntry", { packId, entryId }));
      }
      return respond(404, { error: "Not found." });
    } catch (error) {
      this.logger.error("CharacterStudio bridge API request failed", error);
      return respond(this.isConnected() ? 502 : 503, { error: error instanceof Error ? error.message : "Foundry bridge request failed." });
    }
  }

  async handleMcpConnectorRequest(req, res, respond) {
    if (!this.mcpConnectorToken) return respond(503, { error: "MCP connector API is not configured." });
    if ((req.headers.authorization ?? "") !== `Bearer ${this.mcpConnectorToken}`) return respond(401, { error: "Unauthorized." });
    if (req.method !== "POST") return respond(405, { error: "Method not allowed." });
    try {
      let raw = "";
      for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) return respond(413, { error: "Request too large." }); }
      const body = JSON.parse(raw || "{}");
      if (typeof body.method !== "string" || !body.method) return respond(400, { error: "method is required." });
      return respond(200, await this.query(body.method, body.params && typeof body.params === "object" ? body.params : {}));
    } catch (error) {
      this.logger.error("MCP connector API request failed", error);
      return respond(this.isConnected() ? 502 : 503, { error: error instanceof Error ? error.message : "Foundry connector request failed." });
    }
  }

  async stop() {
    for (const pending of this.pendingQueries.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Bridge shutting down"));
    }
    this.pendingQueries.clear();

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }

    if (this.httpServer) {
      await new Promise((resolve) => this.httpServer.close(resolve));
      this.httpServer = null;
    }
  }

  isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  ensureConnected() {
    if (!this.isConnected()) {
      throw new Error("Foundry VTT module not connected. Ensure the custom bridge module is enabled and the world is open.");
    }
  }

  handleMessage(message) {
    if (message?.type !== "mcp-response" || !message.id) {
      this.logger.debug?.("Ignoring non-response message", message?.type);
      return;
    }

    const pending = this.pendingQueries.get(message.id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingQueries.delete(message.id);

    if (message.data?.success) {
      pending.resolve(message.data.data);
      return;
    }

    pending.reject(new Error(message.data?.error || "Unknown bridge error"));
  }

  async query(method, params = {}) {
    this.ensureConnected();

    const id = `query-${++this.queryIdCounter}`;
    const payload = {
      type: "mcp-query",
      id,
      data: {
        method,
        data: params
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingQueries.delete(id);
        reject(new Error(`Query timeout: ${method}`));
      }, this.queryTimeoutMs);

      this.pendingQueries.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify(payload));
    });
  }
}
