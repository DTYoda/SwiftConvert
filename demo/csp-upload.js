  setInterval(() => {
    document.getElementById("hook").textContent =
      document.documentElement.getAttribute("data-swiftconvert-hooked") === "1" ? "yes" : "no";
  }, 200);
  document.getElementById("f").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    const out = document.getElementById("out");
    if (!file) return;
    out.textContent = "name: " + file.name + "\ntype: " + file.type + "\nsize: " + file.size;
    out.classList.toggle("ok", file.type === "image/png");
  });



  document.addEventListener("dragover", (event) => {
  event.preventDefault();
});

document.addEventListener("drop", (event) => {
  event.preventDefault();

  const files = Array.from(event.dataTransfer?.files || []);
  const types = Array.from(event.dataTransfer?.types || []);
  const out = document.getElementById("out");

  out.textContent = [
    `Drop received; files: ${files.length}`,
    `Data types: ${types.join(", ") || "(none)"}`,
    ...files.map((file) => `${file.name} · ${file.type} · ${file.size} bytes`)
  ].join("\n");
});