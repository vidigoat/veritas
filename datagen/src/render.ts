/**
 * Document renderers — structured text with realistic noise.
 * Every doc gets a docId; the agent cites these IDs in findings.
 */
import type { Txn } from "./ledger.js";
import type { Vendor, Employee } from "./world.js";
import type { Rng } from "./rng.js";

export function renderInvoice(txn: Txn, vendor: Vendor, rng: Rng): string {
  const gross = txn.amount;
  const base = Math.round((gross / 1.18) * 100) / 100;
  const tax = Math.round((gross - base) * 100) / 100;
  return [
    `${vendor.name.toUpperCase()}`,
    `${vendor.address}`,
    vendor.taxId ? `GSTIN: ${vendor.taxId}` : `GSTIN: [not provided]`,
    ``,
    `TAX INVOICE`,
    `Invoice No: ${txn.docId}`,
    `Date: ${txn.date}`,
    `Bill To: Meridian Traders Pvt Ltd, 88 Industrial Estate, Bhiwandi 421302`,
    ``,
    `Description: ${txn.memo}`,
    txn.po ? `Purchase Order: ${txn.po}` : `Purchase Order: —`,
    ``,
    `Amount: ${base.toFixed(2)}`,
    `GST (18%): ${tax.toFixed(2)}`,
    `TOTAL: ${gross.toFixed(2)}`,
    ``,
    `Payment terms: Net ${rng.pick([15, 30, 45])}`,
    `Bank: ${vendor.bankAccount}`,
  ].join("\n");
}

export function renderVendorRegistration(v: Vendor): string {
  return [
    `VENDOR MASTER RECORD`,
    `Vendor ID: ${v.id}`,
    `Registered Name: ${v.name}`,
    `Registered Address: ${v.address}`,
    `GSTIN: ${v.taxId ?? "[not provided]"}`,
    `Bank Account (masked): ${v.bankAccount}`,
    `Category: ${v.category}`,
    `Onboarded: ${v.onboarded}`,
  ].join("\n");
}

export function renderEmployeeFile(e: Employee): string {
  return [
    `EMPLOYEE RECORD (HR CONFIDENTIAL)`,
    `Employee ID: ${e.id}`,
    `Name: ${e.name}`,
    `Role: ${e.role}`,
    `Home Address: ${e.homeAddress}`,
    `Date of Joining: ${e.joined}`,
  ].join("\n");
}

export function renderBankStatementMonth(month: string, txns: Txn[]): string {
  const rows = txns.filter(t => t.date.startsWith(month));
  const lines = rows.map(t => `${t.date}  ${t.txnId}  ${t.amount < 0 ? "CR" : "DR"}  ${Math.abs(t.amount).toFixed(2)}  ${t.memo.slice(0, 48)}`);
  return [`MERIDIAN TRADERS PVT LTD — BANK STATEMENT ${month}`, `Account: XX88276351`, ``, ...lines].join("\n");
}

export function renderBoardMinutes(): string {
  return [
    `MERIDIAN TRADERS PVT LTD — MINUTES OF BOARD MEETING`,
    `Doc: BOARD-MIN-2025-08 · Date: 2025-08-20`,
    ``,
    `RESOLVED: capital expenditure of 250,000.00 for the packaging line`,
    `upgrade (vendor: Falcon Systems, V-020) is APPROVED, to be executed`,
    `under PO-77001 in September 2025. Proposed by Operations Head,`,
    `seconded by Finance Controller. Carried unanimously.`,
  ].join("\n");
}

export function renderCreditNote(dupTxnId: string, amount: number, vendorName: string): string {
  return [
    `CREDIT NOTE / REVERSAL RECORD`,
    `Doc: CR-${dupTxnId}`,
    `Reference: duplicate payment ${dupTxnId} to ${vendorName}`,
    `Amount reversed: ${amount.toFixed(2)}`,
    `Reason: duplicate entry identified during weekly reconciliation.`,
    `Approved by: Finance Controller (E-003)`,
  ].join("\n");
}
