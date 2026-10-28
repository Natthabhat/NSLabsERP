import {dashboardData} from '../../../lib/data.mjs';
import {json,failure} from '../../../lib/http.mjs';
import {readShopeeHistory} from '../../../lib/shopee-history.mjs';
import {summarizeShopee} from '../../../lib/shopee-dashboard.mjs';
export const dynamic='force-dynamic';
export async function GET(){try{const data=await dashboardData();try{data.shopee=summarizeShopee(await readShopeeHistory());}catch{data.shopee=null;data.shopeeUnavailable=true;}return json(data);}catch(e){return failure(e);}}
