import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProduct,saveProduct,priceCents } from '../lib/products.mjs';
const input={name:'Cable organiser',sku:'n003',quantity:5,variants:[{name:'Large grey',sku:'n003lg',quantity:8}]};
test('product validation normalizes SKUs and counts stock only at the variant level',()=>{
 const p=validateProduct(input);assert.equal(p.sku,'N003');assert.equal(p.variants[0].sku,'N003LG');assert.equal(p.quantity,0);
 assert.equal(validateProduct({...input,variants:[]}).quantity,5);
 for(const bad of [{...input,name:''},{...input,quantity:1.5},{...input,variants:[{name:'Grey',sku:'N003',quantity:0}]},{...input,variants:[{name:'Grey',sku:'LG',quantity:-1}]},{...input,id:'bad'},{...input,picture:'data:image/svg+xml;base64,PHN2Zz4='},{...input,picture:'data:image/png;base64,aGVsbG8='}])assert.throws(()=>validateProduct(bad));
 assert.equal(validateProduct({...input,picture:null}).picture,null);
 assert.equal(validateProduct(input).picture,undefined);
});
function poolFor(handler){const calls=[];let released=false;return {calls,get released(){return released;},async connect(){return{query:async(sql,args)=>{calls.push({sql,args});return handler(sql,args);},release(){released=true;}};}};}
test('product edit rolls back rather than overwriting another edit or deleting its variants',async()=>{
 const pool=poolFor(sql=>sql.startsWith('SELECT sku')?{rowCount:0}:sql.startsWith('UPDATE')?{rowCount:0}:{rows:[]});
 await assert.rejects(saveProduct({...input,id:'00000000-0000-0000-0000-000000000001',version:1},pool),/another window/);
 assert(pool.calls.some(c=>c.sql==='ROLLBACK'));assert(!pool.calls.some(c=>c.sql.startsWith('DELETE')));assert(pool.released);
});
test('SKU collision across products and variants fails before mutations',async()=>{
 const pool=poolFor(sql=>sql.startsWith('SELECT sku')?{rowCount:1}:{rows:[]});
 await assert.rejects(saveProduct(input,pool),/already used/);assert(!pool.calls.some(c=>c.sql.startsWith('INSERT')));assert(pool.released);
});
test('product and variant insert is one transaction with parameterized user values',async()=>{
 const pool=poolFor(sql=>sql.startsWith('SELECT sku')?{rowCount:0}:sql.startsWith('INSERT INTO erp_web.products')?{rows:[{id:'00000000-0000-0000-0000-000000000001'}]}:{rows:[]});
 await saveProduct({...input,name:"Product ' SQL"},pool);assert(pool.calls.some(c=>c.sql==='COMMIT'));assert(!pool.calls.some(c=>c.sql.includes("Product ' SQL")));assert.equal(pool.calls.find(c=>c.sql.startsWith('INSERT INTO erp_web.product_variants')).args[2],'N003LG');assert(pool.released);
});

test('prices use exact satang, allow inherited variant prices, and reject invalid amounts',()=>{
 assert.equal(priceCents('19.99'),1999);assert.equal(priceCents('0'),0);assert.equal(priceCents('1.1'),110);assert.equal(priceCents('10000000.00'),1000000000);
 for(const value of ['',null,undefined])assert.equal(priceCents(value),null);
 for(const value of ['-1','1.001','1e3','NaN','10000000.01',Infinity,1.23])assert.throws(()=>priceCents(value));
 const p=validateProduct({...input,price:'59.00',variants:[{...input.variants[0],price:'69.50'},{name:'White',sku:'N003W',quantity:1,price:''}]});
 assert.equal(p.priceCents,5900);assert.equal(p.variants[0].priceCents,6950);assert.equal(p.variants[1].priceCents,null);
});
