import {requireProductUser} from '../../../../lib/product-auth.mjs';
import {lazadaSettings} from '../../../../lib/lazada.mjs';
import {readLazadaHistory} from '../../../../lib/lazada-history.mjs';
import {json,failure} from '../../../../lib/http.mjs';
export const dynamic='force-dynamic';
export async function GET(){try{await requireProductUser();const settings=await lazadaSettings();return json(settings?.seller_id?await readLazadaHistory(settings.seller_id):{orders:[],historyStored:true,storedCount:0});}catch(e){return failure(e);}}
