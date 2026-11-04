# Security Specification - X-Ray Inventory Management

## 1. Data Invariants
- `Item`: `currentStock` must be updated atomically with a `Transaction`.
- `Transaction`: `quantity` must be positive.
- `Category` & `Department`: Names must be unique-ish (checked by client, but protected from junk by rules).
- `Admin`: Only `manhha2@gmail.com` can perform bulk resets.

## 2. The "Dirty Dozen" Payloads (to be blocked)
1. **Unauthorized Write**: Create an item without being signed in.
2. **Identity Spoofing**: Create a transaction with `request.auth.uid` of another user (though it's not and admin-only system yet, tracking who did what is good).
3. **Resource Poisoning**: Create an item with a 1MB string as name.
4. **Negative Stock**: Create a transaction with negative quantity.
5. **Orphaned Transaction**: Create a transaction for a non-existent item.
6. **Self-Promotion**: (Not applicable yet, but good to keep in mind).
7. **Junk ID**: Use a 2KB string as a document ID.
8. **Shadow Update**: Add a `verified: true` field to an item during update.
9. **History Manipulation**: Update a transaction's timestamp or quantity after creation.
10. **PII Leak**: (Not much PII here besides names, but we'll restrict reads to signed-in users).
11. **Bulk Delete**: Non-admin attempting to delete all items.
12. **Status Shortcut**: (Not applicable here as there are no terminal states yet).

## 3. Test Runner (Draft)
A `firestore.rules.test.ts` would verify these. For this turn, we'll focus on the rules themselves.
