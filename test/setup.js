/**
 * Global test setup — runs before every test file.
 * Provides mocks for Chrome extension APIs and the RefinedBricklink global.
 */

// Mock chrome.storage.sync
globalThis.chrome = {
  storage: {
    sync: {
      get: vi.fn((defaults, cb) => cb({ ...defaults })),
      set: vi.fn(),
    },
  },
  runtime: {
    getManifest: vi.fn(() => ({ version: "0.1.0" })),
  },
};

// Initialize the feature registry (mirrors registry.js)
globalThis.RefinedBricklink = { features: [] };
