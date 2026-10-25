import { requireProductUser } from '../../../lib/product-auth.mjs';
import { listProducts, saveProduct } from '../../../lib/products.mjs';
import { checkOrigin, AppError } from '../../../lib/security.mjs';
import { json, failure } from '../../../lib/http.mjs';
export const dynamic='force-dynamic';
export async function GET() { try { await requireProductUser(); return json(await listProducts()); } catch(e) { return failure(e); } }
export async function POST(request) {
  try {
    await requireProductUser(); checkOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AppError('Use JSON.',415);
    const reader=request.body?.getReader(); if(!reader) throw new AppError('Missing product.',400);
    let size=0; const chunks=[];
    while(true) { const {done,value}=await reader.read(); if(done)break; size+=value.byteLength; if(size>3000000){await reader.cancel();throw new AppError('Product picture is too large. Maximum 2 MB.',413);} chunks.push(value); }
    let input; try {input=JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {throw new AppError('Invalid product.',400);}
    return json(await saveProduct(input));
  } catch(e) { return failure(e); }
}
