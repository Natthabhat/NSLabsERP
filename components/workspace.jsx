"use client";
import { useEffect, useState, useRef } from "react";
import {
  LayoutDashboard,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Search,
  RefreshCw,
  Settings2,
  Layers3,
  Package,
  TrendingUp,
  Coins,
  Tag,
  ShoppingBag,
  ChevronsUpDown,
  ChevronDown,
  Check,
  CheckCircle2,
  AlertCircle,
  FlaskConical,
  ExternalLink,
  LogOut,
  X,
  LockKeyhole,
  LoaderCircle,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  FileSpreadsheet,
  SlidersHorizontal,
  Link2,
  Cloud,
  Box,
  Clock3,
  CheckSquare,
  Save,
} from "lucide-react";
import { modules, SOURCE_URL, PAGE_SIZE } from "../lib/config.mjs";
import { initialDemo, demoRecords, demoCell } from "../lib/demo.mjs";
const icons = {
  cost: Coins,
  filament: Layers3,
  stock: Package,
  sales: TrendingUp,
  price: Tag,
  channel: ShoppingBag,
};
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, cache: "no-store" });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The server returned an unreadable response. Refresh before trying again.",
    );
  }
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function MiniIcon({ tab, ...props }) {
  const Icon = icons[tab.icon];
  return <Icon {...props} />;
}
export default function Workspace() {
  const [selected, setSelected] = useState(modules[1]),
    [status, setStatus] = useState(null),
    [mode, setMode] = useState("setup"),
    [data, setData] = useState(null),
    [page, setPage] = useState(0),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [toast, setToast] = useState(""),
    [setup, setSetup] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [sidebarCollapsed, setSidebarCollapsed] = useState(false),
    [sortColumn, setSortColumn] = useState(null),
    [sortDirection, setSortDirection] = useState("desc"),
    [columnFilters, setColumnFilters] = useState({}),
    [manage, setManage] = useState(null),
    [dashboard, setDashboard] = useState(false),
    [selectionsView,setSelectionsView] = useState(false),
    [newPage,setNewPage] = useState(false);
  const [demo, setDemo] = useState(initialDemo),
    [editor, setEditor] = useState(null),
    [editTarget, setEditTarget] = useState(null),
    [editLoading, setEditLoading] = useState(false),
    [editError, setEditError] = useState(""),
    [draft, setDraft] = useState(""),
    [saving, setSaving] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const saveInFlight = useRef(false),
    editRequest = useRef(0),
    toastTimer = useRef();
  useEffect(() => {
    let active = true;
    api("/api/status")
      .then((s) => {
        if (!active) return;
        setStatus(s);
        if (s.connected) setMode("live");
        const auth = new URLSearchParams(window.location.search).get("auth");
        if (auth && auth !== "connected")
          setError(
            {
              setup: "Add your Google OAuth credentials to .env.local first.",
              denied: "This Google account is not allowed by ALLOWED_EMAILS.",
              cancelled:
                "Google sign-in was cancelled. Your sheet has not been changed.",
              failed:
                "Google sign-in could not be completed. Check OAuth credentials and granted Sheets access.",
            }[auth] || "Sign-in needs attention.",
          );
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (mode === "setup") return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const load =
      mode === "demo"
        ? Promise.resolve(demoRecords(demo, selected, page, query, {sort:sortColumn,direction:sortDirection,filters:columnFilters}))
        : api(
            `/api/records?tab=${selected.id}&page=${page}&query=${encodeURIComponent(query)}&direction=${sortDirection}&filters=${encodeURIComponent(JSON.stringify(columnFilters))}${sortColumn===null?"":`&sort=${sortColumn}`}`,
            { signal: controller.signal },
          );
    load
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [mode, selected, page, query, refresh, demo, sortColumn, sortDirection, columnFilters]);
  useEffect(() => {
    editRequest.current++;
    setEditor(null);
    setEditTarget(null);
    setEditLoading(false);
    setEditError("");
  }, [selected.id, page, query, mode, refresh, sortColumn, sortDirection, columnFilters]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  function notify(text) {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }
  function choose(tab) {
    if (saving || saveInFlight.current) return;
    setSortColumn(null);
    setSortDirection("desc");
    setColumnFilters({});
    setSelectionsView(false);
    setDashboard(false);
    setSelected(tab);
    setPage(0);
    setSearch("");
    setQuery("");
    setData(null);
    setError("");
    setMobileNav(false);
  }
  function changeMode(next) {
    setData(null);
    setError("");
    setPage(0);
    setQuery("");
    setSearch("");
    setMode(next);
  }
  async function openCell(row, column) {
    if (loading || saving || saveInFlight.current) return;
    const id = ++editRequest.current;
    setEditTarget({row, column});
    setEditLoading(true);
    setEditError("");
    setEditor(null);
    setUncertain(false);
    try {
      const result =
        mode === "demo"
          ? demoCell(demo, selected, row, column)
          : await api(
              `/api/cell?tab=${selected.id}&row=${row}&column=${column}`,
            );
      if (id !== editRequest.current) return;
      if (!result.cell.editable) {
        setEditTarget(null);
        notify("This value is calculated or read-only. Edit its input fields instead.");
        return;
      }
      setEditor({ ...result, label: data.headers[column - 1] });
      setDraft(result.cell.checkbox ? result.cell.checked : result.cell.value);
    } catch (e) {
      if (id === editRequest.current) {
        setError(e.message);
        setEditor(null);
        setEditTarget(null);
      }
    } finally {
      if (id === editRequest.current) setEditLoading(false);
    }
  }
  function closeEditor() {
    if (saving || saveInFlight.current) return;
    editRequest.current++;
    setEditTarget(null);
    setEditor(null);
    setEditLoading(false);
    setEditError("");
  }
  async function save(clear = false, nextDraft = draft) {
    if (!editor || saving || saveInFlight.current || uncertain || !editor.cell.editable) return;
    let value = clear
      ? null
      : editor.cell.type === "number" && !editor.cell.options
        ? Number(nextDraft)
        : nextDraft;
    if (
      !clear &&
      editor.cell.type === "number" &&
      !editor.cell.options &&
      (nextDraft === "" || !Number.isFinite(value))
    ) {
      setEditError("Enter a valid number.");
      return;
    }
    if (!clear && editor.cell.options && !editor.cell.options.includes(value)) {
      setEditError("Choose a value from the dropdown.");
      return;
    }
    saveInFlight.current = true;
    setSaving(true);
    setEditError("");
    try {
      if (mode === "demo") {
        setDemo((previous) => {
          const next = structuredClone(previous),
            record = next[editor.tab].rows.find((r) => r.row === editor.row);
          record.values[editor.column - 1] = value ?? "";
          if (
            ["Cost", "Filament"].includes(selected.name) &&
            [2, 3].includes(editor.column)
          )
            record.values[3] =
              Number(record.values[1]) * Number(record.values[2]);
          return next;
        });
        notify("Demo updated · your Google Sheet was not changed");
      } else {
        const result = await api("/api/cell", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tab: editor.tab,
            row: editor.row,
            column: editor.column,
            token: editor.token,
            rowToken: editor.rowToken,
            value,
            operationId: crypto.randomUUID(),
          }),
        });
        if (result.saved !== true) throw new Error("Save was not confirmed.");
        notify(status?.backend === "postgres" ? "Saved to PostgreSQL" : "Saved to Google Sheets");
      }
      setEditor(null);
      setEditTarget(null);
      setRefresh((r) => r + 1);
    } catch (e) {
      setEditError(
        e.message +
          " Close and refresh to check the current record before making another save.",
      );
      setUncertain(true);
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }
  const isPostgres = status?.backend === "postgres";
  const availableModules=[...modules,...(status?.customPages||[])];
  const fresh = !loading && !error,
    records = data?.rows || [],
    rowsLabel = data?.total === undefined ? "—" : data.total.toLocaleString();
  return (
    <div className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {newPage&&<NewPageForm onClose={()=>setNewPage(false)} onCreate={async request=>{const created=await api('/api/pages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});const next=await api('/api/status');setStatus(next);const tab=next.customPages.find(p=>p.id===created.id);if(tab)choose(tab);setNewPage(false);notify('Page created');}}/>}
      {manage && <RecordManager kind={manage} fields={data?.fields||[]} onClose={()=>setManage(null)} onSubmit={async values=>{await api('/api/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,tab:selected.id,action:manage})});setManage(null);setPage(0);setQuery('');setSearch('');setColumnFilters({});setSortColumn(null);setSortDirection('desc');setRefresh(r=>r+1);notify(manage==='entry'?'New entry saved':'New column added');}} />}
      <aside className={mobileNav ? "sidebar mobile-open" : "sidebar"}>
        <a className="brand" href="/" aria-label="NS Labs ERP home">
          <img
            src="/logo-white.png"
            alt="NS Labs"
            className="brand-logo"
          />
        </a>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Box size={15} />
          </span>
          <span>
            3D Printing Studio<small>Your workspace</small>
          </span>
          <ChevronsUpDown size={13} />
        </div>
        <nav aria-label="Worksheets">
          {isPostgres&&<button className={`nav-item ${dashboard?'active':''}`} title="Dashboard" aria-label="Dashboard" onClick={()=>{if(saving)return;setSelectionsView(false);setDashboard(true);setMobileNav(false);}}><LayoutDashboard size={16}/><span>Dashboard</span></button>}
          {["Workshop", "Pricing", "Marketplaces"].filter(group => availableModules.some(t => t.group === group && (!isPostgres || status.modules?.includes(t.id)))).map((group) => (
            <section className="nav-group" key={group}>
              <h2>{group}</h2>
              {availableModules
                .filter((t) => t.group === group && (status?.backend !== "postgres" || status.modules?.includes(t.id)))
                .map((tab) => (
                  <button
                    key={tab.id}
                    title={tab.title}
                    aria-label={tab.title}
                    className={`nav-item ${!dashboard && !selectionsView && selected.id === tab.id ? "active" : ""}`}
                    onClick={() => choose(tab)}
                  >
                    <MiniIcon tab={tab} size={16} />
                    <span>{tab.title}</span>
                    {!dashboard && !selectionsView && selected.id === tab.id && <span className="active-dot" />}
                  </button>
                ))}
            </section>
          ))}
        </nav>
        {isPostgres&&mode==='live'&&<button className="nav-item new-page-button" title="New page" aria-label="New page" disabled={saving} onClick={()=>setNewPage(true)}><FileSpreadsheet size={16}/><span>+ New page</span></button>}
        <div className="sidebar-bottom">
          {isPostgres&&<button title="Manage selections" aria-label="Manage selections" onClick={()=>{if(saving)return;setDashboard(false);setSelectionsView(true);setMobileNav(false);}}><SlidersHorizontal size={16}/><span>Manage selections</span></button>}
          <button className="profile profile-settings" title="NS Labs Studio — Connection settings" aria-label="NS Labs Studio connection settings" onClick={() => setSetup(true)}>
            <span className="profile-badge"><img src="/icon.png" alt="" /></span>
            <span className="profile-settings-label"><b>NS Labs Studio</b><small>Connection settings</small></span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu"
              onClick={() => setMobileNav(!mobileNav)}
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <a href="/" className="topbar-brand" aria-label="NS Labs ERP home">
              <img src="/logo-black.png" alt="NS Labs" className="topbar-logo" />
            </a>
            <button className="icon-button desktop-icon" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!sidebarCollapsed}>{sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
            <span className="divider" />
            <span>Workspace</span>
            <span className="slash">/</span>
            <b>{selectionsView?"Manage selections":dashboard?"Dashboard":selected.title}</b>
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              aria-label="Connection settings"
              onClick={() => setSetup(true)}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </header>
        <main>
          {selectionsView ? <SelectionManager onSaved={()=>setRefresh(r=>r+1)}/> : dashboard ? <DashboardView/> : <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span />
                NS LABS / {selected.group.toUpperCase()}
              </div>
              <h1>
                {selected.title}
                <span className="heading-dot">.</span>
              </h1>
            </div>
            <div className="page-actions">
              {!isPostgres && <a
                className="button"
                target="_blank"
                rel="noopener noreferrer"
                href={`${SOURCE_URL}#gid=${selected.id}`}
              >
                <ExternalLink size={14} /> Source sheet
              </a>}
              <button
                className="button primary"
                onClick={() =>
                  mode === "setup" ? setSetup(true) : setRefresh((r) => r + 1)
                }
                disabled={loading || saving}
              >
                <RefreshCw size={14} className={loading ? "spin" : ""} />
                {loading ? "Refreshing" : "Refresh data"}
              </button>
            </div>
          </div>
          {mode === "demo" && (
            <div className="banner demo-banner">
              <FlaskConical size={17} />
              <div>
                <b>You’re exploring a demo.</b>
                <span>
                  {" "}
                  Sample records only. Changes stay in this browser session.
                </span>
              </div>
              <button
                onClick={() =>
                  status?.connected ? changeMode("live") : setSetup(true)
                }
              >
                {isPostgres ? "Sign in to PostgreSQL" : "Connect your sheet"} <ArrowRight size={13} />
              </button>
            </div>
          )}
          {error && (
            <div className="banner error-banner" role="alert">
              <AlertCircle size={17} />
              <span>
                {error}
                {data ? " Previously loaded records may be stale." : ""}
              </span>
              <button onClick={() => setRefresh((r) => r + 1)}>
                Try refresh
              </button>
            </div>
          )}
          <div className="metrics">
            {isPostgres&&<div className="metric money-metric"><div className="metric-top"><span>{query||Object.values(columnFilters).some(Boolean)?'MATCHING TOTAL':'TOTAL MONEY'}</span><Coins size={17}/></div><strong>{data?money(data.moneyTotal):'—'}</strong><div className="metric-bottom">{selected.id===1270018478?'Sales revenue':selected.custom?'Amount':selected.group==='Marketplaces'?'Payout amount':'Recorded spending'} · THB</div></div>}
            <div className="metric">
              <div className="metric-top">
                <span>{query ? "MATCHING RECORDS" : "TOTAL RECORDS"}</span>
                <span className="metric-icon">
                  <Package size={16} />
                </span>
              </div>
              <strong>
                {rowsLabel}
                <small>records</small>
              </strong>

            </div>
            <div className="metric accent-metric">
              <div className="metric-top">
                <span>LAST REFRESHED</span>
                <Cloud size={17} />
              </div>
              <strong>
                {data
                  ? new Intl.DateTimeFormat("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Bangkok",
                    }).format(new Date(data.updatedAt))
                  : "—"}
                <small>ICT</small>
              </strong>
              <div className="metric-bottom">
                <span className="mini-dot" />
                {loading
                  ? "Loading latest records"
                  : error
                    ? "Refresh needs attention"
                    : data
                      ? "Your view is up to date"
                      : "Ready when you are"}
              </div>
            </div>
          </div>
          {isPostgres && data?.categoryLabel && [{label:data.categoryLabel,rows:data.categories,quantity:data.quantityLabel},...(data.productCategories?[{label:'Product code',rows:data.productCategories}]:[])].map(group=><details className="category-summary" key={selected.id+'-'+group.label}>
            <summary><span>{group.label} breakdown</span><small>{group.rows.length} categories</small><ChevronDown size={17}/></summary>
            <div className="category-summary-content"><table><thead><tr><th>{group.label}</th><th>Records</th>{group.quantity&&<th>{group.quantity}</th>}<th>Amount (THB)</th></tr></thead><tbody>{group.rows.map(category=><tr key={category.name}><td>{category.name==='true'?'Confirmed':category.name==='false'?'Pending':data.fields?.find(f=>f.label===group.label)?.optionLabels?.[category.name]||category.name}</td><td>{category.records}</td>{group.quantity&&<td>{Number(category.quantity).toLocaleString()}</td>}<td>{money(category.amount)}</td></tr>)}</tbody></table>{!group.rows.length&&<p>No matching records.</p>}</div>
          </details>)}
          <section
            className="records-panel"
            aria-label={`${selected.title} records`}
          >
            {isPostgres && mode === 'live' && <div className="manage-toolbar">
              <button className="button" disabled={saving||loading||!data} onClick={()=>setManage('entry')}>+ New entry</button>
              <button className="button" disabled={saving||loading||!data} onClick={()=>setManage('column')}>+ New column</button>
            </div>}
            <div className="panel-toolbar">
              <div className="panel-title">
                <span className="panel-icon">
                  <MiniIcon tab={selected} size={17} />
                </span>
                <div>
                  <h2>
                    {selected.name} records{" "}
                    {data && <span className="count-badge">{data.total}</span>}
                  </h2>

                </div>
              </div>
              <form
                className="table-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  setPage(0);
                  setQuery(search);
                }}
              >
                <Search size={15} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search this worksheet…"
                  aria-label="Search this worksheet"
                  maxLength={200}
                  disabled={mode === "setup" || saving}
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearch("");
                      setQuery("");
                      setPage(0);
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
                <button
                  className="search-submit"
                  type="submit"
                  disabled={mode === "setup" || loading || saving}
                >
                  Search
                </button>
              </form>
            </div>
            <div className="table-meta">
              <div className="record-sort-controls">
                <label>Sort by <select aria-label="Sort by" disabled={saving} value={sortColumn ?? "latest"} onChange={e=>{setSortColumn(e.target.value==='latest'?null:Number(e.target.value));setSortDirection('desc');setPage(0);}}><option value="latest">Time - latest first</option>{data?.headers.map((h,i)=><option key={i} value={i}>{h}</option>)}</select></label>
                <button disabled={saving} onClick={()=>{setSortDirection(sortDirection==='desc'?'asc':'desc');setPage(0);}} aria-label="Reverse sort direction">{sortDirection==='desc'?'Descending':'Ascending'}</button>
                {Object.keys(columnFilters).length>0&&<button disabled={saving} onClick={()=>{setColumnFilters({});setPage(0);}}>Clear filters</button>}
              </div>
              <span>
                <LockKeyhole size={11} /> {isPostgres ? "Calculated totals are read-only" : "Formula cells are read-only"}
              </span>
            </div>
            <div className="table-scroll" aria-busy={loading}>
              {mode === "setup" ? (
                <div className="empty-state">
                  <div className="empty-visual">
                    <span className="empty-square">
                      <Layers3 size={38} strokeWidth={1.2} />
                    </span>
                    <span className="empty-connector">
                      <Link2 size={18} />
                    </span>
                    <span className="empty-square second">
                      <FileSpreadsheet size={36} strokeWidth={1.2} />
                    </span>
                  </div>
                  <span className="eyebrow">
                    A WORKSPACE THAT FEELS LIKE YOURS
                  </span>
                  <h3>{isPostgres ? "Your records. Ready to work." : "Your sheet. A better place to work."}</h3>
                  <p>
                    {isPostgres ? "Sign in to read and edit your PostgreSQL records." : "Connect Google Sheets to read and edit your real records."}
                    <br />
                    {isPostgres ? "Your existing expenses, filament, sales and payouts are ready." : "Your formulas and original spreadsheet stay in place."}
                  </p>
                  <div>
                    <button
                      className="button primary"
                      onClick={() => setSetup(true)}
                    >
                      <Link2 size={14} /> {isPostgres ? "Sign in to PostgreSQL" : "Connect Google Sheets"}
                    </button>
                    <button
                      className="button"
                      onClick={() => changeMode("demo")}
                    >
                      Explore the demo <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <small>
                    <LockKeyhole size={11} /> {isPostgres ? "Use your PostgreSQL username and password." : "Your Google account controls access to the sheet."}
                  </small>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th className="row-number">ROW</th>
                      {data?.headers.map((h, i) => (
                        <th key={i} aria-sort={(sortColumn ?? data.sort)===i?(sortDirection==='asc'?'ascending':'descending'):'none'}>
                          <button className="column-sort" disabled={saving} onClick={()=>{setSortDirection((sortColumn ?? data.sort)===i&&sortDirection==='desc'?'asc':'desc');setSortColumn(i);setPage(0);}}>
                            {h}{records.some(record=>record.formulas?.[i])&&<LockKeyhole size={12} aria-label="Calculated column"/>}{(sortColumn ?? data.sort)===i?(sortDirection==='desc'?' ↓':' ↑'):<ChevronsUpDown size={10}/>}
                          </button>
                          {data.fields?.[i]?.options ? <select aria-label={`Filter ${h}`} value={columnFilters[i]||''} disabled={saving} onChange={e=>{setColumnFilters({...columnFilters,[i]:e.target.value});setPage(0);}}><option value="">All</option>{data.fields[i].options.map(option=><option key={option} value={option}>{data.fields[i].optionLabels?.[option]||option}</option>)}</select> : <input aria-label={`Filter ${h}`} placeholder="Filter…" type={data.fields?.[i]?.type==='date'?'date':'search'} maxLength={200} value={columnFilters[i]||''} disabled={saving} onChange={e=>{setColumnFilters({...columnFilters,[i]:e.target.value});setPage(0);}}/>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!data && loading ? (
                      <tr>
                        <td
                          className="table-empty"
                          colSpan={selected.width + 1}
                        >
                          <LoaderCircle className="spin" size={22} />
                          <p>Fetching your records…</p>
                        </td>
                      </tr>
                    ) : records.length ? (
                      records.map((record, recordIndex) => (
                        <tr key={record.row}>
                          <td className="row-number">
                            {(data.page * PAGE_SIZE) + recordIndex + 1}
                          </td>
                          {record.values.map((value, i) => (
                            <td key={i}>
                              {editTarget?.row === record.row && editTarget?.column === i + 1 ? (
                                editLoading ? <span className="inline-loading" role="status"><LoaderCircle className="spin" size={14} /> Reading…</span> : editor ? (
                                  <InlineCellEditor editor={editor} draft={draft} setDraft={setDraft} saving={saving} uncertain={uncertain} error={editError} onSave={(value) => save(value === "" && !!editor.cell.nullable, value)} onCancel={closeEditor} />
                                ) : null
                              ) : (
                                <button className={"cell-button " + (record.formulas?.[i] ? "formula-cell" : "")}
                                  onClick={() => openCell(record.row, i + 1)}
                                  disabled={loading || saving || !!error || !!record.formulas?.[i]}
                                  title={record.formulas?.[i] ? "Calculated value — edit its input fields" : "Click to edit."}
                                  aria-label={(record.formulas?.[i] ? "Calculated " : "Edit ") + data.headers[i] + ", row " + record.row}>
                                  <CellValue value={data.fields?.[i]?.optionLabels?.[value]||value} header={data.headers[i]} />
                                </button>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          className="table-empty"
                          colSpan={selected.width + 1}
                        >
                          <Search size={25} />
                          <h3>
                            {error
                              ? "Could not load records"
                              : "No records found"}
                          </h3>
                          <p>
                            {error
                              ? "Check the connection and refresh."
                              : "Try another search or worksheet."}
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <div className="panel-footer">
              <span>
                {data
                  ? `${data.total ? data.page * PAGE_SIZE + 1 : 0}–${Math.min((data.page + 1) * PAGE_SIZE, data.total)} of ${data.total} records`
                  : "Your records will appear here"}
              </span>
              <div>
                <button
                  className="pagination-button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={!data || data.page === 0 || loading || saving}
                >
                  <ArrowLeft size={13} /> Previous
                </button>
                <span className="page-indicator">
                  {data ? data.page + 1 : 1}
                  <span> / {data?.pages || 1}</span>
                </span>
                <button
                  className="pagination-button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!data || data.page >= data.pages - 1 || loading || saving}
                >
                  Next <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </section>
          </>}
          <footer><span>NS LABS ERP</span></footer>
        </main>
      </div>
      {setup && isPostgres && <DatabaseLogin status={status} onClose={() => setSetup(false)} onConnected={async () => { const next = await api("/api/status"); setStatus(next); changeMode("live"); setSetup(false); setRefresh(r => r + 1); }} onLogout={async () => { await api("/api/auth/logout", {method:"POST"}); setStatus({...status,connected:false,email:null}); changeMode("setup"); setSetup(false); }} />}
      {setup && !isPostgres && (
        <div
          className="setup-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSetup(false);
          }}
        >
          <section
            className="setup-card"
            role="dialog"
            aria-modal="true"
            aria-label="Google Sheets connection"
          >
            <div className="setup-heading">
              <span className="setup-logo">
                <img src="/logo-black.png" alt="NS Labs" />
              </span>
              <button
                className="icon-button"
                aria-label="Close setup"
                onClick={() => setSetup(false)}
              >
                <X size={19} />
              </button>
            </div>
            <span className="eyebrow">YOUR DATA, CONNECTED</span>
            <h2>Make yourself at home.</h2>
            <p>
              Connect your Google account to work directly with your NS Labs
              spreadsheet.
            </p>
            <div className="connection-details">
              <span>
                Workbook<b>3D printing</b>
              </span>
              <span>
                Worksheets<b>11 modules</b>
              </span>
              <span>
                Access<b>{status?.email || "Your Google permissions"}</b>
              </span>
            </div>
            {status?.configured ? (
              <>
                <p className="setup-callout">
                  {status.connected
                    ? "Your Google account is connected. You can switch to live data or sign out."
                    : "Google sign-in will request spreadsheet access. The server is configured to work with your original workbook."}
                </p>
                <a className="button primary full" href="/api/auth/start">
                  <Link2 size={15} />
                  {status.connected
                    ? "Reconnect Google account"
                    : "Sign in with Google"}
                  <ArrowUpRight size={14} />
                </a>
                {status.connected && (
                  <div className="setup-secondary">
                    <button
                      className="button"
                      onClick={() => {
                        changeMode("live");
                        setSetup(false);
                      }}
                    >
                      Use live data
                    </button>
                    <button
                      className="button"
                      onClick={async () => {
                        try {
                          await api("/api/auth/logout", { method: "POST" });
                          setStatus({
                            ...status,
                            connected: false,
                            email: null,
                          });
                          changeMode("setup");
                          setSetup(false);
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                    >
                      <LogOut size={14} /> Sign out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="setup-callout">
                  <b>One-time Google setup needed</b>
                  <p>
                    Add <code>GOOGLE_CLIENT_ID</code> and{" "}
                    <code>GOOGLE_CLIENT_SECRET</code> to <code>.env.local</code>
                    , then restart the server. The README has the exact steps.
                  </p>
                  <small>
                    OAuth callback:{" "}
                    <code>http://localhost:3000/api/auth/callback</code>
                  </small>
                </div>
                <button
                  className="button primary full"
                  onClick={() => {
                    changeMode("demo");
                    setSetup(false);
                  }}
                >
                  Explore the demo <ArrowRight size={14} />
                </button>
              </>
            )}
            <p className="setup-footnote">
              <LockKeyhole size={11} /> Tokens stay encrypted in an HTTP-only
              session cookie. No credentials are included in browser code.
            </p>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
function CellValue({ value, header }) {
  if (value === "TRUE" || value === "FALSE")
    return (
      <span className={`confirm-badge ${value === "TRUE" ? "yes" : "no"}`}>
        {value === "TRUE" ? <Check size={11} /> : <Clock3 size={11} />}{" "}
        {value === "TRUE" ? "Confirmed" : "Pending"}
      </span>
    );
  if (header === "Type" && value)
    return (
      <span className={`material-badge material-${value.toLowerCase()}`}>
        {value}
      </span>
    );
  return (
    <span className={value === "" ? "empty-value" : ""}>{value || "—"}</span>
  );
}

function DatabaseLogin({status,onClose,onConnected,onLogout}) {
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function submit(e) {e.preventDefault();setBusy(true);setMessage('');try {await api('/api/auth/database',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});setPassword('');await onConnected();}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  return <div className="setup-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section className="setup-card" role="dialog" aria-modal="true" aria-label="PostgreSQL sign-in"><div className="setup-heading"><span className="setup-logo"><img src="/logo-black.png" alt="NS Labs"/></span><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close setup"><X size={19}/></button></div><span className="eyebrow">YOUR DATA, CONNECTED</span><h2>PostgreSQL workspace.</h2><p>Read and edit your existing NS Labs records. Calculated totals stay managed by the database.</p>{status.connected ? <><div className="setup-callout">Signed in as <b>{status.email}</b></div><button className="button primary full" onClick={onClose}>Return to workspace</button><button className="button full" onClick={async()=>{try{await onLogout();}catch(e){setMessage(e.message);}}}>Sign out</button></> : <form onSubmit={submit} className="database-login"><label htmlFor="db-username">PostgreSQL username</label><input id="db-username" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required maxLength={100} disabled={busy} autoFocus/><label htmlFor="db-password">Password</label><input id="db-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={1024} disabled={busy}/><button className="button primary full" disabled={busy||!status.configured}>{busy?'Signing in…':'Sign in'}</button></form>}{message&&<p role="alert" className="editor-error">{message}</p>}<p className="setup-footnote"><LockKeyhole size={11}/> Your password is checked by PostgreSQL and is not retained by the app.</p></section></div>;
}

function InlineCellEditor({editor,draft,setDraft,saving,uncertain,error,onSave,onCancel}) {
  const input=useRef(null);
  const id=`inline-${editor.tab}-${editor.row}-${editor.column}`;
  const blocked=saving||uncertain;
  const commit=()=>{if(!blocked&&input.current)onSave(input.current.type==='checkbox'?input.current.checked:input.current.value);};
  useEffect(()=>{input.current?.focus();if(input.current?.type==='text'||input.current?.type==='number')input.current.select();},[]);
  const common={ref:input,'aria-label':editor.label,'aria-describedby':error?id+'-error':undefined,disabled:blocked};
  return <form className="inline-cell-editor" noValidate onSubmit={e=>{e.preventDefault();if(!blocked)commit();}} onKeyDown={e=>{
    if(e.nativeEvent.isComposing)return;
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!saving)onCancel();}
    if(e.key==='Enter'){e.preventDefault();e.stopPropagation();if(!e.repeat&&!blocked)commit();}
  }}>
    <div className="inline-editor-controls">
      {editor.cell.options ? <select {...common} value={draft} onChange={e=>setDraft(e.target.value)}><option value="" disabled>Select a value</option>{editor.cell.options.map(value=><option key={value} value={value}>{editor.cell.optionLabels?.[value]||value}</option>)}</select>
        : editor.cell.checkbox||editor.cell.type==='boolean' ? <label className="inline-checkbox"><input {...common} type="checkbox" checked={!!draft} onChange={e=>setDraft(e.target.checked)}/><span>{draft?'Confirmed':'Pending'}</span></label>
        : <input {...common} type={editor.cell.type==='number'?'number':editor.cell.type==='date'?'date':'text'} step={editor.cell.type==='number'?'any':undefined} value={draft} onInput={e=>setDraft(e.currentTarget.value)} onChange={e=>setDraft(e.target.value)} maxLength={10000}/>}
      <button className="inline-action" type="submit" aria-label="Save cell" title="Save (Enter)" disabled={blocked}>{saving?<LoaderCircle className="spin" size={15}/>:<Check size={15}/>}</button>
      <button className="inline-action" type="button" aria-label="Cancel edit" title="Cancel (Escape)" onClick={onCancel} disabled={saving}><X size={15}/></button>
    </div>
    {error?<span className="inline-cell-error" id={id+'-error'} role="alert">{error}</span>:saving?<span className="inline-cell-hint" role="status">Saving…</span>:null}
  </form>;
}

function RecordManager({kind,fields,onClose,onSubmit}) {
  const [values,setValues]=useState({}),[label,setLabel]=useState(''),[type,setType]=useState('text'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const operation=useRef(crypto.randomUUID());
  async function submit(e) {e.preventDefault();if(busy)return;setBusy(true);setError('');try{await onSubmit(kind==='column'?{label,type,operationId:operation.current}:{values,operationId:operation.current});}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <div className="setup-overlay"><section className="setup-card record-manager" role="dialog" aria-modal="true" aria-label={kind==='entry'?'New entry':'New column'}><div className="manage-heading"><h2>{kind==='entry'?'New entry':'New column'}</h2><button className="icon-button" aria-label="Close form" disabled={busy} onClick={onClose}><X size={20}/></button></div>
    <form onSubmit={submit} className="record-form">
      {kind==='column'?<><label>Column name<input autoFocus required maxLength={60} value={label} onChange={e=>setLabel(e.target.value)} disabled={busy}/></label><label>Data type<select value={type} onChange={e=>setType(e.target.value)} disabled={busy}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="boolean">Checkbox</option></select></label><p>Existing records will have an empty value. Marketplace columns appear in all four marketplace views.</p></>:fields.filter(f=>!f.generated).map(f=><label key={f.key}>{f.label}{!f.nullable&&f.type!=='boolean'?' *':''}
        {f.options?<select required={!f.nullable} disabled={busy} value={values[f.key]??''} onChange={e=>setValues({...values,[f.key]:e.target.value})}><option value="">Select</option>{f.options.map(v=><option key={v} value={v}>{f.optionLabels?.[v]||v}</option>)}</select>:f.type==='boolean'?<input type="checkbox" disabled={busy} checked={values[f.key]??false} onChange={e=>setValues({...values,[f.key]:e.target.checked})}/>:<input autoFocus={f===fields[0]} disabled={busy} type={f.type==='date'?'date':f.type==='number'?'number':'text'} step={f.integer?'1':'any'} required={!f.nullable} maxLength={f.type==='text'?10000:undefined} value={values[f.key]??''} onChange={e=>setValues({...values,[f.key]:e.target.value===''?(f.nullable?null:''):f.type==='number'?Number(e.target.value):e.target.value})}/>}
      </label>)}
      {error&&<p role="alert" className="editor-error">{error}</p>}<div className="manage-actions"><button className="button" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy?'Saving...':kind==='column'?'Add column':'Save entry'}</button></div>
    </form></section></div>;
}

function money(value){return new Intl.NumberFormat('en-TH',{style:'currency',currency:'THB',minimumFractionDigits:2}).format(Number(value||0));}
function DashboardView(){
 const [data,setData]=useState(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;setLoading(true);api('/api/dashboard').then(d=>{if(active){setData(d);setError('');}}).catch(e=>active&&setError(e.message)).finally(()=>active&&setLoading(false));return()=>{active=false;};},[refresh]);
 const spending=Number(data?.costs||0)+Number(data?.filament||0);
 return <section className="dashboard-view"><div className="page-heading"><div><span className="eyebrow">NS LABS / OVERVIEW</span><h1>Dashboard</h1></div><button className="button" disabled={loading} onClick={()=>setRefresh(v=>v+1)}><RefreshCw size={15}/>{loading?'Refreshing':'Refresh'}</button></div>
 {error&&<p role="alert">{error}</p>}{!data&&loading?<p role="status">Loading dashboard...</p>:data&&<>
 <div className="dashboard-cards">{[['Sales revenue',data.sales],['Total spending',spending],['Revenue less recorded costs',Number(data.sales)-Number(data.shipping)-spending],['Confirmed payouts',data.payouts],['Shipping costs',data.shipping],['Pending payouts',data.pending]].map(([label,value])=><article className="metric" key={label}><div className="metric-top">{label}</div><strong>{money(value)}</strong></article>)}</div>
 <p className="dashboard-note">All records · {data.saleCount} sales. Spending includes equipment and filament purchases. Revenue less costs excludes taxes, fees, and unrecorded expenses. Payouts are shown separately from sales.</p>
 <section className="dashboard-panel"><h2>Monthly sales and spending</h2><div className="dashboard-chart">{data.monthly.map(row=>{const max=Math.max(1,...data.monthly.flatMap(r=>[Number(r.sales),Number(r.spending)]));return <div className="month-row" key={row.month}><b>{row.month}</b><div><div className="chart-line"><span className="chart-bar sales" style={{width:Math.max(0,Number(row.sales))/max*100+'%'}}/><span>Sales {money(row.sales)}</span></div><div className="chart-line"><span className="chart-bar spending" style={{width:Math.max(0,Number(row.spending))/max*100+'%'}}/><span>Spending {money(row.spending)}</span></div></div></div>;})}</div>{!data.monthly.length&&<p>No dated records yet.</p>}</section>
 <div className="dashboard-breakdowns">{[['Sales by platform',data.platforms],['Spending by category',data.categories],['Filament by material',data.materials]].map(([title,rows])=><section className="dashboard-panel" key={title}><h2>{title}</h2><table><thead><tr><th>Name</th><th>Amount (THB)</th></tr></thead><tbody>{rows.map(row=><tr key={row.name}><td>{row.name}</td><td>{money(row.amount)}</td></tr>)}</tbody></table>{!rows.length&&<p>No records yet.</p>}</section>)}</div>
 </>}
 </section>;
}

function SelectionManager({onSaved}){
 const [options,setOptions]=useState([]),[list,setList]=useState('product_code'),[editing,setEditing]=useState(null),[draft,setDraft]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[showDeleted,setShowDeleted]=useState(false);
 async function load(){const data=await api('/api/selections');setOptions(data.options);}
 useEffect(()=>{load().catch(e=>setError(e.message));},[]);
 async function save(value,label,action='save'){if(busy)return;setBusy(true);setError('');try{await api('/api/selections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({list,value,label,action,operationId:crypto.randomUUID()})});await load();onSaved();setName('');setEditing(null);setNotice(action==='delete'?'Selection deleted from dropdowns. Existing records are preserved.':action==='restore'?'Selection restored.':'Selection saved.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="selection-manager"><div className="page-heading"><h1>Manage selections</h1></div><section className="dashboard-panel"><label className="selection-list-label">Selection list <select aria-label="Selection list" disabled={busy} value={list} onChange={e=>{setList(e.target.value);setEditing(null);setName('');setNotice('');}}><option value="product_code">Product codes</option><option value="platform">Platforms</option><option value="filament_type">Filament types</option><option value="category">Cost categories</option></select></label>
 <form className="selection-form" onSubmit={e=>{e.preventDefault();save(name.trim(),name.trim());}}><label>New selection<input aria-label="Selection name" maxLength={60} required value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label><button className="button" disabled={busy}>Add selection</button></form>
 <label className="deleted-toggle"><input type="checkbox" checked={showDeleted} onChange={e=>setShowDeleted(e.target.checked)}/> Show deleted selections</label>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <table><thead><tr><th>Label</th><th>Stored value</th><th>Actions</th></tr></thead><tbody>{options.filter(o=>o.list_key===list&&(showDeleted||o.active!==false)).map(o=><tr key={o.option_value}><td>{editing===o.option_value?<form className="selection-inline-form" onSubmit={e=>{e.preventDefault();save(o.option_value,draft.trim());}}><input aria-label={'Edit label '+o.option_value} autoFocus maxLength={60} required disabled={busy} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setEditing(null);}}}/><button className="button" disabled={busy}>Save</button><button className="button" type="button" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button></form>:<button className="selection-label-button" disabled={busy||o.active===false} aria-label={'Edit '+o.label} onClick={()=>{setEditing(o.option_value);setDraft(o.label);setNotice('');}}>{o.label}</button>}</td><td>{o.option_value}{o.active===false&&<span className="deleted-badge">Deleted</span>}</td><td><button className="button" disabled={busy} aria-label={(o.active===false?'Restore ':'Delete ')+o.label} onClick={()=>save(o.option_value,o.label,o.active===false?'restore':'delete')}>{o.active===false?'Restore':'Delete'}</button></td></tr>)}</tbody></table></section></section>;
}

function NewPageForm({onClose,onCreate}){
 const [title,setTitle]=useState(''),[group,setGroup]=useState('Workshop'),[busy,setBusy]=useState(false),[error,setError]=useState('');const operation=useRef(crypto.randomUUID());
 async function submit(e){e.preventDefault();if(busy)return;setBusy(true);setError('');try{await onCreate({title:title.trim(),group,operationId:operation.current});}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <div className="setup-overlay"><section className="setup-card" role="dialog" aria-modal="true" aria-label="New page"><div className="manage-heading"><h2>New page</h2><button className="icon-button" disabled={busy} aria-label="Close new page" onClick={onClose}><X size={20}/></button></div><form className="record-form" onSubmit={submit}><label>Page name<input autoFocus required maxLength={60} disabled={busy} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Sidebar section<select disabled={busy} value={group} onChange={e=>setGroup(e.target.value)}><option>Workshop</option><option>Pricing</option><option>Marketplaces</option></select></label><p>Starts with Name, Date, Amount, and Notes. Add more fields with New column.</p>{error&&<p role="alert" className="editor-error">{error}</p>}<div className="manage-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy?'Creating...':'Create page'}</button></div></form></section></div>;
}
