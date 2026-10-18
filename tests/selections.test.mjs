import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPgModule} from '../lib/pg-store.mjs';
import {saveSelection} from '../lib/pg-selections.mjs';
test('database selections override defaults while labels keep stored values stable',async()=>{
 const pool={query:async sql=>({rows:sql.includes('selection_options')?[{list_key:'product_code',option_value:'ST015',label:'New product'}]:[]})};
 const config=await loadPgModule(pool,1270018478);assert.deepEqual(config.fields[0].options,['ST015']);assert.equal(config.fields[0].optionLabels.ST015,'New product');
});
test('selection settings reject unknown lists and oversized input before connection',async()=>{
 const pool={connect(){throw Error('must not connect');}};
 await assert.rejects(saveSelection(pool,'natthabhat',{list:'users',value:'x',label:'x',operationId:'1234567890123456'}),/valid selection/);
 await assert.rejects(saveSelection(pool,'natthabhat',{list:'platform',value:'x'.repeat(61),label:'x',operationId:'1234567890123456'}),/valid selection/);
});
test('selection changes are parameterized and audited atomically',async()=>{
 const calls=[];const pool={connect:async()=>({query:async(sql,params)=>{calls.push({sql,params});return {rows:[]};},release(){}})};
 await saveSelection(pool,'natthabhat',{list:'product_code',value:"x'; --",label:'Label',operationId:'1234567890123456'});
 const q=calls.find(c=>c.sql.startsWith('SELECT erp_web.save_selection'));assert.deepEqual(q.params,['product_code',"x'; --",'Label']);assert.ok(calls.some(c=>c.sql.startsWith('INSERT INTO erp_web.edits')));assert.equal(calls.at(-1).sql,'COMMIT');
});

test('deleted selections stay labeled but are excluded from dropdown choices',async()=>{
 const pool={query:async sql=>({rows:sql.includes('selection_options')?[{list_key:'product_code',option_value:'ST001',label:'Product one',active:false},{list_key:'product_code',option_value:'ST002',label:'Product two',active:true}]:[]})};
 const config=await loadPgModule(pool,1270018478);assert.deepEqual(config.fields[0].options,['ST002']);assert.equal(config.fields[0].optionLabels.ST001,'Product one');
});
test('delete and restore change visibility through parameterized function and keep audit',async()=>{
 for(const action of ['delete','restore']){
 const calls=[];const pool={connect:async()=>({query:async(sql,params)=>{calls.push({sql,params});return {rows:[]};},release(){}})};
 await saveSelection(pool,'natthabhat',{list:'product_code',value:'ST001',label:'ST001',action,operationId:'1234567890123456'});
 const q=calls.find(c=>c.sql.startsWith('SELECT erp_web.set_selection_active'));assert.deepEqual(q.params,['product_code','ST001',action==='restore']);assert.ok(calls.some(c=>c.sql.startsWith('INSERT INTO erp_web.edits')));
 }
});
