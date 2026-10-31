import {requireProductUser} from '../../../../lib/product-auth.mjs';
import {checkOrigin} from '../../../../lib/security.mjs';
import {checkLazadaOrders} from '../../../../lib/lazada.mjs';
import {json,failure} from '../../../../lib/http.mjs';
let busy=false,last=0;
export async function POST(request){let acquired=false;try{await requireProductUser();checkOrigin(request);if(busy||Date.now()-last<15000)return json({error:'Wait a moment before checking again.'},429);busy=true;acquired=true;last=Date.now();return json(await checkLazadaOrders());}catch(e){return failure(e);}finally{if(acquired)busy=false;}}
