# Per-game Web Audio lifecycle

**Status:** Accepted for the embeddable-game prototype

## Decision

Each connected `aero-game` receives a distinct Aero Web Audio service. The service owns only its browser audio resources and authoritative playback clock. A process-wide assembly coordinator decides which game holds the media lease; audio exposes lease participation but never enumerates or arbitrates game instances.

Decoded-buffer playback uses a fresh `AudioBufferSourceNode` for each play, seek, visibility resume, or lease resume because native source nodes are one-shot. Clock position is frozen before source stop/context suspension and restarted from that exact offset. The decoded `AudioBuffer` remains resident through ordinary pause and visibility transitions.

## Source and integrity boundary

The service accepts URL, caller-owned or service-owned object URL, Blob, and ArrayBuffer encoded sources. URL fetch is CORS-mode and injectable. Optional SHA-256 verification occurs on encoded bytes before browser decode. Public source metadata excludes Blob and ArrayBuffer payloads.

Browser `decodeAudioData` determines codec support. Filename suffixes, including Beat Saber `.egg`, are not treated as codec declarations. Fetch/CORS, HTTP, hash, decode, and autoplay failures remain distinct status codes.

## Generation and teardown

Every load starts a new generation and aborts the prior fetch. Decode and context-resume operations cannot always be physically cancelled, so late completion checks both generation and operation identity before mutating state. Destroy invalidates both identities before releasing resources.

`destroy()` synchronously marks the instance terminal, aborts active work, removes visibility listeners, stops/disconnects nodes, revokes service-owned object URLs, and clears source/buffer references. It then awaits closure of a service-owned AudioContext. Injected contexts are caller-owned and are never closed.

A destroyed service is not revived. Reconnection creates a fresh service instance, preventing stale async work from crossing an `aero-game` lifecycle boundary.

## Consequences

- Gameplay and renderers consume immutable clock/status snapshots rather than native audio objects.
- Assembly can transfer a lease without reaching into audio internals.
- Visibility resume retains memory for decoded audio but avoids re-fetch/re-decode drift.
- Autoplay rejection can recur after resume and is surfaced as capability/error truth.
- Product content policy, persistent caches, and external provider acquisition stay outside this package.
