# Ms. Early Bird — Escalation Intelligence Dashboard

A self-contained dashboard for engineers & managers to track tickets predicted at risk of
escalation. Built on the output of the Ms. Early Bird model (`Escalation_Probability`,
`Escalation_Risk_Band`, `Escalation_Reason`).

## Files

| File | What it is |
|------|-----------|
| `MsEarlyBird-Dashboard.html` | **The deliverable.** One self-contained file — HTML + CSS + JS + data + logo + Excel parser (SheetJS) all embedded. No dependencies, works offline. Double-click to open. |
| `index.html` | Identical copy, named `index.html` so static web hosts serve it automatically as the default page. |
| `README.md` | This file. |

> Both HTML files are byte-for-byte identical. Deploy either one; keep `index.html` if you host it.

## Using it

- **Open:** double-click `MsEarlyBird-Dashboard.html` (any modern browser).
- **Load a fresh export:** click **“⬆ Load latest export”** (top-right) and pick the newest
  `escalation-scored` `.xlsx`. The whole dashboard re-renders from that file. This runs
  **100% in the browser, offline** — nothing is uploaded to any server.
- **Dark mode:** click the 🌙 / ☀️ button in the header. Your choice is remembered per browser.
- **Reassign a case:** in the *At-Risk Cases* tab, use the **Assigned to** dropdown. Changes are
  saved in your browser (localStorage) and survive refreshes.
- **Cover for an absence:** in the *At-Risk Cases* tab pick **“🌴 On leave: <name>”** — that
  engineer’s cases are flagged and pinned to the top, with a banner showing how many need reassigning.
- **Quick next steps (AI assistant):** expand any case (▶) to reveal 4 buttons that open the
  Ms. Early Bird AI assistant (`aemcs-workspace.adobe.com/bot/chat`) pre-filled with the case ID —
  **Quick Update** (draft a customer reply), **Summarize** (engineer/manager handoff),
  **Related JIRAs/Wikis/KCS** (find references), **Investigate Further** (senior-engineer next steps).
  These mirror the buttons in the Slack alert.
- **Validate a prediction (training loop):** expand a case and click **✅ Correct** or **❌ Wrong**.
  A ✓/✗ badge appears on the row, and the *Prediction feedback* panel on the Manager Overview shows
  the running tally + precision. Click **⬇ Export feedback CSV** there to hand the labelled data to
  the next model-training run.

### Expected columns in the Excel
The loader maps these column headers (extra columns are ignored):
`Case ID`, `Title`, `Priority`, `Status Reason`, `Org`, `Support Engineer`, `Date Created`,
`Next Update Due`, `OCA (Case) (Case Extension)`, `Region (Org) (Organization)`,
`Customer Sentiment`, `Customer Sentiment Score`, `Impact`,
`Escalation_Probability`, `Escalation_Risk_Band`, `Escalation_Reason`, `Next Steps`.
A row is kept if it has a `Case ID`.

## Deploying (pick one)

**A. Share the file (simplest)**
Email it or drop `MsEarlyBird-Dashboard.html` on a shared drive / SharePoint / Teams. Everyone
double-clicks. Each person loads the latest Excel themselves.

**B. Internal static web host / SharePoint page**
Upload `index.html` to any static host (SharePoint doc library set to render HTML, an internal
IIS/nginx/Apache path, GitHub Pages, Netlify, S3 static site). Share the URL. Because everything is
inlined, there are no other assets to deploy.

**C. Later — live / auto-refresh (needs a backend)**
Today the data refresh is manual (the Load button). For a shared, always-current dashboard, add a
small service that re-reads the model export on a schedule and serves it as JSON; the page then
polls it instead of requiring an upload. (Node/Express or Python/FastAPI + a scheduled job.)
Ask and this can be scaffolded.

## Notes
- Ticket text from the Excel is HTML-escaped before rendering, so file content cannot break or
  inject into the page.
- Bundled snapshot = the `Output-Data-Of-Escalation-Prediction.xlsx` you provided (76 cases).
- © 2026 Adobe — Confidential.
