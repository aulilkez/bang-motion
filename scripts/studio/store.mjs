import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  writeFile,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import {
  STATUS,
  contentHash,
  validateBrief,
  validateScript,
  validateStoryboard,
  validateQualityReport,
  ValidationError,
  starterForBrief,
} from "./workflow.mjs";

const clone = (value) => structuredClone(value);
const now = () => new Date().toISOString();

export class ConflictError extends Error {
  constructor(message, current) {
    super(message);
    this.name = "ConflictError";
    this.current = current;
  }
}

export class ProjectStore {
  constructor(root) {
    this.root = path.resolve(root);
    this.projectsRoot = path.join(this.root, "projects");
  }
  async init() {
    await mkdir(this.projectsRoot, { recursive: true });
  }
  dir(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw new ValidationError("Invalid project ID.");
    return path.join(this.projectsRoot, id);
  }
  async writeJson(file, value) {
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temp, file);
  }
  async readJson(file) {
    return JSON.parse(await readFile(file, "utf8"));
  }
  async load(id) {
    const dir = this.dir(id);
    const project = await this.readJson(path.join(dir, "project.json"));
    project.dir = dir;
    project.script = project.scriptVersion
      ? await this.readJson(
          path.join(dir, "script", `${project.scriptVersion}.json`),
        )
      : null;
    project.storyboard = project.storyboardVersion
      ? await this.readJson(
          path.join(dir, "storyboard", `${project.storyboardVersion}.json`),
        )
      : null;
    const approvalData = await this.readJson(path.join(dir, "approvals.json"));
    project.approvals = approvalData.active ?? approvalData;
    project.approvalHistory = approvalData.history ?? {
      script: approvalData.script ? [approvalData.script] : [],
      storyboard: approvalData.storyboard ? [approvalData.storyboard] : [],
    };
    project.revisions = await this.readJson(path.join(dir, "revisions.json"));
    return project;
  }
  publicProject(p) {
    const { dir, ...rest } = p;
    return rest;
  }
  async persist(p) {
    const {
      dir,
      script,
      storyboard,
      approvals,
      approvalHistory,
      revisions,
      ...metadata
    } = p;
    await this.writeJson(path.join(dir, "project.json"), metadata);
    await this.writeJson(path.join(dir, "approvals.json"), {
      active: approvals,
      history: approvalHistory,
    });
    await this.writeJson(path.join(dir, "revisions.json"), revisions);
    return this.publicProject(p);
  }
  async create(input) {
    const brief = validateBrief(input);
    const id = randomUUID();
    const dir = this.dir(id);
    for (const name of ["script", "storyboard", "output", "reports"])
      await mkdir(path.join(dir, name), { recursive: true });
    const project = {
      id,
      createdAt: now(),
      updatedAt: now(),
      status: STATUS.DRAFT,
      brief,
      starter: starterForBrief(brief),
      scriptVersion: 0,
      storyboardVersion: 0,
      scriptHash: null,
      storyboardHash: null,
      resumeStatus: null,
      qualityReport: null,
      render: null,
      error: null,
      approvals: { script: null, storyboard: null },
      approvalHistory: { script: [], storyboard: [] },
      revisions: [],
    };
    await this.persist({ ...project, dir });
    return this.load(id);
  }
  async list() {
    await this.init();
    const ids = await readdir(this.projectsRoot);
    const items = [];
    for (const id of ids) {
      try {
        const p = await this.load(id);
        items.push(this.publicProject(p));
      } catch {}
    }
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async saveContent(id, kind, value, expectedVersion = undefined) {
    const p = await this.load(id);
    const key = kind === "script" ? "scriptVersion" : "storyboardVersion";
    if (!["script", "storyboard"].includes(kind))
      throw new ValidationError("Content kind must be script or storyboard.");
    if (expectedVersion !== undefined && expectedVersion !== p[key])
      throw new ConflictError(
        `This ${kind} has changed since it was opened.`,
        this.publicProject(p),
      );
    if (kind === "script") {
      if (
        ![
          STATUS.GENERATING_SCRIPT,
          STATUS.SCRIPT_REVIEW,
          STATUS.SCRIPT_CHANGES,
          STATUS.SCRIPT_APPROVED,
        ].includes(p.status)
      )
        throw new ConflictError(
          "Script cannot be edited in the current workflow state.",
          this.publicProject(p),
        );
      validateScript(value, p.brief);
      p.scriptVersion += 1;
      p.scriptHash = contentHash(value);
      p.script = clone(value);
      p.storyboardVersion = 0;
      p.storyboardHash = null;
      p.storyboard = null;
      p.approvals = { script: null, storyboard: null };
      p.qualityReport = null;
      p.render = null;
      p.status = STATUS.SCRIPT_REVIEW;
    } else {
      if (
        ![
          STATUS.GENERATING_STORYBOARD,
          STATUS.STORYBOARD_REVIEW,
          STATUS.STORYBOARD_CHANGES,
          STATUS.STORYBOARD_APPROVED,
        ].includes(p.status)
      )
        throw new ConflictError(
          "Storyboard cannot be edited before the script is approved.",
          this.publicProject(p),
        );
      if (
        !p.approvals.script ||
        p.approvals.script.version !== p.scriptVersion ||
        p.approvals.script.hash !== p.scriptHash
      )
        throw new ConflictError(
          "Current script approval is required.",
          this.publicProject(p),
        );
      validateStoryboard(value, p.brief, p.script, p.scriptVersion);
      p.storyboardVersion += 1;
      p.storyboardHash = contentHash(value);
      p.storyboard = clone(value);
      p.approvals.storyboard = null;
      p.qualityReport = null;
      p.render = null;
      p.status = STATUS.STORYBOARD_REVIEW;
    }
    await mkdir(path.join(p.dir, kind), { recursive: true });
    await this.writeJson(path.join(p.dir, kind, `${p[key]}.json`), value);
    p.updatedAt = now();
    await this.persist(p);
    return this.load(id);
  }
  async begin(id, stage) {
    const p = await this.load(id);
    const statusByStage = {
      script: STATUS.GENERATING_SCRIPT,
      storyboard: STATUS.GENERATING_STORYBOARD,
      animation: STATUS.GENERATING_ANIMATION,
    };
    if (!statusByStage[stage])
      throw new ValidationError(
        "Stage must be script, storyboard, or animation.",
      );
    if (p.status === statusByStage[stage]) return p;
    if (
      stage === "script" &&
      ![STATUS.DRAFT, STATUS.SCRIPT_CHANGES].includes(p.status)
    )
      throw new ConflictError(
        "Script generation is not available in the current state.",
        this.publicProject(p),
      );
    if (
      stage === "storyboard" &&
      (![STATUS.SCRIPT_APPROVED, STATUS.STORYBOARD_CHANGES].includes(
        p.status,
      ) ||
        !p.approvals.script ||
        p.approvals.script.version !== p.scriptVersion ||
        p.approvals.script.hash !== p.scriptHash)
    )
      throw new ConflictError(
        "Approve the current script before generating a storyboard.",
        this.publicProject(p),
      );
    if (
      stage === "animation" &&
      (p.status !== STATUS.STORYBOARD_APPROVED ||
        !p.approvals.storyboard ||
        p.approvals.storyboard.version !== p.storyboardVersion ||
        p.approvals.storyboard.hash !== p.storyboardHash)
    )
      throw new ConflictError(
        "Approve the current storyboard before generating animation.",
        this.publicProject(p),
      );
    p.status = statusByStage[stage];
    p.error = null;
    p.updatedAt = now();
    await this.persist(p);
    return this.load(id);
  }
  async decide(id, kind, decision, version, hash, note = "") {
    const p = await this.load(id);
    const isScript = kind === "script";
    const status = isScript ? STATUS.SCRIPT_REVIEW : STATUS.STORYBOARD_REVIEW;
    const currentVersion = isScript ? p.scriptVersion : p.storyboardVersion;
    const currentHash = isScript ? p.scriptHash : p.storyboardHash;
    if (
      !["script", "storyboard"].includes(kind) ||
      p.status !== status ||
      version !== currentVersion ||
      hash !== currentHash
    )
      throw new ConflictError(
        "The reviewed version is no longer current. Reload before deciding.",
        this.publicProject(p),
      );
    if (!["approve", "request_changes"].includes(decision))
      throw new ValidationError("Decision must be approve or request_changes.");
    if (decision === "request_changes") {
      if (!note.trim())
        throw new ValidationError(
          "Add a note describing the requested changes.",
        );
      p.revisions.push({
        id: randomUUID(),
        kind,
        version,
        note: note.trim(),
        createdAt: now(),
        resolvedAt: null,
      });
      p.status = isScript ? STATUS.SCRIPT_CHANGES : STATUS.STORYBOARD_CHANGES;
    } else {
      const approval = { version, hash, approvedAt: now() };
      p.approvals[kind] = approval;
      p.approvalHistory[kind].push(approval);
      p.status = isScript ? STATUS.SCRIPT_APPROVED : STATUS.STORYBOARD_APPROVED;
    }
    p.updatedAt = now();
    await this.persist(p);
    return this.load(id);
  }
  async updateStatus(id, status, data = {}) {
    const p = await this.load(id);
    if (status === STATUS.QUALITY_CHECK) {
      throw new ValidationError(
        "Submit a frame-backed quality report to enter quality_check.",
      );
    } else if (status === STATUS.RENDERING) {
      if (
        p.status !== STATUS.QUALITY_CHECK ||
        !p.qualityReport ||
        p.qualityReport.result !== "passed"
      )
        throw new ConflictError(
          "A passing quality report is required before rendering.",
          this.publicProject(p),
        );
      p.status = status;
    } else if (status === STATUS.COMPLETED) {
      if (p.status !== STATUS.RENDERING)
        throw new ConflictError(
          "Project must be rendering before completion.",
          this.publicProject(p),
        );
      const indexPath = path.join(p.dir, "output", "index.html");
      if ((await stat(indexPath)).size === 0)
        throw new ValidationError("output/index.html must not be empty.");
      if (
        p.brief.exportMp4 &&
        (await stat(path.join(p.dir, "output", "video.mp4"))).size === 0
      )
        throw new ValidationError("output/video.mp4 must not be empty.");
      p.status = status;
      p.render = {
        ...p.render,
        completedAt: now(),
        verifiedIndex: true,
        verifiedMp4: p.brief.exportMp4,
      };
    } else if (status === STATUS.FAILED) {
      p.resumeStatus = p.status;
      p.status = status;
      p.error = { message: requireNote(data.message), at: now() };
    } else
      throw new ValidationError(
        "Use quality, rendering, complete, or failed as a reported status.",
      );
    p.updatedAt = now();
    await this.persist(p);
    return this.load(id);
  }
  async saveQuality(id, report) {
    const p = await this.load(id);
    if (p.status !== STATUS.GENERATING_ANIMATION)
      throw new ConflictError(
        "Animation must be generated before quality review.",
        this.publicProject(p),
      );
    validateQualityReport(report);
    for (const frame of report.frames) {
      const target = path.resolve(p.dir, "output", frame);
      if (!target.startsWith(`${path.resolve(p.dir, "output")}${path.sep}`))
        throw new ValidationError(
          "Quality frame paths must be inside the project output folder.",
        );
      await readFile(target);
    }
    p.qualityReport = clone(report);
    p.status =
      report.result === "passed"
        ? STATUS.QUALITY_CHECK
        : STATUS.GENERATING_ANIMATION;
    await this.writeJson(path.join(p.dir, "reports", "quality.json"), report);
    p.updatedAt = now();
    await this.persist(p);
    return this.load(id);
  }
  async resume(id) {
    const p = await this.load(id);
    if (p.status !== STATUS.FAILED || !p.resumeStatus)
      throw new ConflictError(
        "Only interrupted projects can be resumed.",
        this.publicProject(p),
      );
    p.status = p.resumeStatus;
    p.resumeStatus = null;
    p.error = null;
    p.updatedAt = now();
    await this.persist(p);
    return this.load(id);
  }
  async getContent(id, kind) {
    const p = await this.load(id);
    return {
      project: this.publicProject(p),
      content: kind === "script" ? p.script : p.storyboard,
    };
  }
  async outputFile(id, relative) {
    const p = await this.load(id);
    const root = path.resolve(p.dir, "output");
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`) && file !== root)
      throw new ValidationError("Invalid output path.");
    return { path: file, project: this.publicProject(p) };
  }
}

function requireNote(value) {
  if (typeof value !== "string" || !value.trim())
    throw new ValidationError("Error message is required.");
  return value.trim().slice(0, 2000);
}
