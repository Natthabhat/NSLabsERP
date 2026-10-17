import { checkOrigin, AppError } from '../../../../lib/security.mjs';
import { verifyDatabaseLogin } from '../../../../lib/database.mjs';
import { setSession } from '../../../../lib/auth.mjs';
import { json, failure } from '../../../../lib/http.mjs';
import { postgresEnabled } from '../../../../lib/data.mjs';
const attempts=new Map();
export async function POST(request) {
  try {
    checkOrigin(request);
    if(!postgresEnabled())throw new AppError('Database sign-in is disabled.',404);
    if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AppError('Use JSON.',415);
    const body=await request.text();if(body.length>3000)throw new AppError('Request too large.',413);
    const {username,password}=JSON.parse(body);
    // A fixed, global account bucket cannot be bypassed with spoofed IP headers.
    const now=Date.now(),key='database-login',prior=attempts.get(key);
    const attempt=prior&&prior.until>now?prior:{count:0,until:now+60000};
    if(attempt.count>=10)throw new AppError('Too many sign-in attempts. Try again in one minute.',429);
    attempt.count++;attempts.set(key,attempt);
    await verifyDatabaseLogin(username,password);
    await setSession({provider:'postgres',username});
    attempts.delete(key);
    return json({connected:true});
  }catch(e){return failure(e);}
}
