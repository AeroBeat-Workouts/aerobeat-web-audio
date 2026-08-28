// @ts-check

import {
  createAeroWebAudioService,
  createSongTimeline
} from "../../src/index.js";

/** @type {HTMLElement | null} */
const app = document.querySelector("#app");

if (app instanceof HTMLElement) {
  const service = createAeroWebAudioService();
  const timeline = createSongTimeline({ bpm: 120, durationSeconds: 90 });
  window.addEventListener("pagehide", () => {
    void service.destroy();
  }, { once: true });
  app.textContent = `Audio facade: ${service.getStatus().state}; beat 4 starts at ${timeline.beatToSeconds(4)}s.`;
}
