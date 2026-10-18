import { recordView } from './record-view.mjs';
import { token } from "./auth.mjs";
import {
  SPREADSHEET_ID,
  moduleById,
  columnName,
  PAGE_SIZE,
  MAX_ROWS,
} from "./config.mjs";
import { AppError, fingerprint, equal } from "./security.mjs";
import { editorCell, valueForWrite, cellType } from "./validation.mjs";
async function google(path, access, options = {}) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw new AppError(
      response.status === 403
        ? "Your Google account cannot perform this operation. Check sheet permissions and whether the Google Sheets API is enabled."
        : response.status === 401
          ? "Google authorization expired. Sign in again."
          : result.error?.message || "Google Sheets request failed.",
      response.status === 401 ? 401 : response.status === 429 ? 429 : 502,
    );
  return result;
}
function signature(cells) {
  return fingerprint(
    cells.map((c) => ({
      v: c.userEnteredValue || {},
      validation: c.dataValidation || null,
    })),
  );
}
function primaryRange(c, first, last) {
  return `'${c.name.replaceAll("'", "''")}'!A${first}:${columnName(c.width - 1)}${last}`;
}
async function grid(c, first, last, access) {
  const query = new URLSearchParams({
    ranges: primaryRange(c, first, last),
    includeGridData: "true",
    fields:
      "properties(title,timeZone),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,formattedValue,effectiveFormat(numberFormat),dataValidation,pivotTable,dataSourceFormula,dataSourceTable))))",
  });
  const book = await google("?" + query, access);
  const sheet = book.sheets?.find(
    (s) => s.properties.sheetId === c.id && s.properties.title === c.name,
  );
  if (!sheet)
    throw new AppError(
      "The worksheet was renamed or removed. Check the app configuration.",
      409,
    );
  return { book, sheet, rows: sheet.data?.[0]?.rowData || [] };
}
function position(c, row, column) {
  if (
    !Number.isInteger(row) ||
    row < c.start ||
    row > MAX_ROWS ||
    !Number.isInteger(column) ||
    column < 1 ||
    column > c.width
  )
    throw new AppError("Cell is outside the editable records.");
}
export async function readRecords(id, page = 0, query = "", view = {}) {
  const c = moduleById(id);
  if (
    !Number.isInteger(page) ||
    page < 0 ||
    page > 125 ||
    typeof query !== "string" ||
    query.length > 200
  )
    throw new AppError("Invalid search or page.");
  const access = await token();
  // Read the actual grid size first; keep native reads within the sheet bounds.
  const meta = await google(
    "?fields=properties(title,timeZone),sheets(properties(sheetId,title,gridProperties(rowCount)))",
    access,
  );
  const info = meta.sheets?.find(
    (s) => s.properties.sheetId === c.id && s.properties.title === c.name,
  );
  if (!info)
    throw new AppError(
      "Worksheet no longer matches the app configuration.",
      409,
    );
  const last = Math.min(info.properties.gridProperties.rowCount, MAX_ROWS);
  const result = await grid(c, 1, last, access),
    q = query.trim().toLowerCase();
  const headers = Array.from(
    { length: c.width },
    (_, i) =>
      result.rows[0]?.values?.[i]?.formattedValue?.trim() ||
      `Column ${columnName(i)}`,
  );
  const rows = [];
  for (let i = c.start - 1; i < result.rows.length; i++) {
    const cells = Array.from(
      { length: c.width },
      (_, j) => result.rows[i]?.values?.[j] || {},
    );
    const values = cells.map(
      (cell) =>
        cell.formattedValue ??
        String(
          cell.effectiveValue?.stringValue ??
            cell.effectiveValue?.numberValue ??
            cell.effectiveValue?.boolValue ??
            "",
        ),
    );
    if (!values[0].trim()) continue;
    if (q && !values.join(" ").toLowerCase().includes(q)) continue;
    rows.push({
      row: i + 1,
      values,
      formulas: cells.map((cell) => !!cell.userEnteredValue?.formulaValue),
    });
  }
  const arranged=recordView(rows,headers,c.types,view);
  const pages = Math.max(1, Math.ceil(arranged.rows.length / PAGE_SIZE)),
    current = Math.min(page, pages - 1);
  return {
    tab: c.id,
    headers,
    rows: arranged.rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE),
    sort:arranged.sort,
    fields:arranged.fields,
    page: current,
    pages,
    total: arranged.rows.length,
    sourceTitle: meta.properties.title,
    scannedThrough: last,
    limited: info.properties.gridProperties.rowCount > MAX_ROWS,
    updatedAt: new Date().toISOString(),
  };
}
export async function readCell(id, row, column) {
  const c = moduleById(id);
  position(c, row, column);
  const access = await token(),
    result = await grid(c, row, row, access),
    cells = Array.from(
      { length: c.width },
      (_, i) => result.rows[0]?.values?.[i] || {},
    );
  if (!cells[0].formattedValue)
    throw new AppError("This record no longer exists. Refresh the table.", 409);
  const raw = cells[column - 1];
  return {
    tab: c.id,
    row,
    column,
    record: cells[0].formattedValue,
    rowToken: signature(cells),
    token: signature([raw]),
    cell: editorCell(
      raw,
      c.types?.[column - 1] || (column === 1 ? "text" : "number"),
    ),
  };
}
const operations = new Map();
let pending = Promise.resolve();
export async function saveCell(request) {
  // Serializes edits handled by this Node process. Google Sheets itself has no atomic compare-and-set.
  const previous = pending;
  let release;
  pending = new Promise((r) => (release = r));
  await previous;
  try {
    if (
      !request ||
      !/^[-a-zA-Z0-9]{16,80}$/.test(request.operationId || "") ||
      typeof request.rowToken !== "string" ||
      typeof request.token !== "string"
    )
      throw new AppError("Invalid save request.");
    const c = moduleById(request.tab);
    position(c, request.row, request.column);
    const access = await token();
    const opKey = fingerprint([access, request.operationId]),
      digest = fingerprint(request),
      prior = operations.get(opKey);
    if (prior && prior.until > Date.now()) {
      if (prior.digest !== digest)
        throw new AppError("Save identifier already used.", 409);
      return prior.result;
    }
    const result = await grid(c, request.row, request.row, access),
      cells = Array.from(
        { length: c.width },
        (_, i) => result.rows[0]?.values?.[i] || {},
      ),
      raw = cells[request.column - 1];
    if (
      !equal(signature(cells), request.rowToken) ||
      !equal(signature([raw]), request.token)
    )
      throw new AppError(
        "This record changed after you opened it. Refresh before editing again.",
        409,
      );
    const type = cellType(
      raw,
      c.types?.[request.column - 1] ||
        (request.column === 1 ? "text" : "number"),
    );
    const value = valueForWrite(request.value, raw, type);
    await google(":batchUpdate", access, {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            updateCells: {
              range: {
                sheetId: c.id,
                startRowIndex: request.row - 1,
                endRowIndex: request.row,
                startColumnIndex: request.column - 1,
                endColumnIndex: request.column,
              },
              rows: [{ values: [{ userEnteredValue: value }] }],
              fields: "userEnteredValue",
            },
          },
        ],
      }),
    });
    const saved = {
      saved: true,
      row: request.row,
      column: request.column,
      savedAt: new Date().toISOString(),
    };
    operations.set(opKey, {
      digest,
      result: saved,
      until: Date.now() + 600000,
    });
    for (const [key, entry] of operations) {
      if (entry.until < Date.now()) operations.delete(key);
    }
    return saved;
  } finally {
    release();
  }
}
