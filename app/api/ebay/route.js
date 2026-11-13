import {requireProductUser} from '../../../lib/product-auth.mjs';
import {checkOrigin,AppError} from '../../../lib/security.mjs';
import {json,failure} from '../../../lib/http.mjs';
import {ebaySettings,saveEbayCredentials,ebayCallback,ebayDeletionEndpoint,ebayVerificationToken} from '../../../lib/ebay.mjs';
export const dynamic='force-dynamic';
// Connection status and the values to enter in the eBay developer portal; keys and tokens never leave the server.
export async function GET(){try{await requireProductUser();const s=await ebaySettings();return json({configured:!!s,clientId:s?.client_id||'',ruName:s?.ru_name||'',connected:!!s?.token&&!!s.username&&s.token.refreshExpiresAt>Date.now(),username:s?.username||'',marketplace:s?.marketplace||'',connectedAt:s?.connected_at,checkedAt:s?.checked_at,refreshExpiresAt:s?.token?.refreshExpiresAt?new Date(s.token.refreshExpiresAt).toISOString():null,callbackUrl:ebayCallback(),deletionEndpoint:ebayDeletionEndpoint(),verificationToken:ebayVerificationToken()});}catch(e){return failure(e);}}
export async function POST(request){try{await requireProductUser();checkOrigin(request);if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AppError('Use JSON.',415);const body=await request.text();if(body.length>4000)throw new AppError('Request too large.',413);await saveEbayCredentials(JSON.parse(body));return json({saved:true});}catch(e){return failure(e);}}
