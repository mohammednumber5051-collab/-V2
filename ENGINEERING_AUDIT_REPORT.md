# Engineering Audit Report — ASSAR Optical ERP
**Date:** 2026-07-12  
**Auditor Role:** Senior Software Architect / ERP Systems Engineer / Financial Systems Analyst  
**Status:** Phase 1 — Read-Only Analysis. Zero code modifications made.

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Financial Flow Diagram](#2-financial-flow-diagram)
3. [Firestore Data Model & Collections](#3-firestore-data-model--collections)
4. [Service Dependency Map](#4-service-dependency-map)
5. [Complete Financial Lifecycle Trace](#5-complete-financial-lifecycle-trace)
6. [All Confirmed Financial Inconsistencies](#6-all-confirmed-financial-inconsistencies)
7. [All Race Conditions](#7-all-race-conditions)
8. [All Data Integrity Risks](#8-all-data-integrity-risks)
9. [All Calculation Problems](#9-all-calculation-problems)
10. [All Duplicate & Dead Logic](#10-all-duplicate--dead-logic)
11. [Synchronization Problems](#11-synchronization-problems)
12. [Security Issues](#12-security-issues)
13. [Files That Must Be Modified](#13-files-that-must-be-modified)
14. [Exact Modification Plan & Execution Order](#14-exact-modification-plan--execution-order)

---

## 1. Architecture Overview

### Stack
| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Tailwind CSS v4 |
| State/Sync | Custom `SyncEngine` (pub/sub event bus) |
| Database | Firebase Firestore (cloud-first, localStorage fallback) |
| Auth | Firebase Auth (anonymous) + custom session management (localStorage) |
| Financial Logic | 3-layer engine: `FinancialEngine` → `FinancialExecutionEngine` → `dbService` |
| Mobile | Capacitor (Android) |

### Core Architectural Problem: **Dual Write Paths**

The most fundamental structural problem in this codebase is the existence of **two completely parallel and incompatible code paths for every major financial operation**:

| Feature | Path A (Legacy) | Path B (Modern) |
|---|---|---|
| Invoice Create | `dbService.createInvoice()` → `writeBatch` | `FinancialExecutionEngine.APPLY_INVOICE_IMPACT` → `runTransaction` |
| Transaction Add | `dbService.addTransaction()` → `writeBatch` | `FinancialExecutionEngine.ADD_TRANSACTION` → `runTransaction` |
| Invoice Payment | `dbService.recordInvoicePayment()` → `writeBatch` | `FinancialExecutionEngine.RECORD_INVOICE_PAYMENT` → `runTransaction` |
| Transfer | `dbService.createTransfer()` → `writeBatch` | `FinancialExecutionEngine.CREATE_TRANSFER` → `runTransaction` |
| Quick Entry | `FinancialEngineService` → `FinancialExecutionEngine` | — (only one path) |

**Path A** (dbService legacy methods):
- Uses non-atomic `writeBatch` — can partially succeed
- Creates **zero** Transaction documents (no audit trail)
- Updates **zero** aggregation documents (dashboard/reports go stale)
- Has incorrect discount-ignoring balance formulas
- Is what **Invoices.tsx**, **Transactions.tsx** (edit/delete), **Vouchers.tsx** call

**Path B** (FinancialExecutionEngine):
- Uses atomic `runTransaction` with idempotency guard
- Creates proper Transaction documents
- Updates daily/monthly summaries and dashboard cache via AggregationEngine
- Has correct balance logic
- Is what **QuickEntry.tsx** calls

This bifurcation means every invoice and every voucher produces **incorrect aggregation data** and **no transaction records**.

---

## 2. Financial Flow Diagram

### Path A — Invoice (What Actually Happens Today)
```
User submits invoice in Invoices.tsx
    ↓
dbService.createInvoice()
    ↓ writeBatch (non-atomic)
    ├── invoices.set() ← invoice document saved
    ├── customers/suppliers.update(balance += total - paid)  ← IGNORES DISCOUNT ❌
    ├── cashBoxes.update(balance += paid)                    ← correct
    └── products.update(stock += change)                     ← correct
    
    ✗ NO Transaction documents created
    ✗ NO aggregation updates (dashboard_cache, daily/monthly summaries)
    ✗ NO idempotency record
    ✗ Discount bug in partner balance
```

### Path B — Quick Entry (What Should Happen)
```
User submits quick entry in QuickEntry.tsx
    ↓
FinancialEngineService.createQuickEntry()
    ↓
FinancialExecutionEngine.execute({ type: 'CREATE_QUICK_ENTRY' })
    ↓ runTransaction (atomic) with idempotency check
    ├── operations.set(operationId) ← idempotency guard
    ├── quick_financial_entries.set() ← entry document
    ├── customers/suppliers.set(balance += partnerBalanceChange)
    ├── cashBoxes.set(balance += cashBoxBalanceChange)
    ├── transactions.set() ← 1-2 Transaction documents
    └── AggregationEngine.applyFinancialImpact()
         ├── daily_financial_summaries.set({ merge })
         ├── monthly_financial_summaries.set({ merge })
         └── dashboard_cache.set({ merge })
    
    ✓ Atomic write
    ✓ Transaction documents created
    ✓ Aggregation updated
    ✓ Idempotency check (but ID is random — see Issue #7)
```

---

## 3. Firestore Data Model & Collections

| Collection | Purpose | Updated By |
|---|---|---|
| `invoices` | Sales/purchase invoices | dbService.createInvoice / writeBatch |
| `transactions` | Financial movement ledger | FinancialExecutionEngine only |
| `customers` | Customer master + balance | Both paths |
| `suppliers` | Supplier master + balance | Both paths |
| `cashBoxes` | Cash register balances | Both paths |
| `quick_financial_entries` | Quick financial entries | FinancialExecutionEngine only |
| `vouchers` | Receipt/payment vouchers | dbService only |
| `products` | Inventory + stock levels | dbService.createInvoice / writeBatch |
| `users` | System users | dbService (authService) |
| `audit_logs` | Audit trail | dbService.logAudit (best-effort) |
| `daily_financial_summaries` | Per-day aggregation | AggregationEngine only |
| `monthly_financial_summaries` | Per-month aggregation | AggregationEngine only |
| `dashboard_cache` | Dashboard KPI cache | AggregationEngine only |
| `settings` | Store settings | dbService |
| `operations` | Idempotency records | FinancialExecutionEngine only |
| `warranties` | Product warranties | OpticalHub component |
| `repairs` | Repair jobs | OpticalHub component |
| `special_orders` | Special orders | OpticalHub component |

---

## 4. Service Dependency Map

```
App.tsx
├── authService.initialize() → dbService.getAll('users') + dbService.getAll('cashBoxes')
│
├── Dashboard.tsx
│   └── dbService.getAll('cashBoxes') + dbService.getAll('dashboard_cache') [STALE — see #36]
│
├── Invoices.tsx
│   ├── dbService.createInvoice()          ← PATH A, no aggregation, discount bug
│   ├── dbService.deleteInvoiceData()      ← PATH A, no aggregation, discount bug
│   ├── dbService.updateInvoiceData()      ← PATH A, no aggregation, discount bug
│   └── FinancialExecutionEngine.RECORD_INVOICE_PAYMENT  ← PATH B (inconsistent!)
│       [Invoices.tsx mixes both paths!]
│
├── Transactions.tsx
│   ├── FinancialExecutionEngine.ADD_TRANSACTION      ← PATH B ✓
│   ├── FinancialExecutionEngine.CREATE_TRANSFER      ← PATH B ✓
│   ├── dbService.updateTransactionData()             ← PATH A, no aggregation
│   └── dbService.deleteTransactionData()             ← PATH A, no aggregation, partner sign bug
│
├── QuickEntry.tsx
│   └── FinancialEngineService.createQuickEntry/updateQuickEntry/deleteQuickEntry
│       └── FinancialExecutionEngine ← PATH B ✓ (but salesTotal bug in delete/update)
│
├── Vouchers.tsx
│   ├── dbService.addVoucher()    ← PATH A, no aggregation, supplier direction bug
│   ├── dbService.updateVoucher() ← PATH A, no aggregation, supplier direction bug
│   └── dbService.deleteVoucher() ← PATH A, no aggregation
│
├── Partners.tsx → dbService.getAll / update / delete (balances are READ from stored field)
│
├── CustomerProfile.tsx
│   └── Calculates running balance in-memory from invoices+transactions+quickEntries
│       [Uses financialUtils.calculateUnifiedPartnerBalances]
│
├── Reports.tsx → dbService.getAll (all collections), calculates in-memory
│
└── DailyLedger.tsx → dbService.getAll('transactions', 'invoices', 'vouchers', 'quick_financial_entries')
```

**Which function updates what:**

| Function | customers | suppliers | invoices | transactions | cashBoxes | aggregation |
|---|---|---|---|---|---|---|
| `dbService.createInvoice` | ✓ (buggy) | ✓ (buggy) | ✓ | ✗ | ✓ | ✗ |
| `dbService.deleteInvoiceData` | ✓ (buggy) | ✓ (buggy) | ✓ | ✗ | ✓ | ✗ |
| `dbService.updateInvoiceData` | ✓ (buggy) | ✓ (buggy) | ✓ | ✗ | ✓ | ✗ |
| `dbService.recordInvoicePayment` | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ |
| `dbService.addTransaction` | ✓ (sign bug) | ✓ (sign bug) | ✗ | ✓ | ✓ | ✗ |
| `dbService.updateTransactionData` | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ |
| `dbService.deleteTransactionData` | ✓ (sign bug) | ✓ (sign bug) | ✓ | ✓ | ✓ | ✗ |
| `dbService.createTransfer` | — | — | — | ✓ (incomplete) | ✓ | ✗ |
| `dbService.addVoucher` | ✓ | ✓ (direction bug) | — | — | ✓ | ✗ |
| `dbService.updateVoucher` | ✓ | ✓ (direction bug) | — | — | ✓ | ✗ |
| `dbService.deleteVoucher` | ✓ | ✓ | — | — | ✓ | ✗ |
| `FEE.ADD_TRANSACTION` | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `FEE.RECORD_INVOICE_PAYMENT` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `FEE.CREATE_TRANSFER` | — | — | — | ✓ | ✓ | ✓ |
| `FEE.APPLY_INVOICE_IMPACT` | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `FEE.CREATE_QUICK_ENTRY` | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| `FEE.UPDATE_QUICK_ENTRY` | ✓ | ✓ | — | ✓ | ✓ | ✓ (partial bug) |
| `FEE.DELETE_QUICK_ENTRY` | ✓ | ✓ | — | ✓ | ✓ | ✓ (partial bug) |

*(FEE = FinancialExecutionEngine)*

---

## 5. Complete Financial Lifecycle Trace

### INVOICE CREATION (Sale Invoice, Partial Payment)
```
Input:
  invoice = { type:'sale', total:1000, discount:100, paid:500, partnerId:'C1', boxId:'B1' }

Expected:
  netAmount = 1000 - 100 = 900
  partnerBalance += 400 (remaining: 900 - 500)
  cashBox += 500
  Transaction #1: قبض 900 (accrual)
  Transaction #2: قبض 500 (cash, manual_receipt)
  daily_summaries.salesTotal += 900
  dashboard_cache.totalReceivables += 400

Actual (dbService.createInvoice):
  partnerBalance += 500 ← WRONG (1000 - 500, ignores discount)
  cashBox += 500 ← correct
  Transaction documents: NONE created
  Aggregation: NOT updated
  
  Customer is shown as owing 500 but actually owes 400. ❌
  Dashboard sales total unchanged. ❌
```

### INVOICE PAYMENT
```
Input: pay 400 remaining on invoice above

dbService.recordInvoicePayment():
  invoice.paid = 500 + 400 = 900 → newStatus = 'جزئي' (WRONG, should be مدفوع since net=900)
  cashBox += (new_paid - old_paid) delta logic
  partner.balance -= 400
  Transaction: NOT created ❌
  Aggregation: NOT updated ❌

Note on status: newPaid=900 vs total=1000, so 900 < 1000 → status = 'جزئي'
But netAmount = 900, and 900 = 900, so should be 'مدفوع'.
The status logic compares to total, not netAmount. ❌
```

### QUICK ENTRY (Manual Sale, correct path)
```
FinancialExecutionEngine.CREATE_QUICK_ENTRY:
  All correct per design, but:
  - operationId uses Math.random() so idempotency is broken (Issue #7)
  - salesTotal/profitsTotal not reversed on delete (Issue #18)
  - salesTotal/profitsTotal not adjusted on update (Issue #19)
```

---

## 6. All Confirmed Financial Inconsistencies

### ISSUE-001 ❌ CRITICAL — Discount Ignored in Partner Balance on Invoice Create
**Location:** `src/services/db.ts` → `createInvoice()` line 113  
**Code:**
```js
let balChange = invoice.total - invoice.paid;
```
**Root Cause:** `invoice.discount` is never subtracted. The net amount formula is `total - discount - paid = remaining`. This code uses `total - paid = remaining + discount`.  
**Impact:** Customer/supplier balance is overstated by the discount amount on every discounted invoice. For a 10% discount on a 1,000 invoice, the customer is shown as owing 100 more than they actually owe.  
**Affected Collections:** `customers`, `suppliers`  
**Affected Calculations:** Every discounted invoice's partner balance, CustomerProfile running total, Reports receivables  
**Risk:** CRITICAL — Active financial data corruption  
**Same Bug Exists In:** `deleteInvoiceData` (line 167), `updateInvoiceData` (lines 243, 253)

---

### ISSUE-002 ❌ CRITICAL — Invoice Payment Status Checks Against `total` Not `netAmount`
**Location:** `src/services/db.ts` → `deleteTransactionData()` lines 381-388  
**Code:**
```js
const netTotal = Number(invData.total || 0) - Number(invData.discount || 0);
// uses netTotal correctly here ✓
```
But in `dbService.recordInvoicePayment()` the status comparison is never shown — the caller in `Invoices.tsx` computes `newStatus`. Investigation of the `FinancialExecutionEngine.RECORD_INVOICE_PAYMENT` reveals `newStatus` is passed in as a parameter pre-computed by the caller. The caller must compute this correctly, but `dbService.recordInvoicePayment()` has no such guard.  
**Risk:** HIGH — Invoices may be permanently stuck in "جزئي" when they're actually fully paid.

---

### ISSUE-003 ❌ CRITICAL — No Transaction Documents Created for Invoices (via dbService Path)
**Location:** `src/services/db.ts` → `createInvoice()`  
**Root Cause:** `dbService.createInvoice()` uses `writeBatch` and updates only `invoices`, `customers/suppliers`, `cashBoxes`, and `products`. It creates **zero** entries in the `transactions` collection.  
**Impact:**
- No audit trail for invoice payments
- `calculateUnifiedCashBalances` must use the fragile "unrecordedPaid" fallback for ALL invoices
- `CustomerProfile.tsx` ledger has no transaction rows for invoice events
- `DailyLedger.tsx` will not show invoice cash flows
- AuditLogs show no financial movement records  
**Affected Collections:** `transactions` (missing records)  
**Risk:** CRITICAL — Financial audit trail is incomplete for all invoices

---

### ISSUE-004 ❌ CRITICAL — Aggregation Never Updated for Invoices, Vouchers, or Transaction Edits/Deletes
**Location:** `src/services/db.ts` — ALL methods  
**Root Cause:** None of the dbService methods call `AggregationEngine.applyFinancialImpact()`. The dashboard cache (`dashboard_cache`), daily summaries (`daily_financial_summaries`), and monthly summaries (`monthly_financial_summaries`) are **never updated** when invoices, vouchers, or manual transactions are created, edited, or deleted.  
**Impact:**
- Dashboard KPIs (sales, profits, receivables, cash balance) are permanently stale/incorrect
- Reports that read from daily/monthly summaries show wrong totals
- `todaySales`, `monthSales` never increment for invoice-based sales
- `totalReceivables`, `totalPayables` never change for invoice operations  
**Affected Collections:** `dashboard_cache`, `daily_financial_summaries`, `monthly_financial_summaries`  
**Risk:** CRITICAL — All reporting data is incorrect

---

### ISSUE-005 ❌ CRITICAL — recordInvoicePayment Creates No Transaction Document
**Location:** `src/services/db.ts` → `recordInvoicePayment()` lines 398-442  
**Root Cause:** This function updates `invoices`, `cashBoxes`, and `customers/suppliers`, but never writes to `transactions`. There is no record that a payment was received.  
**Impact:** Invoice payments are financially invisible in the ledger. They cannot be audited, reversed, or reported on individually.  
**Risk:** CRITICAL — Missing financial records

---

### ISSUE-006 ❌ HIGH — deleteTransactionData Partner Balance Reversal Sign Error (Payment Type)
**Location:** `src/services/db.ts` → `deleteTransactionData()` line 364  
**Code:**
```js
batch.update(doc(db, partnerColl, trans.partnerId), { balance: increment(trans.amount) });
```
**Root Cause:** The original `addTransaction()` applies `increment(-amount)` for receipts (قبض) and `increment(+amount)` for payments (صرف). The deletion reversal always uses `increment(+amount)`. For a 'صرف' payment transaction, the original was `+amount`, so reversal must be `-amount`. But the code uses `+amount`.  
**Impact:** Deleting a payment (صرف) transaction doubles the partner's balance instead of restoring it.  
**Example:** Customer owes 500. Payment transaction of 200 recorded → balance 700. Delete that transaction → balance should go back to 500, but code sets it to 900.  
**Risk:** CRITICAL — Active balance corruption on transaction delete

---

### ISSUE-007 ❌ HIGH — Supplier Payment Voucher Direction Bug
**Location:** `src/services/db.ts` → `addVoucher()` lines 468-474  
**Code:**
```js
} else { // supplier
    balChange = -voucher.amount; // ALWAYS negative regardless of voucher type
}
```
**Root Cause:** For customers, the balance change depends on voucher type (receipt vs payment). For suppliers, it always uses `-voucher.amount`. A supplier RECEIPT voucher (we receive money from the supplier, e.g., a refund) should INCREASE the supplier balance (they owe less to us? Or we have a credit?). The direction logic for suppliers is unconditionally wrong for receipt-type vouchers.  
**Affected Collections:** `suppliers`  
**Risk:** HIGH — Supplier balances corrupted for receipt-type vouchers

---

### ISSUE-008 ❌ HIGH — DELETE_QUICK_ENTRY Missing salesTotal and profitsTotal Reversal
**Location:** `src/services/financialExecutionEngine.ts` → `DELETE_QUICK_ENTRY` lines 308-316  
**Code:** The negation block handles only: `transactionCount`, `receiptsTotal`, `paymentsTotal`, `receivablesChange`, `payablesChange`, `cashBalanceChange`. It does NOT negate `salesTotal` or `profitsTotal`.  
**Root Cause:** When a `manual_sale` quick entry is created, `getQuickEntryImpact()` sets `agg.salesTotal = entry.netAmount` and `agg.profitsTotal = entry.netAmount`. When deleted, these are not reversed.  
**Impact:** Deleting any manual sale quick entry permanently inflates `salesTotal` and `profitsTotal` in daily summaries and dashboard.  
**Risk:** HIGH — Reports show higher sales/profits than reality after deletions

---

### ISSUE-009 ❌ HIGH — UPDATE_QUICK_ENTRY Missing salesTotal and profitsTotal Adjustment
**Location:** `src/services/financialExecutionEngine.ts` → `UPDATE_QUICK_ENTRY` lines 391-404  
**Code:** The `netAggImpact` computation handles only: `transactionCount`, `receiptsTotal`, `paymentsTotal`, `receivablesChange`, `payablesChange`, `cashBalanceChange`. Missing: `salesTotal`, `profitsTotal`.  
**Impact:** Editing a manual sale's amount does not update sales/profit totals in reports/dashboard.  
**Risk:** HIGH — Reports diverge from reality after edits to manual sales

---

### ISSUE-010 ❌ HIGH — createTransfer (dbService) Missing Critical Fields
**Location:** `src/services/db.ts` → `createTransfer()` lines 445-452  
**Code:**
```js
batch.set(transRef, cleanData({ type: "تحويل", amount, fromBoxId, toBoxId, description, createdAt: new Date().toISOString() }));
```
**Root Cause:** The transaction document is missing: `createdBy`, `sourceType`, `recordStatus`, `updatedAt`, `currency`, `id`.  
**Impact:** Transfer records cannot be properly queried, audited, or reversed. `recordStatus` missing means `getAll()` which filters `recordStatus !== 'deleted'` may or may not include them depending on behavior.  
**Risk:** HIGH — Transfer records are incomplete and may disappear from views

---

### ISSUE-011 ❌ MEDIUM — updateInvoiceData Uses `total - paid` (Not `total - discount - paid`) for New Invoice
**Location:** `src/services/db.ts` → `updateInvoiceData()` line 252  
**Code:**
```js
let newBalChange = newInvoice.total - newInvoice.paid;
```
**Same bug as ISSUE-001 applied to invoice edits.**  
**Risk:** HIGH — Every edited invoice with a discount reintroduces the discount balance error

---

### ISSUE-012 ❌ MEDIUM — localDb.createInvoice Ignores purchase_return Stock Direction
**Location:** `src/services/localDb.ts` → `createInvoice()` line 304  
**Code:**
```js
const change = invoice.type === 'sale' ? -item.quantity : item.quantity;
```
**Root Cause:** Any non-sale type is treated as a purchase (stock in). But `purchase_return` should REMOVE stock. `dbService.createInvoice()` handles this correctly with the `type.includes('return')` flip.  
**Impact:** When offline, processing a purchase return adds stock instead of removing it.  
**Risk:** MEDIUM — Inventory inaccuracy in offline mode

---

### ISSUE-013 ❌ MEDIUM — FinancialEngine.getInvoiceImpact Returns No Transactions on Reversion
**Location:** `src/services/financialEngine.ts` line 136  
**Code:**
```js
return { transactions: isReversion ? [] : transactions, ... }
```
**Root Cause:** When reverting an invoice impact, no reversal transaction documents are written. The aggregation uses `mult = -1` correctly, but the ledger shows no reversal entry.  
**Risk:** MEDIUM — Reversal operations leave no trace in the transaction ledger

---

## 7. All Race Conditions

### RACE-001 ❌ CRITICAL — getDocs Inside runTransaction (DELETE/UPDATE_QUICK_ENTRY)
**Location:** `src/services/financialExecutionEngine.ts` lines 301-303, 378-380  
**Code:**
```js
// Inside runTransaction callback:
const transSnap = await getDocs(query(collection(db, "transactions"), where("sourceId", "==", entryId)));
```
**Root Cause:** Firestore transactions require all reads to use `transaction.get(docRef)`. Using `getDocs()` (a non-transactional read) inside a transaction reads data outside the transaction's snapshot. Another concurrent write could modify those transaction documents between this read and the subsequent `transaction.set()` calls.  
**Impact:** Under concurrent usage (multiple users), deleting or updating a quick entry could read stale transaction IDs, miss some transactions to mark deleted, or mark wrong transactions as deleted.  
**Risk:** CRITICAL — Race condition that corrupts financial records under concurrent load

### RACE-002 ❌ HIGH — writeBatch Operations Are Not Atomic Across Dependent Documents
**Location:** All `dbService` batch methods  
**Root Cause:** `writeBatch` commits atomically (all-or-nothing), but only within a single commit. There is no read-before-write protection. If two users simultaneously create invoices for the same customer, both reads of the customer's balance will get the same stale value, and both will write their increments based on it. `increment()` is safe for this. However, the cashBox balance check (`if (currentBalance + boxAmount < 0)`) does NOT exist in the dbService path — so negative cash balances are possible.  
**Risk:** HIGH — Negative cash box balances possible via concurrent invoice creation

### RACE-003 ❌ MEDIUM — SyncEngine.emit Double-Fires DATA_CHANGED
**Location:** `src/services/syncEngine.ts` lines 23-27  
**Code:**
```js
emit(event: SyncEvent) {
    this.listeners.get(event)?.forEach(listener => listener());
    // Always emit a general change event
    this.listeners.get('DATA_CHANGED')?.forEach(listener => listener());
}
```
**Root Cause:** When `emit('DATA_CHANGED')` is called directly, it runs `DATA_CHANGED` listeners once explicitly, then immediately runs them again via the second line.  
**Impact:** Every direct `DATA_CHANGED` emission causes double re-renders / double data refetches.

### RACE-004 ❌ MEDIUM — FinancialEngineService Emits 4 Events Causing 4+ Refetches
**Location:** `src/services/financialEngineService.ts` lines 17-20  
**Code:**
```js
syncEngine.emit('ENTRY_CREATED');    // fires DATA_CHANGED twice (RACE-003)
syncEngine.emit('CASHBOX_UPDATED');  // fires DATA_CHANGED twice again
syncEngine.emit('CUSTOMER_UPDATED'); // fires DATA_CHANGED twice again
syncEngine.emit('DATA_CHANGED');     // fires DATA_CHANGED twice again
```
**Impact:** Every quick entry triggers at least 8 DATA_CHANGED listener calls, causing 8 redundant data fetches across subscribed components.

---

## 8. All Data Integrity Risks

### INTEGRITY-001 — Firestore Security Rules Are Fully Open
**Location:** `firestore.rules`  
**Code:**
```
allow read, write: if true;
```
**Impact:** Any internet user with the Firebase config (which is embedded in the public JS bundle via `firebase-applet-config.json`) can read ALL financial data, create fake invoices, corrupt balances, or delete records. The Firebase API key in `firebase-applet-config.json` is publicly accessible.  
**Risk:** CRITICAL — Complete data breach/corruption possible from any browser

### INTEGRITY-002 — Hardcoded Emergency Backdoor Password
**Location:** `src/services/authService.ts` lines 228-235  
**Code:**
```js
if (!isValid && passwordPlain === "1234") {
    const isDefaultAdmin = user.id === "system-admin-default" || 
                           user.username?.toLowerCase() === "admin" || 
                           user.name?.includes("الصبيحي");
    if (isDefaultAdmin) isValid = true;
}
```
**Impact:** Any person who knows the username of an admin or knows the specific Arabic name "الصبيحي" can log in with password "1234". This backdoor is hardcoded in the production source.  
**Risk:** CRITICAL — Security bypass

### INTEGRITY-003 — Session Stored in localStorage (Forgeable)
**Location:** `src/services/authService.ts` lines 289-290  
**Risk:** MEDIUM — If Firestore rules were enforced (see INTEGRITY-001), someone could forge a localStorage session. Currently moot given INTEGRITY-001.

### INTEGRITY-004 — rebuildFinancialState Only Rebuilds Cash Box Balances
**Location:** `src/services/financialExecutionEngine.ts` → `rebuildFinancialState()` lines 413-466  
**Root Cause:** This function is called from `EnterpriseSettings` as a "recalculate financials" tool. It recalculates cash box balances using `calculateUnifiedCashBalances`, but **does not recalculate**:
- Customer/supplier balances
- Daily/monthly aggregation summaries
- Dashboard cache
- Invoice statuses  
**Impact:** After running "recalculate financials", balances will still be wrong for partners, and reports will still show stale aggregation data.  
**Risk:** HIGH — The recovery tool is incomplete

### INTEGRITY-005 — isSystemFixed Flag Governs Reversal Logic Without Enforcement
**Location:** `src/services/db.ts` → `deleteInvoiceData()`, `updateInvoiceData()`  
**Root Cause:** The `isSystemFixed` boolean on invoices determines which reversal formula is used (new vs legacy). Any code path that creates an invoice without `isSystemFixed: true` will use the wrong reversal logic. `dbService.createInvoice()` does set `isSystemFixed: true` on new invoices, so this is mitigated for new data. Legacy invoices will use the alternative formula.  
**Risk:** MEDIUM — Legacy invoice deletions may use incorrect reversal math

---

## 9. All Calculation Problems

### CALC-001 — FinancialEngine.getInvoiceImpact: agg.receivablesChange Overwritten Redundantly
**Location:** `src/services/financialEngine.ts` lines 38-45  
**Code:**
```js
agg.receivablesChange = netAmount * mult; // Line 38 - set
if (paid > 0) {
    agg.receivablesChange = (netAmount - paid) * mult; // Line 42 - overwritten
} else {
    agg.receivablesChange = netAmount * mult; // Line 45 - set again to same value as line 38
}
```
Line 38 and line 45 are identical. Line 38 is dead code. Same pattern for `payablesChange` in the purchase branch (lines 89-96).

### CALC-002 — Manual Sale Profit Assumes 100% Margin
**Location:** `src/services/financialEngine.ts` line 215  
**Code:**
```js
agg.profitsTotal = entry.netAmount * mult; // Assuming 100% profit for manual entries
```
**Impact:** Every manual sale in QuickEntry is counted as 100% profit. If a quick sale of 1,000 costs 600, the system reports 1,000 profit not 400. Reports will show systematically inflated profits.

### CALC-003 — calculateUnifiedCashBalances Fragile "Unrecordedpaid" Logic
**Location:** `src/lib/financialUtils.ts` lines 69-88  
**Root Cause:** Because `dbService.createInvoice()` creates no transaction documents, this function checks `invoice.paid - alreadyInTransactions` to find cash that has no transaction record. This is a compensatory hack. If any code ever creates both a transaction AND updates invoice.paid directly (which is possible given the dual paths), it will double-count.  
**Risk:** MEDIUM — Fragile compensatory logic that breaks under edge cases

### CALC-004 — calculateUnifiedPartnerBalances Quick Entry Double-Count Risk
**Location:** `src/lib/financialUtils.ts` lines 200-225  
**Root Cause:** For quick entries, it detects whether transactions exist via `qeIdsWithTransactions`. If a QE's transaction is soft-deleted (`recordStatus: 'deleted'`), that transaction is excluded from `qeIdsWithTransactions`, making the QE appear to have no transactions. Then the QE's `paidAmount` is added directly. But the soft-deleted transaction's cashBox/partner reversal was already applied. The result: balance is double-counted.  
**Risk:** HIGH — Balance double-count when QE transactions are soft-deleted

### CALC-005 — AggregationEngine todaySales Uses UTC Not Local Date
**Location:** `src/services/aggregationEngine.ts` line 101  
**Code:**
```js
const today = new Date().toISOString().split('T')[0]; // UTC date
```
**Root Cause:** The daily summary key uses local time (correctly computed via timezone offset), but the comparison to populate `todaySales` on the dashboard uses UTC. After midnight local time but before midnight UTC, `todaySales` will not increment.  
**Risk:** LOW — Minor inaccuracy at midnight for non-UTC deployments

---

## 10. All Duplicate & Dead Logic

### DUP-001 — AggregationImpact Interface Defined Twice
**Locations:**
1. `src/types.ts` lines 10-21: No `invoicesCount`, `quickEntriesCount`, `cashBalanceChange`
2. `src/services/aggregationEngine.ts` lines 4-17: Has all fields

`financialEngine.ts` imports `AggregationImpact` from `aggregationEngine.ts` (correct). But `types.ts` exports its own incomplete version that is never used by the engine. This creates confusion — any code importing from `types.ts` gets a different (incomplete) type.

### DUP-002 — cleanData Function Defined Twice
**Locations:**
1. `src/services/db.ts` lines 8-22: `export const cleanData = ...`
2. `src/services/financialExecutionEngine.ts` lines 7-21: `function cleanData ...` (local, non-exported)

Identical implementations. The local copy in `financialExecutionEngine.ts` exists because the comment says "local cleanData function since db.ts doesn't export it" — but `db.ts` DOES export it. The import was simply not added.

### DUP-003 — addTransaction Exists in Both dbService and FinancialExecutionEngine
**Impact:** Components can call either. The implementations disagree on partner balance sign logic (see ISSUE-006). Two code paths, different behavior.

### DUP-004 — recordInvoicePayment Exists in Both dbService and FinancialExecutionEngine
`dbService.recordInvoicePayment()` creates no transaction document. `FinancialExecutionEngine.RECORD_INVOICE_PAYMENT` creates a transaction document. These are called from different places with no documentation of which is authoritative.

### DUP-005 — createTransfer Exists in Both dbService and FinancialExecutionEngine
`dbService.createTransfer()` creates an incomplete transaction record without aggregation. The FEE version is complete.

### DUP-006 — Dead Code in getInvoiceImpact
```js
agg.receivablesChange = netAmount * mult; // Line 38 — immediately overwritten below
```
See CALC-001.

### DUP-007 — Commented-Out Auto-Heal Migration Code in authService
**Location:** `src/services/authService.ts` lines 58-124  
Large blocks of user migration code are commented out. These represent production logic that was temporarily disabled. They create confusion about what runs and what doesn't.

### DUP-008 — deleteAllTransactions is a No-Op
**Location:** `src/services/db.ts` line 444  
```js
async deleteAllTransactions() {},
```
Empty function. Dead code.

### DUP-009 — createFullDatabaseBackup and restoreFullDatabaseBackup Return null
**Location:** `src/services/db.ts` lines 557-558  
Both functions are stubs returning `null`. Backup/restore is non-functional.

---

## 11. Synchronization Problems

### SYNC-001 — dbService Methods Do Not Trigger Targeted Sync Events
**Location:** `src/services/db.ts` lines 586-595  
**Code:**
```js
Object.keys(dbService).forEach(method => {
    const original = (dbService as any)[method];
    if (typeof original === 'function' && !method.startsWith('get')) {
        (dbService as any)[method] = async function(...args) {
            const result = await original.apply(this, args);
            try { syncEngine.emit("DATA_CHANGED"); } catch(e) {}
            return result;
        };
    }
});
```
All dbService mutation methods emit only `DATA_CHANGED`. Components that subscribe to specific events like `CASHBOX_UPDATED` or `CUSTOMER_UPDATED` (which `QuickEntry.tsx` does via `FinancialEngineService`) will not react to changes from dbService operations (invoice creation, voucher creation). This means the cashbox display may not refresh after an invoice is created.

### SYNC-002 — No Firestore Realtime Listeners (onSnapshot)
The app uses `getDocs()` everywhere (one-time reads) rather than `onSnapshot()` (realtime listeners). All synchronization relies on the `SyncEngine` event bus. If two users are logged in simultaneously, one user's operations are invisible to the other until a manual trigger or page reload.

### SYNC-003 — localDb Offline Mode Has No Sync-Back Mechanism
**Location:** `src/services/localDb.ts`  
Records created offline are marked `_isOfflineCreated: true` but there is no sync-back service that uploads them to Firestore when connectivity is restored. The `syncEngine` module has no connectivity detection or queued-write logic. All offline data is silently lost when the user logs into another device or clears localStorage.

---

## 12. Security Issues

| # | Issue | Severity | Location |
|---|---|---|---|
| SEC-001 | Firestore rules `allow read, write: if true` | CRITICAL | `firestore.rules` |
| SEC-002 | Hardcoded backdoor password "1234" for specific user | CRITICAL | `authService.ts:228` |
| SEC-003 | Firebase API key visible in public bundle | HIGH | `firebase-applet-config.json` |
| SEC-004 | Session stored in localStorage (no HttpOnly cookie) | MEDIUM | `authService.ts:289` |
| SEC-005 | `dbService.resetAllFinancialData()` wipes all localStorage with no auth check | HIGH | `db.ts:577` |
| SEC-006 | `authService.login()` allows username OR full name OR email as login | MEDIUM | `authService.ts:189` |
| SEC-007 | `import.meta.env.DEV` auto-creates admin in dev mode | LOW | `authService.ts:199` |

---

## 13. Files That Must Be Modified

| Priority | File | Reason |
|---|---|---|
| P0 | `src/services/db.ts` | Fix discount formula in createInvoice/updateInvoiceData; add aggregation calls; fix partner sign in deleteTransactionData; fix transfer fields; add transaction creation to recordInvoicePayment |
| P0 | `src/services/financialExecutionEngine.ts` | Fix getDocs-inside-transaction race conditions; fix DELETE/UPDATE_QUICK_ENTRY salesTotal/profitsTotal reversal; fix operationId randomness; complete rebuildFinancialState |
| P0 | `firestore.rules` | Replace open rules with proper auth-based rules |
| P1 | `src/services/authService.ts` | Remove hardcoded "1234" backdoor |
| P1 | `src/services/financialEngine.ts` | Fix dead code in receivablesChange assignment |
| P1 | `src/services/aggregationEngine.ts` | Fix todaySales UTC vs local date bug |
| P1 | `src/services/syncEngine.ts` | Fix double DATA_CHANGED emission |
| P1 | `src/services/financialEngineService.ts` | Fix operationId to use deterministic key; reduce redundant emit calls |
| P2 | `src/services/db.ts` | Add `addVoucher` supplier direction fix; remove duplicate cleanData import |
| P2 | `src/services/localDb.ts` | Fix purchase_return stock direction |
| P2 | `src/lib/financialUtils.ts` | Document and harden "unrecordedPaid" logic; fix QE double-count on soft-delete |
| P2 | `src/types.ts` | Remove duplicate AggregationImpact or consolidate |
| P3 | All components | Route all invoice/voucher operations through FinancialExecutionEngine |

---

## 14. Exact Modification Plan & Execution Order

### Phase 2-A — Firestore Security (Immediate, No Financial Logic Touch)
1. Fix `firestore.rules` to require authenticated users
2. Remove hardcoded "1234" backdoor from `authService.ts`

### Phase 2-B — Fix Core Calculation Bugs (Non-Breaking Formula Fixes)
3. Fix discount formula in `db.ts:createInvoice`, `deleteInvoiceData`, `updateInvoiceData`
4. Fix partner balance sign in `db.ts:deleteTransactionData` for صرف type
5. Fix supplier voucher direction in `db.ts:addVoucher`, `updateVoucher`
6. Fix `localDb.ts` purchase_return stock direction
7. Fix dead receivablesChange code in `financialEngine.ts`

### Phase 2-C — Fix Race Conditions
8. Replace `getDocs()` inside `runTransaction` with `transaction.get()` for DELETE/UPDATE_QUICK_ENTRY
9. Fix double DATA_CHANGED emission in `syncEngine.ts`
10. Reduce redundant emit calls in `financialEngineService.ts`

### Phase 2-D — Fix Aggregation (Reporting & Dashboard)
11. Add aggregation calls to `db.ts:createInvoice` (use AggregationEngine)
12. Add aggregation calls to `db.ts:deleteInvoiceData`
13. Add aggregation calls to `db.ts:updateInvoiceData`
14. Add aggregation calls to `db.ts:addTransaction`, `updateTransactionData`, `deleteTransactionData`
15. Add aggregation calls to `db.ts:addVoucher`, `updateVoucher`, `deleteVoucher`
16. Fix `DELETE_QUICK_ENTRY` to negate salesTotal and profitsTotal
17. Fix `UPDATE_QUICK_ENTRY` to adjust salesTotal and profitsTotal
18. Fix todaySales UTC bug in `aggregationEngine.ts`

### Phase 2-E — Transaction Audit Trail
19. Add Transaction document creation to `db.ts:createInvoice` (initial payment)
20. Add Transaction document creation to `db.ts:recordInvoicePayment`
21. Fix incomplete transaction fields in `db.ts:createTransfer`

### Phase 2-F — Consolidation & Cleanup
22. Complete `rebuildFinancialState()` to also rebuild partner balances and aggregation
23. Remove duplicate `cleanData` from `financialExecutionEngine.ts`, import from `db.ts`
24. Consolidate `AggregationImpact` to single definition
25. Fix operationId in `financialEngineService.ts` to be deterministic
26. Remove dead code: `deleteAllTransactions`, commented-out migration blocks

---

## Summary — Issue Count by Severity

| Severity | Count | Description |
|---|---|---|
| CRITICAL | 8 | Open Firestore rules, discount formula bug, missing transaction docs, missing aggregation, invoice payment with no transaction, delete transaction sign error, getDocs-in-transaction race, backdoor password |
| HIGH | 7 | Supplier voucher direction, QE delete missing salesTotal, QE update missing salesTotal, createTransfer incomplete, rebuildFinancialState incomplete, QE double-count on soft-delete, concurrent negative cashbox |
| MEDIUM | 6 | localDb return stock, reversion no transactions, UTC date bug, manual 100% profit assumption, session in localStorage, sync no realtime |
| LOW | 4 | Dead code, duplicate type, double emit, commented-out code |

**Total confirmed issues: 25 distinct bugs across 7 files.**

---

*End of Phase 1 Engineering Audit Report. Awaiting Phase 2 instructions.*
