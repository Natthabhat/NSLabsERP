import { session } from './auth.mjs';
import { AppError } from './security.mjs';
export async function requireProductUser() {
  const user=await session();
  if(process.env.DATA_BACKEND!=='postgres'||user?.provider!=='postgres'||user.username!==process.env.POSTGRES_LOGIN_USER) throw new AppError('Sign in to manage products.',401);
  return user;
}
