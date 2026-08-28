// @ts-check

/**
 * Documentation/configuration surface for repo-local browser scenes. The
 * deterministic `scripts/run-browser-tests.js` harness owns its static server
 * and attaches console warning/error plus page-error listeners before loading
 * the package. Future Playwright test-runner suites reuse this directory.
 *
 * @type {{ testDir: string }}
 */
export default {
  testDir: "./test"
};
