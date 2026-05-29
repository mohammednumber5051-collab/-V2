# Optical Accounting System - Security Specification

This document defines the security architecture and validation logic for the enterprise-grade production deployment.

## 1. Data Invariants

1. **Identity & Ownership**: 
   - A document can only be created by an authenticated user.
   - User `sessionVersion` must match the persistent session payload strictly.
   - Document `recordStatus` must be either `active`, `archived`, or `deleted`.

2. **Accounting Integrity**:
   - Total `amount` in transactions for an invoice MUST equal the invoice's `paid` or `total` depending on logic.
   - `boxId` balance must only be updated by audited transactions.
   - Once an invoice is `approved` (lifecycleStatus == 'معتمد'), it becomes READ-ONLY for non-admins. Edits must be handled by reversals.

3. **RBAC Rules**:
   - `SUPER_ADMIN`: Full access to everything.
   - `ADMIN`: Access to business logic, reports, inventory, customers. Cannot manage SUPER_ADMIN accounts.
   - `ACCOUNTANT`: Access to reports, invoices, transactions. Cannot view raw user hashes.
   - `CASHIER`: Access to POS, receipts, sales invoices. Read-only inventory.
   - `EMPLOYEE`: Access to repairs, special orders, warranties.
   - `VIEWER`: Read-only access to specific dashboards.

## 2. The "Dirty Dozen" Payloads (Denial Tests)

### Payload 1: Privilege Escalation (User Creation)
```json
{
  "username": "attacker",
  "role": "SUPER_ADMIN",
  "permissions": ["*"]
}
```
*Requirement*: Deny. Only existing SUPER_ADMIN can create another.

### Payload 2: Self-Promotion (User Update)
```json
{
  "role": "SUPER_ADMIN"
}
```
*Requirement*: Deny. User cannot change their own role.

### Payload 3: Shadow Field Injection
```json
{
  "name": "Valid Product",
  "sku": "SKU123",
  "isVerifiedBySystem": true
}
```
*Requirement*: Deny via `affectedKeys().hasOnly()`.

### Payload 4: Accounting Tamper (Manual Balance Set)
```json
{
  "balance": 999999
}
```
*Requirement*: Deny. Balance updates must only happen via `increment()`.

### Payload 5: Archive Bypass (Record Deletion)
*Operation*: `DELETE /invoices/INV_001`
*Requirement*: Deny. Hard deletes prohibited for accounting records.

### Payload 6: History Rewrite (Immutable Field)
```json
{
  "createdAt": "2020-01-01T00:00:00Z"
}
```
*Requirement*: Deny. `createdAt` must match server time or be unchanged.

### Payload 7: Orphaned Invoice (Invalid Partner)
```json
{
  "items": [],
  "partnerId": "INVALID_ID"
}
```
*Requirement*: Deny. `exists(/databases/$(database)/documents/customers/$(partnerId))` check.

### Payload 8: Negative Inventory Injection
```json
{
  "stock": -100
}
```
*Requirement*: Deny. `stock` must be `>= 0`.

### Payload 9: Session Hijack (Spoofed UID)
```json
{
  "userId": "SOMEONE_ELSE_ID"
}
```
*Requirement*: Deny. `incoming().userId == request.auth.uid`.

### Payload 10: Status Leapfrogging (Invoice Approval)
```json
{
  "lifecycleStatus": "معتمد"
}
```
*Requirement*: Deny. Only `ACCOUNTANT` or higher can approve.

### Payload 11: PII Leak (Unauthorized Profile Read)
*Operation*: `GET /users/ADMIN_ID`
*Requirement*: Deny for non-owners/non-admins.

### Payload 12: Resource Exhaustion (Poisoned String)
```json
{
  "name": "A".repeat(1000000)
}
```
*Requirement*: Deny via `.size() <= MAX` constraints.

## 3. Session Lifecycle Architecture

1. **Login**: Generate `sessionVersion` and `expiresAt` (e.g., 12 hours).
2. **Persistence**: Store in encrypted or strictly scoped `localStorage`.
3. **Internal Validation**: Every fetch checks `freshUser.sessionVersion == localSession.version`.
4. **Heartbeat**: Every interaction updates `lastActivity`. If `now - lastActivity > 15mins`, session locked.
5. **Revocation**: Password change increments `sessionVersion` in user doc, instantly invalidating all current tokens.
