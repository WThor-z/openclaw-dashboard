import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, vi } from "vitest";

// Mock matchMedia for theme toggle tests
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
});

// Cleanup after each test
afterEach(() => {
  cleanup();
});
