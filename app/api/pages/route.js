import {customPages} from '../../../lib/data.mjs';
import {json,failure} from '../../../lib/http.mjs';
import {checkOrigin,AppError} from '../../../lib/security.mjs';
export async function POST(request){try{checkOrigin(request);if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AppError('Use JSON.',415);const text=await request.text();if(text.length>2000)throw new AppError('Request too large.',413);return json(await customPages(JSON.parse(text)));}catch(e){return failure(e);}}
