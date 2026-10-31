# Lazada Thailand connection

Apply `sql/010-lazada-connection.sql` to the ERP database before deployment. Set up a Seller In-house APP in Lazada Open Platform with callback `https://erp.ns-labs.com/api/lazada/callback`, then save its App Key and App Secret on `/lazada` while signed in to ERP. Authorize the shop through Lazada's own seller login and consent screen.

App credentials and access/refresh tokens are encrypted using the existing server session secret, in PostgreSQL, and never returned to clients. Back up that secret with the database. Saving credentials replaces the current connection and requires reauthorization. OAuth state is random, encrypted, short-lived and bound to the ERP user and App Key. The callback consumes its state cookie.

Only Thailand tokens are accepted. Requests use a fixed API allowlist and HMAC SHA256 signatures. The read-only connection check loads the latest ten orders from the last thirty days, exposing order IDs, status, amounts and item counts only. It does not store or display buyer identity/address fields, alter listings or shipments, or deduct Lazada inventory. Refreshable tokens are refreshed before a connection check when near expiry; expired refresh authorization requires reconnecting.

Official references: https://open.lazada.com/apps/doc/doc?docId=108260&nodeId=10533 and https://open.lazada.com/apps/doc/doc?docId=108068&nodeId=10400
