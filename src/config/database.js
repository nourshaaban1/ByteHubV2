import mongoose from 'mongoose';
import env from './env.js';
import logger from '../shared/utils/logger.js';

mongoose.set('strictQuery', true);

let connection = null;

export async function connectDatabase(uri = env.mongoUri) {
  if (connection) return connection;

  mongoose.connection.on('connected', () => logger.info('mongo: connected'));
  mongoose.connection.on('error', (err) => logger.error('mongo: error', err.message));
  mongoose.connection.on('disconnected', () => logger.warn('mongo: disconnected'));

  connection = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
  });

  return connection;
}

export async function disconnectDatabase() {
  if (!connection) return;
  await mongoose.disconnect();
  connection = null;
}

export function databaseState() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] ?? 'unknown';
}

export default { connectDatabase, disconnectDatabase, databaseState };
