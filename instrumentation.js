export async function register() {
  if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.DATA_BACKEND==='postgres') {
    const {syncShopeeHistory}=await import('./lib/shopee-history.mjs');
    const sync=()=>syncShopeeHistory().catch(error=>console.error('Shopee history import failed; will retry:',error?.message||error));
    void sync();
    const timer=setInterval(sync,30000);timer.unref();
    // Etsy, eBay and Lazada refresh once a day at 06:00 Bangkok time, then ST log rows are added.
    const {runMarketplaceJobs,msUntilDaily}=await import('./lib/marketplace-jobs.mjs');
    let running=false;
    const jobs=async()=>{if(running)return;running=true;try{await runMarketplaceJobs();}finally{running=false;}};
    const daily=()=>{setTimeout(async()=>{await jobs();daily();},msUntilDaily()).unref();};
    daily();
  }
}
