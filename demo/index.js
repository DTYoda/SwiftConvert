    function describe(file, expect) {
      if (!file) return { text: "No file.", ok: false };
      const typeOk = expect
        ? file.type === expect.type || (expect.ext && new RegExp("\\." + expect.ext + "$", "i").test(file.name))
        : file.type === "image/png" || /\.png$/i.test(file.name);
      return {
        text:
          "name: " + file.name + "\n" +
          "type: " + (file.type || "(empty)") + "\n" +
          "size: " + file.size + " bytes",
        ok: typeOk
      };
    }

    function show(el, file, expect) {
      const d = describe(file, expect);
      el.textContent = d.text;
      el.classList.toggle("ok", d.ok);
      el.classList.toggle("bad", !d.ok);
    }

    const fileInput = document.getElementById("fileInput");
    const inputResult = document.getElementById("inputResult");
    fileInput.addEventListener("change", () => {
      show(inputResult, fileInput.files && fileInput.files[0]);
    });

    const dropZone = document.getElementById("dropZone");
    const dropResult = document.getElementById("dropResult");
    ["dragenter", "dragover"].forEach((type) => {
      dropZone.addEventListener(type, (e) => {
        e.preventDefault();
        dropZone.classList.add("over");
      });
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("over"));
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("over");
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      show(dropResult, file);
    });

    // Combo: dropzone + hidden input — counts deliveries to catch duplicates.
    const comboZone = document.getElementById("comboZone");
    const comboInput = document.getElementById("comboInput");
    const comboResult = document.getElementById("comboResult");
    let comboDeliveries = [];
    function showCombo() {
      const lines = comboDeliveries.map((d, i) => {
        return "#" + (i + 1) + " via " + d.via + "\n" + describe(d.file).text;
      });
      const count = comboDeliveries.length;
      const last = comboDeliveries[comboDeliveries.length - 1];
      const ok = count === 1 && last && describe(last.file).ok;
      comboResult.textContent =
        "deliveries: " + count + (count === 1 ? " (ok)" : count > 1 ? " (DUPLICATE)" : "") +
        (lines.length ? "\n\n" + lines.join("\n\n") : "");
      comboResult.classList.toggle("ok", ok);
      comboResult.classList.toggle("bad", count > 1 || (count === 1 && last && !describe(last.file).ok));
    }
    ["dragenter", "dragover"].forEach((type) => {
      comboZone.addEventListener(type, (e) => {
        e.preventDefault();
        comboZone.classList.add("over");
        if (type === "dragenter") comboDeliveries = [];
      });
    });
    comboZone.addEventListener("dragleave", () => comboZone.classList.remove("over"));
    comboZone.addEventListener("drop", (e) => {
      e.preventDefault();
      comboZone.classList.remove("over");
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) comboDeliveries.push({ via: "drop", file });
      showCombo();
    });
    comboInput.addEventListener("change", () => {
      const file = comboInput.files && comboInput.files[0];
      if (file) comboDeliveries.push({ via: "change", file });
      showCombo();
    });

    const fetchInput = document.getElementById("fetchInput");
    const fetchBtn = document.getElementById("fetchBtn");
    const fetchResult = document.getElementById("fetchResult");
    fetchInput.addEventListener("change", () => {
      fetchBtn.disabled = !(fetchInput.files && fetchInput.files.length);
      if (fetchInput.files[0]) show(fetchResult, fetchInput.files[0]);
    });

    fetchBtn.addEventListener("click", async () => {
      const file = fetchInput.files && fetchInput.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append("avatar", file, file.name);

      // Mock: don't hit network — inspect what would be sent
      const sent = fd.get("avatar");
      show(fetchResult, sent);
      fetchResult.textContent += "\n(form field ready for fetch/XHR)";

      // Still exercise fetch hook with a data URL target
      try {
        await fetch("data:application/json,%7B%22ok%22%3Atrue%7D", {
          method: "POST",
          body: fd
        });
      } catch (_) {
        /* ignore */
      }
    });

    const labelInput = document.getElementById("labelInput");
    const labelResult = document.getElementById("labelResult");
    const labelBtn = document.getElementById("labelBtn");
    // Nested button inside label: prevent double-toggle; still open via label association.
    labelBtn.addEventListener("click", (e) => {
      e.preventDefault();
      labelInput.click();
    });
    labelInput.addEventListener("change", () => {
      show(labelResult, labelInput.files && labelInput.files[0]);
    });

    const compressInput = document.getElementById("compressInput");
    const compressResult = document.getElementById("compressResult");
    compressInput.addEventListener("change", () => {
      const file = compressInput.files && compressInput.files[0];
      if (!file) {
        compressResult.textContent = "No file.";
        compressResult.classList.remove("ok", "bad");
        return;
      }
      const under = file.size <= 80000;
      const typeOk = file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);
      compressResult.textContent =
        "name: " + file.name + "\n" +
        "type: " + (file.type || "(empty)") + "\n" +
        "size: " + file.size + " bytes" +
        (under ? " (≤ 80 KB ✓)" : " (still over 80 KB)");
      compressResult.classList.toggle("ok", under && typeOk);
      compressResult.classList.toggle("bad", !(under && typeOk));
    });

    const dynBtn = document.getElementById("dynBtn");
    const dynResult = document.getElementById("dynResult");
    dynBtn.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,.png";
      input.style.display = "none";
      document.body.appendChild(input);
      input.addEventListener("change", () => {
        show(dynResult, input.files && input.files[0]);
        input.remove();
      });
      input.click();
    });

    const heicInput = document.getElementById("heicInput");
    heicInput.addEventListener("change", () => {
      show(heicResult, heicInput.files && heicInput.files[0], { type: "image/jpeg", ext: "jpg" });
    });
    const pdfInput = document.getElementById("pdfInput");
    pdfInput.addEventListener("change", () => {
      show(pdfResult, pdfInput.files && pdfInput.files[0], { type: "image/png", ext: "png" });
    });
    const docxInput = document.getElementById("docxInput");
    docxInput.addEventListener("change", () => {
      show(docxResult, docxInput.files && docxInput.files[0], { type: "text/plain", ext: "txt" });
    });
