# ms-earlybird-escalation-intelligence
AI-powered system for early escalation prediction, enabling proactive support and faster issue resolution.

## Running the dashboard

```powershell
npm start
```

Then open http://localhost:5599. (No `npm install` needed — there are no runtime dependencies.)

## FluffyJaws assistant (in-app AI)

The "Quick next steps" buttons on each case (Quick Update, Summarize, Related JIRAs/Wikis/KCS,
Investigate Further) call **FluffyJaws** and render the answer inline. The browser talks to the
local `_server.js`, which relays to the **remote FluffyJaws HTTP MCP endpoint**
(`POST https://api.fluffyjaws.adobe.com/api/v1/mcp`), authenticated with your signed-in
**`fjv3_session` browser cookie**. No CLI install, no Okta app.

> The session cookie is short-lived. When it expires you'll see an auth error on the buttons —
> just re-copy the cookie and restart the server.

### Setup

1. Connect to the **Adobe VPN**.
2. In your browser, sign in at **https://fluffyjaws.adobe.com**.
3. Open DevTools → **Application** → **Cookies** → `https://fluffyjaws.adobe.com` → copy the value of
   the **`fjv3_session`** cookie.
4. Set it and start the server:
   ```powershell
   $env:FJ_SESSION = "<paste-fjv3_session-value>"
   npm start
   ```
5. Open http://localhost:5599.

Verify connectivity any time: open http://localhost:5599/api/assistant/health — it lists the
FluffyJaws tools your session can reach (or reports the auth/connection error).

### Configuration (env vars)

| Variable | Default | Purpose |
|---|---|---|
| `FJ_SESSION` | _(none)_ | **Required.** Your `fjv3_session` cookie value (sent as a `Cookie` header) |
| `FJ_TOKEN` | _(none)_ | Optional bearer-token override (takes precedence over the cookie) |
| `FJ_USER_TOKEN` | _(none)_ | Optional `X-User-Token` — only for access-restricted FluffyPacks |
| `FJ_API` | `https://api.fluffyjaws.adobe.com` | API host |
| `FJ_MCP_PATH` | `/api/v1/mcp` | Remote MCP path |
| `FJ_FLUFFYPACK_SLUG` | _(none)_ | Scope the assistant to a specific FluffyPack |
| `FJ_FLUFFYPACK_UUID` | _(none)_ | Same, by uuid |
| `FJ_CHAT_TOOL` | `fluffyjaws_chat` | Chat tool name to call |
| `FJ_MESSAGE_FIELD` | _(auto-detected)_ | Override the message argument name if needed |

If FluffyJaws is unavailable (no/expired session, or off VPN), each button falls back to a link that
opens the prompt in the web assistant, so the dashboard keeps working either way.

_© 2026 Adobe — Confidential._
