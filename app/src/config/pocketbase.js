import PocketBase from 'pocketbase';

import config from './config.js';

export function createPocketBaseClient() {
  return new PocketBase(config.pocketbase.url);
}