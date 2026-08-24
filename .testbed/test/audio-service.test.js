// @ts-check

import assert from "node:assert/strict";
import test from "node:test";

import {
  aeroAudioServiceId,
  beatToSeconds,
  createAeroWebAudioService,
  createPlaybackClock,
  createSongTimeline,
  secondsToBeat
} from "@aerobeat/web-audio";

test("audio facade reports unsupported without a browser AudioContext", () => {
  const service = createAeroWebAudioService();

  assert.equal(service.serviceId, aeroAudioServiceId);
  assert.equal(service.getStatus().state, "unsupported");
  assert.equal(service.getStatus().supported, false);
});

test("audio facade loads, plays, pauses, seeks, and stops with an injected context", async () => {
  const audioContext = createFakeAudioContext();
  const service = createAeroWebAudioService({ audioContext });

  await service.load({
    id: "fixture-song",
    kind: "generated-silence",
    label: "Fixture Song",
    durationSeconds: 120,
    url: undefined,
    arrayBuffer: undefined,
    mediaElement: undefined
  });
  assert.equal(service.getStatus().state, "ready");
  assert.equal(service.getStatus().sourceId, "fixture-song");

  await service.play();
  audioContext.advance(3.5);
  assert.equal(service.getClockSnapshot().positionSeconds, 3.5);
  assert.equal(service.getStatus().state, "playing");

  await service.pause();
  audioContext.advance(10);
  assert.equal(service.getClockSnapshot().positionSeconds, 3.5);
  assert.equal(service.getStatus().state, "paused");

  await service.seek(200);
  assert.equal(service.getStatus().positionSeconds, 120);

  await service.stop();
  assert.equal(service.getStatus().positionSeconds, 0);
  assert.equal(service.getStatus().state, "stopped");
});

test("timeline helpers convert beats and seconds", () => {
  const timeline = createSongTimeline({ bpm: 120, offsetSeconds: 1, durationSeconds: 60 });

  assert.equal(timeline.secondsToBeat(2), 2);
  assert.equal(timeline.beatToSeconds(4), 3);
  assert.equal(secondsToBeat(5, 60), 5);
  assert.equal(beatToSeconds(8, 120), 4);
});

test("playback clock snapshots progress deterministically", () => {
  const clock = createPlaybackClock({ durationSeconds: 10 });

  clock.seek(2, 0);
  clock.start(4);
  assert.deepEqual(clock.snapshot(7), {
    contextTimeSeconds: 7,
    positionSeconds: 5,
    durationSeconds: 10,
    progress: 0.5,
    playing: true
  });
});

/**
 * @returns {import("@aerobeat/web-audio").AudioContextAdapter & { advance: (seconds: number) => void }}
 */
function createFakeAudioContext() {
  let currentTime = 0;
  let state = "suspended";
  return {
    get currentTime() {
      return currentTime;
    },
    get state() {
      return state;
    },
    async resume() {
      state = "running";
    },
    async suspend() {
      state = "suspended";
    },
    async close() {
      state = "closed";
    },
    advance(seconds) {
      currentTime += seconds;
    }
  };
}
