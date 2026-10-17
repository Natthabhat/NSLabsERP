import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {readPgRecords,readPgCell,savePgCell} from '../lib/pg-store.mjs';
import {verifyDatabaseLogin} from '../lib/database.mjs';
test('PostgreSQL integration: persistence, generated totals, conflicts, retries, rollback and platform isolation',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(decodeURIComponent(url.pathname.slice(1)),'nslabs_erp_test','Tests must only run on the isolated fixture database');
 const pool=new pg.Pool({connectionString:url.href,max:4});
 try {
 const before=await readPgCell(pool,94512498,1,3);assert.equal(before.cell.value,10);
 const request={...before,value:12.5,operationId:randomUUID()};delete request.cell;delete request.record;
 const saved=await savePgCell(pool,'test-admin',request);assert.equal(saved.saved,true);
 assert.equal((await readPgCell(pool,94512498,1,4)).cell.value,25);
 assert.deepEqual(await savePgCell(pool,'test-admin',request),saved);
 await assert.rejects(savePgCell(pool,'test-admin',{...request,value:14}),{status:409});
 await assert.rejects(savePgCell(pool,'test-admin',{...request,operationId:randomUUID()}),{status:409});
 const snapshot=await readPgCell(pool,94512498,1,3);
 const broken={connect:async()=>{const client=await pool.connect();return {query:(text,args)=>text.startsWith('INSERT INTO erp_web.edits')?Promise.reject(new Error('simulated audit failure')):client.query(text,args),release:()=>client.release()};}};
 await assert.rejects(savePgCell(broken,'test-admin',{...snapshot,value:99,operationId:randomUUID()}),/simulated audit failure/);
 assert.equal((await readPgCell(pool,94512498,1,3)).cell.value,12.5);
 assert.equal((await readPgRecords(pool,94512498,99,'fixture')).page,0);
 assert.equal((await readPgRecords(pool,94512498,0,"' OR 1=1 --")).total,0);
 assert.equal((await readPgRecords(pool,683461259)).total,1);
 assert.equal((await readPgCell(pool,683461259,1,2)).cell.value,'2026-10-17');
 await assert.rejects(readPgCell(pool,1004654573,1,1),{status:404});
 const cb=await readPgCell(pool,683461259,1,4);await savePgCell(pool,'test-admin',{...cb,value:true,operationId:randomUUID()});assert.equal((await readPgCell(pool,683461259,1,4)).cell.checked,true);
 await assert.rejects(pool.query('DELETE FROM public.printing_expenses WHERE id=1'),{code:'42501'});
 process.env.DATABASE_URL=url.href;process.env.POSTGRES_LOGIN_USER='nslabs_erp_web';await verifyDatabaseLogin('nslabs_erp_web',decodeURIComponent(url.password));await assert.rejects(verifyDatabaseLogin('nslabs_erp_web','wrong'),{status:401});
 } finally {await pool.end();}
});
