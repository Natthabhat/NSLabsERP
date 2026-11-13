import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {requireProductUser} from '../../../../lib/product-auth.mjs';
import {unseal,equal,appUrl} from '../../../../lib/security.mjs';
import {completeEtsyAuthorization} from '../../../../lib/etsy.mjs';
export async function GET(request){let result='failed';try{const user=await requireProductUser();const jar=await cookies(),pending=unseal(jar.get('nslabs_etsy')?.value,'etsy-oauth');jar.delete('nslabs_etsy');const url=new URL(request.url),code=url.searchParams.get('code');if(!pending||pending.username!==user.username||!equal(pending.state,url.searchParams.get('state'))||!code||code.length>2048)throw Error('Invalid state');await completeEtsyAuthorization({code,verifier:pending.verifier,keystring:pending.keystring});result='connected';}catch{}return NextResponse.redirect(`${appUrl()}/etsy?connection=${result}`,303);}
