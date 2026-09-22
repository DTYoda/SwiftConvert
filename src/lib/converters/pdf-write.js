/**
 * Minimal PDF writer — embed JPEG image(s) as PDF pages.
 * Pure JS; safe for MAIN-world content scripts (no WASM).
 */
(function (root) {
  function pad(n, width) {
    const s = String(n);
    return "0".repeat(Math.max(0, width - s.length)) + s;
  }

  function concatBytes(arrays) {
    const total = arrays.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of arrays) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  /**
   * @param {Uint8Array} jpegBytes
   * @param {number} width
   * @param {number} height
   * @returns {Uint8Array}
   */
  function jpegImageToPdf(jpegBytes, width, height) {
    return imagesToPdf([{ bytes: jpegBytes, width, height }]);
  }

  /**
   * Multi-page PDF from JPEG page descriptors.
   * @param {{bytes: Uint8Array, width: number, height: number}[]} pages
   */
  function imagesToPdf(pages) {
    if (!pages || !pages.length) throw new Error("No pages for PDF");
    const encoder = new TextEncoder();
    const parts = [];
    const offsets = [0];

    function add(strOrBytes) {
      if (typeof strOrBytes === "string") {
        parts.push(encoder.encode(strOrBytes));
      } else {
        parts.push(strOrBytes);
      }
    }

    function markObject() {
      let len = 0;
      for (const p of parts) len += p.length;
      offsets.push(len);
    }

    const pageCount = pages.length;
    // Object layout:
    // 1 Catalog, 2 Pages, then for each page: Page, Contents, Image
    // obj ids: 3 + i*3 = Page, 4 + i*3 = Contents, 5 + i*3 = Image
    add("%PDF-1.4\n");

    markObject(); // 1
    add("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");

    const kidRefs = [];
    for (let i = 0; i < pageCount; i++) {
      kidRefs.push(`${3 + i * 3} 0 R`);
    }
    markObject(); // 2
    add(
      `2 0 obj<< /Type /Pages /Kids [${kidRefs.join(" ")}] /Count ${pageCount} >>endobj\n`
    );

    for (let i = 0; i < pageCount; i++) {
      const page = pages[i];
      const pageObj = 3 + i * 3;
      const contentObj = pageObj + 1;
      const imageObj = pageObj + 2;
      const w = page.width;
      const h = page.height;
      const jpegBytes = page.bytes;

      markObject();
      add(
        `${pageObj} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
          `/Contents ${contentObj} 0 R /Resources<< /XObject<< /Im0 ${imageObj} 0 R >> >> >>endobj\n`
      );

      const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`;
      markObject();
      add(
        `${contentObj} 0 obj<< /Length ${content.length} >>stream\n${content}endstream\nendobj\n`
      );

      markObject();
      add(
        `${imageObj} 0 obj<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
          `/Length ${jpegBytes.length} >>stream\n`
      );
      add(jpegBytes);
      add("\nendstream\nendobj\n");
    }

    const objCount = 2 + pageCount * 3;
    const xrefStart = parts.reduce((n, p) => n + p.length, 0);
    add(`xref\n0 ${objCount + 1}\n${pad(0, 10)} 65535 f \n`);
    for (let i = 1; i <= objCount; i++) {
      add(`${pad(offsets[i], 10)} 00000 n \n`);
    }
    add(
      `trailer<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
    );

    return concatBytes(parts);
  }

  /**
   * Convert an image File/Blob to a one-page PDF File (JPEG-embedded).
   */
  async function imageFileToPdf(file) {
    const Mime = root.SwiftConvertMime;
    const bitmap = await createImageBitmap(file);
    const w = bitmap.width;
    const h = bitmap.height;
    let canvas;
    let ctx;
    if (typeof OffscreenCanvas !== "undefined") {
      canvas = new OffscreenCanvas(w, h);
      ctx = canvas.getContext("2d");
    } else {
      canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      ctx = canvas.getContext("2d");
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0);
    if (bitmap.close) bitmap.close();

    const blob =
      canvas.convertToBlob
        ? await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 })
        : await new Promise((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("JPEG encode failed"))),
              "image/jpeg",
              0.92
            )
          );

    const buf = new Uint8Array(await blob.arrayBuffer());
    const pdfBytes = jpegImageToPdf(buf, w, h);
    const name = Mime
      ? Mime.renameWithExt(file.name || "image", "application/pdf")
      : String(file.name || "image").replace(/\.[^.]+$/, "") + ".pdf";
    return new File([pdfBytes], name, {
      type: "application/pdf",
      lastModified: Date.now()
    });
  }

  function imagesToPdfFile(pages, filename) {
    const Mime = root.SwiftConvertMime;
    const pdfBytes = imagesToPdf(pages);
    const name = Mime
      ? Mime.renameWithExt(filename || "document", "application/pdf")
      : String(filename || "document").replace(/\.[^.]+$/, "") + ".pdf";
    return new File([pdfBytes], name, {
      type: "application/pdf",
      lastModified: Date.now()
    });
  }

  /**
   * Build a simple text-only PDF (Helvetica).
   * @param {string} text
   * @param {string} filename
   */
  function textToPdfFile(text, filename) {
    const encoder = new TextEncoder();
    const safe = String(text || "")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
    const lines = safe.split(/\r?\n/).slice(0, 80);
    let content = "BT /F1 11 Tf 50 780 Td 14 TL\n";
    lines.forEach((line, i) => {
      const clipped = line.slice(0, 90);
      if (i === 0) content += `(${clipped}) Tj\n`;
      else content += `T* (${clipped}) Tj\n`;
    });
    content += "ET\n";

    const objs = [
      "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
      "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
      "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n",
      `4 0 obj<< /Length ${content.length} >>stream\n${content}endstream\nendobj\n`,
      "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n"
    ];

    const header = "%PDF-1.4\n";
    const off = [0];
    let size = encoder.encode(header).length;
    for (const o of objs) {
      off.push(size);
      size += encoder.encode(o).length;
    }
    const xrefStart = size;
    let xref = `xref\n0 6\n${pad(0, 10)} 65535 f \n`;
    for (let i = 1; i <= 5; i++) xref += `${pad(off[i], 10)} 00000 n \n`;
    xref += `trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

    const bin = encoder.encode(header + objs.join("") + xref);
    const name = (filename || "document").replace(/\.[^.]+$/, "") + ".pdf";
    return new File([bin], name, { type: "application/pdf", lastModified: Date.now() });
  }

  root.SwiftConvertPdfWrite = {
    jpegImageToPdf,
    imageFileToPdf,
    textToPdfFile,
    imagesToPdf,
    imagesToPdfFile
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
