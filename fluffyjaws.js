/*
 * Ms. Early Bird — FluffyJaws bridge (remote HTTP MCP, browser-session auth)
 * --------------------------------------------------------------------------
 * A tiny, dependency-free MCP client that talks to the FluffyJaws remote
 * Streamable HTTP endpoint (POST /api/v1/mcp) using JSON-RPC 2.0, authenticated
 * with your signed-in FluffyJaws web session cookie (fjv3_session). It is used
 * by _server.js to answer the dashboard's "Quick next steps" buttons.
 *
 * Get the cookie: sign in at https://fluffyjaws.adobe.com in your browser, then
 * copy the value of the `fjv3_session` cookie (DevTools > Application > Cookies).
 * The session is short-lived, so you'll re-copy it when it expires.
 *
 * Configuration (env vars):
 *   FJ_SESSION          fjv3_session cookie value  (primary auth)
 *   FJ_TOKEN            optional bearer token override (Authorization: Bearer)
 *   FJ_USER_TOKEN       optional X-User-Token (for restricted FluffyPacks)
 *   FJ_API              API host        (default https://api.fluffyjaws.adobe.com)
 *   FJ_MCP_PATH         MCP path        (default /api/v1/mcp)
 *   FJ_CHAT_TOOL        chat tool name  (default fluffyjaws_chat)
 *   FJ_FLUFFYPACK_SLUG  scope to a FluffyPack (default: none)
 *   FJ_FLUFFYPACK_UUID  same, by uuid
 *   FJ_MESSAGE_FIELD    override the auto-detected message argument name
 */
"use strict";

const API = (process.env.FJ_API || "https://api.fluffyjaws.adobe.com").replace(/\/+$/, "");
const MCP_PATH = process.env.FJ_MCP_PATH || "/api/v1/mcp";
const ENDPOINT = API + MCP_PATH;
// Accept either a raw cookie value or a pasted "fjv3_session=..." pair, from the
// FJ_SESSION env var, or (fallback) a local `.fjsession` file next to this module.
function readSession() {
  let s = (process.env.FJ_SESSION || "").replace(/^fjv3_session=/, "").trim();
  if (!s) {
    try {
      const fs = require("fs"), path = require("path");
      const p = path.join(__dirname, ".fjsession");
      if (fs.existsSync(p)) s = fs.readFileSync(p, "utf8").replace(/^fjv3_session=/, "").trim();
    } catch (e) {}
  }
  return s;
}
const SESSION = readSession();
const BEARER = process.env.FJ_TOKEN || "";
const USER_TOKEN = process.env.FJ_USER_TOKEN || "";
const CHAT_TOOL = process.env.FJ_CHAT_TOOL || "fluffyjaws_chat";
const PACK_SLUG = process.env.FJ_FLUFFYPACK_SLUG || "";
const PACK_UUID = process.env.FJ_FLUFFYPACK_UUID || "";
const MSG_FIELD = process.env.FJ_MESSAGE_FIELD || "";
const PROTOCOL_VERSION = "2025-06-18"; // requested; server negotiates the actual value

let sessionId = null;        // from the Mcp-Session-Id header on initialize
let negotiatedVersion = null;
let ready = null;            // Promise resolved once the MCP handshake completes
let toolsPromise = null;
let loggedTools = false;
let nextId = 1;

function baseHeaders() {
  const h = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  // On /api/v1/*, an explicit Authorization header takes precedence over the cookie.
  if (BEARER) h["Authorization"] = "Bearer " + BEARER;
  if (SESSION) h["Cookie"] = "fjv3_session=" + SESSION;
  if (USER_TOKEN) h["X-User-Token"] = /^Bearer\s/i.test(USER_TOKEN) ? USER_TOKEN : "Bearer " + USER_TOKEN;
  if (sessionId) h["Mcp-Session-Id"] = sessionId;
  if (negotiatedVersion) h["MCP-Protocol-Version"] = negotiatedVersion;
  return h;
}

async function safeText(res) {
  try {
    return await res.text();
  } catch (e) {
    return "";
  }
}

async function postMessage(message) {
  if (!SESSION && !BEARER) {
    throw new Error(
      "No FluffyJaws session configured. Sign in at https://fluffyjaws.adobe.com, copy your " +
        "'fjv3_session' cookie value, and put it in the .fjsession file (or set FJ_SESSION)."
    );
  }
  let res;
  try {
    res = await fetch(ENDPOINT, { method: "POST", headers: baseHeaders(), body: JSON.stringify(message) });
  } catch (e) {
    throw new Error(
      "Cannot reach FluffyJaws at " + ENDPOINT + " (" + String((e && e.message) || e) +
        "). Check the Adobe VPN and FJ_API."
    );
  }
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  // Session expired/unknown -> forget it so the next call re-initializes.
  if (res.status === 404 && sessionId) {
    sessionId = null;
    ready = null;
    toolsPromise = null;
  }
  return res;
}

// Read a Streamable-HTTP SSE body until we find the JSON-RPC message with `id`.
async function readSseForId(res, id) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      buf = buf.replace(/\r\n/g, "\n");
      let sep;
      while ((sep = buf.indexOf("\n\n")) >= 0) {
        const evt = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const data = evt
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data) continue;
        let msg;
        try {
          msg = JSON.parse(data);
        } catch (e) {
          continue;
        }
        if (msg && msg.id === id) return msg;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch (e) {}
  }
  return null;
}

function unwrap(msg, res) {
  if (!msg) throw new Error("No JSON-RPC response for request (HTTP " + res.status + ")");
  if (msg.error) throw new Error(msg.error.message || JSON.stringify(msg.error));
  return msg.result;
}

async function readResponse(res, id) {
  if (res.status === 401 || res.status === 403) {
    const body = await safeText(res);
    throw new Error(
      "FluffyJaws auth failed (HTTP " + res.status + "). Your fjv3_session cookie is missing or " +
        "expired — sign in at https://fluffyjaws.adobe.com and update FJ_SESSION. " + body.slice(0, 200)
    );
  }
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("text/event-stream") && res.body) {
    return unwrap(await readSseForId(res, id), res);
  }
  const text = await safeText(res);
  if (!res.ok) throw new Error("FluffyJaws HTTP " + res.status + ": " + (text || res.statusText));
  if (!text) return null;
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error("Unexpected non-JSON reply from FluffyJaws: " + text.slice(0, 200));
  }
  const msg = Array.isArray(data) ? data.find((m) => m && m.id === id) : data;
  return unwrap(msg, res);
}

async function rpc(method, params) {
  const id = nextId++;
  const res = await postMessage({ jsonrpc: "2.0", id, method, params });
  return readResponse(res, id);
}

async function notify(method, params) {
  const res = await postMessage({ jsonrpc: "2.0", method, params });
  if (res.status === 401 || res.status === 403) {
    throw new Error("FluffyJaws auth failed on " + method + " (HTTP " + res.status + "). Update FJ_SESSION.");
  }
  try {
    if (res.body) await res.body.cancel();
  } catch (e) {}
}

function start() {
  if (ready) return ready;
  ready = (async () => {
    const result = await rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "mseb-dashboard", version: "1.0.0" },
    });
    negotiatedVersion = (result && result.protocolVersion) || PROTOCOL_VERSION;
    await notify("notifications/initialized", {});
  })().catch((e) => {
    ready = null; // don't cache a failed handshake
    throw e;
  });
  return ready;
}

function listTools() {
  if (!toolsPromise) {
    toolsPromise = start()
      .then(() => rpc("tools/list", {}))
      .catch((e) => {
        toolsPromise = null; // don't cache a rejection
        throw e;
      });
  }
  return toolsPromise;
}

function pickMessageField(schema) {
  if (MSG_FIELD) return MSG_FIELD;
  const props = (schema && schema.properties) || {};
  for (const p of ["message", "prompt", "input", "query", "text", "question"]) {
    if (props[p]) return p;
  }
  return null;
}

function extractText(result) {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (Array.isArray(result.content)) {
    return result.content
      .map((c) => (c && typeof c.text === "string" ? c.text : typeof c === "string" ? c : ""))
      .filter(Boolean)
      .join("\n\n");
  }
  if (typeof result.text === "string") return result.text;
  return JSON.stringify(result);
}

async function chat(promptText) {
  const tools = await listTools();
  const list = (tools && tools.tools) || [];
  if (!loggedTools) {
    loggedTools = true;
    console.log("[fluffyjaws] tools available: " + list.map((t) => t.name).join(", "));
  }
  const tool = list.find((t) => t.name === CHAT_TOOL) || list.find((t) => /chat/i.test(t.name));
  if (!tool) {
    throw new Error("Chat tool '" + CHAT_TOOL + "' not found. Available: " + list.map((t) => t.name).join(", "));
  }
  const schema = tool.inputSchema || {};
  const props = schema.properties || {};
  const args = {};
  const field = pickMessageField(schema);
  if (field) args[field] = promptText;
  else if (props.messages) args.messages = [{ role: "user", content: promptText }];
  else args.message = promptText; // best-effort default
  if (PACK_SLUG && (props.fluffyPackSlug || !Object.keys(props).length)) args.fluffyPackSlug = PACK_SLUG;
  if (PACK_UUID && (props.fluffyPackUuid || !Object.keys(props).length)) args.fluffyPackUuid = PACK_UUID;

  const result = await rpc("tools/call", { name: tool.name, arguments: args });
  if (result && result.isError) throw new Error(extractText(result) || "FluffyJaws returned an error");
  return extractText(result);
}

module.exports = { chat, listTools, start, API, ENDPOINT, CHAT_TOOL };
