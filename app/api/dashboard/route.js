import {dashboardData} from '../../../lib/data.mjs';
import {json,failure} from '../../../lib/http.mjs';
import {readShopeeHistory} from '../../../lib/shopee-history.mjs';
import {summarizeShopee} from '../../../lib/shopee-dashboard.mjs';
import {readLazadaHistory} from '../../../lib/lazada-history.mjs';
import {database} from '../../../lib/database.mjs';
import {summarizeLazada} from '../../../lib/lazada-dashboard.mjs';
export const dynamic='force-dynamic';
export async function GET(){try{const data=await dashboardData();try{data.shopee=summarizeShopee(await readShopeeHistory());}catch{data.shopee=null;data.shopeeUnavailable=true;}try{const seller=(await database().query('SELECT seller_id FROM erp_web.lazada_connection WHERE id=true')).rows[0]?.seller_id;data.lazada=seller?summarizeLazada(await readLazadaHistory(seller)):null;}catch{data.lazada=null;data.lazadaUnavailable=true;}return json(data);}catch(e){return failure(e);}}
