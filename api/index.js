import { createApp, validateRuntimeConfig } from '../server/server.js';
import { createCache } from '../server/cache.js';

let appPromise;

async function app() {
  if (!appPromise) {
    appPromise = (async () => {
      validateRuntimeConfig();
      return createApp({ cache: await createCache() });
    })();
  }
  return appPromise;
}

export default async function handler(req, res) {
  const server = await app();
  server.emit('request', req, res);
}
