const app = document.querySelector("#app");
const projectId = document.documentElement.dataset.projectId;
const reviewKind = document.documentElement.dataset.reviewKind;
const enc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const escJson = (value) => JSON.stringify(value, null, 2);
const request = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body
        ? { "content-type": "application/json", "x-studio-request": "1" }
        : {}),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || `Request failed (${response.status})`);
  return data;
};
const toast = (message, bad = false) => {
  const el = document.createElement("div");
  el.className = `toast${bad ? " bad" : ""}`;
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 3600);
};
const statusClass = (s) =>
  s?.includes("approved") ? "approved" : s?.includes("review") ? "review" : "";

async function home() {
  const projects = await request("/api/projects");
  app.innerHTML = `<div class="hero"><div><div class="eyebrow">Local creative workflow</div><h1>Make motion,<br>with room to review.</h1><p>Move from a clear brief to an approved script and storyboard before animation begins.</p></div></div>
  <div class="layout"><form class="card" id="brief-form"><div class="eyebrow">01 / Project setup</div><h2 style="margin-top:8px">Start with a brief</h2>
    <div class="field-grid">
      <div class="field"><label for="title">Video title</label><input id="title" required placeholder="Why is the sky blue?"></div>
      <div class="field"><label for="topic">Topic</label><input id="topic" required placeholder="Light scattering in the atmosphere"></div>
      <div class="field full"><label for="prompt">Your prompt</label><textarea id="prompt" required placeholder="Describe the video you want to make…"></textarea></div>
      <div class="field full"><label for="purpose">Purpose / target audience</label><input id="purpose" required placeholder="Explain the science to curious teens"></div>
      <div class="field"><label for="duration">Duration (seconds)</label><input id="duration" type="number" min="5" max="600" value="120" required></div>
      <div class="field"><label for="language">Language</label><input id="language" value="Indonesian" required></div>
      <div class="field"><label for="format">Project format</label><select id="format"><option value="explainer">Explainer</option><option value="opener">Opener / promo</option></select></div>
      <div class="field"><label for="style">Animation style</label><select id="style"></select></div>
      <div class="field"><label for="ratio">Aspect ratio</label><select id="ratio"><option>16:9</option><option>9:16</option></select></div>
      <div class="field"><label for="voice">Voice-over</label><select id="voice"><option value="script-only">Write narration</option><option value="audio-provided">I have audio</option><option value="none">No voice-over</option></select></div>
      <div class="field"><label for="subtitles">Subtitles</label><select id="subtitles"><option value="requested">Include subtitles</option><option value="none">No subtitles</option></select></div>
      <div class="field"><label for="music">Music</label><select id="music"><option value="none">No music</option><option value="music-only">Music only</option><option value="under-voiceover">Under voice-over</option></select></div>
      <div class="field"><label for="mp4">MP4 export</label><select id="mp4"><option value="yes">Requested</option><option value="no">Not needed</option></select></div>
    </div><div id="form-error"></div><button class="button primary" type="submit">Create project <span>↗</span></button>
  </form><aside class="card"><div class="eyebrow">How the workflow moves</div><h2 style="margin-top:8px">Review at each step</h2><div class="steps"><div class="step"><span class="step-num">1</span><div><strong>Script review</strong><p>The agent prepares structured narration. Edit, request changes, or approve it.</p></div></div><div class="step"><span class="step-num">2</span><div><strong>Storyboard review</strong><p>Check timing, movement, transitions, starter choice, and scene links.</p></div></div><div class="step"><span class="step-num">3</span><div><strong>Animation & export</strong><p>Generate only after approval, then capture frames, inspect, and render.</p></div></div></div><div class="notice">This Studio runs on this computer and stores project state locally. It does not call an AI provider.</div></aside></div>
  <section class="card" style="margin-top:20px"><div class="toolbar"><div><div class="eyebrow">Saved locally</div><h2 style="margin:7px 0 0">Your projects</h2></div><span class="muted">${projects.length} project${projects.length === 1 ? "" : "s"}</span></div><div class="project-list">${projects.length ? projects.map((p) => `<a class="project-item" href="/projects/${p.id}/review/${p.scriptVersion ? "script" : "script"}"><span><strong>${enc(p.brief.title)}</strong><small>${enc(p.id)} · ${enc(p.updatedAt.slice(0, 16).replace("T", " "))}</small></span><span class="status ${statusClass(p.status)}">${enc(p.status.replaceAll("_", " "))}</span></a>`).join("") : '<div class="empty">Your created projects will appear here.</div>'}</div></section>`;
  const format = document.querySelector("#format"),
    style = document.querySelector("#style");
  const styles = {
    explainer: [
      ["cartoon-collage", "Cartoon collage"],
      ["visual-journalism", "Visual journalism"],
      ["white-catalog", "White catalog"],
      ["vintage-sketch", "Vintage sketch"],
      ["continuous-action", "Continuous action"],
      ["cartoon-stage", "Cartoon stage"],
    ],
    opener: [
      ["cinematic-dark", "Cinematic dark"],
      ["poster-color-block", "Poster color-block"],
      ["editorial-light", "Editorial light"],
      ["paper-print", "Paper and print"],
      ["retro-analog", "Retro / analog"],
      ["brutalist-mono", "Brutalist mono"],
      ["pastel-playful", "Pastel playful"],
      ["luxury-dark", "Luxury dark"],
      ["flat-pop-photos", "Flat pop with photos"],
      ["grainy-gradient", "Grainy gradient"],
    ],
  };
  const fillStyles = () =>
    (style.innerHTML = styles[format.value]
      .map(([v, l]) => `<option value="${v}">${l}</option>`)
      .join(""));
  format.onchange = fillStyles;
  fillStyles();
  document.querySelector("#brief-form").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    document.querySelector("#form-error").innerHTML = "";
    try {
      const brief = {
        title: val("title"),
        topic: val("topic"),
        originalPrompt: val("prompt"),
        purpose: val("purpose"),
        durationSeconds: Number(val("duration")),
        language: val("language"),
        format: val("format"),
        style: val("style"),
        aspectRatio: val("ratio"),
        voiceover: val("voice"),
        subtitles: val("subtitles"),
        music: val("music"),
        exportMp4: val("mp4") === "yes",
      };
      const p = await request("/api/projects", {
        method: "POST",
        body: JSON.stringify(brief),
      });
      location.href = `/projects/${p.id}/review/script`;
    } catch (err) {
      document.querySelector("#form-error").innerHTML =
        `<div class="error">${enc(err.message)}</div>`;
      button.disabled = false;
    }
  };
}
function val(id) {
  return document.querySelector(`#${id}`).value;
}
function agentTask(project, kind) {
  const task =
    kind === "script"
      ? "script"
      : kind === "storyboard"
        ? "storyboard"
        : "animation";
  const opening =
    kind === "script"
      ? `node scripts/studio/cli.mjs begin ${project.id} script`
      : kind === "storyboard"
        ? `node scripts/studio/cli.mjs begin ${project.id} storyboard`
        : `node scripts/studio/cli.mjs begin ${project.id} animation`;
  const instructions =
    kind === "script"
      ? `Read any script revision notes from project.json. Create a structured script JSON with title, language, durationSeconds, and sections containing id, title, startSeconds, endSeconds, narration, sceneGoal, visualDescription. Keep sections within the requested duration.`
      : kind === "storyboard"
        ? `Read the immutable approved script snapshot and its version. Create storyboard JSON with title, scriptVersion, and scenes containing id, startSeconds, durationSeconds, goal, visualDescription, objects, objectMotion, cameraMotion, transition, onScreenText, narration, scriptSectionIds, assetsNeeded, starter. Use the project's chosen starter. Keep every scene within the video duration and avoid slideshow-like scenes.`
        : `Use the approved storyboard and chosen Bang Motion starter to build the animation. Put the playable deliverable at scripts/studio/data/projects/${project.id}/output/index.html with assets alongside it. Include the required window.OPENER timeline interface. Start the local Studio server if needed and use its preview route. Capture representative frames with scripts/render/snap.mjs; inspect the actual images, fix issues, and repeat. If MP4 was requested, use scripts/render/export-frames.mjs with URL=http://127.0.0.1:${location.port}/projects/${project.id}/preview/index.html and OUT=.../output/frames, then combine the captured sequence using the documented ffmpeg command. Never report a render as complete until files exist and have been checked. Submit a quality JSON to cli.mjs only after frame paths exist; status must be passed with concrete checks.`;
  const deliver =
    kind === "animation"
      ? `Write reports/quality.json with result, frames (paths relative to output), and checks. Submit it with node scripts/studio/cli.mjs quality ${project.id} scripts/studio/data/projects/${project.id}/reports/quality.json. Then mark rendering, and only mark completed after verified output/index.html${project.brief.exportMp4 ? " and output/video.mp4" : ""} exist.`
      : `Save the result to /tmp/${project.id}-${task}.json, then run: node scripts/studio/cli.mjs submit ${project.id} ${task} /tmp/${project.id}-${task}.json. Stop and give the user this review URL: http://127.0.0.1:${location.port}/projects/${project.id}/review/${task}. Do not continue before approval.`;
  return `Bang Motion Studio task\nProject ID: ${project.id}\nCurrent status: ${project.status}\n\nRead scripts/studio/README.md and inspect the project JSON at scripts/studio/data/projects/${project.id}/project.json. Read the relevant approved snapshots and persisted revision notes before acting. Use existing Bang Motion tooling and starter files; do not introduce a model API dependency.\n\nFirst, run: ${opening}\n\n${instructions}\n\n${deliver}`;
}
async function review() {
  let p = await request(`/api/projects/${projectId}`);
  const kind = reviewKind;
  if (kind === "preview") return renderPreview(p);
  if (!["script", "storyboard"].includes(kind))
    throw new Error("Unknown review type.");
  let { content } = await request(`/api/projects/${projectId}/${kind}`);
  const version = kind === "script" ? p.scriptVersion : p.storyboardVersion;
  const hash = kind === "script" ? p.scriptHash : p.storyboardHash;
  const lastApproval = p.approvalHistory?.[kind]?.at(-1);
  const hasApproval =
    p.approvals?.[kind]?.version === version &&
    p.approvals?.[kind]?.hash === hash;
  const changedAfterApproval = Boolean(lastApproval && !hasApproval);
  const handoffKind =
    p.status === "script_approved"
      ? "storyboard"
      : p.status === "storyboard_approved"
        ? "animation"
        : kind;
  const awaiting =
    kind === "script"
      ? p.status === "script_review"
      : p.status === "storyboard_review";
  app.innerHTML = `<div class="meta-row"><div><div class="eyebrow">Project review / ${kind}</div><h1 class="section-title">${enc(p.brief.title)}</h1><span class="muted">${enc(p.id)} · ${kind === "script" ? "Script" : "Storyboard"} version ${version || "not submitted"}</span></div><span class="status ${statusClass(p.status)}">${enc(p.status.replaceAll("_", " "))}</span></div><div class="layout"><section class="card"><div class="toolbar"><div><div class="eyebrow">${kind === "script" ? "Narration & scene intent" : "Scene plan & motion"}</div><h2 style="margin-top:7px">Review the ${kind}</h2></div><span class="status ${hasApproval ? "approved" : awaiting ? "review" : ""}">${hasApproval ? "Approved version" : awaiting ? "Awaiting your decision" : "Workflow status"}</span></div>
  ${changedAfterApproval ? `<div class="notice">This content changed after version ${lastApproval.version} was approved. Approval must be given again for version ${version}.</div>` : ""}
  ${kind === "script" ? `<p class="muted">Edit the structured JSON, then save. Saving creates a new version and clears any earlier approval.</p>` : `<div id="scene-toolbar" class="toolbar"><span class="muted">Reorder scenes recalculates scene start times while preserving durations.</span><button class="button secondary" id="add-scene">Add scene</button></div><div id="scene-cards" class="scene-list"></div><details><summary class="muted">Edit full storyboard JSON</summary><p class="muted">Advanced editor. Keep the required fields and script links valid.</p></details>`}
  <textarea id="content-editor" class="editor" spellcheck="false" aria-label="${kind} JSON editor">${enc(content ? escJson(content) : "")}</textarea>
  <div id="review-error"></div><div class="actions"><button class="button secondary" id="save">Save edits</button><button class="button primary" id="approve" ${awaiting && content ? "" : "disabled"}>Approve ${kind}</button><button class="button danger" id="request-changes" ${awaiting && content ? "" : "disabled"}>Request changes</button></div>
  <div id="revision-panel" hidden class="field" style="margin-top:14px"><label for="revision-note">What should change?</label><textarea id="revision-note" placeholder="Leave clear, actionable notes for the AI agent"></textarea><button class="button danger" id="send-revision">Send revision request</button></div></section>
  <aside class="card"><div class="eyebrow">Project status</div><h2 style="margin-top:8px">${enc(p.status.replaceAll("_", " "))}</h2><p class="muted">The agent can continue only after this exact version is approved.</p>
  <div class="notice">Review URL is local to this computer: <br><code>http://127.0.0.1:${enc(location.port)}/projects/${p.id}/review/${kind}</code></div>
  <h3 style="margin-top:24px">Agent handoff</h3><p class="muted">Copy this task into Codex or Claude Code. No model API key is used by the Studio.</p><textarea id="agent-task" class="editor" style="min-height:250px" readonly>${enc(agentTask(p, handoffKind))}</textarea><button class="button secondary" id="copy-task">Copy ${p.status === "script_approved" ? "storyboard task" : p.status === "storyboard_approved" ? "animation task" : "agent task"}</button>
  ${
    p.revisions?.length
      ? `<h3 style="margin-top:24px">Revision notes</h3>${p.revisions
          .filter((r) => r.kind === kind)
          .map(
            (r) =>
              `<div class="notice"><b>Version ${r.version}</b><br>${enc(r.note)}</div>`,
          )
          .join("")}`
      : ""
  }
  ${p.approvalHistory?.[kind]?.length ? `<h3 style="margin-top:24px">Approval history</h3>${p.approvalHistory[kind].map((approval) => `<div class="notice">Version ${approval.version} · ${enc(approval.approvedAt)}</div>`).join("")}` : ""}</aside></div>`;
  const editor = document.querySelector("#content-editor");
  if (kind === "storyboard" && content) renderSceneCards(content, editor, p);
  document.querySelector("#copy-task").onclick = async () => {
    await navigator.clipboard.writeText(
      document.querySelector("#agent-task").value,
    );
    toast("Agent task copied.");
  };
  document.querySelector("#save").onclick = async () => {
    try {
      const updated = JSON.parse(editor.value);
      const result = await request(`/api/projects/${p.id}/${kind}`, {
        method: "PUT",
        body: JSON.stringify({ content: updated, expectedVersion: version }),
      });
      toast("Saved as a new version.");
      location.reload();
    } catch (err) {
      toast(err.message, true);
    }
  };
  document.querySelector("#approve").onclick = async () => {
    try {
      await request(`/api/projects/${p.id}/${kind}?decision=1`, {
        method: "POST",
        body: JSON.stringify({ decision: "approve", version, hash }),
      });
      toast("Approval saved.");
      location.reload();
    } catch (err) {
      toast(err.message, true);
    }
  };
  document.querySelector("#request-changes").onclick = () => {
    document.querySelector("#revision-panel").hidden = false;
    document.querySelector("#revision-note").focus();
  };
  document.querySelector("#send-revision").onclick = async () => {
    try {
      await request(`/api/projects/${p.id}/${kind}?decision=1`, {
        method: "POST",
        body: JSON.stringify({
          decision: "request_changes",
          version,
          hash,
          note: val("revision-note"),
        }),
      });
      toast("Revision request saved for the agent.");
      location.reload();
    } catch (err) {
      toast(err.message, true);
    }
  };
}
function renderSceneCards(story, editor, project) {
  const host = document.querySelector("#scene-cards");
  const draw = () => {
    const total = story.scenes.reduce(
      (n, s) => n + Number(s.durationSeconds),
      0,
    );
    host.innerHTML = story.scenes
      .map(
        (s, i) =>
          `<article class="scene-card"><div class="scene-head"><strong>${i + 1}. ${enc(s.id)} · ${Number(s.startSeconds).toFixed(1)}s + ${Number(s.durationSeconds).toFixed(1)}s</strong><div class="actions" style="margin:0"><button class="button secondary" data-move="-1" data-index="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move scene up">↑</button><button class="button secondary" data-move="1" data-index="${i}" ${i === story.scenes.length - 1 ? "disabled" : ""} aria-label="Move scene down">↓</button><button class="button danger" data-delete="${i}" ${story.scenes.length <= 1 ? "disabled" : ""} aria-label="Delete scene">Delete</button></div></div><div class="scene-fields"><div class="field"><label>Visual description</label><textarea data-scene="${i}" data-key="visualDescription">${enc(s.visualDescription)}</textarea></div><div class="field"><label>Object & camera movement</label><textarea data-scene="${i}" data-key="objectMotion">${enc(s.objectMotion)}\nCamera: ${enc(s.cameraMotion)}</textarea></div><div class="field"><label>Scene purpose</label><textarea data-scene="${i}" data-key="goal">${enc(s.goal)}</textarea></div><div class="field"><label>On-screen text</label><textarea data-scene="${i}" data-key="onScreenText">${enc((s.onScreenText || []).join("\n"))}</textarea></div><div class="field full"><label>Narration</label><textarea data-scene="${i}" data-key="narration">${enc(s.narration)}</textarea></div></div></article>`,
      )
      .join("");
    document.querySelector("#add-scene").disabled =
      story.scenes.length >= 100 || total + 5 > project.brief.durationSeconds;
    editor.value = escJson(story);
  };
  const reflow = () => {
    let cursor = 0;
    for (const scene of story.scenes) {
      scene.startSeconds = Number(cursor.toFixed(2));
      cursor += Number(scene.durationSeconds);
    }
  };
  draw();
  host.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.dataset.scene) return;
    const obj = story.scenes[Number(t.dataset.scene)];
    if (t.dataset.key === "onScreenText")
      obj.onScreenText = t.value.split("\n").filter(Boolean);
    else if (t.dataset.key === "objectMotion") {
      const [motion, ...cam] = t.value.split("\nCamera: ");
      obj.objectMotion = motion;
      obj.cameraMotion = cam.join("\nCamera: ");
    } else obj[t.dataset.key] = t.value;
    editor.value = escJson(story);
  });
  host.addEventListener("click", (e) => {
    const move = e.target.closest("[data-move]");
    const del = e.target.closest("[data-delete]");
    if (move) {
      const i = Number(move.dataset.index),
        j = i + Number(move.dataset.move);
      [story.scenes[i], story.scenes[j]] = [story.scenes[j], story.scenes[i]];
      reflow();
      draw();
    } else if (del) {
      story.scenes.splice(Number(del.dataset.delete), 1);
      reflow();
      draw();
    }
  });
  document.querySelector("#add-scene").onclick = () => {
    const last = story.scenes.at(-1);
    const left =
      project.brief.durationSeconds -
      story.scenes.reduce((n, s) => n + Number(s.durationSeconds), 0);
    if (left < 5) return;
    story.scenes.push({
      ...structuredClone(last),
      id: `scene-${story.scenes.length + 1}`,
      durationSeconds: Math.min(8, left),
      goal: "Develop the linked narration.",
      visualDescription:
        "A new animated beat connected to the previous action.",
      objectMotion:
        "Objects travel through frame and resolve into the next beat.",
      cameraMotion: "Continue the movement with a gentle push.",
      transition: "Motion match cut.",
      onScreenText: [],
      assetsNeeded: [],
    });
    reflow();
    draw();
  };
}
async function renderPreview(p) {
  app.innerHTML = `<div class="meta-row"><div><div class="eyebrow">Animation preview</div><h1 class="section-title">${enc(p.brief.title)}</h1><span class="muted">${enc(p.status.replaceAll("_", " "))} · preview from the saved output folder</span></div><a class="button secondary" href="/studio/index.html">All projects</a></div><div class="card"><div class="notice">Preview loads <code>output/index.html</code> from this project's workspace. It appears after the agent creates the animation source.</div><iframe class="output-preview" src="/projects/${p.id}/preview/index.html" title="Animation preview"></iframe><div class="actions"><a class="button secondary" href="/projects/${p.id}/review/storyboard">Storyboard</a><a class="button secondary" href="/projects/${p.id}/review/script">Script</a></div></div>`;
}
try {
  if (projectId) await review();
  else await home();
} catch (err) {
  app.innerHTML = `<div class="error">${enc(err.message)} <a href="/studio/index.html">Return to Studio</a></div>`;
}
