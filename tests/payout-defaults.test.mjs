import test from 'node:test';
import assert from 'node:assert/strict';
import {nextPayoutCode,readPayoutDefaults} from '../lib/payout-defaults.mjs';
test('payout defaults increment numeric codes while preserving spacing, case and zero padding',()=>{
 assert.equal(nextPayoutCode('Lazada','Lazada 12'),'Lazada 13');
 assert.equal(nextPayoutCode('Lazada','lazada12'),'lazada13');
 assert.equal(nextPayoutCode('Shopee','Shopee-009'),'Shopee-010');
 assert.equal(nextPayoutCode('Etsy','Etsy_99'),'Etsy_100');
 assert.equal(nextPayoutCode('Ebay',null),'Ebay 1');
 assert.equal(nextPayoutCode('Lazada','Lazada 9007199254740993'),'Lazada 9007199254740994');
});
test('payout default query is platform scoped, uses numeric suffix order and ignores visible filters',async()=>{
 const calls=[];const pool={query:async(sql,args)=>{calls.push({sql,args});return {rows:[{payout_code:'Lazada 12'}]};}};
 assert.deepEqual(await readPayoutDefaults(pool,1383927934),{payout_code:'Lazada 13'});
 assert.equal(calls[0].args[0],'Lazada');assert.match(calls[0].sql,/::numeric DESC/);assert(!calls[0].sql.includes('OFFSET'));
 assert.deepEqual(await readPayoutDefaults(pool,94512498),{});assert.equal(calls.length,1);
 await assert.rejects(readPayoutDefaults(pool,'unknown'));
});
