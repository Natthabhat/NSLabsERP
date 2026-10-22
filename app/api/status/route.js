import {session} from '../../../lib/auth.mjs';
import {missingSettings} from '../../../lib/security.mjs';
import {json} from '../../../lib/http.mjs';
import {postgresEnabled,customPages} from '../../../lib/data.mjs';
import {pgModules} from '../../../lib/postgres-model.mjs';
export const dynamic='force-dynamic';
export async function GET(){const user=await session();if(postgresEnabled()){const pages=user?.provider==='postgres'&&user.username===process.env.POSTGRES_LOGIN_USER?await customPages():[];return json({backend:'postgres',configured:!!process.env.DATABASE_URL&&!!process.env.POSTGRES_LOGIN_USER&&(process.env.SESSION_SECRET||'').length>=32,connected:user?.provider==='postgres'&&user.username===process.env.POSTGRES_LOGIN_USER,email:user?.provider==='postgres'?user.username:null,customPages:pages,modules:[...Object.keys(pgModules).map(Number),...pages.map(p=>p.id)]});}return json({configured:missingSettings().length===0,missing:missingSettings(),connected:!!user,email:user?.email||null});}
