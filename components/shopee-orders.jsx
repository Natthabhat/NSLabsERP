"use client";
import { useEffect, useRef, useState } from 'react';
import { ShoppingBag, RefreshCw, ExternalLink, Search, Package, Clock3, CheckCircle2, AlertCircle, ArrowUpRight, ChevronDown, X, Download, ArrowLeft, ArrowRight } from 'lucide-react';

const ORDER_STATUSES = ['To ship', 'Shipped', 'Complete'];
const WORKFLOW = 'https://n8n.natthabhat.com/workflow/hzcl32733xAMyzmq';
const money = cents => cents === null ? '—' : new Intl.NumberFormat('en-TH', { style: 'currency', currency: 'THB' }).format(cents / 100);
function time(value) { if (!value || !Number.isFinite(Date.parse(value))) return '—'; return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function statusLabel(status) { return status; }

function ProductThumbnail({ item }) {
  const src = item.catalogueProduct?.thumbnail;
  const [failedSrc, setFailedSrc] = useState(null);
  return <span className="shopee-product-thumbnail">{src && failedSrc !== src ? <img src={src} alt="" loading="lazy" onError={() => setFailedSrc(src)}/> : <Package size={22}/>}</span>;
}

export default function ShopeeOrders({ connected, onSignIn }) {
  const [data, setData] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState(''), [syncing, setSyncing] = useState(false), [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0), [query, setQuery] = useState(''), [filter, setFilter] = useState('To ship'), [page, setPage] = useState(0), [selected, setSelected] = useState(null);
  const dialog = useRef(null);
  const syncController = useRef(null), syncInFlight = useRef(false);
  useEffect(() => () => syncController.current?.abort(), []);
  useEffect(() => {
    setData(null); setError('');
    if (!connected) { syncController.current?.abort(); setLoading(false); setSelected(null); dialog.current?.close(); return; }
    const controller = new AbortController(); let active = true; setLoading(true);
    fetch('/api/shopee', { cache: 'no-store', signal: controller.signal }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not load Shopee orders.'); return result; }).then(result => { if (active) { setData(result); setPage(0); } }).catch(e => { if (active && e.name !== 'AbortError') setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [connected, refresh]);
  const snapshot = data?.snapshot, orders = snapshot?.orders || [];

  const filtered = orders.filter(order => order.status === filter && `${order.orderId} ${order.items.map(item => `${item.product} ${item.sku} ${item.variation}`).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 20)), currentPage = Math.min(page, pages - 1), shown = filtered.slice(currentPage * 20, currentPage * 20 + 20);
  
  const stale = snapshot && Date.now() - Date.parse(snapshot.collectedAt) > 36 * 3600000;
  const needsAttention = ['login_required', 'verification_required', 'error'].includes(data?.collector?.status);
  function details(order) { setSelected(order); dialog.current?.showModal(); }
  async function runSync() {
    if (!connected || syncInFlight.current || loading) return;
    syncInFlight.current = true; setSyncing(true); setError(''); setNotice('');
    const controller = new AbortController(); syncController.current = controller;
    async function request(options = {}) {
      const response = await fetch('/api/shopee', { ...options, cache: 'no-store', signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not refresh Shopee orders.');
      return result;
    }
    function wait() {
      return new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
        const timer = setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve(); }, 2500);
        controller.signal.addEventListener('abort', abort, { once: true });
        if (controller.signal.aborted) abort();
      });
    }
    try {
      const accepted = await request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (accepted.accepted !== true || !Number.isFinite(Date.parse(accepted.requestedAt))) throw new Error('The automation did not confirm the refresh request.');
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        await wait();
        const latest = await request();
        const collected = Date.parse(latest.snapshot?.collectedAt);
        if (collected >= Date.parse(accepted.requestedAt) && latest.snapshot.collectedAt !== accepted.previousCollectedAt) {
          setData(latest); setPage(0); setNotice('Orders updated from Shopee.'); return;
        }
        if (Date.parse(latest.collector?.lastRun) >= Date.parse(accepted.requestedAt) && ['login_required', 'verification_required', 'error'].includes(latest.collector?.status)) {
          setData(latest); throw new Error('The collector needs attention. Open the automation and complete Shopee verification if requested.');
        }
      }
      throw new Error('The automation is taking longer than expected. Check its execution before starting another refresh.');
    } catch (e) { if (e.name !== 'AbortError') setError(e.message); }
    finally { syncInFlight.current = false; setSyncing(false); if (syncController.current === controller) syncController.current = null; }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `shopee-to-ship-${snapshot.collectedAt.slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="shopee-view">
    <div className="page-heading"><div><div className="eyebrow"><span/>NS LABS / MARKETPLACES</div><h1>Shopee orders<span className="heading-dot">.</span></h1></div><div className="page-actions"><a className="button" href={WORKFLOW} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>Open automation</a><button className="button primary" disabled={!connected || loading || syncing} onClick={runSync}><RefreshCw size={15} className={loading || syncing ? 'spin' : ''}/>{syncing ? 'Refreshing…' : loading ? 'Loading' : 'Refresh data'}</button></div></div>
    {!connected ? <div className="shopee-empty"><ShoppingBag size={32}/><h2>Your orders, in one place.</h2><p>Sign in to the ERP to view your shop’s latest collected orders.</p><button className="button primary" onClick={onSignIn}>Sign in to view orders</button></div> : <>
      {error && <div className="shopee-alert" role="alert"><AlertCircle size={18}/><span>{error}</span><button className="button" onClick={() => setRefresh(n => n + 1)}>Try again</button></div>}
      {syncing && <div className="shopee-sync-progress" role="status"><RefreshCw size={16} className="spin"/>Running the Shopee automation. Your latest report will appear when collection finishes.</div>}
      {data?.catalogueWarning && <div className="shopee-alert" role="status"><AlertCircle size={18}/><span>{data.catalogueWarning}</span></div>}
      {notice && !syncing && <div className="shopee-sync-progress" role="status"><CheckCircle2 size={16}/>{notice}</div>}
      {(needsAttention || stale) && <div className="shopee-alert" role="status"><AlertCircle size={18}/><span>{needsAttention ? 'The collector needs attention. Check its latest execution and complete Shopee verification if requested. The last successful report is shown below.' : 'This report is over 36 hours old. Check the automation before relying on these orders.'}</span><a href={WORKFLOW} target="_blank" rel="noopener noreferrer">View workflow <ArrowUpRight size={14}/></a></div>}
      <div className="shopee-metrics">{ORDER_STATUSES.map(status=><article key={status}><span>{status==='To ship'?<ShoppingBag size={17}/>:status==='Shipped'?<Package size={17}/>:<CheckCircle2 size={17}/>}{status}</span><strong>{snapshot?orders.filter(o=>o.status===status).length:'—'}</strong><small>{status==='To ship'?'Waiting for shipment':status==='Shipped'?'On the way to buyers':'Saved order history'}</small></article>)}</div>
      <section className="shopee-report"><div className="shopee-report-heading"><div><h2>{filter} orders <span>{snapshot ? orders.filter(o=>o.status===filter).length : '—'}</span></h2><p>{snapshot ? <>Collected {time(snapshot.collectedAt)} ICT</> : 'The latest successful report will appear here.'}</p></div><button className="button" disabled={!snapshot} onClick={download}><Download size={15}/>Download data</button></div>
      <div className="shopee-status-tabs" role="tablist" aria-label="Order status">{ORDER_STATUSES.map(status=><button key={status} role="tab" aria-selected={filter===status} onClick={()=>{setFilter(status);setPage(0);}}>{status}<span>{orders.filter(o=>o.status===status).length}</span></button>)}</div><div className="shopee-toolbar"><label className="shopee-search"><Search size={17}/><input aria-label="Search Shopee orders" placeholder="Search order number, product, or SKU" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }}/>{query && <button aria-label="Clear order search" onClick={() => { setQuery(''); setPage(0); }}><X size={15}/></button>}</label></div>
      {loading ? <div className="shopee-empty compact" role="status"><RefreshCw className="spin" size={24}/><p>Loading the latest report…</p></div> : !snapshot ? <div className="shopee-empty compact"><Package size={30}/><h3>{error ? 'Report could not be loaded' : 'Waiting for the first report'}</h3><p>{error ? 'Use Try again after checking the collector.' : 'Run the collector in n8n, then refresh this page.'}</p></div> : !filtered.length ? <div className="shopee-empty compact"><Search size={27}/><h3>{orders.length ? 'No matching orders' : 'No orders in this report'}</h3><p>{orders.length ? 'Try another order number, product, SKU, or status.' : 'The collector completed successfully with an empty order report.'}</p>{orders.length > 0 && <button className="button" onClick={() => { setQuery(''); setFilter('To ship'); setPage(0); }}>Clear filters</button>}</div> : <div className="shopee-table-scroll"><table><thead><tr><th>Order / created</th><th>Products</th><th>Units</th><th>Buyer payment</th><th>Status</th><th><span className="shopee-sr-only">Details</span></th></tr></thead><tbody>{shown.map(order => <tr key={order.orderId}><td><button className="shopee-order-link" onClick={() => details(order)}>{order.orderId}</button><small>{order.createdAt || 'Date unavailable'}</small></td><td><div className="shopee-order-products">{order.items.map(item => <div className="shopee-order-product" key={item.lineKey}><ProductThumbnail item={item}/><div><strong className="shopee-product-name">{item.product}</strong><small>{item.sku || 'No SKU'}{item.variation ? ` · ${item.variation}` : ''}</small>{order.items.length > 1 && <small>{item.quantity} units</small>}</div></div>)}</div></td><td>{order.items.reduce((n, item) => n + item.quantity, 0)}</td><td className="shopee-amount">{money(order.orderTotalCents)}</td><td><span className="shopee-status"><Clock3 size={12}/>{statusLabel(order.status)}</span></td><td><button className="icon-button" aria-label={`View order ${order.orderId}`} onClick={() => details(order)}><ArrowUpRight size={17}/></button></td></tr>)}</tbody></table></div>}
      {snapshot && <div className="shopee-table-footer"><span>{filtered.length ? `${currentPage * 20 + 1}–${Math.min((currentPage + 1) * 20, filtered.length)} of ${filtered.length} orders` : '0 orders'}</span><div><button className="icon-button" aria-label="Previous orders page" disabled={currentPage === 0} onClick={() => setPage(n => n - 1)}><ArrowLeft size={16}/></button><span>{currentPage + 1} / {pages}</span><button className="icon-button" aria-label="Next orders page" disabled={currentPage + 1 >= pages} onClick={() => setPage(n => n + 1)}><ArrowRight size={16}/></button></div></div>}
      </section><div className="shopee-footnote"><span><CheckCircle2 size={15}/>Orders and status changes saved to PostgreSQL.</span>{snapshot && <span>Export window: {snapshot.dateRange}</span>}</div>
    </>}
    <dialog className="shopee-dialog" ref={dialog}><div className="shopee-dialog-heading"><div><span className="eyebrow">SHOPEE ORDER</span><h2>{selected?.orderId}</h2></div><button className="icon-button" aria-label="Close order details" onClick={() => dialog.current?.close()}><X size={21}/></button></div>{selected && <><div className="shopee-detail-meta"><span>{statusLabel(selected.status)}</span><span>Created: {selected.createdAt || '—'}</span></div><div className="shopee-detail-items">{selected.items.map(item => <article key={item.lineKey}><ProductThumbnail item={item}/><div><strong>{item.product}</strong><small>SKU: {item.sku || 'Not provided'}{item.variation ? ` · ${item.variation}` : ''}</small><span>{item.quantity} × {money(item.unitPriceCents)}</span></div><b>{money(item.lineSubtotalCents)}</b></article>)}</div>{selected.statusHistory?.length>0&&<section className="shopee-status-history"><h3>Status history</h3>{selected.statusHistory.map((event,i)=><p key={i}><strong>{event.from?`${event.from} → ${event.to}`:`First observed: ${event.to}`}</strong><span>{time(event.observedAt)} ICT</span></p>)}</section>}<div className="shopee-detail-total"><span>Buyer payment<small>Reported order total, including applicable adjustments</small></span><strong>{money(selected.orderTotalCents)}</strong></div><p className="shopee-detail-note">Product subtotals can differ from the order total because of shipping and discounts. This is not the seller payout.</p></>}</dialog>
  </section>;
}
