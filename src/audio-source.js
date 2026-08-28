// @ts-check

/** @typedef {"url" | "object-url" | "blob" | "array-buffer" | "generated-silence"} AudioSourceKind */
/** @typedef {"SHA-256"} AudioHashAlgorithm */

/**
 * @typedef {Object} AudioExpectedHash
 * @property {AudioHashAlgorithm} algorithm Hash algorithm.
 * @property {string} value Lowercase or uppercase hexadecimal digest.
 */

/**
 * @typedef {Object} AudioSourceDescriptorInput
 * @property {string} id Stable song/audio source ID.
 * @property {AudioSourceKind} kind Encoded-audio storage kind.
 * @property {string} label Human-readable source label.
 * @property {number | undefined} [durationSeconds] Known source duration, when available.
 * @property {string | undefined} [url] Browser-resolvable URL for URL-backed sources.
 * @property {Blob | undefined} [blob] Encoded audio blob.
 * @property {ArrayBuffer | undefined} [arrayBuffer] Encoded audio bytes.
 * @property {string | undefined} [contentType] Declared media type for diagnostics only.
 * @property {AudioExpectedHash | undefined} [expectedHash] Optional encoded-byte integrity expectation.
 * @property {boolean | undefined} [ownsObjectUrl] Whether the service must revoke an object URL after use.
 */

/**
 * Serializable metadata for the loaded audio source. Encoded bytes and Blob
 * objects deliberately remain private to the service.
 *
 * @typedef {Object} AudioSourceDescriptor
 * @property {string} id Stable song/audio source ID.
 * @property {AudioSourceKind} kind Encoded-audio storage kind.
 * @property {string} label Human-readable source label.
 * @property {number | undefined} durationSeconds Known or decoded duration.
 * @property {string | undefined} url Browser-resolvable URL for URL-backed sources.
 * @property {string | undefined} contentType Declared media type for diagnostics only.
 * @property {AudioExpectedHash | undefined} expectedHash Optional encoded-byte integrity expectation.
 * @property {boolean} ownsObjectUrl Whether the service owns object-URL revocation.
 */

/**
 * Validates and normalizes an audio source descriptor without treating a file
 * extension (including `.egg`) as a codec contract.
 *
 * @param {AudioSourceDescriptorInput} input
 * @returns {AudioSourceDescriptor}
 */
export function createAudioSourceDescriptor(input) {
  const id = requireText(input.id, "Audio source id is required");
  const label = requireText(input.label, "Audio source label is required");
  const durationSeconds = normalizeDuration(input.durationSeconds);
  const kind = input.kind;

  if (!audioSourceKinds.includes(kind)) {
    throw new TypeError(`Unsupported audio source kind: ${String(kind)}`);
  }
  if ((kind === "url" || kind === "object-url") && !input.url?.trim()) {
    throw new TypeError(`${kind} audio sources require a url`);
  }
  if (kind === "blob" && !(input.blob instanceof Blob)) {
    throw new TypeError("Blob audio sources require a Blob");
  }
  if (kind === "array-buffer" && !(input.arrayBuffer instanceof ArrayBuffer)) {
    throw new TypeError("Array-buffer audio sources require an ArrayBuffer");
  }
  if (input.ownsObjectUrl && kind !== "object-url") {
    throw new TypeError("Only object-url sources may transfer URL revocation ownership");
  }

  const expectedHash = normalizeExpectedHash(input.expectedHash);
  return Object.freeze({
    id,
    kind,
    label,
    durationSeconds,
    url: input.url?.trim() || undefined,
    contentType: input.contentType?.trim() || undefined,
    expectedHash,
    ownsObjectUrl: input.ownsObjectUrl === true
  });
}

/** @type {readonly AudioSourceKind[]} */
export const audioSourceKinds = Object.freeze(["url", "object-url", "blob", "array-buffer", "generated-silence"]);

/**
 * @param {AudioExpectedHash | undefined} value
 * @returns {AudioExpectedHash | undefined}
 */
function normalizeExpectedHash(value) {
  if (!value) {
    return undefined;
  }
  if (value.algorithm !== "SHA-256") {
    throw new TypeError("Only SHA-256 audio integrity expectations are supported");
  }
  const digest = value.value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(digest)) {
    throw new TypeError("Expected SHA-256 audio hash must be 64 hexadecimal characters");
  }
  return Object.freeze({ algorithm: value.algorithm, value: digest });
}

/**
 * @param {number | undefined} value
 * @returns {number | undefined}
 */
function normalizeDuration(value) {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError("Audio source duration must be a non-negative finite number when provided");
  }
  return value;
}

/**
 * @param {string} value
 * @param {string} errorMessage
 * @returns {string}
 */
function requireText(value, errorMessage) {
  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError(errorMessage);
  }
  return normalized;
}
