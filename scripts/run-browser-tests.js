// @ts-check

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative, resolve } from "node:path";
import { networkInterfaces } from "node:os";
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
  server.listen(0, "0.0.0.0", () => resolveListen(undefined));
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
    sourceNodes.at(-1)?.onended?.();
    const naturallyEnded = { state: service.getStatus().state, position: service.getClockSnapshot().positionSeconds };
    await service.releaseLease();
    const releasedEndedState = service.getStatus().state;
    await service.activateLease();
    await service.play();
    const replayAtDuration = { state: service.getStatus().state, position: service.getClockSnapshot().positionSeconds };
    const beforeDestroy = {
      gainValues: gainNodes.map(node => node.gain.value),
      gainConnections: gainNodes.map(node => node.connections[0] === destination),
      sourceRoutes: sourceNodes.map(node => node.connections[0] === gainNodes[0]),
      sourceCount: sourceNodes.length,
      clock: service.getClockSnapshot().positionSeconds,
      naturallyEnded,
      releasedEndedState,
      replayAtDuration
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
  if (mixTopology.clockBeforeMix !== 3 || mixTopology.clockAfterMix !== 3 || mixTopology.beforeDestroy.clock !== 0 || mixTopology.beforeDestroy.sourceCount !== 3 || mixTopology.beforeDestroy.naturallyEnded.state !== "stopped" || mixTopology.beforeDestroy.naturallyEnded.position !== 30 || mixTopology.beforeDestroy.releasedEndedState !== "stopped" || mixTopology.beforeDestroy.replayAtDuration.state !== "playing" || mixTopology.beforeDestroy.replayAtDuration.position !== 0) {
    throw new Error(`Browser mix clock/source recreation and terminal lease truth failed: ${JSON.stringify(mixTopology)}`);
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
  await verifyDefaultHash(page, true);
  const insecureHost = nonLoopbackIpv4();
  if (!insecureHost) throw new Error("A genuine non-loopback Tailscale IPv4 address is required for insecure-context browser verification");
  const insecurePage = await browser.newPage();
  insecurePage.on("console", message => { if (message.type() === "warning" || message.type() === "error") consoleFailures.push(`${message.type()}: ${message.text()}`); });
  insecurePage.on("pageerror", pageError => consoleFailures.push(`pageerror: ${pageError.message}`));
  try {
    await insecurePage.goto(`http://${insecureHost}:${address.port}/.testbed/demo/index.html`, { waitUntil: "networkidle" });
    await verifyDefaultHash(insecurePage, false);
  } finally { await insecurePage.close(); }
  if (consoleFailures.length > 0) {
    throw new Error(`Unexpected browser console output:\n${consoleFailures.join("\n")}`);
  }
  console.log("Browser audio gain topology, strict private mix, lifecycle, ownership, and console-noise checks passed.");
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}

/** @param {import("playwright").Page} page @param {boolean} secure */
async function verifyDefaultHash(page, secure) {
  const evidence = await page.evaluate(async modulePath => {
    const { createAeroWebAudioService } = /** @type {typeof import("../src/index.js")} */ (await import(modulePath));
    const expected = "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";
    const makeContext = () => ({ currentTime: 0, state: "running", async resume() {}, async suspend() {}, async close() {}, async decodeAudioData() { return { duration: 1 }; } });
    const backing = new Uint8Array([99, 98, 1, 2, 3, 97]);
    const visible = backing.subarray(2, 5);
    /** @type {import("../src/index.js").AudioSourceDescriptorInput} */
    const source = { id: "encoded", kind: "blob", label: "Encoded", blob: new Blob([visible]), expectedHash: { algorithm: "SHA-256", value: expected } };
    const verified = createAeroWebAudioService({ audioContext: makeContext() });
    const verifiedResult = await verified.load(source);
    const tampered = createAeroWebAudioService({ audioContext: makeContext() });
    const mismatchResult = await tampered.load({ ...source, blob: new Blob([new Uint8Array([1, 2, 4])]) });
    const disabled = createAeroWebAudioService({ audioContext: makeContext(), hashBytes: null });
    const disabledResult = await disabled.load(source);
    let injectedCalls = 0;
    let injectedAlgorithm = "";
    let injectedBytes = "";
    const injected = createAeroWebAudioService({ audioContext: makeContext(), hashBytes: async (bytes, algorithm) => {
      injectedCalls += 1;
      injectedAlgorithm = algorithm;
      injectedBytes = Array.from(new Uint8Array(bytes)).join(",");
      return expected;
    } });
    const injectedResult = await injected.load({ ...source, blob: new Blob([new Uint8Array([9, 9, 9])]) });
    const result = {
      isSecureContext,
      subtleType: typeof globalThis.crypto?.subtle,
      defaultCapability: verified.getCapabilities().hashVerification,
      verifiedState: verifiedResult.status.state,
      mismatchCode: mismatchResult.status.errorCode,
      disabledCode: disabledResult.status.errorCode,
      injectedState: injectedResult.status.state,
      injectedCalls,
      injectedAlgorithm,
      injectedBytes
    };
    await Promise.all([verified.destroy(), tampered.destroy(), disabled.destroy(), injected.destroy()]);
    return result;
  }, "/src/index.js");
  if (evidence.isSecureContext !== secure || evidence.subtleType !== (secure ? "object" : "undefined")) throw new Error(`Audio browser context assertion failed: ${JSON.stringify(evidence)}`);
  if (!evidence.defaultCapability || evidence.verifiedState !== "ready" || evidence.mismatchCode !== "audio_hash_mismatch" || evidence.disabledCode !== "audio_hash_unavailable") throw new Error(`Audio default hash behavior failed: ${JSON.stringify(evidence)}`);
  if (evidence.injectedState !== "ready" || evidence.injectedCalls !== 1 || evidence.injectedAlgorithm !== "SHA-256" || evidence.injectedBytes !== "9,9,9") throw new Error(`Audio injected hash semantics failed: ${JSON.stringify(evidence)}`);
}

function nonLoopbackIpv4() {
  return Object.values(networkInterfaces()).flat().filter(entry => entry && entry.family === "IPv4" && !entry.internal).map(entry => entry.address).find(isTailscaleIpv4);
}

/** @param {string} value */
function isTailscaleIpv4(value) {
  const [first, second] = value.split(".").map(Number);
  return first === 100 && second >= 64 && second <= 127;
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
