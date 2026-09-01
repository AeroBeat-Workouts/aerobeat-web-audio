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

  const mixTopology = await page.evaluate(async modulePath => {
    const { createAeroWebAudioService } = /** @type {typeof import("../src/index.js")} */ (await import(modulePath));
    const destination = Object.freeze({ id: "destination" });
    let currentTime = 0;
    let contextState = "running";
    let closeCalls = 0;
    const gainNodes = [];
    const sourceNodes = [];
    const audioContext = {
      destination,
      get currentTime() { return currentTime; },
      get state() { return contextState; },
      async resume() { contextState = "running"; },
      async suspend() { contextState = "suspended"; },
      async close() { closeCalls += 1; contextState = "closed"; },
      async decodeAudioData() { return { duration: 30 }; },
      createGain() {
        const node = { gain: { value: 1 }, connections: [], disconnected: false, connect(target) { node.connections.push(target); }, disconnect() { node.disconnected = true; } };
        gainNodes.push(node);
        return node;
      },
      createBufferSource() {
        const node = { buffer: null, onended: null, connections: [], disconnected: false, connect(target) { node.connections.push(target); }, start() {}, stop() {}, disconnect() { node.disconnected = true; } };
        sourceNodes.push(node);
        return node;
      }
    };
    const service = createAeroWebAudioService({ audioContext });
    const defaults = service.getMixSnapshot();
    const capability = service.getCapabilities().gainBuses;
    const statusKeys = Object.keys(service.getStatus());
    await service.load({ id: "browser-mix", kind: "array-buffer", label: "Browser Mix", arrayBuffer: new Uint8Array([1, 2, 3]).buffer });
    await service.play();
    currentTime = 3;
    const clockBeforeMix = service.getClockSnapshot().positionSeconds;
    const applied = service.setMix({ musicVolume: 0.25, sfxVolume: 0.75 });
    const clockAfterMix = service.getClockSnapshot().positionSeconds;
    await service.pause();
    await service.seek(5);
    await service.play();
    let rejectedExtra = false;
    try {
      service.setMix(/** @type {import("../src/index.js").AudioMixSnapshot} */ ({ musicVolume: 0.5, sfxVolume: 0.5, extra: true }));
    } catch {
      rejectedExtra = true;
    }
    const beforeDestroy = {
      gainValues: gainNodes.map(node => node.gain.value),
      gainConnections: gainNodes.map(node => node.connections[0] === destination),
      sourceRoutes: sourceNodes.map(node => node.connections[0] === gainNodes[0]),
      sourceCount: sourceNodes.length,
      clock: service.getClockSnapshot().positionSeconds
    };
    await service.destroy();
    return {
      defaults, capability, statusKeys, applied, clockBeforeMix, clockAfterMix, rejectedExtra, beforeDestroy,
      gainDisconnected: gainNodes.map(node => node.disconnected), sourceDisconnected: sourceNodes.map(node => node.disconnected), closeCalls
    };
  }, "/src/index.js");
  if (JSON.stringify(mixTopology.defaults) !== JSON.stringify({ musicVolume: 0.5, sfxVolume: 0.5 }) || !mixTopology.capability) {
    throw new Error(`Browser mix defaults/capability failed: ${JSON.stringify(mixTopology)}`);
  }
  if (mixTopology.statusKeys.includes("musicVolume") || mixTopology.statusKeys.includes("sfxVolume") || !mixTopology.rejectedExtra) {
    throw new Error(`Browser mix privacy/validation failed: ${JSON.stringify(mixTopology)}`);
  }
  if (mixTopology.clockBeforeMix !== 3 || mixTopology.clockAfterMix !== 3 || mixTopology.beforeDestroy.clock !== 5 || mixTopology.beforeDestroy.sourceCount !== 2) {
    throw new Error(`Browser mix clock/source recreation failed: ${JSON.stringify(mixTopology)}`);
  }
  if (JSON.stringify(mixTopology.beforeDestroy.gainValues) !== JSON.stringify([0.25, 0.75]) || !mixTopology.beforeDestroy.gainConnections.every(Boolean) || !mixTopology.beforeDestroy.sourceRoutes.every(Boolean)) {
    throw new Error(`Browser gain topology failed: ${JSON.stringify(mixTopology)}`);
  }
  if (!mixTopology.gainDisconnected.every(Boolean) || !mixTopology.sourceDisconnected.every(Boolean) || mixTopology.closeCalls !== 0) {
    throw new Error(`Browser gain teardown failed: ${JSON.stringify(mixTopology)}`);
  }
  const realGain = await page.evaluate(async modulePath => {
    const { createAeroWebAudioService } = /** @type {typeof import("../src/index.js")} */ (await import(modulePath));
    const audioContext = new AudioContext();
    const createGain = audioContext.createGain.bind(audioContext);
    /** @type {GainNode[]} */
    const gainNodes = [];
    /** @type {boolean[][]} */
    const gainConnections = [];
    /** @type {number[]} */
    const gainDisconnectCalls = [];
    Object.defineProperty(audioContext, "createGain", { value: () => {
      const node = createGain();
      const index = gainNodes.length;
      const connect = node.connect.bind(node);
      const disconnect = node.disconnect.bind(node);
      gainNodes.push(node);
      gainConnections.push([]);
      gainDisconnectCalls.push(0);
      Object.defineProperty(node, "connect", { value: (target) => {
        gainConnections[index].push(target === audioContext.destination);
        return connect(target);
      } });
      Object.defineProperty(node, "disconnect", { value: () => {
        gainDisconnectCalls[index] += 1;
        return disconnect();
      } });
      return node;
    } });
    const service = createAeroWebAudioService({ audioContext: /** @type {import("../src/index.js").AudioContextAdapter} */ (/** @type {unknown} */ (audioContext)) });
    const defaults = service.getMixSnapshot();
    const evidence = {
      supported: service.getStatus().supported,
      gainBuses: service.getCapabilities().gainBuses,
      defaults,
      frozen: Object.isFrozen(defaults),
      createdGainCount: gainNodes.length,
      initialGainValues: gainNodes.map(node => node.gain.value),
      gainConnections,
      applied: service.setMix({ musicVolume: 0, sfxVolume: 1 }),
      appliedGainValues: gainNodes.map(node => node.gain.value),
      statusKeys: Object.keys(service.getStatus())
    };
    await service.destroy();
    const teardown = { gainDisconnectCalls, callerContextState: audioContext.state };
    await audioContext.close();
    return { ...evidence, ...teardown };
  }, "/src/index.js");
  if (!realGain.supported || !realGain.gainBuses || !realGain.frozen || realGain.createdGainCount !== 2 || JSON.stringify(realGain.defaults) !== JSON.stringify({ musicVolume: 0.5, sfxVolume: 0.5 }) || JSON.stringify(realGain.initialGainValues) !== JSON.stringify([0.5, 0.5]) || JSON.stringify(realGain.applied) !== JSON.stringify({ musicVolume: 0, sfxVolume: 1 }) || JSON.stringify(realGain.appliedGainValues) !== JSON.stringify([0, 1]) || !realGain.gainConnections.every(connections => connections.length === 1 && connections[0]) || realGain.gainDisconnectCalls.some(calls => calls !== 1) || realGain.callerContextState === "closed" || realGain.statusKeys.includes("musicVolume") || realGain.statusKeys.includes("sfxVolume")) {
    throw new Error(`Real browser GainNode/private mix proof failed: ${JSON.stringify(realGain)}`);
  }
  if (consoleFailures.length > 0) {
    throw new Error(`Unexpected browser console output:\n${consoleFailures.join("\n")}`);
  }
  console.log("Browser audio gain topology, strict private mix, lifecycle, ownership, and console-noise checks passed.");
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
