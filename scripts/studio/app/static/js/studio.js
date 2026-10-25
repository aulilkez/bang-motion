(() => {
  const format = document.querySelector("#format");
  const style = document.querySelector("[data-style-select]");
  const syncStyles = () => {
    if (!format || !style) return;
    const previous = style.value;
    for (const group of style.querySelectorAll("[data-format-group]")) group.disabled = group.dataset.formatGroup !== format.value;
    const active = style.querySelector(`[data-format-group="${format.value}"]`);
    if (active && ![...active.children].some((option) => option.value === previous)) style.value = active.querySelector("option")?.value || "";
  };
  format?.addEventListener("change", syncStyles); syncStyles();
  document.addEventListener("click", async (event) => {
    const revision = event.target.closest("[data-show-revision]");
    if (revision) document.querySelector("[data-revision-form]")?.classList.toggle("hidden");
    const copy = event.target.closest("[data-copy-task]");
    if (copy) { const field = document.querySelector("#agent-task"); if (field) { await navigator.clipboard.writeText(field.value); copy.textContent = "Copied"; setTimeout(() => { copy.textContent = "Copy next task"; }, 1600); } }
    const add = event.target.closest("[data-add-scene]");
    if (add) addScene();
    const del = event.target.closest("[data-delete-scene]");
    if (del) { del.closest("[data-scene-card]")?.remove(); reorder(); }
    const move = event.target.closest("[data-move-scene]");
    if (move) { const card = move.closest("[data-scene-card]"); const sibling = Number(move.dataset.moveScene) < 0 ? card.previousElementSibling : card.nextElementSibling; if (sibling) Number(move.dataset.moveScene) < 0 ? card.before(sibling) : card.after(sibling); reorder(); }
  });
  const cards = () => [...document.querySelectorAll("[data-scene-card]")];
  function sceneValue(card) {
    let value = {}; try { value = JSON.parse(card.getAttribute("data-scene") || "{}"); } catch {}
    for (const field of card.querySelectorAll("[data-scene-field]")) value[field.dataset.sceneField] = field.value;
    for (const field of card.querySelectorAll("[data-scene-lines]")) value[field.dataset.sceneLines] = field.value.split("\n").map((line) => line.trim()).filter(Boolean);
    return value;
  }
  function reflow() {
    const container = document.querySelector("[data-scene-cards]"); if (!container) return;
    const scenes = cards(); let cursor = 0;
    scenes.forEach((card, index) => { const value = sceneValue(card); value.startSeconds = Number(cursor.toFixed(2)); value.durationSeconds = Number(value.durationSeconds) || 0; cursor += value.durationSeconds; value.id ||= `scene-${index + 1}`; card.setAttribute("data-scene", JSON.stringify(value)); card.querySelector("[data-scene-number]").textContent = index + 1; card.querySelector("[data-scene-start]").textContent = value.startSeconds.toFixed(1); card.querySelector("[data-scene-duration]").textContent = value.durationSeconds.toFixed(1); card.querySelector("[data-move-scene='-1']").disabled = index === 0; card.querySelector("[data-move-scene='1']").disabled = index === scenes.length - 1; card.querySelector("[data-delete-scene]").disabled = scenes.length <= 1; });
    const add = document.querySelector("[data-add-scene]"); const duration = Number(container.dataset.duration || 0); if (add) add.disabled = scenes.length >= 100 || cursor + 5 > duration;
  }
  function syncJsonFromCards() { const form = document.querySelector("[data-storyboard-form]"); const raw = form?.querySelector("[data-content-json]"); if (!form || !raw) return; try { const value = JSON.parse(raw.value); value.scenes = cards().map(sceneValue); raw.value = JSON.stringify(value, null, 2); form.dataset.rawDirty = "false"; } catch {} }
  function reorder() { reflow(); const form = document.querySelector("[data-storyboard-form]"); if (form) form.dataset.cardsDirty = "true"; syncJsonFromCards(); }
  function addScene() { const container = document.querySelector("[data-scene-cards]"); if (!container) return; const current = cards().map(sceneValue); const occupied = current.reduce((sum, scene) => sum + Number(scene.durationSeconds || 0), 0); const left = Number(container.dataset.duration || 0) - occupied; if (left < 5 || current.length >= 100) return; const scene = { ...current.at(-1), id: `scene-${current.length + 1}`, durationSeconds: Math.min(8, left), goal: "Develop the linked narration.", visualDescription: "A new animated beat connected to the previous action.", objectMotion: "Objects travel through frame and resolve into the next beat.", cameraMotion: "Continue the movement with a gentle push.", transition: "Motion match cut.", onScreenText: [], assetsNeeded: [] }; const wrapper = document.createElement("div"); wrapper.innerHTML = `<article class="scene-card" data-scene-card data-scene="${escapeAttribute(JSON.stringify(scene))}"><div class="flex items-center justify-between border-b px-4 py-3"><div><b data-scene-number></b> · ${escapeHtml(scene.id)}<p class="text-xs text-zinc-500"><span data-scene-start></span>s · <span data-scene-duration></span>s</p></div><div><button type="button" class="btn" data-move-scene="-1">↑</button> <button type="button" class="btn" data-move-scene="1">↓</button> <button type="button" class="btn btn-danger" data-delete-scene>×</button></div></div><div class="grid gap-3 p-4 sm:grid-cols-2">${field("Visual description", "visualDescription", scene.visualDescription, true)}${field("Scene purpose", "goal", scene.goal)}${field("Object motion", "objectMotion", scene.objectMotion)}${field("Camera motion", "cameraMotion", scene.cameraMotion)}${field("Transition", "transition", scene.transition)}<label class="field">On-screen text · one per line<textarea class="control" data-scene-lines="onScreenText"></textarea></label>${field("Narration", "narration", scene.narration)}</div></article>`; container.append(wrapper.firstElementChild); reorder(); }
  function field(label, key, value, wide = false) { return `<label class="field ${wide ? "sm:col-span-2" : ""}">${label}<textarea class="control min-h-16" data-scene-field="${key}">${escapeHtml(value || "")}</textarea></label>`; }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
  function escapeAttribute(value) { return escapeHtml(value); }
  document.addEventListener("input", (event) => { const form = event.target.closest("[data-storyboard-form]"); if (form && event.target.matches("[data-content-json]")) { form.dataset.rawDirty = "true"; return; } const card = event.target.closest("[data-scene-card]"); if (!card) return; card.setAttribute("data-scene", JSON.stringify(sceneValue(card))); const cardsForm = document.querySelector("[data-storyboard-form]"); if (cardsForm) cardsForm.dataset.cardsDirty = "true"; syncJsonFromCards(); });
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-content-form]"); if (!form) return;
    const raw = form.querySelector("[data-content-json]");
    if (form.dataset.storyboardForm !== undefined && form.dataset.cardsDirty === "true" && form.dataset.rawDirty !== "true") { try { const value = JSON.parse(raw.value); value.scenes = cards().map(sceneValue); raw.value = JSON.stringify(value, null, 2); } catch { raw.focus(); event.preventDefault(); } }
  });
  document.addEventListener("htmx:configRequest", (event) => { event.detail.headers["X-Studio-Request"] = "1"; });
})();
