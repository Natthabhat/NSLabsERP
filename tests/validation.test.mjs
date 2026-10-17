import test from "node:test";
import assert from "node:assert/strict";
import { valueForWrite, editable, editorCell } from "../lib/validation.mjs";
import { seal, unseal, equal } from "../lib/security.mjs";
import { moduleById, columnName } from "../lib/config.mjs";
test("formula cells cannot be overwritten", () => {
  const formula = { userEnteredValue: { formulaValue: "=B2*C2" } };
  assert.equal(editable(formula), false);
  assert.throws(() => valueForWrite(10, formula, "number"), /calculated/);
});
test("formula-like text is always a literal string", () =>
  assert.deepEqual(valueForWrite('=IMPORTXML("x")', {}, "text"), {
    stringValue: '=IMPORTXML("x")',
  }));
test("numbers are typed and finite", () => {
  assert.throws(() => valueForWrite("23", {}, "number"));
  assert.throws(() => valueForWrite(Infinity, {}, "number"));
  assert.deepEqual(valueForWrite(23, {}, "number"), { numberValue: 23 });
});
test("dropdowns reject out-of-list values and unsupported rules stay read-only", () => {
  const cell = {
    dataValidation: {
      condition: {
        type: "ONE_OF_LIST",
        values: [{ userEnteredValue: "PLA" }, { userEnteredValue: "PETG" }],
      },
    },
  };
  assert.throws(() => valueForWrite("ABS", cell, "text"));
  assert.deepEqual(valueForWrite("PLA", cell, "text"), { stringValue: "PLA" });
  assert.equal(
    editable({ dataValidation: { condition: { type: "CUSTOM_FORMULA" } } }),
    false,
  );
});
test("checkboxes support native and custom checked values", () => {
  assert.deepEqual(
    valueForWrite(
      true,
      { dataValidation: { condition: { type: "BOOLEAN" } } },
      "boolean",
    ),
    { boolValue: true },
  );
  assert.deepEqual(
    valueForWrite(
      false,
      {
        dataValidation: {
          condition: {
            type: "BOOLEAN",
            values: [{ userEnteredValue: "YES" }, { userEnteredValue: "NO" }],
          },
        },
      },
      "text",
    ),
    { stringValue: "NO" },
  );
});
test("dates validate the calendar and preserve Sheets serial convention", () => {
  assert.throws(() => valueForWrite("2026-02-30", {}, "date"));
  assert.deepEqual(valueForWrite("1970-01-01", {}, "date"), {
    numberValue: 25569,
  });
  assert.equal(
    editorCell(
      {
        effectiveValue: { numberValue: 25569 },
        effectiveFormat: { numberFormat: { type: "DATE" } },
      },
      "text",
    ).value,
    "1970-01-01",
  );
});
test("clear targets only the cell value and refuses validated blanks", () => {
  assert.deepEqual(valueForWrite(null, {}, "text"), {});
  assert.throws(() =>
    valueForWrite(
      null,
      { dataValidation: { condition: { type: "BOOLEAN" } } },
      "boolean",
    ),
  );
});
test("encrypted cookies reject tampering, wrong purpose and expiration", () => {
  process.env.SESSION_SECRET =
    "test-only-secret-that-is-longer-than-32-characters";
  const value = seal({ email: "test@example.com" }, "session", 60);
  assert.deepEqual(unseal(value, "session"), { email: "test@example.com" });
  assert.equal(unseal(value, "oauth"), null);
  const tampered = Buffer.from(value, "base64url");
  tampered[0] ^= 1;
  assert.equal(unseal(tampered.toString("base64url"), "session"), null);
  assert.equal(unseal(seal({}, "session", -1), "session"), null);
  assert.equal(equal("a", "a"), true);
  assert.equal(equal("a", "b"), false);
});
test("only the inspected worksheet ids are accepted", () => {
  assert.equal(moduleById(756806574).name, "Filament");
  assert.throws(() => moduleById(999));
  assert.equal(columnName(0), "A");
  assert.equal(columnName(26), "AA");
});
test("array-derived output stays read-only and unicode state comparisons fail safely", () => {
  assert.equal(editable({ effectiveValue: { numberValue: 12 } }), false);
  assert.equal(editable({}), true);
  assert.equal(equal("a", "é"), false);
});
