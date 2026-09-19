/**
 * Stubs removed — real HEIC / PDF / DOCX converters live in sibling modules.
 * Kept as a no-op so older inject lists do not break if referenced.
 */
(function (root) {
  root.SwiftConvertStubs = {
    STUBS: {},
    isStubTarget() {
      return false;
    },
    getStub() {
      return null;
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
