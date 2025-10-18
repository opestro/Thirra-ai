import PocketBase from 'pocketbase';

const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';

export function createPocketBaseClient() {
  return new PocketBase(PB_URL);
}