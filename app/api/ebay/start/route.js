import {randomBytes} from 'node:crypto';
import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {requireProductUser} from '../../../../lib/product-auth.mjs';
import {seal,cookieOptions,checkOrigin,AppError} from '../../../../lib/security.mjs';
import {ebaySettings,ebayAuthorizeUrl} from '../../../../lib/ebay.mjs';
import {failure} from '../../../../lib/http.mjs';
// State stays in an encrypted, 10-minute cookie bound to this ERP user and keyset.
export async function POST(request){try{const user=await requireProductUser();checkOrigin(request);const s=await ebaySettings();if(!s)throw new AppError('Save your eBay keys first.',409);const state=randomBytes(32).toString('base64url');(await cookies()).set('nslabs_ebay',seal({state,clientId:s.client_id,username:user.username},'ebay-oauth',600),cookieOptions(600));return NextResponse.redirect(ebayAuthorizeUrl({clientId:s.client_id,ruName:s.credentials.ruName,state}),303);}catch(e){return failure(e);}}
