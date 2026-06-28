var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ObsidianGitSyncerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var REMOTE_CONTENT_ROOT = "content";
var VAULT_ROOT_PATH = "/";
var DEFAULT_SETTINGS = {
  repositoryUrl: "",
  githubUsername: "",
  githubToken: "",
  branch: "main",
  localRootPath: "content"
};
var DEFAULT_DATA = {
  files: {},
  connection: {
    status: "unknown",
    message: "\u5C1A\u672A\u6D4B\u8BD5\u8FDE\u63A5\u3002"
  }
};
var GitHubRequestError = class extends Error {
  constructor(status, message, method, path) {
    super(message);
    this.status = status;
    this.method = method;
    this.path = path;
  }
};
function escapeYaml(input) {
  return input.replace(/"/g, '\\"');
}
function parseFrontmatter(content) {
  if (!content.startsWith("---\n")) {
    return { data: {}, body: content };
  }
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) {
    return { data: {}, body: content };
  }
  const raw = content.slice(4, end).split("\n");
  const data = {};
  for (const line of raw) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^"|"$/g, "");
    if (key) {
      data[key] = value;
    }
  }
  return { data, body: content.slice(end + 5) };
}
function buildFrontmatter(file, title) {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const resolvedTitle = title?.trim() || file.basename;
  const slug = resolvedTitle.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]+/gu, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return [
    "---",
    `title: ${escapeYaml(resolvedTitle)}`,
    `slug: ${slug || file.basename}`,
    `date: ${today}`,
    "category: \u5F00\u53D1",
    "tags:",
    "  - Java",
    "  - NextJS",
    "description: \u6587\u7AE0\u6458\u8981",
    "cover:",
    "published: true",
    "---",
    ""
  ].join("\n");
}
function padDateNumber(value) {
  return String(value).padStart(2, "0");
}
function formatDateTime(input) {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) {
    return typeof input === "string" ? input : "";
  }
  return [
    `${date.getFullYear()}-${padDateNumber(date.getMonth() + 1)}-${padDateNumber(date.getDate())}`,
    `${padDateNumber(date.getHours())}:${padDateNumber(date.getMinutes())}:${padDateNumber(date.getSeconds())}`
  ].join(" ");
}
function hashContent(input) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = hash * 31 + input.charCodeAt(index) | 0;
  }
  return `h${Math.abs(hash)}`;
}
function encodeBase64(input) {
  const bytes = new TextEncoder().encode(input);
  return encodeBytesBase64(bytes);
}
function encodeBytesBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}
function textBytes(input) {
  return new TextEncoder().encode(input);
}
function decodeBase64Bytes(input) {
  const binary = atob(input.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
function hashBytes(input) {
  const bytes = new Uint8Array(input);
  let hash = 0;
  for (const byte of bytes) {
    hash = hash * 31 + byte | 0;
  }
  return `h${Math.abs(hash)}`;
}
function toHex(bytes) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function gitBlobSha(input) {
  const bytes = new Uint8Array(input);
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const payload = new Uint8Array(header.byteLength + bytes.byteLength);
  payload.set(header, 0);
  payload.set(bytes, header.byteLength);
  const digest = await crypto.subtle.digest("SHA-1", payload);
  return toHex(new Uint8Array(digest));
}
function isSyncableFile(file) {
  const name = file.name.toLowerCase();
  if (isHiddenPath(file.path) || name.startsWith(".") || name === ".ds_store" || name === "thumbs.db") {
    return false;
  }
  return true;
}
function isHiddenPath(path) {
  const normalized = (0, import_obsidian.normalizePath)(path).replace(/^\/+/, "");
  if (!normalized) {
    return false;
  }
  return normalized.split("/").some((segment) => segment.startsWith("."));
}
function normalizeLocalRootPath(path) {
  const normalized = (0, import_obsidian.normalizePath)(path.trim());
  if (!normalized || normalized === VAULT_ROOT_PATH || normalized === ".") {
    return VAULT_ROOT_PATH;
  }
  return normalized.replace(/^\/+/, "").replace(/\/+$/, "") || VAULT_ROOT_PATH;
}
function displayLocalRootPath(path) {
  return normalizeLocalRootPath(path);
}
function isImagePath(path) {
  return /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(path);
}
function parseRepositoryUrl(input) {
  const normalized = input.trim().replace(/\/$/, "").replace(/\.git$/, "");
  const httpsMatch = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(normalized);
  const sshMatch = /^git@github\.com:([^/]+)\/([^/]+)$/.exec(normalized);
  const shorthandMatch = /^([^/\s]+)\/([^/\s]+)$/.exec(normalized);
  const match = httpsMatch ?? sshMatch ?? shorthandMatch;
  if (!match) {
    return null;
  }
  return {
    owner: match[1],
    repo: match[2]
  };
}
function encodeGitHubPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}
function isSafeContentPath(path) {
  const normalized = (0, import_obsidian.normalizePath)(path).replace(/^\/+/, "");
  const segments = normalized.split("/");
  return normalized.startsWith(`${REMOTE_CONTENT_ROOT}/`) && !segments.some((segment) => segment === ".." || segment === "");
}
function toStatusLabel(status) {
  switch (status) {
    case "synced":
      return "\u5DF2\u540C\u6B65";
    case "modified":
      return "\u5DF2\u4FEE\u6539";
    case "deleted":
      return "\u8FDC\u7AEF\u5DF2\u5220\u9664";
    case "failed":
      return "\u540C\u6B65\u5931\u8D25";
    case "draft":
    default:
      return "\u672A\u540C\u6B65";
  }
}
function toStatusClass(status) {
  switch (status) {
    case "synced":
      return "is-synced";
    case "modified":
      return "is-modified";
    case "deleted":
      return "is-deleted";
    case "failed":
      return "is-failed";
    case "draft":
    default:
      return "is-draft";
  }
}
function toStatusIcon(status) {
  switch (status) {
    case "synced":
      return "cloud-check";
    case "modified":
      return "pencil";
    case "deleted":
      return "cloud-off";
    case "failed":
      return "alert-triangle";
    case "draft":
    default:
      return "file-pen";
  }
}
function toSyncCenterStatusLabel(status) {
  switch (status) {
    case "unpublished":
      return "\u672C\u5730\u672A\u53D1\u5E03";
    case "modified":
      return "\u5DF2\u4FEE\u6539";
    case "published":
      return "\u5DF2\u53D1\u5E03";
    case "localDeleted":
      return "\u672C\u5730\u5DF2\u5220\u9664";
    default:
      return status;
  }
}
function toSyncCenterStatusClass(status) {
  switch (status) {
    case "unpublished":
      return "is-draft";
    case "modified":
      return "is-modified";
    case "published":
      return "is-synced";
    case "localDeleted":
      return "is-deleted";
    default:
      return "is-draft";
  }
}
var ObsidianGitSyncerPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.data = DEFAULT_DATA;
  }
  async onload() {
    await this.loadSettings();
    this.addRibbonIcon("git-branch", "Obsidian Git Syncer", (evt) => {
      this.showRibbonMenu(evt);
    });
    this.addCommand({
      id: "open-sync-center",
      name: "\u6253\u5F00\u540C\u6B65\u4E2D\u5FC3",
      callback: () => this.openSyncCenter()
    });
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("obsidian-git-syncer-status");
    this.statusBarIconEl = this.statusBarEl.createSpan({ cls: "obsidian-git-syncer-status-icon" });
    this.statusBarTextEl = this.statusBarEl.createSpan({ cls: "obsidian-git-syncer-status-text" });
    this.addSettingTab(new GitSyncerSettingTab(this.app, this));
    this.registerEvent(this.app.workspace.on("file-open", () => void this.refreshStatusBar()));
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof import_obsidian.TFile && file === this.getCurrentFile()) {
          void this.refreshStatusBar();
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu) => {
        const file = this.getCurrentFile();
        if (!file) {
          return;
        }
        this.addArticleContextMenuItems(menu, file);
      })
    );
    await this.refreshStatusBar();
  }
  async loadSettings() {
    const saved = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...saved?.settings ?? {} };
    this.data = { ...DEFAULT_DATA, ...saved?.data ?? {} };
  }
  async saveAllData() {
    await this.saveData({
      settings: this.settings,
      data: this.data
    });
  }
  async saveSettings() {
    await this.saveAllData();
  }
  async markConnectionStale() {
    this.data.connection = {
      status: "stale",
      message: "\u914D\u7F6E\u5DF2\u53D8\u66F4\uFF0C\u8BF7\u91CD\u65B0\u6D4B\u8BD5\u8FDE\u63A5\u3002"
    };
    await this.saveAllData();
  }
  getRepository() {
    const repository = parseRepositoryUrl(this.settings.repositoryUrl);
    if (!repository) {
      throw new Error("GitHub \u4ED3\u5E93\u5730\u5740\u683C\u5F0F\u4E0D\u6B63\u786E\u3002\u652F\u6301 https://github.com/owner/repo.git\u3001git@github.com:owner/repo.git \u6216 owner/repo\u3002");
    }
    return repository;
  }
  validateConfig() {
    this.getRepository();
    if (!this.settings.githubUsername.trim()) {
      throw new Error("\u8BF7\u5148\u586B\u5199 GitHub Username\u3002");
    }
    if (!this.settings.githubToken.trim()) {
      throw new Error("\u8BF7\u5148\u586B\u5199 GitHub Token\u3002");
    }
    if (!this.settings.branch.trim()) {
      throw new Error("\u8BF7\u5148\u586B\u5199\u76EE\u6807\u5206\u652F\u3002");
    }
  }
  getExistingFolder(path) {
    const normalized = normalizeLocalRootPath(path);
    if (normalized === VAULT_ROOT_PATH) {
      return this.app.vault.getRoot();
    }
    const target = this.app.vault.getAbstractFileByPath(normalized);
    return target instanceof import_obsidian.TFolder ? target : null;
  }
  getAllVaultFolders() {
    const folders = /* @__PURE__ */ new Map();
    folders.set(VAULT_ROOT_PATH, this.app.vault.getRoot());
    this.app.vault.getAllLoadedFiles().forEach((entry) => {
      if (entry instanceof import_obsidian.TFolder && !isHiddenPath(entry.path)) {
        folders.set(normalizeLocalRootPath(entry.path), entry);
      }
    });
    return Array.from(folders.values()).sort((a, b) => {
      const aPath = displayLocalRootPath(a.path);
      const bPath = displayLocalRootPath(b.path);
      if (aPath === VAULT_ROOT_PATH) {
        return -1;
      }
      if (bPath === VAULT_ROOT_PATH) {
        return 1;
      }
      return aPath.localeCompare(bPath, "zh-CN");
    });
  }
  async setLocalRootPath(path) {
    const normalized = normalizeLocalRootPath(path);
    const folder = this.getExistingFolder(normalized);
    if (!folder) {
      throw new Error("\u8BE5\u76EE\u5F55\u4E0D\u5B58\u5728\uFF0C\u8BF7\u4ECE Vault \u4E2D\u9009\u62E9\u5DF2\u6709\u76EE\u5F55\u3002");
    }
    this.settings.localRootPath = normalized === VAULT_ROOT_PATH ? VAULT_ROOT_PATH : folder.path;
    await this.saveSettings();
  }
  getCurrentFile() {
    const file = this.app.workspace.getActiveFile();
    return file instanceof import_obsidian.TFile && file.extension === "md" ? file : null;
  }
  isInsideRoot(file) {
    const root = normalizeLocalRootPath(this.settings.localRootPath);
    if (root === VAULT_ROOT_PATH) {
      return true;
    }
    return file.path === root || file.path.startsWith(`${root}/`);
  }
  relativePath(file) {
    const root = normalizeLocalRootPath(this.settings.localRootPath);
    const fullPath = (0, import_obsidian.normalizePath)(file.path);
    if (root === VAULT_ROOT_PATH) {
      return fullPath;
    }
    if (fullPath === root) {
      return "";
    }
    if (fullPath.startsWith(`${root}/`)) {
      return fullPath.slice(root.length + 1);
    }
    return fullPath;
  }
  remotePath(file) {
    const relative = (0, import_obsidian.normalizePath)(this.relativePath(file)).replace(/^\/+/, "");
    const path = (0, import_obsidian.normalizePath)(`${REMOTE_CONTENT_ROOT}/${relative}`).replace(/^\/+/, "");
    if (!relative || !isSafeContentPath(path)) {
      throw new Error("\u8FDC\u7AEF\u8DEF\u5F84\u5FC5\u987B\u4F4D\u4E8E\u4ED3\u5E93 content \u76EE\u5F55\u5185\u3002");
    }
    return path;
  }
  localPathFromRemotePath(remotePath) {
    const normalizedRemotePath = (0, import_obsidian.normalizePath)(remotePath).replace(/^\/+/, "");
    if (!isSafeContentPath(normalizedRemotePath)) {
      throw new Error("\u8FDC\u7AEF\u8DEF\u5F84\u5FC5\u987B\u4F4D\u4E8E\u4ED3\u5E93 content \u76EE\u5F55\u5185\u3002");
    }
    const relative = normalizedRemotePath.slice(REMOTE_CONTENT_ROOT.length + 1);
    const localRoot = normalizeLocalRootPath(this.settings.localRootPath);
    if (localRoot === VAULT_ROOT_PATH) {
      return (0, import_obsidian.normalizePath)(relative);
    }
    return (0, import_obsidian.normalizePath)(`${localRoot}/${relative}`);
  }
  async ensureFolderPath(folderPath) {
    const normalized = (0, import_obsidian.normalizePath)(folderPath).replace(/\/$/, "");
    if (!normalized) {
      return;
    }
    const parts = normalized.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const entry = this.app.vault.getAbstractFileByPath(current);
      if (entry instanceof import_obsidian.TFolder) {
        continue;
      }
      if (entry) {
        throw new Error(`\u65E0\u6CD5\u521B\u5EFA\u76EE\u5F55\uFF0C\u8DEF\u5F84\u5DF2\u88AB\u6587\u4EF6\u5360\u7528\uFF1A${current}`);
      }
      await this.app.vault.createFolder(current);
    }
  }
  getState(file) {
    return this.data.files[file.path] ?? { status: "draft" };
  }
  async cacheEffectiveState(file, state) {
    const current = this.data.files[file.path];
    if (current?.remotePath === state.remotePath && current?.sha === state.sha && current?.status === state.status && current?.lastSyncedAt === state.lastSyncedAt && current?.lastSyncedHash === state.lastSyncedHash && current?.htmlUrl === state.htmlUrl) {
      return;
    }
    this.data.files[file.path] = state;
    await this.saveAllData();
  }
  async getEffectiveState(file) {
    let state = this.getState(file);
    try {
      state = await this.syncFileState(file);
    } catch {
    }
    if (state.status !== "synced" || !state.lastSyncedHash) {
      return state;
    }
    const content = await this.app.vault.read(file);
    const currentHash = hashContent(content);
    if (currentHash !== state.lastSyncedHash) {
      const nextState = { ...state, status: "modified" };
      await this.cacheEffectiveState(file, nextState);
      return nextState;
    }
    await this.cacheEffectiveState(file, state);
    return state;
  }
  async setState(file, patch) {
    this.data.files[file.path] = { ...this.getState(file), ...patch };
    await this.saveAllData();
    await this.refreshStatusBar();
  }
  setStatusBarState(statusClass) {
    this.statusBarEl.removeClass("is-draft", "is-synced", "is-modified", "is-deleted", "is-failed", "is-inactive");
    if (statusClass) {
      this.statusBarEl.addClass(statusClass);
    }
  }
  async refreshStatusBar() {
    const file = this.getCurrentFile();
    if (!file) {
      this.setStatusBarState("is-inactive");
      (0, import_obsidian.setIcon)(this.statusBarIconEl, "git-branch");
      this.statusBarTextEl.setText("\u65E0\u6D3B\u52A8\u6587\u7AE0");
      return;
    }
    if (!this.isInsideRoot(file)) {
      this.setStatusBarState("is-inactive");
      (0, import_obsidian.setIcon)(this.statusBarIconEl, "git-branch");
      this.statusBarTextEl.setText("\u4E0D\u5728\u540C\u6B65\u76EE\u5F55");
      return;
    }
    const state = await this.getEffectiveState(file);
    const label = toStatusLabel(state.status);
    this.setStatusBarState(toStatusClass(state.status));
    (0, import_obsidian.setIcon)(this.statusBarIconEl, toStatusIcon(state.status));
    this.statusBarTextEl.setText(label);
  }
  async ensureTemplateFrontmatter(file) {
    if (!this.isInsideRoot(file)) {
      throw new Error("\u5F53\u524D\u6587\u7AE0\u4E0D\u5728 Local Root Path \u5185\u3002");
    }
    const content = await this.app.vault.read(file);
    const parsed = parseFrontmatter(content);
    if (Object.keys(parsed.data).length > 0) {
      new import_obsidian.Notice("\u5F53\u524D\u6587\u7AE0\u5DF2\u7ECF\u5B58\u5728\u6587\u7AE0\u5C5E\u6027\u3002");
      return;
    }
    const nextContent = `${buildFrontmatter(file)}${content}`;
    await this.app.vault.modify(file, nextContent);
    new import_obsidian.Notice("\u6587\u7AE0\u5C5E\u6027\u5DF2\u63D2\u5165\u3002");
  }
  getSyncMenuTitle(state) {
    switch (state.status) {
      case "modified":
      case "deleted":
        return "\u91CD\u65B0\u540C\u6B65";
      case "failed":
        return "\u518D\u6B21\u540C\u6B65";
      case "synced":
        return "\u5DF2\u540C\u6B65";
      case "draft":
      default:
        return "\u540C\u6B65\u5230 GitHub";
    }
  }
  buildActionContext(file, state, hasProperties) {
    const inRoot = this.isInsideRoot(file);
    const syncTitle = this.getSyncMenuTitle(state);
    return {
      file,
      inRoot,
      hasProperties,
      state,
      syncTitle,
      canSync: inRoot && state.status !== "synced",
      canDeleteRemote: Boolean(state.sha) && state.status !== "deleted",
      canOpenRemote: Boolean(state.htmlUrl || state.remotePath) && state.status !== "deleted",
      canInsertProperties: inRoot && !hasProperties
    };
  }
  async getActionContext(file) {
    const [state, content] = await Promise.all([this.getEffectiveState(file), this.app.vault.read(file)]);
    const properties = parseFrontmatter(content).data;
    return this.buildActionContext(file, state, Object.keys(properties).length > 0);
  }
  getCachedActionContext(file) {
    const properties = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const state = this.getState(file);
    return this.buildActionContext(file, state, Object.keys(properties).length > 0);
  }
  async showRibbonMenu(evt) {
    const menu = new import_obsidian.Menu();
    const currentFile = this.getCurrentFile();
    const context = currentFile ? await this.getActionContext(currentFile) : null;
    menu.setUseNativeMenu(true);
    menu.addItem(
      (item) => item.setTitle(context?.syncTitle ?? "\u540C\u6B65\u5230 GitHub").setIcon("cloud-upload").setDisabled(!context?.canSync).onClick(() => {
        if (context) {
          void this.runWithNotice(async () => {
            await this.syncFileToGitHub(context.file);
          });
        }
      })
    );
    menu.addItem(
      (item) => item.setTitle("\u540C\u6B65\u4E2D\u5FC3").setIcon("list-tree").onClick(() => this.openSyncCenter())
    );
    menu.addItem(
      (item) => item.setTitle("\u6253\u5F00 GitHub").setIcon("external-link").setDisabled(!context?.canOpenRemote).onClick(() => {
        if (context) {
          void this.runWithNotice(() => this.openRemoteUrlForFile(context.file));
        }
      })
    );
    menu.addItem(
      (item) => item.setTitle("\u63D2\u5165\u6587\u7AE0\u5C5E\u6027").setIcon("file-plus-2").setDisabled(!context?.canInsertProperties).onClick(() => {
        if (context) {
          void this.runWithNotice(() => this.ensureTemplateFrontmatter(context.file));
        }
      })
    );
    menu.addSeparator();
    menu.addItem(
      (item) => item.setTitle(context?.state.status === "deleted" ? "\u8FDC\u7AEF\u5DF2\u5220\u9664" : "\u5220\u9664\u8FDC\u7AEF\u6587\u4EF6").setIcon("cloud-off").setWarning(true).setDisabled(!context?.canDeleteRemote).onClick(() => {
        if (context) {
          void this.runWithNotice(() => this.deleteRemoteFile(context.file));
        }
      })
    );
    menu.addSeparator();
    menu.addItem(
      (item) => item.setTitle("\u6D4B\u8BD5 GitHub \u8FDE\u63A5").setIcon("globe").onClick(
        () => void this.runWithNotice(async () => {
          await this.testConnection();
        })
      )
    );
    menu.addItem(
      (item) => item.setTitle("\u8BBE\u7F6E").setIcon("settings").onClick(() => this.openPluginSettings())
    );
    menu.addItem(
      (item) => item.setTitle(`\u7248\u672C v${this.manifest.version}`).setIcon("info").onClick(() => this.openVersionInfo())
    );
    menu.showAtMouseEvent(evt);
  }
  addArticleContextMenuItems(menu, file) {
    const context = this.getCachedActionContext(file);
    menu.addSeparator();
    menu.addItem(
      (item) => item.setTitle(context.syncTitle).setIcon("cloud-upload").setDisabled(!context.canSync).onClick(
        () => void this.runWithNotice(async () => {
          await this.syncFileToGitHub(context.file);
        })
      )
    );
    menu.addItem(
      (item) => item.setTitle("\u6253\u5F00 GitHub").setIcon("external-link").setDisabled(!context.canOpenRemote).onClick(() => void this.runWithNotice(() => this.openRemoteUrlForFile(context.file)))
    );
    menu.addItem(
      (item) => item.setTitle("\u63D2\u5165\u6587\u7AE0\u5C5E\u6027").setIcon("file-plus-2").setDisabled(!context.canInsertProperties).onClick(() => void this.runWithNotice(() => this.ensureTemplateFrontmatter(context.file)))
    );
    menu.addSeparator();
    menu.addItem(
      (item) => item.setTitle(context.state.status === "deleted" ? "\u8FDC\u7AEF\u5DF2\u5220\u9664" : "\u5220\u9664\u8FDC\u7AEF\u6587\u4EF6").setIcon("cloud-off").setWarning(true).setDisabled(!context.canDeleteRemote).onClick(() => void this.runWithNotice(() => this.deleteRemoteFile(context.file)))
    );
  }
  openPluginSettings() {
    const internalApp = this.app;
    if (!internalApp.setting) {
      new import_obsidian.Notice("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u76F4\u63A5\u8DF3\u8F6C\u63D2\u4EF6\u8BBE\u7F6E\u3002");
      return;
    }
    internalApp.setting.open();
    internalApp.setting.openTabById?.(this.manifest.id);
  }
  openVersionInfo() {
    new PluginVersionModal(this.app, this).open();
  }
  openSyncCenter() {
    new SyncCenterModal(this.app, this).open();
  }
  async runWithNotice(action) {
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u672A\u77E5\u9519\u8BEF";
      new import_obsidian.Notice(message);
    }
  }
  buildGitHubApiUrl(path, params) {
    const url = new URL(`https://api.github.com${path}`);
    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });
    return url.toString();
  }
  buildContentApiPath(remotePath) {
    const repository = this.getRepository();
    return `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/contents/${encodeGitHubPath(remotePath)}`;
  }
  buildRepoApiPath() {
    const repository = this.getRepository();
    return `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
  }
  buildBranchApiPath() {
    return `${this.buildRepoApiPath()}/branches/${encodeURIComponent(this.settings.branch.trim())}`;
  }
  buildGitTreeApiPath() {
    const repository = this.getRepository();
    return `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/git/trees/${encodeURIComponent(this.settings.branch.trim())}`;
  }
  buildGitHubBlobUrl(remotePath) {
    const repository = this.getRepository();
    return `https://github.com/${repository.owner}/${repository.repo}/blob/${encodeURIComponent(this.settings.branch.trim())}/${encodeGitHubPath(remotePath)}`;
  }
  async githubRequest(method, path, payload, params) {
    const response = await (0, import_obsidian.requestUrl)({
      url: this.buildGitHubApiUrl(path, params),
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.settings.githubToken.trim()}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: payload ? JSON.stringify(payload) : void 0
    });
    if (response.status >= 400) {
      let errorMessage = response.text;
      try {
        const parsed = JSON.parse(response.text);
        if (parsed.message) {
          errorMessage = parsed.message;
        }
      } catch {
      }
      throw new GitHubRequestError(response.status, errorMessage || `GitHub HTTP ${response.status}`, method, path);
    }
    return response.json;
  }
  async getRemoteContent(remotePath) {
    if (!isSafeContentPath(remotePath)) {
      throw new Error("\u8FDC\u7AEF\u8DEF\u5F84\u5FC5\u987B\u4F4D\u4E8E\u4ED3\u5E93 content \u76EE\u5F55\u5185\u3002");
    }
    try {
      const result = await this.githubRequest(
        "GET",
        this.buildContentApiPath(remotePath),
        void 0,
        { ref: this.settings.branch.trim() }
      );
      if (Array.isArray(result)) {
        throw new Error("\u8FDC\u7AEF\u8DEF\u5F84\u6307\u5411\u76EE\u5F55\uFF0C\u4E0D\u80FD\u4F5C\u4E3A\u6587\u7AE0\u540C\u6B65\u76EE\u6807\u3002");
      }
      if (result.type !== "file") {
        throw new Error("\u8FDC\u7AEF\u8DEF\u5F84\u4E0D\u662F\u666E\u901A\u6587\u4EF6\uFF0C\u4E0D\u80FD\u4F5C\u4E3A\u6587\u7AE0\u540C\u6B65\u76EE\u6807\u3002");
      }
      return result;
    } catch (error) {
      if (error instanceof GitHubRequestError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }
  async getRemoteFileBytes(remotePath) {
    const remote = await this.getRemoteContent(remotePath);
    if (!remote) {
      throw new Error(`\u8FDC\u7AEF\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${remotePath}`);
    }
    if (remote.encoding !== "base64" || !remote.content) {
      throw new Error(`\u8FDC\u7AEF\u6587\u4EF6\u5185\u5BB9\u7F16\u7801\u4E0D\u53D7\u652F\u6301\uFF1A${remotePath}`);
    }
    return {
      content: decodeBase64Bytes(remote.content),
      remote
    };
  }
  async pullRemoteFile(remotePath) {
    this.validateConfig();
    const { content, remote } = await this.getRemoteFileBytes(remotePath);
    const localPath = this.localPathFromRemotePath(remotePath);
    const parentPath = localPath.includes("/") ? localPath.slice(0, localPath.lastIndexOf("/")) : "";
    await this.ensureFolderPath(parentPath);
    const existing = this.app.vault.getAbstractFileByPath(localPath);
    const isMarkdown = localPath.toLowerCase().endsWith(".md");
    const textContent = isMarkdown ? new TextDecoder().decode(content) : "";
    let file;
    if (existing instanceof import_obsidian.TFile) {
      if (isMarkdown) {
        await this.app.vault.modify(existing, textContent);
      } else {
        await this.app.vault.modifyBinary(existing, content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength));
      }
      file = existing;
    } else if (existing) {
      throw new Error(`\u65E0\u6CD5\u62C9\u53D6\u8FDC\u7AEF\u6587\u4EF6\uFF0C\u672C\u5730\u8DEF\u5F84\u5DF2\u88AB\u76EE\u5F55\u5360\u7528\uFF1A${localPath}`);
    } else if (isMarkdown) {
      file = await this.app.vault.create(localPath, textContent);
    } else {
      file = await this.app.vault.createBinary(localPath, content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength));
    }
    this.data.files[file.path] = {
      remotePath,
      sha: remote.sha,
      status: "synced",
      lastSyncedAt: formatDateTime(/* @__PURE__ */ new Date()),
      lastSyncedHash: isMarkdown ? hashContent(textContent) : hashBytes(content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)),
      htmlUrl: remote.html_url ?? this.buildGitHubBlobUrl(remotePath)
    };
    await this.saveAllData();
    await this.refreshStatusBar();
  }
  collectSyncableFiles(folder, files = []) {
    folder.children.forEach((entry) => {
      if (entry instanceof import_obsidian.TFile && isSyncableFile(entry)) {
        files.push(entry);
      } else if (entry instanceof import_obsidian.TFolder && !isHiddenPath(entry.path)) {
        this.collectSyncableFiles(entry, files);
      }
    });
    return files;
  }
  getLocalSyncableFiles() {
    const root = this.getExistingFolder(this.settings.localRootPath);
    if (!root) {
      return [];
    }
    return this.collectSyncableFiles(root).filter((file) => this.isInsideRoot(file)).sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  }
  async getRemoteSyncableFiles() {
    this.validateConfig();
    const tree = await this.githubRequest("GET", this.buildGitTreeApiPath(), void 0, {
      recursive: "1"
    });
    if (tree.truncated) {
      new import_obsidian.Notice("GitHub \u8FD4\u56DE\u7684\u8FDC\u7AEF\u76EE\u5F55\u6811\u88AB\u622A\u65AD\uFF0C\u5217\u8868\u53EF\u80FD\u4E0D\u5B8C\u6574\u3002");
    }
    const remoteFiles = /* @__PURE__ */ new Map();
    tree.tree.forEach((entry) => {
      const fileName = entry.path.split("/").pop() ?? "";
      if (entry.type !== "blob" || !entry.path.startsWith(`${REMOTE_CONTENT_ROOT}/`) || fileName.startsWith(".")) {
        return;
      }
      if (!isSafeContentPath(entry.path)) {
        return;
      }
      remoteFiles.set(entry.path, {
        remotePath: entry.path,
        sha: entry.sha,
        htmlUrl: this.buildGitHubBlobUrl(entry.path)
      });
    });
    return remoteFiles;
  }
  async buildSyncCenterItems() {
    this.validateConfig();
    const [remoteFiles, localFiles] = await Promise.all([
      this.getRemoteSyncableFiles(),
      Promise.resolve(this.getLocalSyncableFiles())
    ]);
    const items = [];
    const seenRemotePaths = /* @__PURE__ */ new Set();
    for (const file of localFiles) {
      const remotePath = this.remotePath(file);
      const remote = remoteFiles.get(remotePath);
      const state = this.getState(file);
      const textContent = file.extension === "md" ? await this.app.vault.read(file) : "";
      const binaryContent = file.extension === "md" ? textBytes(textContent).buffer : await this.app.vault.readBinary(file);
      const currentHash = file.extension === "md" ? hashContent(textContent) : hashBytes(binaryContent);
      const currentBlobSha = await gitBlobSha(binaryContent);
      let status;
      seenRemotePaths.add(remotePath);
      if (!remote) {
        status = "unpublished";
      } else if (remote.sha === currentBlobSha) {
        status = "published";
      } else if (state.sha === currentBlobSha && state.status === "synced") {
        status = "published";
      } else if (state.lastSyncedHash && state.lastSyncedHash === currentHash && state.sha === remote.sha) {
        status = "published";
      } else {
        status = "modified";
      }
      items.push({
        id: `local:${file.path}`,
        name: file.name,
        status,
        localPath: file.path,
        remotePath,
        folderPath: remotePath.slice(0, Math.max(remotePath.lastIndexOf("/"), REMOTE_CONTENT_ROOT.length)),
        file,
        remote,
        state
      });
    }
    remoteFiles.forEach((remote, remotePath) => {
      if (seenRemotePaths.has(remotePath)) {
        return;
      }
      const name = remotePath.split("/").pop() ?? remotePath;
      items.push({
        id: `remote:${remotePath}`,
        name,
        status: "localDeleted",
        remotePath,
        folderPath: remotePath.slice(0, Math.max(remotePath.lastIndexOf("/"), REMOTE_CONTENT_ROOT.length)),
        remote
      });
    });
    return items.sort((a, b) => {
      const statusOrder = {
        unpublished: 0,
        modified: 1,
        published: 2,
        localDeleted: 3
      };
      return statusOrder[a.status] - statusOrder[b.status] || a.remotePath.localeCompare(b.remotePath, "zh-CN");
    });
  }
  async deleteRemotePath(remotePath) {
    this.validateConfig();
    if (!isSafeContentPath(remotePath)) {
      throw new Error("\u8FDC\u7AEF\u8DEF\u5F84\u5FC5\u987B\u4F4D\u4E8E\u4ED3\u5E93 content \u76EE\u5F55\u5185\u3002");
    }
    const remote = await this.getRemoteContent(remotePath);
    if (!remote) {
      new import_obsidian.Notice(`\u8FDC\u7AEF\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${remotePath}`);
      return;
    }
    await this.githubRequest("DELETE", this.buildContentApiPath(remotePath), {
      message: `sync: delete ${remotePath}`,
      sha: remote.sha,
      branch: this.settings.branch.trim()
    });
    Object.entries(this.data.files).forEach(([localPath, state]) => {
      if (state.remotePath === remotePath) {
        this.data.files[localPath] = {
          ...state,
          sha: void 0,
          htmlUrl: void 0,
          status: "deleted"
        };
      }
    });
    await this.saveAllData();
  }
  async syncFileState(file) {
    if (!this.isInsideRoot(file) || !isSyncableFile(file)) {
      return { status: "draft" };
    }
    this.validateConfig();
    const remotePath = this.remotePath(file);
    const current = this.getState(file);
    const remote = await this.getRemoteContent(remotePath);
    if (!remote) {
      const nextState2 = current.sha ? {
        ...current,
        remotePath,
        sha: void 0,
        htmlUrl: void 0,
        status: "deleted"
      } : { remotePath, status: "draft" };
      this.data.files[file.path] = nextState2;
      await this.saveAllData();
      return nextState2;
    }
    const nextState = {
      ...current,
      remotePath,
      sha: remote.sha,
      htmlUrl: remote.html_url ?? this.buildGitHubBlobUrl(remotePath),
      status: "synced"
    };
    if (current.sha !== remote.sha) {
      nextState.lastSyncedHash = void 0;
    }
    this.data.files[file.path] = nextState;
    await this.saveAllData();
    return nextState;
  }
  async testConnection() {
    try {
      this.validateConfig();
      const repository = this.getRepository();
      const user = await this.githubRequest("GET", "/user");
      const repo = await this.githubRequest("GET", this.buildRepoApiPath());
      await this.githubRequest("GET", this.buildBranchApiPath());
      if (user.login.toLowerCase() !== this.settings.githubUsername.trim().toLowerCase()) {
        throw new Error(`Token \u7528\u6237\u4E3A ${user.login}\uFF0C\u4E0E\u914D\u7F6E\u7684 GitHub Username \u4E0D\u4E00\u81F4\u3002`);
      }
      if (!repo.permissions?.admin && !repo.permissions?.maintain && !repo.permissions?.push) {
        throw new Error(
          `Token \u5BF9 ${repo.full_name} \u6CA1\u6709\u5199\u6743\u9650\u3002\u8BF7\u786E\u8BA4 Fine-grained token \u5DF2\u6388\u6743\u8BE5\u4ED3\u5E93\uFF0C\u5E76\u5C06 Contents \u8BBE\u7F6E\u4E3A Read and write\u3002`
        );
      }
      const state = {
        status: "success",
        message: `\u8FDE\u63A5\u6210\u529F\uFF1A${repository.owner}/${repository.repo}@${this.settings.branch.trim()}`,
        checkedAt: formatDateTime(/* @__PURE__ */ new Date())
      };
      this.data.connection = state;
      await this.saveAllData();
      new import_obsidian.Notice(state.message);
      return state;
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u8FDE\u63A5\u5931\u8D25";
      const state = {
        status: "failed",
        message,
        checkedAt: formatDateTime(/* @__PURE__ */ new Date())
      };
      this.data.connection = state;
      await this.saveAllData();
      throw error;
    }
  }
  async syncFileToGitHub(file) {
    this.validateConfig();
    if (!this.isInsideRoot(file)) {
      throw new Error("\u5F53\u524D\u6587\u7AE0\u4E0D\u5728 Local Root Path \u5185\u3002");
    }
    if (!isSyncableFile(file)) {
      throw new Error("\u9690\u85CF\u6587\u4EF6\u6216\u7CFB\u7EDF\u6587\u4EF6\u4E0D\u5141\u8BB8\u540C\u6B65\u3002");
    }
    const isMarkdown = file.extension === "md";
    const content = isMarkdown ? await this.app.vault.read(file) : "";
    const binaryContent = isMarkdown ? textBytes(content).buffer : await this.app.vault.readBinary(file);
    const currentHash = isMarkdown ? hashContent(content) : hashBytes(binaryContent);
    const currentBlobSha = await gitBlobSha(binaryContent);
    const remotePath = this.remotePath(file);
    try {
      const currentState = this.getState(file);
      const cachedSha = currentState.remotePath === remotePath ? currentState.sha : void 0;
      let resolvedRemote = null;
      const putContent = (sha) => this.githubRequest("PUT", this.buildContentApiPath(remotePath), {
        message: `${sha ? "sync: update" : "sync: add"} ${remotePath}`,
        content: isMarkdown ? encodeBase64(content) : encodeBytesBase64(new Uint8Array(binaryContent)),
        branch: this.settings.branch.trim(),
        ...sha ? { sha } : {}
      });
      let result;
      try {
        result = await putContent(cachedSha);
      } catch (error) {
        if (error instanceof GitHubRequestError && (error.status === 409 || error.status === 422)) {
          resolvedRemote = await this.getRemoteContent(remotePath);
          result = await putContent(resolvedRemote?.sha);
        } else {
          throw error;
        }
      }
      const nextSha = result.content?.sha ?? currentBlobSha ?? resolvedRemote?.sha ?? cachedSha;
      const htmlUrl = result.content?.html_url ?? this.buildGitHubBlobUrl(remotePath);
      const nextState = {
        remotePath,
        sha: nextSha,
        status: "synced",
        lastSyncedAt: formatDateTime(/* @__PURE__ */ new Date()),
        lastSyncedHash: currentHash,
        htmlUrl
      };
      await this.setState(file, nextState);
      new import_obsidian.Notice(`\u540C\u6B65\u6210\u529F\uFF1A${remotePath}`);
      return nextState;
    } catch (error) {
      await this.setState(file, { remotePath, status: "failed" });
      if (error instanceof GitHubRequestError && error.status === 404) {
        throw new Error(
          `GitHub \u5199\u5165\u8FD4\u56DE 404\uFF1A${remotePath}\u3002\u901A\u5E38\u662F Token \u6CA1\u6709\u6388\u6743\u5F53\u524D\u4ED3\u5E93\u3001Repository URL \u4E0D\u662F\u76EE\u6807\u535A\u5BA2\u4ED3\u5E93\uFF0C\u6216\u5206\u652F ${this.settings.branch.trim()} \u4E0D\u53EF\u5199\u3002\u8BF7\u786E\u8BA4 token \u7684 Repository access \u5305\u542B\u8BE5\u4ED3\u5E93\uFF0C\u4E14 Contents \u4E3A Read and write\u3002`
        );
      }
      throw error;
    }
  }
  async syncCurrentNote() {
    const file = this.getCurrentFile();
    if (!file) {
      throw new Error("\u5F53\u524D\u6CA1\u6709\u6FC0\u6D3B\u7684 Markdown \u6587\u4EF6\u3002");
    }
    await this.syncFileToGitHub(file);
  }
  async deleteRemoteFile(file) {
    this.validateConfig();
    if (!this.isInsideRoot(file)) {
      throw new Error("\u5F53\u524D\u6587\u7AE0\u4E0D\u5728 Local Root Path \u5185\u3002");
    }
    const remotePath = this.remotePath(file);
    const remote = await this.getRemoteContent(remotePath);
    if (!remote) {
      await this.setState(file, {
        remotePath,
        sha: void 0,
        htmlUrl: void 0,
        status: "deleted"
      });
      new import_obsidian.Notice("\u8FDC\u7AEF\u6587\u4EF6\u4E0D\u5B58\u5728\u3002");
      return;
    }
    await this.githubRequest("DELETE", this.buildContentApiPath(remotePath), {
      message: `sync: delete ${remotePath}`,
      sha: remote.sha,
      branch: this.settings.branch.trim()
    });
    await this.setState(file, {
      remotePath,
      sha: void 0,
      htmlUrl: void 0,
      status: "deleted"
    });
    new import_obsidian.Notice("\u8FDC\u7AEF\u6587\u4EF6\u5DF2\u5220\u9664\u3002");
  }
  async deleteCurrentRemoteNote() {
    const file = this.getCurrentFile();
    if (!file) {
      throw new Error("\u5F53\u524D\u6CA1\u6709\u6FC0\u6D3B\u7684 Markdown \u6587\u4EF6\u3002");
    }
    await this.deleteRemoteFile(file);
  }
  async openRemoteUrlForFile(file) {
    const state = await this.getEffectiveState(file);
    const remotePath = state.remotePath ?? this.remotePath(file);
    if (state.status === "deleted") {
      new import_obsidian.Notice("\u8FDC\u7AEF\u6587\u4EF6\u5DF2\u7ECF\u5220\u9664\u3002");
      return;
    }
    window.open(state.htmlUrl ?? this.buildGitHubBlobUrl(remotePath), "_blank");
  }
  async openRemoteUrl() {
    const file = this.getCurrentFile();
    if (!file) {
      new import_obsidian.Notice("\u5F53\u524D\u6CA1\u6709\u6FC0\u6D3B\u6587\u4EF6\u3002");
      return;
    }
    await this.openRemoteUrlForFile(file);
  }
};
var SyncCenterModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.items = [];
    this.selectedIds = /* @__PURE__ */ new Set();
    this.collapsedPaths = /* @__PURE__ */ new Set();
    this.deletedRemotePaths = /* @__PURE__ */ new Set();
    this.loading = false;
    this.errorMessage = "";
    this.plugin = plugin;
  }
  onOpen() {
    void this.refresh();
  }
  async refresh() {
    this.loading = true;
    this.errorMessage = "";
    this.render();
    try {
      this.items = this.applyDeletedRemoteOverrides(await this.plugin.buildSyncCenterItems());
      const validIds = new Set(this.items.map((item) => item.id));
      this.selectedIds.forEach((id) => {
        if (!validIds.has(id)) {
          this.selectedIds.delete(id);
        }
      });
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : "\u540C\u6B65\u4E2D\u5FC3\u52A0\u8F7D\u5931\u8D25\u3002";
    } finally {
      this.loading = false;
      this.render();
    }
  }
  applyDeletedRemoteOverrides(items) {
    return items.flatMap((item) => {
      if (!this.deletedRemotePaths.has(item.remotePath)) {
        return [item];
      }
      if (!item.file) {
        return [];
      }
      return [
        {
          ...item,
          status: "unpublished",
          remote: void 0
        }
      ];
    });
  }
  getSelectedItems() {
    return this.items.filter((item) => this.selectedIds.has(item.id));
  }
  getSelectedLocalItems() {
    return this.getSelectedItems().filter(
      (item) => item.file && this.plugin.isInsideRoot(item.file) && item.status !== "published" && item.status !== "localDeleted"
    );
  }
  getSelectedRemoteOnlyItems() {
    return this.getSelectedItems().filter((item) => item.status === "localDeleted");
  }
  getSelectedRemoteItems() {
    return this.getSelectedItems().filter((item) => item.remote);
  }
  setItemsSelected(items, selected) {
    items.forEach((item) => {
      if (selected) {
        this.selectedIds.add(item.id);
      } else {
        this.selectedIds.delete(item.id);
      }
    });
  }
  renderPreservingScroll() {
    const bodyEl = this.contentEl.querySelector(".obsidian-git-syncer-sync-center-body");
    const modalContentEl = this.contentEl.parentElement;
    const bodyScrollTop = bodyEl?.scrollTop ?? 0;
    const modalScrollTop = modalContentEl?.scrollTop ?? 0;
    this.render();
    requestAnimationFrame(() => {
      const nextBodyEl = this.contentEl.querySelector(".obsidian-git-syncer-sync-center-body");
      if (nextBodyEl) {
        nextBodyEl.scrollTop = bodyScrollTop;
      }
      if (modalContentEl) {
        modalContentEl.scrollTop = modalScrollTop;
      }
    });
  }
  toggleDirectory(path) {
    if (this.collapsedPaths.has(path)) {
      this.collapsedPaths.delete(path);
    } else {
      this.collapsedPaths.add(path);
    }
    this.renderPreservingScroll();
  }
  buildTree(items) {
    const root = {
      name: REMOTE_CONTENT_ROOT,
      path: REMOTE_CONTENT_ROOT,
      children: /* @__PURE__ */ new Map(),
      items: []
    };
    items.forEach((item) => {
      const relative = item.remotePath.startsWith(`${REMOTE_CONTENT_ROOT}/`) ? item.remotePath.slice(REMOTE_CONTENT_ROOT.length + 1) : item.remotePath;
      const parts = relative.split("/");
      const folders = parts.slice(0, -1);
      let node = root;
      folders.forEach((folder) => {
        const childPath = `${node.path}/${folder}`;
        let child = node.children.get(folder);
        if (!child) {
          child = {
            name: folder,
            path: childPath,
            children: /* @__PURE__ */ new Map(),
            items: []
          };
          node.children.set(folder, child);
        }
        node = child;
      });
      node.items.push(item);
    });
    return root;
  }
  getNodeItems(node) {
    const items = [...node.items];
    node.children.forEach((child) => {
      items.push(...this.getNodeItems(child));
    });
    return items;
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("obsidian-git-syncer-sync-center");
    this.renderHeader(contentEl);
    if (this.loading) {
      contentEl.createDiv({ cls: "obsidian-git-syncer-sync-center-empty", text: "\u6B63\u5728\u52A0\u8F7D\u672C\u5730\u4E0E\u8FDC\u7AEF\u5185\u5BB9..." });
      return;
    }
    if (this.errorMessage) {
      contentEl.createDiv({ cls: "obsidian-git-syncer-sync-center-error", text: this.errorMessage });
      return;
    }
    this.renderSummary(contentEl);
    this.renderToolbar(contentEl);
    const bodyEl = contentEl.createDiv({ cls: "obsidian-git-syncer-sync-center-body" });
    const statuses = ["unpublished", "modified", "published", "localDeleted"];
    statuses.forEach((status) => this.renderStatusSection(bodyEl, status));
  }
  renderHeader(containerEl) {
    const headerEl = containerEl.createDiv({ cls: "obsidian-git-syncer-sync-center-header" });
    const titleGroupEl = headerEl.createDiv();
    const titleRowEl = titleGroupEl.createDiv({ cls: "obsidian-git-syncer-sync-center-title-row" });
    titleRowEl.createEl("h2", { text: "\u540C\u6B65\u4E2D\u5FC3" });
    const refreshButton = titleRowEl.createEl("button", { cls: "obsidian-git-syncer-icon-button" });
    refreshButton.type = "button";
    refreshButton.setAttribute("aria-label", "\u5237\u65B0\u540C\u6B65\u4E2D\u5FC3");
    refreshButton.setAttribute("title", "\u5237\u65B0");
    (0, import_obsidian.setIcon)(refreshButton, "refresh-cw");
    refreshButton.addEventListener("click", () => void this.refresh());
    titleGroupEl.createDiv({
      cls: "obsidian-git-syncer-muted",
      text: `${this.plugin.settings.repositoryUrl || "\u672A\u914D\u7F6E\u4ED3\u5E93"} \xB7 ${this.plugin.settings.branch || "\u672A\u914D\u7F6E\u5206\u652F"}`
    });
  }
  renderSummary(containerEl) {
    const summaryEl = containerEl.createDiv({ cls: "obsidian-git-syncer-sync-summary" });
    const statuses = ["unpublished", "modified", "published", "localDeleted"];
    statuses.forEach((status) => {
      const count = this.items.filter((item) => item.status === status).length;
      const badgeEl = summaryEl.createDiv({
        cls: `obsidian-git-syncer-sync-summary-item ${toSyncCenterStatusClass(status)}`
      });
      badgeEl.createSpan({ text: toSyncCenterStatusLabel(status) });
      badgeEl.createSpan({ text: String(count), cls: "obsidian-git-syncer-sync-summary-count" });
    });
  }
  renderToolbar(containerEl) {
    const toolbarEl = containerEl.createDiv({ cls: "obsidian-git-syncer-sync-toolbar" });
    const selectedLocalCount = this.getSelectedLocalItems().length;
    const selectedRemoteOnlyCount = this.getSelectedRemoteOnlyItems().length;
    const selectedRemoteCount = this.getSelectedRemoteItems().length;
    toolbarEl.createDiv({
      cls: "obsidian-git-syncer-muted",
      text: `\u5DF2\u9009\u62E9 ${this.selectedIds.size} \u9879`
    });
    const createToolbarButton = (label, icon) => {
      const buttonEl = toolbarEl.createEl("button");
      buttonEl.type = "button";
      const iconEl = buttonEl.createSpan({ cls: "obsidian-git-syncer-button-icon" });
      (0, import_obsidian.setIcon)(iconEl, icon);
      buttonEl.createSpan({ cls: "obsidian-git-syncer-button-label", text: label });
      return buttonEl;
    };
    const deleteButton = createToolbarButton(`\u5220\u9664\u8FDC\u7AEF (${selectedRemoteCount})`, "cloud-off");
    deleteButton.disabled = selectedRemoteCount === 0;
    deleteButton.addClass("mod-warning");
    deleteButton.addEventListener("click", () => void this.deleteSelectedRemoteFiles());
    const pullButton = createToolbarButton(`\u62C9\u53D6\u8FDC\u7AEF (${selectedRemoteOnlyCount})`, "cloud-download");
    pullButton.disabled = selectedRemoteOnlyCount === 0;
    pullButton.addEventListener("click", () => void this.pullSelectedRemoteFiles());
    const syncButton = createToolbarButton(`\u540C\u6B65\u672C\u5730 (${selectedLocalCount})`, "cloud-upload");
    syncButton.disabled = selectedLocalCount === 0;
    syncButton.addClass("obsidian-git-syncer-sync-action");
    syncButton.addEventListener("click", () => void this.syncSelectedLocalFiles());
  }
  renderStatusSection(containerEl, status) {
    const sectionItems = this.items.filter((item) => item.status === status);
    const sectionEl = containerEl.createDiv({ cls: "obsidian-git-syncer-sync-section" });
    const headerEl = sectionEl.createDiv({ cls: "obsidian-git-syncer-sync-section-header" });
    headerEl.createEl("h3", { text: toSyncCenterStatusLabel(status) });
    headerEl.createSpan({
      cls: `obsidian-git-syncer-status-badge ${toSyncCenterStatusClass(status)}`,
      text: String(sectionItems.length)
    });
    if (sectionItems.length === 0) {
      sectionEl.createDiv({ cls: "obsidian-git-syncer-sync-center-empty", text: "\u6682\u65E0\u6587\u4EF6\u3002" });
      return;
    }
    const tree = this.buildTree(sectionItems);
    const treeEl = sectionEl.createDiv({ cls: "obsidian-git-syncer-sync-tree" });
    this.renderTreeContents(treeEl, tree, 0);
  }
  renderTreeContents(containerEl, node, depth) {
    Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-CN")).forEach((child) => {
      this.renderDirectoryRow(containerEl, child, depth);
      if (!this.collapsedPaths.has(child.path)) {
        this.renderTreeContents(containerEl, child, depth + 1);
      }
    });
    node.items.sort((a, b) => a.name.localeCompare(b.name, "zh-CN")).forEach((item) => this.renderFileRow(containerEl, item, depth));
  }
  renderDirectoryRow(containerEl, node, depth) {
    const items = this.getNodeItems(node);
    const selectedCount = items.filter((item) => this.selectedIds.has(item.id)).length;
    const isCollapsed = this.collapsedPaths.has(node.path);
    const rowEl = containerEl.createDiv({ cls: "obsidian-git-syncer-sync-tree-row is-folder" });
    rowEl.addClass(isCollapsed ? "is-collapsed" : "is-expanded");
    rowEl.style.setProperty("--sync-tree-depth", String(depth));
    const checkbox = rowEl.createEl("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedCount > 0 && selectedCount === items.length;
    checkbox.indeterminate = selectedCount > 0 && selectedCount < items.length;
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => {
      this.setItemsSelected(items, checkbox.checked);
      this.renderPreservingScroll();
    });
    const iconEl = rowEl.createSpan({ cls: "obsidian-git-syncer-sync-tree-icon" });
    (0, import_obsidian.setIcon)(iconEl, isCollapsed ? "folder-closed" : "folder-open");
    const nameEl = rowEl.createSpan({ cls: "obsidian-git-syncer-sync-tree-name", text: node.name });
    rowEl.createSpan({ cls: "obsidian-git-syncer-sync-tree-meta", text: `${items.length} \u9879` });
    rowEl.addEventListener("click", () => this.toggleDirectory(node.path));
  }
  renderFileRow(containerEl, item, depth) {
    const rowEl = containerEl.createDiv({ cls: "obsidian-git-syncer-sync-tree-row is-file" });
    rowEl.style.setProperty("--sync-tree-depth", String(depth));
    const checkbox = rowEl.createEl("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.selectedIds.has(item.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        this.selectedIds.add(item.id);
      } else {
        this.selectedIds.delete(item.id);
      }
      this.renderPreservingScroll();
    });
    const iconEl = rowEl.createSpan({ cls: "obsidian-git-syncer-sync-tree-icon" });
    (0, import_obsidian.setIcon)(iconEl, item.status === "localDeleted" ? "cloud-off" : isImagePath(item.remotePath) ? "image" : "file-text");
    const textEl = rowEl.createSpan({ cls: "obsidian-git-syncer-sync-tree-text" });
    textEl.createSpan({ cls: "obsidian-git-syncer-sync-tree-name", text: item.name });
    textEl.createSpan({
      cls: "obsidian-git-syncer-sync-tree-path",
      text: item.localPath ? item.localPath : item.remotePath
    });
    rowEl.createSpan({
      cls: `obsidian-git-syncer-status-badge ${toSyncCenterStatusClass(item.status)}`,
      text: toSyncCenterStatusLabel(item.status)
    });
  }
  async syncSelectedLocalFiles() {
    const items = this.getSelectedLocalItems();
    let successCount = 0;
    let failureCount = 0;
    for (const item of items) {
      if (!item.file) {
        continue;
      }
      try {
        const nextState = await this.plugin.syncFileToGitHub(item.file);
        successCount += 1;
        this.selectedIds.delete(item.id);
        this.deletedRemotePaths.delete(item.remotePath);
        item.status = "published";
        item.state = nextState;
        item.remote = {
          remotePath: item.remotePath,
          sha: nextState.sha ?? "",
          htmlUrl: nextState.htmlUrl ?? this.plugin.buildGitHubBlobUrl(item.remotePath)
        };
      } catch {
        failureCount += 1;
      }
    }
    new import_obsidian.Notice(`\u540C\u6B65\u5B8C\u6210\uFF1A\u6210\u529F ${successCount}\uFF0C\u5931\u8D25 ${failureCount}`);
    this.renderPreservingScroll();
  }
  async pullSelectedRemoteFiles() {
    const items = this.getSelectedRemoteOnlyItems();
    let successCount = 0;
    let failureCount = 0;
    for (const item of items) {
      try {
        await this.plugin.pullRemoteFile(item.remotePath);
        successCount += 1;
        this.selectedIds.delete(item.id);
      } catch {
        failureCount += 1;
      }
    }
    new import_obsidian.Notice(`\u8FDC\u7AEF\u6587\u4EF6\u62C9\u53D6\u5B8C\u6210\uFF1A\u6210\u529F ${successCount}\uFF0C\u5931\u8D25 ${failureCount}`);
    await this.refresh();
  }
  async deleteSelectedRemoteFiles() {
    const items = this.getSelectedRemoteItems();
    let successCount = 0;
    let failureCount = 0;
    for (const item of items) {
      try {
        await this.plugin.deleteRemotePath(item.remotePath);
        this.deletedRemotePaths.add(item.remotePath);
        if (item.file) {
          await this.plugin.setState(item.file, {
            remotePath: item.remotePath,
            sha: void 0,
            htmlUrl: void 0,
            status: "deleted"
          });
        }
        successCount += 1;
        this.selectedIds.delete(item.id);
      } catch {
        failureCount += 1;
      }
    }
    new import_obsidian.Notice(`\u8FDC\u7AEF\u6B8B\u7559\u6E05\u7406\u5B8C\u6210\uFF1A\u6210\u529F ${successCount}\uFF0C\u5931\u8D25 ${failureCount}`);
    this.items = this.applyDeletedRemoteOverrides(this.items);
    this.renderPreservingScroll();
  }
};
var PluginVersionModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "\u63D2\u4EF6\u7248\u672C\u4FE1\u606F" });
    contentEl.createEl("p", { text: `\u540D\u79F0\uFF1A${this.plugin.manifest.name}` });
    contentEl.createEl("p", { text: `\u7248\u672C\uFF1A${this.plugin.manifest.version}` });
    contentEl.createEl("p", { text: `\u63D2\u4EF6 ID\uFF1A${this.plugin.manifest.id}` });
    contentEl.createEl("p", { text: `\u6700\u4F4E Obsidian \u7248\u672C\uFF1A${this.plugin.manifest.minAppVersion}` });
  }
};
var GitSyncerSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.activeSection = "general";
    this.searchQuery = "";
    this.rootEl = null;
    this.navEl = null;
    this.panelEl = null;
    this.plugin = plugin;
  }
  getSections() {
    return [
      {
        id: "general",
        label: "\u901A\u7528\u8BBE\u7F6E",
        title: "\u901A\u7528\u8BBE\u7F6E",
        description: "\u7BA1\u7406\u672C\u5730\u540C\u6B65\u76EE\u5F55\u548C\u63D2\u4EF6\u57FA\u7840\u4FE1\u606F\u3002"
      },
      {
        id: "remote",
        label: "GitHub \u914D\u7F6E",
        title: "GitHub \u914D\u7F6E",
        description: "\u914D\u7F6E GitHub \u4ED3\u5E93\u3001Token\u3001\u7528\u6237\u540D\u548C\u76EE\u6807\u5206\u652F\u3002"
      },
      {
        id: "sync",
        label: "\u540C\u6B65\u63A7\u5236",
        title: "\u540C\u6B65\u63A7\u5236",
        description: "\u67E5\u770B content \u76EE\u5F55\u6620\u5C04\u3001\u72B6\u6001\u7F13\u5B58\u548C\u540C\u6B65\u7B56\u7565\u3002"
      },
      {
        id: "media",
        label: "\u9644\u4EF6\u5904\u7406",
        title: "\u9644\u4EF6\u5904\u7406",
        description: "\u540E\u7EED\u53EF\u6269\u5C55\u56FE\u7247\u4E0A\u4F20\u3001\u9644\u4EF6\u590D\u5236\u548C\u8D44\u6E90\u5F15\u7528\u91CD\u5199\u3002"
      },
      {
        id: "debug",
        label: "\u8C03\u8BD5",
        title: "\u8C03\u8BD5\u4E0E\u65E5\u5FD7",
        description: "\u67E5\u770B\u63D2\u4EF6\u7248\u672C\u548C\u8BCA\u65AD\u5165\u53E3\u3002"
      }
    ];
  }
  getFilterText(...parts) {
    return parts.filter((part) => Boolean(part)).join(" ").toLowerCase();
  }
  createSearchableSetting(containerEl, ...parts) {
    const setting = new import_obsidian.Setting(containerEl);
    setting.settingEl.dataset.filterText = this.getFilterText(...parts);
    return setting;
  }
  renderSearchBar(containerEl) {
    const searchSetting = new import_obsidian.Setting(containerEl).setClass("obsidian-git-syncer-settings-search-row");
    searchSetting.infoEl.remove();
    searchSetting.addSearch(
      (search) => search.setPlaceholder("\u641C\u7D22\u9762\u677F\u8BBE\u7F6E...").setValue(this.searchQuery).onChange((value) => {
        this.searchQuery = value;
        const panelEl = this.containerEl.querySelector(".obsidian-git-syncer-settings-panel");
        if (panelEl) {
          this.applySearchFilter(panelEl);
        }
      })
    );
  }
  renderSectionTabs(containerEl) {
    const navEl = containerEl.createDiv({ cls: "obsidian-git-syncer-settings-nav" });
    this.navEl = navEl;
    this.getSections().forEach((section) => {
      const button = navEl.createEl("button", {
        cls: `obsidian-git-syncer-settings-nav-item${this.activeSection === section.id ? " is-active" : ""}`,
        text: section.label
      });
      button.type = "button";
      button.addEventListener("click", () => {
        if (this.activeSection === section.id) {
          return;
        }
        this.activeSection = section.id;
        this.syncTabState();
        if (this.panelEl) {
          this.renderPanel(this.panelEl);
        }
      });
    });
  }
  syncTabState() {
    if (!this.navEl) {
      return;
    }
    const items = Array.from(this.navEl.querySelectorAll(".obsidian-git-syncer-settings-nav-item"));
    items.forEach((item, index) => {
      const section = this.getSections()[index];
      item.classList.toggle("is-active", section?.id === this.activeSection);
    });
  }
  renderPlaceholderSetting(containerEl, title, description, badge = "\u89C4\u5212\u4E2D") {
    this.createSearchableSetting(containerEl, title, description, badge).setName(title).setDesc(`${description}\uFF08${badge}\uFF09`);
  }
  renderSectionSubheading(containerEl, text) {
    new import_obsidian.Setting(containerEl).setName(text).setHeading();
  }
  renderConnectionStatus(containerEl) {
    const connection = this.plugin.data.connection ?? DEFAULT_DATA.connection;
    const statusEl = containerEl.createDiv({
      cls: `obsidian-git-syncer-connection-status is-${connection?.status ?? "unknown"}`
    });
    const iconEl = statusEl.createSpan({ cls: "obsidian-git-syncer-connection-status-icon" });
    const iconName = connection?.status === "success" ? "check-circle-2" : connection?.status === "failed" ? "x-circle" : connection?.status === "stale" ? "alert-circle" : "circle-help";
    (0, import_obsidian.setIcon)(iconEl, iconName);
    statusEl.createSpan({
      cls: "obsidian-git-syncer-connection-status-text",
      text: `${connection?.message ?? "\u5C1A\u672A\u6D4B\u8BD5\u8FDE\u63A5\u3002"}${connection?.checkedAt ? ` \xB7 ${connection.checkedAt}` : ""}`
    });
  }
  renderGeneralSettings(containerEl) {
    const localRootPath = displayLocalRootPath(this.plugin.settings.localRootPath);
    const localRootDescription = this.plugin.getExistingFolder(this.plugin.settings.localRootPath) ? `\u5F53\u524D\u76EE\u5F55\u6709\u6548\uFF1A${localRootPath}` : "\u53EA\u6709\u8BE5\u76EE\u5F55\u5185\u7684\u6587\u4EF6\u624D\u5141\u8BB8\u540C\u6B65\u3002\u5F53\u524D\u503C\u65E0\u6548\u65F6\u8BF7\u91CD\u65B0\u9009\u62E9\u76EE\u5F55\u3002";
    this.createSearchableSetting(containerEl, "Local Root Path", localRootDescription, localRootPath).setName("Local Root Path").setDesc(localRootDescription).addText(
      (text) => text.setValue(localRootPath).onChange(async (value) => {
        this.plugin.settings.localRootPath = normalizeLocalRootPath(value);
        await this.plugin.saveSettings();
        this.display();
      })
    ).addButton(
      (button) => button.setButtonText("\u9009\u62E9\u76EE\u5F55").onClick(() => {
        new FolderSelectModal(this.app, this.plugin, async (folder) => {
          try {
            await this.plugin.setLocalRootPath(folder.path);
            new import_obsidian.Notice(`\u5DF2\u8BBE\u7F6E Local Root Path\uFF1A${displayLocalRootPath(this.plugin.settings.localRootPath)}`);
            this.display();
          } catch (error) {
            const message = error instanceof Error ? error.message : "\u8BBE\u7F6E\u5931\u8D25";
            new import_obsidian.Notice(message);
          }
        }).open();
      })
    );
    this.createSearchableSetting(containerEl, "\u8FDC\u7AEF\u76EE\u5F55", "\u56FA\u5B9A\u5199\u5165 GitHub \u4ED3\u5E93 content \u76EE\u5F55\u3002", REMOTE_CONTENT_ROOT).setName("\u8FDC\u7AEF\u76EE\u5F55").setDesc("\u63D2\u4EF6\u53EA\u8BFB\u5199\u4ED3\u5E93 content \u76EE\u5F55\uFF1B\u672C\u5730\u540C\u6B65\u76EE\u5F55\u5185\u7684\u76F8\u5BF9\u8DEF\u5F84\u4F1A\u6620\u5C04\u5230 content \u4E0B\u3002");
    this.createSearchableSetting(containerEl, "\u63D2\u4EF6\u7248\u672C", this.plugin.manifest.version, this.plugin.manifest.id).setName("\u63D2\u4EF6\u7248\u672C").setDesc(`${this.plugin.manifest.name} v${this.plugin.manifest.version} \xB7 ${this.plugin.manifest.id}`);
  }
  renderRemoteSettings(containerEl) {
    this.createSearchableSetting(
      containerEl,
      "Repository URL",
      "\u4F8B\u5982 https://github.com/imliusx/obsidian-git-syncer.git",
      this.plugin.settings.repositoryUrl
    ).setName("Repository URL").setDesc("GitHub \u9879\u76EE\u4ED3\u5E93\u5730\u5740\uFF0C\u652F\u6301 HTTPS\u3001SSH \u6216 owner/repo\u3002").addText(
      (text) => text.setPlaceholder("https://github.com/owner/repo.git").setValue(this.plugin.settings.repositoryUrl).onChange(async (value) => {
        this.plugin.settings.repositoryUrl = value.trim();
        await this.plugin.markConnectionStale();
        await this.plugin.saveSettings();
      })
    );
    this.createSearchableSetting(containerEl, "GitHub Username", "\u5F53\u524D\u6388\u6743 Token \u5BF9\u5E94\u7684 GitHub \u7528\u6237\u540D\u3002", this.plugin.settings.githubUsername).setName("GitHub Username").setDesc("\u5F53\u524D\u6388\u6743 Token \u5BF9\u5E94\u7684 GitHub \u7528\u6237\u540D\u3002").addText(
      (text) => text.setPlaceholder("imliusx").setValue(this.plugin.settings.githubUsername).onChange(async (value) => {
        this.plugin.settings.githubUsername = value.trim();
        await this.plugin.markConnectionStale();
        await this.plugin.saveSettings();
      })
    );
    this.createSearchableSetting(containerEl, "GitHub Token", "Fine-grained Token \u9700\u8981\u5F00\u542F Contents \u8BFB\u5199\u6743\u9650\u3002").setName("GitHub Token").setDesc("Fine-grained Token \u9700\u8981\u6388\u6743\u76EE\u6807\u4ED3\u5E93\uFF0C\u5E76\u5F00\u542F Contents \u8BFB\u5199\u6743\u9650\u3002").addText((text) => {
      text.inputEl.type = "password";
      text.setPlaceholder("github_pat_...").setValue(this.plugin.settings.githubToken).onChange(async (value) => {
        this.plugin.settings.githubToken = value.trim();
        await this.plugin.markConnectionStale();
        await this.plugin.saveSettings();
      });
    });
    this.createSearchableSetting(containerEl, "Branch", "\u4F8B\u5982 main", this.plugin.settings.branch).setName("Branch").setDesc("\u540C\u6B65\u5199\u5165\u7684\u76EE\u6807\u5206\u652F\u3002").addText(
      (text) => text.setPlaceholder("main").setValue(this.plugin.settings.branch).onChange(async (value) => {
        this.plugin.settings.branch = value.trim();
        await this.plugin.markConnectionStale();
        await this.plugin.saveSettings();
      })
    );
    this.createSearchableSetting(containerEl, "\u6D4B\u8BD5\u8FDE\u63A5", "\u9A8C\u8BC1\u5F53\u524D\u4ED3\u5E93\u3001Token \u548C\u5206\u652F\u914D\u7F6E\u662F\u5426\u53EF\u8BBF\u95EE\u3002").setName("\u6D4B\u8BD5\u8FDE\u63A5").setDesc("\u9A8C\u8BC1\u5F53\u524D\u4ED3\u5E93\u3001Token \u548C\u5206\u652F\u914D\u7F6E\u662F\u5426\u53EF\u8BBF\u95EE\u3002").addButton(
      (button) => button.setButtonText("\u6D4B\u8BD5\u8FDE\u63A5").onClick(async () => {
        try {
          await this.plugin.testConnection();
          this.renderPanel(this.panelEl ?? containerEl);
        } catch (error) {
          const message = error instanceof Error ? error.message : "\u8FDE\u63A5\u5931\u8D25";
          new import_obsidian.Notice(message);
          this.renderPanel(this.panelEl ?? containerEl);
        }
      })
    );
    this.renderConnectionStatus(containerEl);
  }
  renderSyncSettings(containerEl) {
    this.createSearchableSetting(containerEl, "Content Root", "\u56FA\u5B9A\u4E3A content", REMOTE_CONTENT_ROOT).setName("Content Root").setDesc("\u8FDC\u7AEF\u8BFB\u5199\u8DEF\u5F84\u56FA\u5B9A\u4E3A content/<\u672C\u5730\u76F8\u5BF9\u8DEF\u5F84>\u3002");
    this.createSearchableSetting(containerEl, "\u540C\u6B65\u8BF4\u660E", "\u72B6\u6001\u7F13\u5B58\u3001\u672C\u5730\u4FEE\u6539\u68C0\u6D4B\u3001\u8FDC\u7AEF\u5220\u9664\u68C0\u6D4B", "\u8BF4\u660E").setName("\u540C\u6B65\u8BF4\u660E").setDesc("\u63D2\u4EF6\u4F1A\u7F13\u5B58\u6700\u8FD1\u540C\u6B65\u7684\u5185\u5BB9\u54C8\u5E0C\uFF1B\u672C\u5730\u5185\u5BB9\u53D8\u5316\u663E\u793A\u4E3A\u5DF2\u4FEE\u6539\uFF0C\u8FDC\u7AEF\u6587\u4EF6\u4E0D\u5B58\u5728\u663E\u793A\u4E3A\u8FDC\u7AEF\u5DF2\u5220\u9664\u3002");
    this.createSearchableSetting(containerEl, "\u6E05\u7406\u72B6\u6001\u7F13\u5B58", "\u6E05\u7406\u672C\u5730\u540C\u6B65\u72B6\u6001\uFF0C\u4E0D\u5F71\u54CD GitHub \u4ED3\u5E93\u6587\u4EF6\u3002").setName("\u6E05\u7406\u72B6\u6001\u7F13\u5B58").setDesc("\u6E05\u7406\u672C\u5730\u540C\u6B65\u72B6\u6001\uFF0C\u4E0D\u5F71\u54CD GitHub \u4ED3\u5E93\u6587\u4EF6\u3002").addButton(
      (button) => button.setButtonText("\u6E05\u7406").setWarning().onClick(async () => {
        this.plugin.data.files = {};
        await this.plugin.saveAllData();
        await this.plugin.refreshStatusBar();
        new import_obsidian.Notice("\u72B6\u6001\u7F13\u5B58\u5DF2\u6E05\u7406\u3002");
      })
    );
  }
  renderMediaSettings(containerEl) {
    this.renderPlaceholderSetting(
      containerEl,
      "\u9644\u4EF6\u4E0E\u56FE\u7247",
      "\u8FD9\u91CC\u5C06\u7528\u4E8E\u914D\u7F6E\u56FE\u7247\u590D\u5236\u7B56\u7565\u3001\u9644\u4EF6\u76EE\u5F55\u6620\u5C04\u3001\u8FDC\u7A0B\u8D44\u6E90\u5730\u5740\u4E0E\u5F15\u7528\u91CD\u5199\u89C4\u5219\u3002"
    );
  }
  renderDebugSettings(containerEl) {
    this.renderPlaceholderSetting(
      containerEl,
      "\u8C03\u8BD5\u4E0E\u65E5\u5FD7",
      "\u8FD9\u91CC\u5C06\u7528\u4E8E\u67E5\u770B\u540C\u6B65\u65E5\u5FD7\u3001\u8BF7\u6C42\u7ED3\u679C\u548C\u9519\u8BEF\u6392\u67E5\u4FE1\u606F\u3002"
    );
    this.createSearchableSetting(containerEl, "\u63D2\u4EF6\u7248\u672C\u4FE1\u606F", "\u67E5\u770B\u7248\u672C\u3001\u63D2\u4EF6 ID \u548C\u6700\u4F4E\u517C\u5BB9\u7248\u672C\u3002").setName("\u63D2\u4EF6\u7248\u672C\u4FE1\u606F").setDesc("\u67E5\u770B\u7248\u672C\u3001\u63D2\u4EF6 ID \u548C\u6700\u4F4E\u517C\u5BB9\u7248\u672C\u3002").addButton(
      (button) => button.setButtonText("\u6253\u5F00").onClick(() => {
        new PluginVersionModal(this.app, this.plugin).open();
      })
    );
  }
  applySearchFilter(panelEl) {
    const query = this.searchQuery.trim().toLowerCase();
    const items = Array.from(panelEl.querySelectorAll(".setting-item[data-filter-text]"));
    let visibleCount = 0;
    items.forEach((itemEl) => {
      const matches = !query || (itemEl.dataset.filterText ?? "").includes(query);
      itemEl.classList.toggle("is-hidden", !matches);
      if (matches) {
        visibleCount += 1;
      }
    });
    const emptyStateEl = panelEl.querySelector(".obsidian-git-syncer-settings-empty");
    if (emptyStateEl) {
      emptyStateEl.classList.toggle("is-hidden", visibleCount > 0);
    }
  }
  renderActiveSection(containerEl) {
    switch (this.activeSection) {
      case "general":
        this.renderGeneralSettings(containerEl);
        break;
      case "remote":
        this.renderRemoteSettings(containerEl);
        break;
      case "sync":
        this.renderSyncSettings(containerEl);
        break;
      case "media":
        this.renderMediaSettings(containerEl);
        break;
      case "debug":
        this.renderDebugSettings(containerEl);
        break;
      default:
        break;
    }
  }
  renderPanel(panelEl) {
    panelEl.empty();
    this.renderActiveSection(panelEl);
    panelEl.createDiv({
      cls: "obsidian-git-syncer-settings-empty is-hidden",
      text: "\u6CA1\u6709\u5339\u914D\u5230\u5F53\u524D\u7B5B\u9009\u6761\u4EF6\u7684\u8BBE\u7F6E\u9879\u3002"
    });
    this.applySearchFilter(panelEl);
  }
  display() {
    const { containerEl } = this;
    containerEl.querySelectorAll(".obsidian-git-syncer-settings-root").forEach((element) => element.remove());
    this.rootEl = containerEl.createDiv({ cls: "obsidian-git-syncer-settings-root" });
    this.navEl = null;
    this.panelEl = null;
    this.renderSearchBar(this.rootEl);
    this.renderSectionTabs(this.rootEl);
    const sectionEl = this.rootEl.createDiv({ cls: "obsidian-git-syncer-settings-panel" });
    this.panelEl = sectionEl;
    this.renderPanel(sectionEl);
  }
};
var FolderSelectModal = class extends import_obsidian.FuzzySuggestModal {
  constructor(app, plugin, onChooseFolder) {
    super(app);
    this.plugin = plugin;
    this.onChooseFolder = onChooseFolder;
    this.setPlaceholder("\u9009\u62E9 Local Root Path \u76EE\u5F55");
  }
  getItems() {
    return this.plugin.getAllVaultFolders();
  }
  getItemText(folder) {
    return folder.path || VAULT_ROOT_PATH;
  }
  async onChooseItem(folder) {
    await this.onChooseFolder(folder);
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7XG4gIEFwcCxcbiAgRnV6enlTdWdnZXN0TW9kYWwsXG4gIE1lbnUsXG4gIE1vZGFsLFxuICBOb3RpY2UsXG4gIFBsdWdpbixcbiAgUGx1Z2luU2V0dGluZ1RhYixcbiAgU2V0dGluZyxcbiAgc2V0SWNvbixcbiAgVEZpbGUsXG4gIFRGb2xkZXIsXG4gIG5vcm1hbGl6ZVBhdGgsXG4gIHJlcXVlc3RVcmxcbn0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmludGVyZmFjZSBHaXRIdWJTeW5jU2V0dGluZ3Mge1xuICByZXBvc2l0b3J5VXJsOiBzdHJpbmc7XG4gIGdpdGh1YlVzZXJuYW1lOiBzdHJpbmc7XG4gIGdpdGh1YlRva2VuOiBzdHJpbmc7XG4gIGJyYW5jaDogc3RyaW5nO1xuICBsb2NhbFJvb3RQYXRoOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBMb2NhbEZpbGVTdGF0ZSB7XG4gIHJlbW90ZVBhdGg/OiBzdHJpbmc7XG4gIHNoYT86IHN0cmluZztcbiAgc3RhdHVzOiBcImRyYWZ0XCIgfCBcInN5bmNlZFwiIHwgXCJtb2RpZmllZFwiIHwgXCJkZWxldGVkXCIgfCBcImZhaWxlZFwiO1xuICBsYXN0U3luY2VkQXQ/OiBzdHJpbmc7XG4gIGxhc3RTeW5jZWRIYXNoPzogc3RyaW5nO1xuICBodG1sVXJsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUGVyc2lzdGVkRGF0YSB7XG4gIGZpbGVzOiBSZWNvcmQ8c3RyaW5nLCBMb2NhbEZpbGVTdGF0ZT47XG4gIGNvbm5lY3Rpb24/OiBDb25uZWN0aW9uU3RhdGU7XG59XG5cbmludGVyZmFjZSBDb25uZWN0aW9uU3RhdGUge1xuICBzdGF0dXM6IFwidW5rbm93blwiIHwgXCJzdWNjZXNzXCIgfCBcImZhaWxlZFwiIHwgXCJzdGFsZVwiO1xuICBtZXNzYWdlOiBzdHJpbmc7XG4gIGNoZWNrZWRBdD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEFydGljbGVBY3Rpb25Db250ZXh0IHtcbiAgZmlsZTogVEZpbGU7XG4gIGluUm9vdDogYm9vbGVhbjtcbiAgaGFzUHJvcGVydGllczogYm9vbGVhbjtcbiAgc3RhdGU6IExvY2FsRmlsZVN0YXRlO1xuICBzeW5jVGl0bGU6IHN0cmluZztcbiAgY2FuU3luYzogYm9vbGVhbjtcbiAgY2FuRGVsZXRlUmVtb3RlOiBib29sZWFuO1xuICBjYW5PcGVuUmVtb3RlOiBib29sZWFuO1xuICBjYW5JbnNlcnRQcm9wZXJ0aWVzOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViUmVwbyB7XG4gIG93bmVyOiBzdHJpbmc7XG4gIHJlcG86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEdpdEh1YkVycm9yUGF5bG9hZCB7XG4gIG1lc3NhZ2U/OiBzdHJpbmc7XG4gIGRvY3VtZW50YXRpb25fdXJsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViQ29udGVudFJlc3BvbnNlIHtcbiAgdHlwZTogc3RyaW5nO1xuICBwYXRoOiBzdHJpbmc7XG4gIHNoYTogc3RyaW5nO1xuICBodG1sX3VybD86IHN0cmluZztcbiAgY29udGVudD86IHN0cmluZztcbiAgZW5jb2Rpbmc/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBHaXRIdWJQdXRSZXNwb25zZSB7XG4gIGNvbnRlbnQ/OiBHaXRIdWJDb250ZW50UmVzcG9uc2UgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViRGVsZXRlUmVzcG9uc2Uge1xuICBjb250ZW50PzogR2l0SHViQ29udGVudFJlc3BvbnNlIHwgbnVsbDtcbn1cblxuaW50ZXJmYWNlIEdpdEh1YlVzZXJSZXNwb25zZSB7XG4gIGxvZ2luOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBHaXRIdWJSZXBvUmVzcG9uc2Uge1xuICBmdWxsX25hbWU6IHN0cmluZztcbiAgcGVybWlzc2lvbnM/OiB7XG4gICAgYWRtaW4/OiBib29sZWFuO1xuICAgIG1haW50YWluPzogYm9vbGVhbjtcbiAgICBwdXNoPzogYm9vbGVhbjtcbiAgICB0cmlhZ2U/OiBib29sZWFuO1xuICAgIHB1bGw/OiBib29sZWFuO1xuICB9O1xufVxuXG5pbnRlcmZhY2UgR2l0SHViVHJlZUl0ZW0ge1xuICBwYXRoOiBzdHJpbmc7XG4gIHR5cGU6IFwiYmxvYlwiIHwgXCJ0cmVlXCIgfCBzdHJpbmc7XG4gIHNoYTogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViVHJlZVJlc3BvbnNlIHtcbiAgdHJlZTogR2l0SHViVHJlZUl0ZW1bXTtcbiAgdHJ1bmNhdGVkOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgUmVtb3RlU3luY0ZpbGUge1xuICByZW1vdGVQYXRoOiBzdHJpbmc7XG4gIHNoYTogc3RyaW5nO1xuICBodG1sVXJsOiBzdHJpbmc7XG59XG5cbnR5cGUgU3luY0NlbnRlclN0YXR1cyA9IFwidW5wdWJsaXNoZWRcIiB8IFwibW9kaWZpZWRcIiB8IFwicHVibGlzaGVkXCIgfCBcImxvY2FsRGVsZXRlZFwiO1xuXG5pbnRlcmZhY2UgU3luY0NlbnRlckl0ZW0ge1xuICBpZDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIHN0YXR1czogU3luY0NlbnRlclN0YXR1cztcbiAgbG9jYWxQYXRoPzogc3RyaW5nO1xuICByZW1vdGVQYXRoOiBzdHJpbmc7XG4gIGZvbGRlclBhdGg6IHN0cmluZztcbiAgZmlsZT86IFRGaWxlO1xuICByZW1vdGU/OiBSZW1vdGVTeW5jRmlsZTtcbiAgc3RhdGU/OiBMb2NhbEZpbGVTdGF0ZTtcbn1cblxuaW50ZXJmYWNlIFN5bmNUcmVlTm9kZSB7XG4gIG5hbWU6IHN0cmluZztcbiAgcGF0aDogc3RyaW5nO1xuICBjaGlsZHJlbjogTWFwPHN0cmluZywgU3luY1RyZWVOb2RlPjtcbiAgaXRlbXM6IFN5bmNDZW50ZXJJdGVtW107XG59XG5cbmNvbnN0IFJFTU9URV9DT05URU5UX1JPT1QgPSBcImNvbnRlbnRcIjtcbmNvbnN0IFZBVUxUX1JPT1RfUEFUSCA9IFwiL1wiO1xuXG5jb25zdCBERUZBVUxUX1NFVFRJTkdTOiBHaXRIdWJTeW5jU2V0dGluZ3MgPSB7XG4gIHJlcG9zaXRvcnlVcmw6IFwiXCIsXG4gIGdpdGh1YlVzZXJuYW1lOiBcIlwiLFxuICBnaXRodWJUb2tlbjogXCJcIixcbiAgYnJhbmNoOiBcIm1haW5cIixcbiAgbG9jYWxSb290UGF0aDogXCJjb250ZW50XCJcbn07XG5cbmNvbnN0IERFRkFVTFRfREFUQTogUGVyc2lzdGVkRGF0YSA9IHtcbiAgZmlsZXM6IHt9LFxuICBjb25uZWN0aW9uOiB7XG4gICAgc3RhdHVzOiBcInVua25vd25cIixcbiAgICBtZXNzYWdlOiBcIlx1NUMxQVx1NjcyQVx1NkQ0Qlx1OEJENVx1OEZERVx1NjNBNVx1MzAwMlwiXG4gIH1cbn07XG5cbmNsYXNzIEdpdEh1YlJlcXVlc3RFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgc3RhdHVzOiBudW1iZXI7XG4gIG1ldGhvZDogc3RyaW5nO1xuICBwYXRoOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc3RhdHVzOiBudW1iZXIsIG1lc3NhZ2U6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcsIHBhdGg6IHN0cmluZykge1xuICAgIHN1cGVyKG1lc3NhZ2UpO1xuICAgIHRoaXMuc3RhdHVzID0gc3RhdHVzO1xuICAgIHRoaXMubWV0aG9kID0gbWV0aG9kO1xuICAgIHRoaXMucGF0aCA9IHBhdGg7XG4gIH1cbn1cblxuZnVuY3Rpb24gZXNjYXBlWWFtbChpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIGlucHV0LnJlcGxhY2UoL1wiL2csICdcXFxcXCInKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VGcm9udG1hdHRlcihjb250ZW50OiBzdHJpbmcpOiB7IGRhdGE6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47IGJvZHk6IHN0cmluZyB9IHtcbiAgaWYgKCFjb250ZW50LnN0YXJ0c1dpdGgoXCItLS1cXG5cIikpIHtcbiAgICByZXR1cm4geyBkYXRhOiB7fSwgYm9keTogY29udGVudCB9O1xuICB9XG5cbiAgY29uc3QgZW5kID0gY29udGVudC5pbmRleE9mKFwiXFxuLS0tXFxuXCIsIDQpO1xuICBpZiAoZW5kID09PSAtMSkge1xuICAgIHJldHVybiB7IGRhdGE6IHt9LCBib2R5OiBjb250ZW50IH07XG4gIH1cblxuICBjb25zdCByYXcgPSBjb250ZW50LnNsaWNlKDQsIGVuZCkuc3BsaXQoXCJcXG5cIik7XG4gIGNvbnN0IGRhdGE6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcblxuICBmb3IgKGNvbnN0IGxpbmUgb2YgcmF3KSB7XG4gICAgY29uc3Qgc2VwYXJhdG9yID0gbGluZS5pbmRleE9mKFwiOlwiKTtcbiAgICBpZiAoc2VwYXJhdG9yID09PSAtMSkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3Qga2V5ID0gbGluZS5zbGljZSgwLCBzZXBhcmF0b3IpLnRyaW0oKTtcbiAgICBjb25zdCB2YWx1ZSA9IGxpbmUuc2xpY2Uoc2VwYXJhdG9yICsgMSkudHJpbSgpLnJlcGxhY2UoL15cInxcIiQvZywgXCJcIik7XG4gICAgaWYgKGtleSkge1xuICAgICAgZGF0YVtrZXldID0gdmFsdWU7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgZGF0YSwgYm9keTogY29udGVudC5zbGljZShlbmQgKyA1KSB9O1xufVxuXG5mdW5jdGlvbiBidWlsZEZyb250bWF0dGVyKGZpbGU6IFRGaWxlLCB0aXRsZT86IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IHRvZGF5ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgY29uc3QgcmVzb2x2ZWRUaXRsZSA9IHRpdGxlPy50cmltKCkgfHwgZmlsZS5iYXNlbmFtZTtcbiAgY29uc3Qgc2x1ZyA9IHJlc29sdmVkVGl0bGVcbiAgICAudHJpbSgpXG4gICAgLnRvTG93ZXJDYXNlKClcbiAgICAucmVwbGFjZSgvXFxzKy9nLCBcIi1cIilcbiAgICAucmVwbGFjZSgvW15cXHB7TH1cXHB7Tn0tXSsvZ3UsIFwiXCIpXG4gICAgLnJlcGxhY2UoLy0rL2csIFwiLVwiKVxuICAgIC5yZXBsYWNlKC9eLXwtJC9nLCBcIlwiKTtcblxuICByZXR1cm4gW1xuICAgIFwiLS0tXCIsXG4gICAgYHRpdGxlOiAke2VzY2FwZVlhbWwocmVzb2x2ZWRUaXRsZSl9YCxcbiAgICBgc2x1ZzogJHtzbHVnIHx8IGZpbGUuYmFzZW5hbWV9YCxcbiAgICBgZGF0ZTogJHt0b2RheX1gLFxuICAgIFwiY2F0ZWdvcnk6IFx1NUYwMFx1NTNEMVwiLFxuICAgIFwidGFnczpcIixcbiAgICBcIiAgLSBKYXZhXCIsXG4gICAgXCIgIC0gTmV4dEpTXCIsXG4gICAgXCJkZXNjcmlwdGlvbjogXHU2NTg3XHU3QUUwXHU2NDU4XHU4OTgxXCIsXG4gICAgXCJjb3ZlcjpcIixcbiAgICBcInB1Ymxpc2hlZDogdHJ1ZVwiLFxuICAgIFwiLS0tXCIsXG4gICAgXCJcIlxuICBdLmpvaW4oXCJcXG5cIik7XG59XG5cbmZ1bmN0aW9uIHBhZERhdGVOdW1iZXIodmFsdWU6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBTdHJpbmcodmFsdWUpLnBhZFN0YXJ0KDIsIFwiMFwiKTtcbn1cblxuZnVuY3Rpb24gZm9ybWF0RGF0ZVRpbWUoaW5wdXQ6IERhdGUgfCBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBkYXRlID0gdHlwZW9mIGlucHV0ID09PSBcInN0cmluZ1wiID8gbmV3IERhdGUoaW5wdXQpIDogaW5wdXQ7XG5cbiAgaWYgKE51bWJlci5pc05hTihkYXRlLmdldFRpbWUoKSkpIHtcbiAgICByZXR1cm4gdHlwZW9mIGlucHV0ID09PSBcInN0cmluZ1wiID8gaW5wdXQgOiBcIlwiO1xuICB9XG5cbiAgcmV0dXJuIFtcbiAgICBgJHtkYXRlLmdldEZ1bGxZZWFyKCl9LSR7cGFkRGF0ZU51bWJlcihkYXRlLmdldE1vbnRoKCkgKyAxKX0tJHtwYWREYXRlTnVtYmVyKGRhdGUuZ2V0RGF0ZSgpKX1gLFxuICAgIGAke3BhZERhdGVOdW1iZXIoZGF0ZS5nZXRIb3VycygpKX06JHtwYWREYXRlTnVtYmVyKGRhdGUuZ2V0TWludXRlcygpKX06JHtwYWREYXRlTnVtYmVyKGRhdGUuZ2V0U2Vjb25kcygpKX1gXG4gIF0uam9pbihcIiBcIik7XG59XG5cbmZ1bmN0aW9uIGhhc2hDb250ZW50KGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgaGFzaCA9IDA7XG5cbiAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGlucHV0Lmxlbmd0aDsgaW5kZXggKz0gMSkge1xuICAgIGhhc2ggPSAoaGFzaCAqIDMxICsgaW5wdXQuY2hhckNvZGVBdChpbmRleCkpIHwgMDtcbiAgfVxuXG4gIHJldHVybiBgaCR7TWF0aC5hYnMoaGFzaCl9YDtcbn1cblxuZnVuY3Rpb24gZW5jb2RlQmFzZTY0KGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBieXRlcyA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShpbnB1dCk7XG4gIHJldHVybiBlbmNvZGVCeXRlc0Jhc2U2NChieXRlcyk7XG59XG5cbmZ1bmN0aW9uIGVuY29kZUJ5dGVzQmFzZTY0KGJ5dGVzOiBVaW50OEFycmF5KTogc3RyaW5nIHtcbiAgbGV0IGJpbmFyeSA9IFwiXCI7XG5cbiAgYnl0ZXMuZm9yRWFjaCgoYnl0ZSkgPT4ge1xuICAgIGJpbmFyeSArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ5dGUpO1xuICB9KTtcblxuICByZXR1cm4gYnRvYShiaW5hcnkpO1xufVxuXG5mdW5jdGlvbiB0ZXh0Qnl0ZXMoaW5wdXQ6IHN0cmluZyk6IFVpbnQ4QXJyYXkge1xuICByZXR1cm4gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKGlucHV0KTtcbn1cblxuZnVuY3Rpb24gZGVjb2RlQmFzZTY0Qnl0ZXMoaW5wdXQ6IHN0cmluZyk6IFVpbnQ4QXJyYXkge1xuICBjb25zdCBiaW5hcnkgPSBhdG9iKGlucHV0LnJlcGxhY2UoL1xccy9nLCBcIlwiKSk7XG4gIGNvbnN0IGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoYmluYXJ5Lmxlbmd0aCk7XG5cbiAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGJpbmFyeS5sZW5ndGg7IGluZGV4ICs9IDEpIHtcbiAgICBieXRlc1tpbmRleF0gPSBiaW5hcnkuY2hhckNvZGVBdChpbmRleCk7XG4gIH1cblxuICByZXR1cm4gYnl0ZXM7XG59XG5cbmZ1bmN0aW9uIGRlY29kZUJhc2U2NChpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShkZWNvZGVCYXNlNjRCeXRlcyhpbnB1dCkpO1xufVxuXG5mdW5jdGlvbiBoYXNoQnl0ZXMoaW5wdXQ6IEFycmF5QnVmZmVyKTogc3RyaW5nIHtcbiAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShpbnB1dCk7XG4gIGxldCBoYXNoID0gMDtcblxuICBmb3IgKGNvbnN0IGJ5dGUgb2YgYnl0ZXMpIHtcbiAgICBoYXNoID0gKGhhc2ggKiAzMSArIGJ5dGUpIHwgMDtcbiAgfVxuXG4gIHJldHVybiBgaCR7TWF0aC5hYnMoaGFzaCl9YDtcbn1cblxuZnVuY3Rpb24gdG9IZXgoYnl0ZXM6IFVpbnQ4QXJyYXkpOiBzdHJpbmcge1xuICByZXR1cm4gQXJyYXkuZnJvbShieXRlcylcbiAgICAubWFwKChieXRlKSA9PiBieXRlLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCBcIjBcIikpXG4gICAgLmpvaW4oXCJcIik7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdpdEJsb2JTaGEoaW5wdXQ6IEFycmF5QnVmZmVyKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShpbnB1dCk7XG4gIGNvbnN0IGhlYWRlciA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShgYmxvYiAke2J5dGVzLmJ5dGVMZW5ndGh9XFwwYCk7XG4gIGNvbnN0IHBheWxvYWQgPSBuZXcgVWludDhBcnJheShoZWFkZXIuYnl0ZUxlbmd0aCArIGJ5dGVzLmJ5dGVMZW5ndGgpO1xuICBwYXlsb2FkLnNldChoZWFkZXIsIDApO1xuICBwYXlsb2FkLnNldChieXRlcywgaGVhZGVyLmJ5dGVMZW5ndGgpO1xuICBjb25zdCBkaWdlc3QgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdChcIlNIQS0xXCIsIHBheWxvYWQpO1xuICByZXR1cm4gdG9IZXgobmV3IFVpbnQ4QXJyYXkoZGlnZXN0KSk7XG59XG5cbmZ1bmN0aW9uIGlzU3luY2FibGVGaWxlKGZpbGU6IFRGaWxlKTogYm9vbGVhbiB7XG4gIGNvbnN0IG5hbWUgPSBmaWxlLm5hbWUudG9Mb3dlckNhc2UoKTtcbiAgaWYgKGlzSGlkZGVuUGF0aChmaWxlLnBhdGgpIHx8IG5hbWUuc3RhcnRzV2l0aChcIi5cIikgfHwgbmFtZSA9PT0gXCIuZHNfc3RvcmVcIiB8fCBuYW1lID09PSBcInRodW1icy5kYlwiKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzSGlkZGVuUGF0aChwYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVBhdGgocGF0aCkucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgaWYgKCFub3JtYWxpemVkKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIG5vcm1hbGl6ZWQuc3BsaXQoXCIvXCIpLnNvbWUoKHNlZ21lbnQpID0+IHNlZ21lbnQuc3RhcnRzV2l0aChcIi5cIikpO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVMb2NhbFJvb3RQYXRoKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQYXRoKHBhdGgudHJpbSgpKTtcbiAgaWYgKCFub3JtYWxpemVkIHx8IG5vcm1hbGl6ZWQgPT09IFZBVUxUX1JPT1RfUEFUSCB8fCBub3JtYWxpemVkID09PSBcIi5cIikge1xuICAgIHJldHVybiBWQVVMVF9ST09UX1BBVEg7XG4gIH1cblxuICByZXR1cm4gbm9ybWFsaXplZC5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpLnJlcGxhY2UoL1xcLyskLywgXCJcIikgfHwgVkFVTFRfUk9PVF9QQVRIO1xufVxuXG5mdW5jdGlvbiBkaXNwbGF5TG9jYWxSb290UGF0aChwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gbm9ybWFsaXplTG9jYWxSb290UGF0aChwYXRoKTtcbn1cblxuZnVuY3Rpb24gaXNJbWFnZVBhdGgocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiAvXFwuKGF2aWZ8Z2lmfGpwZT9nfHBuZ3xzdmd8d2VicCkkL2kudGVzdChwYXRoKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VSZXBvc2l0b3J5VXJsKGlucHV0OiBzdHJpbmcpOiBHaXRIdWJSZXBvIHwgbnVsbCB7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBpbnB1dC50cmltKCkucmVwbGFjZSgvXFwvJC8sIFwiXCIpLnJlcGxhY2UoL1xcLmdpdCQvLCBcIlwiKTtcbiAgY29uc3QgaHR0cHNNYXRjaCA9IC9eaHR0cHM/OlxcL1xcL2dpdGh1YlxcLmNvbVxcLyhbXi9dKylcXC8oW14vXSspJC8uZXhlYyhub3JtYWxpemVkKTtcbiAgY29uc3Qgc3NoTWF0Y2ggPSAvXmdpdEBnaXRodWJcXC5jb206KFteL10rKVxcLyhbXi9dKykkLy5leGVjKG5vcm1hbGl6ZWQpO1xuICBjb25zdCBzaG9ydGhhbmRNYXRjaCA9IC9eKFteL1xcc10rKVxcLyhbXi9cXHNdKykkLy5leGVjKG5vcm1hbGl6ZWQpO1xuICBjb25zdCBtYXRjaCA9IGh0dHBzTWF0Y2ggPz8gc3NoTWF0Y2ggPz8gc2hvcnRoYW5kTWF0Y2g7XG5cbiAgaWYgKCFtYXRjaCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBvd25lcjogbWF0Y2hbMV0sXG4gICAgcmVwbzogbWF0Y2hbMl1cbiAgfTtcbn1cblxuZnVuY3Rpb24gZW5jb2RlR2l0SHViUGF0aChwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gcGF0aC5zcGxpdChcIi9cIikubWFwKGVuY29kZVVSSUNvbXBvbmVudCkuam9pbihcIi9cIik7XG59XG5cbmZ1bmN0aW9uIGlzU2FmZUNvbnRlbnRQYXRoKHBhdGg6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGF0aChwYXRoKS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuICBjb25zdCBzZWdtZW50cyA9IG5vcm1hbGl6ZWQuc3BsaXQoXCIvXCIpO1xuICByZXR1cm4gbm9ybWFsaXplZC5zdGFydHNXaXRoKGAke1JFTU9URV9DT05URU5UX1JPT1R9L2ApICYmICFzZWdtZW50cy5zb21lKChzZWdtZW50KSA9PiBzZWdtZW50ID09PSBcIi4uXCIgfHwgc2VnbWVudCA9PT0gXCJcIik7XG59XG5cbmZ1bmN0aW9uIHRvU3RhdHVzTGFiZWwoc3RhdHVzOiBMb2NhbEZpbGVTdGF0ZVtcInN0YXR1c1wiXSk6IHN0cmluZyB7XG4gIHN3aXRjaCAoc3RhdHVzKSB7XG4gICAgY2FzZSBcInN5bmNlZFwiOlxuICAgICAgcmV0dXJuIFwiXHU1REYyXHU1NDBDXHU2QjY1XCI7XG4gICAgY2FzZSBcIm1vZGlmaWVkXCI6XG4gICAgICByZXR1cm4gXCJcdTVERjJcdTRGRUVcdTY1MzlcIjtcbiAgICBjYXNlIFwiZGVsZXRlZFwiOlxuICAgICAgcmV0dXJuIFwiXHU4RkRDXHU3QUVGXHU1REYyXHU1MjIwXHU5NjY0XCI7XG4gICAgY2FzZSBcImZhaWxlZFwiOlxuICAgICAgcmV0dXJuIFwiXHU1NDBDXHU2QjY1XHU1OTMxXHU4RDI1XCI7XG4gICAgY2FzZSBcImRyYWZ0XCI6XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBcIlx1NjcyQVx1NTQwQ1x1NkI2NVwiO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRvU3RhdHVzQ2xhc3Moc3RhdHVzOiBMb2NhbEZpbGVTdGF0ZVtcInN0YXR1c1wiXSk6IHN0cmluZyB7XG4gIHN3aXRjaCAoc3RhdHVzKSB7XG4gICAgY2FzZSBcInN5bmNlZFwiOlxuICAgICAgcmV0dXJuIFwiaXMtc3luY2VkXCI7XG4gICAgY2FzZSBcIm1vZGlmaWVkXCI6XG4gICAgICByZXR1cm4gXCJpcy1tb2RpZmllZFwiO1xuICAgIGNhc2UgXCJkZWxldGVkXCI6XG4gICAgICByZXR1cm4gXCJpcy1kZWxldGVkXCI7XG4gICAgY2FzZSBcImZhaWxlZFwiOlxuICAgICAgcmV0dXJuIFwiaXMtZmFpbGVkXCI7XG4gICAgY2FzZSBcImRyYWZ0XCI6XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBcImlzLWRyYWZ0XCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gdG9TdGF0dXNJY29uKHN0YXR1czogTG9jYWxGaWxlU3RhdGVbXCJzdGF0dXNcIl0pOiBzdHJpbmcge1xuICBzd2l0Y2ggKHN0YXR1cykge1xuICAgIGNhc2UgXCJzeW5jZWRcIjpcbiAgICAgIHJldHVybiBcImNsb3VkLWNoZWNrXCI7XG4gICAgY2FzZSBcIm1vZGlmaWVkXCI6XG4gICAgICByZXR1cm4gXCJwZW5jaWxcIjtcbiAgICBjYXNlIFwiZGVsZXRlZFwiOlxuICAgICAgcmV0dXJuIFwiY2xvdWQtb2ZmXCI7XG4gICAgY2FzZSBcImZhaWxlZFwiOlxuICAgICAgcmV0dXJuIFwiYWxlcnQtdHJpYW5nbGVcIjtcbiAgICBjYXNlIFwiZHJhZnRcIjpcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIFwiZmlsZS1wZW5cIjtcbiAgfVxufVxuXG5mdW5jdGlvbiB0b1N5bmNDZW50ZXJTdGF0dXNMYWJlbChzdGF0dXM6IFN5bmNDZW50ZXJTdGF0dXMpOiBzdHJpbmcge1xuICBzd2l0Y2ggKHN0YXR1cykge1xuICAgIGNhc2UgXCJ1bnB1Ymxpc2hlZFwiOlxuICAgICAgcmV0dXJuIFwiXHU2NzJDXHU1NzMwXHU2NzJBXHU1M0QxXHU1RTAzXCI7XG4gICAgY2FzZSBcIm1vZGlmaWVkXCI6XG4gICAgICByZXR1cm4gXCJcdTVERjJcdTRGRUVcdTY1MzlcIjtcbiAgICBjYXNlIFwicHVibGlzaGVkXCI6XG4gICAgICByZXR1cm4gXCJcdTVERjJcdTUzRDFcdTVFMDNcIjtcbiAgICBjYXNlIFwibG9jYWxEZWxldGVkXCI6XG4gICAgICByZXR1cm4gXCJcdTY3MkNcdTU3MzBcdTVERjJcdTUyMjBcdTk2NjRcIjtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHN0YXR1cztcbiAgfVxufVxuXG5mdW5jdGlvbiB0b1N5bmNDZW50ZXJTdGF0dXNDbGFzcyhzdGF0dXM6IFN5bmNDZW50ZXJTdGF0dXMpOiBzdHJpbmcge1xuICBzd2l0Y2ggKHN0YXR1cykge1xuICAgIGNhc2UgXCJ1bnB1Ymxpc2hlZFwiOlxuICAgICAgcmV0dXJuIFwiaXMtZHJhZnRcIjtcbiAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIHJldHVybiBcImlzLW1vZGlmaWVkXCI7XG4gICAgY2FzZSBcInB1Ymxpc2hlZFwiOlxuICAgICAgcmV0dXJuIFwiaXMtc3luY2VkXCI7XG4gICAgY2FzZSBcImxvY2FsRGVsZXRlZFwiOlxuICAgICAgcmV0dXJuIFwiaXMtZGVsZXRlZFwiO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gXCJpcy1kcmFmdFwiO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgc2V0dGluZ3M6IEdpdEh1YlN5bmNTZXR0aW5ncyA9IERFRkFVTFRfU0VUVElOR1M7XG4gIGRhdGE6IFBlcnNpc3RlZERhdGEgPSBERUZBVUxUX0RBVEE7XG4gIHN0YXR1c0JhckVsITogSFRNTEVsZW1lbnQ7XG4gIHN0YXR1c0Jhckljb25FbCE6IEhUTUxFbGVtZW50O1xuICBzdGF0dXNCYXJUZXh0RWwhOiBIVE1MRWxlbWVudDtcblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcblxuICAgIHRoaXMuYWRkUmliYm9uSWNvbihcImdpdC1icmFuY2hcIiwgXCJPYnNpZGlhbiBHaXQgU3luY2VyXCIsIChldnQpID0+IHtcbiAgICAgIHRoaXMuc2hvd1JpYmJvbk1lbnUoZXZ0KTtcbiAgICB9KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwib3Blbi1zeW5jLWNlbnRlclwiLFxuICAgICAgbmFtZTogXCJcdTYyNTNcdTVGMDBcdTU0MENcdTZCNjVcdTRFMkRcdTVGQzNcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB0aGlzLm9wZW5TeW5jQ2VudGVyKClcbiAgICB9KTtcblxuICAgIHRoaXMuc3RhdHVzQmFyRWwgPSB0aGlzLmFkZFN0YXR1c0Jhckl0ZW0oKTtcbiAgICB0aGlzLnN0YXR1c0JhckVsLmFkZENsYXNzKFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zdGF0dXNcIik7XG4gICAgdGhpcy5zdGF0dXNCYXJJY29uRWwgPSB0aGlzLnN0YXR1c0JhckVsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zdGF0dXMtaWNvblwiIH0pO1xuICAgIHRoaXMuc3RhdHVzQmFyVGV4dEVsID0gdGhpcy5zdGF0dXNCYXJFbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3RhdHVzLXRleHRcIiB9KTtcbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IEdpdFN5bmNlclNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJmaWxlLW9wZW5cIiwgKCkgPT4gdm9pZCB0aGlzLnJlZnJlc2hTdGF0dXNCYXIoKSkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLnZhdWx0Lm9uKFwibW9kaWZ5XCIsIChmaWxlKSA9PiB7XG4gICAgICAgIGlmIChmaWxlIGluc3RhbmNlb2YgVEZpbGUgJiYgZmlsZSA9PT0gdGhpcy5nZXRDdXJyZW50RmlsZSgpKSB7XG4gICAgICAgICAgdm9pZCB0aGlzLnJlZnJlc2hTdGF0dXNCYXIoKTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImVkaXRvci1tZW51XCIsIChtZW51KSA9PiB7XG4gICAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmdldEN1cnJlbnRGaWxlKCk7XG4gICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYWRkQXJ0aWNsZUNvbnRleHRNZW51SXRlbXMobWVudSwgZmlsZSk7XG4gICAgICB9KVxuICAgICk7XG5cbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hTdGF0dXNCYXIoKTtcbiAgfVxuXG4gIGFzeW5jIGxvYWRTZXR0aW5ncygpIHtcbiAgICBjb25zdCBzYXZlZCA9IChhd2FpdCB0aGlzLmxvYWREYXRhKCkpIGFzIHsgc2V0dGluZ3M/OiBQYXJ0aWFsPEdpdEh1YlN5bmNTZXR0aW5ncz47IGRhdGE/OiBQZXJzaXN0ZWREYXRhIH0gfCBudWxsO1xuICAgIHRoaXMuc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MsIC4uLihzYXZlZD8uc2V0dGluZ3MgPz8ge30pIH07XG4gICAgdGhpcy5kYXRhID0geyAuLi5ERUZBVUxUX0RBVEEsIC4uLihzYXZlZD8uZGF0YSA/PyB7fSkgfTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVBbGxEYXRhKCkge1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEoe1xuICAgICAgc2V0dGluZ3M6IHRoaXMuc2V0dGluZ3MsXG4gICAgICBkYXRhOiB0aGlzLmRhdGFcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gIH1cblxuICBhc3luYyBtYXJrQ29ubmVjdGlvblN0YWxlKCkge1xuICAgIHRoaXMuZGF0YS5jb25uZWN0aW9uID0ge1xuICAgICAgc3RhdHVzOiBcInN0YWxlXCIsXG4gICAgICBtZXNzYWdlOiBcIlx1OTE0RFx1N0Y2RVx1NURGMlx1NTNEOFx1NjZGNFx1RkYwQ1x1OEJGN1x1OTFDRFx1NjVCMFx1NkQ0Qlx1OEJENVx1OEZERVx1NjNBNVx1MzAwMlwiXG4gICAgfTtcbiAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gIH1cblxuICBnZXRSZXBvc2l0b3J5KCk6IEdpdEh1YlJlcG8ge1xuICAgIGNvbnN0IHJlcG9zaXRvcnkgPSBwYXJzZVJlcG9zaXRvcnlVcmwodGhpcy5zZXR0aW5ncy5yZXBvc2l0b3J5VXJsKTtcbiAgICBpZiAoIXJlcG9zaXRvcnkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkdpdEh1YiBcdTRFRDNcdTVFOTNcdTU3MzBcdTU3NDBcdTY4M0NcdTVGMEZcdTRFMERcdTZCNjNcdTc4NkVcdTMwMDJcdTY1MkZcdTYzMDEgaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8uZ2l0XHUzMDAxZ2l0QGdpdGh1Yi5jb206b3duZXIvcmVwby5naXQgXHU2MjE2IG93bmVyL3JlcG9cdTMwMDJcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlcG9zaXRvcnk7XG4gIH1cblxuICB2YWxpZGF0ZUNvbmZpZygpIHtcbiAgICB0aGlzLmdldFJlcG9zaXRvcnkoKTtcblxuICAgIGlmICghdGhpcy5zZXR0aW5ncy5naXRodWJVc2VybmFtZS50cmltKCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1OEJGN1x1NTE0OFx1NTg2Qlx1NTE5OSBHaXRIdWIgVXNlcm5hbWVcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLmdpdGh1YlRva2VuLnRyaW0oKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4QkY3XHU1MTQ4XHU1ODZCXHU1MTk5IEdpdEh1YiBUb2tlblx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4QkY3XHU1MTQ4XHU1ODZCXHU1MTk5XHU3NkVFXHU2ODA3XHU1MjA2XHU2NTJGXHUzMDAyXCIpO1xuICAgIH1cbiAgfVxuXG4gIGdldEV4aXN0aW5nRm9sZGVyKHBhdGg6IHN0cmluZyk6IFRGb2xkZXIgfCBudWxsIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplTG9jYWxSb290UGF0aChwYXRoKTtcbiAgICBpZiAobm9ybWFsaXplZCA9PT0gVkFVTFRfUk9PVF9QQVRIKSB7XG4gICAgICByZXR1cm4gdGhpcy5hcHAudmF1bHQuZ2V0Um9vdCgpO1xuICAgIH1cblxuICAgIGNvbnN0IHRhcmdldCA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChub3JtYWxpemVkKTtcbiAgICByZXR1cm4gdGFyZ2V0IGluc3RhbmNlb2YgVEZvbGRlciA/IHRhcmdldCA6IG51bGw7XG4gIH1cblxuICBnZXRBbGxWYXVsdEZvbGRlcnMoKTogVEZvbGRlcltdIHtcbiAgICBjb25zdCBmb2xkZXJzID0gbmV3IE1hcDxzdHJpbmcsIFRGb2xkZXI+KCk7XG4gICAgZm9sZGVycy5zZXQoVkFVTFRfUk9PVF9QQVRILCB0aGlzLmFwcC52YXVsdC5nZXRSb290KCkpO1xuXG4gICAgdGhpcy5hcHAudmF1bHQuZ2V0QWxsTG9hZGVkRmlsZXMoKS5mb3JFYWNoKChlbnRyeSkgPT4ge1xuICAgICAgaWYgKGVudHJ5IGluc3RhbmNlb2YgVEZvbGRlciAmJiAhaXNIaWRkZW5QYXRoKGVudHJ5LnBhdGgpKSB7XG4gICAgICAgIGZvbGRlcnMuc2V0KG5vcm1hbGl6ZUxvY2FsUm9vdFBhdGgoZW50cnkucGF0aCksIGVudHJ5KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBBcnJheS5mcm9tKGZvbGRlcnMudmFsdWVzKCkpLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgIGNvbnN0IGFQYXRoID0gZGlzcGxheUxvY2FsUm9vdFBhdGgoYS5wYXRoKTtcbiAgICAgIGNvbnN0IGJQYXRoID0gZGlzcGxheUxvY2FsUm9vdFBhdGgoYi5wYXRoKTtcblxuICAgICAgaWYgKGFQYXRoID09PSBWQVVMVF9ST09UX1BBVEgpIHtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgfVxuXG4gICAgICBpZiAoYlBhdGggPT09IFZBVUxUX1JPT1RfUEFUSCkge1xuICAgICAgICByZXR1cm4gMTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGFQYXRoLmxvY2FsZUNvbXBhcmUoYlBhdGgsIFwiemgtQ05cIik7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzZXRMb2NhbFJvb3RQYXRoKHBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVMb2NhbFJvb3RQYXRoKHBhdGgpO1xuXG4gICAgY29uc3QgZm9sZGVyID0gdGhpcy5nZXRFeGlzdGluZ0ZvbGRlcihub3JtYWxpemVkKTtcbiAgICBpZiAoIWZvbGRlcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4QkU1XHU3NkVFXHU1RjU1XHU0RTBEXHU1QjU4XHU1NzI4XHVGRjBDXHU4QkY3XHU0RUNFIFZhdWx0IFx1NEUyRFx1OTAwOVx1NjJFOVx1NURGMlx1NjcwOVx1NzZFRVx1NUY1NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICB0aGlzLnNldHRpbmdzLmxvY2FsUm9vdFBhdGggPSBub3JtYWxpemVkID09PSBWQVVMVF9ST09UX1BBVEggPyBWQVVMVF9ST09UX1BBVEggOiBmb2xkZXIucGF0aDtcbiAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5ncygpO1xuICB9XG5cbiAgZ2V0Q3VycmVudEZpbGUoKTogVEZpbGUgfCBudWxsIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICByZXR1cm4gZmlsZSBpbnN0YW5jZW9mIFRGaWxlICYmIGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIgPyBmaWxlIDogbnVsbDtcbiAgfVxuXG4gIGlzSW5zaWRlUm9vdChmaWxlOiBURmlsZSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHJvb3QgPSBub3JtYWxpemVMb2NhbFJvb3RQYXRoKHRoaXMuc2V0dGluZ3MubG9jYWxSb290UGF0aCk7XG4gICAgaWYgKHJvb3QgPT09IFZBVUxUX1JPT1RfUEFUSCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZpbGUucGF0aCA9PT0gcm9vdCB8fCBmaWxlLnBhdGguc3RhcnRzV2l0aChgJHtyb290fS9gKTtcbiAgfVxuXG4gIHJlbGF0aXZlUGF0aChmaWxlOiBURmlsZSk6IHN0cmluZyB7XG4gICAgY29uc3Qgcm9vdCA9IG5vcm1hbGl6ZUxvY2FsUm9vdFBhdGgodGhpcy5zZXR0aW5ncy5sb2NhbFJvb3RQYXRoKTtcbiAgICBjb25zdCBmdWxsUGF0aCA9IG5vcm1hbGl6ZVBhdGgoZmlsZS5wYXRoKTtcblxuICAgIGlmIChyb290ID09PSBWQVVMVF9ST09UX1BBVEgpIHtcbiAgICAgIHJldHVybiBmdWxsUGF0aDtcbiAgICB9XG5cbiAgICBpZiAoZnVsbFBhdGggPT09IHJvb3QpIHtcbiAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cblxuICAgIGlmIChmdWxsUGF0aC5zdGFydHNXaXRoKGAke3Jvb3R9L2ApKSB7XG4gICAgICByZXR1cm4gZnVsbFBhdGguc2xpY2Uocm9vdC5sZW5ndGggKyAxKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVsbFBhdGg7XG4gIH1cblxuICByZW1vdGVQYXRoKGZpbGU6IFRGaWxlKTogc3RyaW5nIHtcbiAgICBjb25zdCByZWxhdGl2ZSA9IG5vcm1hbGl6ZVBhdGgodGhpcy5yZWxhdGl2ZVBhdGgoZmlsZSkpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gICAgY29uc3QgcGF0aCA9IG5vcm1hbGl6ZVBhdGgoYCR7UkVNT1RFX0NPTlRFTlRfUk9PVH0vJHtyZWxhdGl2ZX1gKS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuXG4gICAgaWYgKCFyZWxhdGl2ZSB8fCAhaXNTYWZlQ29udGVudFBhdGgocGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1OEZEQ1x1N0FFRlx1OERFRlx1NUY4NFx1NUZDNVx1OTg3Qlx1NEY0RFx1NEU4RVx1NEVEM1x1NUU5MyBjb250ZW50IFx1NzZFRVx1NUY1NVx1NTE4NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcGF0aDtcbiAgfVxuXG4gIGxvY2FsUGF0aEZyb21SZW1vdGVQYXRoKHJlbW90ZVBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgY29uc3Qgbm9ybWFsaXplZFJlbW90ZVBhdGggPSBub3JtYWxpemVQYXRoKHJlbW90ZVBhdGgpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG5cbiAgICBpZiAoIWlzU2FmZUNvbnRlbnRQYXRoKG5vcm1hbGl6ZWRSZW1vdGVQYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4RkRDXHU3QUVGXHU4REVGXHU1Rjg0XHU1RkM1XHU5ODdCXHU0RjREXHU0RThFXHU0RUQzXHU1RTkzIGNvbnRlbnQgXHU3NkVFXHU1RjU1XHU1MTg1XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IHJlbGF0aXZlID0gbm9ybWFsaXplZFJlbW90ZVBhdGguc2xpY2UoUkVNT1RFX0NPTlRFTlRfUk9PVC5sZW5ndGggKyAxKTtcbiAgICBjb25zdCBsb2NhbFJvb3QgPSBub3JtYWxpemVMb2NhbFJvb3RQYXRoKHRoaXMuc2V0dGluZ3MubG9jYWxSb290UGF0aCk7XG4gICAgaWYgKGxvY2FsUm9vdCA9PT0gVkFVTFRfUk9PVF9QQVRIKSB7XG4gICAgICByZXR1cm4gbm9ybWFsaXplUGF0aChyZWxhdGl2ZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG5vcm1hbGl6ZVBhdGgoYCR7bG9jYWxSb290fS8ke3JlbGF0aXZlfWApO1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlRm9sZGVyUGF0aChmb2xkZXJQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGF0aChmb2xkZXJQYXRoKS5yZXBsYWNlKC9cXC8kLywgXCJcIik7XG5cbiAgICBpZiAoIW5vcm1hbGl6ZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJ0cyA9IG5vcm1hbGl6ZWQuc3BsaXQoXCIvXCIpO1xuICAgIGxldCBjdXJyZW50ID0gXCJcIjtcblxuICAgIGZvciAoY29uc3QgcGFydCBvZiBwYXJ0cykge1xuICAgICAgY3VycmVudCA9IGN1cnJlbnQgPyBgJHtjdXJyZW50fS8ke3BhcnR9YCA6IHBhcnQ7XG4gICAgICBjb25zdCBlbnRyeSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChjdXJyZW50KTtcblxuICAgICAgaWYgKGVudHJ5IGluc3RhbmNlb2YgVEZvbGRlcikge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGVudHJ5KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgXHU2NUUwXHU2Q0Q1XHU1MjFCXHU1RUZBXHU3NkVFXHU1RjU1XHVGRjBDXHU4REVGXHU1Rjg0XHU1REYyXHU4OEFCXHU2NTg3XHU0RUY2XHU1MzYwXHU3NTI4XHVGRjFBJHtjdXJyZW50fWApO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVGb2xkZXIoY3VycmVudCk7XG4gICAgfVxuICB9XG5cbiAgZ2V0U3RhdGUoZmlsZTogVEZpbGUpOiBMb2NhbEZpbGVTdGF0ZSB7XG4gICAgcmV0dXJuIHRoaXMuZGF0YS5maWxlc1tmaWxlLnBhdGhdID8/IHsgc3RhdHVzOiBcImRyYWZ0XCIgfTtcbiAgfVxuXG4gIGFzeW5jIGNhY2hlRWZmZWN0aXZlU3RhdGUoZmlsZTogVEZpbGUsIHN0YXRlOiBMb2NhbEZpbGVTdGF0ZSkge1xuICAgIGNvbnN0IGN1cnJlbnQgPSB0aGlzLmRhdGEuZmlsZXNbZmlsZS5wYXRoXTtcblxuICAgIGlmIChcbiAgICAgIGN1cnJlbnQ/LnJlbW90ZVBhdGggPT09IHN0YXRlLnJlbW90ZVBhdGggJiZcbiAgICAgIGN1cnJlbnQ/LnNoYSA9PT0gc3RhdGUuc2hhICYmXG4gICAgICBjdXJyZW50Py5zdGF0dXMgPT09IHN0YXRlLnN0YXR1cyAmJlxuICAgICAgY3VycmVudD8ubGFzdFN5bmNlZEF0ID09PSBzdGF0ZS5sYXN0U3luY2VkQXQgJiZcbiAgICAgIGN1cnJlbnQ/Lmxhc3RTeW5jZWRIYXNoID09PSBzdGF0ZS5sYXN0U3luY2VkSGFzaCAmJlxuICAgICAgY3VycmVudD8uaHRtbFVybCA9PT0gc3RhdGUuaHRtbFVybFxuICAgICkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuZGF0YS5maWxlc1tmaWxlLnBhdGhdID0gc3RhdGU7XG4gICAgYXdhaXQgdGhpcy5zYXZlQWxsRGF0YSgpO1xuICB9XG5cbiAgYXN5bmMgZ2V0RWZmZWN0aXZlU3RhdGUoZmlsZTogVEZpbGUpOiBQcm9taXNlPExvY2FsRmlsZVN0YXRlPiB7XG4gICAgbGV0IHN0YXRlID0gdGhpcy5nZXRTdGF0ZShmaWxlKTtcblxuICAgIHRyeSB7XG4gICAgICBzdGF0ZSA9IGF3YWl0IHRoaXMuc3luY0ZpbGVTdGF0ZShmaWxlKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIEtlZXAgdGhlIGxhc3QgbG9jYWwgc3RhdGUgd2hlbiBHaXRIdWIgaXMgdGVtcG9yYXJpbHkgdW5hdmFpbGFibGUuXG4gICAgfVxuXG4gICAgaWYgKHN0YXRlLnN0YXR1cyAhPT0gXCJzeW5jZWRcIiB8fCAhc3RhdGUubGFzdFN5bmNlZEhhc2gpIHtcbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBjdXJyZW50SGFzaCA9IGhhc2hDb250ZW50KGNvbnRlbnQpO1xuXG4gICAgaWYgKGN1cnJlbnRIYXNoICE9PSBzdGF0ZS5sYXN0U3luY2VkSGFzaCkge1xuICAgICAgY29uc3QgbmV4dFN0YXRlID0geyAuLi5zdGF0ZSwgc3RhdHVzOiBcIm1vZGlmaWVkXCIgYXMgY29uc3QgfTtcbiAgICAgIGF3YWl0IHRoaXMuY2FjaGVFZmZlY3RpdmVTdGF0ZShmaWxlLCBuZXh0U3RhdGUpO1xuICAgICAgcmV0dXJuIG5leHRTdGF0ZTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLmNhY2hlRWZmZWN0aXZlU3RhdGUoZmlsZSwgc3RhdGUpO1xuICAgIHJldHVybiBzdGF0ZTtcbiAgfVxuXG4gIGFzeW5jIHNldFN0YXRlKGZpbGU6IFRGaWxlLCBwYXRjaDogUGFydGlhbDxMb2NhbEZpbGVTdGF0ZT4pIHtcbiAgICB0aGlzLmRhdGEuZmlsZXNbZmlsZS5wYXRoXSA9IHsgLi4udGhpcy5nZXRTdGF0ZShmaWxlKSwgLi4ucGF0Y2ggfTtcbiAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoU3RhdHVzQmFyKCk7XG4gIH1cblxuICBzZXRTdGF0dXNCYXJTdGF0ZShzdGF0dXNDbGFzczogc3RyaW5nIHwgbnVsbCkge1xuICAgIHRoaXMuc3RhdHVzQmFyRWwucmVtb3ZlQ2xhc3MoXCJpcy1kcmFmdFwiLCBcImlzLXN5bmNlZFwiLCBcImlzLW1vZGlmaWVkXCIsIFwiaXMtZGVsZXRlZFwiLCBcImlzLWZhaWxlZFwiLCBcImlzLWluYWN0aXZlXCIpO1xuXG4gICAgaWYgKHN0YXR1c0NsYXNzKSB7XG4gICAgICB0aGlzLnN0YXR1c0JhckVsLmFkZENsYXNzKHN0YXR1c0NsYXNzKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyByZWZyZXNoU3RhdHVzQmFyKCkge1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmdldEN1cnJlbnRGaWxlKCk7XG5cbiAgICBpZiAoIWZpbGUpIHtcbiAgICAgIHRoaXMuc2V0U3RhdHVzQmFyU3RhdGUoXCJpcy1pbmFjdGl2ZVwiKTtcbiAgICAgIHNldEljb24odGhpcy5zdGF0dXNCYXJJY29uRWwsIFwiZ2l0LWJyYW5jaFwiKTtcbiAgICAgIHRoaXMuc3RhdHVzQmFyVGV4dEVsLnNldFRleHQoXCJcdTY1RTBcdTZEM0JcdTUyQThcdTY1ODdcdTdBRTBcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLmlzSW5zaWRlUm9vdChmaWxlKSkge1xuICAgICAgdGhpcy5zZXRTdGF0dXNCYXJTdGF0ZShcImlzLWluYWN0aXZlXCIpO1xuICAgICAgc2V0SWNvbih0aGlzLnN0YXR1c0Jhckljb25FbCwgXCJnaXQtYnJhbmNoXCIpO1xuICAgICAgdGhpcy5zdGF0dXNCYXJUZXh0RWwuc2V0VGV4dChcIlx1NEUwRFx1NTcyOFx1NTQwQ1x1NkI2NVx1NzZFRVx1NUY1NVwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzdGF0ZSA9IGF3YWl0IHRoaXMuZ2V0RWZmZWN0aXZlU3RhdGUoZmlsZSk7XG4gICAgY29uc3QgbGFiZWwgPSB0b1N0YXR1c0xhYmVsKHN0YXRlLnN0YXR1cyk7XG4gICAgdGhpcy5zZXRTdGF0dXNCYXJTdGF0ZSh0b1N0YXR1c0NsYXNzKHN0YXRlLnN0YXR1cykpO1xuXG4gICAgc2V0SWNvbih0aGlzLnN0YXR1c0Jhckljb25FbCwgdG9TdGF0dXNJY29uKHN0YXRlLnN0YXR1cykpO1xuICAgIHRoaXMuc3RhdHVzQmFyVGV4dEVsLnNldFRleHQobGFiZWwpO1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlVGVtcGxhdGVGcm9udG1hdHRlcihmaWxlOiBURmlsZSkge1xuICAgIGlmICghdGhpcy5pc0luc2lkZVJvb3QoZmlsZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1NUY1M1x1NTI0RFx1NjU4N1x1N0FFMFx1NEUwRFx1NTcyOCBMb2NhbCBSb290IFBhdGggXHU1MTg1XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlRnJvbnRtYXR0ZXIoY29udGVudCk7XG5cbiAgICBpZiAoT2JqZWN0LmtleXMocGFyc2VkLmRhdGEpLmxlbmd0aCA+IDApIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJcdTVGNTNcdTUyNERcdTY1ODdcdTdBRTBcdTVERjJcdTdFQ0ZcdTVCNThcdTU3MjhcdTY1ODdcdTdBRTBcdTVDNUVcdTYwMjdcdTMwMDJcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgbmV4dENvbnRlbnQgPSBgJHtidWlsZEZyb250bWF0dGVyKGZpbGUpfSR7Y29udGVudH1gO1xuICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBuZXh0Q29udGVudCk7XG4gICAgbmV3IE5vdGljZShcIlx1NjU4N1x1N0FFMFx1NUM1RVx1NjAyN1x1NURGMlx1NjNEMlx1NTE2NVx1MzAwMlwiKTtcbiAgfVxuXG4gIGdldFN5bmNNZW51VGl0bGUoc3RhdGU6IExvY2FsRmlsZVN0YXRlKTogc3RyaW5nIHtcbiAgICBzd2l0Y2ggKHN0YXRlLnN0YXR1cykge1xuICAgICAgY2FzZSBcIm1vZGlmaWVkXCI6XG4gICAgICBjYXNlIFwiZGVsZXRlZFwiOlxuICAgICAgICByZXR1cm4gXCJcdTkxQ0RcdTY1QjBcdTU0MENcdTZCNjVcIjtcbiAgICAgIGNhc2UgXCJmYWlsZWRcIjpcbiAgICAgICAgcmV0dXJuIFwiXHU1MThEXHU2QjIxXHU1NDBDXHU2QjY1XCI7XG4gICAgICBjYXNlIFwic3luY2VkXCI6XG4gICAgICAgIHJldHVybiBcIlx1NURGMlx1NTQwQ1x1NkI2NVwiO1xuICAgICAgY2FzZSBcImRyYWZ0XCI6XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gXCJcdTU0MENcdTZCNjVcdTUyMzAgR2l0SHViXCI7XG4gICAgfVxuICB9XG5cbiAgYnVpbGRBY3Rpb25Db250ZXh0KGZpbGU6IFRGaWxlLCBzdGF0ZTogTG9jYWxGaWxlU3RhdGUsIGhhc1Byb3BlcnRpZXM6IGJvb2xlYW4pOiBBcnRpY2xlQWN0aW9uQ29udGV4dCB7XG4gICAgY29uc3QgaW5Sb290ID0gdGhpcy5pc0luc2lkZVJvb3QoZmlsZSk7XG4gICAgY29uc3Qgc3luY1RpdGxlID0gdGhpcy5nZXRTeW5jTWVudVRpdGxlKHN0YXRlKTtcblxuICAgIHJldHVybiB7XG4gICAgICBmaWxlLFxuICAgICAgaW5Sb290LFxuICAgICAgaGFzUHJvcGVydGllcyxcbiAgICAgIHN0YXRlLFxuICAgICAgc3luY1RpdGxlLFxuICAgICAgY2FuU3luYzogaW5Sb290ICYmIHN0YXRlLnN0YXR1cyAhPT0gXCJzeW5jZWRcIixcbiAgICAgIGNhbkRlbGV0ZVJlbW90ZTogQm9vbGVhbihzdGF0ZS5zaGEpICYmIHN0YXRlLnN0YXR1cyAhPT0gXCJkZWxldGVkXCIsXG4gICAgICBjYW5PcGVuUmVtb3RlOiBCb29sZWFuKHN0YXRlLmh0bWxVcmwgfHwgc3RhdGUucmVtb3RlUGF0aCkgJiYgc3RhdGUuc3RhdHVzICE9PSBcImRlbGV0ZWRcIixcbiAgICAgIGNhbkluc2VydFByb3BlcnRpZXM6IGluUm9vdCAmJiAhaGFzUHJvcGVydGllc1xuICAgIH07XG4gIH1cblxuICBhc3luYyBnZXRBY3Rpb25Db250ZXh0KGZpbGU6IFRGaWxlKTogUHJvbWlzZTxBcnRpY2xlQWN0aW9uQ29udGV4dD4ge1xuICAgIGNvbnN0IFtzdGF0ZSwgY29udGVudF0gPSBhd2FpdCBQcm9taXNlLmFsbChbdGhpcy5nZXRFZmZlY3RpdmVTdGF0ZShmaWxlKSwgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKV0pO1xuICAgIGNvbnN0IHByb3BlcnRpZXMgPSBwYXJzZUZyb250bWF0dGVyKGNvbnRlbnQpLmRhdGE7XG4gICAgcmV0dXJuIHRoaXMuYnVpbGRBY3Rpb25Db250ZXh0KGZpbGUsIHN0YXRlLCBPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKS5sZW5ndGggPiAwKTtcbiAgfVxuXG4gIGdldENhY2hlZEFjdGlvbkNvbnRleHQoZmlsZTogVEZpbGUpOiBBcnRpY2xlQWN0aW9uQ29udGV4dCB7XG4gICAgY29uc3QgcHJvcGVydGllcyA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5mcm9udG1hdHRlciA/PyB7fTtcbiAgICBjb25zdCBzdGF0ZSA9IHRoaXMuZ2V0U3RhdGUoZmlsZSk7XG4gICAgcmV0dXJuIHRoaXMuYnVpbGRBY3Rpb25Db250ZXh0KGZpbGUsIHN0YXRlLCBPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKS5sZW5ndGggPiAwKTtcbiAgfVxuXG4gIGFzeW5jIHNob3dSaWJib25NZW51KGV2dDogTW91c2VFdmVudCkge1xuICAgIGNvbnN0IG1lbnUgPSBuZXcgTWVudSgpO1xuICAgIGNvbnN0IGN1cnJlbnRGaWxlID0gdGhpcy5nZXRDdXJyZW50RmlsZSgpO1xuICAgIGNvbnN0IGNvbnRleHQgPSBjdXJyZW50RmlsZSA/IGF3YWl0IHRoaXMuZ2V0QWN0aW9uQ29udGV4dChjdXJyZW50RmlsZSkgOiBudWxsO1xuXG4gICAgbWVudS5zZXRVc2VOYXRpdmVNZW51KHRydWUpO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKGNvbnRleHQ/LnN5bmNUaXRsZSA/PyBcIlx1NTQwQ1x1NkI2NVx1NTIzMCBHaXRIdWJcIilcbiAgICAgICAgLnNldEljb24oXCJjbG91ZC11cGxvYWRcIilcbiAgICAgICAgLnNldERpc2FibGVkKCFjb250ZXh0Py5jYW5TeW5jKVxuICAgICAgICAub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbnRleHQpIHtcbiAgICAgICAgICAgIHZvaWQgdGhpcy5ydW5XaXRoTm90aWNlKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5zeW5jRmlsZVRvR2l0SHViKGNvbnRleHQuZmlsZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIlx1NTQwQ1x1NkI2NVx1NEUyRFx1NUZDM1wiKVxuICAgICAgICAuc2V0SWNvbihcImxpc3QtdHJlZVwiKVxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLm9wZW5TeW5jQ2VudGVyKCkpXG4gICAgKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIlx1NjI1M1x1NUYwMCBHaXRIdWJcIilcbiAgICAgICAgLnNldEljb24oXCJleHRlcm5hbC1saW5rXCIpXG4gICAgICAgIC5zZXREaXNhYmxlZCghY29udGV4dD8uY2FuT3BlblJlbW90ZSlcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xuICAgICAgICAgIGlmIChjb250ZXh0KSB7XG4gICAgICAgICAgICB2b2lkIHRoaXMucnVuV2l0aE5vdGljZSgoKSA9PiB0aGlzLm9wZW5SZW1vdGVVcmxGb3JGaWxlKGNvbnRleHQuZmlsZSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICApO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiXHU2M0QyXHU1MTY1XHU2NTg3XHU3QUUwXHU1QzVFXHU2MDI3XCIpXG4gICAgICAgIC5zZXRJY29uKFwiZmlsZS1wbHVzLTJcIilcbiAgICAgICAgLnNldERpc2FibGVkKCFjb250ZXh0Py5jYW5JbnNlcnRQcm9wZXJ0aWVzKVxuICAgICAgICAub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbnRleHQpIHtcbiAgICAgICAgICAgIHZvaWQgdGhpcy5ydW5XaXRoTm90aWNlKCgpID0+IHRoaXMuZW5zdXJlVGVtcGxhdGVGcm9udG1hdHRlcihjb250ZXh0LmZpbGUpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgKTtcbiAgICBtZW51LmFkZFNlcGFyYXRvcigpO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKGNvbnRleHQ/LnN0YXRlLnN0YXR1cyA9PT0gXCJkZWxldGVkXCIgPyBcIlx1OEZEQ1x1N0FFRlx1NURGMlx1NTIyMFx1OTY2NFwiIDogXCJcdTUyMjBcdTk2NjRcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcIilcbiAgICAgICAgLnNldEljb24oXCJjbG91ZC1vZmZcIilcbiAgICAgICAgLnNldFdhcm5pbmcodHJ1ZSlcbiAgICAgICAgLnNldERpc2FibGVkKCFjb250ZXh0Py5jYW5EZWxldGVSZW1vdGUpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICBpZiAoY29udGV4dCkge1xuICAgICAgICAgICAgdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoKCkgPT4gdGhpcy5kZWxldGVSZW1vdGVGaWxlKGNvbnRleHQuZmlsZSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICApO1xuICAgIG1lbnUuYWRkU2VwYXJhdG9yKCk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJcdTZENEJcdThCRDUgR2l0SHViIFx1OEZERVx1NjNBNVwiKVxuICAgICAgICAuc2V0SWNvbihcImdsb2JlXCIpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+XG4gICAgICAgICAgdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy50ZXN0Q29ubmVjdGlvbigpO1xuICAgICAgICAgIH0pXG4gICAgICAgIClcbiAgICApO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiXHU4QkJFXHU3RjZFXCIpXG4gICAgICAgIC5zZXRJY29uKFwic2V0dGluZ3NcIilcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdGhpcy5vcGVuUGx1Z2luU2V0dGluZ3MoKSlcbiAgICApO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKGBcdTcyNDhcdTY3MkMgdiR7dGhpcy5tYW5pZmVzdC52ZXJzaW9ufWApXG4gICAgICAgIC5zZXRJY29uKFwiaW5mb1wiKVxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLm9wZW5WZXJzaW9uSW5mbygpKVxuICAgICk7XG4gICAgbWVudS5zaG93QXRNb3VzZUV2ZW50KGV2dCk7XG4gIH1cblxuICBhZGRBcnRpY2xlQ29udGV4dE1lbnVJdGVtcyhtZW51OiBNZW51LCBmaWxlOiBURmlsZSkge1xuICAgIGNvbnN0IGNvbnRleHQgPSB0aGlzLmdldENhY2hlZEFjdGlvbkNvbnRleHQoZmlsZSk7XG5cbiAgICBtZW51LmFkZFNlcGFyYXRvcigpO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKGNvbnRleHQuc3luY1RpdGxlKVxuICAgICAgICAuc2V0SWNvbihcImNsb3VkLXVwbG9hZFwiKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQuY2FuU3luYylcbiAgICAgICAgLm9uQ2xpY2soKCkgPT5cbiAgICAgICAgICB2b2lkIHRoaXMucnVuV2l0aE5vdGljZShhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnN5bmNGaWxlVG9HaXRIdWIoY29udGV4dC5maWxlKTtcbiAgICAgICAgICB9KVxuICAgICAgICApXG4gICAgKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIlx1NjI1M1x1NUYwMCBHaXRIdWJcIilcbiAgICAgICAgLnNldEljb24oXCJleHRlcm5hbC1saW5rXCIpXG4gICAgICAgIC5zZXREaXNhYmxlZCghY29udGV4dC5jYW5PcGVuUmVtb3RlKVxuICAgICAgICAub25DbGljaygoKSA9PiB2b2lkIHRoaXMucnVuV2l0aE5vdGljZSgoKSA9PiB0aGlzLm9wZW5SZW1vdGVVcmxGb3JGaWxlKGNvbnRleHQuZmlsZSkpKVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJcdTYzRDJcdTUxNjVcdTY1ODdcdTdBRTBcdTVDNUVcdTYwMjdcIilcbiAgICAgICAgLnNldEljb24oXCJmaWxlLXBsdXMtMlwiKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQuY2FuSW5zZXJ0UHJvcGVydGllcylcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoKCkgPT4gdGhpcy5lbnN1cmVUZW1wbGF0ZUZyb250bWF0dGVyKGNvbnRleHQuZmlsZSkpKVxuICAgICk7XG4gICAgbWVudS5hZGRTZXBhcmF0b3IoKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShjb250ZXh0LnN0YXRlLnN0YXR1cyA9PT0gXCJkZWxldGVkXCIgPyBcIlx1OEZEQ1x1N0FFRlx1NURGMlx1NTIyMFx1OTY2NFwiIDogXCJcdTUyMjBcdTk2NjRcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcIilcbiAgICAgICAgLnNldEljb24oXCJjbG91ZC1vZmZcIilcbiAgICAgICAgLnNldFdhcm5pbmcodHJ1ZSlcbiAgICAgICAgLnNldERpc2FibGVkKCFjb250ZXh0LmNhbkRlbGV0ZVJlbW90ZSlcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoKCkgPT4gdGhpcy5kZWxldGVSZW1vdGVGaWxlKGNvbnRleHQuZmlsZSkpKVxuICAgICk7XG4gIH1cblxuICBvcGVuUGx1Z2luU2V0dGluZ3MoKSB7XG4gICAgY29uc3QgaW50ZXJuYWxBcHAgPSB0aGlzLmFwcCBhcyBBcHAgJiB7XG4gICAgICBzZXR0aW5nPzoge1xuICAgICAgICBvcGVuOiAoKSA9PiB2b2lkO1xuICAgICAgICBvcGVuVGFiQnlJZD86IChpZDogc3RyaW5nKSA9PiB2b2lkO1xuICAgICAgfTtcbiAgICB9O1xuXG4gICAgaWYgKCFpbnRlcm5hbEFwcC5zZXR0aW5nKSB7XG4gICAgICBuZXcgTm90aWNlKFwiXHU1RjUzXHU1MjREXHU3M0FGXHU1ODgzXHU0RTBEXHU2NTJGXHU2MzAxXHU3NkY0XHU2M0E1XHU4REYzXHU4RjZDXHU2M0QyXHU0RUY2XHU4QkJFXHU3RjZFXHUzMDAyXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGludGVybmFsQXBwLnNldHRpbmcub3BlbigpO1xuICAgIGludGVybmFsQXBwLnNldHRpbmcub3BlblRhYkJ5SWQ/Lih0aGlzLm1hbmlmZXN0LmlkKTtcbiAgfVxuXG4gIG9wZW5WZXJzaW9uSW5mbygpIHtcbiAgICBuZXcgUGx1Z2luVmVyc2lvbk1vZGFsKHRoaXMuYXBwLCB0aGlzKS5vcGVuKCk7XG4gIH1cblxuICBvcGVuU3luY0NlbnRlcigpIHtcbiAgICBuZXcgU3luY0NlbnRlck1vZGFsKHRoaXMuYXBwLCB0aGlzKS5vcGVuKCk7XG4gIH1cblxuICBhc3luYyBydW5XaXRoTm90aWNlKGFjdGlvbjogKCkgPT4gUHJvbWlzZTx2b2lkPikge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBhY3Rpb24oKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJcdTY3MkFcdTc3RTVcdTk1MTlcdThCRUZcIjtcbiAgICAgIG5ldyBOb3RpY2UobWVzc2FnZSk7XG4gICAgfVxuICB9XG5cbiAgYnVpbGRHaXRIdWJBcGlVcmwocGF0aDogc3RyaW5nLCBwYXJhbXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+KTogc3RyaW5nIHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKGBodHRwczovL2FwaS5naXRodWIuY29tJHtwYXRofWApO1xuXG4gICAgT2JqZWN0LmVudHJpZXMocGFyYW1zID8/IHt9KS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcbiAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICB1cmwuc2VhcmNoUGFyYW1zLnNldChrZXksIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiB1cmwudG9TdHJpbmcoKTtcbiAgfVxuXG4gIGJ1aWxkQ29udGVudEFwaVBhdGgocmVtb3RlUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5nZXRSZXBvc2l0b3J5KCk7XG4gICAgcmV0dXJuIGAvcmVwb3MvJHtlbmNvZGVVUklDb21wb25lbnQocmVwb3NpdG9yeS5vd25lcil9LyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlcG9zaXRvcnkucmVwbyl9L2NvbnRlbnRzLyR7ZW5jb2RlR2l0SHViUGF0aChyZW1vdGVQYXRoKX1gO1xuICB9XG5cbiAgYnVpbGRSZXBvQXBpUGF0aCgpOiBzdHJpbmcge1xuICAgIGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLmdldFJlcG9zaXRvcnkoKTtcbiAgICByZXR1cm4gYC9yZXBvcy8ke2VuY29kZVVSSUNvbXBvbmVudChyZXBvc2l0b3J5Lm93bmVyKX0vJHtlbmNvZGVVUklDb21wb25lbnQocmVwb3NpdG9yeS5yZXBvKX1gO1xuICB9XG5cbiAgYnVpbGRCcmFuY2hBcGlQYXRoKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGAke3RoaXMuYnVpbGRSZXBvQXBpUGF0aCgpfS9icmFuY2hlcy8ke2VuY29kZVVSSUNvbXBvbmVudCh0aGlzLnNldHRpbmdzLmJyYW5jaC50cmltKCkpfWA7XG4gIH1cblxuICBidWlsZEdpdFRyZWVBcGlQYXRoKCk6IHN0cmluZyB7XG4gICAgY29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuZ2V0UmVwb3NpdG9yeSgpO1xuICAgIHJldHVybiBgL3JlcG9zLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlcG9zaXRvcnkub3duZXIpfS8ke2VuY29kZVVSSUNvbXBvbmVudChyZXBvc2l0b3J5LnJlcG8pfS9naXQvdHJlZXMvJHtlbmNvZGVVUklDb21wb25lbnQodGhpcy5zZXR0aW5ncy5icmFuY2gudHJpbSgpKX1gO1xuICB9XG5cbiAgYnVpbGRHaXRIdWJCbG9iVXJsKHJlbW90ZVBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgY29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuZ2V0UmVwb3NpdG9yeSgpO1xuICAgIHJldHVybiBgaHR0cHM6Ly9naXRodWIuY29tLyR7cmVwb3NpdG9yeS5vd25lcn0vJHtyZXBvc2l0b3J5LnJlcG99L2Jsb2IvJHtlbmNvZGVVUklDb21wb25lbnQodGhpcy5zZXR0aW5ncy5icmFuY2gudHJpbSgpKX0vJHtlbmNvZGVHaXRIdWJQYXRoKHJlbW90ZVBhdGgpfWA7XG4gIH1cblxuICBhc3luYyBnaXRodWJSZXF1ZXN0PFRSZXNwb25zZT4oXG4gICAgbWV0aG9kOiBcIkdFVFwiIHwgXCJQVVRcIiB8IFwiREVMRVRFXCIsXG4gICAgcGF0aDogc3RyaW5nLFxuICAgIHBheWxvYWQ/OiB1bmtub3duLFxuICAgIHBhcmFtcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD5cbiAgKTogUHJvbWlzZTxUUmVzcG9uc2U+IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkR2l0SHViQXBpVXJsKHBhdGgsIHBhcmFtcyksXG4gICAgICBtZXRob2QsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEFjY2VwdDogXCJhcHBsaWNhdGlvbi92bmQuZ2l0aHViK2pzb25cIixcbiAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3RoaXMuc2V0dGluZ3MuZ2l0aHViVG9rZW4udHJpbSgpfWAsXG4gICAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICAgICAgICBcIlgtR2l0SHViLUFwaS1WZXJzaW9uXCI6IFwiMjAyMi0xMS0yOFwiXG4gICAgICB9LFxuICAgICAgYm9keTogcGF5bG9hZCA/IEpTT04uc3RyaW5naWZ5KHBheWxvYWQpIDogdW5kZWZpbmVkXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID49IDQwMCkge1xuICAgICAgbGV0IGVycm9yTWVzc2FnZSA9IHJlc3BvbnNlLnRleHQ7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmVzcG9uc2UudGV4dCkgYXMgR2l0SHViRXJyb3JQYXlsb2FkO1xuICAgICAgICBpZiAocGFyc2VkLm1lc3NhZ2UpIHtcbiAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBwYXJzZWQubWVzc2FnZTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIEtlZXAgcmF3IHJlc3BvbnNlIHRleHQgd2hlbiBpdCBpcyBub3QgSlNPTi5cbiAgICAgIH1cblxuICAgICAgdGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcihyZXNwb25zZS5zdGF0dXMsIGVycm9yTWVzc2FnZSB8fCBgR2l0SHViIEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9YCwgbWV0aG9kLCBwYXRoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzcG9uc2UuanNvbiBhcyBUUmVzcG9uc2U7XG4gIH1cblxuICBhc3luYyBnZXRSZW1vdGVDb250ZW50KHJlbW90ZVBhdGg6IHN0cmluZyk6IFByb21pc2U8R2l0SHViQ29udGVudFJlc3BvbnNlIHwgbnVsbD4ge1xuICAgIGlmICghaXNTYWZlQ29udGVudFBhdGgocmVtb3RlUGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1OEZEQ1x1N0FFRlx1OERFRlx1NUY4NFx1NUZDNVx1OTg3Qlx1NEY0RFx1NEU4RVx1NEVEM1x1NUU5MyBjb250ZW50IFx1NzZFRVx1NUY1NVx1NTE4NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJSZXF1ZXN0PEdpdEh1YkNvbnRlbnRSZXNwb25zZSB8IEdpdEh1YkNvbnRlbnRSZXNwb25zZVtdPihcbiAgICAgICAgXCJHRVRcIixcbiAgICAgICAgdGhpcy5idWlsZENvbnRlbnRBcGlQYXRoKHJlbW90ZVBhdGgpLFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIHsgcmVmOiB0aGlzLnNldHRpbmdzLmJyYW5jaC50cmltKCkgfVxuICAgICAgKTtcblxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmVzdWx0KSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdThGRENcdTdBRUZcdThERUZcdTVGODRcdTYzMDdcdTU0MTFcdTc2RUVcdTVGNTVcdUZGMENcdTRFMERcdTgwRkRcdTRGNUNcdTRFM0FcdTY1ODdcdTdBRTBcdTU0MENcdTZCNjVcdTc2RUVcdTY4MDdcdTMwMDJcIik7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXN1bHQudHlwZSAhPT0gXCJmaWxlXCIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4RkRDXHU3QUVGXHU4REVGXHU1Rjg0XHU0RTBEXHU2NjJGXHU2NjZFXHU5MDFBXHU2NTg3XHU0RUY2XHVGRjBDXHU0RTBEXHU4MEZEXHU0RjVDXHU0RTNBXHU2NTg3XHU3QUUwXHU1NDBDXHU2QjY1XHU3NkVFXHU2ODA3XHUzMDAyXCIpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBHaXRIdWJSZXF1ZXN0RXJyb3IgJiYgZXJyb3Iuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGdldFJlbW90ZUZpbGVCeXRlcyhyZW1vdGVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHsgY29udGVudDogVWludDhBcnJheTsgcmVtb3RlOiBHaXRIdWJDb250ZW50UmVzcG9uc2UgfT4ge1xuICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuZ2V0UmVtb3RlQ29udGVudChyZW1vdGVQYXRoKTtcblxuICAgIGlmICghcmVtb3RlKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFx1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlx1NEUwRFx1NUI1OFx1NTcyOFx1RkYxQSR7cmVtb3RlUGF0aH1gKTtcbiAgICB9XG5cbiAgICBpZiAocmVtb3RlLmVuY29kaW5nICE9PSBcImJhc2U2NFwiIHx8ICFyZW1vdGUuY29udGVudCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcdTUxODVcdTVCQjlcdTdGMTZcdTc4MDFcdTRFMERcdTUzRDdcdTY1MkZcdTYzMDFcdUZGMUEke3JlbW90ZVBhdGh9YCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNvbnRlbnQ6IGRlY29kZUJhc2U2NEJ5dGVzKHJlbW90ZS5jb250ZW50KSxcbiAgICAgIHJlbW90ZVxuICAgIH07XG4gIH1cblxuICBhc3luYyBwdWxsUmVtb3RlRmlsZShyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICB0aGlzLnZhbGlkYXRlQ29uZmlnKCk7XG5cbiAgICBjb25zdCB7IGNvbnRlbnQsIHJlbW90ZSB9ID0gYXdhaXQgdGhpcy5nZXRSZW1vdGVGaWxlQnl0ZXMocmVtb3RlUGF0aCk7XG4gICAgY29uc3QgbG9jYWxQYXRoID0gdGhpcy5sb2NhbFBhdGhGcm9tUmVtb3RlUGF0aChyZW1vdGVQYXRoKTtcbiAgICBjb25zdCBwYXJlbnRQYXRoID0gbG9jYWxQYXRoLmluY2x1ZGVzKFwiL1wiKSA/IGxvY2FsUGF0aC5zbGljZSgwLCBsb2NhbFBhdGgubGFzdEluZGV4T2YoXCIvXCIpKSA6IFwiXCI7XG4gICAgYXdhaXQgdGhpcy5lbnN1cmVGb2xkZXJQYXRoKHBhcmVudFBhdGgpO1xuXG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgobG9jYWxQYXRoKTtcbiAgICBjb25zdCBpc01hcmtkb3duID0gbG9jYWxQYXRoLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoXCIubWRcIik7XG4gICAgY29uc3QgdGV4dENvbnRlbnQgPSBpc01hcmtkb3duID8gbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGNvbnRlbnQpIDogXCJcIjtcbiAgICBsZXQgZmlsZTogVEZpbGU7XG5cbiAgICBpZiAoZXhpc3RpbmcgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgaWYgKGlzTWFya2Rvd24pIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGV4aXN0aW5nLCB0ZXh0Q29udGVudCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnlCaW5hcnkoZXhpc3RpbmcsIGNvbnRlbnQuYnVmZmVyLnNsaWNlKGNvbnRlbnQuYnl0ZU9mZnNldCwgY29udGVudC5ieXRlT2Zmc2V0ICsgY29udGVudC5ieXRlTGVuZ3RoKSk7XG4gICAgICB9XG4gICAgICBmaWxlID0gZXhpc3Rpbmc7XG4gICAgfSBlbHNlIGlmIChleGlzdGluZykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBcdTY1RTBcdTZDRDVcdTYyQzlcdTUzRDZcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcdUZGMENcdTY3MkNcdTU3MzBcdThERUZcdTVGODRcdTVERjJcdTg4QUJcdTc2RUVcdTVGNTVcdTUzNjBcdTc1MjhcdUZGMUEke2xvY2FsUGF0aH1gKTtcbiAgICB9IGVsc2UgaWYgKGlzTWFya2Rvd24pIHtcbiAgICAgIGZpbGUgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGUobG9jYWxQYXRoLCB0ZXh0Q29udGVudCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZpbGUgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVCaW5hcnkobG9jYWxQYXRoLCBjb250ZW50LmJ1ZmZlci5zbGljZShjb250ZW50LmJ5dGVPZmZzZXQsIGNvbnRlbnQuYnl0ZU9mZnNldCArIGNvbnRlbnQuYnl0ZUxlbmd0aCkpO1xuICAgIH1cblxuICAgIHRoaXMuZGF0YS5maWxlc1tmaWxlLnBhdGhdID0ge1xuICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIHNoYTogcmVtb3RlLnNoYSxcbiAgICAgIHN0YXR1czogXCJzeW5jZWRcIixcbiAgICAgIGxhc3RTeW5jZWRBdDogZm9ybWF0RGF0ZVRpbWUobmV3IERhdGUoKSksXG4gICAgICBsYXN0U3luY2VkSGFzaDogaXNNYXJrZG93biA/IGhhc2hDb250ZW50KHRleHRDb250ZW50KSA6IGhhc2hCeXRlcyhjb250ZW50LmJ1ZmZlci5zbGljZShjb250ZW50LmJ5dGVPZmZzZXQsIGNvbnRlbnQuYnl0ZU9mZnNldCArIGNvbnRlbnQuYnl0ZUxlbmd0aCkpLFxuICAgICAgaHRtbFVybDogcmVtb3RlLmh0bWxfdXJsID8/IHRoaXMuYnVpbGRHaXRIdWJCbG9iVXJsKHJlbW90ZVBhdGgpXG4gICAgfTtcbiAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoU3RhdHVzQmFyKCk7XG4gIH1cblxuICBjb2xsZWN0U3luY2FibGVGaWxlcyhmb2xkZXI6IFRGb2xkZXIsIGZpbGVzOiBURmlsZVtdID0gW10pOiBURmlsZVtdIHtcbiAgICBmb2xkZXIuY2hpbGRyZW4uZm9yRWFjaCgoZW50cnkpID0+IHtcbiAgICAgIGlmIChlbnRyeSBpbnN0YW5jZW9mIFRGaWxlICYmIGlzU3luY2FibGVGaWxlKGVudHJ5KSkge1xuICAgICAgICBmaWxlcy5wdXNoKGVudHJ5KTtcbiAgICAgIH0gZWxzZSBpZiAoZW50cnkgaW5zdGFuY2VvZiBURm9sZGVyICYmICFpc0hpZGRlblBhdGgoZW50cnkucGF0aCkpIHtcbiAgICAgICAgdGhpcy5jb2xsZWN0U3luY2FibGVGaWxlcyhlbnRyeSwgZmlsZXMpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGZpbGVzO1xuICB9XG5cbiAgZ2V0TG9jYWxTeW5jYWJsZUZpbGVzKCk6IFRGaWxlW10ge1xuICAgIGNvbnN0IHJvb3QgPSB0aGlzLmdldEV4aXN0aW5nRm9sZGVyKHRoaXMuc2V0dGluZ3MubG9jYWxSb290UGF0aCk7XG4gICAgaWYgKCFyb290KSB7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuY29sbGVjdFN5bmNhYmxlRmlsZXMocm9vdClcbiAgICAgIC5maWx0ZXIoKGZpbGUpID0+IHRoaXMuaXNJbnNpZGVSb290KGZpbGUpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEucGF0aC5sb2NhbGVDb21wYXJlKGIucGF0aCwgXCJ6aC1DTlwiKSk7XG4gIH1cblxuICBhc3luYyBnZXRSZW1vdGVTeW5jYWJsZUZpbGVzKCk6IFByb21pc2U8TWFwPHN0cmluZywgUmVtb3RlU3luY0ZpbGU+PiB7XG4gICAgdGhpcy52YWxpZGF0ZUNvbmZpZygpO1xuXG4gICAgY29uc3QgdHJlZSA9IGF3YWl0IHRoaXMuZ2l0aHViUmVxdWVzdDxHaXRIdWJUcmVlUmVzcG9uc2U+KFwiR0VUXCIsIHRoaXMuYnVpbGRHaXRUcmVlQXBpUGF0aCgpLCB1bmRlZmluZWQsIHtcbiAgICAgIHJlY3Vyc2l2ZTogXCIxXCJcbiAgICB9KTtcblxuICAgIGlmICh0cmVlLnRydW5jYXRlZCkge1xuICAgICAgbmV3IE5vdGljZShcIkdpdEh1YiBcdThGRDRcdTU2REVcdTc2ODRcdThGRENcdTdBRUZcdTc2RUVcdTVGNTVcdTY4MTFcdTg4QUJcdTYyMkFcdTY1QURcdUZGMENcdTUyMTdcdTg4NjhcdTUzRUZcdTgwRkRcdTRFMERcdTVCOENcdTY1NzRcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgY29uc3QgcmVtb3RlRmlsZXMgPSBuZXcgTWFwPHN0cmluZywgUmVtb3RlU3luY0ZpbGU+KCk7XG5cbiAgICB0cmVlLnRyZWUuZm9yRWFjaCgoZW50cnkpID0+IHtcbiAgICAgIGNvbnN0IGZpbGVOYW1lID0gZW50cnkucGF0aC5zcGxpdChcIi9cIikucG9wKCkgPz8gXCJcIjtcbiAgICAgIGlmIChlbnRyeS50eXBlICE9PSBcImJsb2JcIiB8fCAhZW50cnkucGF0aC5zdGFydHNXaXRoKGAke1JFTU9URV9DT05URU5UX1JPT1R9L2ApIHx8IGZpbGVOYW1lLnN0YXJ0c1dpdGgoXCIuXCIpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKCFpc1NhZmVDb250ZW50UGF0aChlbnRyeS5wYXRoKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHJlbW90ZUZpbGVzLnNldChlbnRyeS5wYXRoLCB7XG4gICAgICAgIHJlbW90ZVBhdGg6IGVudHJ5LnBhdGgsXG4gICAgICAgIHNoYTogZW50cnkuc2hhLFxuICAgICAgICBodG1sVXJsOiB0aGlzLmJ1aWxkR2l0SHViQmxvYlVybChlbnRyeS5wYXRoKVxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcmVtb3RlRmlsZXM7XG4gIH1cblxuICBhc3luYyBidWlsZFN5bmNDZW50ZXJJdGVtcygpOiBQcm9taXNlPFN5bmNDZW50ZXJJdGVtW10+IHtcbiAgICB0aGlzLnZhbGlkYXRlQ29uZmlnKCk7XG5cbiAgICBjb25zdCBbcmVtb3RlRmlsZXMsIGxvY2FsRmlsZXNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgdGhpcy5nZXRSZW1vdGVTeW5jYWJsZUZpbGVzKCksXG4gICAgICBQcm9taXNlLnJlc29sdmUodGhpcy5nZXRMb2NhbFN5bmNhYmxlRmlsZXMoKSlcbiAgICBdKTtcbiAgICBjb25zdCBpdGVtczogU3luY0NlbnRlckl0ZW1bXSA9IFtdO1xuICAgIGNvbnN0IHNlZW5SZW1vdGVQYXRocyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG4gICAgZm9yIChjb25zdCBmaWxlIG9mIGxvY2FsRmlsZXMpIHtcbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLnJlbW90ZVBhdGgoZmlsZSk7XG4gICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVGaWxlcy5nZXQocmVtb3RlUGF0aCk7XG4gICAgICBjb25zdCBzdGF0ZSA9IHRoaXMuZ2V0U3RhdGUoZmlsZSk7XG4gICAgICBjb25zdCB0ZXh0Q29udGVudCA9IGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIgPyBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpIDogXCJcIjtcbiAgICAgIGNvbnN0IGJpbmFyeUNvbnRlbnQgPSBmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiID8gdGV4dEJ5dGVzKHRleHRDb250ZW50KS5idWZmZXIgOiBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgICAgY29uc3QgY3VycmVudEhhc2ggPSBmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiID8gaGFzaENvbnRlbnQodGV4dENvbnRlbnQpIDogaGFzaEJ5dGVzKGJpbmFyeUNvbnRlbnQpO1xuICAgICAgY29uc3QgY3VycmVudEJsb2JTaGEgPSBhd2FpdCBnaXRCbG9iU2hhKGJpbmFyeUNvbnRlbnQpO1xuICAgICAgbGV0IHN0YXR1czogU3luY0NlbnRlclN0YXR1cztcblxuICAgICAgc2VlblJlbW90ZVBhdGhzLmFkZChyZW1vdGVQYXRoKTtcblxuICAgICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgICAgc3RhdHVzID0gXCJ1bnB1Ymxpc2hlZFwiO1xuICAgICAgfSBlbHNlIGlmIChyZW1vdGUuc2hhID09PSBjdXJyZW50QmxvYlNoYSkge1xuICAgICAgICBzdGF0dXMgPSBcInB1Ymxpc2hlZFwiO1xuICAgICAgfSBlbHNlIGlmIChzdGF0ZS5zaGEgPT09IGN1cnJlbnRCbG9iU2hhICYmIHN0YXRlLnN0YXR1cyA9PT0gXCJzeW5jZWRcIikge1xuICAgICAgICBzdGF0dXMgPSBcInB1Ymxpc2hlZFwiO1xuICAgICAgfSBlbHNlIGlmIChzdGF0ZS5sYXN0U3luY2VkSGFzaCAmJiBzdGF0ZS5sYXN0U3luY2VkSGFzaCA9PT0gY3VycmVudEhhc2ggJiYgc3RhdGUuc2hhID09PSByZW1vdGUuc2hhKSB7XG4gICAgICAgIHN0YXR1cyA9IFwicHVibGlzaGVkXCI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdGF0dXMgPSBcIm1vZGlmaWVkXCI7XG4gICAgICB9XG5cbiAgICAgIGl0ZW1zLnB1c2goe1xuICAgICAgICBpZDogYGxvY2FsOiR7ZmlsZS5wYXRofWAsXG4gICAgICAgIG5hbWU6IGZpbGUubmFtZSxcbiAgICAgICAgc3RhdHVzLFxuICAgICAgICBsb2NhbFBhdGg6IGZpbGUucGF0aCxcbiAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgZm9sZGVyUGF0aDogcmVtb3RlUGF0aC5zbGljZSgwLCBNYXRoLm1heChyZW1vdGVQYXRoLmxhc3RJbmRleE9mKFwiL1wiKSwgUkVNT1RFX0NPTlRFTlRfUk9PVC5sZW5ndGgpKSxcbiAgICAgICAgZmlsZSxcbiAgICAgICAgcmVtb3RlLFxuICAgICAgICBzdGF0ZVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmVtb3RlRmlsZXMuZm9yRWFjaCgocmVtb3RlLCByZW1vdGVQYXRoKSA9PiB7XG4gICAgICBpZiAoc2VlblJlbW90ZVBhdGhzLmhhcyhyZW1vdGVQYXRoKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5hbWUgPSByZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5wb3AoKSA/PyByZW1vdGVQYXRoO1xuICAgICAgaXRlbXMucHVzaCh7XG4gICAgICAgIGlkOiBgcmVtb3RlOiR7cmVtb3RlUGF0aH1gLFxuICAgICAgICBuYW1lLFxuICAgICAgICBzdGF0dXM6IFwibG9jYWxEZWxldGVkXCIsXG4gICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIGZvbGRlclBhdGg6IHJlbW90ZVBhdGguc2xpY2UoMCwgTWF0aC5tYXgocmVtb3RlUGF0aC5sYXN0SW5kZXhPZihcIi9cIiksIFJFTU9URV9DT05URU5UX1JPT1QubGVuZ3RoKSksXG4gICAgICAgIHJlbW90ZVxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gaXRlbXMuc29ydCgoYSwgYikgPT4ge1xuICAgICAgY29uc3Qgc3RhdHVzT3JkZXI6IFJlY29yZDxTeW5jQ2VudGVyU3RhdHVzLCBudW1iZXI+ID0ge1xuICAgICAgICB1bnB1Ymxpc2hlZDogMCxcbiAgICAgICAgbW9kaWZpZWQ6IDEsXG4gICAgICAgIHB1Ymxpc2hlZDogMixcbiAgICAgICAgbG9jYWxEZWxldGVkOiAzXG4gICAgICB9O1xuXG4gICAgICByZXR1cm4gc3RhdHVzT3JkZXJbYS5zdGF0dXNdIC0gc3RhdHVzT3JkZXJbYi5zdGF0dXNdIHx8IGEucmVtb3RlUGF0aC5sb2NhbGVDb21wYXJlKGIucmVtb3RlUGF0aCwgXCJ6aC1DTlwiKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZVJlbW90ZVBhdGgocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgdGhpcy52YWxpZGF0ZUNvbmZpZygpO1xuXG4gICAgaWYgKCFpc1NhZmVDb250ZW50UGF0aChyZW1vdGVQYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4RkRDXHU3QUVGXHU4REVGXHU1Rjg0XHU1RkM1XHU5ODdCXHU0RjREXHU0RThFXHU0RUQzXHU1RTkzIGNvbnRlbnQgXHU3NkVFXHU1RjU1XHU1MTg1XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuZ2V0UmVtb3RlQ29udGVudChyZW1vdGVQYXRoKTtcbiAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgbmV3IE5vdGljZShgXHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHU0RTBEXHU1QjU4XHU1NzI4XHVGRjFBJHtyZW1vdGVQYXRofWApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuZ2l0aHViUmVxdWVzdDxHaXRIdWJEZWxldGVSZXNwb25zZT4oXCJERUxFVEVcIiwgdGhpcy5idWlsZENvbnRlbnRBcGlQYXRoKHJlbW90ZVBhdGgpLCB7XG4gICAgICBtZXNzYWdlOiBgc3luYzogZGVsZXRlICR7cmVtb3RlUGF0aH1gLFxuICAgICAgc2hhOiByZW1vdGUuc2hhLFxuICAgICAgYnJhbmNoOiB0aGlzLnNldHRpbmdzLmJyYW5jaC50cmltKClcbiAgICB9KTtcblxuICAgIE9iamVjdC5lbnRyaWVzKHRoaXMuZGF0YS5maWxlcykuZm9yRWFjaCgoW2xvY2FsUGF0aCwgc3RhdGVdKSA9PiB7XG4gICAgICBpZiAoc3RhdGUucmVtb3RlUGF0aCA9PT0gcmVtb3RlUGF0aCkge1xuICAgICAgICB0aGlzLmRhdGEuZmlsZXNbbG9jYWxQYXRoXSA9IHtcbiAgICAgICAgICAuLi5zdGF0ZSxcbiAgICAgICAgICBzaGE6IHVuZGVmaW5lZCxcbiAgICAgICAgICBodG1sVXJsOiB1bmRlZmluZWQsXG4gICAgICAgICAgc3RhdHVzOiBcImRlbGV0ZWRcIlxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIGF3YWl0IHRoaXMuc2F2ZUFsbERhdGEoKTtcbiAgfVxuXG4gIGFzeW5jIHN5bmNGaWxlU3RhdGUoZmlsZTogVEZpbGUpOiBQcm9taXNlPExvY2FsRmlsZVN0YXRlPiB7XG4gICAgaWYgKCF0aGlzLmlzSW5zaWRlUm9vdChmaWxlKSB8fCAhaXNTeW5jYWJsZUZpbGUoZmlsZSkpIHtcbiAgICAgIHJldHVybiB7IHN0YXR1czogXCJkcmFmdFwiIH07XG4gICAgfVxuXG4gICAgdGhpcy52YWxpZGF0ZUNvbmZpZygpO1xuXG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMucmVtb3RlUGF0aChmaWxlKTtcbiAgICBjb25zdCBjdXJyZW50ID0gdGhpcy5nZXRTdGF0ZShmaWxlKTtcbiAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLmdldFJlbW90ZUNvbnRlbnQocmVtb3RlUGF0aCk7XG5cbiAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgY29uc3QgbmV4dFN0YXRlOiBMb2NhbEZpbGVTdGF0ZSA9IGN1cnJlbnQuc2hhXG4gICAgICAgID8ge1xuICAgICAgICAgICAgLi4uY3VycmVudCxcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgICBzaGE6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGh0bWxVcmw6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIHN0YXR1czogXCJkZWxldGVkXCJcbiAgICAgICAgICB9XG4gICAgICAgIDogeyByZW1vdGVQYXRoLCBzdGF0dXM6IFwiZHJhZnRcIiB9O1xuXG4gICAgICB0aGlzLmRhdGEuZmlsZXNbZmlsZS5wYXRoXSA9IG5leHRTdGF0ZTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZUFsbERhdGEoKTtcbiAgICAgIHJldHVybiBuZXh0U3RhdGU7XG4gICAgfVxuXG4gICAgY29uc3QgbmV4dFN0YXRlOiBMb2NhbEZpbGVTdGF0ZSA9IHtcbiAgICAgIC4uLmN1cnJlbnQsXG4gICAgICByZW1vdGVQYXRoLFxuICAgICAgc2hhOiByZW1vdGUuc2hhLFxuICAgICAgaHRtbFVybDogcmVtb3RlLmh0bWxfdXJsID8/IHRoaXMuYnVpbGRHaXRIdWJCbG9iVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgc3RhdHVzOiBcInN5bmNlZFwiXG4gICAgfTtcblxuICAgIGlmIChjdXJyZW50LnNoYSAhPT0gcmVtb3RlLnNoYSkge1xuICAgICAgbmV4dFN0YXRlLmxhc3RTeW5jZWRIYXNoID0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIHRoaXMuZGF0YS5maWxlc1tmaWxlLnBhdGhdID0gbmV4dFN0YXRlO1xuICAgIGF3YWl0IHRoaXMuc2F2ZUFsbERhdGEoKTtcbiAgICByZXR1cm4gbmV4dFN0YXRlO1xuICB9XG5cbiAgYXN5bmMgdGVzdENvbm5lY3Rpb24oKTogUHJvbWlzZTxDb25uZWN0aW9uU3RhdGU+IHtcbiAgICB0cnkge1xuICAgICAgdGhpcy52YWxpZGF0ZUNvbmZpZygpO1xuICAgICAgY29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuZ2V0UmVwb3NpdG9yeSgpO1xuICAgICAgY29uc3QgdXNlciA9IGF3YWl0IHRoaXMuZ2l0aHViUmVxdWVzdDxHaXRIdWJVc2VyUmVzcG9uc2U+KFwiR0VUXCIsIFwiL3VzZXJcIik7XG5cbiAgICAgIGNvbnN0IHJlcG8gPSBhd2FpdCB0aGlzLmdpdGh1YlJlcXVlc3Q8R2l0SHViUmVwb1Jlc3BvbnNlPihcIkdFVFwiLCB0aGlzLmJ1aWxkUmVwb0FwaVBhdGgoKSk7XG4gICAgICBhd2FpdCB0aGlzLmdpdGh1YlJlcXVlc3Q8dW5rbm93bj4oXCJHRVRcIiwgdGhpcy5idWlsZEJyYW5jaEFwaVBhdGgoKSk7XG5cbiAgICAgIGlmICh1c2VyLmxvZ2luLnRvTG93ZXJDYXNlKCkgIT09IHRoaXMuc2V0dGluZ3MuZ2l0aHViVXNlcm5hbWUudHJpbSgpLnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb2tlbiBcdTc1MjhcdTYyMzdcdTRFM0EgJHt1c2VyLmxvZ2lufVx1RkYwQ1x1NEUwRVx1OTE0RFx1N0Y2RVx1NzY4NCBHaXRIdWIgVXNlcm5hbWUgXHU0RTBEXHU0RTAwXHU4MUY0XHUzMDAyYCk7XG4gICAgICB9XG5cbiAgICAgIGlmICghcmVwby5wZXJtaXNzaW9ucz8uYWRtaW4gJiYgIXJlcG8ucGVybWlzc2lvbnM/Lm1haW50YWluICYmICFyZXBvLnBlcm1pc3Npb25zPy5wdXNoKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgVG9rZW4gXHU1QkY5ICR7cmVwby5mdWxsX25hbWV9IFx1NkNBMVx1NjcwOVx1NTE5OVx1Njc0M1x1OTY1MFx1MzAwMlx1OEJGN1x1Nzg2RVx1OEJBNCBGaW5lLWdyYWluZWQgdG9rZW4gXHU1REYyXHU2Mzg4XHU2NzQzXHU4QkU1XHU0RUQzXHU1RTkzXHVGRjBDXHU1RTc2XHU1QzA2IENvbnRlbnRzIFx1OEJCRVx1N0Y2RVx1NEUzQSBSZWFkIGFuZCB3cml0ZVx1MzAwMmBcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc3RhdGU6IENvbm5lY3Rpb25TdGF0ZSA9IHtcbiAgICAgICAgc3RhdHVzOiBcInN1Y2Nlc3NcIixcbiAgICAgICAgbWVzc2FnZTogYFx1OEZERVx1NjNBNVx1NjIxMFx1NTI5Rlx1RkYxQSR7cmVwb3NpdG9yeS5vd25lcn0vJHtyZXBvc2l0b3J5LnJlcG99QCR7dGhpcy5zZXR0aW5ncy5icmFuY2gudHJpbSgpfWAsXG4gICAgICAgIGNoZWNrZWRBdDogZm9ybWF0RGF0ZVRpbWUobmV3IERhdGUoKSlcbiAgICAgIH07XG4gICAgICB0aGlzLmRhdGEuY29ubmVjdGlvbiA9IHN0YXRlO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlQWxsRGF0YSgpO1xuICAgICAgbmV3IE5vdGljZShzdGF0ZS5tZXNzYWdlKTtcbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJcdThGREVcdTYzQTVcdTU5MzFcdThEMjVcIjtcbiAgICAgIGNvbnN0IHN0YXRlOiBDb25uZWN0aW9uU3RhdGUgPSB7XG4gICAgICAgIHN0YXR1czogXCJmYWlsZWRcIixcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgY2hlY2tlZEF0OiBmb3JtYXREYXRlVGltZShuZXcgRGF0ZSgpKVxuICAgICAgfTtcbiAgICAgIHRoaXMuZGF0YS5jb25uZWN0aW9uID0gc3RhdGU7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBhc3luYyBzeW5jRmlsZVRvR2l0SHViKGZpbGU6IFRGaWxlKTogUHJvbWlzZTxMb2NhbEZpbGVTdGF0ZT4ge1xuICAgIHRoaXMudmFsaWRhdGVDb25maWcoKTtcblxuICAgIGlmICghdGhpcy5pc0luc2lkZVJvb3QoZmlsZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1NUY1M1x1NTI0RFx1NjU4N1x1N0FFMFx1NEUwRFx1NTcyOCBMb2NhbCBSb290IFBhdGggXHU1MTg1XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGlmICghaXNTeW5jYWJsZUZpbGUoZmlsZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1OTY5MFx1ODVDRlx1NjU4N1x1NEVGNlx1NjIxNlx1N0NGQlx1N0VERlx1NjU4N1x1NEVGNlx1NEUwRFx1NTE0MVx1OEJCOFx1NTQwQ1x1NkI2NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICBjb25zdCBpc01hcmtkb3duID0gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIjtcbiAgICBjb25zdCBjb250ZW50ID0gaXNNYXJrZG93biA/IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSkgOiBcIlwiO1xuICAgIGNvbnN0IGJpbmFyeUNvbnRlbnQgPSBpc01hcmtkb3duID8gdGV4dEJ5dGVzKGNvbnRlbnQpLmJ1ZmZlciA6IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWRCaW5hcnkoZmlsZSk7XG4gICAgY29uc3QgY3VycmVudEhhc2ggPSBpc01hcmtkb3duID8gaGFzaENvbnRlbnQoY29udGVudCkgOiBoYXNoQnl0ZXMoYmluYXJ5Q29udGVudCk7XG4gICAgY29uc3QgY3VycmVudEJsb2JTaGEgPSBhd2FpdCBnaXRCbG9iU2hhKGJpbmFyeUNvbnRlbnQpO1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLnJlbW90ZVBhdGgoZmlsZSk7XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgY3VycmVudFN0YXRlID0gdGhpcy5nZXRTdGF0ZShmaWxlKTtcbiAgICAgIGNvbnN0IGNhY2hlZFNoYSA9IGN1cnJlbnRTdGF0ZS5yZW1vdGVQYXRoID09PSByZW1vdGVQYXRoID8gY3VycmVudFN0YXRlLnNoYSA6IHVuZGVmaW5lZDtcbiAgICAgIGxldCByZXNvbHZlZFJlbW90ZTogR2l0SHViQ29udGVudFJlc3BvbnNlIHwgbnVsbCA9IG51bGw7XG5cbiAgICAgIGNvbnN0IHB1dENvbnRlbnQgPSAoc2hhPzogc3RyaW5nKSA9PlxuICAgICAgICB0aGlzLmdpdGh1YlJlcXVlc3Q8R2l0SHViUHV0UmVzcG9uc2U+KFwiUFVUXCIsIHRoaXMuYnVpbGRDb250ZW50QXBpUGF0aChyZW1vdGVQYXRoKSwge1xuICAgICAgICAgIG1lc3NhZ2U6IGAke3NoYSA/IFwic3luYzogdXBkYXRlXCIgOiBcInN5bmM6IGFkZFwifSAke3JlbW90ZVBhdGh9YCxcbiAgICAgICAgICBjb250ZW50OiBpc01hcmtkb3duID8gZW5jb2RlQmFzZTY0KGNvbnRlbnQpIDogZW5jb2RlQnl0ZXNCYXNlNjQobmV3IFVpbnQ4QXJyYXkoYmluYXJ5Q29udGVudCkpLFxuICAgICAgICAgIGJyYW5jaDogdGhpcy5zZXR0aW5ncy5icmFuY2gudHJpbSgpLFxuICAgICAgICAgIC4uLihzaGEgPyB7IHNoYSB9IDoge30pXG4gICAgICAgIH0pO1xuXG4gICAgICBsZXQgcmVzdWx0OiBHaXRIdWJQdXRSZXNwb25zZTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgcHV0Q29udGVudChjYWNoZWRTaGEpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgR2l0SHViUmVxdWVzdEVycm9yICYmIChlcnJvci5zdGF0dXMgPT09IDQwOSB8fCBlcnJvci5zdGF0dXMgPT09IDQyMikpIHtcbiAgICAgICAgICByZXNvbHZlZFJlbW90ZSA9IGF3YWl0IHRoaXMuZ2V0UmVtb3RlQ29udGVudChyZW1vdGVQYXRoKTtcbiAgICAgICAgICByZXN1bHQgPSBhd2FpdCBwdXRDb250ZW50KHJlc29sdmVkUmVtb3RlPy5zaGEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5leHRTaGEgPSByZXN1bHQuY29udGVudD8uc2hhID8/IGN1cnJlbnRCbG9iU2hhID8/IHJlc29sdmVkUmVtb3RlPy5zaGEgPz8gY2FjaGVkU2hhO1xuICAgICAgY29uc3QgaHRtbFVybCA9IHJlc3VsdC5jb250ZW50Py5odG1sX3VybCA/PyB0aGlzLmJ1aWxkR2l0SHViQmxvYlVybChyZW1vdGVQYXRoKTtcblxuICAgICAgY29uc3QgbmV4dFN0YXRlOiBMb2NhbEZpbGVTdGF0ZSA9IHtcbiAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgc2hhOiBuZXh0U2hhLFxuICAgICAgICBzdGF0dXM6IFwic3luY2VkXCIsXG4gICAgICAgIGxhc3RTeW5jZWRBdDogZm9ybWF0RGF0ZVRpbWUobmV3IERhdGUoKSksXG4gICAgICAgIGxhc3RTeW5jZWRIYXNoOiBjdXJyZW50SGFzaCxcbiAgICAgICAgaHRtbFVybFxuICAgICAgfTtcblxuICAgICAgYXdhaXQgdGhpcy5zZXRTdGF0ZShmaWxlLCBuZXh0U3RhdGUpO1xuXG4gICAgICBuZXcgTm90aWNlKGBcdTU0MENcdTZCNjVcdTYyMTBcdTUyOUZcdUZGMUEke3JlbW90ZVBhdGh9YCk7XG4gICAgICByZXR1cm4gbmV4dFN0YXRlO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBhd2FpdCB0aGlzLnNldFN0YXRlKGZpbGUsIHsgcmVtb3RlUGF0aCwgc3RhdHVzOiBcImZhaWxlZFwiIH0pO1xuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgR2l0SHViUmVxdWVzdEVycm9yICYmIGVycm9yLnN0YXR1cyA9PT0gNDA0KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgR2l0SHViIFx1NTE5OVx1NTE2NVx1OEZENFx1NTZERSA0MDRcdUZGMUEke3JlbW90ZVBhdGh9XHUzMDAyXHU5MDFBXHU1RTM4XHU2NjJGIFRva2VuIFx1NkNBMVx1NjcwOVx1NjM4OFx1Njc0M1x1NUY1M1x1NTI0RFx1NEVEM1x1NUU5M1x1MzAwMVJlcG9zaXRvcnkgVVJMIFx1NEUwRFx1NjYyRlx1NzZFRVx1NjgwN1x1NTM1QVx1NUJBMlx1NEVEM1x1NUU5M1x1RkYwQ1x1NjIxNlx1NTIwNlx1NjUyRiAke3RoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKX0gXHU0RTBEXHU1M0VGXHU1MTk5XHUzMDAyXHU4QkY3XHU3ODZFXHU4QkE0IHRva2VuIFx1NzY4NCBSZXBvc2l0b3J5IGFjY2VzcyBcdTUzMDVcdTU0MkJcdThCRTVcdTRFRDNcdTVFOTNcdUZGMENcdTRFMTQgQ29udGVudHMgXHU0RTNBIFJlYWQgYW5kIHdyaXRlXHUzMDAyYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc3luY0N1cnJlbnROb3RlKCkge1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmdldEN1cnJlbnRGaWxlKCk7XG5cbiAgICBpZiAoIWZpbGUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1NUY1M1x1NTI0RFx1NkNBMVx1NjcwOVx1NkZDMFx1NkQzQlx1NzY4NCBNYXJrZG93biBcdTY1ODdcdTRFRjZcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5zeW5jRmlsZVRvR2l0SHViKGZpbGUpO1xuICB9XG5cbiAgYXN5bmMgZGVsZXRlUmVtb3RlRmlsZShmaWxlOiBURmlsZSkge1xuICAgIHRoaXMudmFsaWRhdGVDb25maWcoKTtcblxuICAgIGlmICghdGhpcy5pc0luc2lkZVJvb3QoZmlsZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1NUY1M1x1NTI0RFx1NjU4N1x1N0FFMFx1NEUwRFx1NTcyOCBMb2NhbCBSb290IFBhdGggXHU1MTg1XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLnJlbW90ZVBhdGgoZmlsZSk7XG4gICAgY29uc3QgcmVtb3RlID0gYXdhaXQgdGhpcy5nZXRSZW1vdGVDb250ZW50KHJlbW90ZVBhdGgpO1xuXG4gICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgIGF3YWl0IHRoaXMuc2V0U3RhdGUoZmlsZSwge1xuICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICBzaGE6IHVuZGVmaW5lZCxcbiAgICAgICAgaHRtbFVybDogdW5kZWZpbmVkLFxuICAgICAgICBzdGF0dXM6IFwiZGVsZXRlZFwiXG4gICAgICB9KTtcbiAgICAgIG5ldyBOb3RpY2UoXCJcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcdTRFMERcdTVCNThcdTU3MjhcdTMwMDJcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5naXRodWJSZXF1ZXN0PEdpdEh1YkRlbGV0ZVJlc3BvbnNlPihcIkRFTEVURVwiLCB0aGlzLmJ1aWxkQ29udGVudEFwaVBhdGgocmVtb3RlUGF0aCksIHtcbiAgICAgIG1lc3NhZ2U6IGBzeW5jOiBkZWxldGUgJHtyZW1vdGVQYXRofWAsXG4gICAgICBzaGE6IHJlbW90ZS5zaGEsXG4gICAgICBicmFuY2g6IHRoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKVxuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5zZXRTdGF0ZShmaWxlLCB7XG4gICAgICByZW1vdGVQYXRoLFxuICAgICAgc2hhOiB1bmRlZmluZWQsXG4gICAgICBodG1sVXJsOiB1bmRlZmluZWQsXG4gICAgICBzdGF0dXM6IFwiZGVsZXRlZFwiXG4gICAgfSk7XG4gICAgbmV3IE5vdGljZShcIlx1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlx1NURGMlx1NTIyMFx1OTY2NFx1MzAwMlwiKTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZUN1cnJlbnRSZW1vdGVOb3RlKCkge1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmdldEN1cnJlbnRGaWxlKCk7XG5cbiAgICBpZiAoIWZpbGUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1NUY1M1x1NTI0RFx1NkNBMVx1NjcwOVx1NkZDMFx1NkQzQlx1NzY4NCBNYXJrZG93biBcdTY1ODdcdTRFRjZcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVGaWxlKGZpbGUpO1xuICB9XG5cbiAgYXN5bmMgb3BlblJlbW90ZVVybEZvckZpbGUoZmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCBzdGF0ZSA9IGF3YWl0IHRoaXMuZ2V0RWZmZWN0aXZlU3RhdGUoZmlsZSk7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHN0YXRlLnJlbW90ZVBhdGggPz8gdGhpcy5yZW1vdGVQYXRoKGZpbGUpO1xuXG4gICAgaWYgKHN0YXRlLnN0YXR1cyA9PT0gXCJkZWxldGVkXCIpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcdTVERjJcdTdFQ0ZcdTUyMjBcdTk2NjRcdTMwMDJcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgd2luZG93Lm9wZW4oc3RhdGUuaHRtbFVybCA/PyB0aGlzLmJ1aWxkR2l0SHViQmxvYlVybChyZW1vdGVQYXRoKSwgXCJfYmxhbmtcIik7XG4gIH1cblxuICBhc3luYyBvcGVuUmVtb3RlVXJsKCkge1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmdldEN1cnJlbnRGaWxlKCk7XG4gICAgaWYgKCFmaWxlKSB7XG4gICAgICBuZXcgTm90aWNlKFwiXHU1RjUzXHU1MjREXHU2Q0ExXHU2NzA5XHU2RkMwXHU2RDNCXHU2NTg3XHU0RUY2XHUzMDAyXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMub3BlblJlbW90ZVVybEZvckZpbGUoZmlsZSk7XG4gIH1cbn1cblxuY2xhc3MgU3luY0NlbnRlck1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luO1xuICBpdGVtczogU3luY0NlbnRlckl0ZW1bXSA9IFtdO1xuICBzZWxlY3RlZElkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb2xsYXBzZWRQYXRocyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBkZWxldGVkUmVtb3RlUGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgbG9hZGluZyA9IGZhbHNlO1xuICBlcnJvck1lc3NhZ2UgPSBcIlwiO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luKSB7XG4gICAgc3VwZXIoYXBwKTtcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgfVxuXG4gIG9uT3BlbigpIHtcbiAgICB2b2lkIHRoaXMucmVmcmVzaCgpO1xuICB9XG5cbiAgYXN5bmMgcmVmcmVzaCgpIHtcbiAgICB0aGlzLmxvYWRpbmcgPSB0cnVlO1xuICAgIHRoaXMuZXJyb3JNZXNzYWdlID0gXCJcIjtcbiAgICB0aGlzLnJlbmRlcigpO1xuXG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuaXRlbXMgPSB0aGlzLmFwcGx5RGVsZXRlZFJlbW90ZU92ZXJyaWRlcyhhd2FpdCB0aGlzLnBsdWdpbi5idWlsZFN5bmNDZW50ZXJJdGVtcygpKTtcbiAgICAgIGNvbnN0IHZhbGlkSWRzID0gbmV3IFNldCh0aGlzLml0ZW1zLm1hcCgoaXRlbSkgPT4gaXRlbS5pZCkpO1xuICAgICAgdGhpcy5zZWxlY3RlZElkcy5mb3JFYWNoKChpZCkgPT4ge1xuICAgICAgICBpZiAoIXZhbGlkSWRzLmhhcyhpZCkpIHtcbiAgICAgICAgICB0aGlzLnNlbGVjdGVkSWRzLmRlbGV0ZShpZCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0aGlzLmVycm9yTWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJcdTU0MENcdTZCNjVcdTRFMkRcdTVGQzNcdTUyQTBcdThGN0RcdTU5MzFcdThEMjVcdTMwMDJcIjtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5sb2FkaW5nID0gZmFsc2U7XG4gICAgICB0aGlzLnJlbmRlcigpO1xuICAgIH1cbiAgfVxuXG4gIGFwcGx5RGVsZXRlZFJlbW90ZU92ZXJyaWRlcyhpdGVtczogU3luY0NlbnRlckl0ZW1bXSk6IFN5bmNDZW50ZXJJdGVtW10ge1xuICAgIHJldHVybiBpdGVtcy5mbGF0TWFwKChpdGVtKSA9PiB7XG4gICAgICBpZiAoIXRoaXMuZGVsZXRlZFJlbW90ZVBhdGhzLmhhcyhpdGVtLnJlbW90ZVBhdGgpKSB7XG4gICAgICAgIHJldHVybiBbaXRlbV07XG4gICAgICB9XG5cbiAgICAgIGlmICghaXRlbS5maWxlKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIFtcbiAgICAgICAge1xuICAgICAgICAgIC4uLml0ZW0sXG4gICAgICAgICAgc3RhdHVzOiBcInVucHVibGlzaGVkXCIsXG4gICAgICAgICAgcmVtb3RlOiB1bmRlZmluZWRcbiAgICAgICAgfVxuICAgICAgXTtcbiAgICB9KTtcbiAgfVxuXG4gIGdldFNlbGVjdGVkSXRlbXMoKTogU3luY0NlbnRlckl0ZW1bXSB7XG4gICAgcmV0dXJuIHRoaXMuaXRlbXMuZmlsdGVyKChpdGVtKSA9PiB0aGlzLnNlbGVjdGVkSWRzLmhhcyhpdGVtLmlkKSk7XG4gIH1cblxuICBnZXRTZWxlY3RlZExvY2FsSXRlbXMoKTogU3luY0NlbnRlckl0ZW1bXSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0U2VsZWN0ZWRJdGVtcygpLmZpbHRlcihcbiAgICAgIChpdGVtKSA9PiBpdGVtLmZpbGUgJiYgdGhpcy5wbHVnaW4uaXNJbnNpZGVSb290KGl0ZW0uZmlsZSkgJiYgaXRlbS5zdGF0dXMgIT09IFwicHVibGlzaGVkXCIgJiYgaXRlbS5zdGF0dXMgIT09IFwibG9jYWxEZWxldGVkXCJcbiAgICApO1xuICB9XG5cbiAgZ2V0U2VsZWN0ZWRSZW1vdGVPbmx5SXRlbXMoKTogU3luY0NlbnRlckl0ZW1bXSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0U2VsZWN0ZWRJdGVtcygpLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5zdGF0dXMgPT09IFwibG9jYWxEZWxldGVkXCIpO1xuICB9XG5cbiAgZ2V0U2VsZWN0ZWRSZW1vdGVJdGVtcygpOiBTeW5jQ2VudGVySXRlbVtdIHtcbiAgICByZXR1cm4gdGhpcy5nZXRTZWxlY3RlZEl0ZW1zKCkuZmlsdGVyKChpdGVtKSA9PiBpdGVtLnJlbW90ZSk7XG4gIH1cblxuICBzZXRJdGVtc1NlbGVjdGVkKGl0ZW1zOiBTeW5jQ2VudGVySXRlbVtdLCBzZWxlY3RlZDogYm9vbGVhbikge1xuICAgIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICAgIGlmIChzZWxlY3RlZCkge1xuICAgICAgICB0aGlzLnNlbGVjdGVkSWRzLmFkZChpdGVtLmlkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZGVsZXRlKGl0ZW0uaWQpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcmVuZGVyUHJlc2VydmluZ1Njcm9sbCgpIHtcbiAgICBjb25zdCBib2R5RWwgPSB0aGlzLmNvbnRlbnRFbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIi5vYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtY2VudGVyLWJvZHlcIik7XG4gICAgY29uc3QgbW9kYWxDb250ZW50RWwgPSB0aGlzLmNvbnRlbnRFbC5wYXJlbnRFbGVtZW50O1xuICAgIGNvbnN0IGJvZHlTY3JvbGxUb3AgPSBib2R5RWw/LnNjcm9sbFRvcCA/PyAwO1xuICAgIGNvbnN0IG1vZGFsU2Nyb2xsVG9wID0gbW9kYWxDb250ZW50RWw/LnNjcm9sbFRvcCA/PyAwO1xuXG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgICAgY29uc3QgbmV4dEJvZHlFbCA9IHRoaXMuY29udGVudEVsLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiLm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1jZW50ZXItYm9keVwiKTtcbiAgICAgIGlmIChuZXh0Qm9keUVsKSB7XG4gICAgICAgIG5leHRCb2R5RWwuc2Nyb2xsVG9wID0gYm9keVNjcm9sbFRvcDtcbiAgICAgIH1cbiAgICAgIGlmIChtb2RhbENvbnRlbnRFbCkge1xuICAgICAgICBtb2RhbENvbnRlbnRFbC5zY3JvbGxUb3AgPSBtb2RhbFNjcm9sbFRvcDtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIHRvZ2dsZURpcmVjdG9yeShwYXRoOiBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5jb2xsYXBzZWRQYXRocy5oYXMocGF0aCkpIHtcbiAgICAgIHRoaXMuY29sbGFwc2VkUGF0aHMuZGVsZXRlKHBhdGgpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmNvbGxhcHNlZFBhdGhzLmFkZChwYXRoKTtcbiAgICB9XG4gICAgdGhpcy5yZW5kZXJQcmVzZXJ2aW5nU2Nyb2xsKCk7XG4gIH1cblxuICBidWlsZFRyZWUoaXRlbXM6IFN5bmNDZW50ZXJJdGVtW10pOiBTeW5jVHJlZU5vZGUge1xuICAgIGNvbnN0IHJvb3Q6IFN5bmNUcmVlTm9kZSA9IHtcbiAgICAgIG5hbWU6IFJFTU9URV9DT05URU5UX1JPT1QsXG4gICAgICBwYXRoOiBSRU1PVEVfQ09OVEVOVF9ST09ULFxuICAgICAgY2hpbGRyZW46IG5ldyBNYXAoKSxcbiAgICAgIGl0ZW1zOiBbXVxuICAgIH07XG5cbiAgICBpdGVtcy5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgICBjb25zdCByZWxhdGl2ZSA9IGl0ZW0ucmVtb3RlUGF0aC5zdGFydHNXaXRoKGAke1JFTU9URV9DT05URU5UX1JPT1R9L2ApXG4gICAgICAgID8gaXRlbS5yZW1vdGVQYXRoLnNsaWNlKFJFTU9URV9DT05URU5UX1JPT1QubGVuZ3RoICsgMSlcbiAgICAgICAgOiBpdGVtLnJlbW90ZVBhdGg7XG4gICAgICBjb25zdCBwYXJ0cyA9IHJlbGF0aXZlLnNwbGl0KFwiL1wiKTtcbiAgICAgIGNvbnN0IGZvbGRlcnMgPSBwYXJ0cy5zbGljZSgwLCAtMSk7XG4gICAgICBsZXQgbm9kZSA9IHJvb3Q7XG5cbiAgICAgIGZvbGRlcnMuZm9yRWFjaCgoZm9sZGVyKSA9PiB7XG4gICAgICAgIGNvbnN0IGNoaWxkUGF0aCA9IGAke25vZGUucGF0aH0vJHtmb2xkZXJ9YDtcbiAgICAgICAgbGV0IGNoaWxkID0gbm9kZS5jaGlsZHJlbi5nZXQoZm9sZGVyKTtcbiAgICAgICAgaWYgKCFjaGlsZCkge1xuICAgICAgICAgIGNoaWxkID0ge1xuICAgICAgICAgICAgbmFtZTogZm9sZGVyLFxuICAgICAgICAgICAgcGF0aDogY2hpbGRQYXRoLFxuICAgICAgICAgICAgY2hpbGRyZW46IG5ldyBNYXAoKSxcbiAgICAgICAgICAgIGl0ZW1zOiBbXVxuICAgICAgICAgIH07XG4gICAgICAgICAgbm9kZS5jaGlsZHJlbi5zZXQoZm9sZGVyLCBjaGlsZCk7XG4gICAgICAgIH1cbiAgICAgICAgbm9kZSA9IGNoaWxkO1xuICAgICAgfSk7XG5cbiAgICAgIG5vZGUuaXRlbXMucHVzaChpdGVtKTtcbiAgICB9KTtcblxuICAgIHJldHVybiByb290O1xuICB9XG5cbiAgZ2V0Tm9kZUl0ZW1zKG5vZGU6IFN5bmNUcmVlTm9kZSk6IFN5bmNDZW50ZXJJdGVtW10ge1xuICAgIGNvbnN0IGl0ZW1zID0gWy4uLm5vZGUuaXRlbXNdO1xuICAgIG5vZGUuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQpID0+IHtcbiAgICAgIGl0ZW1zLnB1c2goLi4udGhpcy5nZXROb2RlSXRlbXMoY2hpbGQpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gaXRlbXM7XG4gIH1cblxuICByZW5kZXIoKSB7XG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG4gICAgY29udGVudEVsLmVtcHR5KCk7XG4gICAgY29udGVudEVsLmFkZENsYXNzKFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLWNlbnRlclwiKTtcblxuICAgIHRoaXMucmVuZGVySGVhZGVyKGNvbnRlbnRFbCk7XG5cbiAgICBpZiAodGhpcy5sb2FkaW5nKSB7XG4gICAgICBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1jZW50ZXItZW1wdHlcIiwgdGV4dDogXCJcdTZCNjNcdTU3MjhcdTUyQTBcdThGN0RcdTY3MkNcdTU3MzBcdTRFMEVcdThGRENcdTdBRUZcdTUxODVcdTVCQjkuLi5cIiB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5lcnJvck1lc3NhZ2UpIHtcbiAgICAgIGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLWNlbnRlci1lcnJvclwiLCB0ZXh0OiB0aGlzLmVycm9yTWVzc2FnZSB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnJlbmRlclN1bW1hcnkoY29udGVudEVsKTtcbiAgICB0aGlzLnJlbmRlclRvb2xiYXIoY29udGVudEVsKTtcblxuICAgIGNvbnN0IGJvZHlFbCA9IGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLWNlbnRlci1ib2R5XCIgfSk7XG4gICAgY29uc3Qgc3RhdHVzZXM6IFN5bmNDZW50ZXJTdGF0dXNbXSA9IFtcInVucHVibGlzaGVkXCIsIFwibW9kaWZpZWRcIiwgXCJwdWJsaXNoZWRcIiwgXCJsb2NhbERlbGV0ZWRcIl07XG4gICAgc3RhdHVzZXMuZm9yRWFjaCgoc3RhdHVzKSA9PiB0aGlzLnJlbmRlclN0YXR1c1NlY3Rpb24oYm9keUVsLCBzdGF0dXMpKTtcbiAgfVxuXG4gIHJlbmRlckhlYWRlcihjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBoZWFkZXJFbCA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtY2VudGVyLWhlYWRlclwiIH0pO1xuICAgIGNvbnN0IHRpdGxlR3JvdXBFbCA9IGhlYWRlckVsLmNyZWF0ZURpdigpO1xuICAgIGNvbnN0IHRpdGxlUm93RWwgPSB0aXRsZUdyb3VwRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1jZW50ZXItdGl0bGUtcm93XCIgfSk7XG4gICAgdGl0bGVSb3dFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJcdTU0MENcdTZCNjVcdTRFMkRcdTVGQzNcIiB9KTtcbiAgICBjb25zdCByZWZyZXNoQnV0dG9uID0gdGl0bGVSb3dFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLWljb24tYnV0dG9uXCIgfSk7XG4gICAgcmVmcmVzaEJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcbiAgICByZWZyZXNoQnV0dG9uLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgXCJcdTUyMzdcdTY1QjBcdTU0MENcdTZCNjVcdTRFMkRcdTVGQzNcIik7XG4gICAgcmVmcmVzaEJ1dHRvbi5zZXRBdHRyaWJ1dGUoXCJ0aXRsZVwiLCBcIlx1NTIzN1x1NjVCMFwiKTtcbiAgICBzZXRJY29uKHJlZnJlc2hCdXR0b24sIFwicmVmcmVzaC1jd1wiKTtcbiAgICByZWZyZXNoQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB2b2lkIHRoaXMucmVmcmVzaCgpKTtcbiAgICB0aXRsZUdyb3VwRWwuY3JlYXRlRGl2KHtcbiAgICAgIGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLW11dGVkXCIsXG4gICAgICB0ZXh0OiBgJHt0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZXBvc2l0b3J5VXJsIHx8IFwiXHU2NzJBXHU5MTREXHU3RjZFXHU0RUQzXHU1RTkzXCJ9IFx1MDBCNyAke3RoaXMucGx1Z2luLnNldHRpbmdzLmJyYW5jaCB8fCBcIlx1NjcyQVx1OTE0RFx1N0Y2RVx1NTIwNlx1NjUyRlwifWBcbiAgICB9KTtcbiAgfVxuXG4gIHJlbmRlclN1bW1hcnkoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3Qgc3VtbWFyeUVsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1zdW1tYXJ5XCIgfSk7XG4gICAgY29uc3Qgc3RhdHVzZXM6IFN5bmNDZW50ZXJTdGF0dXNbXSA9IFtcInVucHVibGlzaGVkXCIsIFwibW9kaWZpZWRcIiwgXCJwdWJsaXNoZWRcIiwgXCJsb2NhbERlbGV0ZWRcIl07XG5cbiAgICBzdGF0dXNlcy5mb3JFYWNoKChzdGF0dXMpID0+IHtcbiAgICAgIGNvbnN0IGNvdW50ID0gdGhpcy5pdGVtcy5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uc3RhdHVzID09PSBzdGF0dXMpLmxlbmd0aDtcbiAgICAgIGNvbnN0IGJhZGdlRWwgPSBzdW1tYXJ5RWwuY3JlYXRlRGl2KHtcbiAgICAgICAgY2xzOiBgb2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXN1bW1hcnktaXRlbSAke3RvU3luY0NlbnRlclN0YXR1c0NsYXNzKHN0YXR1cyl9YFxuICAgICAgfSk7XG4gICAgICBiYWRnZUVsLmNyZWF0ZVNwYW4oeyB0ZXh0OiB0b1N5bmNDZW50ZXJTdGF0dXNMYWJlbChzdGF0dXMpIH0pO1xuICAgICAgYmFkZ2VFbC5jcmVhdGVTcGFuKHsgdGV4dDogU3RyaW5nKGNvdW50KSwgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1zdW1tYXJ5LWNvdW50XCIgfSk7XG4gICAgfSk7XG4gIH1cblxuICByZW5kZXJUb29sYmFyKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnN0IHRvb2xiYXJFbCA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtdG9vbGJhclwiIH0pO1xuICAgIGNvbnN0IHNlbGVjdGVkTG9jYWxDb3VudCA9IHRoaXMuZ2V0U2VsZWN0ZWRMb2NhbEl0ZW1zKCkubGVuZ3RoO1xuICAgIGNvbnN0IHNlbGVjdGVkUmVtb3RlT25seUNvdW50ID0gdGhpcy5nZXRTZWxlY3RlZFJlbW90ZU9ubHlJdGVtcygpLmxlbmd0aDtcbiAgICBjb25zdCBzZWxlY3RlZFJlbW90ZUNvdW50ID0gdGhpcy5nZXRTZWxlY3RlZFJlbW90ZUl0ZW1zKCkubGVuZ3RoO1xuXG4gICAgdG9vbGJhckVsLmNyZWF0ZURpdih7XG4gICAgICBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1tdXRlZFwiLFxuICAgICAgdGV4dDogYFx1NURGMlx1OTAwOVx1NjJFOSAke3RoaXMuc2VsZWN0ZWRJZHMuc2l6ZX0gXHU5ODc5YFxuICAgIH0pO1xuXG4gICAgY29uc3QgY3JlYXRlVG9vbGJhckJ1dHRvbiA9IChsYWJlbDogc3RyaW5nLCBpY29uOiBzdHJpbmcpID0+IHtcbiAgICAgIGNvbnN0IGJ1dHRvbkVsID0gdG9vbGJhckVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIpO1xuICAgICAgYnV0dG9uRWwudHlwZSA9IFwiYnV0dG9uXCI7XG5cbiAgICAgIGNvbnN0IGljb25FbCA9IGJ1dHRvbkVsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1idXR0b24taWNvblwiIH0pO1xuICAgICAgc2V0SWNvbihpY29uRWwsIGljb24pO1xuICAgICAgYnV0dG9uRWwuY3JlYXRlU3Bhbih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLWJ1dHRvbi1sYWJlbFwiLCB0ZXh0OiBsYWJlbCB9KTtcblxuICAgICAgcmV0dXJuIGJ1dHRvbkVsO1xuICAgIH07XG5cbiAgICBjb25zdCBkZWxldGVCdXR0b24gPSBjcmVhdGVUb29sYmFyQnV0dG9uKGBcdTUyMjBcdTk2NjRcdThGRENcdTdBRUYgKCR7c2VsZWN0ZWRSZW1vdGVDb3VudH0pYCwgXCJjbG91ZC1vZmZcIik7XG4gICAgZGVsZXRlQnV0dG9uLmRpc2FibGVkID0gc2VsZWN0ZWRSZW1vdGVDb3VudCA9PT0gMDtcbiAgICBkZWxldGVCdXR0b24uYWRkQ2xhc3MoXCJtb2Qtd2FybmluZ1wiKTtcbiAgICBkZWxldGVCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5kZWxldGVTZWxlY3RlZFJlbW90ZUZpbGVzKCkpO1xuXG4gICAgY29uc3QgcHVsbEJ1dHRvbiA9IGNyZWF0ZVRvb2xiYXJCdXR0b24oYFx1NjJDOVx1NTNENlx1OEZEQ1x1N0FFRiAoJHtzZWxlY3RlZFJlbW90ZU9ubHlDb3VudH0pYCwgXCJjbG91ZC1kb3dubG9hZFwiKTtcbiAgICBwdWxsQnV0dG9uLmRpc2FibGVkID0gc2VsZWN0ZWRSZW1vdGVPbmx5Q291bnQgPT09IDA7XG4gICAgcHVsbEJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdm9pZCB0aGlzLnB1bGxTZWxlY3RlZFJlbW90ZUZpbGVzKCkpO1xuXG4gICAgY29uc3Qgc3luY0J1dHRvbiA9IGNyZWF0ZVRvb2xiYXJCdXR0b24oYFx1NTQwQ1x1NkI2NVx1NjcyQ1x1NTczMCAoJHtzZWxlY3RlZExvY2FsQ291bnR9KWAsIFwiY2xvdWQtdXBsb2FkXCIpO1xuICAgIHN5bmNCdXR0b24uZGlzYWJsZWQgPSBzZWxlY3RlZExvY2FsQ291bnQgPT09IDA7XG4gICAgc3luY0J1dHRvbi5hZGRDbGFzcyhcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1hY3Rpb25cIik7XG4gICAgc3luY0J1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdm9pZCB0aGlzLnN5bmNTZWxlY3RlZExvY2FsRmlsZXMoKSk7XG4gIH1cblxuICByZW5kZXJTdGF0dXNTZWN0aW9uKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgc3RhdHVzOiBTeW5jQ2VudGVyU3RhdHVzKSB7XG4gICAgY29uc3Qgc2VjdGlvbkl0ZW1zID0gdGhpcy5pdGVtcy5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uc3RhdHVzID09PSBzdGF0dXMpO1xuICAgIGNvbnN0IHNlY3Rpb25FbCA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtc2VjdGlvblwiIH0pO1xuICAgIGNvbnN0IGhlYWRlckVsID0gc2VjdGlvbkVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtc2VjdGlvbi1oZWFkZXJcIiB9KTtcbiAgICBoZWFkZXJFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogdG9TeW5jQ2VudGVyU3RhdHVzTGFiZWwoc3RhdHVzKSB9KTtcbiAgICBoZWFkZXJFbC5jcmVhdGVTcGFuKHtcbiAgICAgIGNsczogYG9ic2lkaWFuLWdpdC1zeW5jZXItc3RhdHVzLWJhZGdlICR7dG9TeW5jQ2VudGVyU3RhdHVzQ2xhc3Moc3RhdHVzKX1gLFxuICAgICAgdGV4dDogU3RyaW5nKHNlY3Rpb25JdGVtcy5sZW5ndGgpXG4gICAgfSk7XG5cbiAgICBpZiAoc2VjdGlvbkl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgc2VjdGlvbkVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtY2VudGVyLWVtcHR5XCIsIHRleHQ6IFwiXHU2NjgyXHU2NUUwXHU2NTg3XHU0RUY2XHUzMDAyXCIgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgdHJlZSA9IHRoaXMuYnVpbGRUcmVlKHNlY3Rpb25JdGVtcyk7XG4gICAgY29uc3QgdHJlZUVsID0gc2VjdGlvbkVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtdHJlZVwiIH0pO1xuICAgIHRoaXMucmVuZGVyVHJlZUNvbnRlbnRzKHRyZWVFbCwgdHJlZSwgMCk7XG4gIH1cblxuICByZW5kZXJUcmVlQ29udGVudHMoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBub2RlOiBTeW5jVHJlZU5vZGUsIGRlcHRoOiBudW1iZXIpIHtcbiAgICBBcnJheS5mcm9tKG5vZGUuY2hpbGRyZW4udmFsdWVzKCkpXG4gICAgICAuc29ydCgoYSwgYikgPT4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lLCBcInpoLUNOXCIpKVxuICAgICAgLmZvckVhY2goKGNoaWxkKSA9PiB7XG4gICAgICAgIHRoaXMucmVuZGVyRGlyZWN0b3J5Um93KGNvbnRhaW5lckVsLCBjaGlsZCwgZGVwdGgpO1xuICAgICAgICBpZiAoIXRoaXMuY29sbGFwc2VkUGF0aHMuaGFzKGNoaWxkLnBhdGgpKSB7XG4gICAgICAgICAgdGhpcy5yZW5kZXJUcmVlQ29udGVudHMoY29udGFpbmVyRWwsIGNoaWxkLCBkZXB0aCArIDEpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgIG5vZGUuaXRlbXNcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUsIFwiemgtQ05cIikpXG4gICAgICAuZm9yRWFjaCgoaXRlbSkgPT4gdGhpcy5yZW5kZXJGaWxlUm93KGNvbnRhaW5lckVsLCBpdGVtLCBkZXB0aCkpO1xuICB9XG5cbiAgcmVuZGVyRGlyZWN0b3J5Um93KGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgbm9kZTogU3luY1RyZWVOb2RlLCBkZXB0aDogbnVtYmVyKSB7XG4gICAgY29uc3QgaXRlbXMgPSB0aGlzLmdldE5vZGVJdGVtcyhub2RlKTtcbiAgICBjb25zdCBzZWxlY3RlZENvdW50ID0gaXRlbXMuZmlsdGVyKChpdGVtKSA9PiB0aGlzLnNlbGVjdGVkSWRzLmhhcyhpdGVtLmlkKSkubGVuZ3RoO1xuICAgIGNvbnN0IGlzQ29sbGFwc2VkID0gdGhpcy5jb2xsYXBzZWRQYXRocy5oYXMobm9kZS5wYXRoKTtcbiAgICBjb25zdCByb3dFbCA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtdHJlZS1yb3cgaXMtZm9sZGVyXCIgfSk7XG4gICAgcm93RWwuYWRkQ2xhc3MoaXNDb2xsYXBzZWQgPyBcImlzLWNvbGxhcHNlZFwiIDogXCJpcy1leHBhbmRlZFwiKTtcbiAgICByb3dFbC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tc3luYy10cmVlLWRlcHRoXCIsIFN0cmluZyhkZXB0aCkpO1xuXG4gICAgY29uc3QgY2hlY2tib3ggPSByb3dFbC5jcmVhdGVFbChcImlucHV0XCIpO1xuICAgIGNoZWNrYm94LnR5cGUgPSBcImNoZWNrYm94XCI7XG4gICAgY2hlY2tib3guY2hlY2tlZCA9IHNlbGVjdGVkQ291bnQgPiAwICYmIHNlbGVjdGVkQ291bnQgPT09IGl0ZW1zLmxlbmd0aDtcbiAgICBjaGVja2JveC5pbmRldGVybWluYXRlID0gc2VsZWN0ZWRDb3VudCA+IDAgJiYgc2VsZWN0ZWRDb3VudCA8IGl0ZW1zLmxlbmd0aDtcbiAgICBjaGVja2JveC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiBldmVudC5zdG9wUHJvcGFnYXRpb24oKSk7XG4gICAgY2hlY2tib3guYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gICAgICB0aGlzLnNldEl0ZW1zU2VsZWN0ZWQoaXRlbXMsIGNoZWNrYm94LmNoZWNrZWQpO1xuICAgICAgdGhpcy5yZW5kZXJQcmVzZXJ2aW5nU2Nyb2xsKCk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBpY29uRWwgPSByb3dFbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10cmVlLWljb25cIiB9KTtcbiAgICBzZXRJY29uKGljb25FbCwgaXNDb2xsYXBzZWQgPyBcImZvbGRlci1jbG9zZWRcIiA6IFwiZm9sZGVyLW9wZW5cIik7XG5cbiAgICBjb25zdCBuYW1lRWwgPSByb3dFbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10cmVlLW5hbWVcIiwgdGV4dDogbm9kZS5uYW1lIH0pO1xuICAgIHJvd0VsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXRyZWUtbWV0YVwiLCB0ZXh0OiBgJHtpdGVtcy5sZW5ndGh9IFx1OTg3OWAgfSk7XG4gICAgcm93RWwuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMudG9nZ2xlRGlyZWN0b3J5KG5vZGUucGF0aCkpO1xuICB9XG5cbiAgcmVuZGVyRmlsZVJvdyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIGl0ZW06IFN5bmNDZW50ZXJJdGVtLCBkZXB0aDogbnVtYmVyKSB7XG4gICAgY29uc3Qgcm93RWwgPSBjb250YWluZXJFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXRyZWUtcm93IGlzLWZpbGVcIiB9KTtcbiAgICByb3dFbC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tc3luYy10cmVlLWRlcHRoXCIsIFN0cmluZyhkZXB0aCkpO1xuXG4gICAgY29uc3QgY2hlY2tib3ggPSByb3dFbC5jcmVhdGVFbChcImlucHV0XCIpO1xuICAgIGNoZWNrYm94LnR5cGUgPSBcImNoZWNrYm94XCI7XG4gICAgY2hlY2tib3guY2hlY2tlZCA9IHRoaXMuc2VsZWN0ZWRJZHMuaGFzKGl0ZW0uaWQpO1xuICAgIGNoZWNrYm94LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICAgICAgaWYgKGNoZWNrYm94LmNoZWNrZWQpIHtcbiAgICAgICAgdGhpcy5zZWxlY3RlZElkcy5hZGQoaXRlbS5pZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnNlbGVjdGVkSWRzLmRlbGV0ZShpdGVtLmlkKTtcbiAgICAgIH1cbiAgICAgIHRoaXMucmVuZGVyUHJlc2VydmluZ1Njcm9sbCgpO1xuICAgIH0pO1xuXG4gICAgY29uc3QgaWNvbkVsID0gcm93RWwuY3JlYXRlU3Bhbih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtdHJlZS1pY29uXCIgfSk7XG4gICAgc2V0SWNvbihpY29uRWwsIGl0ZW0uc3RhdHVzID09PSBcImxvY2FsRGVsZXRlZFwiID8gXCJjbG91ZC1vZmZcIiA6IGlzSW1hZ2VQYXRoKGl0ZW0ucmVtb3RlUGF0aCkgPyBcImltYWdlXCIgOiBcImZpbGUtdGV4dFwiKTtcbiAgICBjb25zdCB0ZXh0RWwgPSByb3dFbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10cmVlLXRleHRcIiB9KTtcbiAgICB0ZXh0RWwuY3JlYXRlU3Bhbih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtdHJlZS1uYW1lXCIsIHRleHQ6IGl0ZW0ubmFtZSB9KTtcbiAgICB0ZXh0RWwuY3JlYXRlU3Bhbih7XG4gICAgICBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXRyZWUtcGF0aFwiLFxuICAgICAgdGV4dDogaXRlbS5sb2NhbFBhdGggPyBpdGVtLmxvY2FsUGF0aCA6IGl0ZW0ucmVtb3RlUGF0aFxuICAgIH0pO1xuICAgIHJvd0VsLmNyZWF0ZVNwYW4oe1xuICAgICAgY2xzOiBgb2JzaWRpYW4tZ2l0LXN5bmNlci1zdGF0dXMtYmFkZ2UgJHt0b1N5bmNDZW50ZXJTdGF0dXNDbGFzcyhpdGVtLnN0YXR1cyl9YCxcbiAgICAgIHRleHQ6IHRvU3luY0NlbnRlclN0YXR1c0xhYmVsKGl0ZW0uc3RhdHVzKVxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgc3luY1NlbGVjdGVkTG9jYWxGaWxlcygpIHtcbiAgICBjb25zdCBpdGVtcyA9IHRoaXMuZ2V0U2VsZWN0ZWRMb2NhbEl0ZW1zKCk7XG4gICAgbGV0IHN1Y2Nlc3NDb3VudCA9IDA7XG4gICAgbGV0IGZhaWx1cmVDb3VudCA9IDA7XG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcbiAgICAgIGlmICghaXRlbS5maWxlKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBuZXh0U3RhdGUgPSBhd2FpdCB0aGlzLnBsdWdpbi5zeW5jRmlsZVRvR2l0SHViKGl0ZW0uZmlsZSk7XG4gICAgICAgIHN1Y2Nlc3NDb3VudCArPSAxO1xuICAgICAgICB0aGlzLnNlbGVjdGVkSWRzLmRlbGV0ZShpdGVtLmlkKTtcbiAgICAgICAgdGhpcy5kZWxldGVkUmVtb3RlUGF0aHMuZGVsZXRlKGl0ZW0ucmVtb3RlUGF0aCk7XG4gICAgICAgIGl0ZW0uc3RhdHVzID0gXCJwdWJsaXNoZWRcIjtcbiAgICAgICAgaXRlbS5zdGF0ZSA9IG5leHRTdGF0ZTtcbiAgICAgICAgaXRlbS5yZW1vdGUgPSB7XG4gICAgICAgICAgcmVtb3RlUGF0aDogaXRlbS5yZW1vdGVQYXRoLFxuICAgICAgICAgIHNoYTogbmV4dFN0YXRlLnNoYSA/PyBcIlwiLFxuICAgICAgICAgIGh0bWxVcmw6IG5leHRTdGF0ZS5odG1sVXJsID8/IHRoaXMucGx1Z2luLmJ1aWxkR2l0SHViQmxvYlVybChpdGVtLnJlbW90ZVBhdGgpXG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgZmFpbHVyZUNvdW50ICs9IDE7XG4gICAgICB9XG4gICAgfVxuXG4gICAgbmV3IE5vdGljZShgXHU1NDBDXHU2QjY1XHU1QjhDXHU2MjEwXHVGRjFBXHU2MjEwXHU1MjlGICR7c3VjY2Vzc0NvdW50fVx1RkYwQ1x1NTkzMVx1OEQyNSAke2ZhaWx1cmVDb3VudH1gKTtcbiAgICB0aGlzLnJlbmRlclByZXNlcnZpbmdTY3JvbGwoKTtcbiAgfVxuXG4gIGFzeW5jIHB1bGxTZWxlY3RlZFJlbW90ZUZpbGVzKCkge1xuICAgIGNvbnN0IGl0ZW1zID0gdGhpcy5nZXRTZWxlY3RlZFJlbW90ZU9ubHlJdGVtcygpO1xuICAgIGxldCBzdWNjZXNzQ291bnQgPSAwO1xuICAgIGxldCBmYWlsdXJlQ291bnQgPSAwO1xuXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5wdWxsUmVtb3RlRmlsZShpdGVtLnJlbW90ZVBhdGgpO1xuICAgICAgICBzdWNjZXNzQ291bnQgKz0gMTtcbiAgICAgICAgdGhpcy5zZWxlY3RlZElkcy5kZWxldGUoaXRlbS5pZCk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgZmFpbHVyZUNvdW50ICs9IDE7XG4gICAgICB9XG4gICAgfVxuXG4gICAgbmV3IE5vdGljZShgXHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHU2MkM5XHU1M0Q2XHU1QjhDXHU2MjEwXHVGRjFBXHU2MjEwXHU1MjlGICR7c3VjY2Vzc0NvdW50fVx1RkYwQ1x1NTkzMVx1OEQyNSAke2ZhaWx1cmVDb3VudH1gKTtcbiAgICBhd2FpdCB0aGlzLnJlZnJlc2goKTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZVNlbGVjdGVkUmVtb3RlRmlsZXMoKSB7XG4gICAgY29uc3QgaXRlbXMgPSB0aGlzLmdldFNlbGVjdGVkUmVtb3RlSXRlbXMoKTtcbiAgICBsZXQgc3VjY2Vzc0NvdW50ID0gMDtcbiAgICBsZXQgZmFpbHVyZUNvdW50ID0gMDtcblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uZGVsZXRlUmVtb3RlUGF0aChpdGVtLnJlbW90ZVBhdGgpO1xuICAgICAgICB0aGlzLmRlbGV0ZWRSZW1vdGVQYXRocy5hZGQoaXRlbS5yZW1vdGVQYXRoKTtcbiAgICAgICAgaWYgKGl0ZW0uZmlsZSkge1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNldFN0YXRlKGl0ZW0uZmlsZSwge1xuICAgICAgICAgICAgcmVtb3RlUGF0aDogaXRlbS5yZW1vdGVQYXRoLFxuICAgICAgICAgICAgc2hhOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBodG1sVXJsOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBzdGF0dXM6IFwiZGVsZXRlZFwiXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgc3VjY2Vzc0NvdW50ICs9IDE7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZGVsZXRlKGl0ZW0uaWQpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIGZhaWx1cmVDb3VudCArPSAxO1xuICAgICAgfVxuICAgIH1cblxuICAgIG5ldyBOb3RpY2UoYFx1OEZEQ1x1N0FFRlx1NkI4Qlx1NzU1OVx1NkUwNVx1NzQwNlx1NUI4Q1x1NjIxMFx1RkYxQVx1NjIxMFx1NTI5RiAke3N1Y2Nlc3NDb3VudH1cdUZGMENcdTU5MzFcdThEMjUgJHtmYWlsdXJlQ291bnR9YCk7XG4gICAgdGhpcy5pdGVtcyA9IHRoaXMuYXBwbHlEZWxldGVkUmVtb3RlT3ZlcnJpZGVzKHRoaXMuaXRlbXMpO1xuICAgIHRoaXMucmVuZGVyUHJlc2VydmluZ1Njcm9sbCgpO1xuICB9XG59XG5cbmNsYXNzIFBsdWdpblZlcnNpb25Nb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgcGx1Z2luOiBPYnNpZGlhbkdpdFN5bmNlclBsdWdpbjtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBPYnNpZGlhbkdpdFN5bmNlclBsdWdpbikge1xuICAgIHN1cGVyKGFwcCk7XG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gIH1cblxuICBvbk9wZW4oKSB7XG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG4gICAgY29udGVudEVsLmVtcHR5KCk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIlx1NjNEMlx1NEVGNlx1NzI0OFx1NjcyQ1x1NEZFMVx1NjA2RlwiIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgXHU1NDBEXHU3OUYwXHVGRjFBJHt0aGlzLnBsdWdpbi5tYW5pZmVzdC5uYW1lfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBcdTcyNDhcdTY3MkNcdUZGMUEke3RoaXMucGx1Z2luLm1hbmlmZXN0LnZlcnNpb259YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFx1NjNEMlx1NEVGNiBJRFx1RkYxQSR7dGhpcy5wbHVnaW4ubWFuaWZlc3QuaWR9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFx1NjcwMFx1NEY0RSBPYnNpZGlhbiBcdTcyNDhcdTY3MkNcdUZGMUEke3RoaXMucGx1Z2luLm1hbmlmZXN0Lm1pbkFwcFZlcnNpb259YCB9KTtcbiAgfVxufVxuXG5jbGFzcyBHaXRTeW5jZXJTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XG4gIHBsdWdpbjogT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW47XG4gIGFjdGl2ZVNlY3Rpb246IFwiZ2VuZXJhbFwiIHwgXCJyZW1vdGVcIiB8IFwic3luY1wiIHwgXCJtZWRpYVwiIHwgXCJkZWJ1Z1wiID0gXCJnZW5lcmFsXCI7XG4gIHNlYXJjaFF1ZXJ5ID0gXCJcIjtcbiAgcm9vdEVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBuYXZFbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgcGFuZWxFbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBPYnNpZGlhbkdpdFN5bmNlclBsdWdpbikge1xuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgfVxuXG4gIGdldFNlY3Rpb25zKCkge1xuICAgIHJldHVybiBbXG4gICAgICB7XG4gICAgICAgIGlkOiBcImdlbmVyYWxcIiBhcyBjb25zdCxcbiAgICAgICAgbGFiZWw6IFwiXHU5MDFBXHU3NTI4XHU4QkJFXHU3RjZFXCIsXG4gICAgICAgIHRpdGxlOiBcIlx1OTAxQVx1NzUyOFx1OEJCRVx1N0Y2RVwiLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJcdTdCQTFcdTc0MDZcdTY3MkNcdTU3MzBcdTU0MENcdTZCNjVcdTc2RUVcdTVGNTVcdTU0OENcdTYzRDJcdTRFRjZcdTU3RkFcdTc4NDBcdTRGRTFcdTYwNkZcdTMwMDJcIlxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgaWQ6IFwicmVtb3RlXCIgYXMgY29uc3QsXG4gICAgICAgIGxhYmVsOiBcIkdpdEh1YiBcdTkxNERcdTdGNkVcIixcbiAgICAgICAgdGl0bGU6IFwiR2l0SHViIFx1OTE0RFx1N0Y2RVwiLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJcdTkxNERcdTdGNkUgR2l0SHViIFx1NEVEM1x1NUU5M1x1MzAwMVRva2VuXHUzMDAxXHU3NTI4XHU2MjM3XHU1NDBEXHU1NDhDXHU3NkVFXHU2ODA3XHU1MjA2XHU2NTJGXHUzMDAyXCJcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIGlkOiBcInN5bmNcIiBhcyBjb25zdCxcbiAgICAgICAgbGFiZWw6IFwiXHU1NDBDXHU2QjY1XHU2M0E3XHU1MjM2XCIsXG4gICAgICAgIHRpdGxlOiBcIlx1NTQwQ1x1NkI2NVx1NjNBN1x1NTIzNlwiLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJcdTY3RTVcdTc3MEIgY29udGVudCBcdTc2RUVcdTVGNTVcdTY2MjBcdTVDMDRcdTMwMDFcdTcyQjZcdTYwMDFcdTdGMTNcdTVCNThcdTU0OENcdTU0MENcdTZCNjVcdTdCNTZcdTc1NjVcdTMwMDJcIlxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgaWQ6IFwibWVkaWFcIiBhcyBjb25zdCxcbiAgICAgICAgbGFiZWw6IFwiXHU5NjQ0XHU0RUY2XHU1OTA0XHU3NDA2XCIsXG4gICAgICAgIHRpdGxlOiBcIlx1OTY0NFx1NEVGNlx1NTkwNFx1NzQwNlwiLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJcdTU0MEVcdTdFRURcdTUzRUZcdTYyNjlcdTVDNTVcdTU2RkVcdTcyNDdcdTRFMEFcdTRGMjBcdTMwMDFcdTk2NDRcdTRFRjZcdTU5MERcdTUyMzZcdTU0OENcdThENDRcdTZFOTBcdTVGMTVcdTc1MjhcdTkxQ0RcdTUxOTlcdTMwMDJcIlxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgaWQ6IFwiZGVidWdcIiBhcyBjb25zdCxcbiAgICAgICAgbGFiZWw6IFwiXHU4QzAzXHU4QkQ1XCIsXG4gICAgICAgIHRpdGxlOiBcIlx1OEMwM1x1OEJENVx1NEUwRVx1NjVFNVx1NUZEN1wiLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJcdTY3RTVcdTc3MEJcdTYzRDJcdTRFRjZcdTcyNDhcdTY3MkNcdTU0OENcdThCQ0FcdTY1QURcdTUxNjVcdTUzRTNcdTMwMDJcIlxuICAgICAgfVxuICAgIF07XG4gIH1cblxuICBnZXRGaWx0ZXJUZXh0KC4uLnBhcnRzOiBBcnJheTxzdHJpbmcgfCB1bmRlZmluZWQ+KSB7XG4gICAgcmV0dXJuIHBhcnRzXG4gICAgICAuZmlsdGVyKChwYXJ0KTogcGFydCBpcyBzdHJpbmcgPT4gQm9vbGVhbihwYXJ0KSlcbiAgICAgIC5qb2luKFwiIFwiKVxuICAgICAgLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICBjcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIC4uLnBhcnRzOiBBcnJheTxzdHJpbmcgfCB1bmRlZmluZWQ+KSB7XG4gICAgY29uc3Qgc2V0dGluZyA9IG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKTtcbiAgICBzZXR0aW5nLnNldHRpbmdFbC5kYXRhc2V0LmZpbHRlclRleHQgPSB0aGlzLmdldEZpbHRlclRleHQoLi4ucGFydHMpO1xuICAgIHJldHVybiBzZXR0aW5nO1xuICB9XG5cbiAgcmVuZGVyU2VhcmNoQmFyKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnN0IHNlYXJjaFNldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0Q2xhc3MoXCJvYnNpZGlhbi1naXQtc3luY2VyLXNldHRpbmdzLXNlYXJjaC1yb3dcIik7XG4gICAgc2VhcmNoU2V0dGluZy5pbmZvRWwucmVtb3ZlKCk7XG4gICAgc2VhcmNoU2V0dGluZy5hZGRTZWFyY2goKHNlYXJjaCkgPT5cbiAgICAgIHNlYXJjaC5zZXRQbGFjZWhvbGRlcihcIlx1NjQxQ1x1N0QyMlx1OTc2Mlx1Njc3Rlx1OEJCRVx1N0Y2RS4uLlwiKS5zZXRWYWx1ZSh0aGlzLnNlYXJjaFF1ZXJ5KS5vbkNoYW5nZSgodmFsdWUpID0+IHtcbiAgICAgICAgdGhpcy5zZWFyY2hRdWVyeSA9IHZhbHVlO1xuICAgICAgICBjb25zdCBwYW5lbEVsID0gdGhpcy5jb250YWluZXJFbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIi5vYnNpZGlhbi1naXQtc3luY2VyLXNldHRpbmdzLXBhbmVsXCIpO1xuICAgICAgICBpZiAocGFuZWxFbCkge1xuICAgICAgICAgIHRoaXMuYXBwbHlTZWFyY2hGaWx0ZXIocGFuZWxFbCk7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIHJlbmRlclNlY3Rpb25UYWJzKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnN0IG5hdkVsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3MtbmF2XCIgfSk7XG4gICAgdGhpcy5uYXZFbCA9IG5hdkVsO1xuXG4gICAgdGhpcy5nZXRTZWN0aW9ucygpLmZvckVhY2goKHNlY3Rpb24pID0+IHtcbiAgICAgIGNvbnN0IGJ1dHRvbiA9IG5hdkVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcbiAgICAgICAgY2xzOiBgb2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1uYXYtaXRlbSR7dGhpcy5hY3RpdmVTZWN0aW9uID09PSBzZWN0aW9uLmlkID8gXCIgaXMtYWN0aXZlXCIgOiBcIlwifWAsXG4gICAgICAgIHRleHQ6IHNlY3Rpb24ubGFiZWxcbiAgICAgIH0pO1xuICAgICAgYnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICAgIGlmICh0aGlzLmFjdGl2ZVNlY3Rpb24gPT09IHNlY3Rpb24uaWQpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmFjdGl2ZVNlY3Rpb24gPSBzZWN0aW9uLmlkO1xuICAgICAgICB0aGlzLnN5bmNUYWJTdGF0ZSgpO1xuICAgICAgICBpZiAodGhpcy5wYW5lbEVsKSB7XG4gICAgICAgICAgdGhpcy5yZW5kZXJQYW5lbCh0aGlzLnBhbmVsRWwpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHN5bmNUYWJTdGF0ZSgpIHtcbiAgICBpZiAoIXRoaXMubmF2RWwpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpdGVtcyA9IEFycmF5LmZyb20odGhpcy5uYXZFbC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcIi5vYnNpZGlhbi1naXQtc3luY2VyLXNldHRpbmdzLW5hdi1pdGVtXCIpKTtcbiAgICBpdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xuICAgICAgY29uc3Qgc2VjdGlvbiA9IHRoaXMuZ2V0U2VjdGlvbnMoKVtpbmRleF07XG4gICAgICBpdGVtLmNsYXNzTGlzdC50b2dnbGUoXCJpcy1hY3RpdmVcIiwgc2VjdGlvbj8uaWQgPT09IHRoaXMuYWN0aXZlU2VjdGlvbik7XG4gICAgfSk7XG4gIH1cblxuICByZW5kZXJQbGFjZWhvbGRlclNldHRpbmcoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCB0aXRsZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBiYWRnZSA9IFwiXHU4OUM0XHU1MjEyXHU0RTJEXCIpIHtcbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCB0aXRsZSwgZGVzY3JpcHRpb24sIGJhZGdlKVxuICAgICAgLnNldE5hbWUodGl0bGUpXG4gICAgICAuc2V0RGVzYyhgJHtkZXNjcmlwdGlvbn1cdUZGMDgke2JhZGdlfVx1RkYwOWApO1xuICB9XG5cbiAgcmVuZGVyU2VjdGlvblN1YmhlYWRpbmcoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCB0ZXh0OiBzdHJpbmcpIHtcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZSh0ZXh0KS5zZXRIZWFkaW5nKCk7XG4gIH1cblxuICByZW5kZXJDb25uZWN0aW9uU3RhdHVzKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLnBsdWdpbi5kYXRhLmNvbm5lY3Rpb24gPz8gREVGQVVMVF9EQVRBLmNvbm5lY3Rpb247XG4gICAgY29uc3Qgc3RhdHVzRWwgPSBjb250YWluZXJFbC5jcmVhdGVEaXYoe1xuICAgICAgY2xzOiBgb2JzaWRpYW4tZ2l0LXN5bmNlci1jb25uZWN0aW9uLXN0YXR1cyBpcy0ke2Nvbm5lY3Rpb24/LnN0YXR1cyA/PyBcInVua25vd25cIn1gXG4gICAgfSk7XG4gICAgY29uc3QgaWNvbkVsID0gc3RhdHVzRWwuY3JlYXRlU3Bhbih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLWNvbm5lY3Rpb24tc3RhdHVzLWljb25cIiB9KTtcbiAgICBjb25zdCBpY29uTmFtZSA9XG4gICAgICBjb25uZWN0aW9uPy5zdGF0dXMgPT09IFwic3VjY2Vzc1wiXG4gICAgICAgID8gXCJjaGVjay1jaXJjbGUtMlwiXG4gICAgICAgIDogY29ubmVjdGlvbj8uc3RhdHVzID09PSBcImZhaWxlZFwiXG4gICAgICAgICAgPyBcIngtY2lyY2xlXCJcbiAgICAgICAgICA6IGNvbm5lY3Rpb24/LnN0YXR1cyA9PT0gXCJzdGFsZVwiXG4gICAgICAgICAgICA/IFwiYWxlcnQtY2lyY2xlXCJcbiAgICAgICAgICAgIDogXCJjaXJjbGUtaGVscFwiO1xuICAgIHNldEljb24oaWNvbkVsLCBpY29uTmFtZSk7XG4gICAgc3RhdHVzRWwuY3JlYXRlU3Bhbih7XG4gICAgICBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1jb25uZWN0aW9uLXN0YXR1cy10ZXh0XCIsXG4gICAgICB0ZXh0OiBgJHtjb25uZWN0aW9uPy5tZXNzYWdlID8/IFwiXHU1QzFBXHU2NzJBXHU2RDRCXHU4QkQ1XHU4RkRFXHU2M0E1XHUzMDAyXCJ9JHtjb25uZWN0aW9uPy5jaGVja2VkQXQgPyBgIFx1MDBCNyAke2Nvbm5lY3Rpb24uY2hlY2tlZEF0fWAgOiBcIlwifWBcbiAgICB9KTtcbiAgfVxuXG4gIHJlbmRlckdlbmVyYWxTZXR0aW5ncyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBsb2NhbFJvb3RQYXRoID0gZGlzcGxheUxvY2FsUm9vdFBhdGgodGhpcy5wbHVnaW4uc2V0dGluZ3MubG9jYWxSb290UGF0aCk7XG4gICAgY29uc3QgbG9jYWxSb290RGVzY3JpcHRpb24gPSB0aGlzLnBsdWdpbi5nZXRFeGlzdGluZ0ZvbGRlcih0aGlzLnBsdWdpbi5zZXR0aW5ncy5sb2NhbFJvb3RQYXRoKVxuICAgICAgPyBgXHU1RjUzXHU1MjREXHU3NkVFXHU1RjU1XHU2NzA5XHU2NTQ4XHVGRjFBJHtsb2NhbFJvb3RQYXRofWBcbiAgICAgIDogXCJcdTUzRUFcdTY3MDlcdThCRTVcdTc2RUVcdTVGNTVcdTUxODVcdTc2ODRcdTY1ODdcdTRFRjZcdTYyNERcdTUxNDFcdThCQjhcdTU0MENcdTZCNjVcdTMwMDJcdTVGNTNcdTUyNERcdTUwM0NcdTY1RTBcdTY1NDhcdTY1RjZcdThCRjdcdTkxQ0RcdTY1QjBcdTkwMDlcdTYyRTlcdTc2RUVcdTVGNTVcdTMwMDJcIjtcblxuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiTG9jYWwgUm9vdCBQYXRoXCIsIGxvY2FsUm9vdERlc2NyaXB0aW9uLCBsb2NhbFJvb3RQYXRoKVxuICAgICAgLnNldE5hbWUoXCJMb2NhbCBSb290IFBhdGhcIilcbiAgICAgIC5zZXREZXNjKGxvY2FsUm9vdERlc2NyaXB0aW9uKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHQuc2V0VmFsdWUobG9jYWxSb290UGF0aCkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubG9jYWxSb290UGF0aCA9IG5vcm1hbGl6ZUxvY2FsUm9vdFBhdGgodmFsdWUpO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dChcIlx1OTAwOVx1NjJFOVx1NzZFRVx1NUY1NVwiKS5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICBuZXcgRm9sZGVyU2VsZWN0TW9kYWwodGhpcy5hcHAsIHRoaXMucGx1Z2luLCBhc3luYyAoZm9sZGVyKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zZXRMb2NhbFJvb3RQYXRoKGZvbGRlci5wYXRoKTtcbiAgICAgICAgICAgICAgbmV3IE5vdGljZShgXHU1REYyXHU4QkJFXHU3RjZFIExvY2FsIFJvb3QgUGF0aFx1RkYxQSR7ZGlzcGxheUxvY2FsUm9vdFBhdGgodGhpcy5wbHVnaW4uc2V0dGluZ3MubG9jYWxSb290UGF0aCl9YCk7XG4gICAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJcdThCQkVcdTdGNkVcdTU5MzFcdThEMjVcIjtcbiAgICAgICAgICAgICAgbmV3IE5vdGljZShtZXNzYWdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KS5vcGVuKCk7XG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJcdThGRENcdTdBRUZcdTc2RUVcdTVGNTVcIiwgXCJcdTU2RkFcdTVCOUFcdTUxOTlcdTUxNjUgR2l0SHViIFx1NEVEM1x1NUU5MyBjb250ZW50IFx1NzZFRVx1NUY1NVx1MzAwMlwiLCBSRU1PVEVfQ09OVEVOVF9ST09UKVxuICAgICAgLnNldE5hbWUoXCJcdThGRENcdTdBRUZcdTc2RUVcdTVGNTVcIilcbiAgICAgIC5zZXREZXNjKFwiXHU2M0QyXHU0RUY2XHU1M0VBXHU4QkZCXHU1MTk5XHU0RUQzXHU1RTkzIGNvbnRlbnQgXHU3NkVFXHU1RjU1XHVGRjFCXHU2NzJDXHU1NzMwXHU1NDBDXHU2QjY1XHU3NkVFXHU1RjU1XHU1MTg1XHU3Njg0XHU3NkY4XHU1QkY5XHU4REVGXHU1Rjg0XHU0RjFBXHU2NjIwXHU1QzA0XHU1MjMwIGNvbnRlbnQgXHU0RTBCXHUzMDAyXCIpO1xuXG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJcdTYzRDJcdTRFRjZcdTcyNDhcdTY3MkNcIiwgdGhpcy5wbHVnaW4ubWFuaWZlc3QudmVyc2lvbiwgdGhpcy5wbHVnaW4ubWFuaWZlc3QuaWQpXG4gICAgICAuc2V0TmFtZShcIlx1NjNEMlx1NEVGNlx1NzI0OFx1NjcyQ1wiKVxuICAgICAgLnNldERlc2MoYCR7dGhpcy5wbHVnaW4ubWFuaWZlc3QubmFtZX0gdiR7dGhpcy5wbHVnaW4ubWFuaWZlc3QudmVyc2lvbn0gXHUwMEI3ICR7dGhpcy5wbHVnaW4ubWFuaWZlc3QuaWR9YCk7XG4gIH1cblxuICByZW5kZXJSZW1vdGVTZXR0aW5ncyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKFxuICAgICAgY29udGFpbmVyRWwsXG4gICAgICBcIlJlcG9zaXRvcnkgVVJMXCIsXG4gICAgICBcIlx1NEY4Qlx1NTk4MiBodHRwczovL2dpdGh1Yi5jb20vaW1saXVzeC9vYnNpZGlhbi1naXQtc3luY2VyLmdpdFwiLFxuICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmVwb3NpdG9yeVVybFxuICAgIClcbiAgICAgIC5zZXROYW1lKFwiUmVwb3NpdG9yeSBVUkxcIilcbiAgICAgIC5zZXREZXNjKFwiR2l0SHViIFx1OTg3OVx1NzZFRVx1NEVEM1x1NUU5M1x1NTczMFx1NTc0MFx1RkYwQ1x1NjUyRlx1NjMwMSBIVFRQU1x1MzAwMVNTSCBcdTYyMTYgb3duZXIvcmVwb1x1MzAwMlwiKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby5naXRcIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucmVwb3NpdG9yeVVybClcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZXBvc2l0b3J5VXJsID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ubWFya0Nvbm5lY3Rpb25TdGFsZSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIkdpdEh1YiBVc2VybmFtZVwiLCBcIlx1NUY1M1x1NTI0RFx1NjM4OFx1Njc0MyBUb2tlbiBcdTVCRjlcdTVFOTRcdTc2ODQgR2l0SHViIFx1NzUyOFx1NjIzN1x1NTQwRFx1MzAwMlwiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5naXRodWJVc2VybmFtZSlcbiAgICAgIC5zZXROYW1lKFwiR2l0SHViIFVzZXJuYW1lXCIpXG4gICAgICAuc2V0RGVzYyhcIlx1NUY1M1x1NTI0RFx1NjM4OFx1Njc0MyBUb2tlbiBcdTVCRjlcdTVFOTRcdTc2ODQgR2l0SHViIFx1NzUyOFx1NjIzN1x1NTQwRFx1MzAwMlwiKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJpbWxpdXN4XCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmdpdGh1YlVzZXJuYW1lKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmdpdGh1YlVzZXJuYW1lID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ubWFya0Nvbm5lY3Rpb25TdGFsZSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIkdpdEh1YiBUb2tlblwiLCBcIkZpbmUtZ3JhaW5lZCBUb2tlbiBcdTk3MDBcdTg5ODFcdTVGMDBcdTU0MkYgQ29udGVudHMgXHU4QkZCXHU1MTk5XHU2NzQzXHU5NjUwXHUzMDAyXCIpXG4gICAgICAuc2V0TmFtZShcIkdpdEh1YiBUb2tlblwiKVxuICAgICAgLnNldERlc2MoXCJGaW5lLWdyYWluZWQgVG9rZW4gXHU5NzAwXHU4OTgxXHU2Mzg4XHU2NzQzXHU3NkVFXHU2ODA3XHU0RUQzXHU1RTkzXHVGRjBDXHU1RTc2XHU1RjAwXHU1NDJGIENvbnRlbnRzIFx1OEJGQlx1NTE5OVx1Njc0M1x1OTY1MFx1MzAwMlwiKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+IHtcbiAgICAgICAgdGV4dC5pbnB1dEVsLnR5cGUgPSBcInBhc3N3b3JkXCI7XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJnaXRodWJfcGF0Xy4uLlwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5naXRodWJUb2tlbilcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5naXRodWJUb2tlbiA9IHZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLm1hcmtDb25uZWN0aW9uU3RhbGUoKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIkJyYW5jaFwiLCBcIlx1NEY4Qlx1NTk4MiBtYWluXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLmJyYW5jaClcbiAgICAgIC5zZXROYW1lKFwiQnJhbmNoXCIpXG4gICAgICAuc2V0RGVzYyhcIlx1NTQwQ1x1NkI2NVx1NTE5OVx1NTE2NVx1NzY4NFx1NzZFRVx1NjgwN1x1NTIwNlx1NjUyRlx1MzAwMlwiKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJtYWluXCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmJyYW5jaClcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5icmFuY2ggPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5tYXJrQ29ubmVjdGlvblN0YWxlKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiXHU2RDRCXHU4QkQ1XHU4RkRFXHU2M0E1XCIsIFwiXHU5QThDXHU4QkMxXHU1RjUzXHU1MjREXHU0RUQzXHU1RTkzXHUzMDAxVG9rZW4gXHU1NDhDXHU1MjA2XHU2NTJGXHU5MTREXHU3RjZFXHU2NjJGXHU1NDI2XHU1M0VGXHU4QkJGXHU5NUVFXHUzMDAyXCIpXG4gICAgICAuc2V0TmFtZShcIlx1NkQ0Qlx1OEJENVx1OEZERVx1NjNBNVwiKVxuICAgICAgLnNldERlc2MoXCJcdTlBOENcdThCQzFcdTVGNTNcdTUyNERcdTRFRDNcdTVFOTNcdTMwMDFUb2tlbiBcdTU0OENcdTUyMDZcdTY1MkZcdTkxNERcdTdGNkVcdTY2MkZcdTU0MjZcdTUzRUZcdThCQkZcdTk1RUVcdTMwMDJcIilcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQoXCJcdTZENEJcdThCRDVcdThGREVcdTYzQTVcIikub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnRlc3RDb25uZWN0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlclBhbmVsKHRoaXMucGFuZWxFbCA/PyBjb250YWluZXJFbCk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiXHU4RkRFXHU2M0E1XHU1OTMxXHU4RDI1XCI7XG4gICAgICAgICAgICBuZXcgTm90aWNlKG1lc3NhZ2UpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJQYW5lbCh0aGlzLnBhbmVsRWwgPz8gY29udGFpbmVyRWwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICB0aGlzLnJlbmRlckNvbm5lY3Rpb25TdGF0dXMoY29udGFpbmVyRWwpO1xuICB9XG5cbiAgcmVuZGVyU3luY1NldHRpbmdzKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiQ29udGVudCBSb290XCIsIFwiXHU1NkZBXHU1QjlBXHU0RTNBIGNvbnRlbnRcIiwgUkVNT1RFX0NPTlRFTlRfUk9PVClcbiAgICAgIC5zZXROYW1lKFwiQ29udGVudCBSb290XCIpXG4gICAgICAuc2V0RGVzYyhcIlx1OEZEQ1x1N0FFRlx1OEJGQlx1NTE5OVx1OERFRlx1NUY4NFx1NTZGQVx1NUI5QVx1NEUzQSBjb250ZW50LzxcdTY3MkNcdTU3MzBcdTc2RjhcdTVCRjlcdThERUZcdTVGODQ+XHUzMDAyXCIpO1xuXG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJcdTU0MENcdTZCNjVcdThCRjRcdTY2MEVcIiwgXCJcdTcyQjZcdTYwMDFcdTdGMTNcdTVCNThcdTMwMDFcdTY3MkNcdTU3MzBcdTRGRUVcdTY1MzlcdTY4QzBcdTZENEJcdTMwMDFcdThGRENcdTdBRUZcdTUyMjBcdTk2NjRcdTY4QzBcdTZENEJcIiwgXCJcdThCRjRcdTY2MEVcIilcbiAgICAgIC5zZXROYW1lKFwiXHU1NDBDXHU2QjY1XHU4QkY0XHU2NjBFXCIpXG4gICAgICAuc2V0RGVzYyhcIlx1NjNEMlx1NEVGNlx1NEYxQVx1N0YxM1x1NUI1OFx1NjcwMFx1OEZEMVx1NTQwQ1x1NkI2NVx1NzY4NFx1NTE4NVx1NUJCOVx1NTRDOFx1NUUwQ1x1RkYxQlx1NjcyQ1x1NTczMFx1NTE4NVx1NUJCOVx1NTNEOFx1NTMxNlx1NjYzRVx1NzkzQVx1NEUzQVx1NURGMlx1NEZFRVx1NjUzOVx1RkYwQ1x1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlx1NEUwRFx1NUI1OFx1NTcyOFx1NjYzRVx1NzkzQVx1NEUzQVx1OEZEQ1x1N0FFRlx1NURGMlx1NTIyMFx1OTY2NFx1MzAwMlwiKTtcblxuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiXHU2RTA1XHU3NDA2XHU3MkI2XHU2MDAxXHU3RjEzXHU1QjU4XCIsIFwiXHU2RTA1XHU3NDA2XHU2NzJDXHU1NzMwXHU1NDBDXHU2QjY1XHU3MkI2XHU2MDAxXHVGRjBDXHU0RTBEXHU1RjcxXHU1NENEIEdpdEh1YiBcdTRFRDNcdTVFOTNcdTY1ODdcdTRFRjZcdTMwMDJcIilcbiAgICAgIC5zZXROYW1lKFwiXHU2RTA1XHU3NDA2XHU3MkI2XHU2MDAxXHU3RjEzXHU1QjU4XCIpXG4gICAgICAuc2V0RGVzYyhcIlx1NkUwNVx1NzQwNlx1NjcyQ1x1NTczMFx1NTQwQ1x1NkI2NVx1NzJCNlx1NjAwMVx1RkYwQ1x1NEUwRFx1NUY3MVx1NTRDRCBHaXRIdWIgXHU0RUQzXHU1RTkzXHU2NTg3XHU0RUY2XHUzMDAyXCIpXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KFwiXHU2RTA1XHU3NDA2XCIpLnNldFdhcm5pbmcoKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5kYXRhLmZpbGVzID0ge307XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZUFsbERhdGEoKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5yZWZyZXNoU3RhdHVzQmFyKCk7XG4gICAgICAgICAgbmV3IE5vdGljZShcIlx1NzJCNlx1NjAwMVx1N0YxM1x1NUI1OFx1NURGMlx1NkUwNVx1NzQwNlx1MzAwMlwiKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gIH1cblxuICByZW5kZXJNZWRpYVNldHRpbmdzKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIHRoaXMucmVuZGVyUGxhY2Vob2xkZXJTZXR0aW5nKFxuICAgICAgY29udGFpbmVyRWwsXG4gICAgICBcIlx1OTY0NFx1NEVGNlx1NEUwRVx1NTZGRVx1NzI0N1wiLFxuICAgICAgXCJcdThGRDlcdTkxQ0NcdTVDMDZcdTc1MjhcdTRFOEVcdTkxNERcdTdGNkVcdTU2RkVcdTcyNDdcdTU5MERcdTUyMzZcdTdCNTZcdTc1NjVcdTMwMDFcdTk2NDRcdTRFRjZcdTc2RUVcdTVGNTVcdTY2MjBcdTVDMDRcdTMwMDFcdThGRENcdTdBMEJcdThENDRcdTZFOTBcdTU3MzBcdTU3NDBcdTRFMEVcdTVGMTVcdTc1MjhcdTkxQ0RcdTUxOTlcdTg5QzRcdTUyMTlcdTMwMDJcIlxuICAgICk7XG4gIH1cblxuICByZW5kZXJEZWJ1Z1NldHRpbmdzKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIHRoaXMucmVuZGVyUGxhY2Vob2xkZXJTZXR0aW5nKFxuICAgICAgY29udGFpbmVyRWwsXG4gICAgICBcIlx1OEMwM1x1OEJENVx1NEUwRVx1NjVFNVx1NUZEN1wiLFxuICAgICAgXCJcdThGRDlcdTkxQ0NcdTVDMDZcdTc1MjhcdTRFOEVcdTY3RTVcdTc3MEJcdTU0MENcdTZCNjVcdTY1RTVcdTVGRDdcdTMwMDFcdThCRjdcdTZDNDJcdTdFRDNcdTY3OUNcdTU0OENcdTk1MTlcdThCRUZcdTYzOTJcdTY3RTVcdTRGRTFcdTYwNkZcdTMwMDJcIlxuICAgICk7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIlx1NjNEMlx1NEVGNlx1NzI0OFx1NjcyQ1x1NEZFMVx1NjA2RlwiLCBcIlx1NjdFNVx1NzcwQlx1NzI0OFx1NjcyQ1x1MzAwMVx1NjNEMlx1NEVGNiBJRCBcdTU0OENcdTY3MDBcdTRGNEVcdTUxN0NcdTVCQjlcdTcyNDhcdTY3MkNcdTMwMDJcIilcbiAgICAgIC5zZXROYW1lKFwiXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXHU0RkUxXHU2MDZGXCIpXG4gICAgICAuc2V0RGVzYyhcIlx1NjdFNVx1NzcwQlx1NzI0OFx1NjcyQ1x1MzAwMVx1NjNEMlx1NEVGNiBJRCBcdTU0OENcdTY3MDBcdTRGNEVcdTUxN0NcdTVCQjlcdTcyNDhcdTY3MkNcdTMwMDJcIilcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQoXCJcdTYyNTNcdTVGMDBcIikub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgbmV3IFBsdWdpblZlcnNpb25Nb2RhbCh0aGlzLmFwcCwgdGhpcy5wbHVnaW4pLm9wZW4oKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gIH1cblxuICBhcHBseVNlYXJjaEZpbHRlcihwYW5lbEVsOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5zZWFyY2hRdWVyeS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBpdGVtcyA9IEFycmF5LmZyb20ocGFuZWxFbC5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PihcIi5zZXR0aW5nLWl0ZW1bZGF0YS1maWx0ZXItdGV4dF1cIikpO1xuICAgIGxldCB2aXNpYmxlQ291bnQgPSAwO1xuXG4gICAgaXRlbXMuZm9yRWFjaCgoaXRlbUVsKSA9PiB7XG4gICAgICBjb25zdCBtYXRjaGVzID0gIXF1ZXJ5IHx8IChpdGVtRWwuZGF0YXNldC5maWx0ZXJUZXh0ID8/IFwiXCIpLmluY2x1ZGVzKHF1ZXJ5KTtcbiAgICAgIGl0ZW1FbC5jbGFzc0xpc3QudG9nZ2xlKFwiaXMtaGlkZGVuXCIsICFtYXRjaGVzKTtcbiAgICAgIGlmIChtYXRjaGVzKSB7XG4gICAgICAgIHZpc2libGVDb3VudCArPSAxO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3QgZW1wdHlTdGF0ZUVsID0gcGFuZWxFbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIi5vYnNpZGlhbi1naXQtc3luY2VyLXNldHRpbmdzLWVtcHR5XCIpO1xuICAgIGlmIChlbXB0eVN0YXRlRWwpIHtcbiAgICAgIGVtcHR5U3RhdGVFbC5jbGFzc0xpc3QudG9nZ2xlKFwiaXMtaGlkZGVuXCIsIHZpc2libGVDb3VudCA+IDApO1xuICAgIH1cbiAgfVxuXG4gIHJlbmRlckFjdGl2ZVNlY3Rpb24oY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgc3dpdGNoICh0aGlzLmFjdGl2ZVNlY3Rpb24pIHtcbiAgICAgIGNhc2UgXCJnZW5lcmFsXCI6XG4gICAgICAgIHRoaXMucmVuZGVyR2VuZXJhbFNldHRpbmdzKGNvbnRhaW5lckVsKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwicmVtb3RlXCI6XG4gICAgICAgIHRoaXMucmVuZGVyUmVtb3RlU2V0dGluZ3MoY29udGFpbmVyRWwpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJzeW5jXCI6XG4gICAgICAgIHRoaXMucmVuZGVyU3luY1NldHRpbmdzKGNvbnRhaW5lckVsKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwibWVkaWFcIjpcbiAgICAgICAgdGhpcy5yZW5kZXJNZWRpYVNldHRpbmdzKGNvbnRhaW5lckVsKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwiZGVidWdcIjpcbiAgICAgICAgdGhpcy5yZW5kZXJEZWJ1Z1NldHRpbmdzKGNvbnRhaW5lckVsKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICByZW5kZXJQYW5lbChwYW5lbEVsOiBIVE1MRWxlbWVudCkge1xuICAgIHBhbmVsRWwuZW1wdHkoKTtcbiAgICB0aGlzLnJlbmRlckFjdGl2ZVNlY3Rpb24ocGFuZWxFbCk7XG4gICAgcGFuZWxFbC5jcmVhdGVEaXYoe1xuICAgICAgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3MtZW1wdHkgaXMtaGlkZGVuXCIsXG4gICAgICB0ZXh0OiBcIlx1NkNBMVx1NjcwOVx1NTMzOVx1OTE0RFx1NTIzMFx1NUY1M1x1NTI0RFx1N0I1Qlx1OTAwOVx1Njc2MVx1NEVGNlx1NzY4NFx1OEJCRVx1N0Y2RVx1OTg3OVx1MzAwMlwiXG4gICAgfSk7XG4gICAgdGhpcy5hcHBseVNlYXJjaEZpbHRlcihwYW5lbEVsKTtcbiAgfVxuXG4gIGRpc3BsYXkoKTogdm9pZCB7XG4gICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcbiAgICBjb250YWluZXJFbC5xdWVyeVNlbGVjdG9yQWxsKFwiLm9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3Mtcm9vdFwiKS5mb3JFYWNoKChlbGVtZW50KSA9PiBlbGVtZW50LnJlbW92ZSgpKTtcbiAgICB0aGlzLnJvb3RFbCA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXNldHRpbmdzLXJvb3RcIiB9KTtcbiAgICB0aGlzLm5hdkVsID0gbnVsbDtcbiAgICB0aGlzLnBhbmVsRWwgPSBudWxsO1xuXG4gICAgdGhpcy5yZW5kZXJTZWFyY2hCYXIodGhpcy5yb290RWwpO1xuICAgIHRoaXMucmVuZGVyU2VjdGlvblRhYnModGhpcy5yb290RWwpO1xuXG4gICAgY29uc3Qgc2VjdGlvbkVsID0gdGhpcy5yb290RWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3MtcGFuZWxcIiB9KTtcbiAgICB0aGlzLnBhbmVsRWwgPSBzZWN0aW9uRWw7XG4gICAgdGhpcy5yZW5kZXJQYW5lbChzZWN0aW9uRWwpO1xuICB9XG59XG5cbmNsYXNzIEZvbGRlclNlbGVjdE1vZGFsIGV4dGVuZHMgRnV6enlTdWdnZXN0TW9kYWw8VEZvbGRlcj4ge1xuICBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luO1xuICBvbkNob29zZUZvbGRlcjogKGZvbGRlcjogVEZvbGRlcikgPT4gUHJvbWlzZTx2b2lkPiB8IHZvaWQ7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgYXBwOiBBcHAsXG4gICAgcGx1Z2luOiBPYnNpZGlhbkdpdFN5bmNlclBsdWdpbixcbiAgICBvbkNob29zZUZvbGRlcjogKGZvbGRlcjogVEZvbGRlcikgPT4gUHJvbWlzZTx2b2lkPiB8IHZvaWRcbiAgKSB7XG4gICAgc3VwZXIoYXBwKTtcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgICB0aGlzLm9uQ2hvb3NlRm9sZGVyID0gb25DaG9vc2VGb2xkZXI7XG4gICAgdGhpcy5zZXRQbGFjZWhvbGRlcihcIlx1OTAwOVx1NjJFOSBMb2NhbCBSb290IFBhdGggXHU3NkVFXHU1RjU1XCIpO1xuICB9XG5cbiAgZ2V0SXRlbXMoKTogVEZvbGRlcltdIHtcbiAgICByZXR1cm4gdGhpcy5wbHVnaW4uZ2V0QWxsVmF1bHRGb2xkZXJzKCk7XG4gIH1cblxuICBnZXRJdGVtVGV4dChmb2xkZXI6IFRGb2xkZXIpOiBzdHJpbmcge1xuICAgIHJldHVybiBmb2xkZXIucGF0aCB8fCBWQVVMVF9ST09UX1BBVEg7XG4gIH1cblxuICBhc3luYyBvbkNob29zZUl0ZW0oZm9sZGVyOiBURm9sZGVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhp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LEVBQ0Y7QUFBQSxFQUVBLG9CQUFvQixhQUEwQjtBQUM1QyxZQUFRLEtBQUssZUFBZTtBQUFBLE1BQzFCLEtBQUs7QUFDSCxhQUFLLHNCQUFzQixXQUFXO0FBQ3RDO0FBQUEsTUFDRixLQUFLO0FBQ0gsYUFBSyxxQkFBcUIsV0FBVztBQUNyQztBQUFBLE1BQ0YsS0FBSztBQUNILGFBQUssbUJBQW1CLFdBQVc7QUFDbkM7QUFBQSxNQUNGLEtBQUs7QUFDSCxhQUFLLG9CQUFvQixXQUFXO0FBQ3BDO0FBQUEsTUFDRixLQUFLO0FBQ0gsYUFBSyxvQkFBb0IsV0FBVztBQUNwQztBQUFBLE1BQ0Y7QUFDRTtBQUFBLElBQ0o7QUFBQSxFQUNGO0FBQUEsRUFFQSxZQUFZLFNBQXNCO0FBQ2hDLFlBQVEsTUFBTTtBQUNkLFNBQUssb0JBQW9CLE9BQU87QUFDaEMsWUFBUSxVQUFVO0FBQUEsTUFDaEIsS0FBSztBQUFBLE1BQ0wsTUFBTTtBQUFBLElBQ1IsQ0FBQztBQUNELFNBQUssa0JBQWtCLE9BQU87QUFBQSxFQUNoQztBQUFBLEVBRUEsVUFBZ0I7QUFDZCxVQUFNLEVBQUUsWUFBWSxJQUFJO0FBQ3hCLGdCQUFZLGlCQUFpQixvQ0FBb0MsRUFBRSxRQUFRLENBQUMsWUFBWSxRQUFRLE9BQU8sQ0FBQztBQUN4RyxTQUFLLFNBQVMsWUFBWSxVQUFVLEVBQUUsS0FBSyxvQ0FBb0MsQ0FBQztBQUNoRixTQUFLLFFBQVE7QUFDYixTQUFLLFVBQVU7QUFFZixTQUFLLGdCQUFnQixLQUFLLE1BQU07QUFDaEMsU0FBSyxrQkFBa0IsS0FBSyxNQUFNO0FBRWxDLFVBQU0sWUFBWSxLQUFLLE9BQU8sVUFBVSxFQUFFLEtBQUsscUNBQXFDLENBQUM7QUFDckYsU0FBSyxVQUFVO0FBQ2YsU0FBSyxZQUFZLFNBQVM7QUFBQSxFQUM1QjtBQUNGO0FBRUEsSUFBTSxvQkFBTixjQUFnQyxrQ0FBMkI7QUFBQSxFQUl6RCxZQUNFLEtBQ0EsUUFDQSxnQkFDQTtBQUNBLFVBQU0sR0FBRztBQUNULFNBQUssU0FBUztBQUNkLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssZUFBZSwyQ0FBdUI7QUFBQSxFQUM3QztBQUFBLEVBRUEsV0FBc0I7QUFDcEIsV0FBTyxLQUFLLE9BQU8sbUJBQW1CO0FBQUEsRUFDeEM7QUFBQSxFQUVBLFlBQVksUUFBeUI7QUFDbkMsV0FBTyxPQUFPLFFBQVE7QUFBQSxFQUN4QjtBQUFBLEVBRUEsTUFBTSxhQUFhLFFBQWdDO0FBQ2pELFVBQU0sS0FBSyxlQUFlLE1BQU07QUFBQSxFQUNsQztBQUNGOyIsCiAgIm5hbWVzIjogWyJuZXh0U3RhdGUiXQp9Cg==
