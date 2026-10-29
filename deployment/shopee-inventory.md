# Shopee stock deductions

Apply `sql/009-shopee-inventory.sql` before deploying this version. Its singleton setting records activation time once; rerunning the migration does not reset it. Only orders created after that time qualify. Export timestamps without offsets are interpreted in Asia/Bangkok. Existing shipped/completed history is not deducted.

Run `docker exec nslabs-erp-erp-1 node scripts/sync-shopee-inventory.mjs` every minute on the server, with `flock` to prevent overlapping jobs. This imports the collector's report even when nobody has ERP open. The same reconciliation runs on Shopee page reads. Collection frequency remains controlled by n8n.

Stock matching uses exact variant sub-SKU, or exact product SKU for products without variants. Parent/prefix image matching is deliberately not used for stock. Missing/ambiguous matches and shortages remain pending and retry after catalogue or stock corrections. Stock never goes negative. The order details identify pending items.

Each order line records its applied quantity. Refreshes and status transitions do not repeat deductions; quantity corrections apply only the difference. All stock updates, product versions and movement records commit in one PostgreSQL transaction, with advisory locking shared with product editing. `shopee_stock_movements` retains the audit trail independently of catalogue edits.

The collector currently imports To ship, Shipped and Complete only. Disappearance from a report is not proof of cancellation, so cancellations/returns do not automatically restore stock.

The optional PostgreSQL integration test uses connection-local temporary tables and never changes real inventory: `TEST_SHOPEE_INVENTORY_DATABASE=1 node --test tests/shopee-inventory.test.mjs` with the ERP's existing DATABASE_URL.
