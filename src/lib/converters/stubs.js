/**
 * Stubs for future document converters (DOCX / PDF).
 * Architecture placeholder — not implemented in the first slice.
 */
(function (root) {
  const STUBS = {
    "application/pdf": {
      id: "pdf",
      label: "PDF",
      async convert() {
        throw new Error("PDF conversion is not implemented yet (planned).");
      },
      canConvert() {
        return false;
      }
    },
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      id: "docx",
      label: "DOCX",
      async convert() {
        throw new Error("DOCX conversion is not implemented yet (planned).");
      },
      canConvert() {
        return false;
      }
    }
  };

  root.SwiftConvertStubs = {
    STUBS,
    isStubTarget(mime) {
      return Boolean(STUBS[mime]);
    },
    getStub(mime) {
      return STUBS[mime] || null;
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
