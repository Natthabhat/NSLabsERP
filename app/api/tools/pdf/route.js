import {session} from '../../../../lib/auth.mjs';
import {AppError,checkOrigin} from '../../../../lib/security.mjs';
import {failure} from '../../../../lib/http.mjs';
import {generateDocumentPdf} from '../../../../lib/document-pdf.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request){try{
 const user=await session();if(process.env.DATA_BACKEND!=='postgres'||user?.provider!=='postgres'||user.username!==process.env.POSTGRES_LOGIN_USER)throw new AppError('Sign in to create documents.',401);
 checkOrigin(request);if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AppError('Use JSON.',415);
 const reader=request.body?.getReader();if(!reader)throw new AppError('Document is missing.',400);let size=0;const chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>150000){await reader.cancel();throw new AppError('Document is too large.',413);}chunks.push(value);}
 let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new AppError('Invalid document.',400);}
 const pdf=await generateDocumentPdf(input);const name=String(input.number).replace(/[^A-Za-z0-9_-]/g,'-');
 return new Response(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${input.type}-${name}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return failure(e);}}
