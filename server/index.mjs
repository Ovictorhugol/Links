import { connectStore } from './database.mjs';
import { createApp } from './app.mjs';
import { settings } from './config.mjs';
import { ensureDefaultAdmin } from './auth.mjs';

const config = settings();
const store = await connectStore(config);
await ensureDefaultAdmin(store);
const server = await createApp(store,config);
server.listen(config.port,config.host,() => console.log(`Painel: ${config.origin}/admin/\nCatálogo: ${config.origin}/api/links`));
server.on('error',async error => { console.error(error.message);await store.close();process.exitCode = 1; });
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,() => { server.close(async () => {await store.close();process.exit(0);});server.closeIdleConnections(); });
