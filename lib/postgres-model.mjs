import { AppError } from './security.mjs';
const field = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
const costs = (last, label, options) => [
  field('item_order', 'Item / order', 'text', {max: 255}),
  field('unit', 'Units', 'number', {integer: true}),
  field('price', 'Unit price', 'number'),
  field('total', 'Total', 'number', {generated: true}),
  field('order_date', 'Order date', 'date'),
  field(last, label, 'text', {options}),
];
export const pgModules = {
  94512498: { table: 'printing_expenses', fields: costs('category', 'Category', ['Machine','Tools','Part']) },
  756806574: { table: 'filament_purchases', fields: costs('filament_type', 'Material', ['ABS','PLA','PETG','TPU','ASA','PC','PA6']) },
  1270018478: { table: 'st_sales_log', fields: [field('product_code','Product code','text',{max:255}),field('platform','Platform','text',{options:['Ebay','Shopee','Etsy','Lazada','Facebook']}),field('sale_date','Sale date','date'),field('price','Price','number'),field('shipping','Shipping','number'),field('buyer','Buyer','text',{nullable:true,max:255})] },
  ...Object.fromEntries([[683461259,'Ebay'],[746615023,'Etsy'],[1383927934,'Lazada'],[1004654573,'Shopee']].map(([id,platform]) => [id,{table:'platform_payouts',platform,fields:[field('payout_code','Payout code','text',{max:255}),field('payout_date','Payout date','date',{nullable:true}),field('amount_thb','Amount (THB)','number'),field('is_confirmed','Confirmed','boolean')]}])),
};
export function pgModule(id) {
  const result=Object.hasOwn(pgModules,id)?pgModules[id]:null;
  if(!result) throw new AppError('This screen is not connected to a PostgreSQL table.',404);
  return result;
}
export function pgPosition(config,row,column) {
  if(!Number.isSafeInteger(row)||row<1||!Number.isInteger(column)||column<1||column>config.fields.length) throw new AppError('Invalid record or column.');
  return config.fields[column-1];
}
export function pgValue(field,value) {
  if(field.generated) throw new AppError('PostgreSQL calculates this value. Edit units or unit price instead.',403);
  if(value===null) {if(!field.nullable)throw new AppError('This field is required and cannot be cleared.');return null;}
  if(field.type==='number') {
    if(typeof value!=='number'||!Number.isFinite(value)||(field.integer&&(!Number.isInteger(value)||Math.abs(value)>2147483647)))throw new AppError(field.integer?'Enter a valid whole number.':'Enter a valid number.');
  } else if(field.type==='boolean') {if(typeof value!=='boolean')throw new AppError('Choose true or false.');}
  else if(field.type==='date') {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new AppError('Enter a valid date.');
    const d=new Date(value+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw new AppError('Enter a valid calendar date.');
  } else if(typeof value!=='string'||value.length>(field.max||10000)||(!field.nullable&&!value.trim())) throw new AppError('Enter a non-empty value within the field length.');
  if(field.options&&!field.options.includes(value))throw new AppError('Choose a value from the dropdown.');
  return value;
}
export function pgDisplay(value) {return value===null||value===undefined?'':typeof value==='boolean'?(value?'TRUE':'FALSE'):String(value);}
