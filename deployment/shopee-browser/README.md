# Shopee To Ship collector

Private browser worker for the n8n **Shopee - Daily To Ship Orders** workflow. It runs as `pwuser`, stores its browser profile and latest reports in a Docker volume, and publishes no host ports. Only containers on `n8n_default` can reach port 3020.

## Scope

- Opens Seller Centre's **To Ship** queue and uses its visible Export controls.
- Downloads the report for Shopee's default date window, recorded in each result.
- Reads Thai or English column names and returns orders grouped by order number, with stable item keys and integer THB cents.
- Excludes buyer names, usernames, addresses, phone numbers, and messages from the normalized JSON. The original Excel report contains those fields and remains private in the data volume.
- Does not arrange shipments, change orders, bypass verification, or write ERP records.
- The n8n schedule is 07:00 daily in `Asia/Bangkok`, and must be published after a successful manual test.

## Endpoints (private Docker network)

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Worker process health |
| `GET /status` | Session/collection status and timestamps |
| `POST /collect` | Download a fresh report and return normalized orders |
| `GET /orders/latest` | Return the last successful normalized report |

The login endpoint is restricted to loopback **inside the container**, for operator use through `docker exec`. It accepts credentials in the request body, keeps them in memory only, and preserves the resulting authenticated browser profile. Passwords must not be placed in workflow JSON, shell history, source files, or command-line arguments. Complete Shopee verification when requested; expired sessions need operator attention.

## Deployment and maintenance

```sh
docker compose up -d --build
docker compose ps
docker logs --tail 50 shopee-browser
docker exec shopee-browser node -e "fetch('http://127.0.0.1:3020/status').then(r=>r.text()).then(console.log)"
```

On this server, `no-new-privileges` prevented even `/bin/echo` from executing. Its removal was explicitly approved for this worker. Other services were not changed. `init: true` is required for the Xvfb/browser process lifecycle.

The latest successful files are `/data/latest-report.xlsx` and `/data/latest-orders.json`. A separate `nslabs-shopee-orders` volume receives atomic copies of the normalized JSON and collector status under `/export`. The ERP mounts only that export volume, read-only, at `/var/lib/nslabs-shopee`; it does not receive the browser profile or original spreadsheet. Its authenticated `/api/shopee` endpoint validates the report and whitelists operational fields for the `/shopee` page.

The source JSON retains `erpImported: false` because displaying this read-only snapshot does not create financial or sales-ledger records. Repeated runs replace the latest files; historical results follow n8n's execution retention policy. An empty result means no orders were present in the report, not that all shop order history was fetched.

If Shopee changes the export layout or login expires, the workflow should fail visibly instead of fabricating success. Confirm the result in n8n executions. The worker saves `/data/session.png` for private troubleshooting; it may contain sensitive account information.
