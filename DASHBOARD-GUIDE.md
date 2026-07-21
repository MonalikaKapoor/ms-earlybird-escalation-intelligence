# Ms. Early Bird — Dashboard Guide

A quick reference for engineers, managers, and stakeholders using the live dashboard.

## 1. Loading data (top-right)
- The page opens with a **bundled snapshot** so there's always something to show.
- **⬆ Load latest export** → pick an `.xlsx`. It accepts **either**:
  - a **raw Dynamics export** (no score columns) → the site **scores it live in your browser**, or
  - an **already-scored** file (`escalation-scored.xlsx`) → it uses those scores as-is.
- Everything runs **locally in the browser** — no data leaves the machine, and it works offline.

## 2. In-browser scoring
- **Auto-detect:** if the uploaded file has no `Escalation_Probability`, the site scores it automatically using the same model as the Slack pipeline (shared `scoring.js`).
- **`re-score` checkbox:** tick it to **force** browser scoring even on an already-scored file — useful to re-apply the latest logic (e.g. the *Escalated* rule) without re-running the Node job.
- **⬇ Scored .xlsx:** saves the current data back out as a scored workbook — identical output to the server pipeline. Handy for sharing or archiving.

## 3. Risk bands
| Band | Meaning |
|---|---|
| 🔴 Critical | Probability ≥ 75% — act now |
| 🟠 High | 55–74% — watch closely |
| 🟡 Medium | 30–54% — monitor |
| 🟢 Low | < 30%, **or** waiting on customer / pending engineering / resolution provided — deprioritized |
| 🟣 Escalated | Already escalated — shown separately for queue visibility, **not** counted as a "potential" escalation |

## 4. Reading the KPIs (top strip)
- **At-Risk Cases**, **Avg Escalation Prob.**, and **Top Risk Case** count **only** Critical + High + Medium — so suppressed (Low) and already-escalated cases never inflate them.
- **Already Escalated** is its own KPI card and a one-click filter chip.

## 5. Working the queue (At-Risk Cases tab)
- **Search + filters:** band chips (including *Escalated*), engineer, priority, and sort order.
- **On leave:** choose "🌴 On leave: &lt;name&gt;" → that engineer's cases are flagged and pinned to the top, with a banner showing what needs reassigning.
- **Assigned to** dropdown reassigns a case (saved locally in your browser).
- **Expand a row (▶)** to see:
  - the model's escalation **drivers**,
  - **4 AI quick-action buttons** — Quick Update, Summarize, Related JIRAs/Wikis/KCS, Investigate Further (open the Ms. Early Bird assistant pre-filled with the case),
  - **✅ Correct / ❌ Wrong** feedback — feeds the training loop; export it from the *Prediction feedback* panel on the Manager Overview.
- **🌙 Dark mode** toggle in the header.

## 6. Where scoring lives
- The model is in **`scoring.js`** — one shared, dependency-free module used by **both** the Node alert pipeline (`require("./scoring.js")`) and this dashboard (inlined for offline use).
- Change weights in one place (`scoring.js`) and both stay in sync. After editing, re-inline it into the HTML with the rebuild command in the project notes.

_© 2026 Adobe — Confidential._
