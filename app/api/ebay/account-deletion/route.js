import {NextResponse} from 'next/server';
import {ebayChallengeResponse} from '../../../../lib/ebay.mjs';
export const dynamic='force-dynamic';
// eBay Marketplace Account Deletion endpoint (public; eBay calls it).
// GET answers eBay's ownership challenge. POST acknowledges deletion notices: the ERP stores no eBay buyer
// identity (no usernames, names or addresses), so there is nothing to delete for a closed buyer account.
export async function GET(request){const code=new URL(request.url).searchParams.get('challenge_code');if(!code||code.length>500)return NextResponse.json({error:'Missing challenge_code.'},{status:400});try{return NextResponse.json({challengeResponse:ebayChallengeResponse(code)},{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Endpoint not configured.'},{status:503});}}
export async function POST(request){const body=await request.text();if(body.length>20000)return new NextResponse(null,{status:413});return new NextResponse(null,{status:204});}
