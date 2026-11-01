import { createHmac } from 'node:crypto';
import { database } from './database.mjs';
import { AppError,seal,unseal,appUrl } from './security.mjs';
import {syncLazadaChanges} from './lazada-history.mjs';
export const lazadaCallback=()=>`${appUrl()}/api/lazada/callback`;
export function lazadaSignature(path,params,secret) {
  const text=path+Object.keys(params).filter(k=>k!=='sign').sort().map(k=>k+String(params[k])).join('');
  return createHmac('sha256',secret).update(text,'utf8').digest('hex').toUpperCase();
}
export async function lazadaRequest(path,params,credentials,{fetcher=fetch,now=Date.now()}={}) {
  if(!['/auth/token/create','/auth/token/refresh','/orders/get','/orders/items/get'].includes(path))throw new AppError('Unsupported Lazada request.',400);
  const values={...params,app_key:credentials.appKey,timestamp:String(now),sign_method:'sha256'};
  values.sign=lazadaSignature(path,values,credentials.appSecret);
  const host=path.startsWith('/auth/')?'https://auth.lazada.com/rest':'https://api.lazada.co.th/rest';
  const query=new URLSearchParams(values),reading=!path.startsWith('/auth/');
  let response,data;
  try {
    response=await fetcher(host+path+(reading?'?'+query.toString():''),{method:reading?'GET':'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},...(reading?{}:{body:query}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
    data=await response.json();
  }catch{throw new AppError('Lazada could not be reached. Please try again.',502);}
  if(!response.ok||String(data.code)!=='0'){
    const code=/^[A-Za-z0-9_.-]{1,80}$/.test(String(data.code))?` (${data.code})`:'';
    throw new AppError(`Lazada rejected the request${code}. Check app permissions and shop authorization.`,400);
  }
  return data;
}
export function validateLazadaCredentials(input) {
  if(!input||typeof input.appKey!=='string'||!/^\d{3,30}$/.test(input.appKey.trim())||typeof input.appSecret!=='string'||!/^[A-Za-z0-9_-]{16,256}$/.test(input.appSecret.trim()))throw new AppError('Enter the App Key and App Secret from your Lazada app.',400);
  return {appKey:input.appKey.trim(),appSecret:input.appSecret.trim()};
}
export function lazadaToken(data,now=Date.now()) {
  if(typeof data.access_token!=='string'||!data.access_token||!Number.isFinite(Number(data.expires_in))||Number(data.expires_in)<=0||data.country!=='th')throw new AppError('Authorize your Thailand Lazada shop to continue.',400);
  return {accessToken:data.access_token,refreshToken:typeof data.refresh_token==='string'?data.refresh_token:null,expiresAt:now+Number(data.expires_in)*1000,refreshExpiresAt:now+Math.max(0,Number(data.refresh_expires_in)||0)*1000};
}
export async function lazadaSettings(pool=database()) {
  const row=(await pool.query('SELECT * FROM erp_web.lazada_connection WHERE id=true')).rows[0];
  if(!row)return null;
  const credentials=unseal(row.credentials,'lazada-credentials');
  if(!credentials)throw new AppError('Save your Lazada app credentials again.',503);
  return {...row,credentials,token:unseal(row.tokens,'lazada-tokens')};
}
export async function saveLazadaCredentials(input) {
  const credentials=validateLazadaCredentials(input);
  const client=await database().connect();
  try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended('lazada-connection',0))");await client.query(`INSERT INTO erp_web.lazada_connection(id,app_key,credentials) VALUES(true,$1,$2) ON CONFLICT(id) DO UPDATE SET app_key=excluded.app_key,credentials=excluded.credentials,tokens=NULL,country=NULL,seller_id=NULL,connected_at=NULL,checked_at=NULL,updated_at=now()`,[credentials.appKey,seal(credentials,'lazada-credentials',3650*86400)]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export async function completeLazadaAuthorization(code,expectedAppKey) {
  const client=await database().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('lazada-connection',0))");
    const settings=await lazadaSettings(client);
    if(!settings||settings.app_key!==expectedAppKey)throw new AppError('The Lazada app changed. Start authorization again.',409);
    const data=await lazadaRequest('/auth/token/create',{code},settings.credentials);
    const token=lazadaToken(data);
    const seller=(data.country_user_info||[]).find(s=>s.country==='th');
    await client.query('UPDATE erp_web.lazada_connection SET tokens=$1,country=$2,seller_id=$3,connected_at=now(),checked_at=NULL,updated_at=now() WHERE id=true',[seal(token,'lazada-tokens',365*86400),'th',seller?.seller_id?String(seller.seller_id):null]);
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export async function lazadaAccess() {
  const client=await database().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('lazada-connection',0))");
    const settings=await lazadaSettings(client);let token=settings?.token;
    if(!token)throw new AppError('Connect your Lazada shop first.',409);
    if(token.expiresAt<Date.now()+1800000) {
      if(!token.refreshToken||token.refreshExpiresAt<=Date.now())throw new AppError('Lazada authorization expired. Connect your shop again.',409);
      const data=await lazadaRequest('/auth/token/refresh',{refresh_token:token.refreshToken},settings.credentials);
      token=lazadaToken(data);
      await client.query('UPDATE erp_web.lazada_connection SET tokens=$1,updated_at=now() WHERE id=true',[seal(token,'lazada-tokens',365*86400)]);
    }
    if(!settings.seller_id)throw new AppError('Reconnect Lazada to identify your shop.',409);
    await client.query('COMMIT');return {sellerId:settings.seller_id,credentials:settings.credentials,accessToken:token.accessToken};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export function lazadaReader(access) {
 return async(path,params)=>{
  for(let attempt=0;attempt<3;attempt++){
   await new Promise(resolve=>setTimeout(resolve,1100*(attempt+1)));
   try{return await lazadaRequest(path,{...params,access_token:access.accessToken},access.credentials);}
   catch(error){if(!error.message.includes('(ApiCallLimit)')||attempt===2)throw error;}
  }
 };
}
export async function checkLazadaOrders(){
 const access=await lazadaAccess();
 const report=await syncLazadaChanges(access.sellerId,lazadaReader(access));
 if(!report.importing&&!report.importError)await database().query('UPDATE erp_web.lazada_connection SET checked_at=now() WHERE id=true');
 return report;
}
