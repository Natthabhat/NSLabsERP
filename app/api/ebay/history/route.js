import {requireProductUser} from '../../../../lib/product-auth.mjs';
import {ebaySettings} from '../../../../lib/ebay.mjs';
import {readEbayHistory} from '../../../../lib/ebay-orders.mjs';
import {matchShopeeProducts} from '../../../../lib/shopee-products.mjs';
import {json,failure} from '../../../../lib/http.mjs';
export const dynamic='force-dynamic';
// Product photos come from the ERP catalogue by SKU, the same matching the Shopee and Etsy pages use.
export async function GET(){try{await requireProductUser();const s=await ebaySettings();if(!s?.username)return json({orders:[],payouts:[],storedCount:0,importStatus:'pending'});const history=await readEbayHistory(s.username);const matched=await matchShopeeProducts({snapshot:{orders:history.orders}});return json({...history,orders:matched.snapshot.orders,catalogueWarning:matched.catalogueWarning||null});}catch(e){return failure(e);}}
