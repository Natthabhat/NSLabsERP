export async function register() {
  if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.DATA_BACKEND==='postgres') {
    const {syncShopeeHistory}=await import('./lib/shopee-history.mjs');
    const sync=()=>syncShopeeHistory().catch(error=>console.error('Shopee history import failed; will retry:',error?.message||error));
    void sync();
    const timer=setInterval(sync,30000);timer.unref();
  }
}
