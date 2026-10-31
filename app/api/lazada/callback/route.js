import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {requireProductUser} from '../../../../lib/product-auth.mjs';
import {unseal,equal,appUrl} from '../../../../lib/security.mjs';
import {completeLazadaAuthorization} from '../../../../lib/lazada.mjs';
export async function GET(request){let result='failed';try{const user=await requireProductUser();const jar=await cookies(),pending=unseal(jar.get('nslabs_lazada')?.value,'lazada-oauth');jar.delete('nslabs_lazada');const url=new URL(request.url),code=url.searchParams.get('code');if(!pending||pending.username!==user.username||!equal(pending.state,url.searchParams.get('state'))||!code||code.length>2048)throw Error('Invalid state');await completeLazadaAuthorization(code,pending.appKey);result='connected';}catch{}return NextResponse.redirect(`${appUrl()}/lazada?connection=${result}`,303);}
