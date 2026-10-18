import test from 'node:test';
import assert from 'node:assert/strict';
import {managePgRecords} from '../lib/pg-manage.mjs';
function fixture(custom=[]) {
 const calls=[];
 const client={query:async(sql,params)=>{calls.push({sql,params});if(sql.includes('RETURNING id'))return {rows:[{id:125}]};if(sql.includes('AS column_key'))return {rows:[{column_key:'custom_123456789012345678901234'}]};return {rows:[]};},release(){}};
 return {calls,pool:{query:async()=>({rows:custom}),connect:async()=>client}};
}
const base={action:'entry',tab:683461259,operationId:'12345678-1234-1234-1234-123456789012',values:{payout_code:'Ebay new',payout_date:'2026-10-18',amount_thb:100,is_confirmed:false}};
test('new entry assigns platform from the selected module and audits in the same transaction',async()=>{
 const f=fixture();assert.deepEqual(await managePgRecords(f.pool,'natthabhat',base),{saved:true,row:125});
 const insert=f.calls.find(c=>c.sql.startsWith('INSERT INTO public.'));
 assert.deepEqual(insert.params,['Ebay new','2026-10-18',100,false,'Ebay']);
 assert.ok(f.calls.some(c=>c.sql.startsWith('INSERT INTO erp_web.edits')));assert.equal(f.calls.at(-1).sql,'COMMIT');
});
test('new entries reject calculated, unknown, and invalid fields without insert',async()=>{
 for(const values of [{...base.values,total:2},{...base.values,platform:'Shopee'},{...base.values,amount_thb:'wrong'}]){
  const f=fixture();await assert.rejects(managePgRecords(f.pool,'natthabhat',{...base,values}));assert.ok(!f.calls.some(c=>c.sql.startsWith('INSERT INTO public.')));assert.equal(f.calls.at(-1).sql,'ROLLBACK');
 }
});
test('new columns use the restricted database function with parameterized labels',async()=>{
 const f=fixture();await managePgRecords(f.pool,'natthabhat',{action:'column',tab:683461259,operationId:base.operationId,label:"Note'; drop table x; --",type:'text'});
 const c=f.calls.find(c=>c.sql.includes('AS column_key'));assert.equal(c.sql,'SELECT erp_web.add_column($1,$2,$3) AS column_key');assert.equal(c.params[0],'platform_payouts');
});
test('invalid column types are rejected before calling database schema function',async()=>{
 const f=fixture();await assert.rejects(managePgRecords(f.pool,'natthabhat',{action:'column',tab:683461259,operationId:base.operationId,label:'Notes',type:'text; DROP TABLE x'}));assert.ok(!f.calls.some(c=>c.sql.includes('AS column_key')));
});
