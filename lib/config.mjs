export const SPREADSHEET_ID = "1cgJr-GzZs5YHKQOLch5keZLB-aKcGARDAFYAYVHkuiE";
export const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
export const PAGE_SIZE = 40;
export const MAX_ROWS = 5000;
export const modules = [
  {
    id: 94512498,
    name: "Cost",
    title: "Costs & production",
    group: "Workshop",
    icon: "cost",
    width: 6,
    start: 2,
    description: "Understand the cost behind every print.",
    types: ["text", "number", "number", "number", "date", "text"],
  },
  {
    id: 756806574,
    name: "Filament",
    title: "Filament inventory",
    group: "Workshop",
    icon: "filament",
    width: 6,
    start: 2,
    description: "A little order for every spool in the workshop.",
    types: ["text", "number", "number", "number", "date", "text"],
  },
  {
    id: 1270018478,
    name: "ST log",
    title: "Stock movements",
    group: "Workshop",
    icon: "stock",
    width: 6,
    start: 2,
    description: "Follow products from the workshop to your customers.",
    types: ["text", "text", "date", "number", "number", "text"],
  },
  {
    id: 1174401002,
    name: "ST Sell",
    title: "Stock sales",
    group: "Workshop",
    icon: "sales",
    width: 3,
    start: 2,
    description: "Review quantities and product performance.",
    types: ["text", "number", "number"],
  },
  {
    id: 2109329498,
    name: "Price Model",
    title: "Price models",
    group: "Pricing",
    icon: "price",
    width: 10,
    start: 3,
    description: "Find the right price for every model.",
  },
  {
    id: 2026745494,
    name: "Price N",
    title: "Price N",
    group: "Pricing",
    icon: "price",
    width: 11,
    start: 3,
    description: "Your Price N products and their pricing inputs.",
  },
  {
    id: 1553283240,
    name: "Price GF",
    title: "Price GF",
    group: "Pricing",
    icon: "price",
    width: 11,
    start: 3,
    description: "Your Price GF products and their pricing inputs.",
  },
  ...[
    ["Ebay", 683461259, "eBay"],
    ["Etsy", 746615023, "Etsy"],
    ["Lazada", 1383927934, "Lazada"],
    ["Shopee", 1004654573, "Shopee"],
  ].map(([name, id, title]) => ({
    id,
    name,
    title,
    group: "Marketplaces",
    icon: "channel",
    width: 4,
    start: 2,
    description: `Read and update your ${title} worksheet records.`,
    types: ["text", "date", "number", "boolean"],
  })),
];
export function moduleById(id) {
  const tab = modules.find((t) => t.id === Number(id));
  if (!tab) throw new Error("Unknown worksheet.");
  return tab;
}
export function columnName(index) {
  let value = index + 1,
    label = "";
  while (value) {
    value--;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}
