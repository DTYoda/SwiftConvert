/**
 * Convert / Compress tool tab switching for popup and converter panel.
 * Hash sync (#convert / #compress) is used when the page supports it.
 */
(function () {
  const tabs = document.querySelectorAll("[data-tool-tab]");
  const convert = document.getElementById("manualConverter");
  const compress = document.getElementById("manualCompressor");
  if (!tabs.length || !convert || !compress) return;

  function show(which) {
    const isCompress = which === "compress";
    convert.hidden = isCompress;
    compress.hidden = !isCompress;
    tabs.forEach((t) => {
      const on = t.getAttribute("data-tool-tab") === which;
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    try {
      if (isCompress) history.replaceState(null, "", "#compress");
      else history.replaceState(null, "", "#convert");
    } catch (_) {
      /* popup / restricted history */
    }
  }

  tabs.forEach((t) =>
    t.addEventListener("click", () => show(t.getAttribute("data-tool-tab")))
  );

  const initial =
    typeof location !== "undefined" && location.hash === "#compress"
      ? "compress"
      : "convert";
  show(initial);
})();
