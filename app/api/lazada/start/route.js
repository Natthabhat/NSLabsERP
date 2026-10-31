import {randomBytes} from 'node:crypto';
import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {requireProductUser} from '../../../../lib/product-auth.mjs';
import {seal,cookieOptions,checkOrigin,AppError} from '../../../../lib/security.mjs';
import {lazadaSettings,lazadaCallback} from '../../../../lib/lazada.mjs';
import {failure} from '../../../../lib/http.mjs';
export async function POST(request){try{const user=await requireProductUser();checkOrigin(request);const s=await lazadaSettings();if(!s)throw new AppError('Save your Lazada app credentials first.',409);const state=randomBytes(32).toString('base64url');(await cookies()).set('nslabs_lazada',seal({state,appKey:s.app_key,username:user.username},'lazada-oauth',600),cookieOptions(600));const url=new URL('https://auth.lazada.com/oauth/authorize');url.search=new URLSearchParams({response_type:'code',force_auth:'true',redirect_uri:lazadaCallback(),client_id:s.app_key,state}).toString();return NextResponse.redirect(url,303);}catch(e){return failure(e);}}
