/** PM2 ecosystem config for Zhentan server. Run from repo root: pm2 start server/ecosystem.config.cjs */
module.exports = {
  apps: [
    {
      name: "zhentan-server",
      cwd: __dirname,
      script: "dist/index.js",
      node_args: "--enable-source-maps",
      // MUST stay 1 (D0.1): sponsor sends (execution, rejection, deployment)
      // serialize the sponsor EOA's nonces via viem's IN-PROCESS nonceManager
      // (lib/chain/sponsor.ts). Two instances = nonce collisions on chain.
      // Raising this requires a DB-backed per-sponsor submission queue first.
      // Cross-process execution dedup is already safe (DB lease, D0) — this
      // constraint is only about who SENDS from the sponsor EOA.
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
      },
      env_development: {
        NODE_ENV: "development",
      },
      error_file: "logs/err.log",
      out_file: "logs/out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
