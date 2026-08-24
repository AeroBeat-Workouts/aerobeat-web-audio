// @ts-check

/**
 * AeroBeat Web Audio service ID consumed through assembly wiring.
 *
 * @type {"aero.audio.playback"}
 */
export const aeroAudioServiceId = "aero.audio.playback";

/**
 * @typedef {"idle" | "unsupported" | "ready" | "playing" | "paused" | "stopped" | "error"} AudioServiceState
 */

/**
 * @typedef {"url" | "array-buffer" | "media-element" | "generated-silence"} AudioSourceKind
 */

/**
 * @typedef {Object} AudioSourceDescriptorInput
 * @property {string} id Stable song/audio source ID.
 * @property {AudioSourceKind} kind Source storage kind.
 * @property {string} label Human-readable source label.
 * @property {number | undefined} durationSeconds Known source duration, when available.
 * @property {string | undefined} url Browser-resolvable URL for URL-backed sources.
 * @property {ArrayBuffer | undefined} arrayBuffer Encoded audio bytes for future decode paths.
 * @property {HTMLMediaElement | undefined} mediaElement Existing media element for future element-backed paths.
 */

/**
 * @typedef {Object} AudioSourceDescriptor
 * @property {string} id Stable song/audio source ID.
 * @property {AudioSourceKind} kind Source storage kind.
 * @property {string} label Human-readable source label.
 * @property {number | undefined} durationSeconds Known source duration, when available.
 * @property {string | undefined} url Browser-resolvable URL for URL-backed sources.
 * @property {ArrayBuffer | undefined} arrayBuffer Encoded audio bytes for future decode paths.
 * @property {HTMLMediaElement | undefined} mediaElement Existing media element for future element-backed paths.
 */

/**
 * @typedef {Object} AudioServiceStatus
 * @property {AudioServiceState} state Current lifecycle state.
 * @property {boolean} supported Whether a Web Audio context is available.
 * @property {string | undefined} sourceId Loaded audio source ID.
 * @property {number} positionSeconds Current playback position.
 * @property {number | undefined} durationSeconds Loaded source duration, when known.
 * @property {string | undefined} errorMessage Last unsupported/error diagnostic.
 */

/**
 * @typedef {Object} PlaybackClockSnapshot
 * @property {number} contextTimeSeconds Current audio-context time.
 * @property {number} positionSeconds Song playback position.
 * @property {number | undefined} durationSeconds Song duration, when known.
 * @property {number} progress Normalized progress from 0 to 1 when duration is known, otherwise 0.
 * @property {boolean} playing Whether the clock is currently advancing.
 */

/**
 * @typedef {Object} PlaybackClock
 * @property {(contextTimeSeconds: number) => void} start Starts advancing from the current offset.
 * @property {(contextTimeSeconds: number) => void} pause Freezes the clock at the current position.
 * @property {() => void} stop Stops and rewinds to zero.
 * @property {(positionSeconds: number, contextTimeSeconds: number) => void} seek Sets the current playback position.
 * @property {(contextTimeSeconds: number) => PlaybackClockSnapshot} snapshot Reads a clock snapshot.
 */

/**
 * @typedef {Object} SongTimeline
 * @property {number} bpm Beats per minute.
 * @property {number} offsetSeconds Time offset for beat zero.
 * @property {number | undefined} durationSeconds Song duration, when known.
 * @property {(seconds: number) => number} secondsToBeat Converts timeline seconds to beat position.
 * @property {(beat: number) => number} beatToSeconds Converts beat position to timeline seconds.
 */

/**
 * @typedef {Object} AudioOperationResult
 * @property {AudioServiceStatus} status Service status after the operation.
 * @property {AudioServiceStatus} [previousStatus] Service status before the operation.
 */

/**
 * @typedef {Object} AudioContextAdapter
 * @property {number} currentTime Audio context time in seconds.
 * @property {string} state Browser audio context state.
 * @property {() => Promise<void>} resume Resumes the audio context.
 * @property {() => Promise<void>} suspend Suspends the audio context.
 * @property {() => Promise<void>} close Closes the audio context.
 */

/**
 * @typedef {Object} AeroWebAudioServiceOptions
 * @property {AudioContextAdapter | undefined} audioContext Optional Web Audio context adapter for tests or assembly wiring.
 */

/**
 * @typedef {Object} AeroWebAudioService
 * @property {"aero.audio.playback"} serviceId Stable service ID.
 * @property {() => AudioServiceStatus} getStatus Reads current lifecycle state.
 * @property {() => AudioSourceDescriptor | undefined} getSource Reads the loaded source descriptor.
 * @property {(source: AudioSourceDescriptorInput) => Promise<AudioOperationResult>} load Loads a source descriptor into the playback boundary.
 * @property {() => Promise<AudioOperationResult>} play Starts or resumes playback.
 * @property {() => Promise<AudioOperationResult>} pause Pauses playback.
 * @property {() => Promise<AudioOperationResult>} stop Stops playback and rewinds to zero.
 * @property {(positionSeconds: number) => Promise<AudioOperationResult>} seek Moves playback to a timeline position.
 * @property {() => PlaybackClockSnapshot} getClockSnapshot Reads current clock/timeline state.
 */

/**
 * Creates the AeroBeat Web Audio facade.
 *
 * The current scaffold owns lifecycle truth and deterministic clock state. It
 * does not decode, analyze, import, score, or render audio content yet.
 *
 * @param {AeroWebAudioServiceOptions} [options]
 * @returns {AeroWebAudioService}
 */
export function createAeroWebAudioService(options = {}) {
  const audioContext = options.audioContext ?? createBrowserAudioContext();
  /** @type {AudioSourceDescriptor | undefined} */
  let source;
  /** @type {AudioServiceStatus} */
  let status = audioContext
    ? createStatus("idle", true, undefined, 0, undefined, undefined)
    : createStatus("unsupported", false, undefined, 0, undefined, "Web Audio API unavailable in this browser context");
  const clock = createPlaybackClock();

  return {
    serviceId: aeroAudioServiceId,
    getStatus() {
      return cloneStatus(status);
    },
    getSource() {
      return source ? cloneSourceDescriptor(source) : undefined;
    },
    async load(sourceInput) {
      const previousStatus = cloneStatus(status);
      if (!audioContext) {
        status = unsupportedStatus(status.positionSeconds);
        return { previousStatus, status: cloneStatus(status) };
      }
      source = createAudioSourceDescriptor(sourceInput);
      clock.stop();
      status = createStatus("ready", true, source.id, 0, source.durationSeconds, undefined);
      return { previousStatus, status: cloneStatus(status) };
    },
    async play() {
      const previousStatus = cloneStatus(status);
      if (!audioContext) {
        status = unsupportedStatus(status.positionSeconds);
        return { previousStatus, status: cloneStatus(status) };
      }
      if (!source) {
        status = createStatus("error", true, undefined, status.positionSeconds, undefined, "No audio source loaded");
        return { previousStatus, status: cloneStatus(status) };
      }
      await audioContext.resume();
      clock.start(audioContext.currentTime);
      status = statusFromClock("playing", true, source, clock.snapshot(audioContext.currentTime), undefined);
      return { previousStatus, status: cloneStatus(status) };
    },
    async pause() {
      const previousStatus = cloneStatus(status);
      if (!audioContext) {
        status = unsupportedStatus(status.positionSeconds);
        return { previousStatus, status: cloneStatus(status) };
      }
      await audioContext.suspend();
      clock.pause(audioContext.currentTime);
      status = statusFromClock(source ? "paused" : "idle", true, source, clock.snapshot(audioContext.currentTime), undefined);
      return { previousStatus, status: cloneStatus(status) };
    },
    async stop() {
      const previousStatus = cloneStatus(status);
      if (!audioContext) {
        status = unsupportedStatus(0);
        return { previousStatus, status: cloneStatus(status) };
      }
      clock.stop();
      if (audioContext.state !== "closed") {
        await audioContext.suspend();
      }
      status = createStatus(source ? "stopped" : "idle", true, source?.id, 0, source?.durationSeconds, undefined);
      return { previousStatus, status: cloneStatus(status) };
    },
    async seek(positionSeconds) {
      const previousStatus = cloneStatus(status);
      const safePosition = normalizePosition(positionSeconds, source?.durationSeconds);
      if (!audioContext) {
        status = unsupportedStatus(safePosition);
        return { previousStatus, status: cloneStatus(status) };
      }
      clock.seek(safePosition, audioContext.currentTime);
      const nextState = status.state === "playing" ? "playing" : source ? "paused" : "idle";
      status = statusFromClock(nextState, true, source, clock.snapshot(audioContext.currentTime), undefined);
      return { previousStatus, status: cloneStatus(status) };
    },
    getClockSnapshot() {
      return clock.snapshot(audioContext?.currentTime ?? 0);
    }
  };
}

/**
 * Normalizes an audio source descriptor.
 *
 * @param {AudioSourceDescriptorInput} input
 * @returns {AudioSourceDescriptor}
 */
export function createAudioSourceDescriptor(input) {
  if (!input.id.trim()) {
    throw new TypeError("Audio source id is required");
  }
  if (!input.label.trim()) {
    throw new TypeError("Audio source label is required");
  }
  if (input.durationSeconds !== undefined && (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 0)) {
    throw new TypeError("Audio source duration must be a non-negative finite number when provided");
  }
  if (input.kind === "url" && !input.url) {
    throw new TypeError("URL audio sources require a url");
  }
  if (input.kind === "array-buffer" && !input.arrayBuffer) {
    throw new TypeError("Array-buffer audio sources require an arrayBuffer");
  }
  if (input.kind === "media-element" && !input.mediaElement) {
    throw new TypeError("Media-element audio sources require a mediaElement");
  }

  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    durationSeconds: input.durationSeconds,
    url: input.url,
    arrayBuffer: input.arrayBuffer,
    mediaElement: input.mediaElement
  };
}

/**
 * Creates a deterministic playback clock.
 *
 * @param {{ durationSeconds?: number }} [options]
 * @returns {PlaybackClock}
 */
export function createPlaybackClock(options = {}) {
  const durationSeconds = options.durationSeconds;
  let playing = false;
  let offsetSeconds = 0;
  let startedAtContextTimeSeconds = 0;

  return {
    start(contextTimeSeconds) {
      if (!playing) {
        startedAtContextTimeSeconds = contextTimeSeconds;
        playing = true;
      }
    },
    pause(contextTimeSeconds) {
      offsetSeconds = currentPosition(contextTimeSeconds);
      playing = false;
    },
    stop() {
      offsetSeconds = 0;
      startedAtContextTimeSeconds = 0;
      playing = false;
    },
    seek(positionSeconds, contextTimeSeconds) {
      offsetSeconds = normalizePosition(positionSeconds, durationSeconds);
      startedAtContextTimeSeconds = contextTimeSeconds;
    },
    snapshot(contextTimeSeconds) {
      const positionSeconds = normalizePosition(currentPosition(contextTimeSeconds), durationSeconds);
      return {
        contextTimeSeconds,
        positionSeconds,
        durationSeconds,
        progress: durationSeconds && durationSeconds > 0 ? positionSeconds / durationSeconds : 0,
        playing
      };
    }
  };

  /**
   * @param {number} contextTimeSeconds
   * @returns {number}
   */
  function currentPosition(contextTimeSeconds) {
    return playing ? offsetSeconds + contextTimeSeconds - startedAtContextTimeSeconds : offsetSeconds;
  }
}

/**
 * Creates a simple song timeline helper.
 *
 * @param {{ bpm: number, offsetSeconds?: number, durationSeconds?: number }} options
 * @returns {SongTimeline}
 */
export function createSongTimeline(options) {
  const bpm = normalizeBpm(options.bpm);
  const offsetSeconds = options.offsetSeconds ?? 0;
  const durationSeconds = options.durationSeconds;
  return {
    bpm,
    offsetSeconds,
    durationSeconds,
    secondsToBeat(seconds) {
      return secondsToBeat(seconds, bpm, offsetSeconds);
    },
    beatToSeconds(beat) {
      return beatToSeconds(beat, bpm, offsetSeconds);
    }
  };
}

/**
 * Converts timeline seconds to beat position.
 *
 * @param {number} seconds
 * @param {number} bpm
 * @param {number} [offsetSeconds]
 * @returns {number}
 */
export function secondsToBeat(seconds, bpm, offsetSeconds = 0) {
  return (seconds - offsetSeconds) / secondsPerBeat(bpm);
}

/**
 * Converts beat position to timeline seconds.
 *
 * @param {number} beat
 * @param {number} bpm
 * @param {number} [offsetSeconds]
 * @returns {number}
 */
export function beatToSeconds(beat, bpm, offsetSeconds = 0) {
  return offsetSeconds + beat * secondsPerBeat(bpm);
}

/**
 * @returns {AudioContextAdapter | undefined}
 */
function createBrowserAudioContext() {
  const audioContextConstructor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!audioContextConstructor) {
    return undefined;
  }
  return new audioContextConstructor();
}

/**
 * @param {number} bpm
 * @returns {number}
 */
function secondsPerBeat(bpm) {
  return 60 / normalizeBpm(bpm);
}

/**
 * @param {number} bpm
 * @returns {number}
 */
function normalizeBpm(bpm) {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new TypeError("Timeline bpm must be a positive finite number");
  }
  return bpm;
}

/**
 * @param {number} positionSeconds
 * @param {number | undefined} durationSeconds
 * @returns {number}
 */
function normalizePosition(positionSeconds, durationSeconds) {
  if (!Number.isFinite(positionSeconds)) {
    return 0;
  }
  const nonNegativePosition = Math.max(0, positionSeconds);
  return durationSeconds === undefined ? nonNegativePosition : Math.min(durationSeconds, nonNegativePosition);
}

/**
 * @param {AudioServiceState} state
 * @param {boolean} supported
 * @param {string | undefined} sourceId
 * @param {number} positionSeconds
 * @param {number | undefined} durationSeconds
 * @param {string | undefined} errorMessage
 * @returns {AudioServiceStatus}
 */
function createStatus(state, supported, sourceId, positionSeconds, durationSeconds, errorMessage) {
  return {
    state,
    supported,
    sourceId,
    positionSeconds,
    durationSeconds,
    errorMessage
  };
}

/**
 * @param {number} positionSeconds
 * @returns {AudioServiceStatus}
 */
function unsupportedStatus(positionSeconds) {
  return createStatus("unsupported", false, undefined, positionSeconds, undefined, "Web Audio API unavailable in this browser context");
}

/**
 * @param {AudioServiceState} state
 * @param {boolean} supported
 * @param {AudioSourceDescriptor | undefined} source
 * @param {PlaybackClockSnapshot} snapshot
 * @param {string | undefined} errorMessage
 * @returns {AudioServiceStatus}
 */
function statusFromClock(state, supported, source, snapshot, errorMessage) {
  return createStatus(state, supported, source?.id, snapshot.positionSeconds, source?.durationSeconds, errorMessage);
}

/**
 * @param {AudioServiceStatus} status
 * @returns {AudioServiceStatus}
 */
function cloneStatus(status) {
  return {
    state: status.state,
    supported: status.supported,
    sourceId: status.sourceId,
    positionSeconds: status.positionSeconds,
    durationSeconds: status.durationSeconds,
    errorMessage: status.errorMessage
  };
}

/**
 * @param {AudioSourceDescriptor} source
 * @returns {AudioSourceDescriptor}
 */
function cloneSourceDescriptor(source) {
  return {
    id: source.id,
    kind: source.kind,
    label: source.label,
    durationSeconds: source.durationSeconds,
    url: source.url,
    arrayBuffer: source.arrayBuffer,
    mediaElement: source.mediaElement
  };
}
