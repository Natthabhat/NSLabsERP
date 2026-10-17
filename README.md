# NS Labs ERP

A local Next.js App Router application with original NS Labs tables and edit dialogs. It connects directly to the Google Sheets API through server routes; it does not embed Google Sheets or require Apps Script.

## Run

```powershell
cd C:\Users\natth\Desktop\Web\Nextjs\NSLabsERP
npm install
npm run dev
```

Open **http://localhost:3000**. The server binds to 127.0.0.1. Choose **Explore the demo** to try the custom interface before Google setup. Demo records are fictional; demo edits live in React state and disappear on refresh. They never update your spreadsheet.

## Connect your actual Google Sheet

The fixed workbook is `1cgJr-GzZs5YHKQOLch5keZLB-aKcGARDAFYAYVHkuiE`. The 11 original worksheet IDs, record column widths and header positions are configured in `lib/config.mjs`.

1. In Google Cloud Console, create or select a project and enable the **Google Sheets API**.
2. Configure the Google Auth Platform consent screen. For a personal external app in Testing, add your Google email as a test user. Request the `openid`, `email`, and `https://www.googleapis.com/auth/spreadsheets` scopes. Google’s Sheets scope grants broad spreadsheet access; the app's server code only targets the fixed workbook above.
3. Create an **OAuth client ID → Web application**. Register this exact authorized redirect URI:
   `http://localhost:3000/api/auth/callback`
4. Put the client ID and secret into `.env.local` (created locally with a generated session secret). If missing, copy `.env.example` to `.env.local` and generate a SESSION_SECRET with the command in that file. Never commit `.env.local`.
5. Optional: set `ALLOWED_EMAILS` to your email, or a comma-separated list of permitted Google accounts. Without a list, a signed-in Google user still needs Google permission for this fixed workbook to read or edit it.
6. Restart `npm run dev`, click **Connect Google Sheets**, then sign in using an account with access to the workbook. Review and grant Google’s spreadsheet permission yourself.
7. Check that live records load. Test one intentional change to a non-formula cell and verify it in the source sheet. Real API access and saving cannot be verified until your OAuth credentials are configured.

`APP_URL` is the trusted origin for OAuth redirects and write-origin checks. Visit the app at that same origin. If you change the port or deploy under HTTPS, update APP_URL and register its `/api/auth/callback` in Google Cloud as well. Do not change SESSION_SECRET casually: changing it invalidates existing encrypted sessions. Google external apps in Testing may issue refresh tokens with limited lifetimes; reconnect if Google expires or revokes access.

## Included

- Custom responsive tables for costs, filament, stock, pricing, and eBay/Etsy/Lazada/Shopee worksheets.
- Search over primary records, 40 records per page; reads limited to the first 5,000 source rows.
- Single-cell edit dialogs with numeric, date, checkbox and supported dropdown fields.
- Formula, pivot/data-source and unsupported-validation cells are read-only. Google enforces actual protected-range permissions on save.
- Explicit Save and Clear actions; only `userEnteredValue` of the selected cell is written. Formatting, validation and side summaries remain in place.
- Re-read and compare record data before saving; stale edits are rejected. Google Sheets does not offer compare-and-set, so a manual Google edit or another server instance can still race between the check and write.
- Duplicate-submission protection and serialized writes within this Node process. No automatic write retries. Refresh before trying again after any uncertain save.
- OAuth state and PKCE; AES-GCM encrypted, HTTP-only, SameSite=Lax session cookies. Tokens are never returned to browser JavaScript. HTTPS makes cookies Secure. Request origins are checked for writes and sign-out.
- No marketplace order API connections, row insertion, row deletion or formula authoring.

## Checks

```powershell
npm test
npm run build
npm start
```

Tests cover value typing, formula protection, dropdown validation, checkbox mappings, dates, target selection and encrypted sessions. The build validates the Next.js application. Tests do not mutate the real sheet.

The earlier hosted website at `ns-labs-erp.goodshore65.chatgpt.site` is a separate deployment and has not been changed by this local project.

Official references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Google OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Google Sheets batch updates](https://developers.google.com/workspace/sheets/api/guides/batchupdate).
