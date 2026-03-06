import { FigmentoRelay, RelayConfig } from './relay';

const config: RelayConfig = {
  port: parseInt(process.env.PORT || process.env.FIGMENTO_RELAY_PORT || '3055', 10),
  maxPayload: parseInt(process.env.MAX_PAYLOAD || '10485760', 10), // 10 MB
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()),
  rateLimitMaxConnections: parseInt(process.env.RATE_LIMIT_MAX_CONNECTIONS || '10', 10),
};

const relay = new FigmentoRelay();
relay.start(config);

// Graceful shutdown
process.on('SIGINT', () => {
  relay.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  relay.stop();
  process.exit(0);
});
