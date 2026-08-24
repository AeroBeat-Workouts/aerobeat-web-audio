# aerobeat-web-audio

Web Audio playback, clock, and timeline foundations for AeroBeat web.

## Responsibility

This repo owns the AeroBeat browser audio facade: Web Audio lifecycle/status, song source descriptors, playback clock snapshots, basic timeline math, and the first load/play/pause/stop/seek service boundary.

It does not own gameplay scoring, CV, renderer timing visuals, content import/conversion, UI components, product assembly wiring, or third-party audio vendor adapters. Native browser Web Audio is the built-in implementation path; future vendor/backend adapters should sit behind this facade only when a concrete dependency exists.

## Public API Surface

- `src/index.js` exports `aeroAudioServiceId` and service/status/source/timeline JSDoc shapes.
- `createAeroWebAudioService()` creates the Web Audio facade with truthful unsupported and error states.
- `createAudioSourceDescriptor()` normalizes song source descriptors for future content/assembly wiring.
- `createPlaybackClock()` provides deterministic clock snapshots for tests and future renderer/gameplay consumers.
- `createSongTimeline()`, `secondsToBeat()`, and `beatToSeconds()` provide initial beat/time conversion primitives.

## Adjacent Repos

- `aerobeat-web-content` will validate/load concrete song and chart packages.
- `aerobeat-web-gameplay` will consume timeline position without owning playback.
- `aerobeat-web-renderer` will consume clock/timeline state for visuals.
- `aerobeat-web-ui` will own controls and status displays.
- `aerobeat-web-assembly` wires concrete services together.

## Allowed Imports

Runtime code should prefer browser APIs and public `@aerobeat/web-*` exports only. Do not import gameplay, CV, renderer, content importer internals, testbed files, or vendor-native audio object graphs into this public service surface.

## Testbed Shape

Tests and scenes import this package through `.testbed/node_modules/@aerobeat/web-audio`, which is generated local state:

```bash
npm run testbed:link-self
```

Do not commit installed `node_modules` folders or generated testbed symlinks.

## Validation

Run before handoff:

```bash
npm run check
npm test
npm run test:browser
```

The current validators are placeholder-level checks for JSDoc/no-escape posture, public import boundaries, component-only scenes, console-noise expectations, and Node unit checks for service status/clock behavior.

## Documentation Handoff

Keep repo-local decisions in `docs/decisions/`. Public contributor docs belong in `aerobeat-web-docs` after the audio boundary is accepted.
