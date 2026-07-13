---
name: Phase 3 Bug Fixes
description: Seven confirmed bugs patched in the Phase 3 audit; what was wrong and how each was fixed.
---

## Bugs fixed

### B1 — aggregationEngine.ts: UTC vs local-timezone date mismatch
`todaySales`/`monthSales` used `new Date().toISOString().split('T')[0]` (UTC) while
`dateStr` was computed with a local-timezone offset. For users in UTC+N, today's sales
would land on the wrong day bucket after midnight UTC.
**Fix:** Subtract `getTimezoneOffset() * 60000` before calling `.toISOString()` to produce
a local YYYY-MM-DD, matching how `dateStr` is built.

### B2 — Dashboard.tsx: balance card permanently stale
No `syncEngine.subscribe('DATA_CHANGED', ...)` in Dashboard's `useEffect`. The balance
card only refreshed on mount (or full page reload).
**Fix:** Added `syncEngine.subscribe('DATA_CHANGED', loadDashStats)` inside the effect
with `unsubscribe()` in the cleanup return.

### B3 / B4 — financialExecutionEngine.ts: Firestore read-after-write in CREATE_INVOICE and CREATE_QUICK_ENTRY
Auto-create-partner `txn.set()` writes fired before cashBox `txn.get()` reads, violating
Firestore's documented transaction read-before-write rule.
**Fix:** Generate partner doc IDs locally (no Firestore write needed for the ID), compute
accounting with those IDs, do ALL reads (cashBox validation), then do ALL writes
(partner create, invoice/QE create, cashBox update, etc.).

### B5 — db.ts: recalculateFinancials not emitting DATA_CHANGED
`recalculateFinancials` was in the `NON_MUTATING` set, so the proxy wrapper skipped the
`DATA_CHANGED` event. After a full financial rebuild the UI stayed stale.
**Fix:** Removed `recalculateFinancials` from `NON_MUTATING`.

### B6 / B7 — financialExecutionEngine.ts: missing boxId guard in ADD_VOUCHER / DELETE_VOUCHER
`txn.set(doc(db, "cashBoxes", voucher.boxId), ...)` was called without checking whether
`voucher.boxId` exists. A null/undefined boxId would create or update `cashBoxes/undefined`.
**Fix:** Wrapped both cashBox writes in `if (voucher.boxId) { ... }`.

### B8 — financialExecutionEngine.ts UPDATE_VOUCHER: write-before-read + no balance validation
Voucher `txn.set` fired on the first line, before any reads. Also, no cashBox balance
check — increasing a payment voucher amount could silently take a cashBox negative.
**Fix:** Compute `boxChanges` (pure local arithmetic), loop reads for any box with a
negative net change and throw if insufficient, then do all writes.

## Remaining known risks (not fixed — require product decision)
- Customer "payment" voucher direction in `financialUtils.calculateUnifiedPartnerBalances`:
  rebuild path always does `paid += amount` regardless of voucher type; FEE live path
  does `balance += amount` for customer payment vouchers. Rare edge case; fixing it could
  reinterpret existing data.
- `financialUtils.calculateUnifiedPartnerBalances` QE: computes `netAmount = amount - discount`
  instead of using `qe.netAmount`. Equivalent for well-formed docs; safe for now.

## Phase 3 (cont.) — User-reported issues fixed

### Invoice not appearing in sales window
Root causes:
1. `dateFilterType` defaulted to `'today'` — any prior-day invoice was immediately hidden
2. `getPaginated` never used `startAfter(lastVisible)` and had no `orderBy` — Firestore
   returned 25 docs in document-ID order; clicking Load More re-fetched the same 25

Fix: Invoices.tsx now uses `getAll("invoices")` + client-side type filter + `displayCount`
client-side pagination (25 per page, "Load More" increments). Default date filter changed
to `'all'`. `getPaginated` fixed to use `orderBy('createdAt','desc')` + `startAfter` when
there are no equality filters.

### Receipt voucher not updating invoice / not in customer account
Root cause: `handleAddVoucher` in FEE never created a transaction document (so voucher was
invisible in partner account statements) and had no invoice-link logic.

Fix:
- `handleAddVoucher` now creates a transaction doc (appears in partner statements) and if
  `voucher.invoiceId` is set, reads the invoice first then updates its `paid`/`status`.
- `handleDeleteVoucher` deletes the linked transaction and reverses the invoice update.
- Vouchers.tsx form now shows an invoice dropdown (highlighted amber) when type=receipt +
  customer + partner has outstanding invoices.
- `invoiceId` and `transactionId` fields added to the `Voucher` interface.

### Partners totals (إجمالي المبيعات / المسدد / المتبقي) always zero
Root cause: `partnerTotalsMap` memo set `total: 0, paid: 0` and never computed them.

Fix: Accumulate sale/purchase invoice netAmounts per partner; derive `paid = total − remaining`
(remaining = `partner.balance`, the FEE-authoritative value).

### getPaginated never used cursor
Fixed to use `orderBy('createdAt','desc')` + `startAfter(lastVisible)` when no equality
filters are active. Filtered queries must use `getAll` + client-side filter to avoid
composite Firestore index requirement.

## Build status after all fixes
`npx tsc --noEmit` → 1 error in `vite.config.ts` (`allowedHosts: boolean` type mismatch).
This is a **pre-existing** error unrelated to any Phase 2/3 work. All other files compile clean.
