# Etsy connection

Apply `sql/012-etsy.sql` to the ERP database before deployment:

    docker exec -i postgresql psql -U natthabhat -d "ns labs" -v ON_ERROR_STOP=1 < sql/012-etsy.sql

## Etsy app

Create a **Seller App** at https://www.etsy.com/developers/register-seller-app (own shop only; eligible sellers are approved within minutes). In the app, add the callback URL `https://erp.ns-labs.com/api/etsy/callback`. Open `/etsy` in the ERP, save the app's **Keystring** and **Shared secret**, then click **Connect Etsy shop** and approve on Etsy.

The ERP requests the read-only scopes `transactions_r`, `listings_r` and `shops_r`. It uses OAuth 2.0 with PKCE (S256); the state and code verifier are kept in an encrypted, ten-minute cookie bound to the ERP user and keystring, and the callback consumes it. Keys and tokens are encrypted with the server session secret in PostgreSQL and never returned to the browser. Every request sends `x-api-key: <keystring>:<shared secret>`; only `users/me`, `shops/{id}` and `shops/{id}/receipts` reads and the token grant are allowed. Access tokens (1 hour) are refreshed before use; the refresh token lasts 90 days, after which the shop must be connected again.

## Orders

The first **Refresh data** imports the full receipt history, 100 receipts per page, and saves progress after each page, so an interrupted import resumes where it stopped. Later refreshes read receipts modified since the last sync, with a five-minute overlap. Delivered receipts are found with Etsy's `was_delivered` filter.

Status: paid and not shipped is **To ship**, shipped is **Shipped**, delivered is **Complete**. Cancelled, fully refunded, open and payment-processing receipts are stored but hidden. Amounts are kept in the shop currency with a THB equivalent at the ECB daily reference rate (frankfurter.app), which the dashboard totals use.

Stored per receipt: receipt ID, status flags, timestamps, totals, shipping cost, destination country, carrier names, and line items (title, SKU, variation, quantity, price, listing ID). Buyer names, addresses, emails, messages and tracking codes are not stored. Product photos come from the ERP catalogue by SKU. The connection does not change anything on Etsy and does not deduct ERP stock.
