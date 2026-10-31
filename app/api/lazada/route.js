import {requireProductUser} from '../../../lib/product-auth.mjs';
import {checkOrigin,AppError} from '../../../lib/security.mjs';
import {json,failure} from '../../../lib/http.mjs';
import {lazadaSettings,saveLazadaCredentials,lazadaCallback} from '../../../lib/lazada.mjs';
export const dynamic='force-dynamic';
export async function GET(){try{await requireProductUser();const s=await lazadaSettings();return json({configured:!!s,appKey:s?.app_key||'',connected:!!s?.token&&(s.token.expiresAt>Date.now()||s.token.refreshExpiresAt>Date.now()),country:s?.country,sellerId:s?.seller_id,connectedAt:s?.connected_at,checkedAt:s?.checked_at,callbackUrl:lazadaCallback()});}catch(e){return failure(e);}}
export async function POST(request){try{await requireProductUser();checkOrigin(request);if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AppError('Use JSON.',415);const body=await request.text();if(body.length>4000)throw new AppError('Request too large.',413);await saveLazadaCredentials(JSON.parse(body));return json({saved:true});}catch(e){return failure(e);}}
