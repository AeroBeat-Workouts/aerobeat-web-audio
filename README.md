# aerobeat-web-audio

Per-game Web Audio playback, authoritative clock, and lifecycle service for AeroBeat Web.

## Responsibility

This package owns browser audio resources for one connected game instance:

- encoded audio fetch, byte intake, optional SHA-256 verification, and browser decode;
- one-shot `AudioBufferSourceNode` recreation across play, pause, and seek;
- service-owned Music and reserved future-SFX gain buses with strict bounded mix control;
- deterministic gameplay-clock snapshots based on `AudioContext.currentTime`;
- autoplay/suspended-context capability and failure truth;
- hidden-document pause/resume while retaining decoded buffers;
- media-lease participation hooks for assembly-controlled instance transfer;
- generation-safe cancellation of late fetch, decode, and resume completion;
- complete teardown of owned contexts, nodes, object URLs, abort controllers, and listeners.

It does not own gameplay judgement, chart/content policy, CV, rendering, UI, cross-instance lease arbitration, iframe policy, or third-party audio acquisition. Assembly decides which game owns the lease; gameplay consumes clock snapshots without becoming audio authority.

## Public API

`src/index.js` exports:

- `aeroAudioServiceId`;
- `createAeroWebAudioService(options)`;
- `createAudioSourceDescriptor(input)` and `audioSourceKinds`;
- `createPlaybackClock()`, `createSongTimeline()`, `secondsToBeat()`, and `beatToSeconds()`;
- strict JSDoc shapes for service options, statuses, capabilities, errors, mix values, source metadata, adapters, and timeline snapshots.

`createAeroWebAudioService()` exposes exact `getMixSnapshot()` and `setMix({ musicVolume, sfxVolume })` methods. Both values default to `0.5`, accept only finite numbers from `0` through `1`, and apply immediately without restarting playback or changing clock authority. Music sources route through the Music gain bus; the connected SFX bus is reserved for future sources. Contexts without `createGain()` retain the same private scalar API and existing direct-playback fallback while reporting `gainBuses: false` through capabilities. Mix values never enter general service status or capability telemetry; only the direct mix methods return them.

The service supports `url`, `object-url`, `blob`, `array-buffer`, and deterministic `generated-silence` sources. Loaded source metadata never exposes encoded `ArrayBuffer` or `Blob` payloads.

### Source loading

URL and object-URL inputs use CORS-mode fetch through an injectable adapter. Blob and ArrayBuffer inputs decode directly. An optional expected SHA-256 digest verifies encoded bytes before decode. Stable failures distinguish fetch/CORS, HTTP, unavailable hash support, hash mismatch, unsupported decode, decode failure, autoplay rejection, inactive lease, hidden document, cancellation, and destroyed lifecycle.

A file extension is provenance metadata, not a codec contract. In particular, `.egg` bytes are passed to `decodeAudioData`; unsupported encoding is reported as a decode failure rather than guessed from the extension.

### Clock authority

`getClockSnapshot()` is the public timing authority. It derives position from explicit clock offsets and `AudioContext.currentTime`, freezes before context suspension, clamps to decoded duration, and continues from the exact frozen position after visibility or lease resumption. Wall time is not gameplay timing authority.

### Visibility and leases

- `setDocumentHidden(true|false)` pauses and conditionally resumes the prior playing intent without discarding the decoded buffer.
- `pauseForLease()` freezes playback while another game instance takes ownership.
- `activateLease()` reacquires the lease and resumes preserved intent when visible.
- `releaseLease()` pauses and clears automatic-resume intent.

The service does not discover other instances or choose the active owner.

### Ownership and reconnect

An injected `audioContext` remains caller-owned and is never closed by this package. A context created by `audioContextFactory` or the browser default is service-owned and closed by idempotent `destroy()`. Destroyed services are terminal; a reconnecting `aero-game` creates a fresh per-game service and generation.

## Adjacent Repositories

- `aerobeat-web-content` validates and resolves song/chart packages and hash expectations.
- `aerobeat-web-gameplay` consumes immutable audio-clock snapshots for deterministic judgement.
- `aerobeat-web-renderer` consumes snapshots for presentation timing.
- `aerobeat-web-ui` renders status and emits playback intent.
- `aerobeat-web-assembly` creates one audio service per game and owns cross-instance lease arbitration.

Runtime code must not import gameplay, renderer, content-authoring, UI, assembly, testbed, or sibling private source paths.

## Testing and Injection

The service accepts injected AudioContext, fetch, SHA-256, visibility, and object-URL adapters. Unit tests use deterministic fakes for load/play/pause/seek, visibility, lease transfer, autoplay rejection, CORS/HTTP/decode/hash failures, generation races, reconnect teardown, and clock continuity. Browser validation runs the package as native ESM in headless Chromium and fails on console warnings/errors.

Tests and scenes may import the package through the generated `.testbed/node_modules/@aerobeat/web-audio` self-link:

```bash
npm run testbed:link-self
```

Do not commit installed `node_modules`, generated testbed links, decoded buffers, downloaded audio, or object URLs.

## Validation

```bash
npm run check
npm test
npm run test:browser
```

`check` performs JavaScript type checking, strict JSDoc/no-escape validation, public import checks, named-component posture, and browser console-policy checks.

## Decisions

Repo-local lifecycle rationale is recorded in `docs/decisions/per-game-audio-lifecycle.md`. Public contributor documentation belongs in `aerobeat-web-docs` after integration acceptance.
