export class RemoteFoundryConnector {
  constructor({ url, token, queryTimeoutMs = 10000 }) {
    this.url = url;
    this.token = token;
    this.queryTimeoutMs = queryTimeoutMs;
  }

  async query(method, params = {}) {
    if (!this.url || !this.token) throw new Error("Foundry MCP Connector URL or token is not configured.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.queryTimeoutMs);
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
        body: JSON.stringify({ method, params }),
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Foundry MCP Connector returned HTTP ${response.status}.`);
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }
}
