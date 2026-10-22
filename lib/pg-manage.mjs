import {loadPgModule} from './pg-store.mjs';
import {pgValue} from './postgres-model.mjs';
import {AppError,fingerprint} from './security.mjs';
export async function managePgRecords(pool,actor,request) {
 if(!request||!/^[-a-zA-Z0-9]{16,80}$/.test(request.operationId||'')||!['entry','column'].includes(request.action))throw new AppError('Invalid request.');
 const config=await loadPgModule(pool,request.tab),digest=fingerprint(request),client=await pool.connect();
 try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[actor+':'+request.operationId]);
  const prior=(await client.query('SELECT digest,result FROM erp_web.edits WHERE actor=$1 AND operation_id=$2',[actor,request.operationId])).rows[0];
  if(prior){if(prior.digest!==digest)throw new AppError('Request identifier already used.',409);await client.query('COMMIT');return prior.result;}
  let result,recordId=0;
  if(request.action==='column') {
   if(typeof request.label!=='string'||!request.label.trim()||request.label.trim().length>60||!['text','number','date','boolean'].includes(request.type))throw new AppError('Enter a column name and valid type.');
   const added=await client.query(config.custom?'SELECT erp_web.add_page_column($1,$2,$3) AS column_key':'SELECT erp_web.add_column($1,$2,$3) AS column_key',[config.table,request.label.trim(),request.type]);
   result={saved:true,column:added.rows[0].column_key};
  }else {
   const input=request.values;
   if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError('Enter the record fields.');
   if(Object.keys(input).some(k=>!config.fields.some(f=>f.key===k&&!f.generated)))throw new AppError('Unknown or calculated field.');
   const fields=config.fields.filter(f=>!f.generated),values=fields.map(f=>pgValue(f,input[f.key]??(f.type==='boolean'?false:f.nullable?null:undefined)));
   const keys=fields.map(f=>f.key);
   if(config.platform){keys.push('platform');values.push(config.platform);}
   const inserted=await client.query(`INSERT INTO public.${config.table} (${keys.join(',')}) VALUES (${values.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id`,values);
   recordId=inserted.rows[0].id;result={saved:true,row:recordId};
  }
  await client.query('INSERT INTO erp_web.edits(actor,operation_id,digest,table_name,record_id,column_name,old_value,new_value,result) VALUES($1,$2,$3,$4,$5,$6,NULL,$7::jsonb,$8::jsonb)',[actor,request.operationId,digest,config.table,recordId,request.action,JSON.stringify(request),JSON.stringify(result)]);
  await client.query('COMMIT');return result;
 }catch(e){await client.query('ROLLBACK');if(['23505','23514','23502','22001','22003','22P02'].includes(e.code))throw new AppError('Check the values: a required field, unique value, or database limit was not met.');throw e;}finally{client.release();}
}
