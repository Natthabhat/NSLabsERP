import {AppError,fingerprint} from './security.mjs';
export async function listPages(pool){return (await pool.query('SELECT id,title,group_name FROM erp_web.pages ORDER BY id')).rows.map(p=>({id:Number(p.id),name:p.title,title:p.title,group:p.group_name,icon:'stock',width:4,custom:true}));}
export async function createPage(pool,actor,request){
 if(!request||typeof request.title!=='string'||!request.title.trim()||request.title.length>60||!['Workshop','Pricing','Marketplaces'].includes(request.group)||!/^[-a-zA-Z0-9]{16,80}$/.test(request.operationId||''))throw new AppError('Enter a page name and section.');
 const client=await pool.connect(),digest=fingerprint(request);
 try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[actor+':'+request.operationId]);
 const prior=(await client.query('SELECT digest,result FROM erp_web.edits WHERE actor=$1 AND operation_id=$2',[actor,request.operationId])).rows[0];if(prior){if(prior.digest!==digest)throw new AppError('Request identifier already used.',409);await client.query('COMMIT');return prior.result;}
 const id=Number((await client.query('SELECT erp_web.create_page($1,$2,$3) AS id',[request.title.trim(),request.group,request.operationId])).rows[0].id);const result={saved:true,id};
 await client.query('INSERT INTO erp_web.edits(actor,operation_id,digest,table_name,record_id,column_name,old_value,new_value,result) VALUES($1,$2,$3,$4,0,$5,NULL,$6::jsonb,$7::jsonb)',[actor,request.operationId,digest,'pages','create',JSON.stringify(request),JSON.stringify(result)]);await client.query('COMMIT');return result;
 }catch(e){await client.query('ROLLBACK');if(e.code==='23505')throw new AppError('A page with this name already exists in that section.');throw e;}finally{client.release();}
}
