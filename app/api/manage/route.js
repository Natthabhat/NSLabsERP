import { manageRecords } from '../../../lib/data.mjs';
import { checkOrigin, AppError } from '../../../lib/security.mjs';
import { json, failure } from '../../../lib/http.mjs';
export async function POST(request) {
 try {
  checkOrigin(request);
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AppError('Use a JSON request.',415);
  const text=await request.text();if(text.length>100000)throw new AppError('Request is too large.',413);
  return json(await manageRecords(JSON.parse(text)));
 }catch(e){return failure(e);}
}
