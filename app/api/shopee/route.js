import { session } from '../../../lib/auth.mjs';
import { AppError } from '../../../lib/security.mjs';
import { json, failure } from '../../../lib/http.mjs';
import { readShopeeSnapshot } from '../../../lib/shopee.mjs';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const user = await session();
    if (process.env.DATA_BACKEND !== 'postgres' || user?.provider !== 'postgres' || user.username !== process.env.POSTGRES_LOGIN_USER) throw new AppError('Sign in to view Shopee orders.', 401);
    return json(await readShopeeSnapshot());
  } catch (error) { return failure(error); }
}
