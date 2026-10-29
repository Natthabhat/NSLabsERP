import { syncShopeeHistory } from '../lib/shopee-history.mjs';
import { database } from '../lib/database.mjs';
try { await syncShopeeHistory(); }
catch(error) { console.error('Shopee inventory sync failed:',error.message); process.exitCode=1; }
finally { await database().end(); }
