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
  return [
    "---",
    `title: ${escapeYaml(resolvedTitle)}`,
    `date: ${today}`,
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
  if (name.startsWith(".") || name === ".ds_store" || name === "thumbs.db") {
    return false;
  }
  return true;
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
    const normalized = (0, import_obsidian.normalizePath)(path).replace(/\/$/, "");
    const target = this.app.vault.getAbstractFileByPath(normalized);
    return target instanceof import_obsidian.TFolder ? target : null;
  }
  getAllVaultFolders() {
    const folders = [];
    this.app.vault.getAllLoadedFiles().forEach((entry) => {
      if (entry instanceof import_obsidian.TFolder && entry.path) {
        folders.push(entry);
      }
    });
    return folders.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  }
  async setLocalRootPath(path) {
    const normalized = (0, import_obsidian.normalizePath)(path.trim()).replace(/\/$/, "");
    if (!normalized) {
      throw new Error("Local Root Path \u4E0D\u80FD\u4E3A\u7A7A\u3002");
    }
    const folder = this.getExistingFolder(normalized);
    if (!folder) {
      throw new Error("\u8BE5\u76EE\u5F55\u4E0D\u5B58\u5728\uFF0C\u8BF7\u4ECE Vault \u4E2D\u9009\u62E9\u5DF2\u6709\u76EE\u5F55\u3002");
    }
    this.settings.localRootPath = folder.path;
    await this.saveSettings();
  }
  getCurrentFile() {
    const file = this.app.workspace.getActiveFile();
    return file instanceof import_obsidian.TFile && file.extension === "md" ? file : null;
  }
  isInsideRoot(file) {
    const root = (0, import_obsidian.normalizePath)(this.settings.localRootPath).replace(/\/$/, "");
    if (!root) {
      return false;
    }
    return file.path === root || file.path.startsWith(`${root}/`);
  }
  relativePath(file) {
    const root = (0, import_obsidian.normalizePath)(this.settings.localRootPath).replace(/\/$/, "");
    const fullPath = (0, import_obsidian.normalizePath)(file.path);
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
    const localRoot = (0, import_obsidian.normalizePath)(this.settings.localRootPath).replace(/\/$/, "");
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
          void this.runWithNotice(() => this.syncFileToGitHub(context.file));
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
      (item) => item.setTitle(context.syncTitle).setIcon("cloud-upload").setDisabled(!context.canSync).onClick(() => void this.runWithNotice(() => this.syncFileToGitHub(context.file)))
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
      } else if (entry instanceof import_obsidian.TFolder) {
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
    if (!this.isInsideRoot(file)) {
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
      await this.setState(file, {
        remotePath,
        sha: nextSha,
        status: "synced",
        lastSyncedAt: formatDateTime(/* @__PURE__ */ new Date()),
        lastSyncedHash: currentHash,
        htmlUrl
      });
      new import_obsidian.Notice(`\u540C\u6B65\u6210\u529F\uFF1A${remotePath}`);
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
      this.items = await this.plugin.buildSyncCenterItems();
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
    const syncButton = toolbarEl.createEl("button", { text: `\u540C\u6B65\u672C\u5730 (${selectedLocalCount})` });
    syncButton.type = "button";
    syncButton.disabled = selectedLocalCount === 0;
    syncButton.addClass("mod-cta");
    syncButton.addEventListener("click", () => void this.syncSelectedLocalFiles());
    const pullButton = toolbarEl.createEl("button", { text: `\u62C9\u53D6\u8FDC\u7AEF (${selectedRemoteOnlyCount})` });
    pullButton.type = "button";
    pullButton.disabled = selectedRemoteOnlyCount === 0;
    pullButton.addEventListener("click", () => void this.pullSelectedRemoteFiles());
    const deleteButton = toolbarEl.createEl("button", { text: `\u5220\u9664\u8FDC\u7AEF (${selectedRemoteCount})` });
    deleteButton.type = "button";
    deleteButton.disabled = selectedRemoteCount === 0;
    deleteButton.addClass("mod-warning");
    deleteButton.addEventListener("click", () => void this.deleteSelectedRemoteFiles());
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
        await this.plugin.syncFileToGitHub(item.file);
        successCount += 1;
        this.selectedIds.delete(item.id);
      } catch {
        failureCount += 1;
      }
    }
    new import_obsidian.Notice(`\u540C\u6B65\u5B8C\u6210\uFF1A\u6210\u529F ${successCount}\uFF0C\u5931\u8D25 ${failureCount}`);
    await this.refresh();
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
    await this.refresh();
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
    const localRootDescription = this.plugin.getExistingFolder(this.plugin.settings.localRootPath) ? `\u5F53\u524D\u76EE\u5F55\u6709\u6548\uFF1A${this.plugin.settings.localRootPath}` : "\u53EA\u6709\u8BE5\u76EE\u5F55\u5185\u7684\u6587\u4EF6\u624D\u5141\u8BB8\u540C\u6B65\u3002\u5F53\u524D\u503C\u65E0\u6548\u65F6\u8BF7\u91CD\u65B0\u9009\u62E9\u76EE\u5F55\u3002";
    this.createSearchableSetting(containerEl, "Local Root Path", localRootDescription, this.plugin.settings.localRootPath).setName("Local Root Path").setDesc(localRootDescription).addText(
      (text) => text.setValue(this.plugin.settings.localRootPath).onChange(async (value) => {
        this.plugin.settings.localRootPath = (0, import_obsidian.normalizePath)(value.trim());
        await this.plugin.saveSettings();
        this.display();
      })
    ).addButton(
      (button) => button.setButtonText("\u9009\u62E9\u76EE\u5F55").onClick(() => {
        new FolderSelectModal(this.app, this.plugin, async (folder) => {
          try {
            await this.plugin.setLocalRootPath(folder.path);
            new import_obsidian.Notice(`\u5DF2\u8BBE\u7F6E Local Root Path\uFF1A${folder.path}`);
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
    return folder.path;
  }
  async onChooseItem(folder) {
    await this.onChooseFolder(folder);
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7XG4gIEFwcCxcbiAgRnV6enlTdWdnZXN0TW9kYWwsXG4gIE1lbnUsXG4gIE1vZGFsLFxuICBOb3RpY2UsXG4gIFBsdWdpbixcbiAgUGx1Z2luU2V0dGluZ1RhYixcbiAgU2V0dGluZyxcbiAgc2V0SWNvbixcbiAgVEZpbGUsXG4gIFRGb2xkZXIsXG4gIG5vcm1hbGl6ZVBhdGgsXG4gIHJlcXVlc3RVcmxcbn0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmludGVyZmFjZSBHaXRIdWJTeW5jU2V0dGluZ3Mge1xuICByZXBvc2l0b3J5VXJsOiBzdHJpbmc7XG4gIGdpdGh1YlVzZXJuYW1lOiBzdHJpbmc7XG4gIGdpdGh1YlRva2VuOiBzdHJpbmc7XG4gIGJyYW5jaDogc3RyaW5nO1xuICBsb2NhbFJvb3RQYXRoOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBMb2NhbEZpbGVTdGF0ZSB7XG4gIHJlbW90ZVBhdGg/OiBzdHJpbmc7XG4gIHNoYT86IHN0cmluZztcbiAgc3RhdHVzOiBcImRyYWZ0XCIgfCBcInN5bmNlZFwiIHwgXCJtb2RpZmllZFwiIHwgXCJkZWxldGVkXCIgfCBcImZhaWxlZFwiO1xuICBsYXN0U3luY2VkQXQ/OiBzdHJpbmc7XG4gIGxhc3RTeW5jZWRIYXNoPzogc3RyaW5nO1xuICBodG1sVXJsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUGVyc2lzdGVkRGF0YSB7XG4gIGZpbGVzOiBSZWNvcmQ8c3RyaW5nLCBMb2NhbEZpbGVTdGF0ZT47XG4gIGNvbm5lY3Rpb24/OiBDb25uZWN0aW9uU3RhdGU7XG59XG5cbmludGVyZmFjZSBDb25uZWN0aW9uU3RhdGUge1xuICBzdGF0dXM6IFwidW5rbm93blwiIHwgXCJzdWNjZXNzXCIgfCBcImZhaWxlZFwiIHwgXCJzdGFsZVwiO1xuICBtZXNzYWdlOiBzdHJpbmc7XG4gIGNoZWNrZWRBdD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEFydGljbGVBY3Rpb25Db250ZXh0IHtcbiAgZmlsZTogVEZpbGU7XG4gIGluUm9vdDogYm9vbGVhbjtcbiAgaGFzUHJvcGVydGllczogYm9vbGVhbjtcbiAgc3RhdGU6IExvY2FsRmlsZVN0YXRlO1xuICBzeW5jVGl0bGU6IHN0cmluZztcbiAgY2FuU3luYzogYm9vbGVhbjtcbiAgY2FuRGVsZXRlUmVtb3RlOiBib29sZWFuO1xuICBjYW5PcGVuUmVtb3RlOiBib29sZWFuO1xuICBjYW5JbnNlcnRQcm9wZXJ0aWVzOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViUmVwbyB7XG4gIG93bmVyOiBzdHJpbmc7XG4gIHJlcG86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEdpdEh1YkVycm9yUGF5bG9hZCB7XG4gIG1lc3NhZ2U/OiBzdHJpbmc7XG4gIGRvY3VtZW50YXRpb25fdXJsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViQ29udGVudFJlc3BvbnNlIHtcbiAgdHlwZTogc3RyaW5nO1xuICBwYXRoOiBzdHJpbmc7XG4gIHNoYTogc3RyaW5nO1xuICBodG1sX3VybD86IHN0cmluZztcbiAgY29udGVudD86IHN0cmluZztcbiAgZW5jb2Rpbmc/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBHaXRIdWJQdXRSZXNwb25zZSB7XG4gIGNvbnRlbnQ/OiBHaXRIdWJDb250ZW50UmVzcG9uc2UgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViRGVsZXRlUmVzcG9uc2Uge1xuICBjb250ZW50PzogR2l0SHViQ29udGVudFJlc3BvbnNlIHwgbnVsbDtcbn1cblxuaW50ZXJmYWNlIEdpdEh1YlVzZXJSZXNwb25zZSB7XG4gIGxvZ2luOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBHaXRIdWJSZXBvUmVzcG9uc2Uge1xuICBmdWxsX25hbWU6IHN0cmluZztcbiAgcGVybWlzc2lvbnM/OiB7XG4gICAgYWRtaW4/OiBib29sZWFuO1xuICAgIG1haW50YWluPzogYm9vbGVhbjtcbiAgICBwdXNoPzogYm9vbGVhbjtcbiAgICB0cmlhZ2U/OiBib29sZWFuO1xuICAgIHB1bGw/OiBib29sZWFuO1xuICB9O1xufVxuXG5pbnRlcmZhY2UgR2l0SHViVHJlZUl0ZW0ge1xuICBwYXRoOiBzdHJpbmc7XG4gIHR5cGU6IFwiYmxvYlwiIHwgXCJ0cmVlXCIgfCBzdHJpbmc7XG4gIHNoYTogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViVHJlZVJlc3BvbnNlIHtcbiAgdHJlZTogR2l0SHViVHJlZUl0ZW1bXTtcbiAgdHJ1bmNhdGVkOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgUmVtb3RlU3luY0ZpbGUge1xuICByZW1vdGVQYXRoOiBzdHJpbmc7XG4gIHNoYTogc3RyaW5nO1xuICBodG1sVXJsOiBzdHJpbmc7XG59XG5cbnR5cGUgU3luY0NlbnRlclN0YXR1cyA9IFwidW5wdWJsaXNoZWRcIiB8IFwibW9kaWZpZWRcIiB8IFwicHVibGlzaGVkXCIgfCBcImxvY2FsRGVsZXRlZFwiO1xuXG5pbnRlcmZhY2UgU3luY0NlbnRlckl0ZW0ge1xuICBpZDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIHN0YXR1czogU3luY0NlbnRlclN0YXR1cztcbiAgbG9jYWxQYXRoPzogc3RyaW5nO1xuICByZW1vdGVQYXRoOiBzdHJpbmc7XG4gIGZvbGRlclBhdGg6IHN0cmluZztcbiAgZmlsZT86IFRGaWxlO1xuICByZW1vdGU/OiBSZW1vdGVTeW5jRmlsZTtcbiAgc3RhdGU/OiBMb2NhbEZpbGVTdGF0ZTtcbn1cblxuaW50ZXJmYWNlIFN5bmNUcmVlTm9kZSB7XG4gIG5hbWU6IHN0cmluZztcbiAgcGF0aDogc3RyaW5nO1xuICBjaGlsZHJlbjogTWFwPHN0cmluZywgU3luY1RyZWVOb2RlPjtcbiAgaXRlbXM6IFN5bmNDZW50ZXJJdGVtW107XG59XG5cbmNvbnN0IFJFTU9URV9DT05URU5UX1JPT1QgPSBcImNvbnRlbnRcIjtcblxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogR2l0SHViU3luY1NldHRpbmdzID0ge1xuICByZXBvc2l0b3J5VXJsOiBcIlwiLFxuICBnaXRodWJVc2VybmFtZTogXCJcIixcbiAgZ2l0aHViVG9rZW46IFwiXCIsXG4gIGJyYW5jaDogXCJtYWluXCIsXG4gIGxvY2FsUm9vdFBhdGg6IFwiY29udGVudFwiXG59O1xuXG5jb25zdCBERUZBVUxUX0RBVEE6IFBlcnNpc3RlZERhdGEgPSB7XG4gIGZpbGVzOiB7fSxcbiAgY29ubmVjdGlvbjoge1xuICAgIHN0YXR1czogXCJ1bmtub3duXCIsXG4gICAgbWVzc2FnZTogXCJcdTVDMUFcdTY3MkFcdTZENEJcdThCRDVcdThGREVcdTYzQTVcdTMwMDJcIlxuICB9XG59O1xuXG5jbGFzcyBHaXRIdWJSZXF1ZXN0RXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIHN0YXR1czogbnVtYmVyO1xuICBtZXRob2Q6IHN0cmluZztcbiAgcGF0aDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHN0YXR1czogbnVtYmVyLCBtZXNzYWdlOiBzdHJpbmcsIG1ldGhvZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcpIHtcbiAgICBzdXBlcihtZXNzYWdlKTtcbiAgICB0aGlzLnN0YXR1cyA9IHN0YXR1cztcbiAgICB0aGlzLm1ldGhvZCA9IG1ldGhvZDtcbiAgICB0aGlzLnBhdGggPSBwYXRoO1xuICB9XG59XG5cbmZ1bmN0aW9uIGVzY2FwZVlhbWwoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBpbnB1dC5yZXBsYWNlKC9cIi9nLCAnXFxcXFwiJyk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlRnJvbnRtYXR0ZXIoY29udGVudDogc3RyaW5nKTogeyBkYXRhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+OyBib2R5OiBzdHJpbmcgfSB7XG4gIGlmICghY29udGVudC5zdGFydHNXaXRoKFwiLS0tXFxuXCIpKSB7XG4gICAgcmV0dXJuIHsgZGF0YToge30sIGJvZHk6IGNvbnRlbnQgfTtcbiAgfVxuXG4gIGNvbnN0IGVuZCA9IGNvbnRlbnQuaW5kZXhPZihcIlxcbi0tLVxcblwiLCA0KTtcbiAgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICByZXR1cm4geyBkYXRhOiB7fSwgYm9keTogY29udGVudCB9O1xuICB9XG5cbiAgY29uc3QgcmF3ID0gY29udGVudC5zbGljZSg0LCBlbmQpLnNwbGl0KFwiXFxuXCIpO1xuICBjb25zdCBkYXRhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG5cbiAgZm9yIChjb25zdCBsaW5lIG9mIHJhdykge1xuICAgIGNvbnN0IHNlcGFyYXRvciA9IGxpbmUuaW5kZXhPZihcIjpcIik7XG4gICAgaWYgKHNlcGFyYXRvciA9PT0gLTEpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IGtleSA9IGxpbmUuc2xpY2UoMCwgc2VwYXJhdG9yKS50cmltKCk7XG4gICAgY29uc3QgdmFsdWUgPSBsaW5lLnNsaWNlKHNlcGFyYXRvciArIDEpLnRyaW0oKS5yZXBsYWNlKC9eXCJ8XCIkL2csIFwiXCIpO1xuICAgIGlmIChrZXkpIHtcbiAgICAgIGRhdGFba2V5XSA9IHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGRhdGEsIGJvZHk6IGNvbnRlbnQuc2xpY2UoZW5kICsgNSkgfTtcbn1cblxuZnVuY3Rpb24gYnVpbGRGcm9udG1hdHRlcihmaWxlOiBURmlsZSwgdGl0bGU/OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCB0b2RheSA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gIGNvbnN0IHJlc29sdmVkVGl0bGUgPSB0aXRsZT8udHJpbSgpIHx8IGZpbGUuYmFzZW5hbWU7XG5cbiAgcmV0dXJuIFtcbiAgICBcIi0tLVwiLFxuICAgIGB0aXRsZTogJHtlc2NhcGVZYW1sKHJlc29sdmVkVGl0bGUpfWAsXG4gICAgYGRhdGU6ICR7dG9kYXl9YCxcbiAgICBcInRhZ3M6XCIsXG4gICAgXCIgIC0gSmF2YVwiLFxuICAgIFwiICAtIE5leHRKU1wiLFxuICAgIFwiZGVzY3JpcHRpb246IFx1NjU4N1x1N0FFMFx1NjQ1OFx1ODk4MVwiLFxuICAgIFwiY292ZXI6XCIsXG4gICAgXCJwdWJsaXNoZWQ6IHRydWVcIixcbiAgICBcIi0tLVwiLFxuICAgIFwiXCJcbiAgXS5qb2luKFwiXFxuXCIpO1xufVxuXG5mdW5jdGlvbiBwYWREYXRlTnVtYmVyKHZhbHVlOiBudW1iZXIpOiBzdHJpbmcge1xuICByZXR1cm4gU3RyaW5nKHZhbHVlKS5wYWRTdGFydCgyLCBcIjBcIik7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdERhdGVUaW1lKGlucHV0OiBEYXRlIHwgc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgZGF0ZSA9IHR5cGVvZiBpbnB1dCA9PT0gXCJzdHJpbmdcIiA/IG5ldyBEYXRlKGlucHV0KSA6IGlucHV0O1xuXG4gIGlmIChOdW1iZXIuaXNOYU4oZGF0ZS5nZXRUaW1lKCkpKSB7XG4gICAgcmV0dXJuIHR5cGVvZiBpbnB1dCA9PT0gXCJzdHJpbmdcIiA/IGlucHV0IDogXCJcIjtcbiAgfVxuXG4gIHJldHVybiBbXG4gICAgYCR7ZGF0ZS5nZXRGdWxsWWVhcigpfS0ke3BhZERhdGVOdW1iZXIoZGF0ZS5nZXRNb250aCgpICsgMSl9LSR7cGFkRGF0ZU51bWJlcihkYXRlLmdldERhdGUoKSl9YCxcbiAgICBgJHtwYWREYXRlTnVtYmVyKGRhdGUuZ2V0SG91cnMoKSl9OiR7cGFkRGF0ZU51bWJlcihkYXRlLmdldE1pbnV0ZXMoKSl9OiR7cGFkRGF0ZU51bWJlcihkYXRlLmdldFNlY29uZHMoKSl9YFxuICBdLmpvaW4oXCIgXCIpO1xufVxuXG5mdW5jdGlvbiBoYXNoQ29udGVudChpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGhhc2ggPSAwO1xuXG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBpbnB1dC5sZW5ndGg7IGluZGV4ICs9IDEpIHtcbiAgICBoYXNoID0gKGhhc2ggKiAzMSArIGlucHV0LmNoYXJDb2RlQXQoaW5kZXgpKSB8IDA7XG4gIH1cblxuICByZXR1cm4gYGgke01hdGguYWJzKGhhc2gpfWA7XG59XG5cbmZ1bmN0aW9uIGVuY29kZUJhc2U2NChpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgYnl0ZXMgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoaW5wdXQpO1xuICByZXR1cm4gZW5jb2RlQnl0ZXNCYXNlNjQoYnl0ZXMpO1xufVxuXG5mdW5jdGlvbiBlbmNvZGVCeXRlc0Jhc2U2NChieXRlczogVWludDhBcnJheSk6IHN0cmluZyB7XG4gIGxldCBiaW5hcnkgPSBcIlwiO1xuXG4gIGJ5dGVzLmZvckVhY2goKGJ5dGUpID0+IHtcbiAgICBiaW5hcnkgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShieXRlKTtcbiAgfSk7XG5cbiAgcmV0dXJuIGJ0b2EoYmluYXJ5KTtcbn1cblxuZnVuY3Rpb24gdGV4dEJ5dGVzKGlucHV0OiBzdHJpbmcpOiBVaW50OEFycmF5IHtcbiAgcmV0dXJuIG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShpbnB1dCk7XG59XG5cbmZ1bmN0aW9uIGRlY29kZUJhc2U2NEJ5dGVzKGlucHV0OiBzdHJpbmcpOiBVaW50OEFycmF5IHtcbiAgY29uc3QgYmluYXJ5ID0gYXRvYihpbnB1dC5yZXBsYWNlKC9cXHMvZywgXCJcIikpO1xuICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGJpbmFyeS5sZW5ndGgpO1xuXG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBiaW5hcnkubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgYnl0ZXNbaW5kZXhdID0gYmluYXJ5LmNoYXJDb2RlQXQoaW5kZXgpO1xuICB9XG5cbiAgcmV0dXJuIGJ5dGVzO1xufVxuXG5mdW5jdGlvbiBkZWNvZGVCYXNlNjQoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoZGVjb2RlQmFzZTY0Qnl0ZXMoaW5wdXQpKTtcbn1cblxuZnVuY3Rpb24gaGFzaEJ5dGVzKGlucHV0OiBBcnJheUJ1ZmZlcik6IHN0cmluZyB7XG4gIGNvbnN0IGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoaW5wdXQpO1xuICBsZXQgaGFzaCA9IDA7XG5cbiAgZm9yIChjb25zdCBieXRlIG9mIGJ5dGVzKSB7XG4gICAgaGFzaCA9IChoYXNoICogMzEgKyBieXRlKSB8IDA7XG4gIH1cblxuICByZXR1cm4gYGgke01hdGguYWJzKGhhc2gpfWA7XG59XG5cbmZ1bmN0aW9uIHRvSGV4KGJ5dGVzOiBVaW50OEFycmF5KTogc3RyaW5nIHtcbiAgcmV0dXJuIEFycmF5LmZyb20oYnl0ZXMpXG4gICAgLm1hcCgoYnl0ZSkgPT4gYnl0ZS50b1N0cmluZygxNikucGFkU3RhcnQoMiwgXCIwXCIpKVxuICAgIC5qb2luKFwiXCIpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnaXRCbG9iU2hhKGlucHV0OiBBcnJheUJ1ZmZlcik6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoaW5wdXQpO1xuICBjb25zdCBoZWFkZXIgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoYGJsb2IgJHtieXRlcy5ieXRlTGVuZ3RofVxcMGApO1xuICBjb25zdCBwYXlsb2FkID0gbmV3IFVpbnQ4QXJyYXkoaGVhZGVyLmJ5dGVMZW5ndGggKyBieXRlcy5ieXRlTGVuZ3RoKTtcbiAgcGF5bG9hZC5zZXQoaGVhZGVyLCAwKTtcbiAgcGF5bG9hZC5zZXQoYnl0ZXMsIGhlYWRlci5ieXRlTGVuZ3RoKTtcbiAgY29uc3QgZGlnZXN0ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3QoXCJTSEEtMVwiLCBwYXlsb2FkKTtcbiAgcmV0dXJuIHRvSGV4KG5ldyBVaW50OEFycmF5KGRpZ2VzdCkpO1xufVxuXG5mdW5jdGlvbiBpc1N5bmNhYmxlRmlsZShmaWxlOiBURmlsZSk6IGJvb2xlYW4ge1xuICBjb25zdCBuYW1lID0gZmlsZS5uYW1lLnRvTG93ZXJDYXNlKCk7XG4gIGlmIChuYW1lLnN0YXJ0c1dpdGgoXCIuXCIpIHx8IG5hbWUgPT09IFwiLmRzX3N0b3JlXCIgfHwgbmFtZSA9PT0gXCJ0aHVtYnMuZGJcIikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc0ltYWdlUGF0aChwYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIC9cXC4oYXZpZnxnaWZ8anBlP2d8cG5nfHN2Z3x3ZWJwKSQvaS50ZXN0KHBhdGgpO1xufVxuXG5mdW5jdGlvbiBwYXJzZVJlcG9zaXRvcnlVcmwoaW5wdXQ6IHN0cmluZyk6IEdpdEh1YlJlcG8gfCBudWxsIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IGlucHV0LnRyaW0oKS5yZXBsYWNlKC9cXC8kLywgXCJcIikucmVwbGFjZSgvXFwuZ2l0JC8sIFwiXCIpO1xuICBjb25zdCBodHRwc01hdGNoID0gL15odHRwcz86XFwvXFwvZ2l0aHViXFwuY29tXFwvKFteL10rKVxcLyhbXi9dKykkLy5leGVjKG5vcm1hbGl6ZWQpO1xuICBjb25zdCBzc2hNYXRjaCA9IC9eZ2l0QGdpdGh1YlxcLmNvbTooW14vXSspXFwvKFteL10rKSQvLmV4ZWMobm9ybWFsaXplZCk7XG4gIGNvbnN0IHNob3J0aGFuZE1hdGNoID0gL14oW14vXFxzXSspXFwvKFteL1xcc10rKSQvLmV4ZWMobm9ybWFsaXplZCk7XG4gIGNvbnN0IG1hdGNoID0gaHR0cHNNYXRjaCA/PyBzc2hNYXRjaCA/PyBzaG9ydGhhbmRNYXRjaDtcblxuICBpZiAoIW1hdGNoKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG93bmVyOiBtYXRjaFsxXSxcbiAgICByZXBvOiBtYXRjaFsyXVxuICB9O1xufVxuXG5mdW5jdGlvbiBlbmNvZGVHaXRIdWJQYXRoKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBwYXRoLnNwbGl0KFwiL1wiKS5tYXAoZW5jb2RlVVJJQ29tcG9uZW50KS5qb2luKFwiL1wiKTtcbn1cblxuZnVuY3Rpb24gaXNTYWZlQ29udGVudFBhdGgocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQYXRoKHBhdGgpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gIGNvbnN0IHNlZ21lbnRzID0gbm9ybWFsaXplZC5zcGxpdChcIi9cIik7XG4gIHJldHVybiBub3JtYWxpemVkLnN0YXJ0c1dpdGgoYCR7UkVNT1RFX0NPTlRFTlRfUk9PVH0vYCkgJiYgIXNlZ21lbnRzLnNvbWUoKHNlZ21lbnQpID0+IHNlZ21lbnQgPT09IFwiLi5cIiB8fCBzZWdtZW50ID09PSBcIlwiKTtcbn1cblxuZnVuY3Rpb24gdG9TdGF0dXNMYWJlbChzdGF0dXM6IExvY2FsRmlsZVN0YXRlW1wic3RhdHVzXCJdKTogc3RyaW5nIHtcbiAgc3dpdGNoIChzdGF0dXMpIHtcbiAgICBjYXNlIFwic3luY2VkXCI6XG4gICAgICByZXR1cm4gXCJcdTVERjJcdTU0MENcdTZCNjVcIjtcbiAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIHJldHVybiBcIlx1NURGMlx1NEZFRVx1NjUzOVwiO1xuICAgIGNhc2UgXCJkZWxldGVkXCI6XG4gICAgICByZXR1cm4gXCJcdThGRENcdTdBRUZcdTVERjJcdTUyMjBcdTk2NjRcIjtcbiAgICBjYXNlIFwiZmFpbGVkXCI6XG4gICAgICByZXR1cm4gXCJcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIjtcbiAgICBjYXNlIFwiZHJhZnRcIjpcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIFwiXHU2NzJBXHU1NDBDXHU2QjY1XCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gdG9TdGF0dXNDbGFzcyhzdGF0dXM6IExvY2FsRmlsZVN0YXRlW1wic3RhdHVzXCJdKTogc3RyaW5nIHtcbiAgc3dpdGNoIChzdGF0dXMpIHtcbiAgICBjYXNlIFwic3luY2VkXCI6XG4gICAgICByZXR1cm4gXCJpcy1zeW5jZWRcIjtcbiAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIHJldHVybiBcImlzLW1vZGlmaWVkXCI7XG4gICAgY2FzZSBcImRlbGV0ZWRcIjpcbiAgICAgIHJldHVybiBcImlzLWRlbGV0ZWRcIjtcbiAgICBjYXNlIFwiZmFpbGVkXCI6XG4gICAgICByZXR1cm4gXCJpcy1mYWlsZWRcIjtcbiAgICBjYXNlIFwiZHJhZnRcIjpcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIFwiaXMtZHJhZnRcIjtcbiAgfVxufVxuXG5mdW5jdGlvbiB0b1N0YXR1c0ljb24oc3RhdHVzOiBMb2NhbEZpbGVTdGF0ZVtcInN0YXR1c1wiXSk6IHN0cmluZyB7XG4gIHN3aXRjaCAoc3RhdHVzKSB7XG4gICAgY2FzZSBcInN5bmNlZFwiOlxuICAgICAgcmV0dXJuIFwiY2xvdWQtY2hlY2tcIjtcbiAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIHJldHVybiBcInBlbmNpbFwiO1xuICAgIGNhc2UgXCJkZWxldGVkXCI6XG4gICAgICByZXR1cm4gXCJjbG91ZC1vZmZcIjtcbiAgICBjYXNlIFwiZmFpbGVkXCI6XG4gICAgICByZXR1cm4gXCJhbGVydC10cmlhbmdsZVwiO1xuICAgIGNhc2UgXCJkcmFmdFwiOlxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gXCJmaWxlLXBlblwiO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRvU3luY0NlbnRlclN0YXR1c0xhYmVsKHN0YXR1czogU3luY0NlbnRlclN0YXR1cyk6IHN0cmluZyB7XG4gIHN3aXRjaCAoc3RhdHVzKSB7XG4gICAgY2FzZSBcInVucHVibGlzaGVkXCI6XG4gICAgICByZXR1cm4gXCJcdTY3MkNcdTU3MzBcdTY3MkFcdTUzRDFcdTVFMDNcIjtcbiAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIHJldHVybiBcIlx1NURGMlx1NEZFRVx1NjUzOVwiO1xuICAgIGNhc2UgXCJwdWJsaXNoZWRcIjpcbiAgICAgIHJldHVybiBcIlx1NURGMlx1NTNEMVx1NUUwM1wiO1xuICAgIGNhc2UgXCJsb2NhbERlbGV0ZWRcIjpcbiAgICAgIHJldHVybiBcIlx1NjcyQ1x1NTczMFx1NURGMlx1NTIyMFx1OTY2NFwiO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gc3RhdHVzO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRvU3luY0NlbnRlclN0YXR1c0NsYXNzKHN0YXR1czogU3luY0NlbnRlclN0YXR1cyk6IHN0cmluZyB7XG4gIHN3aXRjaCAoc3RhdHVzKSB7XG4gICAgY2FzZSBcInVucHVibGlzaGVkXCI6XG4gICAgICByZXR1cm4gXCJpcy1kcmFmdFwiO1xuICAgIGNhc2UgXCJtb2RpZmllZFwiOlxuICAgICAgcmV0dXJuIFwiaXMtbW9kaWZpZWRcIjtcbiAgICBjYXNlIFwicHVibGlzaGVkXCI6XG4gICAgICByZXR1cm4gXCJpcy1zeW5jZWRcIjtcbiAgICBjYXNlIFwibG9jYWxEZWxldGVkXCI6XG4gICAgICByZXR1cm4gXCJpcy1kZWxldGVkXCI7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBcImlzLWRyYWZ0XCI7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogR2l0SHViU3luY1NldHRpbmdzID0gREVGQVVMVF9TRVRUSU5HUztcbiAgZGF0YTogUGVyc2lzdGVkRGF0YSA9IERFRkFVTFRfREFUQTtcbiAgc3RhdHVzQmFyRWwhOiBIVE1MRWxlbWVudDtcbiAgc3RhdHVzQmFySWNvbkVsITogSFRNTEVsZW1lbnQ7XG4gIHN0YXR1c0JhclRleHRFbCE6IEhUTUxFbGVtZW50O1xuXG4gIGFzeW5jIG9ubG9hZCgpIHtcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xuXG4gICAgdGhpcy5hZGRSaWJib25JY29uKFwiZ2l0LWJyYW5jaFwiLCBcIk9ic2lkaWFuIEdpdCBTeW5jZXJcIiwgKGV2dCkgPT4ge1xuICAgICAgdGhpcy5zaG93UmliYm9uTWVudShldnQpO1xuICAgIH0pO1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJvcGVuLXN5bmMtY2VudGVyXCIsXG4gICAgICBuYW1lOiBcIlx1NjI1M1x1NUYwMFx1NTQwQ1x1NkI2NVx1NEUyRFx1NUZDM1wiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHRoaXMub3BlblN5bmNDZW50ZXIoKVxuICAgIH0pO1xuXG4gICAgdGhpcy5zdGF0dXNCYXJFbCA9IHRoaXMuYWRkU3RhdHVzQmFySXRlbSgpO1xuICAgIHRoaXMuc3RhdHVzQmFyRWwuYWRkQ2xhc3MoXCJvYnNpZGlhbi1naXQtc3luY2VyLXN0YXR1c1wiKTtcbiAgICB0aGlzLnN0YXR1c0Jhckljb25FbCA9IHRoaXMuc3RhdHVzQmFyRWwuY3JlYXRlU3Bhbih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN0YXR1cy1pY29uXCIgfSk7XG4gICAgdGhpcy5zdGF0dXNCYXJUZXh0RWwgPSB0aGlzLnN0YXR1c0JhckVsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zdGF0dXMtdGV4dFwiIH0pO1xuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgR2l0U3luY2VyU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImZpbGUtb3BlblwiLCAoKSA9PiB2b2lkIHRoaXMucmVmcmVzaFN0YXR1c0JhcigpKSk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAudmF1bHQub24oXCJtb2RpZnlcIiwgKGZpbGUpID0+IHtcbiAgICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSAmJiBmaWxlID09PSB0aGlzLmdldEN1cnJlbnRGaWxlKCkpIHtcbiAgICAgICAgICB2b2lkIHRoaXMucmVmcmVzaFN0YXR1c0JhcigpO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFwiZWRpdG9yLW1lbnVcIiwgKG1lbnUpID0+IHtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuZ2V0Q3VycmVudEZpbGUoKTtcbiAgICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5hZGRBcnRpY2xlQ29udGV4dE1lbnVJdGVtcyhtZW51LCBmaWxlKTtcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGF3YWl0IHRoaXMucmVmcmVzaFN0YXR1c0JhcigpO1xuICB9XG5cbiAgYXN5bmMgbG9hZFNldHRpbmdzKCkge1xuICAgIGNvbnN0IHNhdmVkID0gKGF3YWl0IHRoaXMubG9hZERhdGEoKSkgYXMgeyBzZXR0aW5ncz86IFBhcnRpYWw8R2l0SHViU3luY1NldHRpbmdzPjsgZGF0YT86IFBlcnNpc3RlZERhdGEgfSB8IG51bGw7XG4gICAgdGhpcy5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUywgLi4uKHNhdmVkPy5zZXR0aW5ncyA/PyB7fSkgfTtcbiAgICB0aGlzLmRhdGEgPSB7IC4uLkRFRkFVTFRfREFUQSwgLi4uKHNhdmVkPy5kYXRhID8/IHt9KSB9O1xuICB9XG5cbiAgYXN5bmMgc2F2ZUFsbERhdGEoKSB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh7XG4gICAgICBzZXR0aW5nczogdGhpcy5zZXR0aW5ncyxcbiAgICAgIGRhdGE6IHRoaXMuZGF0YVxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgc2F2ZVNldHRpbmdzKCkge1xuICAgIGF3YWl0IHRoaXMuc2F2ZUFsbERhdGEoKTtcbiAgfVxuXG4gIGFzeW5jIG1hcmtDb25uZWN0aW9uU3RhbGUoKSB7XG4gICAgdGhpcy5kYXRhLmNvbm5lY3Rpb24gPSB7XG4gICAgICBzdGF0dXM6IFwic3RhbGVcIixcbiAgICAgIG1lc3NhZ2U6IFwiXHU5MTREXHU3RjZFXHU1REYyXHU1M0Q4XHU2NkY0XHVGRjBDXHU4QkY3XHU5MUNEXHU2NUIwXHU2RDRCXHU4QkQ1XHU4RkRFXHU2M0E1XHUzMDAyXCJcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMuc2F2ZUFsbERhdGEoKTtcbiAgfVxuXG4gIGdldFJlcG9zaXRvcnkoKTogR2l0SHViUmVwbyB7XG4gICAgY29uc3QgcmVwb3NpdG9yeSA9IHBhcnNlUmVwb3NpdG9yeVVybCh0aGlzLnNldHRpbmdzLnJlcG9zaXRvcnlVcmwpO1xuICAgIGlmICghcmVwb3NpdG9yeSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiR2l0SHViIFx1NEVEM1x1NUU5M1x1NTczMFx1NTc0MFx1NjgzQ1x1NUYwRlx1NEUwRFx1NkI2M1x1Nzg2RVx1MzAwMlx1NjUyRlx1NjMwMSBodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby5naXRcdTMwMDFnaXRAZ2l0aHViLmNvbTpvd25lci9yZXBvLmdpdCBcdTYyMTYgb3duZXIvcmVwb1x1MzAwMlwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVwb3NpdG9yeTtcbiAgfVxuXG4gIHZhbGlkYXRlQ29uZmlnKCkge1xuICAgIHRoaXMuZ2V0UmVwb3NpdG9yeSgpO1xuXG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLmdpdGh1YlVzZXJuYW1lLnRyaW0oKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4QkY3XHU1MTQ4XHU1ODZCXHU1MTk5IEdpdEh1YiBVc2VybmFtZVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuc2V0dGluZ3MuZ2l0aHViVG9rZW4udHJpbSgpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdThCRjdcdTUxNDhcdTU4NkJcdTUxOTkgR2l0SHViIFRva2VuXHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5zZXR0aW5ncy5icmFuY2gudHJpbSgpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdThCRjdcdTUxNDhcdTU4NkJcdTUxOTlcdTc2RUVcdTY4MDdcdTUyMDZcdTY1MkZcdTMwMDJcIik7XG4gICAgfVxuICB9XG5cbiAgZ2V0RXhpc3RpbmdGb2xkZXIocGF0aDogc3RyaW5nKTogVEZvbGRlciB8IG51bGwge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQYXRoKHBhdGgpLnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgobm9ybWFsaXplZCk7XG4gICAgcmV0dXJuIHRhcmdldCBpbnN0YW5jZW9mIFRGb2xkZXIgPyB0YXJnZXQgOiBudWxsO1xuICB9XG5cbiAgZ2V0QWxsVmF1bHRGb2xkZXJzKCk6IFRGb2xkZXJbXSB7XG4gICAgY29uc3QgZm9sZGVyczogVEZvbGRlcltdID0gW107XG5cbiAgICB0aGlzLmFwcC52YXVsdC5nZXRBbGxMb2FkZWRGaWxlcygpLmZvckVhY2goKGVudHJ5KSA9PiB7XG4gICAgICBpZiAoZW50cnkgaW5zdGFuY2VvZiBURm9sZGVyICYmIGVudHJ5LnBhdGgpIHtcbiAgICAgICAgZm9sZGVycy5wdXNoKGVudHJ5KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBmb2xkZXJzLnNvcnQoKGEsIGIpID0+IGEucGF0aC5sb2NhbGVDb21wYXJlKGIucGF0aCwgXCJ6aC1DTlwiKSk7XG4gIH1cblxuICBhc3luYyBzZXRMb2NhbFJvb3RQYXRoKHBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQYXRoKHBhdGgudHJpbSgpKS5yZXBsYWNlKC9cXC8kLywgXCJcIik7XG5cbiAgICBpZiAoIW5vcm1hbGl6ZWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkxvY2FsIFJvb3QgUGF0aCBcdTRFMERcdTgwRkRcdTRFM0FcdTdBN0FcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgY29uc3QgZm9sZGVyID0gdGhpcy5nZXRFeGlzdGluZ0ZvbGRlcihub3JtYWxpemVkKTtcbiAgICBpZiAoIWZvbGRlcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4QkU1XHU3NkVFXHU1RjU1XHU0RTBEXHU1QjU4XHU1NzI4XHVGRjBDXHU4QkY3XHU0RUNFIFZhdWx0IFx1NEUyRFx1OTAwOVx1NjJFOVx1NURGMlx1NjcwOVx1NzZFRVx1NUY1NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICB0aGlzLnNldHRpbmdzLmxvY2FsUm9vdFBhdGggPSBmb2xkZXIucGF0aDtcbiAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5ncygpO1xuICB9XG5cbiAgZ2V0Q3VycmVudEZpbGUoKTogVEZpbGUgfCBudWxsIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICByZXR1cm4gZmlsZSBpbnN0YW5jZW9mIFRGaWxlICYmIGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIgPyBmaWxlIDogbnVsbDtcbiAgfVxuXG4gIGlzSW5zaWRlUm9vdChmaWxlOiBURmlsZSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHJvb3QgPSBub3JtYWxpemVQYXRoKHRoaXMuc2V0dGluZ3MubG9jYWxSb290UGF0aCkucmVwbGFjZSgvXFwvJC8sIFwiXCIpO1xuICAgIGlmICghcm9vdCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiBmaWxlLnBhdGggPT09IHJvb3QgfHwgZmlsZS5wYXRoLnN0YXJ0c1dpdGgoYCR7cm9vdH0vYCk7XG4gIH1cblxuICByZWxhdGl2ZVBhdGgoZmlsZTogVEZpbGUpOiBzdHJpbmcge1xuICAgIGNvbnN0IHJvb3QgPSBub3JtYWxpemVQYXRoKHRoaXMuc2V0dGluZ3MubG9jYWxSb290UGF0aCkucmVwbGFjZSgvXFwvJC8sIFwiXCIpO1xuICAgIGNvbnN0IGZ1bGxQYXRoID0gbm9ybWFsaXplUGF0aChmaWxlLnBhdGgpO1xuXG4gICAgaWYgKGZ1bGxQYXRoID09PSByb290KSB7XG4gICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG5cbiAgICBpZiAoZnVsbFBhdGguc3RhcnRzV2l0aChgJHtyb290fS9gKSkge1xuICAgICAgcmV0dXJuIGZ1bGxQYXRoLnNsaWNlKHJvb3QubGVuZ3RoICsgMSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bGxQYXRoO1xuICB9XG5cbiAgcmVtb3RlUGF0aChmaWxlOiBURmlsZSk6IHN0cmluZyB7XG4gICAgY29uc3QgcmVsYXRpdmUgPSBub3JtYWxpemVQYXRoKHRoaXMucmVsYXRpdmVQYXRoKGZpbGUpKS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuICAgIGNvbnN0IHBhdGggPSBub3JtYWxpemVQYXRoKGAke1JFTU9URV9DT05URU5UX1JPT1R9LyR7cmVsYXRpdmV9YCkucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcblxuICAgIGlmICghcmVsYXRpdmUgfHwgIWlzU2FmZUNvbnRlbnRQYXRoKHBhdGgpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdThGRENcdTdBRUZcdThERUZcdTVGODRcdTVGQzVcdTk4N0JcdTRGNERcdTRFOEVcdTRFRDNcdTVFOTMgY29udGVudCBcdTc2RUVcdTVGNTVcdTUxODVcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhdGg7XG4gIH1cblxuICBsb2NhbFBhdGhGcm9tUmVtb3RlUGF0aChyZW1vdGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRSZW1vdGVQYXRoID0gbm9ybWFsaXplUGF0aChyZW1vdGVQYXRoKS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuXG4gICAgaWYgKCFpc1NhZmVDb250ZW50UGF0aChub3JtYWxpemVkUmVtb3RlUGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1OEZEQ1x1N0FFRlx1OERFRlx1NUY4NFx1NUZDNVx1OTg3Qlx1NEY0RFx1NEU4RVx1NEVEM1x1NUU5MyBjb250ZW50IFx1NzZFRVx1NUY1NVx1NTE4NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICBjb25zdCByZWxhdGl2ZSA9IG5vcm1hbGl6ZWRSZW1vdGVQYXRoLnNsaWNlKFJFTU9URV9DT05URU5UX1JPT1QubGVuZ3RoICsgMSk7XG4gICAgY29uc3QgbG9jYWxSb290ID0gbm9ybWFsaXplUGF0aCh0aGlzLnNldHRpbmdzLmxvY2FsUm9vdFBhdGgpLnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcbiAgICByZXR1cm4gbm9ybWFsaXplUGF0aChgJHtsb2NhbFJvb3R9LyR7cmVsYXRpdmV9YCk7XG4gIH1cblxuICBhc3luYyBlbnN1cmVGb2xkZXJQYXRoKGZvbGRlclBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQYXRoKGZvbGRlclBhdGgpLnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcblxuICAgIGlmICghbm9ybWFsaXplZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHBhcnRzID0gbm9ybWFsaXplZC5zcGxpdChcIi9cIik7XG4gICAgbGV0IGN1cnJlbnQgPSBcIlwiO1xuXG4gICAgZm9yIChjb25zdCBwYXJ0IG9mIHBhcnRzKSB7XG4gICAgICBjdXJyZW50ID0gY3VycmVudCA/IGAke2N1cnJlbnR9LyR7cGFydH1gIDogcGFydDtcbiAgICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGN1cnJlbnQpO1xuXG4gICAgICBpZiAoZW50cnkgaW5zdGFuY2VvZiBURm9sZGVyKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoZW50cnkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBcdTY1RTBcdTZDRDVcdTUyMUJcdTVFRkFcdTc2RUVcdTVGNTVcdUZGMENcdThERUZcdTVGODRcdTVERjJcdTg4QUJcdTY1ODdcdTRFRjZcdTUzNjBcdTc1MjhcdUZGMUEke2N1cnJlbnR9YCk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZUZvbGRlcihjdXJyZW50KTtcbiAgICB9XG4gIH1cblxuICBnZXRTdGF0ZShmaWxlOiBURmlsZSk6IExvY2FsRmlsZVN0YXRlIHtcbiAgICByZXR1cm4gdGhpcy5kYXRhLmZpbGVzW2ZpbGUucGF0aF0gPz8geyBzdGF0dXM6IFwiZHJhZnRcIiB9O1xuICB9XG5cbiAgYXN5bmMgY2FjaGVFZmZlY3RpdmVTdGF0ZShmaWxlOiBURmlsZSwgc3RhdGU6IExvY2FsRmlsZVN0YXRlKSB7XG4gICAgY29uc3QgY3VycmVudCA9IHRoaXMuZGF0YS5maWxlc1tmaWxlLnBhdGhdO1xuXG4gICAgaWYgKFxuICAgICAgY3VycmVudD8ucmVtb3RlUGF0aCA9PT0gc3RhdGUucmVtb3RlUGF0aCAmJlxuICAgICAgY3VycmVudD8uc2hhID09PSBzdGF0ZS5zaGEgJiZcbiAgICAgIGN1cnJlbnQ/LnN0YXR1cyA9PT0gc3RhdGUuc3RhdHVzICYmXG4gICAgICBjdXJyZW50Py5sYXN0U3luY2VkQXQgPT09IHN0YXRlLmxhc3RTeW5jZWRBdCAmJlxuICAgICAgY3VycmVudD8ubGFzdFN5bmNlZEhhc2ggPT09IHN0YXRlLmxhc3RTeW5jZWRIYXNoICYmXG4gICAgICBjdXJyZW50Py5odG1sVXJsID09PSBzdGF0ZS5odG1sVXJsXG4gICAgKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5kYXRhLmZpbGVzW2ZpbGUucGF0aF0gPSBzdGF0ZTtcbiAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gIH1cblxuICBhc3luYyBnZXRFZmZlY3RpdmVTdGF0ZShmaWxlOiBURmlsZSk6IFByb21pc2U8TG9jYWxGaWxlU3RhdGU+IHtcbiAgICBsZXQgc3RhdGUgPSB0aGlzLmdldFN0YXRlKGZpbGUpO1xuXG4gICAgdHJ5IHtcbiAgICAgIHN0YXRlID0gYXdhaXQgdGhpcy5zeW5jRmlsZVN0YXRlKGZpbGUpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gS2VlcCB0aGUgbGFzdCBsb2NhbCBzdGF0ZSB3aGVuIEdpdEh1YiBpcyB0ZW1wb3JhcmlseSB1bmF2YWlsYWJsZS5cbiAgICB9XG5cbiAgICBpZiAoc3RhdGUuc3RhdHVzICE9PSBcInN5bmNlZFwiIHx8ICFzdGF0ZS5sYXN0U3luY2VkSGFzaCkge1xuICAgICAgcmV0dXJuIHN0YXRlO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IGN1cnJlbnRIYXNoID0gaGFzaENvbnRlbnQoY29udGVudCk7XG5cbiAgICBpZiAoY3VycmVudEhhc2ggIT09IHN0YXRlLmxhc3RTeW5jZWRIYXNoKSB7XG4gICAgICBjb25zdCBuZXh0U3RhdGUgPSB7IC4uLnN0YXRlLCBzdGF0dXM6IFwibW9kaWZpZWRcIiBhcyBjb25zdCB9O1xuICAgICAgYXdhaXQgdGhpcy5jYWNoZUVmZmVjdGl2ZVN0YXRlKGZpbGUsIG5leHRTdGF0ZSk7XG4gICAgICByZXR1cm4gbmV4dFN0YXRlO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuY2FjaGVFZmZlY3RpdmVTdGF0ZShmaWxlLCBzdGF0ZSk7XG4gICAgcmV0dXJuIHN0YXRlO1xuICB9XG5cbiAgYXN5bmMgc2V0U3RhdGUoZmlsZTogVEZpbGUsIHBhdGNoOiBQYXJ0aWFsPExvY2FsRmlsZVN0YXRlPikge1xuICAgIHRoaXMuZGF0YS5maWxlc1tmaWxlLnBhdGhdID0geyAuLi50aGlzLmdldFN0YXRlKGZpbGUpLCAuLi5wYXRjaCB9O1xuICAgIGF3YWl0IHRoaXMuc2F2ZUFsbERhdGEoKTtcbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hTdGF0dXNCYXIoKTtcbiAgfVxuXG4gIHNldFN0YXR1c0JhclN0YXRlKHN0YXR1c0NsYXNzOiBzdHJpbmcgfCBudWxsKSB7XG4gICAgdGhpcy5zdGF0dXNCYXJFbC5yZW1vdmVDbGFzcyhcImlzLWRyYWZ0XCIsIFwiaXMtc3luY2VkXCIsIFwiaXMtbW9kaWZpZWRcIiwgXCJpcy1kZWxldGVkXCIsIFwiaXMtZmFpbGVkXCIsIFwiaXMtaW5hY3RpdmVcIik7XG5cbiAgICBpZiAoc3RhdHVzQ2xhc3MpIHtcbiAgICAgIHRoaXMuc3RhdHVzQmFyRWwuYWRkQ2xhc3Moc3RhdHVzQ2xhc3MpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJlZnJlc2hTdGF0dXNCYXIoKSB7XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuZ2V0Q3VycmVudEZpbGUoKTtcblxuICAgIGlmICghZmlsZSkge1xuICAgICAgdGhpcy5zZXRTdGF0dXNCYXJTdGF0ZShcImlzLWluYWN0aXZlXCIpO1xuICAgICAgc2V0SWNvbih0aGlzLnN0YXR1c0Jhckljb25FbCwgXCJnaXQtYnJhbmNoXCIpO1xuICAgICAgdGhpcy5zdGF0dXNCYXJUZXh0RWwuc2V0VGV4dChcIlx1NjVFMFx1NkQzQlx1NTJBOFx1NjU4N1x1N0FFMFwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuaXNJbnNpZGVSb290KGZpbGUpKSB7XG4gICAgICB0aGlzLnNldFN0YXR1c0JhclN0YXRlKFwiaXMtaW5hY3RpdmVcIik7XG4gICAgICBzZXRJY29uKHRoaXMuc3RhdHVzQmFySWNvbkVsLCBcImdpdC1icmFuY2hcIik7XG4gICAgICB0aGlzLnN0YXR1c0JhclRleHRFbC5zZXRUZXh0KFwiXHU0RTBEXHU1NzI4XHU1NDBDXHU2QjY1XHU3NkVFXHU1RjU1XCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHN0YXRlID0gYXdhaXQgdGhpcy5nZXRFZmZlY3RpdmVTdGF0ZShmaWxlKTtcbiAgICBjb25zdCBsYWJlbCA9IHRvU3RhdHVzTGFiZWwoc3RhdGUuc3RhdHVzKTtcbiAgICB0aGlzLnNldFN0YXR1c0JhclN0YXRlKHRvU3RhdHVzQ2xhc3Moc3RhdGUuc3RhdHVzKSk7XG5cbiAgICBzZXRJY29uKHRoaXMuc3RhdHVzQmFySWNvbkVsLCB0b1N0YXR1c0ljb24oc3RhdGUuc3RhdHVzKSk7XG4gICAgdGhpcy5zdGF0dXNCYXJUZXh0RWwuc2V0VGV4dChsYWJlbCk7XG4gIH1cblxuICBhc3luYyBlbnN1cmVUZW1wbGF0ZUZyb250bWF0dGVyKGZpbGU6IFRGaWxlKSB7XG4gICAgaWYgKCF0aGlzLmlzSW5zaWRlUm9vdChmaWxlKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU1RjUzXHU1MjREXHU2NTg3XHU3QUUwXHU0RTBEXHU1NzI4IExvY2FsIFJvb3QgUGF0aCBcdTUxODVcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgY29uc3QgcGFyc2VkID0gcGFyc2VGcm9udG1hdHRlcihjb250ZW50KTtcblxuICAgIGlmIChPYmplY3Qua2V5cyhwYXJzZWQuZGF0YSkubGVuZ3RoID4gMCkge1xuICAgICAgbmV3IE5vdGljZShcIlx1NUY1M1x1NTI0RFx1NjU4N1x1N0FFMFx1NURGMlx1N0VDRlx1NUI1OFx1NTcyOFx1NjU4N1x1N0FFMFx1NUM1RVx1NjAyN1x1MzAwMlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBuZXh0Q29udGVudCA9IGAke2J1aWxkRnJvbnRtYXR0ZXIoZmlsZSl9JHtjb250ZW50fWA7XG4gICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIG5leHRDb250ZW50KTtcbiAgICBuZXcgTm90aWNlKFwiXHU2NTg3XHU3QUUwXHU1QzVFXHU2MDI3XHU1REYyXHU2M0QyXHU1MTY1XHUzMDAyXCIpO1xuICB9XG5cbiAgZ2V0U3luY01lbnVUaXRsZShzdGF0ZTogTG9jYWxGaWxlU3RhdGUpOiBzdHJpbmcge1xuICAgIHN3aXRjaCAoc3RhdGUuc3RhdHVzKSB7XG4gICAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIGNhc2UgXCJkZWxldGVkXCI6XG4gICAgICAgIHJldHVybiBcIlx1OTFDRFx1NjVCMFx1NTQwQ1x1NkI2NVwiO1xuICAgICAgY2FzZSBcImZhaWxlZFwiOlxuICAgICAgICByZXR1cm4gXCJcdTUxOERcdTZCMjFcdTU0MENcdTZCNjVcIjtcbiAgICAgIGNhc2UgXCJzeW5jZWRcIjpcbiAgICAgICAgcmV0dXJuIFwiXHU1REYyXHU1NDBDXHU2QjY1XCI7XG4gICAgICBjYXNlIFwiZHJhZnRcIjpcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiBcIlx1NTQwQ1x1NkI2NVx1NTIzMCBHaXRIdWJcIjtcbiAgICB9XG4gIH1cblxuICBidWlsZEFjdGlvbkNvbnRleHQoZmlsZTogVEZpbGUsIHN0YXRlOiBMb2NhbEZpbGVTdGF0ZSwgaGFzUHJvcGVydGllczogYm9vbGVhbik6IEFydGljbGVBY3Rpb25Db250ZXh0IHtcbiAgICBjb25zdCBpblJvb3QgPSB0aGlzLmlzSW5zaWRlUm9vdChmaWxlKTtcbiAgICBjb25zdCBzeW5jVGl0bGUgPSB0aGlzLmdldFN5bmNNZW51VGl0bGUoc3RhdGUpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGZpbGUsXG4gICAgICBpblJvb3QsXG4gICAgICBoYXNQcm9wZXJ0aWVzLFxuICAgICAgc3RhdGUsXG4gICAgICBzeW5jVGl0bGUsXG4gICAgICBjYW5TeW5jOiBpblJvb3QgJiYgc3RhdGUuc3RhdHVzICE9PSBcInN5bmNlZFwiLFxuICAgICAgY2FuRGVsZXRlUmVtb3RlOiBCb29sZWFuKHN0YXRlLnNoYSkgJiYgc3RhdGUuc3RhdHVzICE9PSBcImRlbGV0ZWRcIixcbiAgICAgIGNhbk9wZW5SZW1vdGU6IEJvb2xlYW4oc3RhdGUuaHRtbFVybCB8fCBzdGF0ZS5yZW1vdGVQYXRoKSAmJiBzdGF0ZS5zdGF0dXMgIT09IFwiZGVsZXRlZFwiLFxuICAgICAgY2FuSW5zZXJ0UHJvcGVydGllczogaW5Sb290ICYmICFoYXNQcm9wZXJ0aWVzXG4gICAgfTtcbiAgfVxuXG4gIGFzeW5jIGdldEFjdGlvbkNvbnRleHQoZmlsZTogVEZpbGUpOiBQcm9taXNlPEFydGljbGVBY3Rpb25Db250ZXh0PiB7XG4gICAgY29uc3QgW3N0YXRlLCBjb250ZW50XSA9IGF3YWl0IFByb21pc2UuYWxsKFt0aGlzLmdldEVmZmVjdGl2ZVN0YXRlKGZpbGUpLCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpXSk7XG4gICAgY29uc3QgcHJvcGVydGllcyA9IHBhcnNlRnJvbnRtYXR0ZXIoY29udGVudCkuZGF0YTtcbiAgICByZXR1cm4gdGhpcy5idWlsZEFjdGlvbkNvbnRleHQoZmlsZSwgc3RhdGUsIE9iamVjdC5rZXlzKHByb3BlcnRpZXMpLmxlbmd0aCA+IDApO1xuICB9XG5cbiAgZ2V0Q2FjaGVkQWN0aW9uQ29udGV4dChmaWxlOiBURmlsZSk6IEFydGljbGVBY3Rpb25Db250ZXh0IHtcbiAgICBjb25zdCBwcm9wZXJ0aWVzID0gdGhpcy5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoZmlsZSk/LmZyb250bWF0dGVyID8/IHt9O1xuICAgIGNvbnN0IHN0YXRlID0gdGhpcy5nZXRTdGF0ZShmaWxlKTtcbiAgICByZXR1cm4gdGhpcy5idWlsZEFjdGlvbkNvbnRleHQoZmlsZSwgc3RhdGUsIE9iamVjdC5rZXlzKHByb3BlcnRpZXMpLmxlbmd0aCA+IDApO1xuICB9XG5cbiAgYXN5bmMgc2hvd1JpYmJvbk1lbnUoZXZ0OiBNb3VzZUV2ZW50KSB7XG4gICAgY29uc3QgbWVudSA9IG5ldyBNZW51KCk7XG4gICAgY29uc3QgY3VycmVudEZpbGUgPSB0aGlzLmdldEN1cnJlbnRGaWxlKCk7XG4gICAgY29uc3QgY29udGV4dCA9IGN1cnJlbnRGaWxlID8gYXdhaXQgdGhpcy5nZXRBY3Rpb25Db250ZXh0KGN1cnJlbnRGaWxlKSA6IG51bGw7XG5cbiAgICBtZW51LnNldFVzZU5hdGl2ZU1lbnUodHJ1ZSk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoY29udGV4dD8uc3luY1RpdGxlID8/IFwiXHU1NDBDXHU2QjY1XHU1MjMwIEdpdEh1YlwiKVxuICAgICAgICAuc2V0SWNvbihcImNsb3VkLXVwbG9hZFwiKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQ/LmNhblN5bmMpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICBpZiAoY29udGV4dCkge1xuICAgICAgICAgICAgdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoKCkgPT4gdGhpcy5zeW5jRmlsZVRvR2l0SHViKGNvbnRleHQuZmlsZSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICApO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiXHU1NDBDXHU2QjY1XHU0RTJEXHU1RkMzXCIpXG4gICAgICAgIC5zZXRJY29uKFwibGlzdC10cmVlXCIpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMub3BlblN5bmNDZW50ZXIoKSlcbiAgICApO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiXHU2MjUzXHU1RjAwIEdpdEh1YlwiKVxuICAgICAgICAuc2V0SWNvbihcImV4dGVybmFsLWxpbmtcIilcbiAgICAgICAgLnNldERpc2FibGVkKCFjb250ZXh0Py5jYW5PcGVuUmVtb3RlKVxuICAgICAgICAub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbnRleHQpIHtcbiAgICAgICAgICAgIHZvaWQgdGhpcy5ydW5XaXRoTm90aWNlKCgpID0+IHRoaXMub3BlblJlbW90ZVVybEZvckZpbGUoY29udGV4dC5maWxlKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJcdTYzRDJcdTUxNjVcdTY1ODdcdTdBRTBcdTVDNUVcdTYwMjdcIilcbiAgICAgICAgLnNldEljb24oXCJmaWxlLXBsdXMtMlwiKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQ/LmNhbkluc2VydFByb3BlcnRpZXMpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICBpZiAoY29udGV4dCkge1xuICAgICAgICAgICAgdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoKCkgPT4gdGhpcy5lbnN1cmVUZW1wbGF0ZUZyb250bWF0dGVyKGNvbnRleHQuZmlsZSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICApO1xuICAgIG1lbnUuYWRkU2VwYXJhdG9yKCk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoY29udGV4dD8uc3RhdGUuc3RhdHVzID09PSBcImRlbGV0ZWRcIiA/IFwiXHU4RkRDXHU3QUVGXHU1REYyXHU1MjIwXHU5NjY0XCIgOiBcIlx1NTIyMFx1OTY2NFx1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlwiKVxuICAgICAgICAuc2V0SWNvbihcImNsb3VkLW9mZlwiKVxuICAgICAgICAuc2V0V2FybmluZyh0cnVlKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQ/LmNhbkRlbGV0ZVJlbW90ZSlcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xuICAgICAgICAgIGlmIChjb250ZXh0KSB7XG4gICAgICAgICAgICB2b2lkIHRoaXMucnVuV2l0aE5vdGljZSgoKSA9PiB0aGlzLmRlbGV0ZVJlbW90ZUZpbGUoY29udGV4dC5maWxlKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICk7XG4gICAgbWVudS5hZGRTZXBhcmF0b3IoKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIlx1NkQ0Qlx1OEJENSBHaXRIdWIgXHU4RkRFXHU2M0E1XCIpXG4gICAgICAgIC5zZXRJY29uKFwiZ2xvYmVcIilcbiAgICAgICAgLm9uQ2xpY2soKCkgPT5cbiAgICAgICAgICB2b2lkIHRoaXMucnVuV2l0aE5vdGljZShhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnRlc3RDb25uZWN0aW9uKCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgKVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJcdThCQkVcdTdGNkVcIilcbiAgICAgICAgLnNldEljb24oXCJzZXR0aW5nc1wiKVxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLm9wZW5QbHVnaW5TZXR0aW5ncygpKVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoYFx1NzI0OFx1NjcyQyB2JHt0aGlzLm1hbmlmZXN0LnZlcnNpb259YClcbiAgICAgICAgLnNldEljb24oXCJpbmZvXCIpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMub3BlblZlcnNpb25JbmZvKCkpXG4gICAgKTtcbiAgICBtZW51LnNob3dBdE1vdXNlRXZlbnQoZXZ0KTtcbiAgfVxuXG4gIGFkZEFydGljbGVDb250ZXh0TWVudUl0ZW1zKG1lbnU6IE1lbnUsIGZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3QgY29udGV4dCA9IHRoaXMuZ2V0Q2FjaGVkQWN0aW9uQ29udGV4dChmaWxlKTtcblxuICAgIG1lbnUuYWRkU2VwYXJhdG9yKCk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoY29udGV4dC5zeW5jVGl0bGUpXG4gICAgICAgIC5zZXRJY29uKFwiY2xvdWQtdXBsb2FkXCIpXG4gICAgICAgIC5zZXREaXNhYmxlZCghY29udGV4dC5jYW5TeW5jKVxuICAgICAgICAub25DbGljaygoKSA9PiB2b2lkIHRoaXMucnVuV2l0aE5vdGljZSgoKSA9PiB0aGlzLnN5bmNGaWxlVG9HaXRIdWIoY29udGV4dC5maWxlKSkpXG4gICAgKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIlx1NjI1M1x1NUYwMCBHaXRIdWJcIilcbiAgICAgICAgLnNldEljb24oXCJleHRlcm5hbC1saW5rXCIpXG4gICAgICAgIC5zZXREaXNhYmxlZCghY29udGV4dC5jYW5PcGVuUmVtb3RlKVxuICAgICAgICAub25DbGljaygoKSA9PiB2b2lkIHRoaXMucnVuV2l0aE5vdGljZSgoKSA9PiB0aGlzLm9wZW5SZW1vdGVVcmxGb3JGaWxlKGNvbnRleHQuZmlsZSkpKVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJcdTYzRDJcdTUxNjVcdTY1ODdcdTdBRTBcdTVDNUVcdTYwMjdcIilcbiAgICAgICAgLnNldEljb24oXCJmaWxlLXBsdXMtMlwiKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQuY2FuSW5zZXJ0UHJvcGVydGllcylcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoKCkgPT4gdGhpcy5lbnN1cmVUZW1wbGF0ZUZyb250bWF0dGVyKGNvbnRleHQuZmlsZSkpKVxuICAgICk7XG4gICAgbWVudS5hZGRTZXBhcmF0b3IoKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShjb250ZXh0LnN0YXRlLnN0YXR1cyA9PT0gXCJkZWxldGVkXCIgPyBcIlx1OEZEQ1x1N0FFRlx1NURGMlx1NTIyMFx1OTY2NFwiIDogXCJcdTUyMjBcdTk2NjRcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcIilcbiAgICAgICAgLnNldEljb24oXCJjbG91ZC1vZmZcIilcbiAgICAgICAgLnNldFdhcm5pbmcodHJ1ZSlcbiAgICAgICAgLnNldERpc2FibGVkKCFjb250ZXh0LmNhbkRlbGV0ZVJlbW90ZSlcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoKCkgPT4gdGhpcy5kZWxldGVSZW1vdGVGaWxlKGNvbnRleHQuZmlsZSkpKVxuICAgICk7XG4gIH1cblxuICBvcGVuUGx1Z2luU2V0dGluZ3MoKSB7XG4gICAgY29uc3QgaW50ZXJuYWxBcHAgPSB0aGlzLmFwcCBhcyBBcHAgJiB7XG4gICAgICBzZXR0aW5nPzoge1xuICAgICAgICBvcGVuOiAoKSA9PiB2b2lkO1xuICAgICAgICBvcGVuVGFiQnlJZD86IChpZDogc3RyaW5nKSA9PiB2b2lkO1xuICAgICAgfTtcbiAgICB9O1xuXG4gICAgaWYgKCFpbnRlcm5hbEFwcC5zZXR0aW5nKSB7XG4gICAgICBuZXcgTm90aWNlKFwiXHU1RjUzXHU1MjREXHU3M0FGXHU1ODgzXHU0RTBEXHU2NTJGXHU2MzAxXHU3NkY0XHU2M0E1XHU4REYzXHU4RjZDXHU2M0QyXHU0RUY2XHU4QkJFXHU3RjZFXHUzMDAyXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGludGVybmFsQXBwLnNldHRpbmcub3BlbigpO1xuICAgIGludGVybmFsQXBwLnNldHRpbmcub3BlblRhYkJ5SWQ/Lih0aGlzLm1hbmlmZXN0LmlkKTtcbiAgfVxuXG4gIG9wZW5WZXJzaW9uSW5mbygpIHtcbiAgICBuZXcgUGx1Z2luVmVyc2lvbk1vZGFsKHRoaXMuYXBwLCB0aGlzKS5vcGVuKCk7XG4gIH1cblxuICBvcGVuU3luY0NlbnRlcigpIHtcbiAgICBuZXcgU3luY0NlbnRlck1vZGFsKHRoaXMuYXBwLCB0aGlzKS5vcGVuKCk7XG4gIH1cblxuICBhc3luYyBydW5XaXRoTm90aWNlKGFjdGlvbjogKCkgPT4gUHJvbWlzZTx2b2lkPikge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCBhY3Rpb24oKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJcdTY3MkFcdTc3RTVcdTk1MTlcdThCRUZcIjtcbiAgICAgIG5ldyBOb3RpY2UobWVzc2FnZSk7XG4gICAgfVxuICB9XG5cbiAgYnVpbGRHaXRIdWJBcGlVcmwocGF0aDogc3RyaW5nLCBwYXJhbXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+KTogc3RyaW5nIHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKGBodHRwczovL2FwaS5naXRodWIuY29tJHtwYXRofWApO1xuXG4gICAgT2JqZWN0LmVudHJpZXMocGFyYW1zID8/IHt9KS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcbiAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICB1cmwuc2VhcmNoUGFyYW1zLnNldChrZXksIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiB1cmwudG9TdHJpbmcoKTtcbiAgfVxuXG4gIGJ1aWxkQ29udGVudEFwaVBhdGgocmVtb3RlUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5nZXRSZXBvc2l0b3J5KCk7XG4gICAgcmV0dXJuIGAvcmVwb3MvJHtlbmNvZGVVUklDb21wb25lbnQocmVwb3NpdG9yeS5vd25lcil9LyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlcG9zaXRvcnkucmVwbyl9L2NvbnRlbnRzLyR7ZW5jb2RlR2l0SHViUGF0aChyZW1vdGVQYXRoKX1gO1xuICB9XG5cbiAgYnVpbGRSZXBvQXBpUGF0aCgpOiBzdHJpbmcge1xuICAgIGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLmdldFJlcG9zaXRvcnkoKTtcbiAgICByZXR1cm4gYC9yZXBvcy8ke2VuY29kZVVSSUNvbXBvbmVudChyZXBvc2l0b3J5Lm93bmVyKX0vJHtlbmNvZGVVUklDb21wb25lbnQocmVwb3NpdG9yeS5yZXBvKX1gO1xuICB9XG5cbiAgYnVpbGRCcmFuY2hBcGlQYXRoKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGAke3RoaXMuYnVpbGRSZXBvQXBpUGF0aCgpfS9icmFuY2hlcy8ke2VuY29kZVVSSUNvbXBvbmVudCh0aGlzLnNldHRpbmdzLmJyYW5jaC50cmltKCkpfWA7XG4gIH1cblxuICBidWlsZEdpdFRyZWVBcGlQYXRoKCk6IHN0cmluZyB7XG4gICAgY29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuZ2V0UmVwb3NpdG9yeSgpO1xuICAgIHJldHVybiBgL3JlcG9zLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlcG9zaXRvcnkub3duZXIpfS8ke2VuY29kZVVSSUNvbXBvbmVudChyZXBvc2l0b3J5LnJlcG8pfS9naXQvdHJlZXMvJHtlbmNvZGVVUklDb21wb25lbnQodGhpcy5zZXR0aW5ncy5icmFuY2gudHJpbSgpKX1gO1xuICB9XG5cbiAgYnVpbGRHaXRIdWJCbG9iVXJsKHJlbW90ZVBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgY29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuZ2V0UmVwb3NpdG9yeSgpO1xuICAgIHJldHVybiBgaHR0cHM6Ly9naXRodWIuY29tLyR7cmVwb3NpdG9yeS5vd25lcn0vJHtyZXBvc2l0b3J5LnJlcG99L2Jsb2IvJHtlbmNvZGVVUklDb21wb25lbnQodGhpcy5zZXR0aW5ncy5icmFuY2gudHJpbSgpKX0vJHtlbmNvZGVHaXRIdWJQYXRoKHJlbW90ZVBhdGgpfWA7XG4gIH1cblxuICBhc3luYyBnaXRodWJSZXF1ZXN0PFRSZXNwb25zZT4oXG4gICAgbWV0aG9kOiBcIkdFVFwiIHwgXCJQVVRcIiB8IFwiREVMRVRFXCIsXG4gICAgcGF0aDogc3RyaW5nLFxuICAgIHBheWxvYWQ/OiB1bmtub3duLFxuICAgIHBhcmFtcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD5cbiAgKTogUHJvbWlzZTxUUmVzcG9uc2U+IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3RVcmwoe1xuICAgICAgdXJsOiB0aGlzLmJ1aWxkR2l0SHViQXBpVXJsKHBhdGgsIHBhcmFtcyksXG4gICAgICBtZXRob2QsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEFjY2VwdDogXCJhcHBsaWNhdGlvbi92bmQuZ2l0aHViK2pzb25cIixcbiAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3RoaXMuc2V0dGluZ3MuZ2l0aHViVG9rZW4udHJpbSgpfWAsXG4gICAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICAgICAgICBcIlgtR2l0SHViLUFwaS1WZXJzaW9uXCI6IFwiMjAyMi0xMS0yOFwiXG4gICAgICB9LFxuICAgICAgYm9keTogcGF5bG9hZCA/IEpTT04uc3RyaW5naWZ5KHBheWxvYWQpIDogdW5kZWZpbmVkXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3RhdHVzID49IDQwMCkge1xuICAgICAgbGV0IGVycm9yTWVzc2FnZSA9IHJlc3BvbnNlLnRleHQ7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmVzcG9uc2UudGV4dCkgYXMgR2l0SHViRXJyb3JQYXlsb2FkO1xuICAgICAgICBpZiAocGFyc2VkLm1lc3NhZ2UpIHtcbiAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBwYXJzZWQubWVzc2FnZTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIEtlZXAgcmF3IHJlc3BvbnNlIHRleHQgd2hlbiBpdCBpcyBub3QgSlNPTi5cbiAgICAgIH1cblxuICAgICAgdGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcihyZXNwb25zZS5zdGF0dXMsIGVycm9yTWVzc2FnZSB8fCBgR2l0SHViIEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9YCwgbWV0aG9kLCBwYXRoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzcG9uc2UuanNvbiBhcyBUUmVzcG9uc2U7XG4gIH1cblxuICBhc3luYyBnZXRSZW1vdGVDb250ZW50KHJlbW90ZVBhdGg6IHN0cmluZyk6IFByb21pc2U8R2l0SHViQ29udGVudFJlc3BvbnNlIHwgbnVsbD4ge1xuICAgIGlmICghaXNTYWZlQ29udGVudFBhdGgocmVtb3RlUGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1OEZEQ1x1N0FFRlx1OERFRlx1NUY4NFx1NUZDNVx1OTg3Qlx1NEY0RFx1NEU4RVx1NEVEM1x1NUU5MyBjb250ZW50IFx1NzZFRVx1NUY1NVx1NTE4NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5naXRodWJSZXF1ZXN0PEdpdEh1YkNvbnRlbnRSZXNwb25zZSB8IEdpdEh1YkNvbnRlbnRSZXNwb25zZVtdPihcbiAgICAgICAgXCJHRVRcIixcbiAgICAgICAgdGhpcy5idWlsZENvbnRlbnRBcGlQYXRoKHJlbW90ZVBhdGgpLFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIHsgcmVmOiB0aGlzLnNldHRpbmdzLmJyYW5jaC50cmltKCkgfVxuICAgICAgKTtcblxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmVzdWx0KSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdThGRENcdTdBRUZcdThERUZcdTVGODRcdTYzMDdcdTU0MTFcdTc2RUVcdTVGNTVcdUZGMENcdTRFMERcdTgwRkRcdTRGNUNcdTRFM0FcdTY1ODdcdTdBRTBcdTU0MENcdTZCNjVcdTc2RUVcdTY4MDdcdTMwMDJcIik7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXN1bHQudHlwZSAhPT0gXCJmaWxlXCIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4RkRDXHU3QUVGXHU4REVGXHU1Rjg0XHU0RTBEXHU2NjJGXHU2NjZFXHU5MDFBXHU2NTg3XHU0RUY2XHVGRjBDXHU0RTBEXHU4MEZEXHU0RjVDXHU0RTNBXHU2NTg3XHU3QUUwXHU1NDBDXHU2QjY1XHU3NkVFXHU2ODA3XHUzMDAyXCIpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBHaXRIdWJSZXF1ZXN0RXJyb3IgJiYgZXJyb3Iuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGdldFJlbW90ZUZpbGVCeXRlcyhyZW1vdGVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHsgY29udGVudDogVWludDhBcnJheTsgcmVtb3RlOiBHaXRIdWJDb250ZW50UmVzcG9uc2UgfT4ge1xuICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuZ2V0UmVtb3RlQ29udGVudChyZW1vdGVQYXRoKTtcblxuICAgIGlmICghcmVtb3RlKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFx1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlx1NEUwRFx1NUI1OFx1NTcyOFx1RkYxQSR7cmVtb3RlUGF0aH1gKTtcbiAgICB9XG5cbiAgICBpZiAocmVtb3RlLmVuY29kaW5nICE9PSBcImJhc2U2NFwiIHx8ICFyZW1vdGUuY29udGVudCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcdTUxODVcdTVCQjlcdTdGMTZcdTc4MDFcdTRFMERcdTUzRDdcdTY1MkZcdTYzMDFcdUZGMUEke3JlbW90ZVBhdGh9YCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNvbnRlbnQ6IGRlY29kZUJhc2U2NEJ5dGVzKHJlbW90ZS5jb250ZW50KSxcbiAgICAgIHJlbW90ZVxuICAgIH07XG4gIH1cblxuICBhc3luYyBwdWxsUmVtb3RlRmlsZShyZW1vdGVQYXRoOiBzdHJpbmcpIHtcbiAgICB0aGlzLnZhbGlkYXRlQ29uZmlnKCk7XG5cbiAgICBjb25zdCB7IGNvbnRlbnQsIHJlbW90ZSB9ID0gYXdhaXQgdGhpcy5nZXRSZW1vdGVGaWxlQnl0ZXMocmVtb3RlUGF0aCk7XG4gICAgY29uc3QgbG9jYWxQYXRoID0gdGhpcy5sb2NhbFBhdGhGcm9tUmVtb3RlUGF0aChyZW1vdGVQYXRoKTtcbiAgICBjb25zdCBwYXJlbnRQYXRoID0gbG9jYWxQYXRoLmluY2x1ZGVzKFwiL1wiKSA/IGxvY2FsUGF0aC5zbGljZSgwLCBsb2NhbFBhdGgubGFzdEluZGV4T2YoXCIvXCIpKSA6IFwiXCI7XG4gICAgYXdhaXQgdGhpcy5lbnN1cmVGb2xkZXJQYXRoKHBhcmVudFBhdGgpO1xuXG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgobG9jYWxQYXRoKTtcbiAgICBjb25zdCBpc01hcmtkb3duID0gbG9jYWxQYXRoLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoXCIubWRcIik7XG4gICAgY29uc3QgdGV4dENvbnRlbnQgPSBpc01hcmtkb3duID8gbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGNvbnRlbnQpIDogXCJcIjtcbiAgICBsZXQgZmlsZTogVEZpbGU7XG5cbiAgICBpZiAoZXhpc3RpbmcgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgaWYgKGlzTWFya2Rvd24pIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGV4aXN0aW5nLCB0ZXh0Q29udGVudCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnlCaW5hcnkoZXhpc3RpbmcsIGNvbnRlbnQuYnVmZmVyLnNsaWNlKGNvbnRlbnQuYnl0ZU9mZnNldCwgY29udGVudC5ieXRlT2Zmc2V0ICsgY29udGVudC5ieXRlTGVuZ3RoKSk7XG4gICAgICB9XG4gICAgICBmaWxlID0gZXhpc3Rpbmc7XG4gICAgfSBlbHNlIGlmIChleGlzdGluZykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBcdTY1RTBcdTZDRDVcdTYyQzlcdTUzRDZcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcdUZGMENcdTY3MkNcdTU3MzBcdThERUZcdTVGODRcdTVERjJcdTg4QUJcdTc2RUVcdTVGNTVcdTUzNjBcdTc1MjhcdUZGMUEke2xvY2FsUGF0aH1gKTtcbiAgICB9IGVsc2UgaWYgKGlzTWFya2Rvd24pIHtcbiAgICAgIGZpbGUgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGUobG9jYWxQYXRoLCB0ZXh0Q29udGVudCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZpbGUgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVCaW5hcnkobG9jYWxQYXRoLCBjb250ZW50LmJ1ZmZlci5zbGljZShjb250ZW50LmJ5dGVPZmZzZXQsIGNvbnRlbnQuYnl0ZU9mZnNldCArIGNvbnRlbnQuYnl0ZUxlbmd0aCkpO1xuICAgIH1cblxuICAgIHRoaXMuZGF0YS5maWxlc1tmaWxlLnBhdGhdID0ge1xuICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIHNoYTogcmVtb3RlLnNoYSxcbiAgICAgIHN0YXR1czogXCJzeW5jZWRcIixcbiAgICAgIGxhc3RTeW5jZWRBdDogZm9ybWF0RGF0ZVRpbWUobmV3IERhdGUoKSksXG4gICAgICBsYXN0U3luY2VkSGFzaDogaXNNYXJrZG93biA/IGhhc2hDb250ZW50KHRleHRDb250ZW50KSA6IGhhc2hCeXRlcyhjb250ZW50LmJ1ZmZlci5zbGljZShjb250ZW50LmJ5dGVPZmZzZXQsIGNvbnRlbnQuYnl0ZU9mZnNldCArIGNvbnRlbnQuYnl0ZUxlbmd0aCkpLFxuICAgICAgaHRtbFVybDogcmVtb3RlLmh0bWxfdXJsID8/IHRoaXMuYnVpbGRHaXRIdWJCbG9iVXJsKHJlbW90ZVBhdGgpXG4gICAgfTtcbiAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoU3RhdHVzQmFyKCk7XG4gIH1cblxuICBjb2xsZWN0U3luY2FibGVGaWxlcyhmb2xkZXI6IFRGb2xkZXIsIGZpbGVzOiBURmlsZVtdID0gW10pOiBURmlsZVtdIHtcbiAgICBmb2xkZXIuY2hpbGRyZW4uZm9yRWFjaCgoZW50cnkpID0+IHtcbiAgICAgIGlmIChlbnRyeSBpbnN0YW5jZW9mIFRGaWxlICYmIGlzU3luY2FibGVGaWxlKGVudHJ5KSkge1xuICAgICAgICBmaWxlcy5wdXNoKGVudHJ5KTtcbiAgICAgIH0gZWxzZSBpZiAoZW50cnkgaW5zdGFuY2VvZiBURm9sZGVyKSB7XG4gICAgICAgIHRoaXMuY29sbGVjdFN5bmNhYmxlRmlsZXMoZW50cnksIGZpbGVzKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBmaWxlcztcbiAgfVxuXG4gIGdldExvY2FsU3luY2FibGVGaWxlcygpOiBURmlsZVtdIHtcbiAgICBjb25zdCByb290ID0gdGhpcy5nZXRFeGlzdGluZ0ZvbGRlcih0aGlzLnNldHRpbmdzLmxvY2FsUm9vdFBhdGgpO1xuICAgIGlmICghcm9vdCkge1xuICAgICAgcmV0dXJuIFtdO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmNvbGxlY3RTeW5jYWJsZUZpbGVzKHJvb3QpXG4gICAgICAuZmlsdGVyKChmaWxlKSA9PiB0aGlzLmlzSW5zaWRlUm9vdChmaWxlKSlcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBhLnBhdGgubG9jYWxlQ29tcGFyZShiLnBhdGgsIFwiemgtQ05cIikpO1xuICB9XG5cbiAgYXN5bmMgZ2V0UmVtb3RlU3luY2FibGVGaWxlcygpOiBQcm9taXNlPE1hcDxzdHJpbmcsIFJlbW90ZVN5bmNGaWxlPj4ge1xuICAgIHRoaXMudmFsaWRhdGVDb25maWcoKTtcblxuICAgIGNvbnN0IHRyZWUgPSBhd2FpdCB0aGlzLmdpdGh1YlJlcXVlc3Q8R2l0SHViVHJlZVJlc3BvbnNlPihcIkdFVFwiLCB0aGlzLmJ1aWxkR2l0VHJlZUFwaVBhdGgoKSwgdW5kZWZpbmVkLCB7XG4gICAgICByZWN1cnNpdmU6IFwiMVwiXG4gICAgfSk7XG5cbiAgICBpZiAodHJlZS50cnVuY2F0ZWQpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJHaXRIdWIgXHU4RkQ0XHU1NkRFXHU3Njg0XHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHU2ODExXHU4OEFCXHU2MjJBXHU2NUFEXHVGRjBDXHU1MjE3XHU4ODY4XHU1M0VGXHU4MEZEXHU0RTBEXHU1QjhDXHU2NTc0XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IHJlbW90ZUZpbGVzID0gbmV3IE1hcDxzdHJpbmcsIFJlbW90ZVN5bmNGaWxlPigpO1xuXG4gICAgdHJlZS50cmVlLmZvckVhY2goKGVudHJ5KSA9PiB7XG4gICAgICBjb25zdCBmaWxlTmFtZSA9IGVudHJ5LnBhdGguc3BsaXQoXCIvXCIpLnBvcCgpID8/IFwiXCI7XG4gICAgICBpZiAoZW50cnkudHlwZSAhPT0gXCJibG9iXCIgfHwgIWVudHJ5LnBhdGguc3RhcnRzV2l0aChgJHtSRU1PVEVfQ09OVEVOVF9ST09UfS9gKSB8fCBmaWxlTmFtZS5zdGFydHNXaXRoKFwiLlwiKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmICghaXNTYWZlQ29udGVudFBhdGgoZW50cnkucGF0aCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICByZW1vdGVGaWxlcy5zZXQoZW50cnkucGF0aCwge1xuICAgICAgICByZW1vdGVQYXRoOiBlbnRyeS5wYXRoLFxuICAgICAgICBzaGE6IGVudHJ5LnNoYSxcbiAgICAgICAgaHRtbFVybDogdGhpcy5idWlsZEdpdEh1YkJsb2JVcmwoZW50cnkucGF0aClcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJlbW90ZUZpbGVzO1xuICB9XG5cbiAgYXN5bmMgYnVpbGRTeW5jQ2VudGVySXRlbXMoKTogUHJvbWlzZTxTeW5jQ2VudGVySXRlbVtdPiB7XG4gICAgdGhpcy52YWxpZGF0ZUNvbmZpZygpO1xuXG4gICAgY29uc3QgW3JlbW90ZUZpbGVzLCBsb2NhbEZpbGVzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgIHRoaXMuZ2V0UmVtb3RlU3luY2FibGVGaWxlcygpLFxuICAgICAgUHJvbWlzZS5yZXNvbHZlKHRoaXMuZ2V0TG9jYWxTeW5jYWJsZUZpbGVzKCkpXG4gICAgXSk7XG4gICAgY29uc3QgaXRlbXM6IFN5bmNDZW50ZXJJdGVtW10gPSBbXTtcbiAgICBjb25zdCBzZWVuUmVtb3RlUGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICAgIGZvciAoY29uc3QgZmlsZSBvZiBsb2NhbEZpbGVzKSB7XG4gICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5yZW1vdGVQYXRoKGZpbGUpO1xuICAgICAgY29uc3QgcmVtb3RlID0gcmVtb3RlRmlsZXMuZ2V0KHJlbW90ZVBhdGgpO1xuICAgICAgY29uc3Qgc3RhdGUgPSB0aGlzLmdldFN0YXRlKGZpbGUpO1xuICAgICAgY29uc3QgdGV4dENvbnRlbnQgPSBmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiID8gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKSA6IFwiXCI7XG4gICAgICBjb25zdCBiaW5hcnlDb250ZW50ID0gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIiA/IHRleHRCeXRlcyh0ZXh0Q29udGVudCkuYnVmZmVyIDogYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZEJpbmFyeShmaWxlKTtcbiAgICAgIGNvbnN0IGN1cnJlbnRIYXNoID0gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIiA/IGhhc2hDb250ZW50KHRleHRDb250ZW50KSA6IGhhc2hCeXRlcyhiaW5hcnlDb250ZW50KTtcbiAgICAgIGNvbnN0IGN1cnJlbnRCbG9iU2hhID0gYXdhaXQgZ2l0QmxvYlNoYShiaW5hcnlDb250ZW50KTtcbiAgICAgIGxldCBzdGF0dXM6IFN5bmNDZW50ZXJTdGF0dXM7XG5cbiAgICAgIHNlZW5SZW1vdGVQYXRocy5hZGQocmVtb3RlUGF0aCk7XG5cbiAgICAgIGlmICghcmVtb3RlKSB7XG4gICAgICAgIHN0YXR1cyA9IFwidW5wdWJsaXNoZWRcIjtcbiAgICAgIH0gZWxzZSBpZiAocmVtb3RlLnNoYSA9PT0gY3VycmVudEJsb2JTaGEpIHtcbiAgICAgICAgc3RhdHVzID0gXCJwdWJsaXNoZWRcIjtcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUuc2hhID09PSBjdXJyZW50QmxvYlNoYSAmJiBzdGF0ZS5zdGF0dXMgPT09IFwic3luY2VkXCIpIHtcbiAgICAgICAgc3RhdHVzID0gXCJwdWJsaXNoZWRcIjtcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUubGFzdFN5bmNlZEhhc2ggJiYgc3RhdGUubGFzdFN5bmNlZEhhc2ggPT09IGN1cnJlbnRIYXNoICYmIHN0YXRlLnNoYSA9PT0gcmVtb3RlLnNoYSkge1xuICAgICAgICBzdGF0dXMgPSBcInB1Ymxpc2hlZFwiO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RhdHVzID0gXCJtb2RpZmllZFwiO1xuICAgICAgfVxuXG4gICAgICBpdGVtcy5wdXNoKHtcbiAgICAgICAgaWQ6IGBsb2NhbDoke2ZpbGUucGF0aH1gLFxuICAgICAgICBuYW1lOiBmaWxlLm5hbWUsXG4gICAgICAgIHN0YXR1cyxcbiAgICAgICAgbG9jYWxQYXRoOiBmaWxlLnBhdGgsXG4gICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIGZvbGRlclBhdGg6IHJlbW90ZVBhdGguc2xpY2UoMCwgTWF0aC5tYXgocmVtb3RlUGF0aC5sYXN0SW5kZXhPZihcIi9cIiksIFJFTU9URV9DT05URU5UX1JPT1QubGVuZ3RoKSksXG4gICAgICAgIGZpbGUsXG4gICAgICAgIHJlbW90ZSxcbiAgICAgICAgc3RhdGVcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJlbW90ZUZpbGVzLmZvckVhY2goKHJlbW90ZSwgcmVtb3RlUGF0aCkgPT4ge1xuICAgICAgaWYgKHNlZW5SZW1vdGVQYXRocy5oYXMocmVtb3RlUGF0aCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBuYW1lID0gcmVtb3RlUGF0aC5zcGxpdChcIi9cIikucG9wKCkgPz8gcmVtb3RlUGF0aDtcbiAgICAgIGl0ZW1zLnB1c2goe1xuICAgICAgICBpZDogYHJlbW90ZToke3JlbW90ZVBhdGh9YCxcbiAgICAgICAgbmFtZSxcbiAgICAgICAgc3RhdHVzOiBcImxvY2FsRGVsZXRlZFwiLFxuICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICBmb2xkZXJQYXRoOiByZW1vdGVQYXRoLnNsaWNlKDAsIE1hdGgubWF4KHJlbW90ZVBhdGgubGFzdEluZGV4T2YoXCIvXCIpLCBSRU1PVEVfQ09OVEVOVF9ST09ULmxlbmd0aCkpLFxuICAgICAgICByZW1vdGVcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIGl0ZW1zLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgIGNvbnN0IHN0YXR1c09yZGVyOiBSZWNvcmQ8U3luY0NlbnRlclN0YXR1cywgbnVtYmVyPiA9IHtcbiAgICAgICAgdW5wdWJsaXNoZWQ6IDAsXG4gICAgICAgIG1vZGlmaWVkOiAxLFxuICAgICAgICBwdWJsaXNoZWQ6IDIsXG4gICAgICAgIGxvY2FsRGVsZXRlZDogM1xuICAgICAgfTtcblxuICAgICAgcmV0dXJuIHN0YXR1c09yZGVyW2Euc3RhdHVzXSAtIHN0YXR1c09yZGVyW2Iuc3RhdHVzXSB8fCBhLnJlbW90ZVBhdGgubG9jYWxlQ29tcGFyZShiLnJlbW90ZVBhdGgsIFwiemgtQ05cIik7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBkZWxldGVSZW1vdGVQYXRoKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIHRoaXMudmFsaWRhdGVDb25maWcoKTtcblxuICAgIGlmICghaXNTYWZlQ29udGVudFBhdGgocmVtb3RlUGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1OEZEQ1x1N0FFRlx1OERFRlx1NUY4NFx1NUZDNVx1OTg3Qlx1NEY0RFx1NEU4RVx1NEVEM1x1NUU5MyBjb250ZW50IFx1NzZFRVx1NUY1NVx1NTE4NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLmdldFJlbW90ZUNvbnRlbnQocmVtb3RlUGF0aCk7XG4gICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgIG5ldyBOb3RpY2UoYFx1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlx1NEUwRFx1NUI1OFx1NTcyOFx1RkYxQSR7cmVtb3RlUGF0aH1gKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLmdpdGh1YlJlcXVlc3Q8R2l0SHViRGVsZXRlUmVzcG9uc2U+KFwiREVMRVRFXCIsIHRoaXMuYnVpbGRDb250ZW50QXBpUGF0aChyZW1vdGVQYXRoKSwge1xuICAgICAgbWVzc2FnZTogYHN5bmM6IGRlbGV0ZSAke3JlbW90ZVBhdGh9YCxcbiAgICAgIHNoYTogcmVtb3RlLnNoYSxcbiAgICAgIGJyYW5jaDogdGhpcy5zZXR0aW5ncy5icmFuY2gudHJpbSgpXG4gICAgfSk7XG5cbiAgICBPYmplY3QuZW50cmllcyh0aGlzLmRhdGEuZmlsZXMpLmZvckVhY2goKFtsb2NhbFBhdGgsIHN0YXRlXSkgPT4ge1xuICAgICAgaWYgKHN0YXRlLnJlbW90ZVBhdGggPT09IHJlbW90ZVBhdGgpIHtcbiAgICAgICAgdGhpcy5kYXRhLmZpbGVzW2xvY2FsUGF0aF0gPSB7XG4gICAgICAgICAgLi4uc3RhdGUsXG4gICAgICAgICAgc2hhOiB1bmRlZmluZWQsXG4gICAgICAgICAgaHRtbFVybDogdW5kZWZpbmVkLFxuICAgICAgICAgIHN0YXR1czogXCJkZWxldGVkXCJcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gIH1cblxuICBhc3luYyBzeW5jRmlsZVN0YXRlKGZpbGU6IFRGaWxlKTogUHJvbWlzZTxMb2NhbEZpbGVTdGF0ZT4ge1xuICAgIGlmICghdGhpcy5pc0luc2lkZVJvb3QoZmlsZSkpIHtcbiAgICAgIHJldHVybiB7IHN0YXR1czogXCJkcmFmdFwiIH07XG4gICAgfVxuXG4gICAgdGhpcy52YWxpZGF0ZUNvbmZpZygpO1xuXG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMucmVtb3RlUGF0aChmaWxlKTtcbiAgICBjb25zdCBjdXJyZW50ID0gdGhpcy5nZXRTdGF0ZShmaWxlKTtcbiAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLmdldFJlbW90ZUNvbnRlbnQocmVtb3RlUGF0aCk7XG5cbiAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgY29uc3QgbmV4dFN0YXRlOiBMb2NhbEZpbGVTdGF0ZSA9IGN1cnJlbnQuc2hhXG4gICAgICAgID8ge1xuICAgICAgICAgICAgLi4uY3VycmVudCxcbiAgICAgICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgICAgICBzaGE6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIGh0bWxVcmw6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIHN0YXR1czogXCJkZWxldGVkXCJcbiAgICAgICAgICB9XG4gICAgICAgIDogeyByZW1vdGVQYXRoLCBzdGF0dXM6IFwiZHJhZnRcIiB9O1xuXG4gICAgICB0aGlzLmRhdGEuZmlsZXNbZmlsZS5wYXRoXSA9IG5leHRTdGF0ZTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZUFsbERhdGEoKTtcbiAgICAgIHJldHVybiBuZXh0U3RhdGU7XG4gICAgfVxuXG4gICAgY29uc3QgbmV4dFN0YXRlOiBMb2NhbEZpbGVTdGF0ZSA9IHtcbiAgICAgIC4uLmN1cnJlbnQsXG4gICAgICByZW1vdGVQYXRoLFxuICAgICAgc2hhOiByZW1vdGUuc2hhLFxuICAgICAgaHRtbFVybDogcmVtb3RlLmh0bWxfdXJsID8/IHRoaXMuYnVpbGRHaXRIdWJCbG9iVXJsKHJlbW90ZVBhdGgpLFxuICAgICAgc3RhdHVzOiBcInN5bmNlZFwiXG4gICAgfTtcblxuICAgIGlmIChjdXJyZW50LnNoYSAhPT0gcmVtb3RlLnNoYSkge1xuICAgICAgbmV4dFN0YXRlLmxhc3RTeW5jZWRIYXNoID0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIHRoaXMuZGF0YS5maWxlc1tmaWxlLnBhdGhdID0gbmV4dFN0YXRlO1xuICAgIGF3YWl0IHRoaXMuc2F2ZUFsbERhdGEoKTtcbiAgICByZXR1cm4gbmV4dFN0YXRlO1xuICB9XG5cbiAgYXN5bmMgdGVzdENvbm5lY3Rpb24oKTogUHJvbWlzZTxDb25uZWN0aW9uU3RhdGU+IHtcbiAgICB0cnkge1xuICAgICAgdGhpcy52YWxpZGF0ZUNvbmZpZygpO1xuICAgICAgY29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuZ2V0UmVwb3NpdG9yeSgpO1xuICAgICAgY29uc3QgdXNlciA9IGF3YWl0IHRoaXMuZ2l0aHViUmVxdWVzdDxHaXRIdWJVc2VyUmVzcG9uc2U+KFwiR0VUXCIsIFwiL3VzZXJcIik7XG5cbiAgICAgIGNvbnN0IHJlcG8gPSBhd2FpdCB0aGlzLmdpdGh1YlJlcXVlc3Q8R2l0SHViUmVwb1Jlc3BvbnNlPihcIkdFVFwiLCB0aGlzLmJ1aWxkUmVwb0FwaVBhdGgoKSk7XG4gICAgICBhd2FpdCB0aGlzLmdpdGh1YlJlcXVlc3Q8dW5rbm93bj4oXCJHRVRcIiwgdGhpcy5idWlsZEJyYW5jaEFwaVBhdGgoKSk7XG5cbiAgICAgIGlmICh1c2VyLmxvZ2luLnRvTG93ZXJDYXNlKCkgIT09IHRoaXMuc2V0dGluZ3MuZ2l0aHViVXNlcm5hbWUudHJpbSgpLnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUb2tlbiBcdTc1MjhcdTYyMzdcdTRFM0EgJHt1c2VyLmxvZ2lufVx1RkYwQ1x1NEUwRVx1OTE0RFx1N0Y2RVx1NzY4NCBHaXRIdWIgVXNlcm5hbWUgXHU0RTBEXHU0RTAwXHU4MUY0XHUzMDAyYCk7XG4gICAgICB9XG5cbiAgICAgIGlmICghcmVwby5wZXJtaXNzaW9ucz8uYWRtaW4gJiYgIXJlcG8ucGVybWlzc2lvbnM/Lm1haW50YWluICYmICFyZXBvLnBlcm1pc3Npb25zPy5wdXNoKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgVG9rZW4gXHU1QkY5ICR7cmVwby5mdWxsX25hbWV9IFx1NkNBMVx1NjcwOVx1NTE5OVx1Njc0M1x1OTY1MFx1MzAwMlx1OEJGN1x1Nzg2RVx1OEJBNCBGaW5lLWdyYWluZWQgdG9rZW4gXHU1REYyXHU2Mzg4XHU2NzQzXHU4QkU1XHU0RUQzXHU1RTkzXHVGRjBDXHU1RTc2XHU1QzA2IENvbnRlbnRzIFx1OEJCRVx1N0Y2RVx1NEUzQSBSZWFkIGFuZCB3cml0ZVx1MzAwMmBcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc3RhdGU6IENvbm5lY3Rpb25TdGF0ZSA9IHtcbiAgICAgICAgc3RhdHVzOiBcInN1Y2Nlc3NcIixcbiAgICAgICAgbWVzc2FnZTogYFx1OEZERVx1NjNBNVx1NjIxMFx1NTI5Rlx1RkYxQSR7cmVwb3NpdG9yeS5vd25lcn0vJHtyZXBvc2l0b3J5LnJlcG99QCR7dGhpcy5zZXR0aW5ncy5icmFuY2gudHJpbSgpfWAsXG4gICAgICAgIGNoZWNrZWRBdDogZm9ybWF0RGF0ZVRpbWUobmV3IERhdGUoKSlcbiAgICAgIH07XG4gICAgICB0aGlzLmRhdGEuY29ubmVjdGlvbiA9IHN0YXRlO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlQWxsRGF0YSgpO1xuICAgICAgbmV3IE5vdGljZShzdGF0ZS5tZXNzYWdlKTtcbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJcdThGREVcdTYzQTVcdTU5MzFcdThEMjVcIjtcbiAgICAgIGNvbnN0IHN0YXRlOiBDb25uZWN0aW9uU3RhdGUgPSB7XG4gICAgICAgIHN0YXR1czogXCJmYWlsZWRcIixcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgY2hlY2tlZEF0OiBmb3JtYXREYXRlVGltZShuZXcgRGF0ZSgpKVxuICAgICAgfTtcbiAgICAgIHRoaXMuZGF0YS5jb25uZWN0aW9uID0gc3RhdGU7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBhc3luYyBzeW5jRmlsZVRvR2l0SHViKGZpbGU6IFRGaWxlKSB7XG4gICAgdGhpcy52YWxpZGF0ZUNvbmZpZygpO1xuXG4gICAgaWYgKCF0aGlzLmlzSW5zaWRlUm9vdChmaWxlKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU1RjUzXHU1MjREXHU2NTg3XHU3QUUwXHU0RTBEXHU1NzI4IExvY2FsIFJvb3QgUGF0aCBcdTUxODVcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgY29uc3QgaXNNYXJrZG93biA9IGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCI7XG4gICAgY29uc3QgY29udGVudCA9IGlzTWFya2Rvd24gPyBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpIDogXCJcIjtcbiAgICBjb25zdCBiaW5hcnlDb250ZW50ID0gaXNNYXJrZG93biA/IHRleHRCeXRlcyhjb250ZW50KS5idWZmZXIgOiBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgIGNvbnN0IGN1cnJlbnRIYXNoID0gaXNNYXJrZG93biA/IGhhc2hDb250ZW50KGNvbnRlbnQpIDogaGFzaEJ5dGVzKGJpbmFyeUNvbnRlbnQpO1xuICAgIGNvbnN0IGN1cnJlbnRCbG9iU2hhID0gYXdhaXQgZ2l0QmxvYlNoYShiaW5hcnlDb250ZW50KTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5yZW1vdGVQYXRoKGZpbGUpO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHRoaXMuZ2V0U3RhdGUoZmlsZSk7XG4gICAgICBjb25zdCBjYWNoZWRTaGEgPSBjdXJyZW50U3RhdGUucmVtb3RlUGF0aCA9PT0gcmVtb3RlUGF0aCA/IGN1cnJlbnRTdGF0ZS5zaGEgOiB1bmRlZmluZWQ7XG4gICAgICBsZXQgcmVzb2x2ZWRSZW1vdGU6IEdpdEh1YkNvbnRlbnRSZXNwb25zZSB8IG51bGwgPSBudWxsO1xuXG4gICAgICBjb25zdCBwdXRDb250ZW50ID0gKHNoYT86IHN0cmluZykgPT5cbiAgICAgICAgdGhpcy5naXRodWJSZXF1ZXN0PEdpdEh1YlB1dFJlc3BvbnNlPihcIlBVVFwiLCB0aGlzLmJ1aWxkQ29udGVudEFwaVBhdGgocmVtb3RlUGF0aCksIHtcbiAgICAgICAgICBtZXNzYWdlOiBgJHtzaGEgPyBcInN5bmM6IHVwZGF0ZVwiIDogXCJzeW5jOiBhZGRcIn0gJHtyZW1vdGVQYXRofWAsXG4gICAgICAgICAgY29udGVudDogaXNNYXJrZG93biA/IGVuY29kZUJhc2U2NChjb250ZW50KSA6IGVuY29kZUJ5dGVzQmFzZTY0KG5ldyBVaW50OEFycmF5KGJpbmFyeUNvbnRlbnQpKSxcbiAgICAgICAgICBicmFuY2g6IHRoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKSxcbiAgICAgICAgICAuLi4oc2hhID8geyBzaGEgfSA6IHt9KVxuICAgICAgICB9KTtcblxuICAgICAgbGV0IHJlc3VsdDogR2l0SHViUHV0UmVzcG9uc2U7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHB1dENvbnRlbnQoY2FjaGVkU2hhKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEdpdEh1YlJlcXVlc3RFcnJvciAmJiAoZXJyb3Iuc3RhdHVzID09PSA0MDkgfHwgZXJyb3Iuc3RhdHVzID09PSA0MjIpKSB7XG4gICAgICAgICAgcmVzb2x2ZWRSZW1vdGUgPSBhd2FpdCB0aGlzLmdldFJlbW90ZUNvbnRlbnQocmVtb3RlUGF0aCk7XG4gICAgICAgICAgcmVzdWx0ID0gYXdhaXQgcHV0Q29udGVudChyZXNvbHZlZFJlbW90ZT8uc2hhKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBuZXh0U2hhID0gcmVzdWx0LmNvbnRlbnQ/LnNoYSA/PyBjdXJyZW50QmxvYlNoYSA/PyByZXNvbHZlZFJlbW90ZT8uc2hhID8/IGNhY2hlZFNoYTtcbiAgICAgIGNvbnN0IGh0bWxVcmwgPSByZXN1bHQuY29udGVudD8uaHRtbF91cmwgPz8gdGhpcy5idWlsZEdpdEh1YkJsb2JVcmwocmVtb3RlUGF0aCk7XG5cbiAgICAgIGF3YWl0IHRoaXMuc2V0U3RhdGUoZmlsZSwge1xuICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICBzaGE6IG5leHRTaGEsXG4gICAgICAgIHN0YXR1czogXCJzeW5jZWRcIixcbiAgICAgICAgbGFzdFN5bmNlZEF0OiBmb3JtYXREYXRlVGltZShuZXcgRGF0ZSgpKSxcbiAgICAgICAgbGFzdFN5bmNlZEhhc2g6IGN1cnJlbnRIYXNoLFxuICAgICAgICBodG1sVXJsXG4gICAgICB9KTtcblxuICAgICAgbmV3IE5vdGljZShgXHU1NDBDXHU2QjY1XHU2MjEwXHU1MjlGXHVGRjFBJHtyZW1vdGVQYXRofWApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBhd2FpdCB0aGlzLnNldFN0YXRlKGZpbGUsIHsgcmVtb3RlUGF0aCwgc3RhdHVzOiBcImZhaWxlZFwiIH0pO1xuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgR2l0SHViUmVxdWVzdEVycm9yICYmIGVycm9yLnN0YXR1cyA9PT0gNDA0KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgR2l0SHViIFx1NTE5OVx1NTE2NVx1OEZENFx1NTZERSA0MDRcdUZGMUEke3JlbW90ZVBhdGh9XHUzMDAyXHU5MDFBXHU1RTM4XHU2NjJGIFRva2VuIFx1NkNBMVx1NjcwOVx1NjM4OFx1Njc0M1x1NUY1M1x1NTI0RFx1NEVEM1x1NUU5M1x1MzAwMVJlcG9zaXRvcnkgVVJMIFx1NEUwRFx1NjYyRlx1NzZFRVx1NjgwN1x1NTM1QVx1NUJBMlx1NEVEM1x1NUU5M1x1RkYwQ1x1NjIxNlx1NTIwNlx1NjUyRiAke3RoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKX0gXHU0RTBEXHU1M0VGXHU1MTk5XHUzMDAyXHU4QkY3XHU3ODZFXHU4QkE0IHRva2VuIFx1NzY4NCBSZXBvc2l0b3J5IGFjY2VzcyBcdTUzMDVcdTU0MkJcdThCRTVcdTRFRDNcdTVFOTNcdUZGMENcdTRFMTQgQ29udGVudHMgXHU0RTNBIFJlYWQgYW5kIHdyaXRlXHUzMDAyYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc3luY0N1cnJlbnROb3RlKCkge1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmdldEN1cnJlbnRGaWxlKCk7XG5cbiAgICBpZiAoIWZpbGUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1NUY1M1x1NTI0RFx1NkNBMVx1NjcwOVx1NkZDMFx1NkQzQlx1NzY4NCBNYXJrZG93biBcdTY1ODdcdTRFRjZcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5zeW5jRmlsZVRvR2l0SHViKGZpbGUpO1xuICB9XG5cbiAgYXN5bmMgZGVsZXRlUmVtb3RlRmlsZShmaWxlOiBURmlsZSkge1xuICAgIHRoaXMudmFsaWRhdGVDb25maWcoKTtcblxuICAgIGlmICghdGhpcy5pc0luc2lkZVJvb3QoZmlsZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1NUY1M1x1NTI0RFx1NjU4N1x1N0FFMFx1NEUwRFx1NTcyOCBMb2NhbCBSb290IFBhdGggXHU1MTg1XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLnJlbW90ZVBhdGgoZmlsZSk7XG4gICAgY29uc3QgcmVtb3RlID0gYXdhaXQgdGhpcy5nZXRSZW1vdGVDb250ZW50KHJlbW90ZVBhdGgpO1xuXG4gICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgIGF3YWl0IHRoaXMuc2V0U3RhdGUoZmlsZSwge1xuICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICBzaGE6IHVuZGVmaW5lZCxcbiAgICAgICAgaHRtbFVybDogdW5kZWZpbmVkLFxuICAgICAgICBzdGF0dXM6IFwiZGVsZXRlZFwiXG4gICAgICB9KTtcbiAgICAgIG5ldyBOb3RpY2UoXCJcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcdTRFMERcdTVCNThcdTU3MjhcdTMwMDJcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5naXRodWJSZXF1ZXN0PEdpdEh1YkRlbGV0ZVJlc3BvbnNlPihcIkRFTEVURVwiLCB0aGlzLmJ1aWxkQ29udGVudEFwaVBhdGgocmVtb3RlUGF0aCksIHtcbiAgICAgIG1lc3NhZ2U6IGBzeW5jOiBkZWxldGUgJHtyZW1vdGVQYXRofWAsXG4gICAgICBzaGE6IHJlbW90ZS5zaGEsXG4gICAgICBicmFuY2g6IHRoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKVxuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5zZXRTdGF0ZShmaWxlLCB7XG4gICAgICByZW1vdGVQYXRoLFxuICAgICAgc2hhOiB1bmRlZmluZWQsXG4gICAgICBodG1sVXJsOiB1bmRlZmluZWQsXG4gICAgICBzdGF0dXM6IFwiZGVsZXRlZFwiXG4gICAgfSk7XG4gICAgbmV3IE5vdGljZShcIlx1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlx1NURGMlx1NTIyMFx1OTY2NFx1MzAwMlwiKTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZUN1cnJlbnRSZW1vdGVOb3RlKCkge1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmdldEN1cnJlbnRGaWxlKCk7XG5cbiAgICBpZiAoIWZpbGUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1NUY1M1x1NTI0RFx1NkNBMVx1NjcwOVx1NkZDMFx1NkQzQlx1NzY4NCBNYXJrZG93biBcdTY1ODdcdTRFRjZcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5kZWxldGVSZW1vdGVGaWxlKGZpbGUpO1xuICB9XG5cbiAgYXN5bmMgb3BlblJlbW90ZVVybEZvckZpbGUoZmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCBzdGF0ZSA9IGF3YWl0IHRoaXMuZ2V0RWZmZWN0aXZlU3RhdGUoZmlsZSk7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHN0YXRlLnJlbW90ZVBhdGggPz8gdGhpcy5yZW1vdGVQYXRoKGZpbGUpO1xuXG4gICAgaWYgKHN0YXRlLnN0YXR1cyA9PT0gXCJkZWxldGVkXCIpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcdTVERjJcdTdFQ0ZcdTUyMjBcdTk2NjRcdTMwMDJcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgd2luZG93Lm9wZW4oc3RhdGUuaHRtbFVybCA/PyB0aGlzLmJ1aWxkR2l0SHViQmxvYlVybChyZW1vdGVQYXRoKSwgXCJfYmxhbmtcIik7XG4gIH1cblxuICBhc3luYyBvcGVuUmVtb3RlVXJsKCkge1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmdldEN1cnJlbnRGaWxlKCk7XG4gICAgaWYgKCFmaWxlKSB7XG4gICAgICBuZXcgTm90aWNlKFwiXHU1RjUzXHU1MjREXHU2Q0ExXHU2NzA5XHU2RkMwXHU2RDNCXHU2NTg3XHU0RUY2XHUzMDAyXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMub3BlblJlbW90ZVVybEZvckZpbGUoZmlsZSk7XG4gIH1cbn1cblxuY2xhc3MgU3luY0NlbnRlck1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luO1xuICBpdGVtczogU3luY0NlbnRlckl0ZW1bXSA9IFtdO1xuICBzZWxlY3RlZElkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBjb2xsYXBzZWRQYXRocyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBsb2FkaW5nID0gZmFsc2U7XG4gIGVycm9yTWVzc2FnZSA9IFwiXCI7XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW4pIHtcbiAgICBzdXBlcihhcHApO1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICB9XG5cbiAgb25PcGVuKCkge1xuICAgIHZvaWQgdGhpcy5yZWZyZXNoKCk7XG4gIH1cblxuICBhc3luYyByZWZyZXNoKCkge1xuICAgIHRoaXMubG9hZGluZyA9IHRydWU7XG4gICAgdGhpcy5lcnJvck1lc3NhZ2UgPSBcIlwiO1xuICAgIHRoaXMucmVuZGVyKCk7XG5cbiAgICB0cnkge1xuICAgICAgdGhpcy5pdGVtcyA9IGF3YWl0IHRoaXMucGx1Z2luLmJ1aWxkU3luY0NlbnRlckl0ZW1zKCk7XG4gICAgICBjb25zdCB2YWxpZElkcyA9IG5ldyBTZXQodGhpcy5pdGVtcy5tYXAoKGl0ZW0pID0+IGl0ZW0uaWQpKTtcbiAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZm9yRWFjaCgoaWQpID0+IHtcbiAgICAgICAgaWYgKCF2YWxpZElkcy5oYXMoaWQpKSB7XG4gICAgICAgICAgdGhpcy5zZWxlY3RlZElkcy5kZWxldGUoaWQpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGhpcy5lcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiXHU1NDBDXHU2QjY1XHU0RTJEXHU1RkMzXHU1MkEwXHU4RjdEXHU1OTMxXHU4RDI1XHUzMDAyXCI7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMubG9hZGluZyA9IGZhbHNlO1xuICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICB9XG4gIH1cblxuICBnZXRTZWxlY3RlZEl0ZW1zKCk6IFN5bmNDZW50ZXJJdGVtW10ge1xuICAgIHJldHVybiB0aGlzLml0ZW1zLmZpbHRlcigoaXRlbSkgPT4gdGhpcy5zZWxlY3RlZElkcy5oYXMoaXRlbS5pZCkpO1xuICB9XG5cbiAgZ2V0U2VsZWN0ZWRMb2NhbEl0ZW1zKCk6IFN5bmNDZW50ZXJJdGVtW10ge1xuICAgIHJldHVybiB0aGlzLmdldFNlbGVjdGVkSXRlbXMoKS5maWx0ZXIoXG4gICAgICAoaXRlbSkgPT4gaXRlbS5maWxlICYmIHRoaXMucGx1Z2luLmlzSW5zaWRlUm9vdChpdGVtLmZpbGUpICYmIGl0ZW0uc3RhdHVzICE9PSBcInB1Ymxpc2hlZFwiICYmIGl0ZW0uc3RhdHVzICE9PSBcImxvY2FsRGVsZXRlZFwiXG4gICAgKTtcbiAgfVxuXG4gIGdldFNlbGVjdGVkUmVtb3RlT25seUl0ZW1zKCk6IFN5bmNDZW50ZXJJdGVtW10ge1xuICAgIHJldHVybiB0aGlzLmdldFNlbGVjdGVkSXRlbXMoKS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uc3RhdHVzID09PSBcImxvY2FsRGVsZXRlZFwiKTtcbiAgfVxuXG4gIGdldFNlbGVjdGVkUmVtb3RlSXRlbXMoKTogU3luY0NlbnRlckl0ZW1bXSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0U2VsZWN0ZWRJdGVtcygpLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5yZW1vdGUpO1xuICB9XG5cbiAgc2V0SXRlbXNTZWxlY3RlZChpdGVtczogU3luY0NlbnRlckl0ZW1bXSwgc2VsZWN0ZWQ6IGJvb2xlYW4pIHtcbiAgICBpdGVtcy5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgICBpZiAoc2VsZWN0ZWQpIHtcbiAgICAgICAgdGhpcy5zZWxlY3RlZElkcy5hZGQoaXRlbS5pZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnNlbGVjdGVkSWRzLmRlbGV0ZShpdGVtLmlkKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIHJlbmRlclByZXNlcnZpbmdTY3JvbGwoKSB7XG4gICAgY29uc3QgYm9keUVsID0gdGhpcy5jb250ZW50RWwucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXCIub2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLWNlbnRlci1ib2R5XCIpO1xuICAgIGNvbnN0IG1vZGFsQ29udGVudEVsID0gdGhpcy5jb250ZW50RWwucGFyZW50RWxlbWVudDtcbiAgICBjb25zdCBib2R5U2Nyb2xsVG9wID0gYm9keUVsPy5zY3JvbGxUb3AgPz8gMDtcbiAgICBjb25zdCBtb2RhbFNjcm9sbFRvcCA9IG1vZGFsQ29udGVudEVsPy5zY3JvbGxUb3AgPz8gMDtcblxuICAgIHRoaXMucmVuZGVyKCk7XG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgIGNvbnN0IG5leHRCb2R5RWwgPSB0aGlzLmNvbnRlbnRFbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIi5vYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtY2VudGVyLWJvZHlcIik7XG4gICAgICBpZiAobmV4dEJvZHlFbCkge1xuICAgICAgICBuZXh0Qm9keUVsLnNjcm9sbFRvcCA9IGJvZHlTY3JvbGxUb3A7XG4gICAgICB9XG4gICAgICBpZiAobW9kYWxDb250ZW50RWwpIHtcbiAgICAgICAgbW9kYWxDb250ZW50RWwuc2Nyb2xsVG9wID0gbW9kYWxTY3JvbGxUb3A7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICB0b2dnbGVEaXJlY3RvcnkocGF0aDogc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMuY29sbGFwc2VkUGF0aHMuaGFzKHBhdGgpKSB7XG4gICAgICB0aGlzLmNvbGxhcHNlZFBhdGhzLmRlbGV0ZShwYXRoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5jb2xsYXBzZWRQYXRocy5hZGQocGF0aCk7XG4gICAgfVxuICAgIHRoaXMucmVuZGVyUHJlc2VydmluZ1Njcm9sbCgpO1xuICB9XG5cbiAgYnVpbGRUcmVlKGl0ZW1zOiBTeW5jQ2VudGVySXRlbVtdKTogU3luY1RyZWVOb2RlIHtcbiAgICBjb25zdCByb290OiBTeW5jVHJlZU5vZGUgPSB7XG4gICAgICBuYW1lOiBSRU1PVEVfQ09OVEVOVF9ST09ULFxuICAgICAgcGF0aDogUkVNT1RFX0NPTlRFTlRfUk9PVCxcbiAgICAgIGNoaWxkcmVuOiBuZXcgTWFwKCksXG4gICAgICBpdGVtczogW11cbiAgICB9O1xuXG4gICAgaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgICAgY29uc3QgcmVsYXRpdmUgPSBpdGVtLnJlbW90ZVBhdGguc3RhcnRzV2l0aChgJHtSRU1PVEVfQ09OVEVOVF9ST09UfS9gKVxuICAgICAgICA/IGl0ZW0ucmVtb3RlUGF0aC5zbGljZShSRU1PVEVfQ09OVEVOVF9ST09ULmxlbmd0aCArIDEpXG4gICAgICAgIDogaXRlbS5yZW1vdGVQYXRoO1xuICAgICAgY29uc3QgcGFydHMgPSByZWxhdGl2ZS5zcGxpdChcIi9cIik7XG4gICAgICBjb25zdCBmb2xkZXJzID0gcGFydHMuc2xpY2UoMCwgLTEpO1xuICAgICAgbGV0IG5vZGUgPSByb290O1xuXG4gICAgICBmb2xkZXJzLmZvckVhY2goKGZvbGRlcikgPT4ge1xuICAgICAgICBjb25zdCBjaGlsZFBhdGggPSBgJHtub2RlLnBhdGh9LyR7Zm9sZGVyfWA7XG4gICAgICAgIGxldCBjaGlsZCA9IG5vZGUuY2hpbGRyZW4uZ2V0KGZvbGRlcik7XG4gICAgICAgIGlmICghY2hpbGQpIHtcbiAgICAgICAgICBjaGlsZCA9IHtcbiAgICAgICAgICAgIG5hbWU6IGZvbGRlcixcbiAgICAgICAgICAgIHBhdGg6IGNoaWxkUGF0aCxcbiAgICAgICAgICAgIGNoaWxkcmVuOiBuZXcgTWFwKCksXG4gICAgICAgICAgICBpdGVtczogW11cbiAgICAgICAgICB9O1xuICAgICAgICAgIG5vZGUuY2hpbGRyZW4uc2V0KGZvbGRlciwgY2hpbGQpO1xuICAgICAgICB9XG4gICAgICAgIG5vZGUgPSBjaGlsZDtcbiAgICAgIH0pO1xuXG4gICAgICBub2RlLml0ZW1zLnB1c2goaXRlbSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcm9vdDtcbiAgfVxuXG4gIGdldE5vZGVJdGVtcyhub2RlOiBTeW5jVHJlZU5vZGUpOiBTeW5jQ2VudGVySXRlbVtdIHtcbiAgICBjb25zdCBpdGVtcyA9IFsuLi5ub2RlLml0ZW1zXTtcbiAgICBub2RlLmNoaWxkcmVuLmZvckVhY2goKGNoaWxkKSA9PiB7XG4gICAgICBpdGVtcy5wdXNoKC4uLnRoaXMuZ2V0Tm9kZUl0ZW1zKGNoaWxkKSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGl0ZW1zO1xuICB9XG5cbiAgcmVuZGVyKCkge1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuICAgIGNvbnRlbnRFbC5hZGRDbGFzcyhcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1jZW50ZXJcIik7XG5cbiAgICB0aGlzLnJlbmRlckhlYWRlcihjb250ZW50RWwpO1xuXG4gICAgaWYgKHRoaXMubG9hZGluZykge1xuICAgICAgY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtY2VudGVyLWVtcHR5XCIsIHRleHQ6IFwiXHU2QjYzXHU1NzI4XHU1MkEwXHU4RjdEXHU2NzJDXHU1NzMwXHU0RTBFXHU4RkRDXHU3QUVGXHU1MTg1XHU1QkI5Li4uXCIgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuZXJyb3JNZXNzYWdlKSB7XG4gICAgICBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1jZW50ZXItZXJyb3JcIiwgdGV4dDogdGhpcy5lcnJvck1lc3NhZ2UgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5yZW5kZXJTdW1tYXJ5KGNvbnRlbnRFbCk7XG4gICAgdGhpcy5yZW5kZXJUb29sYmFyKGNvbnRlbnRFbCk7XG5cbiAgICBjb25zdCBib2R5RWwgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1jZW50ZXItYm9keVwiIH0pO1xuICAgIGNvbnN0IHN0YXR1c2VzOiBTeW5jQ2VudGVyU3RhdHVzW10gPSBbXCJ1bnB1Ymxpc2hlZFwiLCBcIm1vZGlmaWVkXCIsIFwicHVibGlzaGVkXCIsIFwibG9jYWxEZWxldGVkXCJdO1xuICAgIHN0YXR1c2VzLmZvckVhY2goKHN0YXR1cykgPT4gdGhpcy5yZW5kZXJTdGF0dXNTZWN0aW9uKGJvZHlFbCwgc3RhdHVzKSk7XG4gIH1cblxuICByZW5kZXJIZWFkZXIoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3QgaGVhZGVyRWwgPSBjb250YWluZXJFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLWNlbnRlci1oZWFkZXJcIiB9KTtcbiAgICBjb25zdCB0aXRsZUdyb3VwRWwgPSBoZWFkZXJFbC5jcmVhdGVEaXYoKTtcbiAgICBjb25zdCB0aXRsZVJvd0VsID0gdGl0bGVHcm91cEVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtY2VudGVyLXRpdGxlLXJvd1wiIH0pO1xuICAgIHRpdGxlUm93RWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiXHU1NDBDXHU2QjY1XHU0RTJEXHU1RkMzXCIgfSk7XG4gICAgY29uc3QgcmVmcmVzaEJ1dHRvbiA9IHRpdGxlUm93RWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1pY29uLWJ1dHRvblwiIH0pO1xuICAgIHJlZnJlc2hCdXR0b24udHlwZSA9IFwiYnV0dG9uXCI7XG4gICAgcmVmcmVzaEJ1dHRvbi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIsIFwiXHU1MjM3XHU2NUIwXHU1NDBDXHU2QjY1XHU0RTJEXHU1RkMzXCIpO1xuICAgIHJlZnJlc2hCdXR0b24uc2V0QXR0cmlidXRlKFwidGl0bGVcIiwgXCJcdTUyMzdcdTY1QjBcIik7XG4gICAgc2V0SWNvbihyZWZyZXNoQnV0dG9uLCBcInJlZnJlc2gtY3dcIik7XG4gICAgcmVmcmVzaEJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdm9pZCB0aGlzLnJlZnJlc2goKSk7XG4gICAgdGl0bGVHcm91cEVsLmNyZWF0ZURpdih7XG4gICAgICBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1tdXRlZFwiLFxuICAgICAgdGV4dDogYCR7dGhpcy5wbHVnaW4uc2V0dGluZ3MucmVwb3NpdG9yeVVybCB8fCBcIlx1NjcyQVx1OTE0RFx1N0Y2RVx1NEVEM1x1NUU5M1wifSBcdTAwQjcgJHt0aGlzLnBsdWdpbi5zZXR0aW5ncy5icmFuY2ggfHwgXCJcdTY3MkFcdTkxNERcdTdGNkVcdTUyMDZcdTY1MkZcIn1gXG4gICAgfSk7XG4gIH1cblxuICByZW5kZXJTdW1tYXJ5KGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnN0IHN1bW1hcnlFbCA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtc3VtbWFyeVwiIH0pO1xuICAgIGNvbnN0IHN0YXR1c2VzOiBTeW5jQ2VudGVyU3RhdHVzW10gPSBbXCJ1bnB1Ymxpc2hlZFwiLCBcIm1vZGlmaWVkXCIsIFwicHVibGlzaGVkXCIsIFwibG9jYWxEZWxldGVkXCJdO1xuXG4gICAgc3RhdHVzZXMuZm9yRWFjaCgoc3RhdHVzKSA9PiB7XG4gICAgICBjb25zdCBjb3VudCA9IHRoaXMuaXRlbXMuZmlsdGVyKChpdGVtKSA9PiBpdGVtLnN0YXR1cyA9PT0gc3RhdHVzKS5sZW5ndGg7XG4gICAgICBjb25zdCBiYWRnZUVsID0gc3VtbWFyeUVsLmNyZWF0ZURpdih7XG4gICAgICAgIGNsczogYG9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1zdW1tYXJ5LWl0ZW0gJHt0b1N5bmNDZW50ZXJTdGF0dXNDbGFzcyhzdGF0dXMpfWBcbiAgICAgIH0pO1xuICAgICAgYmFkZ2VFbC5jcmVhdGVTcGFuKHsgdGV4dDogdG9TeW5jQ2VudGVyU3RhdHVzTGFiZWwoc3RhdHVzKSB9KTtcbiAgICAgIGJhZGdlRWwuY3JlYXRlU3Bhbih7IHRleHQ6IFN0cmluZyhjb3VudCksIGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtc3VtbWFyeS1jb3VudFwiIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgcmVuZGVyVG9vbGJhcihjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCB0b29sYmFyRWwgPSBjb250YWluZXJFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXRvb2xiYXJcIiB9KTtcbiAgICBjb25zdCBzZWxlY3RlZExvY2FsQ291bnQgPSB0aGlzLmdldFNlbGVjdGVkTG9jYWxJdGVtcygpLmxlbmd0aDtcbiAgICBjb25zdCBzZWxlY3RlZFJlbW90ZU9ubHlDb3VudCA9IHRoaXMuZ2V0U2VsZWN0ZWRSZW1vdGVPbmx5SXRlbXMoKS5sZW5ndGg7XG4gICAgY29uc3Qgc2VsZWN0ZWRSZW1vdGVDb3VudCA9IHRoaXMuZ2V0U2VsZWN0ZWRSZW1vdGVJdGVtcygpLmxlbmd0aDtcblxuICAgIHRvb2xiYXJFbC5jcmVhdGVEaXYoe1xuICAgICAgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItbXV0ZWRcIixcbiAgICAgIHRleHQ6IGBcdTVERjJcdTkwMDlcdTYyRTkgJHt0aGlzLnNlbGVjdGVkSWRzLnNpemV9IFx1OTg3OWBcbiAgICB9KTtcblxuICAgIGNvbnN0IHN5bmNCdXR0b24gPSB0b29sYmFyRWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBgXHU1NDBDXHU2QjY1XHU2NzJDXHU1NzMwICgke3NlbGVjdGVkTG9jYWxDb3VudH0pYCB9KTtcbiAgICBzeW5jQnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgIHN5bmNCdXR0b24uZGlzYWJsZWQgPSBzZWxlY3RlZExvY2FsQ291bnQgPT09IDA7XG4gICAgc3luY0J1dHRvbi5hZGRDbGFzcyhcIm1vZC1jdGFcIik7XG4gICAgc3luY0J1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdm9pZCB0aGlzLnN5bmNTZWxlY3RlZExvY2FsRmlsZXMoKSk7XG5cbiAgICBjb25zdCBwdWxsQnV0dG9uID0gdG9vbGJhckVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogYFx1NjJDOVx1NTNENlx1OEZEQ1x1N0FFRiAoJHtzZWxlY3RlZFJlbW90ZU9ubHlDb3VudH0pYCB9KTtcbiAgICBwdWxsQnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgIHB1bGxCdXR0b24uZGlzYWJsZWQgPSBzZWxlY3RlZFJlbW90ZU9ubHlDb3VudCA9PT0gMDtcbiAgICBwdWxsQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB2b2lkIHRoaXMucHVsbFNlbGVjdGVkUmVtb3RlRmlsZXMoKSk7XG5cbiAgICBjb25zdCBkZWxldGVCdXR0b24gPSB0b29sYmFyRWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBgXHU1MjIwXHU5NjY0XHU4RkRDXHU3QUVGICgke3NlbGVjdGVkUmVtb3RlQ291bnR9KWAgfSk7XG4gICAgZGVsZXRlQnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgIGRlbGV0ZUJ1dHRvbi5kaXNhYmxlZCA9IHNlbGVjdGVkUmVtb3RlQ291bnQgPT09IDA7XG4gICAgZGVsZXRlQnV0dG9uLmFkZENsYXNzKFwibW9kLXdhcm5pbmdcIik7XG4gICAgZGVsZXRlQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB2b2lkIHRoaXMuZGVsZXRlU2VsZWN0ZWRSZW1vdGVGaWxlcygpKTtcbiAgfVxuXG4gIHJlbmRlclN0YXR1c1NlY3Rpb24oY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBzdGF0dXM6IFN5bmNDZW50ZXJTdGF0dXMpIHtcbiAgICBjb25zdCBzZWN0aW9uSXRlbXMgPSB0aGlzLml0ZW1zLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5zdGF0dXMgPT09IHN0YXR1cyk7XG4gICAgY29uc3Qgc2VjdGlvbkVsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1zZWN0aW9uXCIgfSk7XG4gICAgY29uc3QgaGVhZGVyRWwgPSBzZWN0aW9uRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1zZWN0aW9uLWhlYWRlclwiIH0pO1xuICAgIGhlYWRlckVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0b1N5bmNDZW50ZXJTdGF0dXNMYWJlbChzdGF0dXMpIH0pO1xuICAgIGhlYWRlckVsLmNyZWF0ZVNwYW4oe1xuICAgICAgY2xzOiBgb2JzaWRpYW4tZ2l0LXN5bmNlci1zdGF0dXMtYmFkZ2UgJHt0b1N5bmNDZW50ZXJTdGF0dXNDbGFzcyhzdGF0dXMpfWAsXG4gICAgICB0ZXh0OiBTdHJpbmcoc2VjdGlvbkl0ZW1zLmxlbmd0aClcbiAgICB9KTtcblxuICAgIGlmIChzZWN0aW9uSXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBzZWN0aW9uRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1jZW50ZXItZW1wdHlcIiwgdGV4dDogXCJcdTY2ODJcdTY1RTBcdTY1ODdcdTRFRjZcdTMwMDJcIiB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB0cmVlID0gdGhpcy5idWlsZFRyZWUoc2VjdGlvbkl0ZW1zKTtcbiAgICBjb25zdCB0cmVlRWwgPSBzZWN0aW9uRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10cmVlXCIgfSk7XG4gICAgdGhpcy5yZW5kZXJUcmVlQ29udGVudHModHJlZUVsLCB0cmVlLCAwKTtcbiAgfVxuXG4gIHJlbmRlclRyZWVDb250ZW50cyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIG5vZGU6IFN5bmNUcmVlTm9kZSwgZGVwdGg6IG51bWJlcikge1xuICAgIEFycmF5LmZyb20obm9kZS5jaGlsZHJlbi52YWx1ZXMoKSlcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUsIFwiemgtQ05cIikpXG4gICAgICAuZm9yRWFjaCgoY2hpbGQpID0+IHtcbiAgICAgICAgdGhpcy5yZW5kZXJEaXJlY3RvcnlSb3coY29udGFpbmVyRWwsIGNoaWxkLCBkZXB0aCk7XG4gICAgICAgIGlmICghdGhpcy5jb2xsYXBzZWRQYXRocy5oYXMoY2hpbGQucGF0aCkpIHtcbiAgICAgICAgICB0aGlzLnJlbmRlclRyZWVDb250ZW50cyhjb250YWluZXJFbCwgY2hpbGQsIGRlcHRoICsgMSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgbm9kZS5pdGVtc1xuICAgICAgLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSwgXCJ6aC1DTlwiKSlcbiAgICAgIC5mb3JFYWNoKChpdGVtKSA9PiB0aGlzLnJlbmRlckZpbGVSb3coY29udGFpbmVyRWwsIGl0ZW0sIGRlcHRoKSk7XG4gIH1cblxuICByZW5kZXJEaXJlY3RvcnlSb3coY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBub2RlOiBTeW5jVHJlZU5vZGUsIGRlcHRoOiBudW1iZXIpIHtcbiAgICBjb25zdCBpdGVtcyA9IHRoaXMuZ2V0Tm9kZUl0ZW1zKG5vZGUpO1xuICAgIGNvbnN0IHNlbGVjdGVkQ291bnQgPSBpdGVtcy5maWx0ZXIoKGl0ZW0pID0+IHRoaXMuc2VsZWN0ZWRJZHMuaGFzKGl0ZW0uaWQpKS5sZW5ndGg7XG4gICAgY29uc3QgaXNDb2xsYXBzZWQgPSB0aGlzLmNvbGxhcHNlZFBhdGhzLmhhcyhub2RlLnBhdGgpO1xuICAgIGNvbnN0IHJvd0VsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10cmVlLXJvdyBpcy1mb2xkZXJcIiB9KTtcbiAgICByb3dFbC5hZGRDbGFzcyhpc0NvbGxhcHNlZCA/IFwiaXMtY29sbGFwc2VkXCIgOiBcImlzLWV4cGFuZGVkXCIpO1xuICAgIHJvd0VsLnN0eWxlLnNldFByb3BlcnR5KFwiLS1zeW5jLXRyZWUtZGVwdGhcIiwgU3RyaW5nKGRlcHRoKSk7XG5cbiAgICBjb25zdCBjaGVja2JveCA9IHJvd0VsLmNyZWF0ZUVsKFwiaW5wdXRcIik7XG4gICAgY2hlY2tib3gudHlwZSA9IFwiY2hlY2tib3hcIjtcbiAgICBjaGVja2JveC5jaGVja2VkID0gc2VsZWN0ZWRDb3VudCA+IDAgJiYgc2VsZWN0ZWRDb3VudCA9PT0gaXRlbXMubGVuZ3RoO1xuICAgIGNoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBzZWxlY3RlZENvdW50ID4gMCAmJiBzZWxlY3RlZENvdW50IDwgaXRlbXMubGVuZ3RoO1xuICAgIGNoZWNrYm94LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpKTtcbiAgICBjaGVja2JveC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHtcbiAgICAgIHRoaXMuc2V0SXRlbXNTZWxlY3RlZChpdGVtcywgY2hlY2tib3guY2hlY2tlZCk7XG4gICAgICB0aGlzLnJlbmRlclByZXNlcnZpbmdTY3JvbGwoKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGljb25FbCA9IHJvd0VsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXRyZWUtaWNvblwiIH0pO1xuICAgIHNldEljb24oaWNvbkVsLCBpc0NvbGxhcHNlZCA/IFwiZm9sZGVyLWNsb3NlZFwiIDogXCJmb2xkZXItb3BlblwiKTtcblxuICAgIGNvbnN0IG5hbWVFbCA9IHJvd0VsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXRyZWUtbmFtZVwiLCB0ZXh0OiBub2RlLm5hbWUgfSk7XG4gICAgcm93RWwuY3JlYXRlU3Bhbih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtdHJlZS1tZXRhXCIsIHRleHQ6IGAke2l0ZW1zLmxlbmd0aH0gXHU5ODc5YCB9KTtcbiAgICByb3dFbC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy50b2dnbGVEaXJlY3Rvcnkobm9kZS5wYXRoKSk7XG4gIH1cblxuICByZW5kZXJGaWxlUm93KGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgaXRlbTogU3luY0NlbnRlckl0ZW0sIGRlcHRoOiBudW1iZXIpIHtcbiAgICBjb25zdCByb3dFbCA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtdHJlZS1yb3cgaXMtZmlsZVwiIH0pO1xuICAgIHJvd0VsLnN0eWxlLnNldFByb3BlcnR5KFwiLS1zeW5jLXRyZWUtZGVwdGhcIiwgU3RyaW5nKGRlcHRoKSk7XG5cbiAgICBjb25zdCBjaGVja2JveCA9IHJvd0VsLmNyZWF0ZUVsKFwiaW5wdXRcIik7XG4gICAgY2hlY2tib3gudHlwZSA9IFwiY2hlY2tib3hcIjtcbiAgICBjaGVja2JveC5jaGVja2VkID0gdGhpcy5zZWxlY3RlZElkcy5oYXMoaXRlbS5pZCk7XG4gICAgY2hlY2tib3guYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gICAgICBpZiAoY2hlY2tib3guY2hlY2tlZCkge1xuICAgICAgICB0aGlzLnNlbGVjdGVkSWRzLmFkZChpdGVtLmlkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZGVsZXRlKGl0ZW0uaWQpO1xuICAgICAgfVxuICAgICAgdGhpcy5yZW5kZXJQcmVzZXJ2aW5nU2Nyb2xsKCk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBpY29uRWwgPSByb3dFbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10cmVlLWljb25cIiB9KTtcbiAgICBzZXRJY29uKGljb25FbCwgaXRlbS5zdGF0dXMgPT09IFwibG9jYWxEZWxldGVkXCIgPyBcImNsb3VkLW9mZlwiIDogaXNJbWFnZVBhdGgoaXRlbS5yZW1vdGVQYXRoKSA/IFwiaW1hZ2VcIiA6IFwiZmlsZS10ZXh0XCIpO1xuICAgIGNvbnN0IHRleHRFbCA9IHJvd0VsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXRyZWUtdGV4dFwiIH0pO1xuICAgIHRleHRFbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10cmVlLW5hbWVcIiwgdGV4dDogaXRlbS5uYW1lIH0pO1xuICAgIHRleHRFbC5jcmVhdGVTcGFuKHtcbiAgICAgIGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtdHJlZS1wYXRoXCIsXG4gICAgICB0ZXh0OiBpdGVtLmxvY2FsUGF0aCA/IGl0ZW0ubG9jYWxQYXRoIDogaXRlbS5yZW1vdGVQYXRoXG4gICAgfSk7XG4gICAgcm93RWwuY3JlYXRlU3Bhbih7XG4gICAgICBjbHM6IGBvYnNpZGlhbi1naXQtc3luY2VyLXN0YXR1cy1iYWRnZSAke3RvU3luY0NlbnRlclN0YXR1c0NsYXNzKGl0ZW0uc3RhdHVzKX1gLFxuICAgICAgdGV4dDogdG9TeW5jQ2VudGVyU3RhdHVzTGFiZWwoaXRlbS5zdGF0dXMpXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzeW5jU2VsZWN0ZWRMb2NhbEZpbGVzKCkge1xuICAgIGNvbnN0IGl0ZW1zID0gdGhpcy5nZXRTZWxlY3RlZExvY2FsSXRlbXMoKTtcbiAgICBsZXQgc3VjY2Vzc0NvdW50ID0gMDtcbiAgICBsZXQgZmFpbHVyZUNvdW50ID0gMDtcblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuICAgICAgaWYgKCFpdGVtLmZpbGUpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnN5bmNGaWxlVG9HaXRIdWIoaXRlbS5maWxlKTtcbiAgICAgICAgc3VjY2Vzc0NvdW50ICs9IDE7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZGVsZXRlKGl0ZW0uaWQpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIGZhaWx1cmVDb3VudCArPSAxO1xuICAgICAgfVxuICAgIH1cblxuICAgIG5ldyBOb3RpY2UoYFx1NTQwQ1x1NkI2NVx1NUI4Q1x1NjIxMFx1RkYxQVx1NjIxMFx1NTI5RiAke3N1Y2Nlc3NDb3VudH1cdUZGMENcdTU5MzFcdThEMjUgJHtmYWlsdXJlQ291bnR9YCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoKCk7XG4gIH1cblxuICBhc3luYyBwdWxsU2VsZWN0ZWRSZW1vdGVGaWxlcygpIHtcbiAgICBjb25zdCBpdGVtcyA9IHRoaXMuZ2V0U2VsZWN0ZWRSZW1vdGVPbmx5SXRlbXMoKTtcbiAgICBsZXQgc3VjY2Vzc0NvdW50ID0gMDtcbiAgICBsZXQgZmFpbHVyZUNvdW50ID0gMDtcblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ucHVsbFJlbW90ZUZpbGUoaXRlbS5yZW1vdGVQYXRoKTtcbiAgICAgICAgc3VjY2Vzc0NvdW50ICs9IDE7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZGVsZXRlKGl0ZW0uaWQpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIGZhaWx1cmVDb3VudCArPSAxO1xuICAgICAgfVxuICAgIH1cblxuICAgIG5ldyBOb3RpY2UoYFx1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlx1NjJDOVx1NTNENlx1NUI4Q1x1NjIxMFx1RkYxQVx1NjIxMFx1NTI5RiAke3N1Y2Nlc3NDb3VudH1cdUZGMENcdTU5MzFcdThEMjUgJHtmYWlsdXJlQ291bnR9YCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoKCk7XG4gIH1cblxuICBhc3luYyBkZWxldGVTZWxlY3RlZFJlbW90ZUZpbGVzKCkge1xuICAgIGNvbnN0IGl0ZW1zID0gdGhpcy5nZXRTZWxlY3RlZFJlbW90ZUl0ZW1zKCk7XG4gICAgbGV0IHN1Y2Nlc3NDb3VudCA9IDA7XG4gICAgbGV0IGZhaWx1cmVDb3VudCA9IDA7XG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmRlbGV0ZVJlbW90ZVBhdGgoaXRlbS5yZW1vdGVQYXRoKTtcbiAgICAgICAgaWYgKGl0ZW0uZmlsZSkge1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNldFN0YXRlKGl0ZW0uZmlsZSwge1xuICAgICAgICAgICAgcmVtb3RlUGF0aDogaXRlbS5yZW1vdGVQYXRoLFxuICAgICAgICAgICAgc2hhOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBodG1sVXJsOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBzdGF0dXM6IFwiZGVsZXRlZFwiXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgc3VjY2Vzc0NvdW50ICs9IDE7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZGVsZXRlKGl0ZW0uaWQpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIGZhaWx1cmVDb3VudCArPSAxO1xuICAgICAgfVxuICAgIH1cblxuICAgIG5ldyBOb3RpY2UoYFx1OEZEQ1x1N0FFRlx1NkI4Qlx1NzU1OVx1NkUwNVx1NzQwNlx1NUI4Q1x1NjIxMFx1RkYxQVx1NjIxMFx1NTI5RiAke3N1Y2Nlc3NDb3VudH1cdUZGMENcdTU5MzFcdThEMjUgJHtmYWlsdXJlQ291bnR9YCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoKCk7XG4gIH1cbn1cblxuY2xhc3MgUGx1Z2luVmVyc2lvbk1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luKSB7XG4gICAgc3VwZXIoYXBwKTtcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgfVxuXG4gIG9uT3BlbigpIHtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuZW1wdHkoKTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXHU0RkUxXHU2MDZGXCIgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBcdTU0MERcdTc5RjBcdUZGMUEke3RoaXMucGx1Z2luLm1hbmlmZXN0Lm5hbWV9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFx1NzI0OFx1NjcyQ1x1RkYxQSR7dGhpcy5wbHVnaW4ubWFuaWZlc3QudmVyc2lvbn1gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgXHU2M0QyXHU0RUY2IElEXHVGRjFBJHt0aGlzLnBsdWdpbi5tYW5pZmVzdC5pZH1gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgXHU2NzAwXHU0RjRFIE9ic2lkaWFuIFx1NzI0OFx1NjcyQ1x1RkYxQSR7dGhpcy5wbHVnaW4ubWFuaWZlc3QubWluQXBwVmVyc2lvbn1gIH0pO1xuICB9XG59XG5cbmNsYXNzIEdpdFN5bmNlclNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcbiAgcGx1Z2luOiBPYnNpZGlhbkdpdFN5bmNlclBsdWdpbjtcbiAgYWN0aXZlU2VjdGlvbjogXCJnZW5lcmFsXCIgfCBcInJlbW90ZVwiIHwgXCJzeW5jXCIgfCBcIm1lZGlhXCIgfCBcImRlYnVnXCIgPSBcImdlbmVyYWxcIjtcbiAgc2VhcmNoUXVlcnkgPSBcIlwiO1xuICByb290RWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIG5hdkVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBwYW5lbEVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luKSB7XG4gICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICB9XG5cbiAgZ2V0U2VjdGlvbnMoKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgIHtcbiAgICAgICAgaWQ6IFwiZ2VuZXJhbFwiIGFzIGNvbnN0LFxuICAgICAgICBsYWJlbDogXCJcdTkwMUFcdTc1MjhcdThCQkVcdTdGNkVcIixcbiAgICAgICAgdGl0bGU6IFwiXHU5MDFBXHU3NTI4XHU4QkJFXHU3RjZFXCIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlx1N0JBMVx1NzQwNlx1NjcyQ1x1NTczMFx1NTQwQ1x1NkI2NVx1NzZFRVx1NUY1NVx1NTQ4Q1x1NjNEMlx1NEVGNlx1NTdGQVx1Nzg0MFx1NEZFMVx1NjA2Rlx1MzAwMlwiXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBpZDogXCJyZW1vdGVcIiBhcyBjb25zdCxcbiAgICAgICAgbGFiZWw6IFwiR2l0SHViIFx1OTE0RFx1N0Y2RVwiLFxuICAgICAgICB0aXRsZTogXCJHaXRIdWIgXHU5MTREXHU3RjZFXCIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlx1OTE0RFx1N0Y2RSBHaXRIdWIgXHU0RUQzXHU1RTkzXHUzMDAxVG9rZW5cdTMwMDFcdTc1MjhcdTYyMzdcdTU0MERcdTU0OENcdTc2RUVcdTY4MDdcdTUyMDZcdTY1MkZcdTMwMDJcIlxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgaWQ6IFwic3luY1wiIGFzIGNvbnN0LFxuICAgICAgICBsYWJlbDogXCJcdTU0MENcdTZCNjVcdTYzQTdcdTUyMzZcIixcbiAgICAgICAgdGl0bGU6IFwiXHU1NDBDXHU2QjY1XHU2M0E3XHU1MjM2XCIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlx1NjdFNVx1NzcwQiBjb250ZW50IFx1NzZFRVx1NUY1NVx1NjYyMFx1NUMwNFx1MzAwMVx1NzJCNlx1NjAwMVx1N0YxM1x1NUI1OFx1NTQ4Q1x1NTQwQ1x1NkI2NVx1N0I1Nlx1NzU2NVx1MzAwMlwiXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBpZDogXCJtZWRpYVwiIGFzIGNvbnN0LFxuICAgICAgICBsYWJlbDogXCJcdTk2NDRcdTRFRjZcdTU5MDRcdTc0MDZcIixcbiAgICAgICAgdGl0bGU6IFwiXHU5NjQ0XHU0RUY2XHU1OTA0XHU3NDA2XCIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlx1NTQwRVx1N0VFRFx1NTNFRlx1NjI2OVx1NUM1NVx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1MzAwMVx1OTY0NFx1NEVGNlx1NTkwRFx1NTIzNlx1NTQ4Q1x1OEQ0NFx1NkU5MFx1NUYxNVx1NzUyOFx1OTFDRFx1NTE5OVx1MzAwMlwiXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBpZDogXCJkZWJ1Z1wiIGFzIGNvbnN0LFxuICAgICAgICBsYWJlbDogXCJcdThDMDNcdThCRDVcIixcbiAgICAgICAgdGl0bGU6IFwiXHU4QzAzXHU4QkQ1XHU0RTBFXHU2NUU1XHU1RkQ3XCIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlx1NjdFNVx1NzcwQlx1NjNEMlx1NEVGNlx1NzI0OFx1NjcyQ1x1NTQ4Q1x1OEJDQVx1NjVBRFx1NTE2NVx1NTNFM1x1MzAwMlwiXG4gICAgICB9XG4gICAgXTtcbiAgfVxuXG4gIGdldEZpbHRlclRleHQoLi4ucGFydHM6IEFycmF5PHN0cmluZyB8IHVuZGVmaW5lZD4pIHtcbiAgICByZXR1cm4gcGFydHNcbiAgICAgIC5maWx0ZXIoKHBhcnQpOiBwYXJ0IGlzIHN0cmluZyA9PiBCb29sZWFuKHBhcnQpKVxuICAgICAgLmpvaW4oXCIgXCIpXG4gICAgICAudG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIGNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgLi4ucGFydHM6IEFycmF5PHN0cmluZyB8IHVuZGVmaW5lZD4pIHtcbiAgICBjb25zdCBzZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpO1xuICAgIHNldHRpbmcuc2V0dGluZ0VsLmRhdGFzZXQuZmlsdGVyVGV4dCA9IHRoaXMuZ2V0RmlsdGVyVGV4dCguLi5wYXJ0cyk7XG4gICAgcmV0dXJuIHNldHRpbmc7XG4gIH1cblxuICByZW5kZXJTZWFyY2hCYXIoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3Qgc2VhcmNoU2V0dGluZyA9IG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXRDbGFzcyhcIm9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3Mtc2VhcmNoLXJvd1wiKTtcbiAgICBzZWFyY2hTZXR0aW5nLmluZm9FbC5yZW1vdmUoKTtcbiAgICBzZWFyY2hTZXR0aW5nLmFkZFNlYXJjaCgoc2VhcmNoKSA9PlxuICAgICAgc2VhcmNoLnNldFBsYWNlaG9sZGVyKFwiXHU2NDFDXHU3RDIyXHU5NzYyXHU2NzdGXHU4QkJFXHU3RjZFLi4uXCIpLnNldFZhbHVlKHRoaXMuc2VhcmNoUXVlcnkpLm9uQ2hhbmdlKCh2YWx1ZSkgPT4ge1xuICAgICAgICB0aGlzLnNlYXJjaFF1ZXJ5ID0gdmFsdWU7XG4gICAgICAgIGNvbnN0IHBhbmVsRWwgPSB0aGlzLmNvbnRhaW5lckVsLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiLm9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3MtcGFuZWxcIik7XG4gICAgICAgIGlmIChwYW5lbEVsKSB7XG4gICAgICAgICAgdGhpcy5hcHBseVNlYXJjaEZpbHRlcihwYW5lbEVsKTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgcmVuZGVyU2VjdGlvblRhYnMoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3QgbmF2RWwgPSBjb250YWluZXJFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1uYXZcIiB9KTtcbiAgICB0aGlzLm5hdkVsID0gbmF2RWw7XG5cbiAgICB0aGlzLmdldFNlY3Rpb25zKCkuZm9yRWFjaCgoc2VjdGlvbikgPT4ge1xuICAgICAgY29uc3QgYnV0dG9uID0gbmF2RWwuY3JlYXRlRWwoXCJidXR0b25cIiwge1xuICAgICAgICBjbHM6IGBvYnNpZGlhbi1naXQtc3luY2VyLXNldHRpbmdzLW5hdi1pdGVtJHt0aGlzLmFjdGl2ZVNlY3Rpb24gPT09IHNlY3Rpb24uaWQgPyBcIiBpcy1hY3RpdmVcIiA6IFwiXCJ9YCxcbiAgICAgICAgdGV4dDogc2VjdGlvbi5sYWJlbFxuICAgICAgfSk7XG4gICAgICBidXR0b24udHlwZSA9IFwiYnV0dG9uXCI7XG4gICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgICAgaWYgKHRoaXMuYWN0aXZlU2VjdGlvbiA9PT0gc2VjdGlvbi5pZCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYWN0aXZlU2VjdGlvbiA9IHNlY3Rpb24uaWQ7XG4gICAgICAgIHRoaXMuc3luY1RhYlN0YXRlKCk7XG4gICAgICAgIGlmICh0aGlzLnBhbmVsRWwpIHtcbiAgICAgICAgICB0aGlzLnJlbmRlclBhbmVsKHRoaXMucGFuZWxFbCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgc3luY1RhYlN0YXRlKCkge1xuICAgIGlmICghdGhpcy5uYXZFbCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGl0ZW1zID0gQXJyYXkuZnJvbSh0aGlzLm5hdkVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFwiLm9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3MtbmF2LWl0ZW1cIikpO1xuICAgIGl0ZW1zLmZvckVhY2goKGl0ZW0sIGluZGV4KSA9PiB7XG4gICAgICBjb25zdCBzZWN0aW9uID0gdGhpcy5nZXRTZWN0aW9ucygpW2luZGV4XTtcbiAgICAgIGl0ZW0uY2xhc3NMaXN0LnRvZ2dsZShcImlzLWFjdGl2ZVwiLCBzZWN0aW9uPy5pZCA9PT0gdGhpcy5hY3RpdmVTZWN0aW9uKTtcbiAgICB9KTtcbiAgfVxuXG4gIHJlbmRlclBsYWNlaG9sZGVyU2V0dGluZyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIHRpdGxlOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIGJhZGdlID0gXCJcdTg5QzRcdTUyMTJcdTRFMkRcIikge1xuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIHRpdGxlLCBkZXNjcmlwdGlvbiwgYmFkZ2UpXG4gICAgICAuc2V0TmFtZSh0aXRsZSlcbiAgICAgIC5zZXREZXNjKGAke2Rlc2NyaXB0aW9ufVx1RkYwOCR7YmFkZ2V9XHVGRjA5YCk7XG4gIH1cblxuICByZW5kZXJTZWN0aW9uU3ViaGVhZGluZyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIHRleHQ6IHN0cmluZykge1xuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKHRleHQpLnNldEhlYWRpbmcoKTtcbiAgfVxuXG4gIHJlbmRlckNvbm5lY3Rpb25TdGF0dXMoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3QgY29ubmVjdGlvbiA9IHRoaXMucGx1Z2luLmRhdGEuY29ubmVjdGlvbiA/PyBERUZBVUxUX0RBVEEuY29ubmVjdGlvbjtcbiAgICBjb25zdCBzdGF0dXNFbCA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdih7XG4gICAgICBjbHM6IGBvYnNpZGlhbi1naXQtc3luY2VyLWNvbm5lY3Rpb24tc3RhdHVzIGlzLSR7Y29ubmVjdGlvbj8uc3RhdHVzID8/IFwidW5rbm93blwifWBcbiAgICB9KTtcbiAgICBjb25zdCBpY29uRWwgPSBzdGF0dXNFbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItY29ubmVjdGlvbi1zdGF0dXMtaWNvblwiIH0pO1xuICAgIGNvbnN0IGljb25OYW1lID1cbiAgICAgIGNvbm5lY3Rpb24/LnN0YXR1cyA9PT0gXCJzdWNjZXNzXCJcbiAgICAgICAgPyBcImNoZWNrLWNpcmNsZS0yXCJcbiAgICAgICAgOiBjb25uZWN0aW9uPy5zdGF0dXMgPT09IFwiZmFpbGVkXCJcbiAgICAgICAgICA/IFwieC1jaXJjbGVcIlxuICAgICAgICAgIDogY29ubmVjdGlvbj8uc3RhdHVzID09PSBcInN0YWxlXCJcbiAgICAgICAgICAgID8gXCJhbGVydC1jaXJjbGVcIlxuICAgICAgICAgICAgOiBcImNpcmNsZS1oZWxwXCI7XG4gICAgc2V0SWNvbihpY29uRWwsIGljb25OYW1lKTtcbiAgICBzdGF0dXNFbC5jcmVhdGVTcGFuKHtcbiAgICAgIGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLWNvbm5lY3Rpb24tc3RhdHVzLXRleHRcIixcbiAgICAgIHRleHQ6IGAke2Nvbm5lY3Rpb24/Lm1lc3NhZ2UgPz8gXCJcdTVDMUFcdTY3MkFcdTZENEJcdThCRDVcdThGREVcdTYzQTVcdTMwMDJcIn0ke2Nvbm5lY3Rpb24/LmNoZWNrZWRBdCA/IGAgXHUwMEI3ICR7Y29ubmVjdGlvbi5jaGVja2VkQXR9YCA6IFwiXCJ9YFxuICAgIH0pO1xuICB9XG5cbiAgcmVuZGVyR2VuZXJhbFNldHRpbmdzKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnN0IGxvY2FsUm9vdERlc2NyaXB0aW9uID0gdGhpcy5wbHVnaW4uZ2V0RXhpc3RpbmdGb2xkZXIodGhpcy5wbHVnaW4uc2V0dGluZ3MubG9jYWxSb290UGF0aClcbiAgICAgID8gYFx1NUY1M1x1NTI0RFx1NzZFRVx1NUY1NVx1NjcwOVx1NjU0OFx1RkYxQSR7dGhpcy5wbHVnaW4uc2V0dGluZ3MubG9jYWxSb290UGF0aH1gXG4gICAgICA6IFwiXHU1M0VBXHU2NzA5XHU4QkU1XHU3NkVFXHU1RjU1XHU1MTg1XHU3Njg0XHU2NTg3XHU0RUY2XHU2MjREXHU1MTQxXHU4QkI4XHU1NDBDXHU2QjY1XHUzMDAyXHU1RjUzXHU1MjREXHU1MDNDXHU2NUUwXHU2NTQ4XHU2NUY2XHU4QkY3XHU5MUNEXHU2NUIwXHU5MDA5XHU2MkU5XHU3NkVFXHU1RjU1XHUzMDAyXCI7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIkxvY2FsIFJvb3QgUGF0aFwiLCBsb2NhbFJvb3REZXNjcmlwdGlvbiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MubG9jYWxSb290UGF0aClcbiAgICAgIC5zZXROYW1lKFwiTG9jYWwgUm9vdCBQYXRoXCIpXG4gICAgICAuc2V0RGVzYyhsb2NhbFJvb3REZXNjcmlwdGlvbilcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvY2FsUm9vdFBhdGgpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmxvY2FsUm9vdFBhdGggPSBub3JtYWxpemVQYXRoKHZhbHVlLnRyaW0oKSk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KFwiXHU5MDA5XHU2MkU5XHU3NkVFXHU1RjU1XCIpLm9uQ2xpY2soKCkgPT4ge1xuICAgICAgICAgIG5ldyBGb2xkZXJTZWxlY3RNb2RhbCh0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIGFzeW5jIChmb2xkZXIpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNldExvY2FsUm9vdFBhdGgoZm9sZGVyLnBhdGgpO1xuICAgICAgICAgICAgICBuZXcgTm90aWNlKGBcdTVERjJcdThCQkVcdTdGNkUgTG9jYWwgUm9vdCBQYXRoXHVGRjFBJHtmb2xkZXIucGF0aH1gKTtcbiAgICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIlx1OEJCRVx1N0Y2RVx1NTkzMVx1OEQyNVwiO1xuICAgICAgICAgICAgICBuZXcgTm90aWNlKG1lc3NhZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pLm9wZW4oKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIlx1OEZEQ1x1N0FFRlx1NzZFRVx1NUY1NVwiLCBcIlx1NTZGQVx1NUI5QVx1NTE5OVx1NTE2NSBHaXRIdWIgXHU0RUQzXHU1RTkzIGNvbnRlbnQgXHU3NkVFXHU1RjU1XHUzMDAyXCIsIFJFTU9URV9DT05URU5UX1JPT1QpXG4gICAgICAuc2V0TmFtZShcIlx1OEZEQ1x1N0FFRlx1NzZFRVx1NUY1NVwiKVxuICAgICAgLnNldERlc2MoXCJcdTYzRDJcdTRFRjZcdTUzRUFcdThCRkJcdTUxOTlcdTRFRDNcdTVFOTMgY29udGVudCBcdTc2RUVcdTVGNTVcdUZGMUJcdTY3MkNcdTU3MzBcdTU0MENcdTZCNjVcdTc2RUVcdTVGNTVcdTUxODVcdTc2ODRcdTc2RjhcdTVCRjlcdThERUZcdTVGODRcdTRGMUFcdTY2MjBcdTVDMDRcdTUyMzAgY29udGVudCBcdTRFMEJcdTMwMDJcIik7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIlx1NjNEMlx1NEVGNlx1NzI0OFx1NjcyQ1wiLCB0aGlzLnBsdWdpbi5tYW5pZmVzdC52ZXJzaW9uLCB0aGlzLnBsdWdpbi5tYW5pZmVzdC5pZClcbiAgICAgIC5zZXROYW1lKFwiXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXCIpXG4gICAgICAuc2V0RGVzYyhgJHt0aGlzLnBsdWdpbi5tYW5pZmVzdC5uYW1lfSB2JHt0aGlzLnBsdWdpbi5tYW5pZmVzdC52ZXJzaW9ufSBcdTAwQjcgJHt0aGlzLnBsdWdpbi5tYW5pZmVzdC5pZH1gKTtcbiAgfVxuXG4gIHJlbmRlclJlbW90ZVNldHRpbmdzKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoXG4gICAgICBjb250YWluZXJFbCxcbiAgICAgIFwiUmVwb3NpdG9yeSBVUkxcIixcbiAgICAgIFwiXHU0RjhCXHU1OTgyIGh0dHBzOi8vZ2l0aHViLmNvbS9pbWxpdXN4L29ic2lkaWFuLWdpdC1zeW5jZXIuZ2l0XCIsXG4gICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZXBvc2l0b3J5VXJsXG4gICAgKVxuICAgICAgLnNldE5hbWUoXCJSZXBvc2l0b3J5IFVSTFwiKVxuICAgICAgLnNldERlc2MoXCJHaXRIdWIgXHU5ODc5XHU3NkVFXHU0RUQzXHU1RTkzXHU1NzMwXHU1NzQwXHVGRjBDXHU2NTJGXHU2MzAxIEhUVFBTXHUzMDAxU1NIIFx1NjIxNiBvd25lci9yZXBvXHUzMDAyXCIpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImh0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvLmdpdFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZXBvc2l0b3J5VXJsKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnJlcG9zaXRvcnlVcmwgPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5tYXJrQ29ubmVjdGlvblN0YWxlKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiR2l0SHViIFVzZXJuYW1lXCIsIFwiXHU1RjUzXHU1MjREXHU2Mzg4XHU2NzQzIFRva2VuIFx1NUJGOVx1NUU5NFx1NzY4NCBHaXRIdWIgXHU3NTI4XHU2MjM3XHU1NDBEXHUzMDAyXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLmdpdGh1YlVzZXJuYW1lKVxuICAgICAgLnNldE5hbWUoXCJHaXRIdWIgVXNlcm5hbWVcIilcbiAgICAgIC5zZXREZXNjKFwiXHU1RjUzXHU1MjREXHU2Mzg4XHU2NzQzIFRva2VuIFx1NUJGOVx1NUU5NFx1NzY4NCBHaXRIdWIgXHU3NTI4XHU2MjM3XHU1NDBEXHUzMDAyXCIpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImltbGl1c3hcIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZ2l0aHViVXNlcm5hbWUpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZ2l0aHViVXNlcm5hbWUgPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5tYXJrQ29ubmVjdGlvblN0YWxlKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiR2l0SHViIFRva2VuXCIsIFwiRmluZS1ncmFpbmVkIFRva2VuIFx1OTcwMFx1ODk4MVx1NUYwMFx1NTQyRiBDb250ZW50cyBcdThCRkJcdTUxOTlcdTY3NDNcdTk2NTBcdTMwMDJcIilcbiAgICAgIC5zZXROYW1lKFwiR2l0SHViIFRva2VuXCIpXG4gICAgICAuc2V0RGVzYyhcIkZpbmUtZ3JhaW5lZCBUb2tlbiBcdTk3MDBcdTg5ODFcdTYzODhcdTY3NDNcdTc2RUVcdTY4MDdcdTRFRDNcdTVFOTNcdUZGMENcdTVFNzZcdTVGMDBcdTU0MkYgQ29udGVudHMgXHU4QkZCXHU1MTk5XHU2NzQzXHU5NjUwXHUzMDAyXCIpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT4ge1xuICAgICAgICB0ZXh0LmlucHV0RWwudHlwZSA9IFwicGFzc3dvcmRcIjtcbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImdpdGh1Yl9wYXRfLi4uXCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmdpdGh1YlRva2VuKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmdpdGh1YlRva2VuID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ubWFya0Nvbm5lY3Rpb25TdGFsZSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiQnJhbmNoXCIsIFwiXHU0RjhCXHU1OTgyIG1haW5cIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYnJhbmNoKVxuICAgICAgLnNldE5hbWUoXCJCcmFuY2hcIilcbiAgICAgIC5zZXREZXNjKFwiXHU1NDBDXHU2QjY1XHU1MTk5XHU1MTY1XHU3Njg0XHU3NkVFXHU2ODA3XHU1MjA2XHU2NTJGXHUzMDAyXCIpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIm1haW5cIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYnJhbmNoKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmJyYW5jaCA9IHZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLm1hcmtDb25uZWN0aW9uU3RhbGUoKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJcdTZENEJcdThCRDVcdThGREVcdTYzQTVcIiwgXCJcdTlBOENcdThCQzFcdTVGNTNcdTUyNERcdTRFRDNcdTVFOTNcdTMwMDFUb2tlbiBcdTU0OENcdTUyMDZcdTY1MkZcdTkxNERcdTdGNkVcdTY2MkZcdTU0MjZcdTUzRUZcdThCQkZcdTk1RUVcdTMwMDJcIilcbiAgICAgIC5zZXROYW1lKFwiXHU2RDRCXHU4QkQ1XHU4RkRFXHU2M0E1XCIpXG4gICAgICAuc2V0RGVzYyhcIlx1OUE4Q1x1OEJDMVx1NUY1M1x1NTI0RFx1NEVEM1x1NUU5M1x1MzAwMVRva2VuIFx1NTQ4Q1x1NTIwNlx1NjUyRlx1OTE0RFx1N0Y2RVx1NjYyRlx1NTQyNlx1NTNFRlx1OEJCRlx1OTVFRVx1MzAwMlwiKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dChcIlx1NkQ0Qlx1OEJENVx1OEZERVx1NjNBNVwiKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4udGVzdENvbm5lY3Rpb24oKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyUGFuZWwodGhpcy5wYW5lbEVsID8/IGNvbnRhaW5lckVsKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJcdThGREVcdTYzQTVcdTU5MzFcdThEMjVcIjtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UobWVzc2FnZSk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlclBhbmVsKHRoaXMucGFuZWxFbCA/PyBjb250YWluZXJFbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIHRoaXMucmVuZGVyQ29ubmVjdGlvblN0YXR1cyhjb250YWluZXJFbCk7XG4gIH1cblxuICByZW5kZXJTeW5jU2V0dGluZ3MoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJDb250ZW50IFJvb3RcIiwgXCJcdTU2RkFcdTVCOUFcdTRFM0EgY29udGVudFwiLCBSRU1PVEVfQ09OVEVOVF9ST09UKVxuICAgICAgLnNldE5hbWUoXCJDb250ZW50IFJvb3RcIilcbiAgICAgIC5zZXREZXNjKFwiXHU4RkRDXHU3QUVGXHU4QkZCXHU1MTk5XHU4REVGXHU1Rjg0XHU1NkZBXHU1QjlBXHU0RTNBIGNvbnRlbnQvPFx1NjcyQ1x1NTczMFx1NzZGOFx1NUJGOVx1OERFRlx1NUY4ND5cdTMwMDJcIik7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIlx1NTQwQ1x1NkI2NVx1OEJGNFx1NjYwRVwiLCBcIlx1NzJCNlx1NjAwMVx1N0YxM1x1NUI1OFx1MzAwMVx1NjcyQ1x1NTczMFx1NEZFRVx1NjUzOVx1NjhDMFx1NkQ0Qlx1MzAwMVx1OEZEQ1x1N0FFRlx1NTIyMFx1OTY2NFx1NjhDMFx1NkQ0QlwiLCBcIlx1OEJGNFx1NjYwRVwiKVxuICAgICAgLnNldE5hbWUoXCJcdTU0MENcdTZCNjVcdThCRjRcdTY2MEVcIilcbiAgICAgIC5zZXREZXNjKFwiXHU2M0QyXHU0RUY2XHU0RjFBXHU3RjEzXHU1QjU4XHU2NzAwXHU4RkQxXHU1NDBDXHU2QjY1XHU3Njg0XHU1MTg1XHU1QkI5XHU1NEM4XHU1RTBDXHVGRjFCXHU2NzJDXHU1NzMwXHU1MTg1XHU1QkI5XHU1M0Q4XHU1MzE2XHU2NjNFXHU3OTNBXHU0RTNBXHU1REYyXHU0RkVFXHU2NTM5XHVGRjBDXHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHU0RTBEXHU1QjU4XHU1NzI4XHU2NjNFXHU3OTNBXHU0RTNBXHU4RkRDXHU3QUVGXHU1REYyXHU1MjIwXHU5NjY0XHUzMDAyXCIpO1xuXG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJcdTZFMDVcdTc0MDZcdTcyQjZcdTYwMDFcdTdGMTNcdTVCNThcIiwgXCJcdTZFMDVcdTc0MDZcdTY3MkNcdTU3MzBcdTU0MENcdTZCNjVcdTcyQjZcdTYwMDFcdUZGMENcdTRFMERcdTVGNzFcdTU0Q0QgR2l0SHViIFx1NEVEM1x1NUU5M1x1NjU4N1x1NEVGNlx1MzAwMlwiKVxuICAgICAgLnNldE5hbWUoXCJcdTZFMDVcdTc0MDZcdTcyQjZcdTYwMDFcdTdGMTNcdTVCNThcIilcbiAgICAgIC5zZXREZXNjKFwiXHU2RTA1XHU3NDA2XHU2NzJDXHU1NzMwXHU1NDBDXHU2QjY1XHU3MkI2XHU2MDAxXHVGRjBDXHU0RTBEXHU1RjcxXHU1NENEIEdpdEh1YiBcdTRFRDNcdTVFOTNcdTY1ODdcdTRFRjZcdTMwMDJcIilcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQoXCJcdTZFMDVcdTc0MDZcIikuc2V0V2FybmluZygpLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLmRhdGEuZmlsZXMgPSB7fTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlQWxsRGF0YSgpO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnJlZnJlc2hTdGF0dXNCYXIoKTtcbiAgICAgICAgICBuZXcgTm90aWNlKFwiXHU3MkI2XHU2MDAxXHU3RjEzXHU1QjU4XHU1REYyXHU2RTA1XHU3NDA2XHUzMDAyXCIpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgfVxuXG4gIHJlbmRlck1lZGlhU2V0dGluZ3MoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgdGhpcy5yZW5kZXJQbGFjZWhvbGRlclNldHRpbmcoXG4gICAgICBjb250YWluZXJFbCxcbiAgICAgIFwiXHU5NjQ0XHU0RUY2XHU0RTBFXHU1NkZFXHU3MjQ3XCIsXG4gICAgICBcIlx1OEZEOVx1OTFDQ1x1NUMwNlx1NzUyOFx1NEU4RVx1OTE0RFx1N0Y2RVx1NTZGRVx1NzI0N1x1NTkwRFx1NTIzNlx1N0I1Nlx1NzU2NVx1MzAwMVx1OTY0NFx1NEVGNlx1NzZFRVx1NUY1NVx1NjYyMFx1NUMwNFx1MzAwMVx1OEZEQ1x1N0EwQlx1OEQ0NFx1NkU5MFx1NTczMFx1NTc0MFx1NEUwRVx1NUYxNVx1NzUyOFx1OTFDRFx1NTE5OVx1ODlDNFx1NTIxOVx1MzAwMlwiXG4gICAgKTtcbiAgfVxuXG4gIHJlbmRlckRlYnVnU2V0dGluZ3MoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgdGhpcy5yZW5kZXJQbGFjZWhvbGRlclNldHRpbmcoXG4gICAgICBjb250YWluZXJFbCxcbiAgICAgIFwiXHU4QzAzXHU4QkQ1XHU0RTBFXHU2NUU1XHU1RkQ3XCIsXG4gICAgICBcIlx1OEZEOVx1OTFDQ1x1NUMwNlx1NzUyOFx1NEU4RVx1NjdFNVx1NzcwQlx1NTQwQ1x1NkI2NVx1NjVFNVx1NUZEN1x1MzAwMVx1OEJGN1x1NkM0Mlx1N0VEM1x1Njc5Q1x1NTQ4Q1x1OTUxOVx1OEJFRlx1NjM5Mlx1NjdFNVx1NEZFMVx1NjA2Rlx1MzAwMlwiXG4gICAgKTtcblxuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXHU0RkUxXHU2MDZGXCIsIFwiXHU2N0U1XHU3NzBCXHU3MjQ4XHU2NzJDXHUzMDAxXHU2M0QyXHU0RUY2IElEIFx1NTQ4Q1x1NjcwMFx1NEY0RVx1NTE3Q1x1NUJCOVx1NzI0OFx1NjcyQ1x1MzAwMlwiKVxuICAgICAgLnNldE5hbWUoXCJcdTYzRDJcdTRFRjZcdTcyNDhcdTY3MkNcdTRGRTFcdTYwNkZcIilcbiAgICAgIC5zZXREZXNjKFwiXHU2N0U1XHU3NzBCXHU3MjQ4XHU2NzJDXHUzMDAxXHU2M0QyXHU0RUY2IElEIFx1NTQ4Q1x1NjcwMFx1NEY0RVx1NTE3Q1x1NUJCOVx1NzI0OFx1NjcyQ1x1MzAwMlwiKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dChcIlx1NjI1M1x1NUYwMFwiKS5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICBuZXcgUGx1Z2luVmVyc2lvbk1vZGFsKHRoaXMuYXBwLCB0aGlzLnBsdWdpbikub3BlbigpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgfVxuXG4gIGFwcGx5U2VhcmNoRmlsdGVyKHBhbmVsRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3QgcXVlcnkgPSB0aGlzLnNlYXJjaFF1ZXJ5LnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IGl0ZW1zID0gQXJyYXkuZnJvbShwYW5lbEVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFwiLnNldHRpbmctaXRlbVtkYXRhLWZpbHRlci10ZXh0XVwiKSk7XG4gICAgbGV0IHZpc2libGVDb3VudCA9IDA7XG5cbiAgICBpdGVtcy5mb3JFYWNoKChpdGVtRWwpID0+IHtcbiAgICAgIGNvbnN0IG1hdGNoZXMgPSAhcXVlcnkgfHwgKGl0ZW1FbC5kYXRhc2V0LmZpbHRlclRleHQgPz8gXCJcIikuaW5jbHVkZXMocXVlcnkpO1xuICAgICAgaXRlbUVsLmNsYXNzTGlzdC50b2dnbGUoXCJpcy1oaWRkZW5cIiwgIW1hdGNoZXMpO1xuICAgICAgaWYgKG1hdGNoZXMpIHtcbiAgICAgICAgdmlzaWJsZUNvdW50ICs9IDE7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBlbXB0eVN0YXRlRWwgPSBwYW5lbEVsLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiLm9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3MtZW1wdHlcIik7XG4gICAgaWYgKGVtcHR5U3RhdGVFbCkge1xuICAgICAgZW1wdHlTdGF0ZUVsLmNsYXNzTGlzdC50b2dnbGUoXCJpcy1oaWRkZW5cIiwgdmlzaWJsZUNvdW50ID4gMCk7XG4gICAgfVxuICB9XG5cbiAgcmVuZGVyQWN0aXZlU2VjdGlvbihjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBzd2l0Y2ggKHRoaXMuYWN0aXZlU2VjdGlvbikge1xuICAgICAgY2FzZSBcImdlbmVyYWxcIjpcbiAgICAgICAgdGhpcy5yZW5kZXJHZW5lcmFsU2V0dGluZ3MoY29udGFpbmVyRWwpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJyZW1vdGVcIjpcbiAgICAgICAgdGhpcy5yZW5kZXJSZW1vdGVTZXR0aW5ncyhjb250YWluZXJFbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInN5bmNcIjpcbiAgICAgICAgdGhpcy5yZW5kZXJTeW5jU2V0dGluZ3MoY29udGFpbmVyRWwpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJtZWRpYVwiOlxuICAgICAgICB0aGlzLnJlbmRlck1lZGlhU2V0dGluZ3MoY29udGFpbmVyRWwpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJkZWJ1Z1wiOlxuICAgICAgICB0aGlzLnJlbmRlckRlYnVnU2V0dGluZ3MoY29udGFpbmVyRWwpO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHJlbmRlclBhbmVsKHBhbmVsRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgcGFuZWxFbC5lbXB0eSgpO1xuICAgIHRoaXMucmVuZGVyQWN0aXZlU2VjdGlvbihwYW5lbEVsKTtcbiAgICBwYW5lbEVsLmNyZWF0ZURpdih7XG4gICAgICBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1lbXB0eSBpcy1oaWRkZW5cIixcbiAgICAgIHRleHQ6IFwiXHU2Q0ExXHU2NzA5XHU1MzM5XHU5MTREXHU1MjMwXHU1RjUzXHU1MjREXHU3QjVCXHU5MDA5XHU2NzYxXHU0RUY2XHU3Njg0XHU4QkJFXHU3RjZFXHU5ODc5XHUzMDAyXCJcbiAgICB9KTtcbiAgICB0aGlzLmFwcGx5U2VhcmNoRmlsdGVyKHBhbmVsRWwpO1xuICB9XG5cbiAgZGlzcGxheSgpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xuICAgIGNvbnRhaW5lckVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCIub2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1yb290XCIpLmZvckVhY2goKGVsZW1lbnQpID0+IGVsZW1lbnQucmVtb3ZlKCkpO1xuICAgIHRoaXMucm9vdEVsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3Mtcm9vdFwiIH0pO1xuICAgIHRoaXMubmF2RWwgPSBudWxsO1xuICAgIHRoaXMucGFuZWxFbCA9IG51bGw7XG5cbiAgICB0aGlzLnJlbmRlclNlYXJjaEJhcih0aGlzLnJvb3RFbCk7XG4gICAgdGhpcy5yZW5kZXJTZWN0aW9uVGFicyh0aGlzLnJvb3RFbCk7XG5cbiAgICBjb25zdCBzZWN0aW9uRWwgPSB0aGlzLnJvb3RFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1wYW5lbFwiIH0pO1xuICAgIHRoaXMucGFuZWxFbCA9IHNlY3Rpb25FbDtcbiAgICB0aGlzLnJlbmRlclBhbmVsKHNlY3Rpb25FbCk7XG4gIH1cbn1cblxuY2xhc3MgRm9sZGVyU2VsZWN0TW9kYWwgZXh0ZW5kcyBGdXp6eVN1Z2dlc3RNb2RhbDxURm9sZGVyPiB7XG4gIHBsdWdpbjogT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW47XG4gIG9uQ2hvb3NlRm9sZGVyOiAoZm9sZGVyOiBURm9sZGVyKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZDtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBhcHA6IEFwcCxcbiAgICBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luLFxuICAgIG9uQ2hvb3NlRm9sZGVyOiAoZm9sZGVyOiBURm9sZGVyKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZFxuICApIHtcbiAgICBzdXBlcihhcHApO1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICAgIHRoaXMub25DaG9vc2VGb2xkZXIgPSBvbkNob29zZUZvbGRlcjtcbiAgICB0aGlzLnNldFBsYWNlaG9sZGVyKFwiXHU5MDA5XHU2MkU5IExvY2FsIFJvb3QgUGF0aCBcdTc2RUVcdTVGNTVcIik7XG4gIH1cblxuICBnZXRJdGVtcygpOiBURm9sZGVyW10ge1xuICAgIHJldHVybiB0aGlzLnBsdWdpbi5nZXRBbGxWYXVsdEZvbGRlcnMoKTtcbiAgfVxuXG4gIGdldEl0ZW1UZXh0KGZvbGRlcjogVEZvbGRlcik6IHN0cmluZyB7XG4gICAgcmV0dXJuIGZvbGRlci5wYXRoO1xuICB9XG5cbiAgYXN5bmMgb25DaG9vc2VJdGVtKGZvbGRlcjogVEZvbGRlcik6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMub25DaG9vc2VGb2xkZXIoZm9sZGVyKTtcbiAgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxzQkFjTztBQTBIUCxJQUFNLHNCQUFzQjtBQUU1QixJQUFNLG1CQUF1QztBQUFBLEVBQzNDLGVBQWU7QUFBQSxFQUNmLGdCQUFnQjtBQUFBLEVBQ2hCLGFBQWE7QUFBQSxFQUNiLFFBQVE7QUFBQSxFQUNSLGVBQWU7QUFDakI7QUFFQSxJQUFNLGVBQThCO0FBQUEsRUFDbEMsT0FBTyxDQUFDO0FBQUEsRUFDUixZQUFZO0FBQUEsSUFDVixRQUFRO0FBQUEsSUFDUixTQUFTO0FBQUEsRUFDWDtBQUNGO0FBRUEsSUFBTSxxQkFBTixjQUFpQyxNQUFNO0FBQUEsRUFLckMsWUFBWSxRQUFnQixTQUFpQixRQUFnQixNQUFjO0FBQ3pFLFVBQU0sT0FBTztBQUNiLFNBQUssU0FBUztBQUNkLFNBQUssU0FBUztBQUNkLFNBQUssT0FBTztBQUFBLEVBQ2Q7QUFDRjtBQUVBLFNBQVMsV0FBVyxPQUF1QjtBQUN6QyxTQUFPLE1BQU0sUUFBUSxNQUFNLEtBQUs7QUFDbEM7QUFFQSxTQUFTLGlCQUFpQixTQUFpRTtBQUN6RixNQUFJLENBQUMsUUFBUSxXQUFXLE9BQU8sR0FBRztBQUNoQyxXQUFPLEVBQUUsTUFBTSxDQUFDLEdBQUcsTUFBTSxRQUFRO0FBQUEsRUFDbkM7QUFFQSxRQUFN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
