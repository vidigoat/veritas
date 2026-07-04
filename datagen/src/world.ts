/**
 * The Meridian world: entities + honest business activity.
 *
 *  vendors(47) ──invoices──▶ ledger(≈5,000 txns, FY 2025-26)
 *  employees(18) ──approve──▶ txns      revenue/payroll/rent fill the rest
 */
import type { Rng } from "./rng.js";

const FIRST = ["Rohan","Priya","Aditya","Sneha","Vikram","Ananya","Karan","Divya","Rajesh","Meera","Arjun","Pooja","Sanjay","Nisha","Amit","Ritu","Deepak","Kavya","Rahul","Shreya"];
const LAST = ["Sharma","Mehta","Patel","Iyer","Gupta","Reddy","Nair","Singh","Joshi","Desai","Kulkarni","Chopra","Bose","Rao","Malhotra"];
const VENDOR_A = ["Apex","Zenith","Crest","Summit","Pioneer","Vertex","Orion","Stellar","Cascade","Meridian","Horizon","Quantum","Falcon","Everest","Lotus","Sapphire","Titan","Nova","Delta","Prism"];
const VENDOR_B = ["Supplies","Logistics","Industries","Solutions","Traders","Enterprises","Materials","Services","Freight","Packaging","Systems","Components","Textiles","Chemicals","Print Works"];
const STREETS = ["MG Road","Linking Road","SV Road","Hill Road","Carter Road","Juhu Tara Road","LBS Marg","Andheri Kurla Road","Palm Beach Road","Sion Trombay Road","Ghodbunder Road","FC Road"];
const CITIES = ["Mumbai 400001","Mumbai 400050","Thane 400601","Navi Mumbai 400703","Pune 411001","Mumbai 400069"];
const ACCOUNTS = ["Raw Materials","Packaging","Freight & Logistics","Office Supplies","Professional Services","Facilities Maintenance","IT & Software","Marketing","Utilities","Travel","Equipment"];

export interface Employee { id: string; name: string; role: string; homeAddress: string; joined: string }
export interface Vendor { id: string; name: string; address: string; taxId: string | null; bankAccount: string; onboarded: string; category: string }

export function makeAddress(rng: Rng): string {
  return `${rng.int(1, 420)} ${rng.pick(STREETS)}, ${rng.pick(CITIES)}`;
}

export function makeEmployees(rng: Rng, n = 18): Employee[] {
  const roles = ["Procurement Manager","Accounts Payable Clerk","Finance Controller","Operations Head","Warehouse Supervisor","Sales Manager","HR Manager","Quality Lead","Logistics Coordinator","Admin Executive"];
  return Array.from({ length: n }, (_, i) => ({
    id: `E-${String(i + 1).padStart(3, "0")}`,
    name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
    role: i < roles.length ? roles[i] : rng.pick(roles),
    homeAddress: makeAddress(rng),
    joined: `20${rng.int(18, 24)}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`,
  }));
}

export function makeVendors(rng: Rng, n = 46): Vendor[] {
  const used = new Set<string>();
  return Array.from({ length: n }, (_, i) => {
    let name = "";
    do { name = `${rng.pick(VENDOR_A)} ${rng.pick(VENDOR_B)}`; } while (used.has(name));
    used.add(name);
    return {
      id: `V-${String(i + 1).padStart(3, "0")}`,
      name,
      address: makeAddress(rng),
      taxId: `27${rng.int(10000, 99999)}${rng.int(10000, 99999)}C`,
      bankAccount: `XX${rng.int(100000, 999999)}`,
      onboarded: `20${rng.int(19, 24)}-${String(rng.int(1, 12)).padStart(2, "0")}-01`,
      category: rng.pick(ACCOUNTS),
    };
  });
}
export { ACCOUNTS };
