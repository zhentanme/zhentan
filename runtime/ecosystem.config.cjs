/** PM2 config for the Zhentan runtime worker. Run: pm2 start runtime/ecosystem.config.cjs */
module.exports = {
  apps: [
    {
      name: "zhentan-runtime",
      cwd: __dirname,
      script: "dist/index.js",
      node_args: "--enable-source-maps",
      // The runtime sends nothing from the sponsor EOA, so the backend's
      // single-sender constraint does not apply here. 1 instance is still
      // right: one shared-agent identity, one lease consumer.
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: { NODE_ENV: "production" },
      error_file: "logs/err.log",
      out_file: "logs/out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
