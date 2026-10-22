import * as sheets from './sheets.mjs';
import { session } from './auth.mjs';
import { database } from './database.mjs';
import { readPgRecords, readPgCell, savePgCell } from './pg-store.mjs';
import { AppError } from './security.mjs';
export const postgresEnabled=()=>process.env.DATA_BACKEND==='postgres';
async function actor() {
  const user=await session();
  if(user?.provider!=='postgres'||user.username!==process.env.POSTGRES_LOGIN_USER)throw new AppError('Sign in to access your PostgreSQL records.',401);
  return user.username;
}
export async function readRecords(...args) {if(!postgresEnabled())return sheets.readRecords(...args);await actor();return readPgRecords(database(),...args);}
export async function readCell(...args) {if(!postgresEnabled())return sheets.readCell(...args);await actor();return readPgCell(database(),...args);}
export async function saveCell(request) {if(!postgresEnabled())return sheets.saveCell(request);return savePgCell(database(),await actor(),request);}

export async function manageRecords(request) {if(!postgresEnabled())throw new AppError('Record creation requires PostgreSQL.',400);const username=await actor();const {managePgRecords}=await import('./pg-manage.mjs');return managePgRecords(database(),username,request);}

export async function dashboardData() {if(!postgresEnabled())throw new AppError('Dashboard requires PostgreSQL.',400);await actor();const {readDashboard}=await import('./pg-dashboard.mjs');return readDashboard(database());}

export async function selectionSettings(request=null) {
 if(!postgresEnabled())throw new AppError('Selection settings require PostgreSQL.',400);
 const username=await actor();const pool=database();
 if(!request)return {options:(await pool.query('SELECT list_key,option_value,label,active FROM erp_web.selection_options ORDER BY position')).rows};
 const {saveSelection}=await import('./pg-selections.mjs');return saveSelection(pool,username,request);
}

export async function customPages(request=null){if(!postgresEnabled())throw new AppError('Pages require PostgreSQL.',400);const username=await actor();const {listPages,createPage}=await import('./pg-pages.mjs');return request?createPage(database(),username,request):listPages(database());}
