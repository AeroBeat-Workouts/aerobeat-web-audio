// @ts-check

import assert from "node:assert/strict";
import test from "node:test";

import {
  aeroAudioServiceId,
  audioSourceKinds,
  beatToSeconds,
  createAeroWebAudioService,
  createAudioSourceDescriptor,
  createPlaybackClock,
  createSongTimeline,
  secondsToBeat
} from "@aerobeat/web-audio";

const SHA_256_A = "a".repeat(64);
const SHA_256_B = "b".repeat(64);

test("audio facade reports unsupported without a browser AudioContext", () => {
  const service = createAeroWebAudioService();

  assert.equal(service.serviceId, aeroAudioServiceId);
  assert.equal(aeroAudioServiceId, "aero.audio.clock");
  assert.equal(service.getStatus().state, "unsupported");
  assert.equal(service.getStatus().supported, false);
  assert.equal(service.getStatus().autoplayState, "unavailable");
  assert.equal(service.getCapabilities().webAudio, false);
});

test("source descriptors support URL, object URL, Blob, ArrayBuffer, and generated silence without extension codec guesses", () => {
  assert.deepEqual(audioSourceKinds, ["url", "object-url", "blob", "array-buffer", "generated-silence"]);
  const descriptor = createAudioSourceDescriptor({
    id: "egg-source",
    kind: "url",
    label: "Encoded source",
    url: "https://media.example.test/song.egg",
    contentType: "application/octet-stream",
    expectedHash: { algorithm: "SHA-256", value: SHA_256_A.toUpperCase() }
  });

  assert.equal(descriptor.url, "https://media.example.test/song.egg");
  assert.equal(descriptor.expectedHash?.value, SHA_256_A);
  assert.equal(Object.isFrozen(descriptor), true);
  assert.throws(() => createAudioSourceDescriptor({
    id: "bad-owned-url",
    kind: "url",
    label: "Bad",
    url: "https://example.test/audio",
    ownsObjectUrl: true
  }), /Only object-url sources/u);
});

test("audio facade decodes bytes and preserves clock continuity through play, pause, seek, and stop", async () => {
  const audioContext = createFakeAudioContext({ decodedDurationSeconds: 120 });
  const service = createAeroWebAudioService({ audioContext });

  await service.load(createArrayBufferSource("fixture-song"));
  assert.equal(service.getStatus().state, "ready");
  assert.equal(service.getStatus().durationSeconds, 120);
  assert.equal(service.getCapabilities().encodedAudioDecode, true);
  assert.equal("arrayBuffer" in (service.getSource() ?? {}), false, "encoded bytes stay private to the service");

  await service.play();
  audioContext.advance(3.5);
  assert.equal(service.getClockSnapshot().positionSeconds, 3.5);
  assert.equal(service.getStatus().state, "playing");
  assert.equal(audioContext.createdNodes.length, 1);

  await service.pause();
  audioContext.advance(10);
  assert.equal(service.getClockSnapshot().positionSeconds, 3.5);
  assert.equal(service.getStatus().state, "paused");
  assert.equal(audioContext.createdNodes[0]?.disconnected, true);

  await service.seek(200);
  assert.equal(service.getStatus().positionSeconds, 120);

  await service.stop();
  assert.equal(service.getStatus().positionSeconds, 0);
  assert.equal(service.getStatus().state, "stopped");
});

test("visibility pause and resume retains decoded buffers and exact clock position", async () => {
  const audioContext = createFakeAudioContext({ decodedDurationSeconds: 90 });
  const visibility = createFakeVisibilityTarget(false);
  const service = createAeroWebAudioService({ audioContext, visibilityTarget: visibility });

  await service.load(createArrayBufferSource("visibility-song"));
  await service.play();
  audioContext.advance(4);
  visibility.setHidden(true);
  await visibility.settled();
  assert.equal(service.getStatus().visibilityState, "hidden");
  assert.equal(service.getStatus().state, "paused");
  assert.equal(service.getClockSnapshot().positionSeconds, 4);

  audioContext.advance(20);
  visibility.setHidden(false);
  await visibility.settled();
  assert.equal(service.getStatus().visibilityState, "visible");
  assert.equal(service.getStatus().state, "playing");
  audioContext.advance(2);
  assert.equal(service.getClockSnapshot().positionSeconds, 6);
  assert.equal(audioContext.decodeCalls, 1, "visibility resume must retain the decoded buffer");
});

test("lease pause, activation, and release do not own cross-instance arbitration", async () => {
  const audioContext = createFakeAudioContext({ decodedDurationSeconds: 60 });
  const service = createAeroWebAudioService({ audioContext });
  await service.load(createArrayBufferSource("lease-song"));
  await service.play();
  audioContext.advance(5);

  await service.pauseForLease();
  assert.equal(service.getStatus().leaseState, "inactive");
  assert.equal(service.getStatus().state, "paused");
  assert.equal(service.getClockSnapshot().positionSeconds, 5);

  await service.activateLease();
  assert.equal(service.getStatus().leaseState, "active");
  assert.equal(service.getStatus().state, "playing");

  await service.releaseLease();
  assert.equal(service.getStatus().leaseState, "released");
  assert.equal(service.getStatus().state, "paused");
  const denied = await service.play();
  assert.equal(denied.status.errorCode, "audio_lease_inactive");
});

test("URL fetch exposes CORS failure and HTTP failure truth", async () => {
  const audioContext = createFakeAudioContext();
  const corsService = createAeroWebAudioService({
    audioContext,
    fetch: async () => {
      throw new TypeError("Failed to fetch");
    }
  });
  const corsResult = await corsService.load(createUrlSource("cors-song", "https://cross-origin.example/song.ogg"));
  assert.equal(corsResult.status.errorCode, "audio_fetch_failed");
  assert.match(corsResult.status.errorMessage ?? "", /CORS/u);

  const httpService = createAeroWebAudioService({
    audioContext: createFakeAudioContext(),
    fetch: async () => new Response("missing", { status: 404 })
  });
  const httpResult = await httpService.load(createUrlSource("missing-song", "https://media.example/missing.ogg"));
  assert.equal(httpResult.status.errorCode, "audio_fetch_http_error");
  assert.match(httpResult.status.errorMessage ?? "", /404/u);
});

test("Blob and owned object-URL loads decode bytes, verify hashes, and revoke only owned URLs", async () => {
  const revoked = [];
  const service = createAeroWebAudioService({
    audioContext: createFakeAudioContext(),
    hashBytes: async () => SHA_256_A,
    fetch: async () => new Response(new Uint8Array([1, 2, 3])),
    revokeObjectURL(url) {
      revoked.push(url);
    }
  });

  const blobResult = await service.load({
    id: "blob-song",
    kind: "blob",
    label: "Blob Song",
    blob: new Blob([new Uint8Array([1, 2, 3])]),
    expectedHash: { algorithm: "SHA-256", value: SHA_256_A }
  });
  assert.equal(blobResult.status.state, "ready");

  await service.load({
    id: "object-song",
    kind: "object-url",
    label: "Object URL Song",
    url: "blob:https://game.example/owned",
    ownsObjectUrl: true,
    expectedHash: { algorithm: "SHA-256", value: SHA_256_A }
  });
  await service.load({
    id: "replacement",
    kind: "generated-silence",
    label: "Replacement",
    durationSeconds: 1
  });
  assert.deepEqual(revoked, ["blob:https://game.example/owned"]);
});

test("hash mismatch and unavailable hashing are distinct failures", async () => {
  const mismatchService = createAeroWebAudioService({
    audioContext: createFakeAudioContext(),
    hashBytes: async () => SHA_256_B
  });
  const mismatch = await mismatchService.load({
    ...createArrayBufferSource("mismatch"),
    expectedHash: { algorithm: "SHA-256", value: SHA_256_A }
  });
  assert.equal(mismatch.status.errorCode, "audio_hash_mismatch");

  const unavailableService = createAeroWebAudioService({
    audioContext: createFakeAudioContext(),
    hashBytes: null
  });
  const unavailable = await unavailableService.load({
    ...createArrayBufferSource("unavailable"),
    expectedHash: { algorithm: "SHA-256", value: SHA_256_A }
  });
  assert.equal(unavailable.status.errorCode, "audio_hash_unavailable");
});

test("decode failure reports unsupported encoded codec without trusting .egg extension", async () => {
  const audioContext = createFakeAudioContext({ decodeError: new DOMException("EncodingError") });
  const service = createAeroWebAudioService({
    audioContext,
    fetch: async () => new Response(new Uint8Array([9, 9, 9]))
  });
  const result = await service.load(createUrlSource("egg-song", "https://media.example/song.egg"));
  assert.equal(result.status.errorCode, "audio_decode_failed");
  assert.match(result.status.errorMessage ?? "", /\.egg/u);
  assert.match(result.status.errorMessage ?? "", /codec/u);
});

test("autoplay rejection is captured without advancing the gameplay clock", async () => {
  const audioContext = createFakeAudioContext({ resumeError: new DOMException("NotAllowedError") });
  const service = createAeroWebAudioService({ audioContext });
  await service.load({
    id: "autoplay-song",
    kind: "generated-silence",
    label: "Autoplay Song",
    durationSeconds: 20
  });
  const result = await service.play();
  assert.equal(result.status.errorCode, "audio_autoplay_blocked");
  assert.equal(result.status.autoplayState, "blocked");
  audioContext.advance(5);
  assert.equal(service.getClockSnapshot().positionSeconds, 0);
});

test("a late AudioContext resume completion cannot restart playback after pause", async () => {
  const resumeDeferred = createDeferredVoid();
  const audioContext = createFakeAudioContext({ resumeDeferred });
  const service = createAeroWebAudioService({ audioContext });
  await service.load({
    id: "late-resume",
    kind: "generated-silence",
    label: "Late Resume",
    durationSeconds: 10
  });

  const pendingPlay = service.play();
  await Promise.resolve();
  await service.pause();
  resumeDeferred.resolve();
  const stalePlay = await pendingPlay;

  assert.equal(stalePlay.stale, true);
  assert.equal(service.getStatus().state, "paused");
  assert.equal(audioContext.state, "suspended");
  audioContext.advance(5);
  assert.equal(service.getClockSnapshot().positionSeconds, 0);
});

test("a newer load aborts and supersedes late fetch completion", async () => {
  const deferred = createDeferredResponse();
  const service = createAeroWebAudioService({
    audioContext: createFakeAudioContext(),
    fetch: deferred.fetch
  });

  const first = service.load(createUrlSource("slow", "https://media.example/slow.ogg"));
  await Promise.resolve();
  const second = await service.load({
    id: "current",
    kind: "generated-silence",
    label: "Current",
    durationSeconds: 10
  });
  deferred.resolve(new Response(new Uint8Array([1, 2, 3])));
  const stale = await first;

  assert.equal(second.status.sourceId, "current");
  assert.equal(stale.stale, true);
  assert.equal(service.getStatus().sourceId, "current");
  assert.equal(deferred.signal?.aborted, true);
});

test("destroy aborts late decode, disconnects nodes, removes listeners, and closes only owned contexts", async () => {
  const decode = createDeferredDecode();
  const ownedContext = createFakeAudioContext({ decodeDeferred: decode });
  const visibility = createFakeVisibilityTarget(false);
  const service = createAeroWebAudioService({
    audioContextFactory: () => ownedContext,
    visibilityTarget: visibility
  });
  const pending = service.load(createArrayBufferSource("late-decode"));
  await Promise.resolve();
  const destroyed = await service.destroy();
  decode.resolve({ duration: 30 });
  const stale = await pending;

  assert.equal(destroyed.status.state, "destroyed");
  assert.equal(stale.stale, true);
  assert.equal(ownedContext.closeCalls, 1);
  assert.equal(visibility.listenerCount(), 0);
  assert.equal((await service.destroy()).status.state, "destroyed");
  assert.equal(ownedContext.closeCalls, 1);

  const externalContext = createFakeAudioContext();
  const externalService = createAeroWebAudioService({ audioContext: externalContext });
  await externalService.load(createArrayBufferSource("active-before-destroy"));
  await externalService.play();
  const activeNode = externalContext.createdNodes[0];
  await externalService.destroy();
  assert.equal(activeNode?.stopped, true);
  assert.equal(activeNode?.disconnected, true);
  assert.equal(externalContext.closeCalls, 0, "externally owned AudioContext must not be closed");
});

test("timeline helpers convert beats and seconds", () => {
  const timeline = createSongTimeline({ bpm: 120, offsetSeconds: 1, durationSeconds: 60 });
  assert.equal(timeline.secondsToBeat(2), 2);
  assert.equal(timeline.beatToSeconds(4), 3);
  assert.equal(secondsToBeat(5, 60), 5);
  assert.equal(beatToSeconds(8, 120), 4);
});

test("playback clock snapshots are immutable and deterministic", () => {
  const clock = createPlaybackClock({ durationSeconds: 10 });
  clock.seek(2, 0);
  clock.start(4);
  const snapshot = clock.snapshot(7);
  assert.deepEqual(snapshot, {
    contextTimeSeconds: 7,
    positionSeconds: 5,
    durationSeconds: 10,
    progress: 0.5,
    playing: true
  });
  assert.equal(Object.isFrozen(snapshot), true);
});

/**
 * @param {string} id
 * @returns {import("@aerobeat/web-audio").AudioSourceDescriptorInput}
 */
function createArrayBufferSource(id) {
  return {
    id,
    kind: "array-buffer",
    label: id,
    arrayBuffer: new Uint8Array([1, 2, 3]).buffer
  };
}

/**
 * @param {string} id
 * @param {string} url
 * @returns {import("@aerobeat/web-audio").AudioSourceDescriptorInput}
 */
function createUrlSource(id, url) {
  return { id, kind: "url", label: id, url };
}

/**
 * @typedef {import("@aerobeat/web-audio").AudioContextAdapter & {
 *   advance: (seconds: number) => void,
 *   createdNodes: FakeBufferSource[],
 *   decodeCalls: number,
 *   closeCalls: number
 * }} FakeAudioContext
 */

/**
 * @typedef {import("@aerobeat/web-audio").AudioBufferSourceNodeAdapter & {
 *   started: boolean,
 *   stopped: boolean,
 *   disconnected: boolean,
 *   offset: number
 * }} FakeBufferSource
 */

/**
 * @param {{ decodedDurationSeconds?: number, resumeError?: Error, resumeDeferred?: ReturnType<typeof createDeferredVoid>, decodeError?: Error, decodeDeferred?: ReturnType<typeof createDeferredDecode> }} [options]
 * @returns {FakeAudioContext}
 */
function createFakeAudioContext(options = {}) {
  let currentTime = 0;
  let state = "suspended";
  let decodeCalls = 0;
  let closeCalls = 0;
  /** @type {FakeBufferSource[]} */
  const createdNodes = [];
  return {
    destination: Object.freeze({ id: "destination" }),
    get currentTime() {
      return currentTime;
    },
    get state() {
      return state;
    },
    get createdNodes() {
      return createdNodes;
    },
    get decodeCalls() {
      return decodeCalls;
    },
    get closeCalls() {
      return closeCalls;
    },
    async resume() {
      if (options.resumeError) {
        throw options.resumeError;
      }
      if (options.resumeDeferred) {
        await options.resumeDeferred.promise;
      }
      state = "running";
    },
    async suspend() {
      state = "suspended";
    },
    async close() {
      closeCalls += 1;
      state = "closed";
    },
    async decodeAudioData() {
      decodeCalls += 1;
      if (options.decodeError) {
        throw options.decodeError;
      }
      if (options.decodeDeferred) {
        return options.decodeDeferred.promise;
      }
      return { duration: options.decodedDurationSeconds ?? 30 };
    },
    createBufferSource() {
      /** @type {FakeBufferSource} */
      const node = {
        buffer: null,
        onended: null,
        started: false,
        stopped: false,
        disconnected: false,
        offset: 0,
        connect() {},
        start(_when = 0, offset = 0) {
          node.started = true;
          node.offset = offset;
        },
        stop() {
          node.stopped = true;
        },
        disconnect() {
          node.disconnected = true;
        }
      };
      createdNodes.push(node);
      return node;
    },
    advance(seconds) {
      currentTime += seconds;
    }
  };
}

/**
 * @param {boolean} initiallyHidden
 * @returns {import("@aerobeat/web-audio").AudioVisibilityTarget & {
 *   setHidden: (hidden: boolean) => void,
 *   settled: () => Promise<void>,
 *   listenerCount: () => number
 * }}
 */
function createFakeVisibilityTarget(initiallyHidden) {
  let hidden = initiallyHidden;
  /** @type {Set<() => void>} */
  const listeners = new Set();
  return {
    get hidden() {
      return hidden;
    },
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    setHidden(nextHidden) {
      hidden = nextHidden;
      for (const listener of listeners) {
        listener();
      }
    },
    async settled() {
      await new Promise(resolve => setImmediate(resolve));
    },
    listenerCount() {
      return listeners.size;
    }
  };
}

/**
 * @returns {{ fetch: import("@aerobeat/web-audio").AudioFetch, resolve: (response: Response) => void, signal: AbortSignal | undefined }}
 */
function createDeferredResponse() {
  /** @type {(response: Response) => void} */
  let resolveResponse = () => {};
  /** @type {AbortSignal | undefined} */
  let signal;
  const promise = new Promise(resolve => {
    resolveResponse = resolve;
  });
  return {
    async fetch(_url, init) {
      signal = init.signal;
      return promise;
    },
    resolve(response) {
      resolveResponse(response);
    },
    get signal() {
      return signal;
    }
  };
}

/**
 * @returns {{ promise: Promise<import("@aerobeat/web-audio").AudioBufferAdapter>, resolve: (buffer: import("@aerobeat/web-audio").AudioBufferAdapter) => void }}
 */
function createDeferredDecode() {
  /** @type {(buffer: import("@aerobeat/web-audio").AudioBufferAdapter) => void} */
  let resolveDecode = () => {};
  const promise = new Promise(resolve => {
    resolveDecode = resolve;
  });
  return { promise, resolve: resolveDecode };
}

/**
 * @returns {{ promise: Promise<void>, resolve: () => void }}
 */
function createDeferredVoid() {
  /** @type {() => void} */
  let resolveVoid = () => {};
  const promise = new Promise(resolve => {
    resolveVoid = () => resolve();
  });
  return { promise, resolve: resolveVoid };
}
