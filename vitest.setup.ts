import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest.config.mts doesn't set test.globals, so Testing Library's own
// auto-cleanup (which detects a global `afterEach`) never registers —
// every render() left mounted until now. Existing tests never noticed
// because each one only rendered once with unique text; a suite that
// renders the same component across multiple `it` blocks needs this.
afterEach(() => {
  cleanup();
});
