import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {requireProductUser} from '../../../../lib/product-auth.mjs';
import {unseal,equal,appUrl} from '../../../../lib/security.mjs';
import {completeEbayAuthorization} from '../../../../lib/ebay.mjs';
export async function GET(request){let result='failed';try{const user=await requireProductUser();const jar=await cookies(),pending=unseal(jar.get('nslabs_ebay')?.value,'ebay-oauth');jar.delete('nslabs_ebay');const url=new URL(request.url),code=url.searchParams.get('code');if(!pending||pending.username!==user.username||!equal(pending.state,url.searchParams.get('state'))||!code||code.length>4096)throw Error('Invalid state');await completeEbayAuthorization({code,clientId:pending.clientId});result='connected';}catch{}return NextResponse.redirect(`${appUrl()}/ebay?connection=${result}`,303);}
