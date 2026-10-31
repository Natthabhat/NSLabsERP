import { createHmac } from 'node:crypto';
import { database } from './database.mjs';
import { AppError,seal,unseal,appUrl } from './security.mjs';
export const lazadaCallback=()=>`${appUrl()}/api/lazada/callback`;
export function lazadaSignature(path,params,secret) {
  const text=path+Object.keys(params).filter(k=>k!=='sign').sort().map(k=>k+String(params[k])).join('');
  return createHmac('sha256',secret).update(text,'utf8').digest('hex').toUpperCase();
}
export async function lazadaRequest(path,params,credentials,{fetcher=fetch,now=Date.now()}={}) {
  if(!['/auth/token/create','/auth/token/refresh','/orders/get'].includes(path))throw new AppError('Unsupported Lazada request.',400);
  const values={...params,app_key:credentials.appKey,timestamp:String(now),sign_method:'sha256'};
  values.sign=lazadaSignature(path,values,credentials.appSecret);
  const host=path.startsWith('/auth/')?'https://auth.lazada.com/rest':'https://api.lazada.co.th/rest';
  let response,data;
  try {
    response=await fetcher(host+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
    data=await response.json();
  }catch{throw new AppError('Lazada could not be reached. Please try again.',502);}
  if(!response.ok||String(data.code)!=='0')throw new AppError('Lazada rejected the request. Check app permissions and shop authorization.',502);
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
export async function checkLazadaOrders() {
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
    const data=await lazadaRequest('/orders/get',{access_token:token.accessToken,created_after:new Date(Date.now()-30*86400000).toISOString(),limit:'10',offset:'0',sort_by:'created_at',sort_direction:'DESC'},settings.credentials);
    // Whitelist operational fields; buyer identities and addresses stay out of ERP responses.
    const orders=(data.data?.orders||[]).map(o=>({orderId:String(o.order_id),createdAt:String(o.created_at||''),statuses:Array.isArray(o.statuses)?o.statuses.map(String):[],itemsCount:Number(o.items_count)||0,price:String(o.price??''),currency:'THB'}));
    await client.query('UPDATE erp_web.lazada_connection SET checked_at=now() WHERE id=true');
    await client.query('COMMIT');return {orders,checkedAt:new Date().toISOString()};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
