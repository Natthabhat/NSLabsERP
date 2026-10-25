import { requireProductUser } from '../../../../../lib/product-auth.mjs';
import { productId } from '../../../../../lib/products.mjs';
import { database } from '../../../../../lib/database.mjs';
import { failure } from '../../../../../lib/http.mjs';
import { AppError } from '../../../../../lib/security.mjs';
export const dynamic='force-dynamic';
export async function GET(request,{params}) {
  try {
    await requireProductUser(); const id=productId((await params).id);
    const result=await database().query('SELECT picture,picture_type FROM erp_web.products WHERE id=$1',[id]);
    const row=result.rows[0]; if(!row?.picture) throw new AppError('Picture unavailable.',404);
    return new Response(new Uint8Array(row.picture),{headers:{'Content-Type':row.picture_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  } catch(e) {return failure(e);}
}
