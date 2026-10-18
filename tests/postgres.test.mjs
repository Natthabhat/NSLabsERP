import test from 'node:test';
import assert from 'node:assert/strict';
import {pgModule,pgPosition,pgValue} from '../lib/postgres-model.mjs';
test('PostgreSQL column selection rejects unknown tables and columns',()=>{assert.throws(()=>pgModule('printing_expenses; DROP TABLE x'));assert.throws(()=>pgPosition(pgModule(94512498),1,7));});
test('PostgreSQL validation preserves generated totals, enums, integers and nullable dates',()=>{const c=pgModule(94512498);assert.throws(()=>pgValue(c.fields[3],9),{status:403});assert.throws(()=>pgValue(c.fields[1],1.5));assert.throws(()=>pgValue(c.fields[5],'anything'));assert.throws(()=>pgValue(c.fields[4],'2025-02-30'));assert.throws(()=>pgValue(c.fields[0],null));assert.equal(pgValue(pgModule(683461259).fields[1],null),null);assert.equal(pgValue(c.fields[0],"=literal SQL ' input"),"=literal SQL ' input");});

test('ST Log product codes use ST001 through ST014 and reject unsupported codes',()=>{const f=pgModule(1270018478).fields[0];assert.equal(f.options.length,14);assert.equal(pgValue(f,'ST001'),'ST001');assert.equal(pgValue(f,'ST014'),'ST014');assert.throws(()=>pgValue(f,'ST015'));});
