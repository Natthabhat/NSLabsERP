import {randomBytes} from 'node:crypto';
import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {requireProductUser} from '../../../../lib/product-auth.mjs';
import {seal,cookieOptions,checkOrigin,AppError} from '../../../../lib/security.mjs';
import {etsySettings,pkcePair,etsyAuthorizeUrl} from '../../../../lib/etsy.mjs';
import {failure} from '../../../../lib/http.mjs';
// State and the PKCE verifier stay in an encrypted, 10-minute cookie bound to this ERP user and app.
export async function POST(request){try{const user=await requireProductUser();checkOrigin(request);const s=await etsySettings();if(!s)throw new AppError('Save your Etsy app keys first.',409);const state=randomBytes(32).toString('base64url'),{verifier,challenge}=pkcePair();(await cookies()).set('nslabs_etsy',seal({state,verifier,keystring:s.keystring,username:user.username},'etsy-oauth',600),cookieOptions(600));return NextResponse.redirect(etsyAuthorizeUrl({keystring:s.keystring,state,challenge}),303);}catch(e){return failure(e);}}
