import {requireProductUser} from '../../../../lib/product-auth.mjs';
import {checkOrigin} from '../../../../lib/security.mjs';
import {ebayAccess,ebayReader,ebayItemReader} from '../../../../lib/ebay.mjs';
import {syncEbay} from '../../../../lib/ebay-orders.mjs';
import {json,failure} from '../../../../lib/http.mjs';
export const dynamic='force-dynamic';
let busy=false,last=0;
export async function POST(request){let acquired=false;try{await requireProductUser();checkOrigin(request);if(busy||Date.now()-last<15000)return json({error:'Wait a moment before checking again.'},429);busy=true;acquired=true;last=Date.now();const access=await ebayAccess();return json(await syncEbay(access,ebayReader(access),{item:ebayItemReader(access)}));}catch(e){return failure(e);}finally{if(acquired)busy=false;}}
