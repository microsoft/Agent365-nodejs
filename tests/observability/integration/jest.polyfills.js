// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

/**
 * Node.js 18 polyfills for integration tests.
 *
 * In Node.js 18, the Web Crypto API is exposed as `globalThis.crypto` but is
 * NOT automatically aliased to the bare `crypto` global in CommonJS module
 * context. @langchain/core (uuid/rng.ts) references `crypto` directly, so we
 * need to polyfill it here before any test modules are loaded.
 *
 * In Node.js 19+ `crypto` was promoted to a first-class global; this guard
 * ensures the polyfill is a no-op on newer runtimes.
 */
if (typeof globalThis.crypto === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { webcrypto } = require("crypto");
  globalThis.crypto = webcrypto;
}
