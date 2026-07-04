/**
 * FRAUD KNOWLEDGE BASE — the intellectual core of VERITAS.
 *
 * This module makes the agent a genuine fraud expert. It encodes the ACFE
 * occupational-fraud framework (the "fraud tree"), per-scheme forensic specs,
 * the examiner's disconfirming method, and the extraction/investigation
 * guidance that the map, detect, and deep-dive stages consume.
 *
 * Design principles (match prompts.ts):
 *   • Try to EXONERATE before you accuse — falsification is a finding.
 *   • Rule out five innocent causes before any fraud verdict.
 *   • Confidence = MIN of supporting claims; file only ≥ 0.7.
 *   • Cite or abstain; dollar figures come from the ledger, never arithmetic.
 *   • Verdicts are exactly three: CONFIRMED / CLEARED / UNPROVEN.
 *
 * Pure data + strings. No runtime dependencies.
 */
import type { SchemeClass, DocType } from "./contracts.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. THE ACFE OCCUPATIONAL-FRAUD TREE
// ─────────────────────────────────────────────────────────────────────────────
// Occupational fraud = the use of one's occupation for personal enrichment
// through the deliberate misuse or misapplication of the employing
// organization's resources or assets. The ACFE classifies it into three
// primary branches. Asset misappropriation is the most common (~86% of cases,
// lowest median loss); financial-statement fraud is the rarest but costliest;
// corruption sits in between. VERITAS reasons across all three.

export interface FraudTreeNode {
  key: string;
  label: string;
  gist: string;
  schemes?: SchemeClass[]; // which SchemeClass values live under this node
  children?: FraudTreeNode[];
}

export const FRAUD_TREE: {
  overview: string;
  branches: FraudTreeNode[];
} = {
  overview:
    "The ACFE occupational-fraud tree has three primary branches: CORRUPTION " +
    "(the fraudster uses influence in a business transaction to gain an " +
    "unauthorized benefit — conflicts of interest, bribery, illegal " +
    "gratuities, economic extortion), ASSET MISAPPROPRIATION (theft or misuse " +
    "of the organization's assets — the broad cash and non-cash subtree), and " +
    "FINANCIAL STATEMENT FRAUD (deliberate misstatement of the financial " +
    "reports themselves). Asset misappropriation is by far the most frequent " +
    "and financial-statement fraud the most expensive per incident. Every " +
    "scheme VERITAS names maps onto a leaf of this tree.",
  branches: [
    {
      key: "corruption",
      label: "Corruption",
      gist:
        "An insider wields their position to influence a transaction against " +
        "the employer's interest for private gain. Two parties collude, so it " +
        "rarely shows as a clean books discrepancy — it shows as biased " +
        "decisions (steered contracts, above-market prices, no competitive " +
        "bids) and off-book value transfers.",
      schemes: ["kickback"],
      children: [
        {
          key: "conflict_of_interest",
          label: "Conflicts of Interest",
          gist:
            "An employee has an undisclosed economic interest in a " +
            "transaction (e.g., secretly owns/controls a vendor). Detected via " +
            "related-party links: shared address, phone, surname, or bank " +
            "account between an insider and a counterparty.",
          schemes: ["kickback", "shell_company"],
        },
        {
          key: "bribery_kickbacks",
          label: "Bribery & Kickbacks",
          gist:
            "A vendor pays an employee (cash, gifts, a cut of overbillings) to " +
            "steer business or approve fraudulent invoices. Funded by inflated " +
            "prices; the overcharge is the kickback.",
          schemes: ["kickback"],
        },
        {
          key: "illegal_gratuities_extortion",
          label: "Illegal Gratuities & Economic Extortion",
          gist:
            "A reward given for a decision already made (gratuity), or a demand " +
            "for payment as a condition of a favorable decision (extortion).",
          schemes: ["kickback"],
        },
      ],
    },
    {
      key: "asset_misappropriation",
      label: "Asset Misappropriation",
      gist:
        "Theft or misuse of company assets. Splits into CASH schemes and " +
        "NON-CASH schemes. Cash is where most fraud lives, and fraudulent " +
        "disbursements (money leaving through the accounts-payable / payroll " +
        "pipeline) are the leaf VERITAS scrutinizes hardest.",
      children: [
        {
          key: "cash_receipts",
          label: "Cash Receipts (Skimming & Cash Larceny)",
          gist:
            "Stealing incoming cash. SKIMMING removes cash before it is " +
            "recorded (an off-book theft — hard to see in the ledger; look for " +
            "missing revenue, lapping of receivables). CASH LARCENY removes " +
            "cash already recorded (an on-book theft — shows as a shortage).",
          schemes: ["other"],
        },
        {
          key: "fraudulent_disbursements",
          label: "Fraudulent Disbursements",
          gist:
            "Money leaves the company through an apparently legitimate " +
            "channel that the fraudster controls. The five classic sub-schemes " +
            "below are the heart of a payables examination.",
          children: [
            {
              key: "billing",
              label: "Billing Schemes",
              gist:
                "Payments made against fraudulent invoices — a fake or " +
                "controlled vendor (shell company), a pass-through markup, or a " +
                "personal purchase run through AP. The most common disbursement " +
                "scheme by loss.",
              schemes: ["shell_company", "duplicate_payment", "threshold_evasion"],
            },
            {
              key: "payroll",
              label: "Payroll Schemes",
              gist:
                "Wages paid to a ghost employee, or via falsified hours/rates " +
                "or commission. Perpetrator usually sits in HR or payroll.",
              schemes: ["ghost_employee"],
            },
            {
              key: "expense_reimbursement",
              label: "Expense Reimbursement Schemes",
              gist:
                "Inflated, fictitious, mischaracterized, or double-claimed " +
                "employee expenses.",
              schemes: ["expense_fraud"],
            },
            {
              key: "check_tampering",
              label: "Check Tampering",
              gist:
                "Forged maker/endorsement, altered payee, or intercepted " +
                "checks. In a digital book this surfaces as payee mismatches " +
                "and out-of-sequence or altered payment instruments.",
              schemes: ["other"],
            },
            {
              key: "register_disbursements",
              label: "Register Disbursements",
              gist:
                "False refunds or voided sales at the point of sale that " +
                "release cash from the register.",
              schemes: ["other"],
            },
          ],
        },
        {
          key: "non_cash",
          label: "Non-Cash Misappropriation",
          gist:
            "Misuse or larceny of inventory, equipment, information, or other " +
            "non-cash assets.",
          schemes: ["other"],
        },
      ],
    },
    {
      key: "financial_statement_fraud",
      label: "Financial Statement Fraud",
      gist:
        "Deliberate misstatement of the financial statements — usually to " +
        "overstate net worth or net income (fictitious revenues, concealed " +
        "liabilities/expenses, improper asset valuations, timing differences, " +
        "improper disclosures) but sometimes to understate (tax or bonus " +
        "smoothing). Detected via top-side journal entries, period-end round " +
        "adjustments, unsupported estimates, and related-party revenue.",
      schemes: ["other"],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. PER-SCHEME FORENSIC SPECS
// ─────────────────────────────────────────────────────────────────────────────
// detectionSignals are written to be CONCRETE and COMPUTABLE against the
// Extracted contract (vendors, employees, transactions, payments, payroll).
// innocentExplanations are the exoneration checklist — evidence for any of
// these should CLEAR or at least hold the anomaly at UNPROVEN.

export interface SchemeSpec {
  name: string;
  /** ACFE placement + one-sentence definition. */
  definition: string;
  /** The mechanics: how a fraudster actually executes it. */
  howItWorks: string;
  /** Human-noticeable warning signs. */
  redFlags: string[];
  /** Concrete, computable predicates over the extracted corpus. */
  detectionSignals: string[];
  /** What would EXONERATE the suspect — the rule-out checklist. */
  innocentExplanations: string[];
  /** What, if present, drives the verdict toward CONFIRMED. */
  confirmDrivers: string[];
  /** Document types that typically settle the question. */
  typicalEvidence: string[];
}

export const SCHEMES: Record<SchemeClass, SchemeSpec> = {
  shell_company: {
    name: "Shell-company billing scheme",
    definition:
      "A fraudulent-disbursement / billing scheme (asset misappropriation, " +
      "often overlapping a conflict of interest) in which an employee creates " +
      "or controls a fictitious vendor and causes the company to pay for goods " +
      "or services that were never delivered.",
    howItWorks:
      "The insider registers a shell entity — frequently with a name that " +
      "echoes a real supplier — opens a bank account they control, and submits " +
      "invoices into accounts payable. They route or self-approve the invoices " +
      "below the threshold that would trigger scrutiny, and the cash flows to " +
      "the account they own. A 'pass-through' variant buys real goods cheaply " +
      "and re-bills the company at a markup, so some delivery evidence exists.",
    redFlags: [
      "Vendor has no verifiable physical presence — PO box, residential, or a mail-drop address",
      "Vendor address, phone, or email domain coincides with an employee's",
      "Missing, invalid, or recently issued tax ID; vendor onboarded mid-year yet high spend",
      "Invoices to this company are strictly sequential (we appear to be the vendor's only client)",
      "Round-dollar invoice amounts and amounts clustered just under an approval limit",
      "A single person originates and approves every payment; no purchase order on file",
      "Payments land in a personal-looking account or one shared with an employee",
    ],
    detectionSignals: [
      "vendor.address === employee.address (cross_reference on 'address')",
      "vendor.bankAccount === employee.bankAccount (cross_reference on 'bank_account')",
      "vendor.taxId is missing OR fails checksum/format validation",
      "transactions filtered to vendorId have strictly sequential invoiceNo values",
      "every transaction for the vendor shares the same single approver",
      "no purchase_order document references the vendor's invoices (po === null)",
      "invoice amounts fall in (approvalThreshold * 0.9, approvalThreshold)",
      "vendor.onboarded is within the fiscal year AND cumulative spend is high",
      "vendor email domain or phone matches an employee record",
    ],
    innocentExplanations: [
      "The address is a shared coworking / business-center used by many legitimate tenants",
      "The vendor is a genuine sole proprietor working from a home office and is NOT an employee",
      "Purchase orders exist but were filed under a different document or PO series",
      "A real, small, newly onboarded supplier whose invoices are sequential because we are an early client",
      "Delivery is verifiable — goods received, service rendered, tickets/logs exist",
    ],
    confirmDrivers: [
      "Address or bank-account match to an insider AND no evidence any good/service was delivered",
      "The originating employee also approves the payments (self-dealing loop)",
      "Multiple independent signals corroborate (address + bank + no PO + sequential invoices)",
    ],
    typicalEvidence: [
      "vendor_registration",
      "employee_record",
      "invoice",
      "bank_statement (the outbound disbursement)",
      "purchase_order (its ABSENCE is itself evidence)",
      "ledger",
    ],
  },

  ghost_employee: {
    name: "Ghost-employee payroll scheme",
    definition:
      "A payroll fraud (fraudulent disbursement) in which wages are paid to " +
      "someone who does not work for the company — a fabricated identity or a " +
      "terminated/never-real employee — and the perpetrator diverts the pay.",
    howItWorks:
      "Someone with payroll or HR access adds a fake worker to the roster (or " +
      "leaves a terminated one active), directs the salary to a bank account " +
      "they control, and collects each pay run. The ghost frequently shares a " +
      "bank account or home address with the perpetrator, and lacks the normal " +
      "footprint of a real employee (email, benefits deductions, org-chart " +
      "presence, performance records).",
    redFlags: [
      "Employee has no tax withholding or benefits/insurance deductions",
      "No email account, login activity, or presence on the org chart",
      "Bank account is shared with another employee",
      "Home address identical to another employee's",
      "No onboarding documentation; salary paid but no manager or performance record",
      "Added to payroll shortly after a specific person gained roster access",
      "Continues to be paid past a termination date",
    ],
    detectionSignals: [
      "employee.bankAccount === anotherEmployee.bankAccount (duplicate bank across payroll rows)",
      "payroll.empId is not present in the employee master file",
      "employee.address === anotherEmployee.address",
      "employee.email is missing while peers in the same role have one",
      "employee.manager is missing / employee absent from board_minutes / org records",
      "payroll disbursements continue after the employee's termination date",
      "salary amount identical across unrelated employees sharing an account",
    ],
    innocentExplanations: [
      "A married couple or relatives who legitimately share a bank account or address",
      "A contractor legitimately paid through a separate system, hence thin HR footprint",
      "A genuine new hire whose email/benefits have simply not been provisioned yet",
      "An employee on leave still correctly on payroll",
      "A data-entry error duplicating a bank account that is corrected elsewhere",
    ],
    confirmDrivers: [
      "No evidence the person exists (no email, no org presence, no work product) AND pay routed to another employee's account",
      "The employee who receives/controls the account also created or approves the ghost's payroll",
      "Payments continue after a documented termination with no offsetting reversal",
    ],
    typicalEvidence: [
      "employee_record",
      "payroll",
      "bank_statement (where the salary lands)",
      "board_minutes / org records",
    ],
  },

  duplicate_payment: {
    name: "Duplicate payment",
    definition:
      "The same liability paid more than once — same vendor, same amount, " +
      "same (or trivially altered) invoice — arising either from control error " +
      "or from deliberate exploitation of weak duplicate detection.",
    howItWorks:
      "An invoice is entered twice (the copy plus the original), or the same " +
      "invoice is paid against two purchase orders, or a vendor resubmits. The " +
      "fraudulent variant deliberately re-enters an invoice with a tiny change " +
      "— a suffixed number, extra whitespace, a different payment method — to " +
      "defeat the AP system's duplicate check, and the perpetrator captures the " +
      "second disbursement.",
    redFlags: [
      "Identical vendor + amount + date appearing twice",
      "The same invoice number recorded twice",
      "Near-identical invoice numbers (INV-100 vs INV-100A, or with added whitespace)",
      "Two payments to one vendor within a few days for the same amount",
      "One payment by check and one by transfer for the same invoice",
    ],
    detectionSignals: [
      "two transactions with equal vendorId && amount && invoiceNo",
      "two transactions with equal vendorId && amount within N days of each other",
      "invoiceNo values differ only by a suffix, case, or whitespace",
      "the same amount paid via two different accounts or payment methods",
      "no credit_note or reversal offsets the second payment",
    ],
    innocentExplanations: [
      "A legitimate recurring charge of a fixed amount (rent, a subscription, a retainer)",
      "A deposit and a balance payment that happen to be equal",
      "The first payment was reversed or refunded — a control CATCH, not a loss (CLEAR it)",
      "One invoice legitimately split into two scheduled payments",
      "Two genuinely distinct deliveries that carry the same price",
    ],
    confirmDrivers: [
      "The same invoice paid twice with NO reversal or credit note offsetting it",
      "The second payment altered just enough to evade duplicate detection, then not refunded",
      "The net cash out exceeds the single genuine liability, confirmed from the ledger",
    ],
    typicalEvidence: [
      "invoice (both instances)",
      "ledger",
      "bank_statement (both disbursements)",
      "credit_note (its ABSENCE confirms the second payment stuck)",
    ],
  },

  threshold_evasion: {
    name: "Threshold evasion (structuring)",
    definition:
      "Splitting or shaping transactions to stay just below an approval, " +
      "authorization, or reporting limit so they escape the higher level of " +
      "scrutiny that the full amount would trigger.",
    howItWorks:
      "A purchase that should require senior sign-off — say, anything over a " +
      "$10,000 limit — is fragmented into several invoices or POs each priced " +
      "just under the limit, or spread across dates or vendors. The tell is a " +
      "cluster of amounts hugging the underside of a known threshold, well " +
      "above what a natural (Benford) distribution would produce.",
    redFlags: [
      "Many invoice amounts at 9,xxx when the approval limit is 10,000",
      "Multiple same-day invoices to one vendor that individually clear the limit but jointly exceed it",
      "Amounts repeatedly at 95-99% of a known threshold",
      "Fragmentation across sequential invoice numbers for one purchase",
    ],
    detectionSignals: [
      "amount within (threshold * 0.9, threshold) at high frequency",
      "count of transactions in [0.9*T, T) far exceeds the Benford/expected share",
      "sum of same-vendor, same-day (or same-PO-intent) invoices > threshold while each < threshold",
      "a specific just-below value (e.g., 9,900) recurs across invoices",
    ],
    innocentExplanations: [
      "The company's genuine unit price naturally sits below the limit",
      "Partial deliveries legitimately invoiced as they arrive",
      "The assumed threshold is wrong — the real approval limit is elsewhere",
      "A run of unrelated small purchases that only look clustered in aggregate",
    ],
    confirmDrivers: [
      "A single procurement deliberately fragmented — same vendor, date, and purpose — each piece under the limit",
      "Combined value would have required a higher approval that was thereby avoided",
      "The splitter is the same person who benefits from avoiding scrutiny",
    ],
    typicalEvidence: [
      "invoice (the clustered set)",
      "purchase_order",
      "board_minutes / policy (the actual approval thresholds)",
      "ledger",
    ],
  },

  expense_fraud: {
    name: "Expense-reimbursement fraud",
    definition:
      "A reimbursement scheme (fraudulent disbursement) in which an employee " +
      "inflates, fabricates, mischaracterizes, or double-claims business " +
      "expenses.",
    howItWorks:
      "The fraudster submits fictitious expenses backed by fake or altered " +
      "receipts, overstates real amounts, claims personal spending as business, " +
      "or re-submits the same receipt more than once. Signatures of the scheme " +
      "are round numbers, missing or duplicated receipts, amounts just under a " +
      "receipt-required limit, and charges on weekends or near the claimant's " +
      "home.",
    redFlags: [
      "Round-dollar claims at high frequency",
      "Missing or duplicated receipts",
      "Claims just below the receipt-required threshold",
      "Expenses dated on weekends/holidays or at the claimant's home location",
      "Sequential, altered, or reused receipts",
      "Claimant and approver are the same person",
    ],
    detectionSignals: [
      "expense.amount is round (amount % 50 === 0 or % 100 === 0) at anomalous frequency",
      "same receipt/amount + date claimed more than once",
      "amount just below a receipt-required threshold",
      "claim date falls on a weekend or public holiday",
      "vendor/merchant location != the claimed travel location",
      "claimant === approver on the reimbursement",
    ],
    innocentExplanations: [
      "Legitimately round costs — per-diems, flat cab or toll fares, corporate-rate hotels",
      "A resubmission after a previously rejected claim (net paid once)",
      "A pre-approved expense that merely looks personal",
      "A genuine weekend business trip or client dinner",
    ],
    confirmDrivers: [
      "A fabricated or altered receipt, or a personal expense proven to be non-business",
      "The same expense reimbursed twice with no offsetting adjustment",
      "Self-approval combined with any of the above",
    ],
    typicalEvidence: [
      "invoice / expense claim (often typed as 'other')",
      "bank_statement",
      "receipts / supporting docs",
      "employee_record (the approver)",
    ],
  },

  kickback: {
    name: "Kickback / bribery (corruption)",
    definition:
      "A corruption scheme in which a vendor pays an employee — cash, gifts, " +
      "or a cut of overbillings — in exchange for favorable treatment: inflated " +
      "prices, steered contracts, or approval of fraudulent invoices.",
    howItWorks:
      "A purchasing insider steers business to a colluding vendor at " +
      "above-market prices, typically without competitive bids and with a " +
      "single approver. The overcharge funds the kickback, which returns to the " +
      "employee via cash, a personal transfer, or a shell. Because two parties " +
      "collude, the books look clean — the evidence is biased decisions and an " +
      "off-book value flow, not a discrepancy in a single account.",
    redFlags: [
      "One buyer consistently uses one vendor; rising spend concentrated on that vendor",
      "Prices above market / above benchmark with no competitive bids (sole-sourcing)",
      "The vendor was onboarded by the same buyer who approves its invoices",
      "Round-number 'consulting' or 'advisory' invoices with thin deliverables",
      "Undisclosed relationship between buyer and vendor (shared surname, address, phone)",
      "Unexplained transfers from the vendor to the employee",
    ],
    detectionSignals: [
      "approver concentration: one approver handles nearly all of a vendor's spend",
      "a vendor's share of category spend rises sharply over the period",
      "bank_statement shows a flow from vendor.bankAccount into employee.bankAccount",
      "unit prices exceed a benchmark/market comparable",
      "no competitive purchase_order process for material awards",
      "related-party link: vendor and employee share address, phone, or surname",
    ],
    innocentExplanations: [
      "A legitimately sole-source or highly specialized supplier",
      "A documented preferred-vendor or framework-agreement policy",
      "A long-standing arms-length relationship priced at market",
      "Approver concentration because that buyer legitimately owns the category",
    ],
    confirmDrivers: [
      "A proven value transfer from the vendor to the deciding employee",
      "Demonstrably above-market pricing steered without competition PLUS an undisclosed relationship",
      "The approver both onboarded and monopolizes approval of the vendor",
    ],
    typicalEvidence: [
      "purchase_order (or the absence of competitive bids)",
      "invoice",
      "bank_statement (the vendor -> employee flow)",
      "vendor_registration",
      "employee_record",
      "board_minutes",
    ],
  },

  other: {
    name: "Unclassified irregularity",
    definition:
      "An anomaly that does not fit a named scheme — an unclassified " +
      "irregularity handled by the examiner's general method. Covers " +
      "financial-statement manipulation, unusual journal entries, related-party " +
      "transactions, check tampering, skimming, and asset misuse.",
    howItWorks:
      "Treated as a generic anomaly: unsupported top-side journal entries or " +
      "period-end round adjustments, entries posted by unusual users or outside " +
      "business hours, related-party revenue, reversals that appear only after " +
      "audit, or diversions that leave an odd ledger footprint. Apply the full " +
      "hypothesize -> exonerate -> rule-out method rather than a fixed template.",
    redFlags: [
      "Manual journal entries concentrated at period-end",
      "Round-number adjustments with no source document",
      "Entries by an unexpected user or outside business hours",
      "Reversals appearing only after an audit began",
      "Unusual account pairings or unfamiliar ledger accounts",
    ],
    detectionSignals: [
      "journal entry posted at period-end or outside business hours",
      "ledger entry with no linked source document",
      "an entry that nets to zero across periods (a timing artifact to inspect)",
      "a single user posting large or unusual adjustments",
      "an unusual debit/credit account pairing versus historical norms",
    ],
    innocentExplanations: [
      "Standard accruals and their reversals in the next period",
      "A legitimate, documented reclassification",
      "A documented management estimate or fair-value adjustment",
      "A routine audit adjustment recorded with support",
    ],
    confirmDrivers: [
      "A material entry with no business support that misstates the books or conceals a diversion",
      "The entry benefits or is controlled by the person who posted it, with no independent review",
    ],
    typicalEvidence: [
      "ledger",
      "board_minutes",
      "bank_statement",
      "any supporting document (whose absence is itself evidence)",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. THE EXAMINER'S METHOD (system-prompt fragment)
// ─────────────────────────────────────────────────────────────────────────────
// Directly embeddable alongside prompts.ts SYSTEM. Same discipline, expanded
// with the five named innocent causes and the confidence rule.

export const EXAMINER_METHOD = `THE EXAMINER'S METHOD — the discipline behind every verdict.

You are a forensic examiner working under ACFE methodology. Your job is not to
find fraud; it is to reach the TRUE verdict on each anomaly. You are fair,
evidence-obsessed, and you assume an innocent explanation until you have failed
to find one.

1. HYPOTHESIZE. State one specific, falsifiable theory (e.g., "Vendor V-031 is a
   shell company controlled by employee E-007"). Name what would prove it TRUE
   and what would prove it FALSE, up front.

2. TRY TO EXONERATE IT FIRST — the most important step. Before you accuse
   anything, run the searches that would CLEAR it. Falsification IS a finding: a
   reversed duplicate payment is a control catch, not a loss; a vendor at a
   shared coworking address is not necessarily a shell; a large round purchase
   with a PO and board authorization is legitimate. If you find the innocent
   explanation, CLEAR it and cite the document.

3. RULE OUT FIVE INNOCENT CAUSES before you accuse. You may not file a fraud
   finding until you have ruled out ALL of:
     (a) a benign business reason (a real service, a policy, a market price),
     (b) a data or entry error (a typo, a duplicate key, a wrong field),
     (c) a mislabeled or duplicate entity (same party under two names/ids),
     (d) a timing artifact (accrual/reversal, deposit-then-balance, cutoff),
     (e) a process or paperwork gap (the PO/approval exists but is filed
         elsewhere — absence of a document is not proof of fraud).
   If you cannot rule out all five, it is a CANDIDATE, not a finding — mark it
   UNPROVEN and say exactly what record would resolve it.

4. CONFIDENCE = the MINIMUM of your supporting claims. One weak link caps the
   whole verdict. File a finding only at confidence >= 0.7. Below that -> UNPROVEN.

5. CITE OR ABSTAIN. Every factual claim carries a doc_id or a recompute
   reference, or you do not make it. "No purchase order found" is a valid
   result, not a gap to fill by guessing. Never fabricate a citation. Dollar
   figures come ONLY from the ledger / recompute — never your own arithmetic.

VERDICTS (exactly three):
  • CONFIRMED — cited evidence, all five innocent causes ruled out, conf >= 0.7.
  • CLEARED   — you found and cited the innocent explanation.
  • UNPROVEN  — suspicious but you could not rule out an innocent cause; name the
                one record that would settle it.

You examine records and controls, not people.`;

// ─────────────────────────────────────────────────────────────────────────────
// 4. EXTRACTION GUIDANCE (map-stage reading instructions per DocType)
// ─────────────────────────────────────────────────────────────────────────────
// Each reading subagent gets the instruction for the shard's doc type. The goal
// is to pull the fraud-relevant identity and linkage fields — the ones that let
// the reduce stage cross-reference entities (addresses, bank accounts, tax ids,
// approvers, PO refs, reversals) — not to summarize the document.

export const EXTRACTION_GUIDANCE: Record<DocType, string> = {
  invoice:
    "Pull: vendor name + vendorId, invoice number, invoice date, total amount, " +
    "line items (enough to judge if a real good/service is described), the PO " +
    "number it references (or note NONE), the approver, and the paying/remit " +
    "bank account. FLAG: round-dollar totals, amounts just under a plausible " +
    "approval limit, sequential invoice numbers from one vendor, a missing PO, " +
    "a single approver across many invoices, and vague/undeliverable line items " +
    "('consulting', 'services'). Record the exact invoiceNo string (suffixes and " +
    "whitespace matter for duplicate detection).",
  vendor_registration:
    "Pull: legal name, vendorId, full registered address, tax id (and whether " +
    "it validates), bank account, category, and onboarding date. FLAG: PO-box / " +
    "residential / mail-drop addresses, a missing or malformed tax id, an " +
    "onboarding date inside the fiscal year, and any field (address, phone, " +
    "email domain, bank account) that could match an employee — these are the " +
    "join keys the reduce stage cross-references for conflicts of interest.",
  employee_record:
    "Pull: name, empId, role, home address, personal bank account, salary, join " +
    "date (and termination date if any), email, and manager. FLAG: a shared " +
    "bank account or address with another employee OR with a vendor, a missing " +
    "email/manager, and approval authority (does this person approve payments, " +
    "and up to what limit?). These fields power ghost-employee and kickback " +
    "cross-referencing.",
  bank_statement:
    "Pull every line: date, amount, direction (debit/credit), counterparty, and " +
    "description. Preserve counterparty account identifiers. FLAG: transfers " +
    "between a vendor account and an employee account (kickback flow), " +
    "round-dollar outflows, repeated equal payments to one payee, payments to " +
    "accounts that also appear on an employee or vendor record, and any payment " +
    "with no matching invoice.",
  payroll:
    "Pull per row: empId, name, gross/net amount, disbursement bank account, and " +
    "pay period/month. FLAG: an empId absent from the employee master, a bank " +
    "account shared across employees, pay continuing after a termination date, " +
    "and identical salaries routed to one account. This is the ghost-employee " +
    "surface.",
  purchase_order:
    "Pull: PO number, vendor + vendorId, date, amount/quantity, the requesting " +
    "and approving parties, and the invoice(s) it covers. FLAG: POs created " +
    "after the invoice date (back-dating), missing competitive bids on material " +
    "awards, one person as both requester and approver, and split POs to one " +
    "vendor that jointly exceed an approval limit. Crucially, note which " +
    "invoices DO have PO coverage — absence of a PO is a key shell-company " +
    "signal.",
  board_minutes:
    "Pull: meeting date, attendees, and any resolutions that AUTHORIZE spend, " +
    "set approval thresholds, appoint vendors, or approve hires. These are the " +
    "exoneration source — a large purchase or a new hire named here is " +
    "legitimate. Note the exact approval limits stated (they define the " +
    "'threshold' for threshold-evasion tests) and any declared related-party " +
    "or conflict-of-interest disclosures.",
  credit_note:
    "Pull: credit note number, the invoice/payment it reverses, vendor, amount, " +
    "date, and reason. FLAG which prior payment each credit offsets — a credit " +
    "note that reverses a suspected duplicate payment EXONERATES it (the loss " +
    "never occurred). Note credits with no underlying invoice, or issued " +
    "suspiciously close to an audit.",
  ledger:
    "Pull journal entries: date, debit/credit accounts, amount, posting user, " +
    "source-document reference, and memo. This is the authoritative source for " +
    "dollar totals (recompute here, never by hand). FLAG: entries with no source " +
    "doc, period-end or off-hours manual entries, round-number top-side " +
    "adjustments, unusual account pairings, and entries that net to zero across " +
    "periods (timing artifacts to inspect, not assume fraud).",
  other:
    "Identify what the document actually is, then pull any identity or linkage " +
    "fields it carries — names, ids, addresses, bank accounts, dates, amounts, " +
    "approvers, and references to other documents. Note anything that could join " +
    "to a vendor or employee, and flag receipts (for expense claims), contracts, " +
    "and correspondence that could confirm or clear an anomaly.",
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. DEEP-DIVE INVESTIGATION BRIEFS (per scheme)
// ─────────────────────────────────────────────────────────────────────────────
// schemePrompt(scheme) returns a focused brief for a subagent examining ONE
// suspect of that scheme type: what to retrieve, what confirms, what clears.

const SCHEME_BRIEFS: Record<SchemeClass, string> = {
  shell_company:
    "RETRIEVE the vendor's registration and the record of any employee it may " +
    "be linked to; compare address, bank account, phone, and email domain " +
    "field-by-field. Retrieve the vendor's invoices and search for matching " +
    "purchase orders and any proof of delivery. CONFIRM if an insider link " +
    "(shared address/bank) coincides with no delivered good/service and " +
    "self-approval. CLEAR if the address is a shared business center, delivery " +
    "is verifiable, POs exist elsewhere, or the counterparty is a genuine " +
    "non-employee sole proprietor. If linkage is suspicious but delivery is " +
    "unresolved, hold UNPROVEN and name the record (delivery note, contract) " +
    "that would settle it.",
  ghost_employee:
    "RETRIEVE the employee's HR record and the payroll rows paying them; compare " +
    "the disbursement bank account and home address against every other " +
    "employee. Look for an email, a manager, onboarding docs, and any work " +
    "product. CONFIRM if the person has no independent existence (no email, no " +
    "org presence) AND pay is routed to another employee's account, especially " +
    "one who controls payroll. CLEAR if there is a benign shared-account reason " +
    "(spouse/relative), the person is a contractor on another system, or they " +
    "are a real but newly/loosely provisioned hire. Hold UNPROVEN if existence " +
    "is unclear; name the record (email logs, org chart, ID) that would resolve it.",
  duplicate_payment:
    "RETRIEVE both payment instances and any credit note or reversal touching " +
    "them. Confirm from the LEDGER whether net cash out exceeds the single " +
    "genuine liability. CONFIRM if the same invoice was paid twice with no " +
    "offsetting reversal, or the second was altered to evade duplicate " +
    "detection and never refunded. CLEAR if a credit note / reversal offsets it " +
    "(a control catch), the charges are a legitimate recurring or split payment, " +
    "or the two payments are genuinely distinct deliveries at the same price.",
  threshold_evasion:
    "RETRIEVE the clustered invoices/POs and the actual approval limit (from " +
    "board_minutes or policy). Group by vendor, date, and purpose to test " +
    "whether one procurement was fragmented. CONFIRM if a single purchase was " +
    "deliberately split so each piece cleared under the limit while the combined " +
    "value needed higher approval, and the splitter benefits. CLEAR if the unit " +
    "price genuinely sits below the limit, the pieces are legitimate partial " +
    "deliveries, or the assumed threshold is wrong.",
  expense_fraud:
    "RETRIEVE the expense claims and their receipts, plus the approver record. " +
    "Check for round amounts, weekend/holiday or home-location charges, amounts " +
    "just under the receipt-required limit, and the same receipt claimed twice. " +
    "CONFIRM if a receipt is fabricated/altered, a personal expense is proven " +
    "non-business, or the same expense was paid twice — especially with " +
    "self-approval. CLEAR if the cost is legitimately round (per-diem, flat " +
    "fare), a resubmission net-paid once, or a genuine business occasion.",
  kickback:
    "RETRIEVE the buyer-vendor relationship: who onboarded the vendor, who " +
    "approves its invoices, the trend in its spend share, and whether awards " +
    "were competitively bid. Search bank statements for any flow from the " +
    "vendor's account to the employee's. CONFIRM if there is a value transfer " +
    "vendor->employee, or above-market steered pricing without competition plus " +
    "an undisclosed relationship. CLEAR if the vendor is genuinely sole-source, " +
    "priced at market under a documented preferred-vendor policy, or the " +
    "approver legitimately owns the category. Hold UNPROVEN if bias is present " +
    "but no value transfer is found; name the record that would settle it.",
  other:
    "Apply the full examiner's method. State a specific theory for the anomaly, " +
    "then try to exonerate it first: retrieve the source document behind the " +
    "entry, its authorization, and any related-party context. CONFIRM only a " +
    "material, unsupported item that misstates the books or conceals a " +
    "diversion and benefits its poster. CLEAR routine accruals, documented " +
    "reclassifications/estimates, and audit adjustments with support. Otherwise " +
    "hold UNPROVEN and name the missing record.",
};

/** Focused investigation brief for a deep-dive subagent on one suspect. */
export function schemePrompt(scheme: SchemeClass): string {
  const spec = SCHEMES[scheme];
  const brief = SCHEME_BRIEFS[scheme];
  return [
    `INVESTIGATION BRIEF — ${spec.name}`,
    ``,
    `DEFINITION. ${spec.definition}`,
    ``,
    `HOW IT WORKS. ${spec.howItWorks}`,
    ``,
    `WHAT TO RETRIEVE & HOW TO REASON. ${brief}`,
    ``,
    `COMPUTABLE SIGNALS TO CHECK:`,
    ...spec.detectionSignals.map((s) => `  • ${s}`),
    ``,
    `WHAT WOULD EXONERATE (try these FIRST):`,
    ...spec.innocentExplanations.map((s) => `  • ${s}`),
    ``,
    `WHAT WOULD CONFIRM (verdict = CONFIRMED only if these hold and all five innocent causes are ruled out):`,
    ...spec.confirmDrivers.map((s) => `  • ${s}`),
    ``,
    `EVIDENCE THAT SETTLES IT: ${spec.typicalEvidence.join(", ")}.`,
    ``,
    `Confidence = MIN of your supporting claims; file only at >= 0.7. Cite every`,
    `claim with a doc id or a recompute reference, or abstain. Verdict is one of`,
    `CONFIRMED / CLEARED / UNPROVEN.`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. RED-FLAG GLOSSARY (plain-English glosses for UI tooltips)
// ─────────────────────────────────────────────────────────────────────────────
// For a non-expert judge/viewer. Short, correct, jargon-free.

export const RED_FLAG_GLOSSARY: Record<string, string> = {
  "Benford's Law":
    "Real accounting figures start with '1' about 30% of the time and taper " +
    "down to '9' at under 5%. Fabricated or manipulated numbers rarely follow " +
    "this curve, so a distribution of leading digits that deviates from Benford " +
    "flags books that may have been made up.",
  "Shell company":
    "A vendor that exists only on paper — a name and a bank account with no real " +
    "operations. Fraudsters create one to send the company invoices for goods " +
    "or services that were never delivered, then collect the payments.",
  "Ghost employee":
    "A name on the payroll that does not correspond to a real working person — " +
    "invented, or kept active after they left. Their salary is diverted to " +
    "whoever controls the fake record.",
  "Threshold evasion":
    "Splitting a big purchase into several smaller ones, each priced just under " +
    "the amount that would require a manager's approval, so the whole thing " +
    "slips through unchecked. Also called 'structuring'.",
  "Round-dollar":
    "An amount with no cents and often trailing zeros (e.g., 5,000 or 12,000). " +
    "Genuine invoices usually carry odd cents; a pile of perfectly round numbers " +
    "suggests amounts were invented rather than calculated.",
  "Approver concentration":
    "When one person signs off on nearly all payments to a particular vendor. " +
    "Healthy controls spread approvals around; concentration lets a single " +
    "insider wave fraudulent invoices through unchallenged.",
  "PO coverage":
    "The share of invoices backed by a matching purchase order — the pre-approved " +
    "record that the company actually ordered the goods. Low or missing PO " +
    "coverage means payments went out with nothing authorizing the purchase.",
  "Structuring":
    "Deliberately breaking a transaction into smaller pieces to stay under a " +
    "control or reporting limit. The same idea as threshold evasion.",
  "Kickback":
    "A secret payment from a vendor to an employee in exchange for favorable " +
    "treatment — steering contracts to that vendor or approving inflated prices. " +
    "The overcharge the company pays is what funds the bribe.",
  "Duplicate payment":
    "Paying the same bill more than once — the same invoice entered twice, or " +
    "re-entered with a small change to slip past the system's duplicate check.",
  "Pass-through vendor":
    "A middleman entity, often controlled by an insider, that buys goods at the " +
    "real price and re-bills the company at a marked-up price, pocketing the " +
    "difference. A shell-company variant where some delivery genuinely occurs.",
  "Related-party transaction":
    "A deal with someone connected to an insider — a relative, or a company an " +
    "employee secretly owns. Not automatically fraud, but a conflict of interest " +
    "that must be disclosed and priced at arm's length.",
  "Skimming":
    "Stealing incoming cash before it is ever recorded in the books. Because " +
    "there is no ledger entry, it shows up as missing revenue rather than a " +
    "visible shortage.",
  "Lapping":
    "Covering a stolen customer payment by applying a later customer's payment " +
    "to the first account, then a third to the second, and so on — a rolling " +
    "cover-up that hides skimmed receivables.",
};
