/**
 * VERITAS demo corpus generator — "Kestrel Manufacturing Inc" (FY 2025-26).
 *
 * One mid-size European import/distribution company's books, as a folder of
 * individual .txt documents an auditor would actually receive. Reading the
 * documents (and cross-referencing them) surfaces the planted fraud; nothing
 * in the readable corpus is ever labelled "fraud".
 *
 *   vendors(46) ─┬─ registrations ── invoices(~300) ── bank statements(12)
 *   employees(18)┤                      POs(15)  payroll(12)  board minutes(8)
 *                └─ HR records         credit notes(4)
 *
 * PLANTED SCHEMES (ground truth in manifest.json only):
 *   1. SHELL COMPANY   V-031 "Zenith Procurement LLC"  — reg address == E-007 home
 *      address; no VAT number; 14 sequential vague invoices; no POs; every one
 *      approved by E-007 (Ethan Brooks); amounts hug the $25,000 threshold.
 *   2. GHOST EMPLOYEE  E-015 "Nina Fischer"    — salary account IDENTICAL to
 *      E-007's; joined weeks ago; no email / approvals / other footprint.
 *   3. DUPLICATE PAYMENT (real loss) — a legit invoice paid twice, never
 *      reversed. Money gone.
 * RED HERRINGS (legit, must be clearable):
 *   4. A duplicate that WAS caught and reversed by credit note 3 days later.
 *   5. A $250,000 round CAPEX that LOOKS suspicious but has PO-77001 + board
 *      minute authorisation.
 *
 * Usage:  npx tsx datagen/src/corpus.ts
 * Output: /Users/vidigoat/Downloads/veritas-demo-books/   (the demo folder)
 *         /Users/vidigoat/veritas/datagen/data/out/corpus/ (test copy)
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

/* ----------------------------------------------------------------------- *
 * Deterministic RNG (mulberry32) — fixed seed -> byte-identical corpus.
 * ----------------------------------------------------------------------- */
function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T,>(arr: T[]): T => arr[Math.floor(next() * arr.length)],
    amount: (min: number, max: number) => Math.round((min + next() * (max - min)) / 10) * 10,
    chance: (p: number) => next() < p,
  };
}
type Rng = ReturnType<typeof makeRng>;

/* ----------------------------------------------------------------------- *
 * Formatting helpers.
 * ----------------------------------------------------------------------- */
const rupee = (n: number) =>
  "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rule = (c = "=", n = 68) => c.repeat(n);
const pad = (s: string, w: number) => (s.length >= w ? s : s + " ".repeat(w - s.length));
const padL = (s: string, w: number) => (s.length >= w ? s : " ".repeat(w - s.length) + s);

const FY_MONTHS = [
  "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09",
  "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
];
const MONTH_NAME: Record<string, string> = {
  "01": "January", "02": "February", "03": "March", "04": "April", "05": "May", "06": "June",
  "07": "July", "08": "August", "09": "September", "10": "October", "11": "November", "12": "December",
};
const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${parseInt(d)} ${MONTH_NAME[m]} ${y}`;
};

/* ----------------------------------------------------------------------- *
 * The company.
 * ----------------------------------------------------------------------- */
const CO = {
  name: "Kestrel Manufacturing Inc",
  addr: "500 Commerce Street, Newark, NJ 07102",
  gstin: "47-3081925",
  cin: "Delaware File No. 6142093",
  bankName: "JPMorgan Chase, Newark Commercial Branch",
  bankAcc: "JPMorgan Chase Current A/C ****8842",
  ifsc: "ABA 021000021",
};
const APPROVAL_THRESHOLD = 25000; // single-approver limit; anything >= needs Finance Controller co-sign

/* ----------------------------------------------------------------------- *
 * Reference pools.
 * ----------------------------------------------------------------------- */
const CITIES: { city: string; state: string; code: string }[] = [
  { city: "New York, NY 10016", state: "New York", code: "27" },
  { city: "New York, NY 10018", state: "New York", code: "27" },
  { city: "Chicago, IL 60601", state: "Illinois", code: "27" },
  { city: "Houston, TX 77002", state: "Texas", code: "27" },
  { city: "Los Angeles, CA 90012", state: "California", code: "27" },
  { city: "Atlanta, GA 30303", state: "Georgia", code: "27" },
  { city: "Boston, MA 02108", state: "Massachusetts", code: "27" },
  { city: "Seattle, WA 98101", state: "Washington", code: "27" },
  { city: "Dallas, TX 75201", state: "Texas", code: "27" },
  { city: "Denver, CO 80202", state: "Colorado", code: "24" },
  { city: "Miami, FL 33131", state: "Florida", code: "24" },
  { city: "Philadelphia, PA 19103", state: "Pennsylvania", code: "07" },
  { city: "Phoenix, AZ 85004", state: "Arizona", code: "29" },
  { city: "Denver, CO 80014", state: "Colorado", code: "33" },
];
const STREETS = [
  "Broadway", "Madison Avenue", "Park Avenue", "Lexington Avenue", "Fifth Avenue", "Wacker Drive",
  "Michigan Avenue", "Market Street", "Main Street", "Elm Street",
  "Commerce Street", "Industrial Parkway", "Harbor Boulevard", "Sunset Boulevard", "Peachtree Street",
  "Beacon Street", "Pine Street", "Oak Avenue", "Maple Drive", "Washington Street",
];
const CUSTOMERS = [
  "Greenfield Retail Corp", "Midwest Distribution LLC", "Blue Ocean Mart Inc",
  "Coastal Wholesale Co", "Continental Superstores", "Metro Bazaar USA",
  "Pacific Trade Links LLC", "Western Supply Chain Inc",
];

/* vendor name parts + per-category catalogue of realistic line items */
const V_A = ["Apex", "Zenith", "Crest", "Summit", "Pioneer", "Vertex", "Orion", "Stellar",
  "Cascade", "Meridian", "Horizon", "Quantum", "Falcon", "Everest", "Granite", "Sequoia",
  "Liberty", "Redwood", "Hudson", "Prairie", "Beacon", "Ironclad", "Cardinal", "Monarch",
  "Keystone", "Northgate", "Silverline", "Copper", "Atlas", "Vanguard", "Cobalt", "Sterling"];
const V_B = ["Supplies", "Logistics", "Industries", "Solutions", "Traders", "Enterprises",
  "Materials", "Services", "Freight Services", "Packaging", "Systems", "Components",
  "Textiles", "Chemicals", "Print Works", "Imports", "Distributors", "Agencies"];

interface Category {
  name: string;
  items: { desc: string; unit: string; lo: number; hi: number }[];
}
const CATEGORIES: Category[] = [
  { name: "Packaging Materials", items: [
    { desc: "Corrugated cartons 5-ply (450x450x300mm)", unit: "nos", lo: 22, hi: 48 },
    { desc: "BOPP self-adhesive tape 48mm x 65m", unit: "rolls", lo: 34, hi: 62 },
    { desc: "Stretch wrap film 500mm 23-micron", unit: "rolls", lo: 180, hi: 320 },
    { desc: "PP woven bags 50kg laminated", unit: "nos", lo: 12, hi: 28 },
    { desc: "Bubble wrap roll 1m x 100m", unit: "rolls", lo: 240, hi: 460 },
  ]},
  { name: "Freight & Logistics", items: [
    { desc: "FTL road freight Newark-Chicago (53ft dry van)", unit: "trip", lo: 38000, hi: 62000 },
    { desc: "Container drayage Port Newark-warehouse (20ft)", unit: "trip", lo: 9500, hi: 14500 },
    { desc: "Warehouse-to-DC last mile (per shipment)", unit: "shipment", lo: 2400, hi: 5200 },
    { desc: "CFS handling & destuffing charges", unit: "container", lo: 6800, hi: 11200 },
    { desc: "Detention / demurrage recovery", unit: "days", lo: 3200, hi: 6400 },
  ]},
  { name: "Raw Materials", items: [
    { desc: "HDPE granules (film grade) IS 7328", unit: "kg", lo: 92, hi: 128 },
    { desc: "Kraft paper reel 180 GSM", unit: "kg", lo: 46, hi: 74 },
    { desc: "Industrial adhesive EVA hot-melt", unit: "kg", lo: 210, hi: 340 },
    { desc: "Aluminium foil laminate 12-micron", unit: "kg", lo: 380, hi: 520 },
  ]},
  { name: "IT & Software", items: [
    { desc: "Annual license - inventory ERP module", unit: "seats", lo: 2400, hi: 4800 },
    { desc: "Laptop Dell Latitude 3540 i5/16GB", unit: "nos", lo: 58000, hi: 68000 },
    { desc: "Managed IT support (monthly retainer)", unit: "month", lo: 18000, hi: 32000 },
    { desc: "Barcode scanner Zebra DS2208", unit: "nos", lo: 8200, hi: 11400 },
  ]},
  { name: "Facilities Maintenance", items: [
    { desc: "Housekeeping & sanitation (monthly)", unit: "month", lo: 22000, hi: 38000 },
    { desc: "HVAC AMC quarterly service", unit: "visit", lo: 14000, hi: 24000 },
    { desc: "Pest control treatment", unit: "visit", lo: 3800, hi: 6200 },
    { desc: "Forklift hydraulic servicing", unit: "unit", lo: 9200, hi: 15600 },
  ]},
  { name: "Office Supplies", items: [
    { desc: "A4 copier paper 75 GSM", unit: "reams", lo: 280, hi: 360 },
    { desc: "Toner cartridge HP 26A", unit: "nos", lo: 6800, hi: 8400 },
    { desc: "Printed stationery & letterheads", unit: "sets", lo: 18, hi: 34 },
    { desc: "Pantry & housekeeping consumables", unit: "lot", lo: 4200, hi: 7800 },
  ]},
  { name: "Marketing", items: [
    { desc: "Trade catalogue print run (4-colour)", unit: "nos", lo: 42, hi: 78 },
    { desc: "Exhibition booth fabrication", unit: "lot", lo: 48000, hi: 96000 },
    { desc: "Digital campaign management (monthly)", unit: "month", lo: 26000, hi: 52000 },
    { desc: "Branded merchandise & POSM", unit: "lot", lo: 12000, hi: 28000 },
  ]},
  { name: "Chemicals", items: [
    { desc: "Industrial cleaning solvent (IPA 99%)", unit: "ltr", lo: 180, hi: 260 },
    { desc: "Silica gel desiccant sachets 5g", unit: "kg", lo: 120, hi: 190 },
    { desc: "Fumigation-grade phosphine tablets", unit: "kg", lo: 640, hi: 920 },
  ]},
];

/* ----------------------------------------------------------------------- *
 * EU VAT number generator ("FR" + 11 digits). Consumes the same number of
 * RNG draws as the previous generator so the deterministic corpus stays stable.
 * ----------------------------------------------------------------------- */
function makeVat(rng: Rng, _stateCode: string): string {
  const D = "0123456789";
  const ch = (s: string) => s[Math.floor(rng.next() * s.length)];
  let out = "";
  for (let i = 0; i < 7; i++) out += ch(D); // 7 draws -> EIN body
  return "47-" + out.slice(0, 7);
}

/* ----------------------------------------------------------------------- *
 * Entities.
 * ----------------------------------------------------------------------- */
interface Employee {
  id: string; name: string; role: string; dept: string; home: string;
  joined: string; salary: number; account: string; manager: string;
  email: string | null; ghost?: boolean; fraudster?: boolean;
}
interface Vendor {
  id: string; name: string; addr: string; city: string; state: string; stateCode: string;
  gstin: string | null; account: string; category: string; onboarded: string; contact: string;
  phone: string; shell?: boolean;
}

/* THE fraudster's home address and salary account - reused verbatim so that
 * exact-string cross-referencing works. */
const FRAUDSTER_HOME = "245 Madison Avenue, New York, NY 10016";
const FRAUDSTER_ACCOUNT = "Wells Fargo A/C ****4188";

function makeEmployees(rng: Rng): Employee[] {
  const dir: Omit<Employee, "home" | "account" | "email">[] = [
    { id: "E-001", name: "Marcus Reed",     role: "Operations Head",              dept: "Operations",  joined: "2016-06-13", salary: 165000, manager: "E-004" },
    { id: "E-002", name: "Laura Bennett",       role: "Sales Manager",                dept: "Sales",       joined: "2017-02-20", salary: 118000, manager: "E-004" },
    { id: "E-003", name: "David Coleman",  role: "Finance Controller",           dept: "Finance",     joined: "2016-09-01", salary: 152000, manager: "E-004" },
    { id: "E-004", name: "Sarah Whitfield",        role: "Managing Director",            dept: "Executive",   joined: "2016-04-01", salary: 240000, manager: "E-004" },
    { id: "E-005", name: "Kevin Turner",    role: "Warehouse Supervisor",         dept: "Operations",  joined: "2018-11-05", salary: 58000,  manager: "E-001" },
    { id: "E-006", name: "Rachel Adams",       role: "HR Manager",                   dept: "HR",          joined: "2018-03-19", salary: 96000,  manager: "E-004" },
    { id: "E-007", name: "Ethan Brooks",   role: "Procurement & Finance Manager", dept: "Procurement", joined: "2019-07-22", salary: 98000,  manager: "E-003", fraudster: true },
    { id: "E-008", name: "Jason Miller",      role: "Accounts Payable Clerk",       dept: "Finance",     joined: "2020-01-15", salary: 46000,  manager: "E-003" },
    { id: "E-009", name: "Emily Carter",       role: "Logistics Coordinator",        dept: "Operations",  joined: "2019-10-08", salary: 52000,  manager: "E-001" },
    { id: "E-010", name: "Brandon Hughes",       role: "Quality Lead",                 dept: "Operations",  joined: "2020-08-11", salary: 74000,  manager: "E-001" },
    { id: "E-011", name: "Olivia Price",       role: "Admin Executive",              dept: "Admin",       joined: "2021-05-24", salary: 42000,  manager: "E-006" },
    { id: "E-012", name: "Daniel Foster",        role: "IT Manager",                   dept: "IT",          joined: "2019-12-02", salary: 108000, manager: "E-004" },
    { id: "E-013", name: "Megan Ross",      role: "Sales Executive",              dept: "Sales",       joined: "2022-01-17", salary: 44000,  manager: "E-002" },
    { id: "E-014", name: "Tyler Morgan",         role: "Accounts Executive",           dept: "Finance",     joined: "2021-09-06", salary: 48000,  manager: "E-003" },
    { id: "E-015", name: "Nina Fischer",      role: "Data Entry Operator",          dept: "Procurement", joined: "2026-01-05", salary: 72000,  manager: "E-007", ghost: true },
    { id: "E-016", name: "Chloe Sanders",       role: "Procurement Executive",        dept: "Procurement", joined: "2022-06-28", salary: 47000,  manager: "E-007" },
    { id: "E-017", name: "Ryan Mitchell",       role: "Marketing Manager",            dept: "Marketing",   joined: "2020-04-14", salary: 102000, manager: "E-004" },
    { id: "E-018", name: "Hannah Cooper",      role: "Customer Support Lead",        dept: "Sales",       joined: "2021-11-30", salary: 56000,  manager: "E-002" },
  ];
  const usedAcc = new Set<string>([FRAUDSTER_ACCOUNT]);
  const usedHome = new Set<string>([FRAUDSTER_HOME]);
  const banks = ["JPMorgan Chase", "Bank of America", "Wells Fargo", "Citibank", "U.S. Bank", "PNC Bank", "Capital One", "TD Bank", "Truist", "Fifth Third Bank"];
  return dir.map((e) => {
    let home: string;
    if (e.fraudster) home = FRAUDSTER_HOME;
    else { do { home = `${rng.int(1, 480)} ${rng.pick(STREETS)}, ${rng.pick(CITIES).city}`; } while (usedHome.has(home)); usedHome.add(home); }

    let account: string;
    if (e.fraudster || e.ghost) account = FRAUDSTER_ACCOUNT; // GHOST reuses the fraudster's account
    else { do { account = `${rng.pick(banks)} A/C ****${rng.int(1000, 9999)}`; } while (usedAcc.has(account)); usedAcc.add(account); }

    const email = e.ghost ? null
      : `${e.name.toLowerCase().replace(/[^a-z]+/g, ".")}@kestrelmfg.com`;
    return { ...e, home, account, email };
  });
}

function makeVendors(rng: Rng, e007: Employee): Vendor[] {
  const usedName = new Set<string>(["Zenith Procurement LLC", "Alpine Print LLC", "Cascade Components"]); // reserve shell + forced-name vendors so no honest vendor collides
  const usedAcc = new Set<string>();
  const banks = ["JPMorgan Chase", "Bank of America", "Wells Fargo", "Citibank", "U.S. Bank",
    "PNC Bank", "Capital One", "TD Bank", "Truist", "Fifth Third Bank"];
  const firsts = ["James", "Robert", "Michael", "William", "Susan", "Karen", "Thomas", "Charles", "Nancy", "Steven", "Donald", "Betty"];
  const lasts = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Davis", "Wilson", "Anderson", "Taylor", "Clark", "Lewis"];

  const vendors: Vendor[] = [];
  for (let i = 1; i <= 110; i++) {
    const id = `V-${String(i).padStart(3, "0")}`;
    if (i === 31) continue; // shell inserted separately below
    let name = "";
    if (i === 6) name = "Cascade Components";        // reversed-duplicate herring vendor
    else if (i === 18) name = "Alpine Print LLC";    // un-reversed duplicate vendor
    else { do { name = `${rng.pick(V_A)} ${rng.pick(V_B)}`; } while (usedName.has(name)); }
    usedName.add(name);
    const loc = rng.pick(CITIES);
    let account = "";
    do { account = `${rng.pick(banks)} ****${rng.int(1000, 9999)}`; } while (usedAcc.has(account));
    usedAcc.add(account);
    vendors.push({
      id, name,
      addr: `${rng.int(1, 340)} ${rng.pick(STREETS)}, ${loc.city}`,
      city: loc.city, state: loc.state, stateCode: loc.code,
      gstin: makeVat(rng, loc.code),
      account, category: rng.pick(CATEGORIES).name,
      onboarded: `20${rng.int(17, 24)}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`,
      contact: `${rng.pick(firsts)} ${rng.pick(lasts)}`,
      phone: `+1 (${rng.int(201, 989)}) ${rng.int(200, 999)}-${rng.int(1000, 9999)}`,
    });
  }
  // ---- V-031 "Zenith Procurement LLC": THE SHELL -------------------------
  const shell: Vendor = {
    id: "V-031",
    name: "Zenith Procurement LLC",
    addr: e007.home,             // EXACT match to E-007's home address
    city: "New York, NY 10016", state: "New York", stateCode: "27",
    gstin: null,                 // no tax registration on file - the tell
    account: `Capital One ****${rng.int(1000, 9999)}`,
    category: "Professional Services",
    onboarded: "2025-04-10",
    contact: "E. Brooks",
    phone: `+1 (212) ${rng.int(200, 999)}-${rng.int(1000, 9999)}`,
    shell: true,
  };
  vendors.push(shell);
  vendors.sort((a, b) => a.id.localeCompare(b.id));
  return vendors;
}

/* ----------------------------------------------------------------------- *
 * Invoices + purchase orders.
 * ----------------------------------------------------------------------- */
interface LineItem { desc: string; qty: number; unit: string; rate: number; amount: number }
interface Invoice {
  vendorId: string;
  date: string;
  items: LineItem[];
  subtotal: number;
  gstRate: number;
  gst: number;
  igst: boolean;
  total: number;
  po: string | null;
  approver: string;      // employee id
  vendorRef: string;     // vendor's own invoice number
  category: string;
  voucher?: string;      // INV-YYYY-#### assigned after date sort
  tag?: "shell" | "dup_real" | "dup_reversed" | "capex";
}
interface PurchaseOrder {
  po: string; vendorId: string; date: string; desc: string;
  qty: number; unit: string; rate: number; value: number; approver: string; note?: string;
}

function dateIn(rng: Rng, month: string): string {
  return `${month}-${String(rng.int(1, 27)).padStart(2, "0")}`;
}

function buildLineItems(rng: Rng, cat: Category, targetSubtotal: number): LineItem[] {
  // 1-4 items whose amounts sum to ~targetSubtotal.
  const n = rng.int(1, Math.min(4, cat.items.length));
  const picks: typeof cat.items = [];
  const pool = [...cat.items];
  for (let i = 0; i < n; i++) picks.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  const weights = picks.map(() => 0.4 + rng.next());
  const wsum = weights.reduce((a, b) => a + b, 0);
  const items: LineItem[] = [];
  let allocated = 0;
  picks.forEach((it, idx) => {
    const share = idx === picks.length - 1 ? targetSubtotal - allocated : Math.round((targetSubtotal * weights[idx]) / wsum);
    const rate = Math.round((it.lo + rng.next() * (it.hi - it.lo)) * 100) / 100;
    let qty = Math.max(1, Math.round(share / rate));
    let amount = Math.round(qty * rate * 100) / 100;
    allocated += amount;
    items.push({ desc: it.desc, qty, unit: it.unit, rate, amount });
  });
  return items;
}

function priceInvoice(items: LineItem[], igst: boolean): Pick<Invoice, "subtotal" | "gstRate" | "gst" | "total"> {
  const subtotal = Math.round(items.reduce((a, b) => a + b.amount, 0) * 100) / 100;
  const gstRate = 8.25;
  const gst = Math.round(subtotal * 0.0825 * 100) / 100;
  const total = Math.round((subtotal + gst) * 100) / 100;
  return { subtotal, gstRate, gst, total };
}

function buildBooks(rng: Rng, vendors: Vendor[], employees: Employee[]) {
  const byId = new Map(vendors.map((v) => [v.id, v]));
  const catByName = new Map(CATEGORIES.map((c) => [c.name, c]));
  const approvers = employees.filter((e) => !e.ghost && /Manager|Controller|Head|Lead|Director/.test(e.role));
  const invoices: Invoice[] = [];
  const pos: PurchaseOrder[] = [];

  let poSeq = 77001;
  const nextPo = () => `PO-${poSeq++}`;

  /* --- H2 herring: $250,000 CAPEX, fully authorised (PO-77001 + board) --- */
  const capexVendor = byId.get("V-020")!;
  const capexPo = nextPo(); // PO-77001
  pos.push({
    po: capexPo, vendorId: "V-020", date: "2025-08-22",
    desc: "Semi-automatic carton sealing & packaging line - capital upgrade",
    qty: 1, unit: "system", rate: 250000, value: 250000, approver: "E-001",
    note: "Board-approved CAPEX (see BOARD-MINUTES-2025-08). Co-signed by Finance Controller.",
  });
  {
    const items: LineItem[] = [{ desc: "Semi-automatic carton sealing & packaging line (Model CS-2000)", qty: 1, unit: "system", rate: 250000, amount: 250000 }];
    const igst = capexVendor.stateCode !== "27";
    const p = priceInvoice(items, igst);
    invoices.push({
      vendorId: "V-020", date: "2025-09-15", items, ...p, igst,
      po: capexPo, approver: "E-004",
      vendorRef: `${capexVendor.name.split(" ")[0].toUpperCase()}/25-26/0087`,
      category: capexVendor.category, tag: "capex",
    });
  }

  /* --- 14 more purchase orders, each with a matching PO-backed invoice ---- */
  for (let i = 0; i < 14; i++) {
    let v: Vendor;
    do { v = rng.pick(vendors); } while (v.shell || v.id === "V-020");
    const cat = catByName.get(v.category)!;
    const value = rng.amount(60000, 280000);
    const po = nextPo();
    const item = rng.pick(cat.items);
    const qty = Math.max(1, Math.round(value / ((item.lo + item.hi) / 2)));
    const rate = Math.round((value / qty) * 100) / 100;
    const month = rng.pick(FY_MONTHS.slice(0, 10));
    pos.push({ po, vendorId: v.id, date: dateIn(rng, month), desc: item.desc, qty, unit: item.unit, rate, value, approver: rng.pick(approvers).id });
    const items = buildLineItems(rng, cat, value);
    const igst = v.stateCode !== "27";
    const p = priceInvoice(items, igst);
    // pay next-ish month
    const mi = Math.min(FY_MONTHS.indexOf(month) + 1, FY_MONTHS.length - 1);
    invoices.push({
      vendorId: v.id, date: dateIn(rng, FY_MONTHS[mi]), items, ...p, igst,
      po, approver: rng.pick(approvers).id,
      vendorRef: `${v.name.split(" ")[0].toUpperCase()}/25-26/${String(rng.int(100, 999))}`,
      category: v.category,
    });
  }

  /* --- ~280 ordinary legit invoices across the honest vendors ------------- */
  for (const v of vendors) {
    if (v.shell || v.id === "V-020") continue;
    const cat = catByName.get(v.category)!;
    const count = rng.int(6, 10);
    for (let k = 0; k < count; k++) {
      const month = rng.pick(FY_MONTHS);
      const subtotal = rng.amount(4000, 180000);
      const items = buildLineItems(rng, cat, subtotal);
      const igst = v.stateCode !== "27";
      const p = priceInvoice(items, igst);
      invoices.push({
        vendorId: v.id, date: dateIn(rng, month), items, ...p, igst,
        po: rng.chance(0.62) ? `PO-${rng.int(50000, 69999)}` : null,
        approver: rng.pick(approvers).id,
        vendorRef: `${v.name.split(" ")[0].toUpperCase()}/25-26/${String(rng.int(100, 999))}`,
        category: v.category,
      });
    }
  }

  /* --- Scheme 1: THE SHELL - 14 sequential invoices, no PO, all E-007 ----- */
  const shellTotals = [20800, 20950, 20500, 20650, 20900, 20750, 20850, 20200, 20400, 20800, 21600, 19900, 20400, 18800]; // sum = 287,500
  const shellMemos = [
    "Consulting & procurement support services",
    "Procurement advisory retainer",
    "Vendor sourcing & consulting support",
    "Consulting & procurement support services",
    "Procurement support and coordination",
    "Consulting & procurement support services",
    "Advisory and procurement support",
    "Consulting & procurement support services",
    "Procurement support services",
    "Consulting & procurement support services",
    "Vendor coordination & advisory support",
    "Consulting & procurement support services",
    "Procurement support and consulting",
    "Consulting & procurement support services",
  ];
  let apexRef = 41; // Apex's own invoice numbers run strictly 041,042,... (sole-customer tell)
  for (let i = 0; i < 14; i++) {
    const mIdx = Math.min(1 + Math.floor(i * 0.8), FY_MONTHS.length - 1); // May 2025 -> Mar 2026
    const total = shellTotals[i];
    const items: LineItem[] = [{ desc: shellMemos[i], qty: 1, unit: "lot", rate: total, amount: total }];
    invoices.push({
      vendorId: "V-031", date: dateIn(rng, FY_MONTHS[mIdx]),
      items, subtotal: total, gstRate: 0, gst: 0, igst: false, total,
      po: null, approver: "E-007",
      vendorRef: `ZPL/25-26/${String(apexRef++).padStart(3, "0")}`,
      category: "Professional Services", tag: "shell",
    });
  }

  /* --- Scheme 3: REAL duplicate payment (legit vendor, never reversed) ---- */
  const dupRealVendor = byId.get("V-018")!;
  {
    const igst = dupRealVendor.stateCode !== "27";
    // clean round total 87,400 for a spottable duplicate; single consistent line
    const subtotal = Math.round((64900 / 1.0825) * 100) / 100;
    const it = rng.pick(catByName.get(dupRealVendor.category)!.items);
    const only = [{ desc: it.desc, qty: 1, unit: "lot", rate: subtotal, amount: subtotal }];
    const gst = Math.round(subtotal * 0.0825 * 100) / 100;
    invoices.push({
      vendorId: "V-018", date: "2025-11-06", items: only, subtotal, gstRate: 8.25, gst, igst, total: 64900,
      po: `PO-${rng.int(50000, 69999)}`, approver: "E-008",
      vendorRef: `${dupRealVendor.name.split(" ")[0].toUpperCase()}/25-26/${rng.int(100, 999)}`,
      category: dupRealVendor.category, tag: "dup_real",
    });
  }

  /* --- Herring 4: duplicate that WAS reversed via credit note 3 days on --- */
  const dupRevVendor = byId.get("V-006")!;
  {
    const subtotal = Math.round((41300 / 1.0825) * 100) / 100;
    const cat = catByName.get(dupRevVendor.category)!;
    const item = rng.pick(cat.items);
    const only = [{ desc: item.desc, qty: Math.max(1, Math.round(subtotal / ((item.lo + item.hi) / 2))), unit: item.unit, rate: Math.round(((item.lo + item.hi) / 2) * 100) / 100, amount: subtotal }];
    const gst = Math.round(subtotal * 0.0825 * 100) / 100;
    invoices.push({
      vendorId: "V-006", date: "2025-07-04", items: only, subtotal, gstRate: 8.25, gst, igst: dupRevVendor.stateCode !== "27", total: 41300,
      po: `PO-${rng.int(50000, 69999)}`, approver: "E-008",
      vendorRef: `${dupRevVendor.name.split(" ")[0].toUpperCase()}/25-26/${rng.int(100, 999)}`,
      category: dupRevVendor.category, tag: "dup_reversed",
    });
  }

  /* --- assign voucher ids (INV-YYYY-####) in date order, per calendar yr -- */
  invoices.sort((a, b) => a.date.localeCompare(b.date));
  const seqByYear: Record<string, number> = {};
  for (const inv of invoices) {
    const yr = inv.date.slice(0, 4);
    seqByYear[yr] = (seqByYear[yr] ?? 0) + 1;
    inv.voucher = `INV-${yr}-${String(seqByYear[yr]).padStart(4, "0")}`;
  }
  return { invoices, pos, byId };
}

/* ----------------------------------------------------------------------- *
 * Cash movements -> bank statements + payroll.
 * ----------------------------------------------------------------------- */
interface CashEvent { date: string; type: "DR" | "CR"; amount: number; desc: string; ref: string }

function clampDay(month: string, invDay: number, add: number): string {
  return `${month}-${String(Math.min(27, invDay + add)).padStart(2, "0")}`;
}

function buildCash(rng: Rng, invoices: Invoice[], employees: Employee[], byId: Map<string, Vendor>) {
  const events: CashEvent[] = [];
  const dupProof: { statement: string; ref: string; amount: number; dates: string[] } = { statement: "", ref: "", amount: 0, dates: [] };

  for (const inv of invoices) {
    const v = byId.get(inv.vendorId)!;
    const month = inv.date.slice(0, 7);
    const invDay = parseInt(inv.date.slice(8));
    const payDate = clampDay(month, invDay, rng.int(2, 6));
    const desc = `NEFT ${v.name} - ${inv.voucher}`;

    if (inv.tag === "dup_real") {
      // paid TWICE, never reversed
      events.push({ date: `${month}-10`, type: "DR", amount: inv.total, desc, ref: inv.voucher! });
      events.push({ date: `${month}-13`, type: "DR", amount: inv.total, desc, ref: inv.voucher! });
      dupProof.statement = `BANK-STMT-${month}`;
      dupProof.ref = inv.voucher!; dupProof.amount = inv.total; dupProof.dates = [`${month}-10`, `${month}-13`];
    } else if (inv.tag === "dup_reversed") {
      // paid twice, then reversed by credit note 3 days later
      events.push({ date: `${month}-08`, type: "DR", amount: inv.total, desc, ref: inv.voucher! });
      events.push({ date: `${month}-09`, type: "DR", amount: inv.total, desc, ref: inv.voucher! });
      events.push({ date: `${month}-12`, type: "CR", amount: inv.total, desc: `Reversal - duplicate payment ${inv.voucher} (ref CREDIT-NOTE-CR-1042)`, ref: "CR-1042" });
    } else {
      events.push({ date: payDate, type: "DR", amount: inv.total, desc, ref: inv.voucher! });
    }
  }

  // payroll (day 27), rent (day 04), utilities per month
  const payrollByMonth: Record<string, { rows: Employee[]; total: number }> = {};
  for (const month of FY_MONTHS) {
    const monthEnd = `${month}-28`;
    const active = employees.filter((e) => e.joined <= monthEnd);
    const total = active.reduce((a, e) => a + e.salary, 0);
    payrollByMonth[month] = { rows: active, total };
    events.push({ date: `${month}-27`, type: "DR", amount: total, desc: `Salary disbursement - payroll (${active.length} staff)`, ref: `PAYROLL-${month}` });
    events.push({ date: `${month}-04`, type: "DR", amount: 165000, desc: "Office & warehouse rent - Newark HQ", ref: "RENT" });
    events.push({ date: `${month}-${String(rng.int(9, 18)).padStart(2, "0")}`, type: "DR", amount: rng.amount(28000, 46000), desc: "Electricity, water & internet - utilities", ref: "UTIL" });
  }

  // revenue credits sized to keep the balance healthy & drifting up
  for (const month of FY_MONTHS) {
    const drTotal = events.filter((e) => e.date.startsWith(month) && e.type === "DR").reduce((a, b) => a + b.amount, 0);
    const target = Math.round((drTotal * 1.06) / 3);
    for (const [i, day] of [3, 14, 24].entries()) {
      events.push({ date: `${month}-${String(day).padStart(2, "0")}`, type: "CR", amount: target + (i === 0 ? Math.round(drTotal * 0.06) : 0), desc: `Customer receipt - ${CUSTOMERS[(month.charCodeAt(6) + i) % CUSTOMERS.length]}`, ref: "RCPT" });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return { events, payrollByMonth, dupProof };
}

/* ----------------------------------------------------------------------- *
 * Renderers.
 * ----------------------------------------------------------------------- */
let EMP_NAME: Map<string, string> = new Map();
function nameOf(id: string): string { return EMP_NAME.get(id) ?? id; }

function rInvoice(inv: Invoice, v: Vendor): string {
  const L: string[] = [];
  L.push(v.name.toUpperCase());
  L.push(v.addr);
  L.push(v.gstin ? `Tax ID: ${v.gstin}` : `Tax ID: [NOT PROVIDED]`);
  L.push(`Contact: ${v.contact}   ${v.phone}`);
  L.push(rule("="));
  L.push(pad("TAX INVOICE", 44) + `Invoice No: ${inv.vendorRef}`);
  L.push(pad(`AP Voucher: ${inv.voucher}`, 44) + `Date: ${longDate(inv.date)}`);
  L.push("");
  L.push("Bill To:");
  L.push(`  ${CO.name}`);
  L.push(`  ${CO.addr}`);
  L.push(`  Tax ID: ${CO.gstin}`);
  L.push("");
  L.push(pad("#", 4) + pad("Description", 44) + pad("Qty", 8) + pad("Unit", 7) + pad("Rate", 14) + "Amount");
  L.push(rule("-"));
  inv.items.forEach((it, i) => {
    L.push(pad(String(i + 1), 4) + pad(it.desc.slice(0, 43), 44) + pad(String(it.qty), 8) + pad(it.unit, 7) + pad(rupee(it.rate), 14) + rupee(it.amount));
  });
  L.push(rule("-"));
  L.push(padL("Subtotal:", 72) + "  " + padL(rupee(inv.subtotal), 16));
  if (inv.gst === 0) {
    L.push(padL("Sales Tax:", 72) + "  " + padL("Not applicable (vendor unregistered)", 16));
  } else {
    L.push(padL(`Sales Tax @ ${inv.gstRate}%:`, 72) + "  " + padL(rupee(inv.gst), 16));
  }
  L.push(padL("TOTAL PAYABLE:", 72) + "  " + padL(rupee(inv.total), 16));
  L.push(rule("="));
  L.push(`Purchase Order Ref: ${inv.po ?? "- (none on file)"}`);
  L.push(`Payment Terms: Net ${[15, 30, 45][(inv.total | 0) % 3]}`);
  L.push(`Vendor Bank: ${v.account}    ACH details on file`);
  L.push(`Approved for payment by: ${inv.approver} (${nameOf(inv.approver)})`);
  return L.join("\n");
}

function rVendorReg(v: Vendor): string {
  return [
    `${CO.name}`,
    `VENDOR MASTER RECORD`,
    rule("="),
    `Vendor ID          : ${v.id}`,
    `Registered Name    : ${v.name}`,
    `Registered Address : ${v.addr}`,
    `State / State Code : ${v.state} / ${v.stateCode}`,
    `Tax ID             : ${v.gstin ?? "[NOT PROVIDED]"}`,
    `Reg No             : ${v.gstin ? "DE-" + v.gstin.slice(3) : "[NOT PROVIDED]"}`,
    `Bank Account       : ${v.account}`,
    `Category           : ${v.category}`,
    `Onboarded          : ${longDate(v.onboarded)}`,
    `Primary Contact    : ${v.contact}`,
    `Phone              : ${v.phone}`,
    rule("-"),
    `Status: ACTIVE`,
  ].join("\n");
}

function rEmployee(e: Employee): string {
  return [
    `${CO.name}`,
    `EMPLOYEE RECORD - HR CONFIDENTIAL`,
    rule("="),
    `Employee ID        : ${e.id}`,
    `Name               : ${e.name}`,
    `Role / Title       : ${e.role}`,
    `Department         : ${e.dept}`,
    `Home Address       : ${e.home}`,
    `Date of Joining    : ${longDate(e.joined)}`,
    `Monthly Salary     : ${rupee(e.salary)}`,
    `Salary Bank Account: ${e.account}`,
    `Reporting Manager  : ${e.manager} (${nameOf(e.manager)})`,
    `Company Email      : ${e.email ?? "[not on file]"}`,
    rule("-"),
    `Status: ACTIVE`,
  ].join("\n");
}

function rPurchaseOrder(po: PurchaseOrder, v: Vendor): string {
  const value = po.value;
  const gst = Math.round(value * 0.0825 * 100) / 100;
  return [
    `${CO.name}`,
    `${CO.addr}`,
    `PURCHASE ORDER`,
    rule("="),
    pad(`PO Number : ${po.po}`, 44) + `Date: ${longDate(po.date)}`,
    ``,
    `Vendor    : ${v.name} (${v.id})`,
    `Address   : ${v.addr}`,
    `Tax ID    : ${v.gstin ?? "[NOT PROVIDED]"}`,
    ``,
    pad("Description", 50) + pad("Qty", 8) + pad("Unit", 8) + "Rate",
    rule("-"),
    pad(po.desc.slice(0, 49), 50) + pad(String(po.qty), 8) + pad(po.unit, 8) + rupee(po.rate),
    rule("-"),
    padL(`Order Value (ex-tax): ${rupee(value)}`, 60),
    padL(`Est. Sales Tax @8.25%: ${rupee(gst)}`, 60),
    padL(`Est. Total          : ${rupee(value + gst)}`, 60),
    rule("="),
    `Authorised by: ${po.approver} (${nameOf(po.approver)})`,
    po.note ? `Note: ${po.note}` : `Delivery: ex-works, freight to be arranged by Kestrel.`,
  ].join("\n");
}

function rBankStatement(month: string, events: CashEvent[], opening: number): { text: string; closing: number } {
  const rows = events.filter((e) => e.date.startsWith(month));
  const L: string[] = [];
  L.push(`${CO.name}`);
  L.push(`${CO.bankName}`);
  L.push(`Statement of Account - ${MONTH_NAME[month.slice(5)]} ${month.slice(0, 4)}`);
  L.push(`Account: ${CO.bankAcc}    BIC: ${CO.ifsc}`);
  L.push(rule("="));
  L.push(pad("Date", 12) + pad("Ref", 14) + pad("Description", 42) + pad("Debit", 15) + pad("Credit", 15) + "Balance");
  L.push(rule("-"));
  let bal = opening;
  L.push(pad("", 12) + pad("", 14) + pad("Opening Balance", 42) + pad("", 15) + pad("", 15) + rupee(bal));
  let drTot = 0, crTot = 0;
  for (const e of rows) {
    if (e.type === "DR") { bal -= e.amount; drTot += e.amount; }
    else { bal += e.amount; crTot += e.amount; }
    L.push(
      pad(e.date, 12) + pad(e.ref.slice(0, 13), 14) + pad(e.desc.slice(0, 41), 42) +
      pad(e.type === "DR" ? rupee(e.amount) : "", 15) +
      pad(e.type === "CR" ? rupee(e.amount) : "", 15) + rupee(bal));
  }
  L.push(rule("-"));
  L.push(pad("", 12) + pad("", 14) + pad(`Totals - Debits / Credits`, 42) + pad(rupee(drTot), 15) + pad(rupee(crTot), 15) + rupee(bal));
  L.push(pad("", 12) + pad("", 14) + pad("Closing Balance", 42) + pad("", 15) + pad("", 15) + rupee(bal));
  return { text: L.join("\n"), closing: bal };
}

function rPayroll(month: string, data: { rows: Employee[]; total: number }): string {
  const L: string[] = [];
  L.push(`${CO.name}`);
  L.push(`PAYROLL REGISTER - ${MONTH_NAME[month.slice(5)]} ${month.slice(0, 4)}`);
  L.push(`Pay Date: ${month}-27    Disbursing Account: ${CO.bankAcc}`);
  L.push(rule("="));
  L.push(pad("Emp ID", 9) + pad("Name", 22) + pad("Role", 30) + pad("Bank Account", 26) + "Net Salary");
  L.push(rule("-"));
  for (const e of data.rows) {
    L.push(pad(e.id, 9) + pad(e.name, 22) + pad(e.role.slice(0, 29), 30) + pad(e.account, 26) + rupee(e.salary));
  }
  L.push(rule("-"));
  L.push(pad("", 9) + pad(`TOTAL (${data.rows.length} employees)`, 52) + pad("", 26) + rupee(data.total));
  return L.join("\n");
}

function rCreditNote(id: string, date: string, vendor: Vendor, amount: number, reason: string, ref: string, approver: string): string {
  return [
    `${CO.name}`,
    `CREDIT NOTE`,
    rule("="),
    pad(`Credit Note No: ${id}`, 44) + `Date: ${longDate(date)}`,
    ``,
    `Vendor   : ${vendor.name} (${vendor.id})`,
    `Tax ID   : ${vendor.gstin ?? "[NOT PROVIDED]"}`,
    `Reference: ${ref}`,
    ``,
    `Amount Credited: ${rupee(amount)}`,
    `Reason: ${reason}`,
    rule("-"),
    `Raised by: ${approver} (${nameOf(approver)})`,
  ].join("\n");
}

function rBoardMinutes(doc: { file: string; date: string; title: string; body: string[] }): string {
  return [
    `${CO.name}`,
    `MINUTES OF THE MEETING OF THE BOARD OF DIRECTORS`,
    `${CO.addr}`,
    rule("="),
    `Reference: ${doc.file}`,
    `Date: ${longDate(doc.date)}    Venue: Registered Office, Newark`,
    `Present: Sarah Whitfield (Managing Director, Chair), David Coleman (Finance`,
    `         Controller), Marcus Reed (Operations Head), and directors.`,
    rule("-"),
    doc.title,
    ``,
    ...doc.body,
    ``,
    `Signed: ______________________     ______________________`,
    `        Sarah Whitfield, Chair          David Coleman, Finance Controller`,
  ].join("\n");
}

/* ----------------------------------------------------------------------- *
 * Assemble corpus + write.
 * ----------------------------------------------------------------------- */
function main() {
  const rng = makeRng(90210);
  const employees = makeEmployees(rng);
  EMP_NAME = new Map(employees.map((e) => [e.id, e.name]));
  const vendors = makeVendors(rng, employees[6]); // E-007
  const { invoices, pos, byId } = buildBooks(rng, vendors, employees);
  const { events, payrollByMonth, dupProof } = buildCash(rng, invoices, employees, byId);

  const docs: { name: string; content: string }[] = [];

  // vendor registrations
  for (const v of vendors) docs.push({ name: `VENDOR-${v.id.replace("-", "")}-registration.txt`, content: rVendorReg(v) });
  // employees
  for (const e of employees) docs.push({ name: `HR-${e.id.replace("-", "")}-record.txt`, content: rEmployee(e) });
  // invoices
  for (const inv of invoices) docs.push({ name: `${inv.voucher}.txt`, content: rInvoice(inv, byId.get(inv.vendorId)!) });
  // purchase orders
  for (const po of pos) docs.push({ name: `${po.po}.txt`, content: rPurchaseOrder(po, byId.get(po.vendorId)!) });

  // bank statements (running balance)
  let opening = 5200000;
  for (const month of FY_MONTHS) {
    const { text, closing } = rBankStatement(month, events, opening);
    docs.push({ name: `BANK-STMT-${month}.txt`, content: text });
    opening = closing;
  }
  // payroll registers
  for (const month of FY_MONTHS) docs.push({ name: `PAYROLL-${month}.txt`, content: rPayroll(month, payrollByMonth[month]) });

  // credit notes
  const crRevVendor = byId.get("V-006")!;
  docs.push({ name: "CREDIT-NOTE-CR-1042.txt", content: rCreditNote("CR-1042", "2025-07-12", crRevVendor, 41300, "Duplicate payment identified during weekly bank reconciliation; second payment reversed.", "Duplicate of July invoice payment", "E-003") });
  docs.push({ name: "CREDIT-NOTE-CR-1051.txt", content: rCreditNote("CR-1051", "2025-10-18", byId.get("V-009")!, rng.amount(8000, 22000), "Short delivery - 6 cartons damaged in transit, credit against invoice.", "Goods return / short delivery", "E-007") });
  docs.push({ name: "CREDIT-NOTE-CR-1063.txt", content: rCreditNote("CR-1063", "2026-01-09", byId.get("V-014")!, rng.amount(5000, 15000), "Price correction - rate revised per renegotiated annual contract.", "Rate correction", "E-003") });
  docs.push({ name: "CREDIT-NOTE-CR-1078.txt", content: rCreditNote("CR-1078", "2026-02-22", byId.get("V-022")!, rng.amount(4000, 12000), "Quality rejection - batch failed incoming QC, returned to vendor.", "QC rejection", "E-010") });

  // board minutes (8)
  const capexVendorName = byId.get("V-020")!.name;
  const boards: { file: string; date: string; title: string; body: string[] }[] = [
    { file: "BOARD-MINUTES-2025-04", date: "2025-04-08", title: "1. Approval of Annual Operating Plan FY 2025-26", body: [
      "The Board reviewed and approved the annual operating plan and procurement",
      "budget of $4.2 million for FY 2025-26. The single-signature payment approval",
      `limit for managers was reaffirmed at ${rupee(APPROVAL_THRESHOLD)}; amounts at or above this`,
      "threshold require co-signature by the Finance Controller."] },
    { file: "BOARD-MINUTES-2025-05", date: "2025-05-14", title: "2. Banking Resolution", body: [
      "RESOLVED that the JPMorgan Chase operating account (****8842) continue as the",
      "principal operating account. Check signatories: Managing Director and",
      "Finance Controller jointly for amounts above $100,000."] },
    { file: "BOARD-MINUTES-2025-06", date: "2025-06-11", title: "3. Warehouse Lease Renewal", body: [
      "The Newark warehouse & office lease was renewed for 24 months at a",
      "monthly rent of $165,000. Operations Head authorised to execute the deed."] },
    { file: "BOARD-MINUTES-2025-07", date: "2025-07-16", title: "4. Q1 Review", body: [
      "Q1 FY26 revenue of $3.1 million noted, marginally ahead of plan. The Finance",
      "Controller reported a duplicate vendor payment caught in weekly reconciliation",
      "and reversed via credit note; controls deemed adequate."] },
    { file: "BOARD-MINUTES-2025-08", date: "2025-08-20", title: "5. Capital Expenditure - Packaging Line Upgrade", body: [
      `RESOLVED that capital expenditure of ${rupee(250000)} for a semi-automatic carton`,
      `sealing & packaging line from ${capexVendorName} (Vendor V-020) is APPROVED,`,
      "to be executed under PO-77001 in September 2025. Proposed by the Operations",
      "Head, seconded by the Finance Controller. Carried unanimously."] },
    { file: "BOARD-MINUTES-2025-11", date: "2025-11-19", title: "6. H1 Performance & Credit Policy", body: [
      "Half-year results reviewed. The Board approved extending 30-day credit terms",
      "to two new distribution customers subject to credit checks."] },
    { file: "BOARD-MINUTES-2026-01", date: "2026-01-13", title: "7. Headcount & Budget Reforecast", body: [
      "The Board noted the reforecast for H2 FY26 and approved backfilling two",
      "operations roles. HR to complete onboarding documentation for new joiners."] },
    { file: "BOARD-MINUTES-2026-03", date: "2026-03-24", title: "8. Year-End & Statutory Audit Appointment", body: [
      "The Board resolved to appoint Harmon & Wells LLP, Independent Auditors,",
      "for the FY 2025-26 statutory audit and directed management to prepare books",
      "for review."] },
  ];
  for (const b of boards) docs.push({ name: `${b.file}.txt`, content: rBoardMinutes(b) });

  /* --------------------------- ground truth ---------------------------- */
  const e007 = employees[6];
  const e015 = employees[14];
  const shell = byId.get("V-031")!;
  const shellTotal = invoices.filter((i) => i.tag === "shell").reduce((a, i) => a + i.total, 0);
  const shellVouchers = invoices.filter((i) => i.tag === "shell").map((i) => i.voucher!);
  const dupRealInv = invoices.find((i) => i.tag === "dup_real")!;
  const ghostMonths = FY_MONTHS.filter((m) => e015.joined <= `${m}-28`);

  const manifest: any = {
    company: CO.name,
    fiscalYear: "2025-26 (Apr 2025 - Mar 2026)",
    seed: 90210,
    generatedAt: new Date().toISOString().slice(0, 10),
    docCounts: {},
    approvalThreshold: APPROVAL_THRESHOLD,
    schemes: [
      {
        id: "scheme_1_shell_company",
        type: "shell_company",
        severity: "high",
        primary: true,
        entities: { vendorId: "V-031", vendorName: shell.name, employeeId: "E-007", employeeName: e007.name },
        amount: shellTotal,
        invoiceCount: shellVouchers.length,
        proofDocs: ["VENDOR-V031-registration.txt", "HR-E007-record.txt", ...shellVouchers.map((v) => `${v}.txt`)],
        exactMatchProofs: [
          { claim: "shell vendor registered address == employee E-007 home address", string: FRAUDSTER_HOME, appearsIn: ["VENDOR-V031-registration.txt", "HR-E007-record.txt"] },
          { claim: "shell vendor has no tax ID", string: "Tax ID             : [NOT PROVIDED]", appearsIn: ["VENDOR-V031-registration.txt"] },
          { claim: "every shell invoice approved by E-007", string: "Approved for payment by: E-007 (Ethan Brooks)", appearsIn: shellVouchers.map((v) => `${v}.txt`) },
        ],
        tells: ["reg address == E-007 home", "no tax ID", "zero POs on any invoice", "single approver E-007", "sequential vendor invoice numbers ZPL/25-26/041..054", "amounts hug the $25,000 single-approver threshold", "vague 'consulting & procurement support'"],
      },
      {
        id: "scheme_2_ghost_employee",
        type: "ghost_employee",
        severity: "high",
        entities: { ghostEmployeeId: "E-015", ghostName: e015.name, colludingEmployeeId: "E-007", colludingName: e007.name },
        monthlySalary: e015.salary,
        activeMonths: ghostMonths,
        amount: e015.salary * ghostMonths.length,
        proofDocs: ["HR-E015-record.txt", "HR-E007-record.txt", "PAYROLL-2026-01.txt", "PAYROLL-2026-02.txt", "PAYROLL-2026-03.txt"],
        exactMatchProofs: [
          { claim: "ghost E-015 salary account == fraudster E-007 salary account", string: FRAUDSTER_ACCOUNT, appearsIn: ["HR-E015-record.txt", "HR-E007-record.txt", "PAYROLL-2026-01.txt"] },
          { claim: "ghost has no company email", string: "Company Email      : [not on file]", appearsIn: ["HR-E015-record.txt"] },
        ],
        tells: ["salary account identical to E-007", "joined 2026-01-05 (weeks before year-end)", "no email", "no approvals / no invoices / no other footprint", "generic 'Data Entry Operator' role", "reports to E-007"],
      },
      {
        id: "scheme_3_duplicate_payment_real",
        type: "duplicate_payment",
        severity: "medium",
        entities: { vendorId: "V-018", vendorName: byId.get("V-018")!.name, invoice: dupRealInv.voucher },
        amount: dupRealInv.total,
        note: "Legit vendor invoice paid TWICE within 3 days and NEVER reversed - real cash loss.",
        proofDocs: [`${dupRealInv.voucher}.txt`, `${dupProof.statement}.txt`],
        exactMatchProofs: [
          { claim: "same invoice debited twice, no reversal", string: `NEFT ${byId.get("V-018")!.name} - ${dupRealInv.voucher}`, appearsIn: [`${dupProof.statement}.txt`], occurrences: 2, dates: dupProof.dates, amountEach: dupProof.amount },
        ],
      },
    ],
    redHerrings: [
      {
        id: "herring_4_duplicate_reversed",
        type: "duplicate_payment_reversed",
        verdict: "NOT fraud - accounting correction",
        entities: { vendorId: "V-006", vendorName: byId.get("V-006")!.name },
        amount: 41300,
        clearingDocs: ["CREDIT-NOTE-CR-1042.txt", "BANK-STMT-2025-07.txt", "BOARD-MINUTES-2025-07.txt"],
        explanation: "Paid twice on 2025-07-08 & 2025-07-09, then reversed by CR-1042 on 2025-07-12 (3 days later). Caught in weekly reconciliation; no net loss.",
      },
      {
        id: "herring_5_round_capex_authorized",
        type: "large_round_capex",
        verdict: "NOT fraud - fully authorised capital purchase",
        entities: { vendorId: "V-020", vendorName: capexVendorName },
        amount: 250000,
        clearingDocs: ["PO-77001.txt", "BOARD-MINUTES-2025-08.txt"],
        explanation: "Large round $250,000 to a legit vendor, but backed by PO-77001 and explicitly authorised in the August 2025 board minutes.",
      },
    ],
  };

  // doc counts by type
  const counts: Record<string, number> = {
    vendorRegistrations: vendors.length,
    invoices: invoices.length,
    hrRecords: employees.length,
    bankStatements: FY_MONTHS.length,
    payrollRegisters: FY_MONTHS.length,
    purchaseOrders: pos.length,
    boardMinutes: boards.length,
    creditNotes: 4,
  };
  manifest.docCounts = counts;

  /* ----------------------------- write ---------------------------------- */
  // portable: resolve relative to this file so it works on any host (dev Mac + VM)
  const HERE = dirname(fileURLToPath(import.meta.url));                 // datagen/src
  const OUT_DIRS = [
    join(homedir(), "Desktop", "Kestrel Manufacturing Inc"),           // demo folder (answer key removed post-gen)
    join(HERE, "..", "data", "out", "corpus2"),                        // datagen/data/out/corpus2 (test copy)
  ];
  for (const dir of OUT_DIRS) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const d of docs) writeFileSync(join(dir, d.name), d.content, "utf8");
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  }

  /* --------------------------- summary ---------------------------------- */
  const total = docs.length + 1; // + manifest
  console.log(`\n${rule("=")}`);
  console.log(`VERITAS demo corpus - ${CO.name}, FY 2025-26 (seed 90210)`);
  console.log(rule("="));
  const rows: [string, number][] = [
    ["Vendor registrations", counts.vendorRegistrations],
    ["Invoices", counts.invoices],
    ["HR / employee records", counts.hrRecords],
    ["Bank statements", counts.bankStatements],
    ["Payroll registers", counts.payrollRegisters],
    ["Purchase orders", counts.purchaseOrders],
    ["Board minutes", counts.boardMinutes],
    ["Credit notes", counts.creditNotes],
    ["manifest.json (ground truth)", 1],
  ];
  for (const [k, n] of rows) console.log(`  ${pad(k, 34)} ${padL(String(n), 4)}`);
  console.log(rule("-"));
  console.log(`  ${pad("TOTAL readable docs", 34)} ${padL(String(docs.length), 4)}`);
  console.log(`  ${pad("TOTAL files (incl. manifest)", 34)} ${padL(String(total), 4)}`);
  console.log(rule("="));
  console.log("Planted schemes (ground truth in manifest.json only):");
  console.log(`  1. SHELL      V-031 Zenith Procurement LLC - ${invoices.filter((i) => i.tag === "shell").length} invoices - ${rupee(shellTotal)}`);
  console.log(`     exact match: "${FRAUDSTER_HOME}" in VENDOR-V031-registration.txt & HR-E007-record.txt`);
  console.log(`  2. GHOST      E-015 Nina Fischer - salary ${rupee(e015.salary)}/mo`);
  console.log(`     exact match: "${FRAUDSTER_ACCOUNT}" in HR-E015-record.txt & HR-E007-record.txt`);
  console.log(`  3. DUPLICATE  ${dupRealInv.voucher} to ${byId.get("V-018")!.name} - ${rupee(dupRealInv.total)} paid twice, NOT reversed`);
  console.log(`     exact match: "NEFT ${byId.get("V-018")!.name} - ${dupRealInv.voucher}" appears 2x in ${dupProof.statement}.txt`);
  console.log("Red herrings (must be cleared):");
  console.log(`  4. REVERSED dup ${rupee(41300)} to ${byId.get("V-006")!.name} -> CREDIT-NOTE-CR-1042.txt`);
  console.log(`  5. ROUND CAPEX  ${rupee(250000)} to ${capexVendorName} -> PO-77001.txt + BOARD-MINUTES-2025-08.txt`);
  console.log(rule("="));
  console.log("Output written to:");
  for (const d of OUT_DIRS) console.log(`  ${d}`);
  console.log("");
}

main();
