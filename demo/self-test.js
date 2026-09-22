    import * as pdfjs from "/src/lib/vendor/pdf.min.mjs";
    pdfjs.GlobalWorkerOptions.workerSrc = "/src/lib/vendor/pdf.worker.min.mjs";
    globalThis.pdfjsLib = pdfjs;

    const out = document.getElementById("out");
    const lines = [];

    function ok(msg) {
      lines.push("PASS " + msg);
      out.textContent = lines.join("\n");
    }
    function fail(msg) {
      lines.push("FAIL " + msg);
      out.textContent = lines.join("\n");
      document.title = "FAIL";
      throw new Error(msg);
    }

    async function loadFile(path, name, type) {
      const res = await fetch(path);
      if (!res.ok) throw new Error("fetch " + path);
      const blob = await res.blob();
      return new File([blob], name, { type });
    }

    try {
      // 1) JPEG → PNG
      {
        const file = await loadFile("/demo/sample.jpg", "sample.jpg", "image/jpeg");
        const target = SwiftConvertMime.inferTargetMime(file, "image/png,.png", "auto");
        if (target !== "image/png") fail("infer jpg→png: " + target);
        const converted = await SwiftConvertRegistry.convertFile(file, target);
        if (converted.type !== "image/png") fail("jpg type " + converted.type);
        if (!converted.name.endsWith(".png")) fail("jpg name");
        if (converted.size < 50) fail("jpg too small");
        ok("JPEG → PNG (" + converted.size + " bytes)");
      }

      // 2) Image → PDF
      {
        const file = await loadFile("/demo/sample.jpg", "sample.jpg", "image/jpeg");
        const converted = await SwiftConvertRegistry.convertFile(file, "application/pdf");
        if (converted.type !== "application/pdf") fail("img→pdf type");
        const head = new TextDecoder().decode(await converted.slice(0, 5).arrayBuffer());
        if (head !== "%PDF-") fail("img→pdf header");
        ok("JPEG → PDF (" + converted.size + " bytes)");
      }

      // 3) DOCX → text
      {
        const file = await loadFile(
          "/demo/sample.docx",
          "sample.docx",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        const target = SwiftConvertMime.inferTargetMime(file, "text/plain,.txt", "auto");
        if (target !== "text/plain") fail("infer docx→txt: " + target);
        const converted = await SwiftConvertRegistry.convertFile(file, "text/plain");
        const text = await converted.text();
        if (!/SwiftConvert/.test(text)) fail("docx text missing content: " + text);
        ok("DOCX → text");
      }

      // 4) PDF → PNG
      {
        const file = await loadFile("/demo/sample.pdf", "sample.pdf", "application/pdf");
        const target = SwiftConvertMime.inferTargetMime(file, "image/png,.png", "auto");
        if (target !== "image/png") fail("infer pdf→png: " + target);
        const converted = await SwiftConvertRegistry.convertFile(file, "image/png");
        if (converted.type !== "image/png") fail("pdf→png type " + converted.type);
        if (converted.size < 50) fail("pdf→png too small");
        ok("PDF → PNG page1 (" + converted.size + " bytes)");
      }

      // 5) HEIC → JPEG
      {
        const file = await loadFile("/demo/sample.heic", "sample.heic", "image/heic");
        const target = SwiftConvertMime.inferTargetMime(file, "image/jpeg,.jpg", "auto");
        if (target !== "image/jpeg") fail("infer heic→jpeg: " + target);
        const converted = await SwiftConvertRegistry.convertFile(file, "image/jpeg");
        if (converted.type !== "image/jpeg") fail("heic type " + converted.type);
        if (converted.size < 50) fail("heic too small");
        ok("HEIC → JPEG (" + converted.size + " bytes)");
      }

      // 6) Size-limit inference
      {
        const bytes = SwiftConvertSizeLimit.parseSizeToBytes("80 KB");
        if (bytes !== 80 * 1024) fail("parse 80 KB → " + bytes);
        const mb = SwiftConvertSizeLimit.parseSizeToBytes("2MB");
        if (mb !== 2 * 1024 * 1024) fail("parse 2MB → " + mb);
        const fromCopy = SwiftConvertSizeLimit.scanTextForLimit("Max upload size: 80 KB");
        if (!fromCopy || fromCopy.bytes !== 80 * 1024) fail("scan copy");
        const input = document.createElement("input");
        input.type = "file";
        input.setAttribute("data-max-size", "80000");
        document.body.appendChild(input);
        const inferred = SwiftConvertSizeLimit.inferMaxBytes({ input });
        input.remove();
        if (!inferred || inferred.bytes !== 80000) fail("infer data-max-size");
        ok("Size-limit inference");
      }

      // 7) Smart picker accept expansion (must not regress v0.3.8)
      {
        const original = "image/png,.png";
        const expanded = SwiftConvertMime.buildExpandedAccept(
          original,
          "auto",
          (f, t) => SwiftConvertRegistry.canHandle(f, t)
        );
        if (!/image\/png/.test(expanded)) fail("expanded missing png");
        if (!/image\/jpeg/.test(expanded)) fail("expanded missing jpeg");
        if (!/\.heic/.test(expanded)) fail("expanded missing heic");
        if (!/\.docx/.test(expanded)) fail("expanded missing docx for png field");
        if (/\.exe|\.zip|application\/octet-stream/.test(expanded)) {
          fail("expanded must not list junk: " + expanded);
        }
        const nativeOnly = SwiftConvertMime.buildExpandedAccept("image/png,.png", "auto");
        if (!/image\/jpeg/.test(nativeOnly)) fail("expanded without registry");

        const jpg = await loadFile("/demo/sample.jpg", "sample.jpg", "image/jpeg");
        const targetFromOriginal = SwiftConvertMime.inferTargetMime(jpg, original, "auto");
        if (targetFromOriginal !== "image/png") {
          fail("original accept must target png: " + targetFromOriginal);
        }
        const targetFromExpanded = SwiftConvertMime.inferTargetMime(jpg, expanded, "auto");
        if (targetFromExpanded != null) {
          fail("expanded accept must not drive convert (got " + targetFromExpanded + ")");
        }
        ok("PNG-only expanded accept (convert uses original)");
      }

      // 8) Compress large JPEG under budget
      {
        const file = await loadFile("/demo/sample-large.jpg", "sample-large.jpg", "image/jpeg");
        if (file.size <= 80000) fail("fixture not large enough: " + file.size);
        const result = await SwiftConvertCompress.compressImageToFit(file, 80000, {
          qualityPref: "balanced"
        });
        if (!result.compressed) fail("expected compression");
        if (result.file.size > 80000) fail("still over budget: " + result.file.size);
        ok("Compress to ≤80KB (" + file.size + " → " + result.file.size + ")");
      }

      // 9) DOCX → PNG (visual HTML render)
      {
        const file = await loadFile(
          "/demo/sample.docx",
          "sample.docx",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        if (!SwiftConvertRegistry.canHandle(file, "image/png")) fail("canHandle docx→png");
        const converted = await SwiftConvertRegistry.convertFile(file, "image/png");
        if (converted.type !== "image/png") fail("docx→png type " + converted.type);
        if (converted.size < 200) fail("docx→png too small");
        ok("DOCX → PNG visual (" + converted.size + " bytes)");
      }

      // 10) HEIC → PDF (chain)
      {
        const file = await loadFile("/demo/sample.heic", "sample.heic", "image/heic");
        const path = SwiftConvertCatalog.shortestPath("image/heic", "application/pdf");
        if (!path || path.length < 3) fail("heic→pdf chain path: " + JSON.stringify(path));
        const converted = await SwiftConvertRegistry.convertFile(file, "application/pdf");
        if (converted.type !== "application/pdf") fail("heic→pdf type");
        const head = new TextDecoder().decode(await converted.slice(0, 5).arrayBuffer());
        if (head !== "%PDF-") fail("heic→pdf header");
        ok("HEIC → PDF chain (" + path.join("→") + ", " + converted.size + " bytes)");
      }

      // 11) PDF → text
      {
        const file = await loadFile("/demo/sample.pdf", "sample.pdf", "application/pdf");
        const converted = await SwiftConvertRegistry.convertFile(file, "text/plain");
        if (converted.type !== "text/plain") fail("pdf→text type");
        ok("PDF → text (" + converted.size + " bytes)");
      }

      // 12) SVG → PNG
      {
        const file = await loadFile("/demo/sample.svg", "sample.svg", "image/svg+xml");
        const converted = await SwiftConvertRegistry.convertFile(file, "image/png");
        if (converted.type !== "image/png") fail("svg→png type");
        if (converted.size < 50) fail("svg→png too small");
        ok("SVG → PNG (" + converted.size + " bytes)");
      }

      // 13) Audio → audio (WAV → MP3)
      {
        const file = await loadFile("/demo/sample.wav", "sample.wav", "audio/wav");
        if (!SwiftConvertRegistry.canHandle(file, "audio/mpeg")) fail("canHandle wav→mp3");
        const converted = await SwiftConvertRegistry.convertFile(file, "audio/mpeg");
        if (converted.type !== "audio/mpeg") fail("wav→mp3 type " + converted.type);
        if (converted.size < 100) fail("wav→mp3 too small");
        ok("Audio → audio WAV→MP3 (" + converted.size + " bytes)");
      }

      // 14) Audio → video (black frames)
      {
        const file = await loadFile("/demo/sample.wav", "sample.wav", "audio/wav");
        const converted = await SwiftConvertRegistry.convertFile(file, "video/mp4");
        if (converted.type !== "video/mp4") fail("audio→video type " + converted.type);
        if (converted.size < 200) fail("audio→video too small");
        ok("Audio → video black frames (" + converted.size + " bytes)");

        // 15) Video → audio (reuse synthesized mp4)
        const audioOut = await SwiftConvertRegistry.convertFile(converted, "audio/wav");
        if (audioOut.type !== "audio/wav") fail("video→audio type " + audioOut.type);
        if (audioOut.size < 100) fail("video→audio too small");
        ok("Video → audio (" + audioOut.size + " bytes)");
      }

      // Optional: webm fixture video→audio if present
      try {
        const webm = await loadFile("/demo/sample.webm", "sample.webm", "video/webm");
        const a = await SwiftConvertRegistry.convertFile(webm, "audio/mpeg");
        if (a.type === "audio/mpeg" && a.size > 50) {
          ok("Video fixture → MP3 (" + a.size + " bytes)");
        }
      } catch (e) {
        ok("Video fixture skipped (" + (e && e.message ? e.message : e) + ")");
      }

      lines.push("ALL PASS");
      out.textContent = lines.join("\n");
      document.title = "PASS";
    } catch (err) {
      lines.push(String(err && err.stack ? err.stack : err));
      out.textContent = lines.join("\n");
      document.title = "FAIL";
    }
