import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// With `test.globals: false` in vite.config.ts, RTL's own auto-cleanup
// (which relies on a global `afterEach`) never registers itself — without
// this, each render() in a test file leaves its DOM in place for the next.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement these, but Radix UI's Select/Popover primitives
// call them during open/scroll — without stubs, interacting with those
// components in tests throws "not a function".
if (!window.HTMLElement.prototype.hasPointerCapture) {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!window.HTMLElement.prototype.setPointerCapture) {
  window.HTMLElement.prototype.setPointerCapture = () => {};
}
if (!window.HTMLElement.prototype.releasePointerCapture) {
  window.HTMLElement.prototype.releasePointerCapture = () => {};
}
if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}
