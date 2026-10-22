# NS Labs ERP

NS Labs ERP is the internal operations workspace for NS Labs' 3D-printing business. It brings workshop spending, filament purchases, product sales, and marketplace payouts into one browser interface backed by PostgreSQL.

**Live application:** [erp.ns-labs.com](https://erp.ns-labs.com/) · Sign-in is required to access business records.

## Purpose in the NS Labs business

Running a printing business involves more than recording orders. NS Labs needs to understand what it spends on equipment and materials, which products sell, where sales come from, and whether marketplace payments have arrived. This application keeps those records together so the team can review operations and maintain the data without opening a database administration tool.

| Business question | Where to look |
| --- | --- |
| What have we spent on machines, tools, and parts? | Costs & production |
| How much filament have we purchased, and of which material? | Filament inventory |
| Which product sold, on which platform, for how much? | ST Log |
| Have marketplace payouts been confirmed? | eBay, Etsy, Lazada, and Shopee |
| How do recorded sales and spending compare over time? | Dashboard |
| How can we track another business activity? | New page |

The ERP is a practical record-management and analysis tool. It is not a complete accounting, tax, manufacturing, or order-fulfillment system. In particular, the filament screen records purchases; it does not calculate remaining spool weight or automatically deduct material used by a print.

## What users can do

- Browse records with alternating white and grey rows, search, per-column filters, sorting, and pagination.
- See the latest dated entries first, with sequential row numbers in the current view. These display numbers are separate from persistent database record IDs.
- Click a cell to edit it inline. **Enter** saves and **Escape** cancels. Calculated totals stay read-only.
- Add records with **New entry**, and add nullable text, number, date, or checkbox fields with **New column**.
- Expand category summaries to see counts and amounts, including filament materials, sales platforms, and product codes.
- Maintain dropdown labels and choices in **Manage selections**. Hiding a choice preserves existing records and allows restoration later.
- Create a named page under Workshop, Pricing, or Marketplaces with **New page**. Each page starts with Name, Date, Amount, and Notes and supports entries, inline edits, and additional columns.

Marketplace pages share one payout table. Adding a column to one marketplace therefore makes that field available to the other marketplace views too.

### A typical workflow

1. Record a machine, tool, or part purchase in Costs & production, or a material purchase in Filament inventory.
2. Record a product sale in ST Log with its product code, platform, sale date, price, shipping amount, and optional buyer.
3. Record marketplace payouts separately and mark them confirmed when appropriate.
4. Review totals, category breakdowns, and the Dashboard to understand recorded business activity.

Sales and payouts represent different events. A sale records business activity; a payout records money released by a marketplace. They are not automatically matched, and adding both together would double-count revenue.

### Currency behavior

Existing amounts and saved monetary fields use **THB** as the base currency.

- New entries can be entered in **THB or USD**. USD entry forms default to **31 THB per USD**, with a rate that can be adjusted for that entry.
- USD inputs are converted on the server to THB and rounded to two decimal places before insertion. The original request, including the entered currency and rate, is retained in the audit log.
- The worksheet **Display currency** selector switches monetary cells, the money total, and category amounts between THB and USD using **31 THB per USD**. This changes presentation, not stored records. The currency preference is remembered in the browser.
- Inline edits use THB, even while viewing USD. Counts and quantities are not converted.
- The Dashboard currently reports THB. Its figures are based on the saved THB amounts.

The display rate is a configured conversion assumption, not a live exchange-rate feed or historical exchange-rate calculation.

## Dashboard and interpretation

The Dashboard reads the four core business tables and shows sales revenue, spending, shipping costs, confirmed and pending payouts, monthly comparisons, and breakdowns by sales platform, expense category, and filament material.

Its **Revenue less recorded costs** figure is calculated as:

```text
ST Log sales prices
- ST Log shipping amounts
- recorded workshop expense totals
- recorded filament purchase totals
```

This is a management indicator, not accounting profit: it compares recorded sales with recorded purchases and expenses, including equipment purchases, without inventory valuation, depreciation, tax treatment, or automatic marketplace-fee reconciliation. Monthly comparisons cover up to the latest 12 months with recorded activity. Custom pages are independent tables and are not included in the core Dashboard calculations.

## How the application works

```mermaid
flowchart LR
    User[Browser workspace] -->|HTTPS| Edge[Cloudflare routing]
    Edge --> App[Next.js application in Docker]
    App --> Auth[Session and request validation]
    Auth --> Services[Server-side data services]
    Services --> DB[(PostgreSQL business tables)]
    Services --> Audit[(ERP metadata and audit log)]
    Git[GitHub main branch] --> Watcher[Deployment watcher]
    Watcher -->|Build, test, health check| App
```

The React workspace requests data through Next.js route handlers. The server checks the session, validates requests, selects the configured backend, and executes database operations through a pooled PostgreSQL connection. Database credentials are never sent to the browser.

In production, PostgreSQL is the source of truth. The app reads and writes records directly; it does not maintain a separate browser copy of the business database. Google Sheets is an optional alternative backend, not a synchronized second store.

### Technology

| Layer | Implementation |
| --- | --- |
| Web application | Next.js App Router with React |
| Interface | Custom CSS and Lucide icons |
| Server data access | Node.js and `pg` connection pooling |
| Persistence | PostgreSQL business tables and `erp_web` metadata |
| Authentication | PostgreSQL credential verification and encrypted session cookies |
| Packaging | Multi-stage Docker build; standalone Next.js server |
| Deployment | Ubuntu, Docker Compose, Cloudflare HTTPS routing, repository watcher |
| Tests | Node.js built-in test runner; optional PostgreSQL integration suite |

Dependency versions are defined in [package.json](package.json) and pinned by [package-lock.json](package-lock.json). The Docker image uses Node.js 22; local development requires Node.js 20.9 or later.

### Data model

| Page | PostgreSQL table | Main fields |
| --- | --- | --- |
| Costs & production | `public.printing_expenses` | Item, units, unit price, generated total, order date, category |
| Filament inventory | `public.filament_purchases` | Item, units, unit price, generated total, order date, material |
| ST Log | `public.st_sales_log` | Product code, platform, sale date, price, shipping, buyer |
| Marketplace payouts | `public.platform_payouts` | Platform, payout code, payout date, THB amount, confirmation |
| User-created pages | `public.erp_page_<id>` | Name, date, amount, notes, and optional additional fields |

The `erp_web` schema stores edit audits, additional-column definitions, selection options, and the custom-page registry. Custom page and column creation uses restricted database functions with validated names, supported types, and limits. Page titles are metadata; they are not used directly as SQL table names.

### API and code layout

These are authenticated application endpoints, not an anonymous public integration API.

| Endpoint | Responsibility |
| --- | --- |
| `/api/status` | Connection/session status and available pages |
| `/api/records` | Read, search, filter, sort, and paginate a page |
| `/api/cell` | Read or update a single cell |
| `/api/manage` | Create an entry or additional column |
| `/api/pages` | Create a persistent custom page |
| `/api/selections` | Read and maintain dropdown options |
| `/api/dashboard` | Aggregate the core business data |
| `/api/auth/*` | Backend sign-in, OAuth where configured, and logout |

```text
app/                    Next.js pages, global styles, and API routes
components/workspace.jsx  Workspace, tables, editors, dashboard, and forms
lib/data.mjs            Backend selection and authenticated service access
lib/pg-*.mjs            PostgreSQL reading, editing, management, and analysis
lib/postgres-model.mjs  Core table definitions and typed field validation
lib/sheets.mjs          Optional Google Sheets adapter
sql/                    Ordered permission and feature migrations
scripts/                Database provisioning and maintenance utilities
deployment/watchdog/    GitHub polling, builds, deployment, and rollback
tests/                  Application and optional database integration tests
```

### Authentication and safe writes

Sign-in verifies the configured PostgreSQL username and password using a short-lived connection. The password is not kept in the session. A seven-day encrypted, HTTP-only, Secure cookie identifies the user; the configured `POSTGRES_LOGIN_USER` is the permitted login account. Login attempts have a per-process rate limit.

Runtime queries use the separate `nslabs_erp_web` role with read, insert, field-level update, and explicitly granted function permissions. It has no general administrator or row-deletion permission. Controlled page and column creation is performed through restricted functions rather than unrestricted schema access.

Data APIs check the session, and write requests require the configured application origin. Cell edits lock the target row and compare its PostgreSQL version to detect stale edits. A successful edit and its audit record commit in the same transaction. Persistent operation IDs make supported write retries idempotent, preventing the same request from being applied twice.

Audit records contain business data, including before/after values and entry requests. Protect and back them up along with the database. The application is currently designed around one configured login account, rather than per-employee accounts and role-based access management.

## Run locally

```sh
npm ci
# Create .env.local using the variables below, then:
npm run dev
```

Open [localhost:3000](http://localhost:3000/). For PostgreSQL mode, use a reachable database with the required business tables and ERP migrations already provisioned.

```dotenv
DATA_BACKEND=postgres
DATABASE_URL=postgresql://nslabs_erp_web:YOUR_PASSWORD@YOUR_DB_HOST:5432/ns%20labs
POSTGRES_LOGIN_USER=YOUR_LOGIN_USER
APP_URL=http://localhost:3000
SESSION_SECRET=YOUR_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
```

The database name in the existing NS Labs installation is `ns labs`; its space must be URL-encoded in the connection string. Generate a session secret, for example, with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep environment files and credentials outside Git. See [.env.example](.env.example) for the available variables. SQL permission functions and provisioning scripts contain installation-specific administrator and table assumptions; review them when adapting this repository to another environment. This repository is not a one-command empty-database installer.

### Database migrations

Back up the database before provisioning or applying migrations. The existing production setup uses these files in order:

| Migration | Purpose |
| --- | --- |
| `001-postgres-access.sql` | Restricted runtime access and transactional edit audit |
| `002-record-management.sql` | New entries and controlled additional columns |
| `003-selection-settings.sql` | Managed dropdown options |
| `004-selection-visibility.sql` | Hide and restore selection options |
| `005-custom-pages.sql` | Custom page registry and controlled table creation |

`scripts/configure-postgres.py` handles the initial restricted role, migration 001, and generated runtime password in the server environment file. It assumes the existing PostgreSQL container and administrator; it does not automatically apply every later migration. Apply later SQL files deliberately with an authorized administrator. Application deployments do not run migrations automatically.

### Checks

```sh
npm test
npm run build
```

The regular test suite covers field validation, formula protection, sorting and filtering, selections, custom pages, audited record management, and currency conversion. Database integration tests run only when `TEST_DATABASE_URL` points to the disposable database `nslabs_erp_test`; never use a production database for these tests.

## Production deployment

The current installation runs on Ubuntu with [compose.yaml](compose.yaml). Create the server-only `.env.production`, set `APP_URL=https://erp.ns-labs.com`, and configure the database connection and session secret before starting it.

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 erp
```

The checked-in Compose configuration is specific to the NS Labs host: it binds port 3400 on loopback and the configured LAN address and joins the external `nslabs-db-admin` Docker network. Adapt those values for another server. Cloudflare routes the public HTTPS domain to the application service.

The image builds and runs tests before producing a standalone server. The runtime container runs as the non-root `node` user with Linux capabilities dropped, an automatic restart policy, and an HTTP health check. The host-specific configuration omits `no-new-privileges` because that setting prevented executable startup on this Ubuntu host.

### Automatic updates from GitHub

The `nslabs-erp-watchdog` container checks `main` every 60 seconds. On a new revision it archives the source, builds the Docker image, runs the image's build checks, deploys the ERP service, and checks container health. If deployment fails after replacement starts, it attempts to restore the previous image. Failed revisions wait five minutes before retrying; unchanged revisions do not restart the application.

The server-owned Compose file, environment file, database configuration, and migrations are managed separately from the release source. The watcher updates application code and the Dockerfile; it does not automatically change runtime ports, secrets, networks, database migrations, or its own deployment.

The watcher needs Docker socket access to build images and recreate containers. Its read-only GitHub deploy key is scoped to this repository and stored only on the server, outside images and Git. Review [deployment/watchdog](deployment/watchdog/) before installing it elsewhere.

Use the watcher's container logs in Portainer to inspect deployment results. Private watcher state, per-revision build logs, and archived releases live under `.watchdog` in the server deployment directory. Old images and releases require deliberate cleanup. Stop the watcher to pause updates without stopping the ERP; start it to resume. Preserve the environment file and database backups during maintenance.

## Google Sheets and current boundaries

The original Google Sheets adapter remains available with `DATA_BACKEND=sheets`, Google OAuth configuration, and the Google Sheets API enabled. It reads and edits the configured workbook. Fictional demo data is also available for interface exploration and is temporary.

The current PostgreSQL application does **not** automatically:

- Pull orders from marketplace APIs such as eBay, Etsy, Lazada, or Shopee.
- Synchronize PostgreSQL with Google Sheets or export records to Sheets.
- Deduct filament stock from production activity or reconcile payouts with sales.
- Provide full accounting, invoicing, tax reporting, or per-employee permissions.

Business records must be entered through the application or maintained through a separate authorized database/import workflow. The repository contains the application and schema/permission tooling, not a copy of NS Labs' production records.
