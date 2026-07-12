---
name: Phase 2 Financial Engine Refactor
description: Complete unification of financial write paths into a single FinancialExecutionEngine. All accounting now flows through one pipeline.
---

## The Rule
`FinancialExecutionEngine` in `src/services/financialExecutionEngine.ts` is the ONE AND ONLY engine. `dbService` financial methods are thin wrappers that call it. No balance/aggregation logic anywhere else.

**Why:** Two parallel write paths (dbService batch-writes vs FEE transactions) caused 25 confirmed bugs including silent balance corruption, no transaction documents for invoices, and stale dashboard data.

## Architecture
- 14 operation types: CREATE/UPDATE/DELETE_INVOICE, RECORD_INVOICE_PAYMENT, ADD/UPDATE/DELETE_TRANSACTION, CREATE_TRANSFER, ADD/UPDATE/DELETE_VOUCHER, CREATE/UPDATE/DELETE_QUICK_ENTRY
- Pre-fetch phase (outside runTransaction) eliminates getDocs-inside-transaction race
- Idempotency: every operation has a UUID operationId stored in `financial_operations` Firestore collection
- Audit logs written INSIDE runTransaction for ACID consistency

## Key Decisions
- Discount formula: `netAmount = total - discount; remaining = netAmount - paid` everywhere
- Partner balance: always `increment(-amount)` for both قبض and صرف (payment reduces liability)
- CashBox: `+amount` for قبض, `-amount` for صرف
- Reads BEFORE writes in every handler (Firestore transaction rule)
- `negateImpact()` helper for clean aggregation reversals

**How to apply:** Any new financial operation MUST go through `FinancialExecutionEngine.execute()`. Never write to partners/cashBoxes/aggregation directly from components or dbService.

## Bugs Still Present (known)
- UTC "today" comparison for todaySales in aggregationEngine (low impact, Yemen is UTC+3)
- localDb offline fallback has wrong purchase_return stock direction (read-only path, no writes)
- Firestore rules lack Firebase Auth UID enforcement (acceptable for single-tenant LAN use; TODO when going multi-tenant)
