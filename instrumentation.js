export async function register() {
  if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.DATA_BACKEND==='postgres') {
    const {syncShopeeHistory}=await import('./lib/shopee-history.mjs');
    const sync=()=>syncShopeeHistory().catch(error=>console.error('Shopee history import failed; will retry:',error?.message||error));
    void sync();
    const timer=setInterval(sync,30000);timer.unref();
    // Etsy, eBay and Lazada refresh every 15 minutes (first run after 2 minutes), then ST log rows are added.
    const {runMarketplaceJobs}=await import('./lib/marketplace-jobs.mjs');
    let running=false;
    const jobs=async()=>{if(running)return;running=true;try{await runMarketplaceJobs();}finally{running=false;}};
    setTimeout(jobs,120000).unref();
    setInterval(jobs,15*60000).unref();
  }
}
