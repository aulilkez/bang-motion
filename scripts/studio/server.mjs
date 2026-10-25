import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectStore, ConflictError } from "./store.mjs";
import { ValidationError, STATUS } from "./workflow.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "public");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
};

function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000)
      throw new ValidationError("Request body exceeds 2 MB.");
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
}
function parseProjectRoute(url) {
  const match = url.pathname.match(/^\/projects\/([0-9a-f-]{36})(?:\/(.*))?$/i);
  return match ? { id: match[1], rest: match[2] || "" } : null;
}

export async function createStudioServer({
  dataDir = process.env.STUDIO_DATA_DIR || path.join(here, "data"),
  host = "127.0.0.1",
  port = Number(process.env.STUDIO_PORT || 4179),
} = {}) {
  if (!["127.0.0.1", "::1", "localhost"].includes(host))
    throw new Error("Studio server only supports loopback binding.");
  const store = new ProjectStore(dataDir);
  await store.init();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${host}:${port}`);
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        const origin = req.headers.origin;
        if (origin) {
          const parsedOrigin = new URL(origin);
          const originHost = parsedOrigin.hostname.replace(/^\[|\]$/g, "");
          const localHost = ["127.0.0.1", "::1", "localhost"].includes(
            originHost,
          );
          if (
            !localHost ||
            (port !== 0 &&
              Number(
                parsedOrigin.port ||
                  (parsedOrigin.protocol === "https:" ? 443 : 80),
              ) !== port)
          )
            return send(res, 403, {
              error: "Cross-origin changes are not allowed.",
            });
        }
        if (req.headers["x-studio-request"] !== "1")
          return send(res, 403, {
            error: "Studio write request header is required.",
          });
      }
      if (req.method === "GET" && url.pathname === "/api/projects")
        return send(res, 200, await store.list());
      if (req.method === "POST" && url.pathname === "/api/projects")
        return send(
          res,
          201,
          store.publicProject(await store.create(await body(req))),
        );
      const route = parseProjectRoute({
        pathname: url.pathname.replace(/^\/api(?=\/)/, ""),
      });
      if (route && req.method === "GET" && route.rest === "")
        return send(res, 200, store.publicProject(await store.load(route.id)));
      if (
        route &&
        req.method === "GET" &&
        ["script", "storyboard"].includes(route.rest)
      ) {
        const result = await store.getContent(route.id, route.rest);
        return send(res, 200, {
          project: result.project,
          content: result.content,
        });
      }
      if (route && req.method === "POST" && route.rest === "begin") {
        const input = await body(req);
        return send(
          res,
          200,
          store.publicProject(await store.begin(route.id, input.stage)),
        );
      }
      if (
        route &&
        req.method === "PUT" &&
        ["script", "storyboard"].includes(route.rest)
      ) {
        const input = await body(req);
        const saved = await store.saveContent(
          route.id,
          route.rest,
          input.content,
          input.expectedVersion,
        );
        return send(res, 200, store.publicProject(saved));
      }
      if (
        route &&
        req.method === "POST" &&
        ["script", "storyboard"].includes(route.rest) &&
        url.searchParams.has("decision")
      ) {
        const input = await body(req);
        const saved = await store.decide(
          route.id,
          route.rest,
          input.decision,
          input.version,
          input.hash,
          input.note || "",
        );
        return send(res, 200, store.publicProject(saved));
      }
      if (route && req.method === "POST" && route.rest === "quality")
        return send(
          res,
          200,
          store.publicProject(
            await store.saveQuality(route.id, await body(req)),
          ),
        );
      if (route && req.method === "POST" && route.rest === "status") {
        const input = await body(req);
        if (input.status === STATUS.FAILED)
          return send(
            res,
            200,
            store.publicProject(
              await store.updateStatus(route.id, input.status, input),
            ),
          );
        if (input.status === "resume")
          return send(
            res,
            200,
            store.publicProject(await store.resume(route.id)),
          );
        return send(
          res,
          200,
          store.publicProject(
            await store.updateStatus(route.id, input.status, input),
          ),
        );
      }
      if (route && req.method === "GET" && route.rest.startsWith("preview/")) {
        const relative = decodeURIComponent(
          route.rest.slice("preview/".length),
        );
        const found = await store.outputFile(
          route.id,
          relative || "index.html",
        );
        const info = await stat(found.path);
        if (!info.isFile()) return send(res, 404, { error: "Not found." });
        res.writeHead(200, {
          "content-type":
            mime[path.extname(found.path).toLowerCase()] ||
            "application/octet-stream",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        return res.end(await readFile(found.path));
      }
      if (route && req.method === "GET" && route.rest.startsWith("review/")) {
        const kind = route.rest.slice(7);
        if (!["script", "storyboard", "preview"].includes(kind))
          return send(res, 404, { error: "Not found." });
        const html = await readFile(path.join(publicDir, "index.html"), "utf8");
        return res
          .writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          })
          .end(
            html
              .replaceAll('data-review-kind=""', `data-review-kind="${kind}"`)
              .replaceAll(
                'data-project-id=""',
                `data-project-id="${route.id}"`,
              ),
          );
      }
      if (req.method === "GET" && url.pathname.startsWith("/studio/")) {
        const file = path.resolve(
          publicDir,
          url.pathname.slice("/studio/".length),
        );
        if (!file.startsWith(`${publicDir}${path.sep}`))
          return send(res, 404, { error: "Not found." });
        return res
          .writeHead(200, {
            "content-type":
              mime[path.extname(file)] || "application/octet-stream",
          })
          .end(await readFile(file));
      }
      if (req.method === "GET" && url.pathname === "/")
        return res.writeHead(302, { location: "/studio/index.html" }).end();
      return send(res, 404, { error: "Not found." });
    } catch (error) {
      const status =
        error instanceof ConflictError
          ? 409
          : error instanceof ValidationError
            ? 400
            : error.code === "ENOENT"
              ? 404
              : 500;
      return send(res, status, {
        error: error.message,
        issues: error.issues || [],
        current: error.current || undefined,
      });
    }
  });
  server.requestTimeout = 30_000;
  return { server, store, host, port };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { server, host, port } = await createStudioServer();
  server.listen(port, host, () =>
    console.log(`Bang Motion Studio: http://${host}:${port}`),
  );
}
