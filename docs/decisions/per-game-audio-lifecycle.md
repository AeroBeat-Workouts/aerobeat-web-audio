# Per-game Web Audio lifecycle

**Status:** Accepted for the embeddable-game prototype

## Decision

Each connected `aero-game` receives a distinct Aero Web Audio service. The service owns only its browser audio resources and authoritative playback clock. A process-wide assembly coordinator decides which game holds the media lease; audio exposes lease participation but never enumerates or arbitrates game instances.

Decoded-buffer playback uses a fresh `AudioBufferSourceNode` for each play, seek, visibility resume, or lease resume because native source nodes are one-shot. Every source connects through one service-owned Music gain bus; a second connected bus is reserved for future SFX sources. Gain buses are created once per service and survive ordinary source recreation. Clock position is frozen before source stop/context suspension and restarted from that exact offset. The decoded `AudioBuffer` remains resident through ordinary pause and visibility transitions.

## Mix and privacy boundary

`getMixSnapshot()` and strict `setMix({ musicVolume, sfxVolume })` are direct assembly-internal methods. Both finite values default to `0.5` and are bounded inclusively from zero through one. Applying a mix updates gain parameters without restarting a source or changing the authoritative clock. Contexts without gain support retain direct playback and private scalar state while capability `gainBuses` remains false.

User mix values do not enter general service status, capabilities, events, or telemetry. Assembly owns any local persistence and must call the direct methods on each fresh service generation.

## Source and integrity boundary

The service accepts URL, caller-owned or service-owned object URL, Blob, and ArrayBuffer encoded sources. URL fetch is CORS-mode and injectable. Optional SHA-256 verification occurs on encoded bytes before browser decode. Public source metadata excludes Blob and ArrayBuffer payloads.

Browser `decodeAudioData` determines codec support. Filename suffixes, including Beat Saber `.egg`, are not treated as codec declarations. Fetch/CORS, HTTP, hash, decode, and autoplay failures remain distinct status codes.

## Generation and teardown

Every load starts a new source generation and aborts the prior fetch. Fetch/hash/decode completion is gated by that source generation plus caller cancellation, so pausing, hiding, or transferring the lease does not accidentally discard the current decode. Playback resume/suspend transitions use a separate operation identity so newer user, visibility, lease, or source intent wins when browser promises settle out of order. Destroy invalidates both identities before releasing resources.

`destroy()` synchronously marks the instance terminal, aborts active work, removes visibility listeners, stops/disconnects source and gain nodes, revokes service-owned object URLs, and clears source/buffer references. It then awaits closure of a service-owned AudioContext. Injected contexts are caller-owned and are never closed.

A destroyed service is not revived. Reconnection creates a fresh service instance, preventing stale async work from crossing an `aero-game` lifecycle boundary.

## Consequences

- Gameplay and renderers consume immutable clock/status snapshots rather than native audio objects.
- Assembly can transfer a lease without reaching into audio internals.
- Visibility resume retains memory for decoded audio but avoids re-fetch/re-decode drift.
- Autoplay rejection can recur after resume and is surfaced as capability/error truth.
- A fetch/hash/decode failure remains unplayable and retains its diagnostic until a replacement load or destruction; transport controls cannot turn a failed source into a silent advancing clock.
- One-shot source nodes are stopped/disconnected exactly once on replacement or teardown, while naturally ended nodes are disconnected without an invalid second stop.
- Product content policy, persistent caches, and external provider acquisition stay outside this package.
