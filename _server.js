const http = require("http"),
  fs = require("fs"),
  path = require("path");
const fj = require("./fluffyjaws.js");
const root = __dirname;
const PORT = process.env.PORT || 5599;

function sendJson(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": body.length });
  res.end(body);
}

function readBody(req, cb) {
  let data = "";
  req.on("data", (c) => {
    data += c;
    if (data.length > 1e6) req.destroy(); // guard against oversized bodies
  });
  req.on("end", () => cb(data));
}

http
  .createServer((req, res) => {
    const url = req.url.split("?")[0];

    // --- FluffyJaws assistant: browser -> here -> local fj-mcp ---
    if (req.method === "POST" && url === "/api/assistant") {
      readBody(req, async (body) => {
        let payload;
        try {
          payload = JSON.parse(body || "{}");
        } catch (e) {
          return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
        }
        const { prompt, action, caseId } = payload;
        if (!prompt || typeof prompt !== "string") {
          return sendJson(res, 400, { ok: false, error: "Missing 'prompt'" });
        }
        try {
          const text = await fj.chat(prompt);
          sendJson(res, 200, { ok: true, action: action || null, caseId: caseId || null, text });
        } catch (e) {
          sendJson(res, 502, { ok: false, error: String((e && e.message) || e) });
        }
      });
      return;
    }

    // --- Connectivity check / tool discovery ---
    if (req.method === "GET" && url === "/api/assistant/health") {
      fj.listTools()
        .then((t) => sendJson(res, 200, { ok: true, endpoint: fj.ENDPOINT, tools: ((t && t.tools) || []).map((x) => x.name) }))
        .catch((e) => sendJson(res, 502, { ok: false, endpoint: fj.ENDPOINT, error: String((e && e.message) || e) }));
      return;
    }

    // --- Static files ---
    let f = decodeURIComponent(url);
    if (f === "/" || f === "") f = "/index.html";
    const p = path.join(root, f);
    if (path.relative(root, p).startsWith("..")) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    fs.readFile(p, (e, d) => {
      if (e) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const ext = path.extname(p).toLowerCase();
      const ct =
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".json": "application/json",
          ".png": "image/png",
          ".mp4": "video/mp4",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
        }[ext] || "text/plain";
      res.writeHead(200, { "Content-Type": ct });
      res.end(d);
    });
  })
  .listen(PORT, () =>
    console.log(
      "mseb server on http://localhost:" + PORT + "  ·  FluffyJaws assistant via " + fj.ENDPOINT + " (session cookie)"
    )
  );
