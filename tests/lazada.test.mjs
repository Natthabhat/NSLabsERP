import test from 'node:test';
import assert from 'node:assert/strict';
import {lazadaSignature,lazadaRequest,lazadaToken,validateLazadaCredentials} from '../lib/lazada.mjs';
test('Lazada signature matches the official HMAC SHA256 example and ignores existing sign',()=>{
 const p={app_key:'123456',access_token:'test',timestamp:'1517820392000',sign_method:'sha256',order_id:'1234'};
 assert.equal(lazadaSignature('/order/get',p,'helloworld'),'4190D32361CFB9581350222F345CB77F3B19F0E31D162316848A2C1FFD5FAB4A');
 assert.equal(lazadaSignature('/order/get',{sign:'old',...p},'helloworld'),lazadaSignature('/order/get',p,'helloworld'));
});
test('Lazada request uses fixed regional hosts, POST body and prevents unsupported operations',async()=>{
 const seen=[];const credentials={appKey:'123456',appSecret:'secret-for-test'};
 const fetcher=async(url,options)=>{seen.push({url,options});return {ok:true,async json(){return {code:'0',data:{orders:[]}};}};};
 await lazadaRequest('/orders/get',{access_token:'private-token'},credentials,{fetcher,now:100});
 assert.equal(seen[0].url,'https://api.lazada.co.th/rest/orders/get');assert.equal(seen[0].options.method,'POST');assert.equal(seen[0].options.body.get('access_token'),'private-token');assert.equal(seen[0].options.redirect,'error');
 await lazadaRequest('/auth/token/create',{code:'private-code'},credentials,{fetcher});assert.equal(seen[1].url,'https://auth.lazada.com/rest/auth/token/create');
 await assert.rejects(lazadaRequest('/product/update',{},credentials,{fetcher}),/Unsupported/);assert.equal(seen.length,2);
 await assert.rejects(lazadaRequest('/orders/get',{},credentials,{fetcher:async()=>({ok:false,json:async()=>({code:'Invalid',message:'private-token'})})}),e=>!e.message.includes('private-token'));
});
test('Lazada only accepts Thailand tokens, validates expiry and stores refresh deadlines',()=>{
 const t=lazadaToken({country:'th',access_token:'token',refresh_token:'refresh',expires_in:3600,refresh_expires_in:86400},1000);
 assert.equal(t.expiresAt,3601000);assert.equal(t.refreshExpiresAt,86401000);
 for(const d of [{country:'sg',access_token:'token',expires_in:100},{country:'th',access_token:'',expires_in:100},{country:'th',access_token:'token',expires_in:-1}])assert.throws(()=>lazadaToken(d));
 assert.deepEqual(validateLazadaCredentials({appKey:' 123456 ',appSecret:'abcdefghijklmnop'}),{appKey:'123456',appSecret:'abcdefghijklmnop'});
 assert.throws(()=>validateLazadaCredentials({appKey:'https://evil',appSecret:'secret'}));
});
