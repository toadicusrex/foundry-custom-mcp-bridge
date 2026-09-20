import fs from "node:fs/promises";
import path from "node:path";

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export class AuditManager {
  constructor({ auditLogPath, backupDir }) {
    this.auditLogPath = auditLogPath;
    this.backupDir = backupDir;
  }

  async ensureReady() {
    await fs.mkdir(path.dirname(this.auditLogPath), { recursive: true });
    await fs.mkdir(this.backupDir, { recursive: true });
  }

  async appendAudit(entry) {
    await this.ensureReady();
    await fs.appendFile(this.auditLogPath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  async writeBackup({ toolName, payload, label }) {
    await this.ensureReady();
    const safeTool = toolName.replace(/[^a-z0-9_-]/gi, "_");
    const safeLabel = (label || "backup").replace(/[^a-z0-9_-]/gi, "_");
    const filePath = path.join(this.backupDir, `${stamp()}-${safeTool}-${safeLabel}.json`);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    return filePath;
  }
}
