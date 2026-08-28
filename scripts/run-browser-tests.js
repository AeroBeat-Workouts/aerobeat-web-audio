// @ts-check

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(".");
const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = requestUrl.pathname === "/" ? "/.testbed/demo/index.html" : requestUrl.pathname;
    const filePath = normalize(join(root, decodeURIComponent(pathname)));
    if (relative(root, filePath).startsWith("..")) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const bytes = await readFile(filePath);
    response.writeHead(200, { "content-type": contentType(filePath), "cache-control": "no-store" });
    response.end(bytes);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(0, "127.0.0.1", () => resolveListen(undefined));
});

const address = server.address();
if (!address || typeof address === "string") {
  server.close();
  throw new Error("Browser test server did not expose a TCP address");
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  /** @type {string[]} */
  const consoleFailures = [];
  page.on("console", message => {
    if (message.type() === "warning" || message.type() === "error") {
      consoleFailures.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", pageError => {
    consoleFailures.push(`pageerror: ${pageError.message}`);
  });

  const origin = `http://127.0.0.1:${address.port}`;
  await page.goto(`${origin}/.testbed/demo/index.html`, { waitUntil: "networkidle" });
  const demoText = await page.locator("#app").textContent();
  if (!demoText?.includes("Audio facade:")) {
    throw new Error(`Audio demo did not initialize: ${String(demoText)}`);
  }

  const lifecycle = await page.evaluate(async modulePath => {
    const { createAeroWebAudioService } = /** @type {typeof import("../src/index.js")} */ (await import(modulePath));
    let currentTime = 0;
    let contextState = "suspended";
    let closeCalls = 0;
    const audioContext = {
      get currentTime() {
        return currentTime;
      },
      get state() {
        return contextState;
      },
      async resume() {
        contextState = "running";
      },
      async suspend() {
        contextState = "suspended";
      },
      async close() {
        closeCalls += 1;
        contextState = "closed";
      }
    };
    const service = createAeroWebAudioService({ audioContext });
    await service.load({
      id: "browser-silence",
      kind: "generated-silence",
      label: "Browser Silence",
      durationSeconds: 20
    });
    await service.play();
    currentTime = 4;
    const playing = service.getClockSnapshot();
    await service.setDocumentHidden(true);
    currentTime = 40;
    const hidden = service.getClockSnapshot();
    await service.setDocumentHidden(false);
    currentTime = 42;
    const resumed = service.getClockSnapshot();
    await service.destroy();
    return {
      playingPosition: playing.positionSeconds,
      hiddenPosition: hidden.positionSeconds,
      resumedPosition: resumed.positionSeconds,
      finalState: service.getStatus().state,
      externalCloseCalls: closeCalls
    };
  }, "/src/index.js");

  if (lifecycle.playingPosition !== 4 || lifecycle.hiddenPosition !== 4 || lifecycle.resumedPosition !== 6) {
    throw new Error(`Browser clock continuity failed: ${JSON.stringify(lifecycle)}`);
  }
  if (lifecycle.finalState !== "destroyed" || lifecycle.externalCloseCalls !== 0) {
    throw new Error(`Browser teardown ownership failed: ${JSON.stringify(lifecycle)}`);
  }
  if (consoleFailures.length > 0) {
    throw new Error(`Unexpected browser console output:\n${consoleFailures.join("\n")}`);
  }
  console.log("Browser audio lifecycle and console-noise checks passed.");
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function contentType(filePath) {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
