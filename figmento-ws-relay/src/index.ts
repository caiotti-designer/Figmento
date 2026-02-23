import { FigmentoRelay } from './relay';

const PORT = parseInt(process.env.FIGMENTO_RELAY_PORT || '3055', 10);

const relay = new FigmentoRelay();
relay.start(PORT);

// Graceful shutdown
process.on('SIGINT', () => {
  relay.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  relay.stop();
  process.exit(0);
});
