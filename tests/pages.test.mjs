import test from 'node:test';import assert from 'node:assert/strict';
import {loadPgModule} from '../lib/pg-store.mjs';import {createPage,listPages} from '../lib/pg-pages.mjs';
test('custom pages resolve only registered safe table names',async()=>{
 const pool={query:async sql=>({rows:sql.includes('FROM erp_web.pages')?[{table_key:'erp_page_3000000000'}]:[]})};
 const c=await loadPgModule(pool,3000000000);assert.equal(c.custom,true);assert.deepEqual(c.fields.map(f=>f.key),['name','entry_date','amount','notes']);
 await assert.rejects(loadPgModule({query:async()=>({rows:[{table_key:'x; DROP TABLE x'}]})},3000000000));
});
test('page creation validates names and groups before database access',async()=>{
 const pool={connect(){throw Error('unexpected connection');}};
 await assert.rejects(createPage(pool,'natthabhat',{title:'',group:'Workshop',operationId:'1234567890123456'}),/page name/);
 await assert.rejects(createPage(pool,'natthabhat',{title:'Test',group:'admin',operationId:'1234567890123456'}),/page name/);
});
test('page creation uses parameters and audits in a transaction',async()=>{
 const calls=[];const pool={connect:async()=>({query:async(sql,params)=>{calls.push({sql,params});return {rows:sql.includes(' AS id')?[{id:'3000000000'}]:[]};},release(){}})};
 const result=await createPage(pool,'natthabhat',{title:'New page',group:'Workshop',operationId:'1234567890123456'});assert.equal(result.id,3000000000);assert.equal(calls.at(-1).sql,'COMMIT');assert.ok(calls.some(c=>c.sql.startsWith('INSERT INTO erp_web.edits')));
});
