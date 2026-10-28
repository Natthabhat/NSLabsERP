const invalid=message=>Object.assign(new Error(message),{status:400});
function text(value,label,max,required=false){if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw invalid(`Enter a valid ${label}.`);return value.trim();}
export function decimal(value,label,allowZero=true){
  if(typeof value!=='string'||!/^\d{1,8}(\.\d{1,2})?$/.test(value))throw invalid(`${label} must be a number with up to 2 decimal places.`);
  const [whole,fraction='']=value.split('.');const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(n>1000000000||(!allowZero&&n===0))throw invalid(`${label} is outside the allowed range.`);return n;
}
export function documentTotals(items,deposit='0'){
  const lines=items.map((item,index)=>{const q=decimal(item.quantity,`Item ${index+1} quantity`,false),p=decimal(item.price,`Item ${index+1} price`);const amount=Number((BigInt(q)*BigInt(p)+50n)/100n);if(amount>1000000000000)throw invalid('An item total is too large.');return amount;});
  const subtotal=lines.reduce((n,a)=>n+a,0),depositCents=decimal(deposit,'Deposit');
  if(subtotal>1000000000000)throw invalid('Document total is too large.');if(depositCents>subtotal)throw invalid('Deposit cannot exceed the total amount.');
  return {lines,subtotal,deposit:depositCents,total:subtotal-depositCents};
}
export const SIGNATORY_NAME='นายณัฏฐภัทร นิลสุวรรณ';
export const SELLER={name:'ร้าน เอนเอสแล็ป (NS Labs)',address:'64 ซอยลาดปลาเค้า 72 ถนนลาดปลาเค้า\nแขวงอนุสาวรีย์ เขตบางเขน กรุงเทพ 10220',phone:'091-793-4343',email:'thenslabs@gmail.com',bank:'060-3-12115-2 ธนาคารกรุงไทย',issuer:SIGNATORY_NAME};
export function validateDocument(input){
  if(!input||!['quotation','receipt'].includes(input.type))throw invalid('Select Quotation or Receipt.');
  const number=text(input.number,'document number',40,true);if(!/^[A-Za-z0-9][A-Za-z0-9_/-]*$/.test(number))throw invalid('Use letters, numbers, hyphens or slashes in the document number.');
  const date=text(input.date,'document date',10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw invalid('Enter a valid document date.');
  const customer={name:text(input.customer?.name,'customer name',160,true),address:text(input.customer?.address,'customer address',300,true),phone:text(input.customer?.phone??'','customer phone',40),taxId:text(input.customer?.taxId??'','customer tax ID',30),branch:text(input.customer?.branch??'','branch number',20),headOffice:input.customer?.headOffice!==false};
  if(customer.taxId&&!/^[\d\s-]{10,30}$/.test(customer.taxId))throw invalid('Enter a valid customer tax ID.');
  if(!Array.isArray(input.items)||!input.items.length||input.items.length>100)throw invalid('Add between 1 and 100 order items.');
  const items=input.items.map((item,index)=>({sku:text(item.sku??'',`item ${index+1} SKU`,40),description:text(item.description,`item ${index+1} description`,240,true),unit:text(item.unit??'ชิ้น',`item ${index+1} unit`,16),quantity:item.quantity,price:item.price}));
  const totals=documentTotals(items,input.deposit||'0');
  if(!['cash','bank','other'].includes(input.payment))throw invalid('Select a payment method.');
  const seller={};for(const [key,max]of Object.entries({name:120,address:240,phone:40,email:100,bank:100}))seller[key]=text(input.seller?.[key]??SELLER[key],`seller ${key}`,max,key==='name');
  seller.issuer=SIGNATORY_NAME;
  return {type:input.type,number,date,customer,items,totals,seller,payment:input.payment,paymentOther:text(input.paymentOther??'','payment details',100),notes:text(input.notes??'','notes',180),copy:input.copy===true};
}
const digit=['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
function thaiInteger(n,afterMillion=false){
 if(n>=1000000)return thaiInteger(Math.floor(n/1000000))+'ล้าน'+(n%1000000?thaiInteger(n%1000000,true):'');
 if(n===0)return 'ศูนย์';const s=String(n),units=['','สิบ','ร้อย','พัน','หมื่น','แสน'];let out='';
 for(let i=0;i<s.length;i++){const d=Number(s[i]),position=s.length-i-1;if(!d)continue;if(position===1)out+=(d===1?'':d===2?'ยี่':digit[d])+'สิบ';else if(position===0)out+=d===1&&(s.length>1||afterMillion)?'เอ็ด':digit[d];else out+=digit[d]+units[position];}return out;
}
export function thaiBaht(cents){return thaiInteger(Math.floor(cents/100))+'บาท'+(cents%100?thaiInteger(cents%100)+'สตางค์':'ถ้วน');}
