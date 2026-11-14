# Automatic ST sales log rows

Apply `sql/014-st-log-auto.sql` (adds `erp_web.st_log_auto` and `erp_web.st_log_auto_settings`, and lets the web role insert ST log rows; it still cannot delete them). Automatic rows are off until enabled:

    docker exec postgresql psql -U natthabhat -d "ns labs" -c "UPDATE erp_web.st_log_auto_settings SET enabled=true, updated_at=now()"

Once a day at 06:00 Bangkok time the ERP refreshes Etsy, eBay and Lazada, then adds one ST log row per unit of each ST-model order line created on or after `since` (default 2026-01-01) that has no row yet. Units already covered by a hand-entered row (paired by product, platform and date within four days) or by an earlier automatic row are skipped; `erp_web.st_log_auto` records each added unit by platform, order, line and unit, so a unit is never added twice. Cancelled, refunded and unpaid orders are not added; rows are never deleted.

Price is the THB amount after platform fees where the platform reports them (eBay order fees, Etsy payment net, Shopee commission, transaction and service fees from the collector's export), otherwise the buyer payment. Shipping is 700 for eBay and Etsy and 0 for Shopee and Lazada. Buyer is left empty. The ST log grid marks these rows "Added automatically".

Apply `sql/015-st-log-auto-manual.sql` as well. To mark an order unit as already recorded by a hand-entered row that matching cannot pair (for example a different product code), insert it into `erp_web.st_log_auto` with `price_basis='manual'` and that row's `log_id`; it will not be added automatically.
