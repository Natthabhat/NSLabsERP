import { pgModule, pgPosition, pgValue, pgDisplay } from './postgres-model.mjs';
import { AppError, fingerprint, equal } from './security.mjs';
import { PAGE_SIZE } from './config.mjs';
export async function loadPgModule(pool,id) {
  let base;
  try{base=pgModule(id);}catch(error){
    if(!Number.isSafeInteger(Number(id))||Number(id)<3000000000)throw error;
    const page=(await pool.query('SELECT table_key FROM erp_web.pages WHERE id=$1',[id])).rows[0];
    if(!page||!/^erp_page_[0-9]+$/.test(page.table_key))throw error;
    base={table:page.table_key,custom:true,fields:[{key:'name',label:'Name',type:'text',max:255},{key:'entry_date',label:'Date',type:'date',nullable:true},{key:'amount',label:'Amount',type:'number',nullable:true},{key:'notes',label:'Notes',type:'text',nullable:true,max:10000}]};
  }
  const extra=await pool.query('SELECT column_key,label,field_type FROM erp_web.custom_columns WHERE table_name=$1 ORDER BY position',[base.table]);
  const selections=(await pool.query('SELECT list_key,option_value,label,active FROM erp_web.selection_options ORDER BY position')).rows;
  return {...base,fields:[...base.fields.map(f=>{const options=selections.filter(s=>s.list_key===f.key);return options.length?{...f,options:options.filter(s=>s.active!==false).map(s=>s.option_value),optionLabels:Object.fromEntries(options.map(s=>[s.option_value,s.label]))}:f;}),...extra.rows.map(f=>({key:f.column_key,label:f.label,type:f.field_type,nullable:true,max:10000}))]};
}
function signature(config,row) {return fingerprint([config.table,row.id,row.version,...config.fields.map(f=>row[f.key])]);}
function cellToken(config,row,column) {return fingerprint([signature(config,row),column]);}
function selectFields(config) {return ['id','xmin::text AS version',...config.fields.map(f=>f.type==='date'?`${f.key}::text AS ${f.key}`:f.key)].join(', ');}
function filter(config) {return config.platform?' AND platform::text = $2':'';}
async function find(client,config,id,lock=false) {
  const result=await client.query(`SELECT ${selectFields(config)} FROM public.${config.table} WHERE id=$1${filter(config)}${lock?' FOR UPDATE':''}`,config.platform?[id,config.platform]:[id]);
  if(!result.rows[0])throw new AppError('Record not found. Refresh the table.',404);
  return result.rows[0];
}
export async function readPgRecords(pool,id,page=0,query='',view={}) {
  const config=await loadPgModule(pool,id);
  if(!Number.isInteger(page)||page<0||page>1000000||typeof query!=='string'||query.length>200)throw new AppError('Invalid search or page.');
  const dateIndex=config.fields.findIndex(f=>f.type==='date');
  const sortIndex=view.sort==null?dateIndex:Number(view.sort);
  if(!Number.isInteger(sortIndex)||sortIndex < -1||sortIndex>=config.fields.length||!['asc','desc'].includes(view.direction||'desc'))throw new AppError('Invalid sorting.');
  const direction=view.direction==='asc'?'ASC':'DESC';
  const order=sortIndex<0?'id DESC':`${config.fields[sortIndex].key} ${direction} NULLS LAST, id DESC`;
  const params=[query.trim()];
  let where=`WHERE position(lower($1) in lower(concat_ws(' ',${config.fields.map(f=>`${f.key}::text`).join(',')}))) > 0`;
  if(config.platform){params.push(config.platform);where+=` AND platform::text=$2`;}
  const filters=view.filters||{};
  if(typeof filters!=='object'||Array.isArray(filters)||Object.keys(filters).length>config.fields.length)throw new AppError('Invalid filters.');
  for(const [column,value] of Object.entries(filters)) {
    const index=Number(column);
    if(!Number.isInteger(index)||index<0||index>=config.fields.length||typeof value!=='string'||value.length>200)throw new AppError('Invalid column filter.');
    if(value){params.push(value);where+=` AND position(lower($${params.length}) in lower(coalesce(${config.fields[index].key}::text,''))) > 0`;}
  }
  const client=await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const moneyKey=config.fields.find(f=>['total','amount_thb','price'].includes(f.key)&&f.generated)?.key || (config.table==='platform_payouts'?'amount_thb':config.table==='st_sales_log'?'price':config.custom?'amount':'total');
    const summary=(await client.query(`SELECT count(*),coalesce(sum(${moneyKey}),0) AS money_total FROM public.${config.table} ${where}`,params)).rows[0];
    const total=Number(summary.count);
    const groupField=config.fields.find(f=>['filament_type','category','platform','is_confirmed'].includes(f.key));
    const categories=groupField?(await client.query(`SELECT ${groupField.key}::text AS name,count(*)::int AS records,${config.fields.some(f=>f.key==='unit')?'sum(unit)':'count(*)'} AS quantity,coalesce(sum(${moneyKey}),0) AS amount FROM public.${config.table} ${where} GROUP BY ${groupField.key} ORDER BY count(*) DESC,${groupField.key}`,params)).rows:[];
    const productCategories=config.table==='st_sales_log'?(await client.query(`SELECT product_code AS name,count(*)::int AS records,coalesce(sum(price),0) AS amount FROM public.st_sales_log ${where} GROUP BY product_code ORDER BY product_code`,params)).rows:null;
    const pages=Math.max(1,Math.ceil(total/PAGE_SIZE)),current=Math.min(page,pages-1);
    const result=await client.query(`SELECT ${selectFields(config)} FROM public.${config.table} ${where} ORDER BY ${order} LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,PAGE_SIZE,current*PAGE_SIZE]);
    await client.query('COMMIT');
    return {tab:Number(id),headers:config.fields.map(f=>f.label),rows:result.rows.map(r=>({row:r.id,values:config.fields.map(f=>pgDisplay(r[f.key])),formulas:config.fields.map(f=>!!f.generated)})),page:current,pages,total,moneyTotal:Number(summary.money_total||0),categories,productCategories,categoryLabel:groupField?.label||null,quantityLabel:config.fields.some(f=>f.key==='unit')?'Units':null,sourceTitle:'ns labs · PostgreSQL',limited:false,fields:config.fields.map(f=>({key:f.key,label:f.label,type:f.type,options:f.options||null,optionLabels:f.optionLabels||{},generated:!!f.generated,nullable:!!f.nullable,integer:!!f.integer})),sort:sortIndex,direction:direction.toLowerCase(),updatedAt:new Date().toISOString()};
  } catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export async function readPgCell(pool,id,row,column) {
  const config=await loadPgModule(pool,id),field=pgPosition(config,row,column),record=await find(pool,config,row),value=record[field.key];
  return {tab:Number(id),row,column,record:pgDisplay(record[config.fields[0].key]),rowToken:signature(config,record),token:cellToken(config,record,column),cell:{type:field.type,value:value===null?'':field.type==='number'?Number(value):value,display:pgDisplay(value),formula:!!field.generated,editable:!field.generated,options:field.options||null,optionLabels:field.optionLabels||{},checkbox:field.type==='boolean',checked:value===true,nullable:!!field.nullable}};
}
export async function savePgCell(pool,actor,request) {
  if(!request||!/^[-a-zA-Z0-9]{16,80}$/.test(request.operationId||'')||typeof request.rowToken!=='string'||typeof request.token!=='string')throw new AppError('Invalid save request.');
  const config=await loadPgModule(pool,request.tab),field=pgPosition(config,request.row,request.column),value=pgValue(field,request.value),digest=fingerprint(request),client=await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize retries with the same actor/operation across server instances.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[actor+':'+request.operationId]);
    const prior=(await client.query('SELECT digest,result FROM erp_web.edits WHERE actor=$1 AND operation_id=$2',[actor,request.operationId])).rows[0];
    if(prior){if(prior.digest!==digest)throw new AppError('Save identifier already used.',409);await client.query('COMMIT');return prior.result;}
    const record=await find(client,config,request.row,true);
    if(!equal(signature(config,record),request.rowToken)||!equal(cellToken(config,record,request.column),request.token))throw new AppError('This record changed after you opened it. Refresh before editing again.',409);
    await client.query(`UPDATE public.${config.table} SET ${field.key}=$1 WHERE id=$2`,[value,request.row]);
    const result={saved:true,row:request.row,column:request.column,savedAt:new Date().toISOString()};
    await client.query('INSERT INTO erp_web.edits(actor,operation_id,digest,table_name,record_id,column_name,old_value,new_value,result) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)',[actor,request.operationId,digest,config.table,request.row,field.key,JSON.stringify(record[field.key]),JSON.stringify(value),JSON.stringify(result)]);
    await client.query('COMMIT');return result;
  }catch(e){await client.query('ROLLBACK');if(['22003','22001','22P02','23502','23514','23505'].includes(e.code))throw new AppError('The value does not meet the database field rules.',400);throw e;}finally{client.release();}
}
