# eBay connection

Apply `sql/013-ebay.sql` to the ERP database before deployment:

    docker exec -i postgresql psql -U natthabhat -d "ns labs" -v ON_ERROR_STOP=1 < sql/013-ebay.sql

## eBay developer setup

1. Join the eBay Developers Program and create a **Production** keyset (App ID, Dev ID, Cert ID).
2. **Marketplace account deletion** (required before eBay activates production keys): under *Alerts & Notifications*, enter the endpoint `https://erp.ns-labs.com/api/ebay/account-deletion` and the verification token shown on the ERP's eBay page (Connection settings). eBay calls the endpoint with a `challenge_code`; it answers with `sha256(challengeCode + verificationToken + endpoint)`. The token is derived from the server session secret, so it works before any keys are saved. Deletion notices are acknowledged with 204: the ERP stores no eBay buyer identity, so there is nothing to delete.
3. Under *User Tokens*, add a **RuName** (eBay Redirect URL name) whose *auth accepted URL* is `https://erp.ns-labs.com/api/ebay/callback`.
4. In the ERP, open `/ebay`, save the App ID, Cert ID and RuName, click **Connect eBay account**, and sign in on eBay.

Scopes: `sell.fulfillment.readonly`, `sell.finances`, `commerce.identity.readonly`. Keys and tokens are encrypted with the session secret in PostgreSQL and never returned to the browser. OAuth state is random, encrypted, bound to the ERP user and App ID, and consumed by the callback. Token requests use Basic `client_id:client_secret`; access tokens (2 hours) are refreshed before use, and the refresh token lasts about 18 months, after which the account must be connected again (the page shows the date). Only `commerce/identity/v1/user/`, `sell/fulfillment/v1/order` and `sell/finances/v1/payout` reads are allowed. Finances calls send the account's registration marketplace in `X-EBAY-C-MARKETPLACE-ID`. Digital signatures are only required for EU/UK sellers and are not implemented.

## Orders and payouts

The first **Refresh data** imports orders created in the last two years (eBay's limit) in a fixed window, 200 per page, saving progress after each page so an interrupted import resumes. Later refreshes read orders modified since the last sync, with a five-minute overlap. Payouts from the last five years are refreshed on every sync.

Status: not shipped or partly shipped is **To ship**; shipped is **Shipped**; shipped and more than 30 days after the sale is **Complete** (eBay does not report delivery). Cancelled, fully refunded, failed and pending-payment orders are hidden. Amounts keep the order or payout currency with a THB equivalent at the ECB daily rate, used for dashboard totals.

Stored per order: order ID, payment, fulfilment and cancel states, timestamps, total, eBay fees, destination country, and line items (title, SKU, variation, quantity, price, item ID). Buyer usernames, names, addresses, phone numbers and checkout notes are not stored. Payouts keep ID, status, date, amount, fee, transaction count and instrument type, without bank details. Product photos come from the ERP catalogue by SKU. Nothing on eBay is changed and ERP stock is not deducted; payouts are not written into the payouts sheet.
