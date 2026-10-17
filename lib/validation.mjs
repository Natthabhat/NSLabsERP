import { AppError } from "./security.mjs";
export function editable(cell) {
  const derived =
    cell.effectiveValue &&
    Object.keys(cell.effectiveValue).length &&
    !Object.keys(cell.userEnteredValue || {}).length;
  return (
    !derived &&
    !cell.userEnteredValue?.formulaValue &&
    !cell.pivotTable &&
    !cell.dataSourceFormula &&
    !cell.dataSourceTable &&
    (!cell.dataValidation ||
      ["ONE_OF_LIST", "BOOLEAN"].includes(cell.dataValidation.condition?.type))
  );
}
export function valueForWrite(value, cell, type) {
  if (!editable(cell))
    throw new AppError(
      "This cell is calculated or uses validation that cannot be edited here.",
      403,
    );
  if (value === null) {
    if (cell.dataValidation)
      throw new AppError("Choose an allowed value for this validated cell.");
    return {};
  }
  const condition = cell.dataValidation?.condition;
  if (condition?.type === "ONE_OF_LIST") {
    const options = (condition.values || []).map((v) => v.userEnteredValue);
    if (typeof value !== "string" || !options.includes(value))
      throw new AppError("Choose a value from the dropdown.");
    return { stringValue: value };
  }
  if (condition?.type === "BOOLEAN") {
    if (typeof value !== "boolean")
      throw new AppError("Choose a checkbox value.");
    if (condition.values?.length) {
      return {
        stringValue: condition.values[value ? 0 : 1]?.userEnteredValue ?? "",
      };
    }
    return { boolValue: value };
  }
  if (type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new AppError("Enter a valid number.");
    return { numberValue: value };
  }
  if (type === "boolean") {
    if (typeof value !== "boolean") throw new AppError("Choose true or false.");
    return { boolValue: value };
  }
  if (type === "date") {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new AppError("Enter a valid date.");
    const d = new Date(value + "T00:00:00Z");
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value)
      throw new AppError("Enter a valid calendar date.");
    return { numberValue: (d.getTime() - Date.UTC(1899, 11, 30)) / 86400000 };
  }
  if (typeof value !== "string" || value.length > 10000)
    throw new AppError("Enter text up to 10,000 characters.");
  // Explicit stringValue never turns text starting with = into a formula.
  return { stringValue: value };
}
export function cellType(cell, fallback = "text") {
  const v = cell.effectiveValue || cell.userEnteredValue || {};
  const format = cell.effectiveFormat?.numberFormat?.type;
  if (["DATE", "DATE_TIME"].includes(format)) return "date";
  if ("numberValue" in v) return "number";
  if ("boolValue" in v) return "boolean";
  return !Object.keys(v).length ? fallback : "text";
}
export function editorCell(cell, fallback) {
  const type = cellType(cell, fallback),
    v = cell.effectiveValue || cell.userEnteredValue || {};
  let value = v.numberValue ?? v.boolValue ?? v.stringValue ?? "";
  if (type === "date" && typeof value === "number")
    value = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000)
      .toISOString()
      .slice(0, 10);
  const condition = cell.dataValidation?.condition;
  return {
    type,
    value,
    display: cell.formattedValue ?? String(value),
    formula: !!cell.userEnteredValue?.formulaValue,
    editable: editable(cell),
    options:
      condition?.type === "ONE_OF_LIST"
        ? (condition.values || []).map((v) => v.userEnteredValue)
        : null,
    checkbox: condition?.type === "BOOLEAN",
    checked:
      condition?.type === "BOOLEAN"
        ? condition.values?.length
          ? value === condition.values[0]?.userEnteredValue
          : value === true
        : value === true,
  };
}
