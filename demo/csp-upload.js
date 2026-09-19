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
