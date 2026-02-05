# MailMerge (JHipster) — Final Year Project

MailMerge is a university final-year Computer Science project that helps users send **personalised bulk emails** using an Excel spreadsheet. Users compose an email template containing placeholders like `{{name}}`, preview merged emails, and then send messages via **Microsoft Graph (Outlook)**. The app also supports **OneDrive spreadsheet selection**, **attachments**, **inline images**, **send progress tracking (SSE)**, and **AI-based rewriting** for improving email tone.

> Academic note: This application is built for a university project module and is not intended as a production service.

---

## Features

- **Microsoft Login (OIDC)** authentication
- Create & manage “MailMerge projects”
- Connect a spreadsheet:
  - Upload local `.xlsx`
  - Pick from **OneDrive**
- Use placeholders in templates, e.g. `{{name}}`, `{{email}}`
- Compose fields:
  - To / Cc / Bcc templates
  - Subject template
  - Body template
- Attachments supported
- Inline images supported (CID attachments for HTML emails)
- **Preview** generated emails before sending
- **Test send** (sends one merged email to the current logged-in user only)
- **Bulk send** via Microsoft Graph
- Live send progress updates via **Server-Sent Events (SSE)**
- **AI Rewrite** (Groq) to rewrite email body with tone control
- Editable user **signature** (from navbar modal)

---

## Tech Stack

**Frontend**
- Angular (JHipster)
- Bootstrap / SCSS
- FontAwesome icons

**Backend**
- Spring Boot (JHipster)
- OAuth2 / OIDC (Microsoft)
- WebClient for Microsoft Graph calls
- Apache POI for parsing `.xlsx`

**Integrations**
- Microsoft Graph:
  - Send emails
  - OneDrive file listing + download
- Groq API for AI rewrite

**Other**
- SSE progress streaming (Spring `SseEmitter`)

---

## Architecture Overview

1. User logs in using Microsoft OIDC.
2. User creates/selects a MailMerge project.
3. User connects an Excel spreadsheet (local upload or OneDrive).
4. User writes templates using placeholders like `{{column_name}}`.
5. Frontend generates previews using parsed spreadsheet rows.
6. Backend sends mail via Microsoft Graph and broadcasts progress via SSE.

---

## Repository Structure (typical)

- `src/main/webapp/` — Angular frontend (JHipster)
- `src/main/java/` — Spring Boot backend
- `src/main/resources/` — configuration files
- `src/test/` — tests (if present)

---

## Prerequisites

- **Java** (recommended: 17+ depending on your JHipster setup)
- **Node.js + npm**
- **Maven** (or use the included wrapper `./mvnw`)
- Microsoft Azure App Registration configured for OIDC + Graph permissions
- A Groq API key (optional, only required for AI rewriting)

---

## Configuration

### Microsoft Graph + OIDC
You must configure your Microsoft OIDC provider and Graph access in your Spring configuration (`application.yml` / `application-dev.yml` etc). This typically includes:
- Client ID
- Client Secret
- Tenant / Issuer URL
- Redirect URIs
- Scopes/permissions (Graph mail + OneDrive if enabled)

### Groq (AI Rewrite)
Set your Groq API key:
- `groq.api-key=<YOUR_GROQ_KEY>`

> Do **not** commit secrets to Git. Use environment variables or local config overrides.

---

## How to Use (Marker-Friendly)

1. Sign in using Microsoft login.
2. Create a new MailMerge project (“New MailMerge”).
3. Connect spreadsheet (Local upload or OneDrive).
  - Spreadsheet should include a column containing recipients (commonly `email`).
4. Compose:
  - **To:** e.g. `{{email}}`
  - **Subject:** e.g. `Hello {{name}}`
  - **Body:** include placeholders like `{{name}}`, `{{course}}`, etc.
5. Click **Preview** to verify merge output.
6. Use **Test (send email to self)** to verify formatting and content safely.
7. Use **Send** to mail all rows in the spreadsheet.
8. Watch the progress bar (SSE live updates).

---

## Key API Endpoints

### Mail merge

- `POST /api/mail-merge/send-advanced`  
  Sends the full merge using templates + spreadsheet + attachments + inline images.

- `POST /api/mail-merge/send-test`  
  Sends one merged email to the current user only (safe test mode).

### Progress streaming (SSE)

- `GET /api/mail-progress/stream`  
  Frontend subscribes to progress updates (event name: `mail-progress`).

---

## Notes on Sending + Progress

- Bulk sending runs per spreadsheet row.
- If a row produces an empty “To” address, it is skipped but still counted as processed so progress reaches completion.
- A short throttle delay may be applied between sends to reduce rate-limiting risk.

---

## Privacy / GDPR

This project includes a privacy policy intended for users of the application.

- Privacy policy: **Privacy Policy** (linked from the footer)

Data processed by the app may include:
- Email addresses from spreadsheets
- Message content/templates
- Attachments uploaded by the user
- Basic technical information required for authentication and API calls

Users can contact the project owner for questions or deletion requests.

---

## Known Limitations

- Spreadsheet support is focused on `.xlsx` (Excel)
- Requires Microsoft account + correct Graph permissions
- Large attachments and very large spreadsheets may be limited by:
  - API request sizes
  - Graph throttling/rate limits
- Formatting rules follow a simplified markdown-like approach (project-specific)
- AI rewrite requires a valid Groq API key and internet access from the backend

---

## Troubleshooting

- **OneDrive list is empty:** ensure Graph permissions include OneDrive/Files scopes and consent is granted.
- **Mail send fails:** check Graph permissions for Mail send and verify token/scopes.
- **No progress updates:** ensure SSE endpoint is reachable and not blocked by proxy/CORS.

---

## Contributors

- Conor Galvin — University of Birmingham (Final Year Project)

---

## License / Academic Disclaimer

This repository is provided for academic evaluation purposes as part of a final year project.  
If a license is not explicitly stated elsewhere, treat the code as **“All rights reserved”**.
