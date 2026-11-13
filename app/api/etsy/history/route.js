import {requireProductUser} from '../../../../lib/product-auth.mjs';
import {etsySettings} from '../../../../lib/etsy.mjs';
import {readEtsyHistory} from '../../../../lib/etsy-orders.mjs';
import {matchShopeeProducts} from '../../../../lib/shopee-products.mjs';
import {json,failure} from '../../../../lib/http.mjs';
export const dynamic='force-dynamic';
// Product photos come from the ERP catalogue by SKU, the same matching the Shopee page uses.
export async function GET(){try{await requireProductUser();const s=await etsySettings();if(!s?.shop_id)return json({orders:[],storedCount:0,importStatus:'pending'});const history=await readEtsyHistory(s.shop_id);const matched=await matchShopeeProducts({snapshot:{orders:history.orders}});return json({...history,orders:matched.snapshot.orders,catalogueWarning:matched.catalogueWarning||null});}catch(e){return failure(e);}}
