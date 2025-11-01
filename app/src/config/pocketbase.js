import PocketBase from 'pocketbase';

import config from './config.js';

export function createPocketBaseClient() {
  return new PocketBase(config.pocketbase.url);
}

/**
 * Create an admin PocketBase client for server-side operations (webhooks, cron jobs, etc.)
 * Uses direct database access without user authentication
 */
export function createAdminPbClient() {
  return new PocketBase(config.pocketbase.url);
}