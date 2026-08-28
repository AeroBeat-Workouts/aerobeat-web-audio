// @ts-check

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
        startedAtContextTimeSeconds = normalizeContextTime(contextTimeSeconds);
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
      startedAtContextTimeSeconds = normalizeContextTime(contextTimeSeconds);
    },
    snapshot(contextTimeSeconds) {
      const safeContextTime = normalizeContextTime(contextTimeSeconds);
      const positionSeconds = normalizePosition(currentPosition(safeContextTime), durationSeconds);
      return Object.freeze({
        contextTimeSeconds: safeContextTime,
        positionSeconds,
        durationSeconds,
        progress: durationSeconds && durationSeconds > 0 ? positionSeconds / durationSeconds : 0,
        playing
      });
    }
  };

  /**
   * @param {number} contextTimeSeconds
   * @returns {number}
   */
  function currentPosition(contextTimeSeconds) {
    const safeContextTime = normalizeContextTime(contextTimeSeconds);
    return playing ? offsetSeconds + safeContextTime - startedAtContextTimeSeconds : offsetSeconds;
  }
}

/**
 * Creates a song timeline helper.
 *
 * @param {{ bpm: number, offsetSeconds?: number, durationSeconds?: number }} options
 * @returns {SongTimeline}
 */
export function createSongTimeline(options) {
  const bpm = normalizeBpm(options.bpm);
  const offsetSeconds = options.offsetSeconds ?? 0;
  const durationSeconds = options.durationSeconds;
  return Object.freeze({
    bpm,
    offsetSeconds,
    durationSeconds,
    secondsToBeat(seconds) {
      return secondsToBeat(seconds, bpm, offsetSeconds);
    },
    beatToSeconds(beat) {
      return beatToSeconds(beat, bpm, offsetSeconds);
    }
  });
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
export function normalizePosition(positionSeconds, durationSeconds) {
  if (!Number.isFinite(positionSeconds)) {
    return 0;
  }
  const nonNegativePosition = Math.max(0, positionSeconds);
  return durationSeconds === undefined ? nonNegativePosition : Math.min(durationSeconds, nonNegativePosition);
}

/**
 * @param {number} contextTimeSeconds
 * @returns {number}
 */
function normalizeContextTime(contextTimeSeconds) {
  return Number.isFinite(contextTimeSeconds) ? Math.max(0, contextTimeSeconds) : 0;
}
