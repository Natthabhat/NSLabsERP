import PDFDocument from 'pdfkit';
import {join} from 'node:path';
import {validateDocument,thaiBaht} from './document-model.mjs';
const money=cents=>(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export async function generateDocumentPdf(input){
 const data=validateDocument(input),root=process.cwd();
 const doc=new PDFDocument({size:'A4',margin:28,font:join(root,'assets/fonts/Sarabun-Regular.ttf'),info:{Title:`${data.type==='quotation'?'Quotation':'Receipt'} ${data.number}`,Author:'NS Labs',Subject:'Customer document'},autoFirstPage:false});
 doc.registerFont('Regular',join(root,'assets/fonts/Sarabun-Regular.ttf'));doc.registerFont('Bold',join(root,'assets/fonts/Sarabun-Bold.ttf'));
 const chunks=[];const output=new Promise((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 const x=28,w=539,red='#963b3b',cols=[30,65,190,45,40,80,89];
 function text(value,px,py,width,size=9,bold=false,align='left'){doc.font(bold?'Bold':'Regular').fontSize(size).fillColor('#111').text(String(value),px,py,{width,align,lineGap:1});}
 function height(value,width,size=9){return doc.font('Regular').fontSize(size).heightOfString(String(value),{width,lineGap:1});}
 function rect(px,py,width,h,fill=null){doc.lineWidth(.6).strokeColor('#444');if(fill)doc.rect(px,py,width,h).fillAndStroke(fill,'#444');else doc.rect(px,py,width,h).stroke();}
 function header(pageNumber){
  doc.addPage();doc.image(join(root,'public/logo-black.png'),x,32,{fit:[104,64]});
  const nameSize=height(data.seller.name,320,17)>24?13:17;
  text(data.seller.name,148,26,320,nameSize,true);const addressY=26+height(data.seller.name,320,nameSize)+6;
  text(data.seller.address,148,addressY,330,9);const contactY=addressY+height(data.seller.address,330,9)+7;
  text(`โทร: ${data.seller.phone}   Email: ${data.seller.email}`,148,contactY,380,8);
  const titleY=Math.max(130,contactY+(data.type==='receipt'?32:20));
  rect(475,25,92,20);text(data.copy?'สำเนา / COPY':'ต้นฉบับ / ORIGINAL',477,29,88,8,false,'center');
  if(data.type==='receipt')text('ใบเสร็จรับเงิน ไม่ใช่ใบกำกับภาษี',148,contactY+15,360,8);
  doc.lineWidth(1.5).strokeColor(red).roundedRect(180,titleY,235,43,6).stroke();
  text(data.type==='quotation'?'ใบเสนอราคา':'ใบเสร็จรับเงิน',184,titleY+3,227,16,true,'center');text(data.type==='quotation'?'QUOTATION':'RECEIPT',184,titleY+24,227,10,true,'center');
  const customerY=titleY+58;
  text('นามลูกค้า / Customer',x,customerY,115,9);text(data.customer.name,145,customerY-2,260,10,true);
  const nameHeight=Math.max(16,height(data.customer.name,260,10));let y=customerY+nameHeight+3;
  if(pageNumber===1){text('ที่อยู่ / Address',x,y,110,9);text(data.customer.address,145,y,250,9);y+=Math.max(28,height(data.customer.address,250))+8;}
  text(`เลขที่ / No.  ${data.number}`,420,customerY,147,10,true);
  const [year,month,day]=data.date.split('-');text(`วันที่ / Date  ${day}/${month}/${Number(year)+543}`,420,customerY+20,147,9);
  text(`โทร / Tel.  ${data.customer.phone||'-'}`,420,customerY+41,147,8);
  if(pageNumber===1){text(`เลขผู้เสียภาษี / Tax ID: ${data.customer.taxId||'-'}`,x,y,350,9);y+=20;
  text(data.customer.headOffice?'[X] สำนักงานใหญ่ / Head office':`สาขาที่ / Branch: ${data.customer.branch||'-'}`,x,y,400,9);y+=23;}else y=Math.max(y,customerY+58);
  text(`หน้า / Page ${pageNumber}`,477,y-15,90,7,false,'right');
  const labels=['ลำดับ','รหัสสินค้า\nSKU','รายละเอียด\nDescription','จำนวน\nQty','หน่วย\nUnit','ราคา/หน่วย\nUnit price','จำนวนเงิน\nAmount'];let px=x;
  labels.forEach((label,i)=>{rect(px,y,cols[i],36,red);doc.fillColor('#fff').font('Bold').fontSize(7.5).text(label,px+3,y+4,{width:cols[i]-6,align:'center',lineGap:0});px+=cols[i];});return y+36;
 }
 function row(item,index,y,h){const values=[index+1,item.sku||'-',item.description,Number(item.quantity).toFixed(2),item.unit,money(Number(item.price)*100),money(data.totals.lines[index])];let px=x;
  values.forEach((v,i)=>{rect(px,y,cols[i],h);text(v,px+4,y+4,cols[i]-8,8.5,false,i===2?'left':i>=3&&i!==4?'right':'center');px+=cols[i];});
 }
 function footer(y){
  const totalsX=365,totalsW=202;const values=[['รวมเงิน / TOTAL AMOUNT',data.totals.subtotal],['หักเงินมัดจำ / DEPOSIT',data.totals.deposit],['หลังหักมัดจำ / AFTER DEPOSIT',data.totals.total],['ยอดเงินสุทธิ / GRAND TOTAL',data.totals.total]];
  values.forEach(([label,amount],i)=>{rect(totalsX,y+i*29,totalsW,29,i===3?'#f5eeee':null);text(label,totalsX+5,y+i*29+8,118,8,i===3);text(money(amount),totalsX+122,y+i*29+8,75,9,i===3,'right');});
  rect(x,y,328,40,'#f6f6f6');text(`ตัวอักษร: (${thaiBaht(data.totals.total)})`,x+10,y+10,308,9);
  text('การชำระเงิน / Conditions of Payments',x+7,y+56,320,10,true);
  text(`${data.payment==='cash'?'[X]':'[ ]'} เงินสด / Cash`,x+17,y+76,310,9);
  text(`${data.payment==='bank'?'[X]':'[ ]'} ธนาคาร / Bank: ${data.seller.bank}`,x+17,y+92,310,9);
  const bankH=Math.max(16,height(data.seller.bank,240));
  text(`${data.payment==='other'?'[X]':'[ ]'} อื่น ๆ / Other: ${data.paymentOther}`,x+17,y+94+bankH,310,9);
  if(data.notes)text(`หมายเหตุ / Notes: ${data.notes}`,x+7,y+115+bankH,320,8);
  const labels=data.type==='quotation'?['ผู้สั่งซื้อสินค้า / Customer','ผู้อนุมัติ / Approved by','ผู้ออก / Issued by']:['ผู้รับสินค้า / Received by','ผู้ส่งสินค้า / Delivered by','ผู้รับเงิน / Received payment'];
  const sy=735,boxW=(w-12)/3;labels.forEach((label,i)=>{const bx=x+i*(boxW+6);rect(bx,sy,boxW,77);text(label,bx+5,sy+7,boxW-10,8,true);doc.lineWidth(.4).strokeColor('#999').moveTo(bx+14,sy+38).lineTo(bx+boxW-14,sy+38).stroke();text(i===2?data.seller.issuer:'(........................................)',bx+7,sy+42,boxW-14,8,false,'center');text('วันที่ / Date ....... / ....... / ..........',bx+7,sy+62,boxW-14,7);});
 }
 let page=1,y=header(page);data.items.forEach((item,index)=>{const h=Math.max(20,height(item.description,cols[2]-8,8.5)+8,height(item.sku,cols[1]-8,8.5)+8,height(item.unit,cols[4]-8,8.5)+8);
  if(y+h>520){text('ต่อหน้าถัดไป / Continued on next page',x,555,w,9,false,'right');y=header(++page);if(y+h>520)throw Object.assign(new Error('Business details or an item description is too long for this template. Shorten the text and try again.'),{status:400});}
  row(item,index,y,h);y+=h;
 });
 if(y>520){y=header(++page);}if(y<520){let px=x;cols.forEach(c=>{rect(px,y,c,520-y);px+=c;});}
 footer(530);doc.end();return output;
}
