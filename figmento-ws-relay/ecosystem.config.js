module.exports = {
  apps: [
    {
      name: 'figmento-relay',
      script: 'dist/index.js',
      cwd: 'C:/Users/Caio/Projects/Figmento/figmento-ws-relay',
      autorestart: true,
      // PM2 watch on a single file path was unreliable on Windows (chokidar issue).
      // Replaced by an in-process polling watcher (src/credentials-watcher.ts)
      // that exits the process on token rotation, letting PM2 autorestart respawn it.
      watch: false,
      max_restarts: 20,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
