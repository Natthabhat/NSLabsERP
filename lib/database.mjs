import pg from 'pg';
import { AppError } from './security.mjs';
export function databaseConfig() {
  if(!process.env.DATABASE_URL)throw new AppError('PostgreSQL is not configured.',503);
  return {connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:10000,statement_timeout:8000,application_name:'nslabs-erp'};
}
export function database() {
  if(!globalThis.nslabsPool) {
    globalThis.nslabsPool=new pg.Pool({...databaseConfig(),max:5,idleTimeoutMillis:30000});
    globalThis.nslabsPool.on('error',()=>console.error('PostgreSQL idle connection failed'));
  }
  return globalThis.nslabsPool;
}
// Authenticate against PostgreSQL without retaining the user's database password.
export async function verifyDatabaseLogin(username,password) {
  if(username!==process.env.POSTGRES_LOGIN_USER||typeof password!=='string'||!password||password.length>1024)throw new AppError('Invalid username or password.',401);
  const url=new URL(process.env.DATABASE_URL);
  url.username=username;url.password=password;
  const client=new pg.Client({...databaseConfig(),connectionString:url.href});
  try {await client.connect();await client.query('SELECT 1');}
  catch {throw new AppError('Sign-in failed. Check your PostgreSQL credentials or try again shortly.',401);}
  finally {await client.end().catch(()=>{});}
}
