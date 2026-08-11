/**
 * Localhost-only health/diagnostics listener — the ONLY socket the runtime
 * opens. Deliberately bound to 127.0.0.1: the runtime accepts no commands
 * from anywhere; this exists for ops probes (`curl localhost:3002/health`).
 */
import { createServer, type Server } from "http";
import type { WorkerStats } from "./worker.js";

export function startHealthServer(stats: WorkerStats, port: number): Server {
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", ...stats }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, "127.0.0.1");
  return server;
}
