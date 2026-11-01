# Lazada Thailand connection

Apply `sql/010-lazada-connection.sql` to the ERP database before deployment. Set up a Seller In-house APP in Lazada Open Platform with callback `https://erp.ns-labs.com/api/lazada/callback`, then save its App Key and App Secret on `/lazada` while signed in to ERP. Authorize the shop through Lazada's own seller login and consent screen.

App credentials and access/refresh tokens are encrypted using the existing server session secret, in PostgreSQL, and never returned to clients. Back up that secret with the database. Saving credentials replaces the current connection and requires reauthorization. OAuth state is random, encrypted, short-lived and bound to the ERP user and App Key. The callback consumes its state cookie.

Only Thailand tokens are accepted. Requests use a fixed API allowlist and HMAC SHA256 signatures. The read-only order refresh loads up to the latest 100 orders from the last thirty days, exposing order IDs, status, amounts and item counts, plus product names, seller SKUs, variants, quantities and public product thumbnails from batched /orders/items/get requests. It does not store or display buyer identity/address fields, alter listings or shipments, or deduct Lazada inventory. Refreshable tokens are refreshed before a connection check when near expiry; expired refresh authorization requires reconnecting.

Official references: https://open.lazada.com/apps/doc/doc?docId=108260&nodeId=10533 and https://open.lazada.com/apps/doc/doc?docId=108068&nodeId=10400

## Permanent order history
Apply sql/011-lazada-history.sql before deployment. Run docker exec -d nslabs-erp-erp-1 node scripts/import-lazada-history.mjs for the initial historical import. The importer starts at 2010-01-01, paginates all accessible orders, splits date windows above the API offset limit, and checkpoints after each saved page. Re-running resumes interrupted progress. It stores sanitized orders/items and observed status events per seller and order ID; no buyer names, addresses or phone numbers are stored.

The Lazada page reads the full saved history without a 30-day/100-order display cap. Refresh data imports changes since the last successful sync using a five-minute overlap and retains older records. Existing saved data remains available when Lazada cannot refresh. An import is only marked complete after every page and its product details have been processed.

