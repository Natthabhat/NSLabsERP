import {selectionSettings} from '../../../lib/data.mjs';
import {json,failure} from '../../../lib/http.mjs';
import {checkOrigin,AppError} from '../../../lib/security.mjs';
export const dynamic='force-dynamic';
export async function GET(){try{return json(await selectionSettings());}catch(e){return failure(e);}}
export async function POST(request){try{checkOrigin(request);if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AppError('Use JSON.',415);const body=await request.text();if(body.length>3000)throw new AppError('Request too large.',413);return json(await selectionSettings(JSON.parse(body)));}catch(e){return failure(e);}}
