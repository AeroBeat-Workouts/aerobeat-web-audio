// @ts-check

/**
 * AeroBeat Web Audio service ID consumed through assembly wiring.
 *
 * @type {"aero.audio.clock"}
 */
export const aeroAudioServiceId = "aero.audio.clock";

export {
  createAeroWebAudioService
} from "./audio-service.js";

export {
  audioSourceKinds,
  createAudioSourceDescriptor
} from "./audio-source.js";

export {
  beatToSeconds,
  createPlaybackClock,
  createSongTimeline,
  secondsToBeat
} from "./playback-clock.js";

/**
 * @typedef {import("./audio-service.js").AudioServiceState} AudioServiceState
 * @typedef {import("./audio-service.js").AudioAutoplayState} AudioAutoplayState
 * @typedef {import("./audio-service.js").AudioVisibilityState} AudioVisibilityState
 * @typedef {import("./audio-service.js").AudioLeaseState} AudioLeaseState
 * @typedef {import("./audio-service.js").AudioErrorCode} AudioErrorCode
 * @typedef {import("./audio-service.js").AudioServiceError} AudioServiceError
 * @typedef {import("./audio-service.js").AudioMixSnapshot} AudioMixSnapshot
 * @typedef {import("./audio-service.js").AudioServiceStatus} AudioServiceStatus
 * @typedef {import("./audio-service.js").AudioServiceCapabilities} AudioServiceCapabilities
 * @typedef {import("./audio-service.js").AudioOperationResult} AudioOperationResult
 * @typedef {import("./audio-service.js").AudioBufferAdapter} AudioBufferAdapter
 * @typedef {import("./audio-service.js").AudioBufferSourceNodeAdapter} AudioBufferSourceNodeAdapter
 * @typedef {import("./audio-service.js").AudioParamAdapter} AudioParamAdapter
 * @typedef {import("./audio-service.js").AudioGainNodeAdapter} AudioGainNodeAdapter
 * @typedef {import("./audio-service.js").AudioContextAdapter} AudioContextAdapter
 * @typedef {import("./audio-service.js").AudioVisibilityTarget} AudioVisibilityTarget
 * @typedef {import("./audio-service.js").AudioFetch} AudioFetch
 * @typedef {import("./audio-service.js").AudioHashBytes} AudioHashBytes
 * @typedef {import("./audio-service.js").AudioLoadOptions} AudioLoadOptions
 * @typedef {import("./audio-service.js").AeroWebAudioServiceOptions} AeroWebAudioServiceOptions
 * @typedef {import("./audio-service.js").AeroWebAudioService} AeroWebAudioService
 * @typedef {import("./audio-source.js").AudioSourceKind} AudioSourceKind
 * @typedef {import("./audio-source.js").AudioHashAlgorithm} AudioHashAlgorithm
 * @typedef {import("./audio-source.js").AudioExpectedHash} AudioExpectedHash
 * @typedef {import("./audio-source.js").AudioSourceDescriptorInput} AudioSourceDescriptorInput
 * @typedef {import("./audio-source.js").AudioSourceDescriptor} AudioSourceDescriptor
 * @typedef {import("./playback-clock.js").PlaybackClockSnapshot} PlaybackClockSnapshot
 * @typedef {import("./playback-clock.js").PlaybackClock} PlaybackClock
 * @typedef {import("./playback-clock.js").SongTimeline} SongTimeline
 */
