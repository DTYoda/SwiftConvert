/**
 * PPTX / XLSX best-effort extraction via JSZip + XML text.
 * Not Office-faithful — slides/sheets become HTML/CSV/text/PDF.
 */
(function (root) {
  const Mime = root.SwiftConvertMime;
  const PdfWrite = root.SwiftConvertPdfWrite;
  const HtmlRender = root.SwiftConvertHtmlRender;

  const PPTX =
    "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  const XLSX =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  function sourceMime(file) {
    return Mime ? Mime.mimeFromFile(file) : (file && file.type) || "";
  }

  function isPptx(file) {
    const m = sourceMime(file);
    if (m === PPTX) return true;
    return String((file && file.name) || "")
      .toLowerCase()
      .endsWith(".pptx");
  }

  function isXlsx(file) {
    const m = sourceMime(file);
    if (m === XLSX) return true;
    return String((file && file.name) || "")
      .toLowerCase()
      .endsWith(".xlsx");
  }

  function decodeXmlEntities(s) {
    return String(s || "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function extractTaggedText(xml, tag) {
    const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "g");
    const out = [];
    let m;
    while ((m = re.exec(xml))) {
      const t = decodeXmlEntities(m[1]).trim();
      if (t) out.push(t);
    }
    return out;
  }

  async function loadZip(file) {
    const JSZip = root.JSZip;
    if (!JSZip) throw new Error("JSZip is not loaded");
    return JSZip.loadAsync(await file.arrayBuffer());
  }

  async function pptxToHtml(file) {
    const zip = await loadZip(file);
    const slideNames = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
      .sort((a, b) => {
        const na = Number((a.match(/slide(\d+)/i) || [])[1] || 0);
        const nb = Number((b.match(/slide(\d+)/i) || [])[1] || 0);
        return na - nb;
      })
      .slice(0, 40);

    const sections = [];
    for (const name of slideNames) {
      const xml = await zip.file(name).async("string");
      const texts = extractTaggedText(xml, "a:t");
      const n = (name.match(/slide(\d+)/i) || [])[1] || "?";
      sections.push(
        `<section><h2>Slide ${n}</h2><p>${texts
          .map((t) => t.replace(/[<>&]/g, ""))
          .join("<br>")}</p></section>`
      );
    }
    const body = sections.join("\n") || "<p>(No slide text found)</p>";
    return (
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" +
      String(file.name || "presentation").replace(/[<>&]/g, "") +
      "</title></head><body>" +
      body +
      "</body></html>"
    );
  }

  async function xlsxToCsv(file) {
    const zip = await loadZip(file);
    const shared = [];
    const sharedFile = zip.file("xl/sharedStrings.xml");
    if (sharedFile) {
      const xml = await sharedFile.async("string");
      // shared strings: <si>...<t>...</t>
      const siRe = /<si>([\s\S]*?)<\/si>/g;
      let m;
      while ((m = siRe.exec(xml))) {
        const texts = extractTaggedText(m[1], "t");
        shared.push(texts.join(""));
      }
    }

    const sheetNames = Object.keys(zip.files)
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n))
      .sort()
      .slice(0, 5);

    const rows = [];
    for (const sheet of sheetNames) {
      const xml = await zip.file(sheet).async("string");
      const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
      let rm;
      while ((rm = rowRe.exec(xml))) {
        const cells = [];
        const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
        let cm;
        while ((cm = cellRe.exec(rm[1]))) {
          const attrs = cm[1] || cm[3] || "";
          const body = cm[2] || "";
          const t = /t="([^"]*)"/.exec(attrs);
          const type = t ? t[1] : "";
          const vMatch = /<v>([^<]*)<\/v>/.exec(body);
          let val = vMatch ? decodeXmlEntities(vMatch[1]) : "";
          if (type === "s" && shared[Number(val)] != null) {
            val = shared[Number(val)];
          }
          cells.push(String(val).replace(/"/g, '""'));
        }
        if (cells.length) {
          rows.push(cells.map((c) => (/[",\n]/.test(c) ? `"${c}"` : c)).join(","));
        }
      }
    }
    return rows.join("\n") + (rows.length ? "\n" : "");
  }

  async function convert(file, targetMime) {
    const target = Mime.normalizeMime(targetMime);

    if (isPptx(file)) {
      const html = await pptxToHtml(file);
      if (target === "text/html") {
        const name = Mime.renameWithExt(file.name, "text/html");
        return new File([html], name, { type: "text/html", lastModified: Date.now() });
      }
      if (target === "text/plain") {
        const text = html
          .replace(/<[^>]+>/g, "\n")
          .replace(/\n+/g, "\n")
          .trim();
        const name = Mime.renameWithExt(file.name, "text/plain");
        return new File([text + "\n"], name, {
          type: "text/plain",
          lastModified: Date.now()
        });
      }
      if (target === "application/pdf") {
        if (HtmlRender && HtmlRender.htmlToCanvas && PdfWrite && PdfWrite.imagesToPdfFile) {
          const fragment = html.replace(/^[\s\S]*<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
          const canvas = await HtmlRender.htmlToCanvas(fragment);
          const pages = await HtmlRender.canvasToPageJpegs(canvas);
          return PdfWrite.imagesToPdfFile(pages, file.name);
        }
        if (!PdfWrite || !PdfWrite.textToPdfFile) throw new Error("PDF writer unavailable");
        const text = html.replace(/<[^>]+>/g, "\n").replace(/\n+/g, "\n").trim();
        return PdfWrite.textToPdfFile(text, file.name);
      }
    }

    if (isXlsx(file)) {
      const csv = await xlsxToCsv(file);
      if (target === "text/csv" || target === "application/csv") {
        const name = Mime.renameWithExt(file.name, "text/csv");
        return new File([csv], name, { type: "text/csv", lastModified: Date.now() });
      }
      if (target === "text/plain") {
        const name = Mime.renameWithExt(file.name, "text/plain");
        return new File([csv], name, { type: "text/plain", lastModified: Date.now() });
      }
      if (target === "text/html") {
        const lines = csv.trim().split(/\r?\n/).slice(0, 200);
        const table =
          "<table>" +
          lines
            .map((line, i) => {
              const cells = line.split(",").map((c) => c.replace(/^"|"$/g, ""));
              const tag = i === 0 ? "th" : "td";
              return (
                "<tr>" +
                cells.map((c) => `<${tag}>${c.replace(/[<>&]/g, "")}</${tag}>`).join("") +
                "</tr>"
              );
            })
            .join("") +
          "</table>";
        const html =
          "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body>" +
          table +
          "</body></html>";
        const name = Mime.renameWithExt(file.name, "text/html");
        return new File([html], name, { type: "text/html", lastModified: Date.now() });
      }
      if (target === "application/pdf") {
        if (!PdfWrite || !PdfWrite.textToPdfFile) throw new Error("PDF writer unavailable");
        return PdfWrite.textToPdfFile(csv, file.name);
      }
    }

    throw new Error("Unsupported office conversion");
  }

  function canConvert(file, targetMime) {
    const t = Mime.normalizeMime(targetMime);
    if (isPptx(file)) {
      return t === "text/html" || t === "text/plain" || t === "application/pdf";
    }
    if (isXlsx(file)) {
      return (
        t === "text/csv" ||
        t === "application/csv" ||
        t === "text/plain" ||
        t === "text/html" ||
        t === "application/pdf"
      );
    }
    return false;
  }

  root.SwiftConvertOffice = { convert, canConvert, isPptx, isXlsx };
})(typeof globalThis !== "undefined" ? globalThis : self);
