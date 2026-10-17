"use client";
import { useEffect, useState, useRef } from "react";
import {
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
  FileSpreadsheet,
  SlidersHorizontal,
  Link2,
  Cloud,
  Box,
  Clock3,
  CheckSquare,
  Save,
} from "lucide-react";
import { modules, SOURCE_URL, columnName, PAGE_SIZE } from "../lib/config.mjs";
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
    [mobileNav, setMobileNav] = useState(false);
  const [demo, setDemo] = useState(initialDemo),
    [editor, setEditor] = useState(null),
    [editLoading, setEditLoading] = useState(false),
    [editError, setEditError] = useState(""),
    [draft, setDraft] = useState(""),
    [saving, setSaving] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const dialog = useRef(null),
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
        ? Promise.resolve(demoRecords(demo, selected, page, query))
        : api(
            `/api/records?tab=${selected.id}&page=${page}&query=${encodeURIComponent(query)}`,
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
  }, [mode, selected, page, query, refresh, demo]);
  useEffect(() => {
    if (editor || editLoading) {
      if (!dialog.current.open) dialog.current.showModal();
    } else if (dialog.current?.open) dialog.current.close();
  }, [editor, editLoading]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  function notify(text) {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }
  function choose(tab) {
    if (saving) return;
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
    if (loading || saving) return;
    const id = ++editRequest.current;
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
      setEditor({ ...result, label: data.headers[column - 1] });
      setDraft(result.cell.checkbox ? result.cell.checked : result.cell.value);
    } catch (e) {
      if (id === editRequest.current) {
        setError(e.message);
        setEditor(null);
      }
    } finally {
      if (id === editRequest.current) setEditLoading(false);
    }
  }
  function closeEditor() {
    if (saving) return;
    editRequest.current++;
    setEditor(null);
    setEditLoading(false);
    setEditError("");
  }
  async function save(clear = false) {
    if (!editor || saving || uncertain || !editor.cell.editable) return;
    let value = clear
      ? null
      : editor.cell.type === "number" && !editor.cell.options
        ? Number(draft)
        : draft;
    if (
      !clear &&
      editor.cell.type === "number" &&
      !editor.cell.options &&
      (draft === "" || !Number.isFinite(value))
    ) {
      setEditError("Enter a valid number, or use Clear value.");
      return;
    }
    if (!clear && editor.cell.options && !editor.cell.options.includes(value)) {
      setEditError("Choose a value from the dropdown.");
      return;
    }
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
        notify("Saved to Google Sheets");
      }
      setEditor(null);
      setRefresh((r) => r + 1);
    } catch (e) {
      setEditError(
        e.message +
          " Close and refresh to check the current sheet before making another save.",
      );
      setUncertain(true);
    } finally {
      setSaving(false);
    }
  }
  const fresh = !loading && !error,
    records = data?.rows || [],
    rowsLabel = data?.total === undefined ? "—" : data.total.toLocaleString();
  return (
    <div className="app">
      <aside className={mobileNav ? "sidebar mobile-open" : "sidebar"}>
        <a className="brand" href="/" aria-label="NS Labs ERP home">
          <span className="brand-mark">
            NS
            <ArrowUpRight size={15} />
          </span>
          <span>
            <b>NS Labs</b>
            <small>OPERATIONS WORKSPACE</small>
          </span>
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
          {["Workshop", "Pricing", "Marketplaces"].map((group) => (
            <section className="nav-group" key={group}>
              <h2>{group}</h2>
              {modules
                .filter((t) => t.group === group)
                .map((tab) => (
                  <button
                    key={tab.id}
                    className={`nav-item ${selected.id === tab.id ? "active" : ""}`}
                    onClick={() => choose(tab)}
                  >
                    <MiniIcon tab={tab} size={16} />
                    <span>{tab.title}</span>
                    {selected.id === tab.id && <span className="active-dot" />}
                  </button>
                ))}
            </section>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => setSetup(true)}>
            <Settings2 size={16} /> Connection settings{" "}
            <ArrowUpRight size={13} />
          </button>
          <div className="profile">
            <span>NS</span>
            <div>
              <b>NS Labs Studio</b>
              <small>
                {mode === "live" ? "Google connected" : "Local workspace"}
              </small>
            </div>
            <span className="online-dot" />
          </div>
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
            <PanelLeftClose size={16} className="desktop-icon" />
            <span className="divider" />
            <span>Workspace</span>
            <span className="slash">/</span>
            <b>{selected.title}</b>
          </div>
          <div className="top-actions">
            <span
              className={`connection-pill ${mode === "live" ? "connected" : ""}`}
            >
              <span />
              {mode === "live"
                ? "Google Sheets connected"
                : mode === "demo"
                  ? "Demo workspace"
                  : "Not connected"}
            </span>
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
              <p>{selected.description}</p>
            </div>
            <div className="page-actions">
              <a
                className="button"
                target="_blank"
                rel="noopener noreferrer"
                href={`${SOURCE_URL}#gid=${selected.id}`}
              >
                <ExternalLink size={14} /> Source sheet
              </a>
              <button
                className="button primary"
                onClick={() =>
                  mode === "setup" ? setSetup(true) : setRefresh((r) => r + 1)
                }
                disabled={loading}
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
                Connect your sheet <ArrowRight size={13} />
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
              <div className="metric-bottom">
                <span className="mini-dot" />
                {mode === "demo"
                  ? "Sample dataset"
                  : mode === "live"
                    ? "From your primary table"
                    : "Connect to load records"}
              </div>
            </div>
            <div className="metric">
              <div className="metric-top">
                <span>ACTIVE WORKSHEET</span>
                <span className="metric-icon">
                  <Layers3 size={16} />
                </span>
              </div>
              <strong className="text-metric">{selected.name}</strong>
              <div className="metric-bottom">
                <FileSpreadsheet size={12} />
                {selected.group} · {selected.width} columns
              </div>
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
          <section
            className="records-panel"
            aria-label={`${selected.title} records`}
          >
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
                  <p>Click a value to inspect or edit it.</p>
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
                  disabled={mode === "setup"}
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
                  disabled={mode === "setup" || loading}
                >
                  Search
                </button>
              </form>
            </div>
            <div className="table-meta">
              <span>
                <span className={`mini-dot ${fresh && data ? "green" : ""}`} />
                {mode === "demo"
                  ? "SAMPLE DATA"
                  : data
                    ? "LIVE WORKSHEET"
                    : "WORKSHEET PREVIEW"}
              </span>
              <span>
                <LockKeyhole size={11} /> Formula cells are read-only
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
                  <h3>Your sheet. A better place to work.</h3>
                  <p>
                    Connect Google Sheets to read and edit your real records.
                    <br />
                    Your formulas and original spreadsheet stay in place.
                  </p>
                  <div>
                    <button
                      className="button primary"
                      onClick={() => setSetup(true)}
                    >
                      <Link2 size={14} /> Connect Google Sheets
                    </button>
                    <button
                      className="button"
                      onClick={() => changeMode("demo")}
                    >
                      Explore the demo <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <small>
                    <LockKeyhole size={11} /> Your Google account controls
                    access to the sheet.
                  </small>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th className="row-number">ROW</th>
                      {data?.headers.map((h, i) => (
                        <th key={i}>
                          {h}
                          <ChevronsUpDown size={10} />
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
                      records.map((record) => (
                        <tr key={record.row}>
                          <td className="row-number">
                            {String(record.row).padStart(3, "0")}
                          </td>
                          {record.values.map((value, i) => (
                            <td key={i}>
                              <button
                                className={`cell-button ${record.formulas?.[i] ? "formula-cell" : ""}`}
                                onClick={() => openCell(record.row, i + 1)}
                                disabled={loading || !!error}
                                aria-label={`Edit ${data.headers[i]}, row ${record.row}`}
                              >
                                <CellValue
                                  value={value}
                                  header={data.headers[i]}
                                />
                                {record.formulas?.[i] && (
                                  <LockKeyhole size={10} />
                                )}
                              </button>
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
                  disabled={!data || data.page === 0 || loading}
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
                  disabled={!data || data.page >= data.pages - 1 || loading}
                >
                  Next <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </section>
          <div className="table-help">
            <span>
              <CheckCircle2 size={13} />{" "}
              {mode === "demo"
                ? "Demo edits never change your Google Sheet."
                : "Edits change one cell at a time. Surrounding formulas stay intact."}
            </span>
            <span>
              {data?.limited
                ? "Read limit: first 5,000 rows"
                : "Built around your workflow."}
            </span>
          </div>
          <footer>
            <span>
              NS LABS <b>ERP</b>
              <span className="footer-separator">/</span> Made to build.
            </span>
            <span>
              Workshop → product → customer <ArrowUpRight size={11} />
            </span>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialog}
        className="editor-dialog"
        onCancel={(e) => {
          if (saving) e.preventDefault();
          else closeEditor();
        }}
        onClose={() => {
          if (!saving) {
            editRequest.current++;
            setEditor(null);
            setEditLoading(false);
          }
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">
                {editor
                  ? `${selected.name.toUpperCase()} / ${columnName(editor.column - 1)}${editor.row}`
                  : "LOADING CELL"}
              </span>
              <h2>{editor?.label || "Inspect value"}</h2>
              <p>
                {editor?.record || "Checking the latest value and permissions…"}
              </p>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={closeEditor}
              disabled={saving}
              aria-label="Close editor"
            >
              <X size={19} />
            </button>
          </div>
          <div className="dialog-content">
            {editLoading ? (
              <div className="dialog-loading">
                <LoaderCircle className="spin" size={24} />
                <p>Reading the current value…</p>
              </div>
            ) : editor ? (
              <>
                {!editor.cell.editable ? (
                  <div className="readonly-note">
                    <LockKeyhole size={20} />
                    <div>
                      <b>
                        {editor.cell.formula
                          ? "Calculated value"
                          : "Read-only cell"}
                      </b>
                      <p>
                        {editor.cell.formula
                          ? "This value is calculated in Google Sheets. Edit its input cells to update it."
                          : "This cell uses a validation rule that the editor cannot safely change."}
                      </p>
                      <strong>{editor.cell.display || "—"}</strong>
                    </div>
                  </div>
                ) : (
                  <>
                    <label htmlFor="edit-value">{editor.label}</label>
                    {editor.cell.options ? (
                      <select
                        id="edit-value"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        disabled={saving}
                        autoFocus
                      >
                        <option value="" disabled>
                          Select an option
                        </option>
                        {editor.cell.options.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    ) : editor.cell.checkbox ||
                      editor.cell.type === "boolean" ? (
                      <label className="checkbox-field">
                        <input
                          id="edit-value"
                          type="checkbox"
                          checked={!!draft}
                          onChange={(e) => setDraft(e.target.checked)}
                          disabled={saving}
                        />
                        <CheckSquare size={18} />
                        <span>{draft ? "Confirmed" : "Not confirmed"}</span>
                      </label>
                    ) : (
                      <input
                        id="edit-value"
                        type={
                          editor.cell.type === "number"
                            ? "number"
                            : editor.cell.type === "date"
                              ? "date"
                              : "text"
                        }
                        step={editor.cell.type === "number" ? "any" : undefined}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        disabled={saving}
                        maxLength={10000}
                        autoFocus
                      />
                    )}
                    <div className="current-value">
                      <span>Current value</span>
                      <b>{editor.cell.display || "(empty)"}</b>
                    </div>
                  </>
                )}
                <div className="edit-note">
                  <Link2 size={13} />
                  {mode === "demo"
                    ? "Demo change only. No Google Sheet will be updated."
                    : "Save writes this one cell to your original Google Sheet."}
                </div>
              </>
            ) : null}
            {editError && (
              <div className="editor-error" role="alert">
                <AlertCircle size={15} />
                <span>{editError}</span>
              </div>
            )}
          </div>
          <div className="dialog-footer">
            <button
              type="button"
              className="text-button"
              onClick={() => save(true)}
              disabled={
                !editor?.cell.editable ||
                saving ||
                uncertain ||
                !!editor?.cell.options ||
                editor?.cell.checkbox
              }
            >
              Clear value
            </button>
            <div>
              <button
                type="button"
                className="button"
                onClick={closeEditor}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={!editor?.cell.editable || saving || uncertain}
              >
                {saving ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <Save size={14} />
                )}{" "}
                {saving ? "Saving…" : "Save change"}
              </button>
            </div>
          </div>
        </form>
      </dialog>
      {setup && (
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
                <FileSpreadsheet size={26} />
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
