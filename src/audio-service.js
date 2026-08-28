// @ts-check

import { createAudioSourceDescriptor } from "./audio-source.js";
import { createPlaybackClock, normalizePosition } from "./playback-clock.js";

/** @typedef {import("./audio-source.js").AudioSourceDescriptorInput} AudioSourceDescriptorInput */
/** @typedef {import("./audio-source.js").AudioSourceDescriptor} AudioSourceDescriptor */
/** @typedef {import("./playback-clock.js").PlaybackClockSnapshot} PlaybackClockSnapshot */
/** @typedef {import("./playback-clock.js").PlaybackClock} PlaybackClock */

/** @typedef {"idle" | "unsupported" | "loading" | "ready" | "playing" | "paused" | "stopped" | "error" | "destroyed"} AudioServiceState */
/** @typedef {"unknown" | "allowed" | "blocked" | "unavailable"} AudioAutoplayState */
/** @typedef {"visible" | "hidden"} AudioVisibilityState */
/** @typedef {"active" | "inactive" | "released"} AudioLeaseState */
/** @typedef {"audio_fetch_failed" | "audio_fetch_http_error" | "audio_hash_unavailable" | "audio_hash_mismatch" | "audio_decode_unsupported" | "audio_decode_failed" | "audio_autoplay_blocked" | "audio_context_failed" | "audio_source_missing" | "audio_lease_inactive" | "audio_document_hidden" | "audio_operation_aborted" | "audio_destroyed"} AudioErrorCode */

/**
 * @typedef {Object} AudioServiceError
 * @property {AudioErrorCode} code Stable machine-readable error code.
 * @property {string} message Human-readable diagnostic.
 */

/**
 * @typedef {Object} AudioServiceStatus
 * @property {AudioServiceState} state Current lifecycle state.
 * @property {boolean} supported Whether a Web Audio context is available.
 * @property {number} generation Current source/lifecycle generation.
 * @property {string | undefined} sourceId Loaded audio source ID.
 * @property {number} positionSeconds Current playback position.
 * @property {number | undefined} durationSeconds Loaded source duration, when known.
 * @property {string} contextState Current browser audio-context state.
 * @property {AudioAutoplayState} autoplayState Current autoplay/resume capability truth.
 * @property {AudioVisibilityState} visibilityState Current document visibility truth.
 * @property {AudioLeaseState} leaseState Current assembly-controlled lease state.
 * @property {AudioErrorCode | undefined} errorCode Last stable error code.
 * @property {string | undefined} errorMessage Last error diagnostic.
 */

/**
 * @typedef {Object} AudioServiceCapabilities
 * @property {boolean} webAudio Web Audio context availability.
 * @property {boolean} encodedAudioDecode Encoded byte decoding availability.
 * @property {boolean} bufferPlayback AudioBufferSource playback availability.
 * @property {boolean} urlLoading URL fetch availability.
 * @property {boolean} blobLoading Blob loading support.
 * @property {boolean} arrayBufferLoading ArrayBuffer loading support.
 * @property {boolean} hashVerification SHA-256 verification availability.
 * @property {boolean} visibilityLifecycle Visibility pause/resume support.
 * @property {boolean} leaseLifecycle Media-lease participation support.
 */

/**
 * @typedef {Object} AudioOperationResult
 * @property {AudioServiceStatus} status Service status after the operation.
 * @property {AudioServiceStatus} previousStatus Service status before the operation.
 * @property {boolean} stale Whether a newer generation superseded this operation.
 */

/**
 * @typedef {Object} AudioBufferAdapter
 * @property {number} duration Decoded duration in seconds.
 */

/**
 * @typedef {Object} AudioBufferSourceNodeAdapter
 * @property {AudioBufferAdapter | null} buffer Decoded buffer.
 * @property {(() => void) | null} onended End callback.
 * @property {(destination: unknown) => void} connect Connects to a destination.
 * @property {(when?: number, offset?: number) => void} start Starts buffer playback.
 * @property {() => void} stop Stops buffer playback.
 * @property {() => void} disconnect Disconnects the node.
 */

/**
 * Minimal Web Audio context surface used by the service and deterministic tests.
 *
 * @typedef {Object} AudioContextAdapter
 * @property {number} currentTime Audio context time in seconds.
 * @property {string} state Browser audio context state.
 * @property {unknown} [destination] Audio destination node.
 * @property {() => Promise<void>} resume Resumes the audio context.
 * @property {() => Promise<void>} suspend Suspends the audio context.
 * @property {() => Promise<void>} close Closes the audio context.
 * @property {(bytes: ArrayBuffer) => Promise<AudioBufferAdapter>} [decodeAudioData] Decodes encoded audio bytes.
 * @property {() => AudioBufferSourceNodeAdapter} [createBufferSource] Creates a one-shot decoded-buffer source.
 */

/**
 * @typedef {Object} AudioVisibilityTarget
 * @property {boolean} hidden Current hidden state.
 * @property {(type: "visibilitychange", listener: () => void) => void} addEventListener Registers a visibility listener.
 * @property {(type: "visibilitychange", listener: () => void) => void} removeEventListener Removes a visibility listener.
 */

/**
 * @callback AudioFetch
 * @param {string} url
 * @param {{ signal: AbortSignal, mode: "cors" }} init
 * @returns {Promise<Response>}
 */

/**
 * @callback AudioHashBytes
 * @param {ArrayBuffer} bytes
 * @param {"SHA-256"} algorithm
 * @returns {Promise<string>}
 */

/**
 * @typedef {Object} AudioLoadOptions
 * @property {AbortSignal | undefined} [signal] Optional caller cancellation signal.
 */

/**
 * @typedef {Object} AeroWebAudioServiceOptions
 * @property {AudioContextAdapter | undefined} [audioContext] Injected context; the service does not close externally owned contexts.
 * @property {(() => AudioContextAdapter | undefined) | undefined} [audioContextFactory] Optional owned-context factory.
 * @property {AudioFetch | null | undefined} [fetch] Injected CORS fetch adapter; null explicitly disables URL loading.
 * @property {AudioHashBytes | null | undefined} [hashBytes] Injected SHA-256 adapter; null explicitly disables verification.
 * @property {AudioVisibilityTarget | undefined} [visibilityTarget] Injected document visibility target.
 * @property {((url: string) => void) | undefined} [revokeObjectURL] Injected object-URL revoker.
 * @property {boolean | undefined} [initialLeaseActive] Whether this instance initially owns the media lease.
 */

/**
 * @typedef {Object} AeroWebAudioService
 * @property {"aero.audio.clock"} serviceId Stable service ID.
 * @property {() => AudioServiceStatus} getStatus Reads current lifecycle state.
 * @property {() => AudioServiceCapabilities} getCapabilities Reads immutable capability truth.
 * @property {() => AudioSourceDescriptor | undefined} getSource Reads loaded source metadata without encoded bytes.
 * @property {(source: AudioSourceDescriptorInput, options?: AudioLoadOptions) => Promise<AudioOperationResult>} load Loads and decodes a source.
 * @property {() => Promise<AudioOperationResult>} play Starts or resumes playback.
 * @property {() => Promise<AudioOperationResult>} pause Pauses playback.
 * @property {() => Promise<AudioOperationResult>} stop Stops playback and rewinds to zero.
 * @property {(positionSeconds: number) => Promise<AudioOperationResult>} seek Moves playback to a timeline position.
 * @property {(hidden: boolean) => Promise<AudioOperationResult>} setDocumentHidden Applies visibility pause/resume policy.
 * @property {() => Promise<AudioOperationResult>} activateLease Activates or reacquires this instance's media lease.
 * @property {() => Promise<AudioOperationResult>} pauseForLease Pauses while another game instance takes the lease.
 * @property {() => Promise<AudioOperationResult>} releaseLease Releases the lease and clears automatic-resume intent.
 * @property {() => PlaybackClockSnapshot} getClockSnapshot Reads authoritative clock state.
 * @property {() => Promise<AudioOperationResult>} destroy Idempotently tears down owned resources.
 */

/**
 * Creates a reconnectable per-game Web Audio service. Destroyed services are
 * terminal; reconnecting an `aero-game` creates a fresh service generation.
 *
 * @param {AeroWebAudioServiceOptions} [options]
 * @returns {AeroWebAudioService}
 */
export function createAeroWebAudioService(options = {}) {
  const injectedContext = options.audioContext;
  const contextFactory = options.audioContextFactory ?? createBrowserAudioContext;
  const audioContext = injectedContext ?? contextFactory();
  const ownsAudioContext = !injectedContext && Boolean(audioContext);
  const fetchAudio = options.fetch === undefined ? createBrowserFetch() : options.fetch;
  const hashBytes = options.hashBytes === undefined ? createBrowserHashBytes() : options.hashBytes;
  const visibilityTarget = options.visibilityTarget ?? createBrowserVisibilityTarget();
  const revokeObjectURL = options.revokeObjectURL ?? createBrowserObjectUrlRevoker();

  /** @type {AudioSourceDescriptor | undefined} */
  let source;
  /** @type {AudioBufferAdapter | undefined} */
  let decodedBuffer;
  /** @type {AudioBufferSourceNodeAdapter | undefined} */
  let playbackNode;
  /** @type {PlaybackClock} */
  let clock = createPlaybackClock();
  /** @type {AudioServiceState} */
  let state = audioContext ? "idle" : "unsupported";
  /** @type {AudioAutoplayState} */
  let autoplayState = audioContext ? "unknown" : "unavailable";
  /** @type {AudioVisibilityState} */
  let visibilityState = visibilityTarget?.hidden ? "hidden" : "visible";
  /** @type {AudioLeaseState} */
  let leaseState = options.initialLeaseActive === false ? "inactive" : "active";
  /** @type {AudioServiceError | undefined} */
  let error = audioContext ? undefined : createError("audio_context_failed", "Web Audio API unavailable in this browser context");
  let generation = 0;
  let operationId = 0;
  let destroyed = false;
  let resumeAfterVisibility = false;
  let resumeAfterLease = false;
  /** @type {AbortController | undefined} */
  let loadController;
  /** @type {string | undefined} */
  let ownedObjectUrl;

  const visibilityListener = () => {
    void setDocumentHidden(Boolean(visibilityTarget?.hidden));
  };
  visibilityTarget?.addEventListener("visibilitychange", visibilityListener);

  const capabilities = Object.freeze({
    webAudio: Boolean(audioContext),
    encodedAudioDecode: Boolean(audioContext?.decodeAudioData),
    bufferPlayback: Boolean(audioContext?.createBufferSource),
    urlLoading: Boolean(fetchAudio),
    blobLoading: typeof Blob !== "undefined",
    arrayBufferLoading: typeof ArrayBuffer !== "undefined",
    hashVerification: Boolean(hashBytes),
    visibilityLifecycle: true,
    leaseLifecycle: true
  });

  return Object.freeze({
    serviceId: "aero.audio.clock",
    getStatus,
    getCapabilities() {
      return capabilities;
    },
    getSource() {
      return source ? cloneSourceDescriptor(source) : undefined;
    },
    load,
    play,
    pause,
    stop,
    seek,
    setDocumentHidden,
    activateLease,
    pauseForLease,
    releaseLease,
    getClockSnapshot() {
      return clock.snapshot(contextTime());
    },
    destroy
  });

  /** @returns {AudioServiceStatus} */
  function getStatus() {
    const snapshot = clock.snapshot(contextTime());
    return Object.freeze({
      state,
      supported: Boolean(audioContext),
      generation,
      sourceId: source?.id,
      positionSeconds: snapshot.positionSeconds,
      durationSeconds: source?.durationSeconds ?? snapshot.durationSeconds,
      contextState: audioContext?.state ?? "unavailable",
      autoplayState,
      visibilityState,
      leaseState,
      errorCode: error?.code,
      errorMessage: error?.message
    });
  }

  /**
   * @param {AudioSourceDescriptorInput} sourceInput
   * @param {AudioLoadOptions} [loadOptions]
   * @returns {Promise<AudioOperationResult>}
   */
  async function load(sourceInput, loadOptions = {}) {
    const previousStatus = getStatus();
    if (!audioContext || destroyed) {
      setTerminalError(destroyed ? "audio_destroyed" : "audio_context_failed", destroyed ? "Audio service is destroyed" : "Web Audio API unavailable in this browser context");
      return result(previousStatus, false);
    }

    const descriptor = createAudioSourceDescriptor(sourceInput);
    const currentGeneration = ++generation;
    const currentOperation = ++operationId;
    loadController?.abort();
    const linked = createLinkedAbortController(loadOptions.signal);
    loadController = linked.controller;
    stopPlaybackNode();
    revokeOwnedObjectUrl();
    decodedBuffer = undefined;
    source = descriptor;
    ownedObjectUrl = descriptor.kind === "object-url" && descriptor.ownsObjectUrl ? descriptor.url : undefined;
    clock = createPlaybackClock({ durationSeconds: descriptor.durationSeconds });
    state = "loading";
    error = undefined;

    try {
      if (descriptor.kind === "generated-silence") {
        state = "ready";
        return result(previousStatus, false);
      }
      const bytes = await resolveEncodedBytes(sourceInput, descriptor, linked.controller.signal);
      if (isStale(currentGeneration, currentOperation)) {
        return result(previousStatus, true);
      }
      await verifyExpectedHash(bytes, descriptor);
      if (isStale(currentGeneration, currentOperation)) {
        return result(previousStatus, true);
      }
      if (!audioContext.decodeAudioData) {
        throw createAudioFailure("audio_decode_unsupported", "This Web Audio context cannot decode encoded audio bytes");
      }
      let nextBuffer;
      try {
        nextBuffer = await audioContext.decodeAudioData(bytes.slice(0));
      } catch (decodeCause) {
        throw createAudioFailure("audio_decode_failed", `Browser audio decode failed; file extensions such as .egg do not guarantee codec support${diagnosticSuffix(decodeCause)}`);
      }
      if (isStale(currentGeneration, currentOperation)) {
        return result(previousStatus, true);
      }
      decodedBuffer = nextBuffer;
      source = Object.freeze({ ...descriptor, durationSeconds: normalizeDecodedDuration(nextBuffer.duration, descriptor.durationSeconds) });
      clock = createPlaybackClock({ durationSeconds: source.durationSeconds });
      state = "ready";
      error = undefined;
      return result(previousStatus, false);
    } catch (cause) {
      if (isStale(currentGeneration, currentOperation)) {
        return result(previousStatus, true);
      }
      const failure = normalizeFailure(cause, linked.controller.signal.aborted);
      setTerminalError(failure.code, failure.message);
      return result(previousStatus, false);
    } finally {
      linked.cleanup();
      if (loadController === linked.controller) {
        loadController = undefined;
      }
    }
  }

  /** @returns {Promise<AudioOperationResult>} */
  async function play() {
    const previousStatus = getStatus();
    return playFromIntent(previousStatus);
  }

  /**
   * @param {AudioServiceStatus} previousStatus
   * @returns {Promise<AudioOperationResult>}
   */
  async function playFromIntent(previousStatus) {
    if (!audioContext || destroyed) {
      setTerminalError(destroyed ? "audio_destroyed" : "audio_context_failed", destroyed ? "Audio service is destroyed" : "Web Audio API unavailable in this browser context");
      return result(previousStatus, false);
    }
    if (!source || state === "loading") {
      setTerminalError("audio_source_missing", state === "loading" ? "Audio source is still loading" : "No audio source loaded");
      return result(previousStatus, false);
    }
    if (leaseState !== "active") {
      setTerminalError("audio_lease_inactive", "This game instance does not own the audio lease");
      return result(previousStatus, false);
    }
    if (visibilityState === "hidden") {
      setTerminalError("audio_document_hidden", "Audio playback is paused while the document is hidden");
      return result(previousStatus, false);
    }

    const currentOperation = ++operationId;
    const currentGeneration = generation;
    try {
      await audioContext.resume();
      if (isStale(currentGeneration, currentOperation)) {
        await suspendAfterStaleResume();
        return result(previousStatus, true);
      }
      if (audioContext.state === "suspended") {
        throw createAudioFailure("audio_autoplay_blocked", "Browser autoplay policy kept the AudioContext suspended");
      }
      autoplayState = "allowed";
      error = undefined;
      let snapshot = clock.snapshot(contextTime());
      if (source.durationSeconds !== undefined && snapshot.positionSeconds >= source.durationSeconds) {
        clock.seek(0, contextTime());
        snapshot = clock.snapshot(contextTime());
      }
      startPlaybackNode(snapshot.positionSeconds, currentGeneration);
      clock.start(contextTime());
      state = "playing";
      resumeAfterLease = false;
      resumeAfterVisibility = false;
      return result(previousStatus, false);
    } catch (cause) {
      if (isStale(currentGeneration, currentOperation)) {
        return result(previousStatus, true);
      }
      const failure = normalizePlayFailure(cause);
      autoplayState = failure.code === "audio_autoplay_blocked" ? "blocked" : autoplayState;
      setTerminalError(failure.code, failure.message);
      return result(previousStatus, false);
    }
  }

  /** @returns {Promise<AudioOperationResult>} */
  async function pause() {
    const previousStatus = getStatus();
    await pauseInternal("paused");
    resumeAfterLease = false;
    resumeAfterVisibility = false;
    return result(previousStatus, false);
  }

  /**
   * @param {AudioServiceState} nextState
   * @returns {Promise<void>}
   */
  async function pauseInternal(nextState) {
    ++operationId;
    if (!audioContext || destroyed) {
      return;
    }
    clock.pause(contextTime());
    stopPlaybackNode();
    if (audioContext.state !== "closed") {
      try {
        await audioContext.suspend();
      } catch (cause) {
        setTerminalError("audio_context_failed", `AudioContext suspend failed${diagnosticSuffix(cause)}`);
        return;
      }
    }
    state = source ? nextState : "idle";
    error = undefined;
  }

  /** @returns {Promise<AudioOperationResult>} */
  async function stop() {
    const previousStatus = getStatus();
    ++operationId;
    clock.stop();
    stopPlaybackNode();
    if (audioContext && !destroyed && audioContext.state !== "closed") {
      try {
        await audioContext.suspend();
      } catch (cause) {
        setTerminalError("audio_context_failed", `AudioContext suspend failed${diagnosticSuffix(cause)}`);
        return result(previousStatus, false);
      }
    }
    state = source ? "stopped" : audioContext ? "idle" : "unsupported";
    error = undefined;
    resumeAfterLease = false;
    resumeAfterVisibility = false;
    return result(previousStatus, false);
  }

  /**
   * @param {number} positionSeconds
   * @returns {Promise<AudioOperationResult>}
   */
  async function seek(positionSeconds) {
    const previousStatus = getStatus();
    if (destroyed) {
      setTerminalError("audio_destroyed", "Audio service is destroyed");
      return result(previousStatus, false);
    }
    const wasPlaying = state === "playing";
    const safePosition = normalizePosition(positionSeconds, source?.durationSeconds);
    ++operationId;
    stopPlaybackNode();
    clock.seek(safePosition, contextTime());
    if (wasPlaying && audioContext) {
      startPlaybackNode(safePosition, generation);
      clock.start(contextTime());
      state = "playing";
    } else if (source) {
      state = "paused";
    }
    error = undefined;
    return result(previousStatus, false);
  }

  /**
   * @param {boolean} hidden
   * @returns {Promise<AudioOperationResult>}
   */
  async function setDocumentHidden(hidden) {
    const previousStatus = getStatus();
    const nextVisibility = hidden ? "hidden" : "visible";
    if (visibilityState === nextVisibility || destroyed) {
      return result(previousStatus, false);
    }
    visibilityState = nextVisibility;
    if (hidden) {
      resumeAfterVisibility = state === "playing";
      await pauseInternal(source ? "paused" : "idle");
      return result(previousStatus, false);
    }
    if (resumeAfterVisibility && leaseState === "active") {
      resumeAfterVisibility = false;
      return playFromIntent(previousStatus);
    }
    return result(previousStatus, false);
  }

  /** @returns {Promise<AudioOperationResult>} */
  async function activateLease() {
    const previousStatus = getStatus();
    if (destroyed) {
      setTerminalError("audio_destroyed", "Audio service is destroyed");
      return result(previousStatus, false);
    }
    leaseState = "active";
    if (resumeAfterLease && visibilityState === "visible") {
      resumeAfterLease = false;
      return playFromIntent(previousStatus);
    }
    error = undefined;
    return result(previousStatus, false);
  }

  /** @returns {Promise<AudioOperationResult>} */
  async function pauseForLease() {
    const previousStatus = getStatus();
    if (destroyed) {
      return result(previousStatus, false);
    }
    resumeAfterLease = state === "playing";
    leaseState = "inactive";
    await pauseInternal(source ? "paused" : "idle");
    return result(previousStatus, false);
  }

  /** @returns {Promise<AudioOperationResult>} */
  async function releaseLease() {
    const previousStatus = getStatus();
    if (destroyed) {
      return result(previousStatus, false);
    }
    leaseState = "released";
    resumeAfterLease = false;
    await pauseInternal(source ? "paused" : "idle");
    return result(previousStatus, false);
  }

  /** @returns {Promise<AudioOperationResult>} */
  async function destroy() {
    const previousStatus = getStatus();
    if (destroyed) {
      return result(previousStatus, false);
    }
    destroyed = true;
    ++generation;
    ++operationId;
    loadController?.abort();
    loadController = undefined;
    visibilityTarget?.removeEventListener("visibilitychange", visibilityListener);
    stopPlaybackNode();
    revokeOwnedObjectUrl();
    decodedBuffer = undefined;
    source = undefined;
    clock.stop();
    leaseState = "released";
    resumeAfterLease = false;
    resumeAfterVisibility = false;
    state = "destroyed";
    error = undefined;
    if (audioContext && ownsAudioContext && audioContext.state !== "closed") {
      try {
        await audioContext.close();
      } catch (cause) {
        error = createError("audio_context_failed", `Owned AudioContext close failed${diagnosticSuffix(cause)}`);
      }
    }
    return result(previousStatus, false);
  }

  /**
   * @param {AudioSourceDescriptorInput} input
   * @param {AudioSourceDescriptor} descriptor
   * @param {AbortSignal} signal
   * @returns {Promise<ArrayBuffer>}
   */
  async function resolveEncodedBytes(input, descriptor, signal) {
    if (signal.aborted) {
      throw createAbortFailure();
    }
    if (descriptor.kind === "array-buffer" && input.arrayBuffer) {
      return input.arrayBuffer.slice(0);
    }
    if (descriptor.kind === "blob" && input.blob) {
      return input.blob.arrayBuffer();
    }
    if ((descriptor.kind === "url" || descriptor.kind === "object-url") && descriptor.url) {
      if (!fetchAudio) {
        throw createAudioFailure("audio_fetch_failed", "No browser fetch implementation is available for URL audio");
      }
      let response;
      try {
        response = await fetchAudio(descriptor.url, { signal, mode: "cors" });
      } catch (cause) {
        if (signal.aborted) {
          throw createAbortFailure();
        }
        throw createAudioFailure("audio_fetch_failed", `Audio fetch failed; verify HTTPS and CORS access${diagnosticSuffix(cause)}`);
      }
      if (!response.ok) {
        throw createAudioFailure("audio_fetch_http_error", `Audio fetch failed with HTTP ${response.status}`);
      }
      try {
        return await response.arrayBuffer();
      } catch (cause) {
        throw createAudioFailure("audio_fetch_failed", `Audio response bytes could not be read${diagnosticSuffix(cause)}`);
      }
    }
    throw createAudioFailure("audio_source_missing", "Audio source does not contain encoded bytes");
  }

  /**
   * @param {ArrayBuffer} bytes
   * @param {AudioSourceDescriptor} descriptor
   * @returns {Promise<void>}
   */
  async function verifyExpectedHash(bytes, descriptor) {
    if (!descriptor.expectedHash) {
      return;
    }
    if (!hashBytes) {
      throw createAudioFailure("audio_hash_unavailable", "SHA-256 verification is unavailable in this browser context");
    }
    const actual = (await hashBytes(bytes, descriptor.expectedHash.algorithm)).toLowerCase();
    if (actual !== descriptor.expectedHash.value) {
      throw createAudioFailure("audio_hash_mismatch", `Audio SHA-256 mismatch: expected ${descriptor.expectedHash.value}, received ${actual}`);
    }
  }

  /**
   * @param {number} offsetSeconds
   * @param {number} nodeGeneration
   */
  function startPlaybackNode(offsetSeconds, nodeGeneration) {
    stopPlaybackNode();
    if (!decodedBuffer || !audioContext?.createBufferSource) {
      return;
    }
    const node = audioContext.createBufferSource();
    node.buffer = decodedBuffer;
    if (audioContext.destination !== undefined) {
      node.connect(audioContext.destination);
    }
    node.onended = () => {
      if (node !== playbackNode || nodeGeneration !== generation || state !== "playing") {
        return;
      }
      playbackNode = undefined;
      clock.seek(source?.durationSeconds ?? decodedBuffer?.duration ?? offsetSeconds, contextTime());
      clock.pause(contextTime());
      state = "stopped";
    };
    node.start(0, offsetSeconds);
    playbackNode = node;
  }

  function stopPlaybackNode() {
    const node = playbackNode;
    playbackNode = undefined;
    if (!node) {
      return;
    }
    node.onended = null;
    try {
      node.stop();
    } catch {
      // A source that never started or already ended is still safe to disconnect.
    }
    try {
      node.disconnect();
    } catch {
      // Disconnect is idempotent across supported browser adapters.
    }
  }

  function revokeOwnedObjectUrl() {
    if (ownedObjectUrl && revokeObjectURL) {
      revokeObjectURL(ownedObjectUrl);
    }
    ownedObjectUrl = undefined;
  }

  /**
   * @param {number} currentGeneration
   * @param {number} currentOperation
   * @returns {boolean}
   */
  function isStale(currentGeneration, currentOperation) {
    return destroyed || generation !== currentGeneration || operationId !== currentOperation;
  }

  /**
   * A browser resume promise may settle after pause, load, or lease intent has
   * superseded it. Re-suspend only when no newer operation is playing.
   *
   * @returns {Promise<void>}
   */
  async function suspendAfterStaleResume() {
    if (destroyed || state === "playing" || !audioContext || audioContext.state === "closed" || audioContext.state === "suspended") {
      return;
    }
    try {
      await audioContext.suspend();
    } catch {
      // A newer lifecycle operation owns any subsequent context diagnostic.
    }
  }

  /** @returns {number} */
  function contextTime() {
    return audioContext && Number.isFinite(audioContext.currentTime) ? Math.max(0, audioContext.currentTime) : 0;
  }

  /**
   * @param {AudioServiceStatus} previousStatus
   * @param {boolean} stale
   * @returns {AudioOperationResult}
   */
  function result(previousStatus, stale) {
    return Object.freeze({ previousStatus, status: getStatus(), stale });
  }

  /**
   * @param {AudioErrorCode} code
   * @param {string} message
   */
  function setTerminalError(code, message) {
    error = createError(code, message);
    state = destroyed ? "destroyed" : audioContext ? "error" : "unsupported";
  }
}

/**
 * @param {AudioErrorCode} code
 * @param {string} message
 * @returns {AudioServiceError}
 */
function createError(code, message) {
  return Object.freeze({ code, message });
}

/**
 * @typedef {Object} AudioFailure
 * @property {AudioErrorCode} audioCode
 * @property {string} message
 */

/**
 * @param {AudioErrorCode} code
 * @param {string} message
 * @returns {AudioFailure}
 */
function createAudioFailure(code, message) {
  return Object.freeze({ audioCode: code, message });
}

/** @returns {AudioFailure} */
function createAbortFailure() {
  return createAudioFailure("audio_operation_aborted", "Audio operation was aborted");
}

/**
 * @param {unknown} cause
 * @param {boolean} aborted
 * @returns {AudioServiceError}
 */
function normalizeFailure(cause, aborted) {
  if (aborted) {
    return createError("audio_operation_aborted", "Audio operation was aborted");
  }
  if (isAudioFailure(cause)) {
    return createError(cause.audioCode, cause.message);
  }
  return createError("audio_context_failed", `Audio operation failed${diagnosticSuffix(cause)}`);
}

/**
 * @param {unknown} cause
 * @returns {AudioServiceError}
 */
function normalizePlayFailure(cause) {
  if (isAudioFailure(cause)) {
    return createError(cause.audioCode, cause.message);
  }
  return createError("audio_autoplay_blocked", `Browser rejected AudioContext resume/playback${diagnosticSuffix(cause)}`);
}

/**
 * @param {unknown} value
 * @returns {value is AudioFailure}
 */
function isAudioFailure(value) {
  return typeof value === "object" && value !== null && "audioCode" in value && "message" in value;
}

/**
 * @param {unknown} cause
 * @returns {string}
 */
function diagnosticSuffix(cause) {
  return cause instanceof Error && cause.message ? `: ${cause.message}` : "";
}

/**
 * @param {number} decodedDuration
 * @param {number | undefined} fallback
 * @returns {number | undefined}
 */
function normalizeDecodedDuration(decodedDuration, fallback) {
  return Number.isFinite(decodedDuration) && decodedDuration >= 0 ? decodedDuration : fallback;
}

/**
 * @param {AudioSourceDescriptor} descriptor
 * @returns {AudioSourceDescriptor}
 */
function cloneSourceDescriptor(descriptor) {
  return Object.freeze({
    id: descriptor.id,
    kind: descriptor.kind,
    label: descriptor.label,
    durationSeconds: descriptor.durationSeconds,
    url: descriptor.url,
    contentType: descriptor.contentType,
    expectedHash: descriptor.expectedHash ? Object.freeze({ ...descriptor.expectedHash }) : undefined,
    ownsObjectUrl: descriptor.ownsObjectUrl
  });
}

/**
 * @param {AbortSignal | undefined} signal
 * @returns {{ controller: AbortController, cleanup: () => void }}
 */
function createLinkedAbortController(signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener("abort", abort, { once: true });
  }
  return {
    controller,
    cleanup() {
      signal?.removeEventListener("abort", abort);
    }
  };
}

/** @returns {AudioContextAdapter | undefined} */
function createBrowserAudioContext() {
  const browserGlobal = /** @type {typeof globalThis & { webkitAudioContext?: typeof AudioContext }} */ (globalThis);
  const AudioContextConstructor = globalThis.AudioContext ?? browserGlobal.webkitAudioContext;
  if (!AudioContextConstructor) {
    return undefined;
  }
  return /** @type {AudioContextAdapter} */ (/** @type {unknown} */ (new AudioContextConstructor()));
}

/** @returns {AudioFetch | undefined} */
function createBrowserFetch() {
  if (typeof globalThis.fetch !== "function") {
    return undefined;
  }
  return (url, init) => globalThis.fetch(url, init);
}

/** @returns {AudioHashBytes | undefined} */
function createBrowserHashBytes() {
  if (!globalThis.crypto?.subtle) {
    return undefined;
  }
  return async (bytes, algorithm) => {
    const digest = await globalThis.crypto.subtle.digest(algorithm, bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  };
}

/** @returns {AudioVisibilityTarget | undefined} */
function createBrowserVisibilityTarget() {
  return typeof document === "undefined" ? undefined : document;
}

/** @returns {((url: string) => void) | undefined} */
function createBrowserObjectUrlRevoker() {
  return typeof URL.revokeObjectURL === "function" ? url => URL.revokeObjectURL(url) : undefined;
}
