import { database } from './database.mjs';
import { AppError } from './security.mjs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function productId(value) { if (typeof value !== 'string' || !uuid.test(value)) throw new AppError('Invalid product.', 400); return value; }
function text(value, max, label, required = true) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new AppError(`Enter a valid ${label}.`, 400);
  return value.trim();
}
function quantity(value) { if (!Number.isInteger(value) || value < 0 || value > 1000000000) throw new AppError('Stock must be a whole number between 0 and 1,000,000,000.', 400); return value; }
export function priceCents(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{1,8}(\.\d{1,2})?$/.test(value)) throw new AppError('Enter a price with up to 2 decimal places.',400);
  const [whole,fraction='']=value.split('.');
  const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(cents>1000000000)throw new AppError('Price cannot exceed THB 10,000,000.00.',400);
  return cents;
}
export function validateProduct(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('Invalid product.', 400);
  if (!Array.isArray(input.variants) || input.variants.length > 100) throw new AppError('Use up to 100 variants per product.',400);
  const value = { name: text(input.name,160,'product name'), sku: text(input.sku,80,'SKU').toUpperCase(), description: text(input.description ?? '',4000,'description',false), quantity: input.variants.length ? 0 : quantity(input.quantity), priceCents:priceCents(input.price), variants: [] };
  const skus = new Set([value.sku]);
  value.variants = input.variants.map(v => {
    const variant = { name:text(v?.name,160,'variant name'), sku:text(v?.sku,80,'sub-SKU').toUpperCase(), quantity:quantity(v?.quantity), priceCents:priceCents(v?.price) };
    if (skus.has(variant.sku)) throw new AppError('Every product SKU and variant sub-SKU must be unique.',400);
    skus.add(variant.sku); return variant;
  });
  if (value.variants.length) value.quantity = 0;
  if (input.id !== undefined) { value.id=productId(input.id); if (!Number.isInteger(input.version) || input.version<1) throw new AppError('Reload this product before editing.',400); value.version=input.version; }
  if (input.picture === null) { value.picture=null; value.pictureType=null; }
  else if (input.picture !== undefined) {
    if (typeof input.picture!=='string' || input.picture.length>2800000) throw new AppError('Use a JPG, PNG or WebP picture up to 2 MB.',400);
    const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(input.picture);
    if (!match) throw new AppError('Use a JPG, PNG or WebP picture.',400);
    const bytes=Buffer.from(match[2],'base64'), type=match[1];
    const valid = type==='image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : type==='image/jpeg' ? bytes[0]===255&&bytes[1]===216&&bytes[2]===255 : bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
    if (!valid || !bytes.length || bytes.length>2097152) throw new AppError('Use a valid JPG, PNG or WebP picture up to 2 MB.',400);
    value.picture=bytes; value.pictureType=type;
  }
  return value;
}
export async function listProducts() {
  const result=await database().query(`SELECT p.id,p.name,p.sku,p.description,p.quantity,p.price_cents AS "priceCents",p.version,p.updated_at AS "updatedAt",(p.picture IS NOT NULL) AS "hasPicture",
    COALESCE((SELECT jsonb_agg(jsonb_build_object('name',v.name,'sku',v.sku,'quantity',v.quantity,'priceCents',v.price_cents) ORDER BY v.position) FROM erp_web.product_variants v WHERE v.product_id=p.id),'[]'::jsonb) AS variants
    FROM erp_web.products p ORDER BY p.name,p.id LIMIT 1001`);
  return {products:result.rows.slice(0,1000),truncated:result.rows.length>1000};
}
export async function saveProduct(input, pool = database()) {
  const p=validateProduct(input), client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('erp-product-skus',0))");
    const skus=[p.sku,...p.variants.map(v=>v.sku)];
    const duplicate=await client.query(`SELECT sku FROM erp_web.products WHERE sku=ANY($1::text[]) AND ($2::uuid IS NULL OR id<>$2) UNION ALL SELECT sku FROM erp_web.product_variants WHERE sku=ANY($1::text[]) AND ($2::uuid IS NULL OR product_id<>$2) LIMIT 1`,[skus,p.id??null]);
    if (duplicate.rowCount) throw new AppError('That SKU or sub-SKU is already used by another product.',409);
    let result;
    if (p.id) {
      const picture=p.picture===undefined?'':',picture=$8,picture_type=$9';
      result=await client.query(`UPDATE erp_web.products SET name=$1,sku=$2,description=$3,quantity=$4,price_cents=$7,version=version+1,updated_at=now()${picture} WHERE id=$5 AND version=$6 RETURNING id`,[p.name,p.sku,p.description,p.quantity,p.id,p.version,p.priceCents,...(p.picture===undefined?[]:[p.picture,p.pictureType])]);
      if (!result.rowCount) throw new AppError('This product changed in another window. Close the form, refresh, and try again.',409);
      await client.query('DELETE FROM erp_web.product_variants WHERE product_id=$1',[p.id]);
    } else result=await client.query('INSERT INTO erp_web.products(name,sku,description,quantity,picture,picture_type,price_cents) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[p.name,p.sku,p.description,p.quantity,p.picture??null,p.pictureType??null,p.priceCents]);
    const id=result.rows[0].id;
    for (const [index,v] of p.variants.entries()) await client.query('INSERT INTO erp_web.product_variants(product_id,name,sku,quantity,position,price_cents) VALUES($1,$2,$3,$4,$5,$6)',[id,v.name,v.sku,v.quantity,index,v.priceCents]);
    await client.query('COMMIT'); return {id};
  } catch(error) { await client.query('ROLLBACK'); if(error.code==='23505') throw new AppError('That SKU is already in use.',409); throw error; }
  finally { client.release(); }
}
