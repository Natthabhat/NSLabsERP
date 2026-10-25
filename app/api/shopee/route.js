import { session } from '../../../lib/auth.mjs';
import { AppError, checkOrigin } from '../../../lib/security.mjs';
import { json, failure } from '../../../lib/http.mjs';
import { readShopeeSnapshot } from '../../../lib/shopee.mjs';
import { triggerShopeeSync } from '../../../lib/shopee-sync.mjs';

export const dynamic = 'force-dynamic';
async function requireUser() {
  const user = await session();
  if (process.env.DATA_BACKEND !== 'postgres' || user?.provider !== 'postgres' || user.username !== process.env.POSTGRES_LOGIN_USER) throw new AppError('Sign in to view Shopee orders.', 401);
}
export async function GET() {
  try {
    await requireUser();
    return json(await readShopeeSnapshot());
  } catch (error) { return failure(error); }
}
let lastAccepted = 0, starting = false;
export async function POST(request) {
  try {
    await requireUser(); checkOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AppError('Use JSON.', 415);
    if ((await request.text()).length > 1000) throw new AppError('Request too large.', 413);
    if (starting || Date.now() - lastAccepted < 30000) throw new AppError('A refresh was recently requested. Wait for it to finish before trying again.', 429);
    starting = true;
    try {
      const previous = await readShopeeSnapshot();
      const result = await triggerShopeeSync(); lastAccepted = Date.now();
      return json({ ...result, previousCollectedAt: previous.snapshot?.collectedAt || null }, 202);
    } finally { starting = false; }
  } catch (error) { return failure(error); }
}
