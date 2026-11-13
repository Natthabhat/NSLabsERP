import {requireProductUser} from '../../../lib/product-auth.mjs';
import {checkOrigin,AppError} from '../../../lib/security.mjs';
import {json,failure} from '../../../lib/http.mjs';
import {etsySettings,saveEtsyCredentials,etsyCallback} from '../../../lib/etsy.mjs';
export const dynamic='force-dynamic';
// Connection status only; keys and tokens never leave the server.
export async function GET(){try{await requireProductUser();const s=await etsySettings();return json({configured:!!s,keystring:s?.keystring||'',connected:!!s?.token&&!!s.shop_id&&s.token.refreshExpiresAt>Date.now(),shopId:s?.shop_id||null,shopName:s?.shop_name||'',currency:s?.currency||'',connectedAt:s?.connected_at,checkedAt:s?.checked_at,callbackUrl:etsyCallback()});}catch(e){return failure(e);}}
export async function POST(request){try{await requireProductUser();checkOrigin(request);if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AppError('Use JSON.',415);const body=await request.text();if(body.length>4000)throw new AppError('Request too large.',413);await saveEtsyCredentials(JSON.parse(body));return json({saved:true});}catch(e){return failure(e);}}
