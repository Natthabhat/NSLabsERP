import {AppError,fingerprint} from './security.mjs';
export async function saveSelection(pool,actor,request){
 if(!request||!['product_code','platform','filament_type','category'].includes(request.list)||typeof request.value!=='string'||typeof request.label!=='string'||!request.value.trim()||!request.label.trim()||request.value.length>60||request.label.length>60||!/^[-a-zA-Z0-9]{16,80}$/.test(request.operationId||''))throw new AppError('Enter a valid selection, up to 60 characters.');
 if(request.action&&!['save','delete','restore'].includes(request.action))throw new AppError('Invalid selection action.');
 const client=await pool.connect(),digest=fingerprint(request);
 try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[actor+':'+request.operationId]);
 const old=(await client.query('SELECT digest,result FROM erp_web.edits WHERE actor=$1 AND operation_id=$2',[actor,request.operationId])).rows[0];
 if(old){if(old.digest!==digest)throw new AppError('Request identifier already used.',409);await client.query('COMMIT');return old.result;}
 const prior=(await client.query('SELECT label,active FROM erp_web.selection_options WHERE list_key=$1 AND option_value=$2',[request.list,request.value.trim()])).rows[0];
 if(request.action==='delete'||request.action==='restore')await client.query('SELECT erp_web.set_selection_active($1,$2,$3)',[request.list,request.value.trim(),request.action==='restore']);
 else await client.query('SELECT erp_web.save_selection($1,$2,$3)',[request.list,request.value.trim(),request.label.trim()]);
 const result={saved:true};await client.query('INSERT INTO erp_web.edits(actor,operation_id,digest,table_name,record_id,column_name,old_value,new_value,result) VALUES($1,$2,$3,$4,0,$5,$6::jsonb,$7::jsonb,$8::jsonb)',[actor,request.operationId,digest,'selection_options',request.list,JSON.stringify(prior||null),JSON.stringify(request),JSON.stringify(result)]);await client.query('COMMIT');return result;
 }catch(e){await client.query('ROLLBACK');if(e.code==='23505')throw new AppError('This selection name already exists.');throw e;}finally{client.release();}
}
