import {dashboardData} from '../../../lib/data.mjs';
import {json,failure} from '../../../lib/http.mjs';
export const dynamic='force-dynamic';
export async function GET(){try{return json(await dashboardData());}catch(e){return failure(e);}}
