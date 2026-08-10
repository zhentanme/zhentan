/**
 * Zhentan runtime entrypoint — a pull-only worker (D1). No database
 * credential exists in this process; the backend Runtime API is the only
 * upstream. See worker.ts for the loop, health.ts for the sole listener.
 *
 * Env loads HERE, not in worker.ts — the worker module stays importable
 * with zero environment (the no-DB boot test relies on that).
 */
import "dotenv/config";
import { loadConfigFromEnv, startWorker } from "./worker.js";
import { startHealthServer } from "./health.js";

const config = loadConfigFromEnv();
const { stats, stop, done } = startWorker(config);
const health = startHealthServer(stats, Number(process.env.HEALTH_PORT || 3002));

console.log(
  `zhentan-runtime up — agent=${config.agentInstanceId} api=${config.apiBaseUrl} poll=${config.pollIntervalMs}ms health=127.0.0.1:${process.env.HEALTH_PORT || 3002}`
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`${signal} — draining worker`);
    stop();
    health.close();
    void done.then(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
