import test from 'node:test';
import assert from 'node:assert/strict';
import {readPgRecords} from '../lib/pg-store.mjs';
import {recordView} from '../lib/record-view.mjs';
test('record view sorts newest dates first, blanks last and filters before pagination',()=>{
 const rows=[{row:1,values:['A','2025-01-01']},{row:2,values:['B','2026-01-01']},{row:3,values:['A','']}];
 assert.deepEqual(recordView(rows,['Item','Date'],['text','date']).rows.map(r=>r.row),[2,1,3]);
 assert.deepEqual(recordView(rows,['Item','Date'],['text','date'],{filters:{0:'A'}}).rows.map(r=>r.row),[1,3]);
});
test('Postgres sorting is allowlisted and filter values remain parameters with platform isolation',async()=>{
 const calls=[];
 const pool={query:async()=>({rows:[]}),connect:async()=>({query:async(sql,params)=>{calls.push({sql,params});return {rows:sql.includes('count(*)')?[{count:45}]:[]};},release(){}})};
 await readPgRecords(pool,683461259,1,'',{sort:2,direction:'asc',filters:{0:"x' OR 1=1 --"}});
 const select=calls.find(c=>c.sql.includes(' LIMIT '));
 assert.match(select.sql,/platform::text=\$2/);
 assert.match(select.sql,/ORDER BY amount_thb ASC NULLS LAST, id DESC/);
 assert.deepEqual(select.params,['','Ebay',"x' OR 1=1 --",40,40]);
 assert.ok(!select.sql.includes("x' OR"));
 await assert.rejects(readPgRecords(pool,683461259,0,'',{sort:'amount; DROP TABLE x'}));
 await assert.rejects(readPgRecords(pool,683461259,0,'',{filters:{99:'x'}}));
});
