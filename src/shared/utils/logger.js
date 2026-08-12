import env from '../../config/env.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[env.isTest ? 'error' : env.isProduction ? 'info' : 'debug'];

const emit = (level, args) => {
  if (LEVELS[level] > threshold) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)}`;
  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](line, ...args);
};

export const logger = {
  error: (...args) => emit('error', args),
  warn: (...args) => emit('warn', args),
  info: (...args) => emit('info', args),
  debug: (...args) => emit('debug', args),
};

export default logger;
