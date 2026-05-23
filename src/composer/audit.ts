import { appendFileSync, mkdirSync } from "fs";
import { dirname } from "path";

export class AuditLog {
  constructor(private path?: string) {}

  log(entry: Record<string, unknown>) {
    if (!this.path) return;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      appendFileSync(
        this.path,
        JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + "\n"
      );
    } catch {}
  }
}
