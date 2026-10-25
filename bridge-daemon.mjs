import { createYuyuService, startLocalBridgeServer } from './lib/index.js';

const service = createYuyuService();
await service.syncFromBrowser(false, undefined, true).catch(() => {});
const server = await startLocalBridgeServer(service, 53788);
if (server) {
  console.log('[Yuyu Bridge] Server listening on http://127.0.0.1:53788');
} else {
  console.log('[Yuyu Bridge] Port 53788 already in use or error.');
}
