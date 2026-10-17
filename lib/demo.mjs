import { modules, PAGE_SIZE } from "./config.mjs";
const make = (row, values, formulas = []) => ({ row, values, formulas });
export function initialDemo() {
  const state = {};
  for (const tab of modules) {
    let headers, rows;
    if (["Cost", "Filament"].includes(tab.name)) {
      headers = ["Order", "Unit", "Price", "Total", "Dates", "Type"];
      const materials =
        tab.name === "Filament"
          ? [
              ["Studio PLA · Cloud White", 3, 245, "PLA"],
              ["Studio PLA · Forest Green", 2, 285, "PLA"],
              ["PETG · Slate Grey", 4, 320, "PETG"],
              ["ABS · Graphite Black", 2, 360, "ABS"],
              ["PLA Silk · Champagne", 1, 420, "PLA"],
              ["TPU · Clear", 1, 580, "TPU"],
              ["PETG · Ocean Blue", 3, 315, "PETG"],
              ["PLA Matte · Terracotta", 2, 295, "PLA"],
              ["ASA · Alpine White", 1, 465, "ASA"],
            ]
          : [
              ["Workshop printer · example", 1, 12900, "Machine"],
              ["Precision tool set · example", 2, 350, "Tools"],
              ["Replacement nozzle · example", 4, 180, "Part"],
            ];
      rows = materials.map(([name, qty, price, type], i) =>
        make(
          i + 2,
          [
            name,
            qty,
            price,
            qty * price,
            `2026-10-${String(15 - i).padStart(2, "0")}`,
            type,
          ],
          [false, false, false, true, false, false],
        ),
      );
    } else if (tab.group === "Marketplaces") {
      headers = ["Total", "Date", "Amount", "Confirm"];
      rows = Array.from({ length: 6 }, (_, i) =>
        make(i + 2, [
          `${tab.title} sample ${i + 1}`,
          `2026-10-${String(i + 1).padStart(2, "0")}`,
          640 + i * 270,
          i < 4,
        ]),
      );
    } else if (tab.name === "ST log") {
      headers = ["Product", "Platform", "Date", "Price", "Shipping", "Buyer"];
      rows = [
        make(2, [
          "Sample model A",
          "Shopee",
          "2026-10-10",
          1250,
          45,
          "Demo customer",
        ]),
        make(3, [
          "Sample model B",
          "Etsy",
          "2026-10-12",
          2490,
          350,
          "Demo customer",
        ]),
      ];
    } else if (tab.name === "ST Sell") {
      headers = ["NAME", "Quantity", "Rank"];
      rows = [
        make(2, ["Sample model A", 12, 1], [false, false, true]),
        make(3, ["Sample model B", 8, 2], [false, false, true]),
      ];
    } else {
      const extended = tab.name !== "Price Model";
      headers = extended
        ? [
            "Name",
            "Units",
            "Filament",
            "Packing",
            "Utility",
            "Time",
            "Markup",
            "Cost",
            "Profits",
            "Price",
            "Price per unit",
          ]
        : [
            "Name",
            "Filament",
            "Packing",
            "Utility",
            "Time",
            "Cost",
            "Profits Thai",
            "Price Thai",
            "Profits Inter",
            "Price Inter",
          ];
      rows = [
        make(
          3,
          extended
            ? ["Sample organizer", 2, 32, 40, 12, 45, 30, 96, 154, 250, 125]
            : ["Sample model A", 220, 100, 65, 130, 264, 926, 1190, 1426, 1690],
          extended
            ? [
                false,
                false,
                false,
                false,
                false,
                false,
                false,
                true,
                true,
                false,
                true,
              ]
            : [
                false,
                false,
                false,
                false,
                false,
                true,
                true,
                false,
                true,
                false,
              ],
        ),
      ];
    }
    state[tab.id] = { headers, rows };
  }
  return state;
}
export function demoRecords(state, tab, page, query) {
  const all = state[tab.id],
    filtered = all.rows.filter((r) =>
      r.values.join(" ").toLowerCase().includes(query.toLowerCase()),
    ),
    pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
    p = Math.min(page, pages - 1);
  return {
    headers: all.headers,
    rows: filtered
      .slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE)
      .map((r) => ({
        ...r,
        values: r.values.map((v, i) =>
          typeof v === "boolean"
            ? v
              ? "TRUE"
              : "FALSE"
            : typeof v === "number" &&
                [
                  "Price",
                  "Total",
                  "Amount",
                  "Cost",
                  "Price Thai",
                  "Price Inter",
                  "Profits",
                  "Profits Thai",
                  "Profits Inter",
                  "Packing",
                  "Utility",
                ].includes(all.headers[i])
              ? new Intl.NumberFormat("en-TH", {
                  style: "currency",
                  currency: "THB",
                }).format(v)
              : String(v),
        ),
      })),
    page: p,
    pages,
    total: filtered.length,
    sourceTitle: "Demo workbook",
    updatedAt: new Date().toISOString(),
  };
}
export function demoCell(state, tab, row, column) {
  const record = state[tab.id].rows.find((r) => r.row === row),
    value = record.values[column - 1],
    type =
      typeof value === "number"
        ? "number"
        : typeof value === "boolean"
          ? "boolean"
          : /^\d{4}-\d{2}-\d{2}$/.test(value)
            ? "date"
            : "text";
  return {
    tab: tab.id,
    row,
    column,
    record: String(record.values[0]),
    cell: {
      value,
      display: String(value),
      type,
      formula: !!record.formulas?.[column - 1],
      editable: !record.formulas?.[column - 1],
      checkbox: type === "boolean",
      checked: !!value,
      options:
        tab.name === "Filament" && column === 6
          ? ["PLA", "PETG", "ABS", "ASA", "TPU"]
          : null,
    },
  };
}
