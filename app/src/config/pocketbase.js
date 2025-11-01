import PocketBase from 'pocketbase';

import config from './config.js';

export function createPocketBaseClient() {
  return new PocketBase(config.pocketbase.url);
}

/**
 * Create an admin PocketBase client for server-side operations (webhooks, cron jobs, etc.)
 * Authenticates with admin credentials if available
 */
export async function createAdminPbClient() {
  const pb = new PocketBase(config.pocketbase.url);
  
  // Authenticate as admin if credentials are provided
  if (config.pocketbase.adminEmail && config.pocketbase.adminPassword) {
    try {
      await pb.admins.authWithPassword(
        config.pocketbase.adminEmail,
        config.pocketbase.adminPassword
      );
      console.log('[PocketBase] Admin authenticated for webhook operations');
    } catch (error) {
      console.error('[PocketBase] Admin authentication failed:', error.message);
      console.warn('[PocketBase] Webhook operations may fail without admin access');
    }
  } else {
    console.warn('[PocketBase] No admin credentials configured - webhooks may not work');
    console.warn('[PocketBase] Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD');
  }
  
  return pb;
}