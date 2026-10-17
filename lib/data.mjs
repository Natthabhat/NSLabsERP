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
