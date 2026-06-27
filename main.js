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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7XG4gIEFwcCxcbiAgRnV6enlTdWdnZXN0TW9kYWwsXG4gIE1lbnUsXG4gIE1vZGFsLFxuICBOb3RpY2UsXG4gIFBsdWdpbixcbiAgUGx1Z2luU2V0dGluZ1RhYixcbiAgU2V0dGluZyxcbiAgc2V0SWNvbixcbiAgVEZpbGUsXG4gIFRGb2xkZXIsXG4gIG5vcm1hbGl6ZVBhdGgsXG4gIHJlcXVlc3RVcmxcbn0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmludGVyZmFjZSBHaXRIdWJTeW5jU2V0dGluZ3Mge1xuICByZXBvc2l0b3J5VXJsOiBzdHJpbmc7XG4gIGdpdGh1YlVzZXJuYW1lOiBzdHJpbmc7XG4gIGdpdGh1YlRva2VuOiBzdHJpbmc7XG4gIGJyYW5jaDogc3RyaW5nO1xuICBsb2NhbFJvb3RQYXRoOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBMb2NhbEZpbGVTdGF0ZSB7XG4gIHJlbW90ZVBhdGg/OiBzdHJpbmc7XG4gIHNoYT86IHN0cmluZztcbiAgc3RhdHVzOiBcImRyYWZ0XCIgfCBcInN5bmNlZFwiIHwgXCJtb2RpZmllZFwiIHwgXCJkZWxldGVkXCIgfCBcImZhaWxlZFwiO1xuICBsYXN0U3luY2VkQXQ/OiBzdHJpbmc7XG4gIGxhc3RTeW5jZWRIYXNoPzogc3RyaW5nO1xuICBodG1sVXJsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUGVyc2lzdGVkRGF0YSB7XG4gIGZpbGVzOiBSZWNvcmQ8c3RyaW5nLCBMb2NhbEZpbGVTdGF0ZT47XG4gIGNvbm5lY3Rpb24/OiBDb25uZWN0aW9uU3RhdGU7XG59XG5cbmludGVyZmFjZSBDb25uZWN0aW9uU3RhdGUge1xuICBzdGF0dXM6IFwidW5rbm93blwiIHwgXCJzdWNjZXNzXCIgfCBcImZhaWxlZFwiIHwgXCJzdGFsZVwiO1xuICBtZXNzYWdlOiBzdHJpbmc7XG4gIGNoZWNrZWRBdD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEFydGljbGVBY3Rpb25Db250ZXh0IHtcbiAgZmlsZTogVEZpbGU7XG4gIGluUm9vdDogYm9vbGVhbjtcbiAgaGFzUHJvcGVydGllczogYm9vbGVhbjtcbiAgc3RhdGU6IExvY2FsRmlsZVN0YXRlO1xuICBzeW5jVGl0bGU6IHN0cmluZztcbiAgY2FuU3luYzogYm9vbGVhbjtcbiAgY2FuRGVsZXRlUmVtb3RlOiBib29sZWFuO1xuICBjYW5PcGVuUmVtb3RlOiBib29sZWFuO1xuICBjYW5JbnNlcnRQcm9wZXJ0aWVzOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViUmVwbyB7XG4gIG93bmVyOiBzdHJpbmc7XG4gIHJlcG86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEdpdEh1YkVycm9yUGF5bG9hZCB7XG4gIG1lc3NhZ2U/OiBzdHJpbmc7XG4gIGRvY3VtZW50YXRpb25fdXJsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViQ29udGVudFJlc3BvbnNlIHtcbiAgdHlwZTogc3RyaW5nO1xuICBwYXRoOiBzdHJpbmc7XG4gIHNoYTogc3RyaW5nO1xuICBodG1sX3VybD86IHN0cmluZztcbiAgY29udGVudD86IHN0cmluZztcbiAgZW5jb2Rpbmc/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBHaXRIdWJQdXRSZXNwb25zZSB7XG4gIGNvbnRlbnQ/OiBHaXRIdWJDb250ZW50UmVzcG9uc2UgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViRGVsZXRlUmVzcG9uc2Uge1xuICBjb250ZW50PzogR2l0SHViQ29udGVudFJlc3BvbnNlIHwgbnVsbDtcbn1cblxuaW50ZXJmYWNlIEdpdEh1YlVzZXJSZXNwb25zZSB7XG4gIGxvZ2luOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBHaXRIdWJSZXBvUmVzcG9uc2Uge1xuICBmdWxsX25hbWU6IHN0cmluZztcbiAgcGVybWlzc2lvbnM/OiB7XG4gICAgYWRtaW4/OiBib29sZWFuO1xuICAgIG1haW50YWluPzogYm9vbGVhbjtcbiAgICBwdXNoPzogYm9vbGVhbjtcbiAgICB0cmlhZ2U/OiBib29sZWFuO1xuICAgIHB1bGw/OiBib29sZWFuO1xuICB9O1xufVxuXG5pbnRlcmZhY2UgR2l0SHViVHJlZUl0ZW0ge1xuICBwYXRoOiBzdHJpbmc7XG4gIHR5cGU6IFwiYmxvYlwiIHwgXCJ0cmVlXCIgfCBzdHJpbmc7XG4gIHNoYTogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViVHJlZVJlc3BvbnNlIHtcbiAgdHJlZTogR2l0SHViVHJlZUl0ZW1bXTtcbiAgdHJ1bmNhdGVkOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgUmVtb3RlU3luY0ZpbGUge1xuICByZW1vdGVQYXRoOiBzdHJpbmc7XG4gIHNoYTogc3RyaW5nO1xuICBodG1sVXJsOiBzdHJpbmc7XG59XG5cbnR5cGUgU3luY0NlbnRlclN0YXR1cyA9IFwidW5wdWJsaXNoZWRcIiB8IFwibW9kaWZpZWRcIiB8IFwicHVibGlzaGVkXCIgfCBcImxvY2FsRGVsZXRlZFwiO1xuXG5pbnRlcmZhY2UgU3luY0NlbnRlckl0ZW0ge1xuICBpZDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIHN0YXR1czogU3luY0NlbnRlclN0YXR1cztcbiAgbG9jYWxQYXRoPzogc3RyaW5nO1xuICByZW1vdGVQYXRoOiBzdHJpbmc7XG4gIGZvbGRlclBhdGg6IHN0cmluZztcbiAgZmlsZT86IFRGaWxlO1xuICByZW1vdGU/OiBSZW1vdGVTeW5jRmlsZTtcbiAgc3RhdGU/OiBMb2NhbEZpbGVTdGF0ZTtcbn1cblxuaW50ZXJmYWNlIFN5bmNUcmVlTm9kZSB7XG4gIG5hbWU6IHN0cmluZztcbiAgcGF0aDogc3RyaW5nO1xuICBjaGlsZHJlbjogTWFwPHN0cmluZywgU3luY1RyZWVOb2RlPjtcbiAgaXRlbXM6IFN5bmNDZW50ZXJJdGVtW107XG59XG5cbmNvbnN0IFJFTU9URV9DT05URU5UX1JPT1QgPSBcImNvbnRlbnRcIjtcblxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogR2l0SHViU3luY1NldHRpbmdzID0ge1xuICByZXBvc2l0b3J5VXJsOiBcIlwiLFxuICBnaXRodWJVc2VybmFtZTogXCJcIixcbiAgZ2l0aHViVG9rZW46IFwiXCIsXG4gIGJyYW5jaDogXCJtYWluXCIsXG4gIGxvY2FsUm9vdFBhdGg6IFwiY29udGVudFwiXG59O1xuXG5jb25zdCBERUZBVUxUX0RBVEE6IFBlcnNpc3RlZERhdGEgPSB7XG4gIGZpbGVzOiB7fSxcbiAgY29ubmVjdGlvbjoge1xuICAgIHN0YXR1czogXCJ1bmtub3duXCIsXG4gICAgbWVzc2FnZTogXCJcdTVDMUFcdTY3MkFcdTZENEJcdThCRDVcdThGREVcdTYzQTVcdTMwMDJcIlxuICB9XG59O1xuXG5jbGFzcyBHaXRIdWJSZXF1ZXN0RXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIHN0YXR1czogbnVtYmVyO1xuICBtZXRob2Q6IHN0cmluZztcbiAgcGF0aDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHN0YXR1czogbnVtYmVyLCBtZXNzYWdlOiBzdHJpbmcsIG1ldGhvZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcpIHtcbiAgICBzdXBlcihtZXNzYWdlKTtcbiAgICB0aGlzLnN0YXR1cyA9IHN0YXR1cztcbiAgICB0aGlzLm1ldGhvZCA9IG1ldGhvZDtcbiAgICB0aGlzLnBhdGggPSBwYXRoO1xuICB9XG59XG5cbmZ1bmN0aW9uIGVzY2FwZVlhbWwoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBpbnB1dC5yZXBsYWNlKC9cIi9nLCAnXFxcXFwiJyk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlRnJvbnRtYXR0ZXIoY29udGVudDogc3RyaW5nKTogeyBkYXRhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+OyBib2R5OiBzdHJpbmcgfSB7XG4gIGlmICghY29udGVudC5zdGFydHNXaXRoKFwiLS0tXFxuXCIpKSB7XG4gICAgcmV0dXJuIHsgZGF0YToge30sIGJvZHk6IGNvbnRlbnQgfTtcbiAgfVxuXG4gIGNvbnN0IGVuZCA9IGNvbnRlbnQuaW5kZXhPZihcIlxcbi0tLVxcblwiLCA0KTtcbiAgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICByZXR1cm4geyBkYXRhOiB7fSwgYm9keTogY29udGVudCB9O1xuICB9XG5cbiAgY29uc3QgcmF3ID0gY29udGVudC5zbGljZSg0LCBlbmQpLnNwbGl0KFwiXFxuXCIpO1xuICBjb25zdCBkYXRhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG5cbiAgZm9yIChjb25zdCBsaW5lIG9mIHJhdykge1xuICAgIGNvbnN0IHNlcGFyYXRvciA9IGxpbmUuaW5kZXhPZihcIjpcIik7XG4gICAgaWYgKHNlcGFyYXRvciA9PT0gLTEpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IGtleSA9IGxpbmUuc2xpY2UoMCwgc2VwYXJhdG9yKS50cmltKCk7XG4gICAgY29uc3QgdmFsdWUgPSBsaW5lLnNsaWNlKHNlcGFyYXRvciArIDEpLnRyaW0oKS5yZXBsYWNlKC9eXCJ8XCIkL2csIFwiXCIpO1xuICAgIGlmIChrZXkpIHtcbiAgICAgIGRhdGFba2V5XSA9IHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IGRhdGEsIGJvZHk6IGNvbnRlbnQuc2xpY2UoZW5kICsgNSkgfTtcbn1cblxuZnVuY3Rpb24gYnVpbGRGcm9udG1hdHRlcihmaWxlOiBURmlsZSwgdGl0bGU/OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCB0b2RheSA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gIGNvbnN0IHJlc29sdmVkVGl0bGUgPSB0aXRsZT8udHJpbSgpIHx8IGZpbGUuYmFzZW5hbWU7XG4gIGNvbnN0IHNsdWcgPSByZXNvbHZlZFRpdGxlXG4gICAgLnRyaW0oKVxuICAgIC50b0xvd2VyQ2FzZSgpXG4gICAgLnJlcGxhY2UoL1xccysvZywgXCItXCIpXG4gICAgLnJlcGxhY2UoL1teXFxwe0x9XFxwe059LV0rL2d1LCBcIlwiKVxuICAgIC5yZXBsYWNlKC8tKy9nLCBcIi1cIilcbiAgICAucmVwbGFjZSgvXi18LSQvZywgXCJcIik7XG5cbiAgcmV0dXJuIFtcbiAgICBcIi0tLVwiLFxuICAgIGB0aXRsZTogJHtlc2NhcGVZYW1sKHJlc29sdmVkVGl0bGUpfWAsXG4gICAgYHNsdWc6ICR7c2x1ZyB8fCBmaWxlLmJhc2VuYW1lfWAsXG4gICAgYGRhdGU6ICR7dG9kYXl9YCxcbiAgICBcImNhdGVnb3J5OiBcdTVGMDBcdTUzRDFcIixcbiAgICBcInRhZ3M6XCIsXG4gICAgXCIgIC0gSmF2YVwiLFxuICAgIFwiICAtIE5leHRKU1wiLFxuICAgIFwiZGVzY3JpcHRpb246IFx1NjU4N1x1N0FFMFx1NjQ1OFx1ODk4MVwiLFxuICAgIFwiY292ZXI6XCIsXG4gICAgXCJwdWJsaXNoZWQ6IHRydWVcIixcbiAgICBcIi0tLVwiLFxuICAgIFwiXCJcbiAgXS5qb2luKFwiXFxuXCIpO1xufVxuXG5mdW5jdGlvbiBwYWREYXRlTnVtYmVyKHZhbHVlOiBudW1iZXIpOiBzdHJpbmcge1xuICByZXR1cm4gU3RyaW5nKHZhbHVlKS5wYWRTdGFydCgyLCBcIjBcIik7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdERhdGVUaW1lKGlucHV0OiBEYXRlIHwgc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgZGF0ZSA9IHR5cGVvZiBpbnB1dCA9PT0gXCJzdHJpbmdcIiA/IG5ldyBEYXRlKGlucHV0KSA6IGlucHV0O1xuXG4gIGlmIChOdW1iZXIuaXNOYU4oZGF0ZS5nZXRUaW1lKCkpKSB7XG4gICAgcmV0dXJuIHR5cGVvZiBpbnB1dCA9PT0gXCJzdHJpbmdcIiA/IGlucHV0IDogXCJcIjtcbiAgfVxuXG4gIHJldHVybiBbXG4gICAgYCR7ZGF0ZS5nZXRGdWxsWWVhcigpfS0ke3BhZERhdGVOdW1iZXIoZGF0ZS5nZXRNb250aCgpICsgMSl9LSR7cGFkRGF0ZU51bWJlcihkYXRlLmdldERhdGUoKSl9YCxcbiAgICBgJHtwYWREYXRlTnVtYmVyKGRhdGUuZ2V0SG91cnMoKSl9OiR7cGFkRGF0ZU51bWJlcihkYXRlLmdldE1pbnV0ZXMoKSl9OiR7cGFkRGF0ZU51bWJlcihkYXRlLmdldFNlY29uZHMoKSl9YFxuICBdLmpvaW4oXCIgXCIpO1xufVxuXG5mdW5jdGlvbiBoYXNoQ29udGVudChpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGhhc2ggPSAwO1xuXG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBpbnB1dC5sZW5ndGg7IGluZGV4ICs9IDEpIHtcbiAgICBoYXNoID0gKGhhc2ggKiAzMSArIGlucHV0LmNoYXJDb2RlQXQoaW5kZXgpKSB8IDA7XG4gIH1cblxuICByZXR1cm4gYGgke01hdGguYWJzKGhhc2gpfWA7XG59XG5cbmZ1bmN0aW9uIGVuY29kZUJhc2U2NChpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgYnl0ZXMgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoaW5wdXQpO1xuICByZXR1cm4gZW5jb2RlQnl0ZXNCYXNlNjQoYnl0ZXMpO1xufVxuXG5mdW5jdGlvbiBlbmNvZGVCeXRlc0Jhc2U2NChieXRlczogVWludDhBcnJheSk6IHN0cmluZyB7XG4gIGxldCBiaW5hcnkgPSBcIlwiO1xuXG4gIGJ5dGVzLmZvckVhY2goKGJ5dGUpID0+IHtcbiAgICBiaW5hcnkgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShieXRlKTtcbiAgfSk7XG5cbiAgcmV0dXJuIGJ0b2EoYmluYXJ5KTtcbn1cblxuZnVuY3Rpb24gdGV4dEJ5dGVzKGlucHV0OiBzdHJpbmcpOiBVaW50OEFycmF5IHtcbiAgcmV0dXJuIG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShpbnB1dCk7XG59XG5cbmZ1bmN0aW9uIGRlY29kZUJhc2U2NEJ5dGVzKGlucHV0OiBzdHJpbmcpOiBVaW50OEFycmF5IHtcbiAgY29uc3QgYmluYXJ5ID0gYXRvYihpbnB1dC5yZXBsYWNlKC9cXHMvZywgXCJcIikpO1xuICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGJpbmFyeS5sZW5ndGgpO1xuXG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBiaW5hcnkubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgYnl0ZXNbaW5kZXhdID0gYmluYXJ5LmNoYXJDb2RlQXQoaW5kZXgpO1xuICB9XG5cbiAgcmV0dXJuIGJ5dGVzO1xufVxuXG5mdW5jdGlvbiBkZWNvZGVCYXNlNjQoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoZGVjb2RlQmFzZTY0Qnl0ZXMoaW5wdXQpKTtcbn1cblxuZnVuY3Rpb24gaGFzaEJ5dGVzKGlucHV0OiBBcnJheUJ1ZmZlcik6IHN0cmluZyB7XG4gIGNvbnN0IGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoaW5wdXQpO1xuICBsZXQgaGFzaCA9IDA7XG5cbiAgZm9yIChjb25zdCBieXRlIG9mIGJ5dGVzKSB7XG4gICAgaGFzaCA9IChoYXNoICogMzEgKyBieXRlKSB8IDA7XG4gIH1cblxuICByZXR1cm4gYGgke01hdGguYWJzKGhhc2gpfWA7XG59XG5cbmZ1bmN0aW9uIHRvSGV4KGJ5dGVzOiBVaW50OEFycmF5KTogc3RyaW5nIHtcbiAgcmV0dXJuIEFycmF5LmZyb20oYnl0ZXMpXG4gICAgLm1hcCgoYnl0ZSkgPT4gYnl0ZS50b1N0cmluZygxNikucGFkU3RhcnQoMiwgXCIwXCIpKVxuICAgIC5qb2luKFwiXCIpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnaXRCbG9iU2hhKGlucHV0OiBBcnJheUJ1ZmZlcik6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoaW5wdXQpO1xuICBjb25zdCBoZWFkZXIgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoYGJsb2IgJHtieXRlcy5ieXRlTGVuZ3RofVxcMGApO1xuICBjb25zdCBwYXlsb2FkID0gbmV3IFVpbnQ4QXJyYXkoaGVhZGVyLmJ5dGVMZW5ndGggKyBieXRlcy5ieXRlTGVuZ3RoKTtcbiAgcGF5bG9hZC5zZXQoaGVhZGVyLCAwKTtcbiAgcGF5bG9hZC5zZXQoYnl0ZXMsIGhlYWRlci5ieXRlTGVuZ3RoKTtcbiAgY29uc3QgZGlnZXN0ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3QoXCJTSEEtMVwiLCBwYXlsb2FkKTtcbiAgcmV0dXJuIHRvSGV4KG5ldyBVaW50OEFycmF5KGRpZ2VzdCkpO1xufVxuXG5mdW5jdGlvbiBpc1N5bmNhYmxlRmlsZShmaWxlOiBURmlsZSk6IGJvb2xlYW4ge1xuICBjb25zdCBuYW1lID0gZmlsZS5uYW1lLnRvTG93ZXJDYXNlKCk7XG4gIGlmIChuYW1lLnN0YXJ0c1dpdGgoXCIuXCIpIHx8IG5hbWUgPT09IFwiLmRzX3N0b3JlXCIgfHwgbmFtZSA9PT0gXCJ0aHVtYnMuZGJcIikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc0ltYWdlUGF0aChwYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIC9cXC4oYXZpZnxnaWZ8anBlP2d8cG5nfHN2Z3x3ZWJwKSQvaS50ZXN0KHBhdGgpO1xufVxuXG5mdW5jdGlvbiBwYXJzZVJlcG9zaXRvcnlVcmwoaW5wdXQ6IHN0cmluZyk6IEdpdEh1YlJlcG8gfCBudWxsIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IGlucHV0LnRyaW0oKS5yZXBsYWNlKC9cXC8kLywgXCJcIikucmVwbGFjZSgvXFwuZ2l0JC8sIFwiXCIpO1xuICBjb25zdCBodHRwc01hdGNoID0gL15odHRwcz86XFwvXFwvZ2l0aHViXFwuY29tXFwvKFteL10rKVxcLyhbXi9dKykkLy5leGVjKG5vcm1hbGl6ZWQpO1xuICBjb25zdCBzc2hNYXRjaCA9IC9eZ2l0QGdpdGh1YlxcLmNvbTooW14vXSspXFwvKFteL10rKSQvLmV4ZWMobm9ybWFsaXplZCk7XG4gIGNvbnN0IHNob3J0aGFuZE1hdGNoID0gL14oW14vXFxzXSspXFwvKFteL1xcc10rKSQvLmV4ZWMobm9ybWFsaXplZCk7XG4gIGNvbnN0IG1hdGNoID0gaHR0cHNNYXRjaCA/PyBzc2hNYXRjaCA/PyBzaG9ydGhhbmRNYXRjaDtcblxuICBpZiAoIW1hdGNoKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG93bmVyOiBtYXRjaFsxXSxcbiAgICByZXBvOiBtYXRjaFsyXVxuICB9O1xufVxuXG5mdW5jdGlvbiBlbmNvZGVHaXRIdWJQYXRoKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBwYXRoLnNwbGl0KFwiL1wiKS5tYXAoZW5jb2RlVVJJQ29tcG9uZW50KS5qb2luKFwiL1wiKTtcbn1cblxuZnVuY3Rpb24gaXNTYWZlQ29udGVudFBhdGgocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQYXRoKHBhdGgpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gIGNvbnN0IHNlZ21lbnRzID0gbm9ybWFsaXplZC5zcGxpdChcIi9cIik7XG4gIHJldHVybiBub3JtYWxpemVkLnN0YXJ0c1dpdGgoYCR7UkVNT1RFX0NPTlRFTlRfUk9PVH0vYCkgJiYgIXNlZ21lbnRzLnNvbWUoKHNlZ21lbnQpID0+IHNlZ21lbnQgPT09IFwiLi5cIiB8fCBzZWdtZW50ID09PSBcIlwiKTtcbn1cblxuZnVuY3Rpb24gdG9TdGF0dXNMYWJlbChzdGF0dXM6IExvY2FsRmlsZVN0YXRlW1wic3RhdHVzXCJdKTogc3RyaW5nIHtcbiAgc3dpdGNoIChzdGF0dXMpIHtcbiAgICBjYXNlIFwic3luY2VkXCI6XG4gICAgICByZXR1cm4gXCJcdTVERjJcdTU0MENcdTZCNjVcIjtcbiAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIHJldHVybiBcIlx1NURGMlx1NEZFRVx1NjUzOVwiO1xuICAgIGNhc2UgXCJkZWxldGVkXCI6XG4gICAgICByZXR1cm4gXCJcdThGRENcdTdBRUZcdTVERjJcdTUyMjBcdTk2NjRcIjtcbiAgICBjYXNlIFwiZmFpbGVkXCI6XG4gICAgICByZXR1cm4gXCJcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIjtcbiAgICBjYXNlIFwiZHJhZnRcIjpcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIFwiXHU2NzJBXHU1NDBDXHU2QjY1XCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gdG9TdGF0dXNDbGFzcyhzdGF0dXM6IExvY2FsRmlsZVN0YXRlW1wic3RhdHVzXCJdKTogc3RyaW5nIHtcbiAgc3dpdGNoIChzdGF0dXMpIHtcbiAgICBjYXNlIFwic3luY2VkXCI6XG4gICAgICByZXR1cm4gXCJpcy1zeW5jZWRcIjtcbiAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIHJldHVybiBcImlzLW1vZGlmaWVkXCI7XG4gICAgY2FzZSBcImRlbGV0ZWRcIjpcbiAgICAgIHJldHVybiBcImlzLWRlbGV0ZWRcIjtcbiAgICBjYXNlIFwiZmFpbGVkXCI6XG4gICAgICByZXR1cm4gXCJpcy1mYWlsZWRcIjtcbiAgICBjYXNlIFwiZHJhZnRcIjpcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIFwiaXMtZHJhZnRcIjtcbiAgfVxufVxuXG5mdW5jdGlvbiB0b1N0YXR1c0ljb24oc3RhdHVzOiBMb2NhbEZpbGVTdGF0ZVtcInN0YXR1c1wiXSk6IHN0cmluZyB7XG4gIHN3aXRjaCAoc3RhdHVzKSB7XG4gICAgY2FzZSBcInN5bmNlZFwiOlxuICAgICAgcmV0dXJuIFwiY2xvdWQtY2hlY2tcIjtcbiAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIHJldHVybiBcInBlbmNpbFwiO1xuICAgIGNhc2UgXCJkZWxldGVkXCI6XG4gICAgICByZXR1cm4gXCJjbG91ZC1vZmZcIjtcbiAgICBjYXNlIFwiZmFpbGVkXCI6XG4gICAgICByZXR1cm4gXCJhbGVydC10cmlhbmdsZVwiO1xuICAgIGNhc2UgXCJkcmFmdFwiOlxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gXCJmaWxlLXBlblwiO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRvU3luY0NlbnRlclN0YXR1c0xhYmVsKHN0YXR1czogU3luY0NlbnRlclN0YXR1cyk6IHN0cmluZyB7XG4gIHN3aXRjaCAoc3RhdHVzKSB7XG4gICAgY2FzZSBcInVucHVibGlzaGVkXCI6XG4gICAgICByZXR1cm4gXCJcdTY3MkNcdTU3MzBcdTY3MkFcdTUzRDFcdTVFMDNcIjtcbiAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIHJldHVybiBcIlx1NURGMlx1NEZFRVx1NjUzOVwiO1xuICAgIGNhc2UgXCJwdWJsaXNoZWRcIjpcbiAgICAgIHJldHVybiBcIlx1NURGMlx1NTNEMVx1NUUwM1wiO1xuICAgIGNhc2UgXCJsb2NhbERlbGV0ZWRcIjpcbiAgICAgIHJldHVybiBcIlx1NjcyQ1x1NTczMFx1NURGMlx1NTIyMFx1OTY2NFwiO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gc3RhdHVzO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRvU3luY0NlbnRlclN0YXR1c0NsYXNzKHN0YXR1czogU3luY0NlbnRlclN0YXR1cyk6IHN0cmluZyB7XG4gIHN3aXRjaCAoc3RhdHVzKSB7XG4gICAgY2FzZSBcInVucHVibGlzaGVkXCI6XG4gICAgICByZXR1cm4gXCJpcy1kcmFmdFwiO1xuICAgIGNhc2UgXCJtb2RpZmllZFwiOlxuICAgICAgcmV0dXJuIFwiaXMtbW9kaWZpZWRcIjtcbiAgICBjYXNlIFwicHVibGlzaGVkXCI6XG4gICAgICByZXR1cm4gXCJpcy1zeW5jZWRcIjtcbiAgICBjYXNlIFwibG9jYWxEZWxldGVkXCI6XG4gICAgICByZXR1cm4gXCJpcy1kZWxldGVkXCI7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBcImlzLWRyYWZ0XCI7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogR2l0SHViU3luY1NldHRpbmdzID0gREVGQVVMVF9TRVRUSU5HUztcbiAgZGF0YTogUGVyc2lzdGVkRGF0YSA9IERFRkFVTFRfREFUQTtcbiAgc3RhdHVzQmFyRWwhOiBIVE1MRWxlbWVudDtcbiAgc3RhdHVzQmFySWNvbkVsITogSFRNTEVsZW1lbnQ7XG4gIHN0YXR1c0JhclRleHRFbCE6IEhUTUxFbGVtZW50O1xuXG4gIGFzeW5jIG9ubG9hZCgpIHtcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xuXG4gICAgdGhpcy5hZGRSaWJib25JY29uKFwiZ2l0LWJyYW5jaFwiLCBcIk9ic2lkaWFuIEdpdCBTeW5jZXJcIiwgKGV2dCkgPT4ge1xuICAgICAgdGhpcy5zaG93UmliYm9uTWVudShldnQpO1xuICAgIH0pO1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJvcGVuLXN5bmMtY2VudGVyXCIsXG4gICAgICBuYW1lOiBcIlx1NjI1M1x1NUYwMFx1NTQwQ1x1NkI2NVx1NEUyRFx1NUZDM1wiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHRoaXMub3BlblN5bmNDZW50ZXIoKVxuICAgIH0pO1xuXG4gICAgdGhpcy5zdGF0dXNCYXJFbCA9IHRoaXMuYWRkU3RhdHVzQmFySXRlbSgpO1xuICAgIHRoaXMuc3RhdHVzQmFyRWwuYWRkQ2xhc3MoXCJvYnNpZGlhbi1naXQtc3luY2VyLXN0YXR1c1wiKTtcbiAgICB0aGlzLnN0YXR1c0Jhckljb25FbCA9IHRoaXMuc3RhdHVzQmFyRWwuY3JlYXRlU3Bhbih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN0YXR1cy1pY29uXCIgfSk7XG4gICAgdGhpcy5zdGF0dXNCYXJUZXh0RWwgPSB0aGlzLnN0YXR1c0JhckVsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zdGF0dXMtdGV4dFwiIH0pO1xuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgR2l0U3luY2VyU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImZpbGUtb3BlblwiLCAoKSA9PiB2b2lkIHRoaXMucmVmcmVzaFN0YXR1c0JhcigpKSk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAudmF1bHQub24oXCJtb2RpZnlcIiwgKGZpbGUpID0+IHtcbiAgICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSAmJiBmaWxlID09PSB0aGlzLmdldEN1cnJlbnRGaWxlKCkpIHtcbiAgICAgICAgICB2b2lkIHRoaXMucmVmcmVzaFN0YXR1c0JhcigpO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICk7XG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFwiZWRpdG9yLW1lbnVcIiwgKG1lbnUpID0+IHtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuZ2V0Q3VycmVudEZpbGUoKTtcbiAgICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5hZGRBcnRpY2xlQ29udGV4dE1lbnVJdGVtcyhtZW51LCBmaWxlKTtcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGF3YWl0IHRoaXMucmVmcmVzaFN0YXR1c0JhcigpO1xuICB9XG5cbiAgYXN5bmMgbG9hZFNldHRpbmdzKCkge1xuICAgIGNvbnN0IHNhdmVkID0gKGF3YWl0IHRoaXMubG9hZERhdGEoKSkgYXMgeyBzZXR0aW5ncz86IFBhcnRpYWw8R2l0SHViU3luY1NldHRpbmdzPjsgZGF0YT86IFBlcnNpc3RlZERhdGEgfSB8IG51bGw7XG4gICAgdGhpcy5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUywgLi4uKHNhdmVkPy5zZXR0aW5ncyA/PyB7fSkgfTtcbiAgICB0aGlzLmRhdGEgPSB7IC4uLkRFRkFVTFRfREFUQSwgLi4uKHNhdmVkPy5kYXRhID8/IHt9KSB9O1xuICB9XG5cbiAgYXN5bmMgc2F2ZUFsbERhdGEoKSB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh7XG4gICAgICBzZXR0aW5nczogdGhpcy5zZXR0aW5ncyxcbiAgICAgIGRhdGE6IHRoaXMuZGF0YVxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgc2F2ZVNldHRpbmdzKCkge1xuICAgIGF3YWl0IHRoaXMuc2F2ZUFsbERhdGEoKTtcbiAgfVxuXG4gIGFzeW5jIG1hcmtDb25uZWN0aW9uU3RhbGUoKSB7XG4gICAgdGhpcy5kYXRhLmNvbm5lY3Rpb24gPSB7XG4gICAgICBzdGF0dXM6IFwic3RhbGVcIixcbiAgICAgIG1lc3NhZ2U6IFwiXHU5MTREXHU3RjZFXHU1REYyXHU1M0Q4XHU2NkY0XHVGRjBDXHU4QkY3XHU5MUNEXHU2NUIwXHU2RDRCXHU4QkQ1XHU4RkRFXHU2M0E1XHUzMDAyXCJcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMuc2F2ZUFsbERhdGEoKTtcbiAgfVxuXG4gIGdldFJlcG9zaXRvcnkoKTogR2l0SHViUmVwbyB7XG4gICAgY29uc3QgcmVwb3NpdG9yeSA9IHBhcnNlUmVwb3NpdG9yeVVybCh0aGlzLnNldHRpbmdzLnJlcG9zaXRvcnlVcmwpO1xuICAgIGlmICghcmVwb3NpdG9yeSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiR2l0SHViIFx1NEVEM1x1NUU5M1x1NTczMFx1NTc0MFx1NjgzQ1x1NUYwRlx1NEUwRFx1NkI2M1x1Nzg2RVx1MzAwMlx1NjUyRlx1NjMwMSBodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby5naXRcdTMwMDFnaXRAZ2l0aHViLmNvbTpvd25lci9yZXBvLmdpdCBcdTYyMTYgb3duZXIvcmVwb1x1MzAwMlwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVwb3NpdG9yeTtcbiAgfVxuXG4gIHZhbGlkYXRlQ29uZmlnKCkge1xuICAgIHRoaXMuZ2V0UmVwb3NpdG9yeSgpO1xuXG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLmdpdGh1YlVzZXJuYW1lLnRyaW0oKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4QkY3XHU1MTQ4XHU1ODZCXHU1MTk5IEdpdEh1YiBVc2VybmFtZVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuc2V0dGluZ3MuZ2l0aHViVG9rZW4udHJpbSgpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdThCRjdcdTUxNDhcdTU4NkJcdTUxOTkgR2l0SHViIFRva2VuXHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5zZXR0aW5ncy5icmFuY2gudHJpbSgpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdThCRjdcdTUxNDhcdTU4NkJcdTUxOTlcdTc2RUVcdTY4MDdcdTUyMDZcdTY1MkZcdTMwMDJcIik7XG4gICAgfVxuICB9XG5cbiAgZ2V0RXhpc3RpbmdGb2xkZXIocGF0aDogc3RyaW5nKTogVEZvbGRlciB8IG51bGwge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQYXRoKHBhdGgpLnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcbiAgICBjb25zdCB0YXJnZXQgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgobm9ybWFsaXplZCk7XG4gICAgcmV0dXJuIHRhcmdldCBpbnN0YW5jZW9mIFRGb2xkZXIgPyB0YXJnZXQgOiBudWxsO1xuICB9XG5cbiAgZ2V0QWxsVmF1bHRGb2xkZXJzKCk6IFRGb2xkZXJbXSB7XG4gICAgY29uc3QgZm9sZGVyczogVEZvbGRlcltdID0gW107XG5cbiAgICB0aGlzLmFwcC52YXVsdC5nZXRBbGxMb2FkZWRGaWxlcygpLmZvckVhY2goKGVudHJ5KSA9PiB7XG4gICAgICBpZiAoZW50cnkgaW5zdGFuY2VvZiBURm9sZGVyICYmIGVudHJ5LnBhdGgpIHtcbiAgICAgICAgZm9sZGVycy5wdXNoKGVudHJ5KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBmb2xkZXJzLnNvcnQoKGEsIGIpID0+IGEucGF0aC5sb2NhbGVDb21wYXJlKGIucGF0aCwgXCJ6aC1DTlwiKSk7XG4gIH1cblxuICBhc3luYyBzZXRMb2NhbFJvb3RQYXRoKHBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQYXRoKHBhdGgudHJpbSgpKS5yZXBsYWNlKC9cXC8kLywgXCJcIik7XG5cbiAgICBpZiAoIW5vcm1hbGl6ZWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkxvY2FsIFJvb3QgUGF0aCBcdTRFMERcdTgwRkRcdTRFM0FcdTdBN0FcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgY29uc3QgZm9sZGVyID0gdGhpcy5nZXRFeGlzdGluZ0ZvbGRlcihub3JtYWxpemVkKTtcbiAgICBpZiAoIWZvbGRlcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4QkU1XHU3NkVFXHU1RjU1XHU0RTBEXHU1QjU4XHU1NzI4XHVGRjBDXHU4QkY3XHU0RUNFIFZhdWx0IFx1NEUyRFx1OTAwOVx1NjJFOVx1NURGMlx1NjcwOVx1NzZFRVx1NUY1NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICB0aGlzLnNldHRpbmdzLmxvY2FsUm9vdFBhdGggPSBmb2xkZXIucGF0aDtcbiAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5ncygpO1xuICB9XG5cbiAgZ2V0Q3VycmVudEZpbGUoKTogVEZpbGUgfCBudWxsIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICByZXR1cm4gZmlsZSBpbnN0YW5jZW9mIFRGaWxlICYmIGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIgPyBmaWxlIDogbnVsbDtcbiAgfVxuXG4gIGlzSW5zaWRlUm9vdChmaWxlOiBURmlsZSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHJvb3QgPSBub3JtYWxpemVQYXRoKHRoaXMuc2V0dGluZ3MubG9jYWxSb290UGF0aCkucmVwbGFjZSgvXFwvJC8sIFwiXCIpO1xuICAgIGlmICghcm9vdCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiBmaWxlLnBhdGggPT09IHJvb3QgfHwgZmlsZS5wYXRoLnN0YXJ0c1dpdGgoYCR7cm9vdH0vYCk7XG4gIH1cblxuICByZWxhdGl2ZVBhdGgoZmlsZTogVEZpbGUpOiBzdHJpbmcge1xuICAgIGNvbnN0IHJvb3QgPSBub3JtYWxpemVQYXRoKHRoaXMuc2V0dGluZ3MubG9jYWxSb290UGF0aCkucmVwbGFjZSgvXFwvJC8sIFwiXCIpO1xuICAgIGNvbnN0IGZ1bGxQYXRoID0gbm9ybWFsaXplUGF0aChmaWxlLnBhdGgpO1xuXG4gICAgaWYgKGZ1bGxQYXRoID09PSByb290KSB7XG4gICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG5cbiAgICBpZiAoZnVsbFBhdGguc3RhcnRzV2l0aChgJHtyb290fS9gKSkge1xuICAgICAgcmV0dXJuIGZ1bGxQYXRoLnNsaWNlKHJvb3QubGVuZ3RoICsgMSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bGxQYXRoO1xuICB9XG5cbiAgcmVtb3RlUGF0aChmaWxlOiBURmlsZSk6IHN0cmluZyB7XG4gICAgY29uc3QgcmVsYXRpdmUgPSBub3JtYWxpemVQYXRoKHRoaXMucmVsYXRpdmVQYXRoKGZpbGUpKS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuICAgIGNvbnN0IHBhdGggPSBub3JtYWxpemVQYXRoKGAke1JFTU9URV9DT05URU5UX1JPT1R9LyR7cmVsYXRpdmV9YCkucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcblxuICAgIGlmICghcmVsYXRpdmUgfHwgIWlzU2FmZUNvbnRlbnRQYXRoKHBhdGgpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdThGRENcdTdBRUZcdThERUZcdTVGODRcdTVGQzVcdTk4N0JcdTRGNERcdTRFOEVcdTRFRDNcdTVFOTMgY29udGVudCBcdTc2RUVcdTVGNTVcdTUxODVcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhdGg7XG4gIH1cblxuICBsb2NhbFBhdGhGcm9tUmVtb3RlUGF0aChyZW1vdGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWRSZW1vdGVQYXRoID0gbm9ybWFsaXplUGF0aChyZW1vdGVQYXRoKS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuXG4gICAgaWYgKCFpc1NhZmVDb250ZW50UGF0aChub3JtYWxpemVkUmVtb3RlUGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1OEZEQ1x1N0FFRlx1OERFRlx1NUY4NFx1NUZDNVx1OTg3Qlx1NEY0RFx1NEU4RVx1NEVEM1x1NUU5MyBjb250ZW50IFx1NzZFRVx1NUY1NVx1NTE4NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICBjb25zdCByZWxhdGl2ZSA9IG5vcm1hbGl6ZWRSZW1vdGVQYXRoLnNsaWNlKFJFTU9URV9DT05URU5UX1JPT1QubGVuZ3RoICsgMSk7XG4gICAgY29uc3QgbG9jYWxSb290ID0gbm9ybWFsaXplUGF0aCh0aGlzLnNldHRpbmdzLmxvY2FsUm9vdFBhdGgpLnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcbiAgICByZXR1cm4gbm9ybWFsaXplUGF0aChgJHtsb2NhbFJvb3R9LyR7cmVsYXRpdmV9YCk7XG4gIH1cblxuICBhc3luYyBlbnN1cmVGb2xkZXJQYXRoKGZvbGRlclBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQYXRoKGZvbGRlclBhdGgpLnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcblxuICAgIGlmICghbm9ybWFsaXplZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHBhcnRzID0gbm9ybWFsaXplZC5zcGxpdChcIi9cIik7XG4gICAgbGV0IGN1cnJlbnQgPSBcIlwiO1xuXG4gICAgZm9yIChjb25zdCBwYXJ0IG9mIHBhcnRzKSB7XG4gICAgICBjdXJyZW50ID0gY3VycmVudCA/IGAke2N1cnJlbnR9LyR7cGFydH1gIDogcGFydDtcbiAgICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGN1cnJlbnQpO1xuXG4gICAgICBpZiAoZW50cnkgaW5zdGFuY2VvZiBURm9sZGVyKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAoZW50cnkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBcdTY1RTBcdTZDRDVcdTUyMUJcdTVFRkFcdTc2RUVcdTVGNTVcdUZGMENcdThERUZcdTVGODRcdTVERjJcdTg4QUJcdTY1ODdcdTRFRjZcdTUzNjBcdTc1MjhcdUZGMUEke2N1cnJlbnR9YCk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZUZvbGRlcihjdXJyZW50KTtcbiAgICB9XG4gIH1cblxuICBnZXRTdGF0ZShmaWxlOiBURmlsZSk6IExvY2FsRmlsZVN0YXRlIHtcbiAgICByZXR1cm4gdGhpcy5kYXRhLmZpbGVzW2ZpbGUucGF0aF0gPz8geyBzdGF0dXM6IFwiZHJhZnRcIiB9O1xuICB9XG5cbiAgYXN5bmMgY2FjaGVFZmZlY3RpdmVTdGF0ZShmaWxlOiBURmlsZSwgc3RhdGU6IExvY2FsRmlsZVN0YXRlKSB7XG4gICAgY29uc3QgY3VycmVudCA9IHRoaXMuZGF0YS5maWxlc1tmaWxlLnBhdGhdO1xuXG4gICAgaWYgKFxuICAgICAgY3VycmVudD8ucmVtb3RlUGF0aCA9PT0gc3RhdGUucmVtb3RlUGF0aCAmJlxuICAgICAgY3VycmVudD8uc2hhID09PSBzdGF0ZS5zaGEgJiZcbiAgICAgIGN1cnJlbnQ/LnN0YXR1cyA9PT0gc3RhdGUuc3RhdHVzICYmXG4gICAgICBjdXJyZW50Py5sYXN0U3luY2VkQXQgPT09IHN0YXRlLmxhc3RTeW5jZWRBdCAmJlxuICAgICAgY3VycmVudD8ubGFzdFN5bmNlZEhhc2ggPT09IHN0YXRlLmxhc3RTeW5jZWRIYXNoICYmXG4gICAgICBjdXJyZW50Py5odG1sVXJsID09PSBzdGF0ZS5odG1sVXJsXG4gICAgKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5kYXRhLmZpbGVzW2ZpbGUucGF0aF0gPSBzdGF0ZTtcbiAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gIH1cblxuICBhc3luYyBnZXRFZmZlY3RpdmVTdGF0ZShmaWxlOiBURmlsZSk6IFByb21pc2U8TG9jYWxGaWxlU3RhdGU+IHtcbiAgICBsZXQgc3RhdGUgPSB0aGlzLmdldFN0YXRlKGZpbGUpO1xuXG4gICAgdHJ5IHtcbiAgICAgIHN0YXRlID0gYXdhaXQgdGhpcy5zeW5jRmlsZVN0YXRlKGZpbGUpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gS2VlcCB0aGUgbGFzdCBsb2NhbCBzdGF0ZSB3aGVuIEdpdEh1YiBpcyB0ZW1wb3JhcmlseSB1bmF2YWlsYWJsZS5cbiAgICB9XG5cbiAgICBpZiAoc3RhdGUuc3RhdHVzICE9PSBcInN5bmNlZFwiIHx8ICFzdGF0ZS5sYXN0U3luY2VkSGFzaCkge1xuICAgICAgcmV0dXJuIHN0YXRlO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IGN1cnJlbnRIYXNoID0gaGFzaENvbnRlbnQoY29udGVudCk7XG5cbiAgICBpZiAoY3VycmVudEhhc2ggIT09IHN0YXRlLmxhc3RTeW5jZWRIYXNoKSB7XG4gICAgICBjb25zdCBuZXh0U3RhdGUgPSB7IC4uLnN0YXRlLCBzdGF0dXM6IFwibW9kaWZpZWRcIiBhcyBjb25zdCB9O1xuICAgICAgYXdhaXQgdGhpcy5jYWNoZUVmZmVjdGl2ZVN0YXRlKGZpbGUsIG5leHRTdGF0ZSk7XG4gICAgICByZXR1cm4gbmV4dFN0YXRlO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuY2FjaGVFZmZlY3RpdmVTdGF0ZShmaWxlLCBzdGF0ZSk7XG4gICAgcmV0dXJuIHN0YXRlO1xuICB9XG5cbiAgYXN5bmMgc2V0U3RhdGUoZmlsZTogVEZpbGUsIHBhdGNoOiBQYXJ0aWFsPExvY2FsRmlsZVN0YXRlPikge1xuICAgIHRoaXMuZGF0YS5maWxlc1tmaWxlLnBhdGhdID0geyAuLi50aGlzLmdldFN0YXRlKGZpbGUpLCAuLi5wYXRjaCB9O1xuICAgIGF3YWl0IHRoaXMuc2F2ZUFsbERhdGEoKTtcbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hTdGF0dXNCYXIoKTtcbiAgfVxuXG4gIHNldFN0YXR1c0JhclN0YXRlKHN0YXR1c0NsYXNzOiBzdHJpbmcgfCBudWxsKSB7XG4gICAgdGhpcy5zdGF0dXNCYXJFbC5yZW1vdmVDbGFzcyhcImlzLWRyYWZ0XCIsIFwiaXMtc3luY2VkXCIsIFwiaXMtbW9kaWZpZWRcIiwgXCJpcy1kZWxldGVkXCIsIFwiaXMtZmFpbGVkXCIsIFwiaXMtaW5hY3RpdmVcIik7XG5cbiAgICBpZiAoc3RhdHVzQ2xhc3MpIHtcbiAgICAgIHRoaXMuc3RhdHVzQmFyRWwuYWRkQ2xhc3Moc3RhdHVzQ2xhc3MpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJlZnJlc2hTdGF0dXNCYXIoKSB7XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuZ2V0Q3VycmVudEZpbGUoKTtcblxuICAgIGlmICghZmlsZSkge1xuICAgICAgdGhpcy5zZXRTdGF0dXNCYXJTdGF0ZShcImlzLWluYWN0aXZlXCIpO1xuICAgICAgc2V0SWNvbih0aGlzLnN0YXR1c0Jhckljb25FbCwgXCJnaXQtYnJhbmNoXCIpO1xuICAgICAgdGhpcy5zdGF0dXNCYXJUZXh0RWwuc2V0VGV4dChcIlx1NjVFMFx1NkQzQlx1NTJBOFx1NjU4N1x1N0FFMFwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuaXNJbnNpZGVSb290KGZpbGUpKSB7XG4gICAgICB0aGlzLnNldFN0YXR1c0JhclN0YXRlKFwiaXMtaW5hY3RpdmVcIik7XG4gICAgICBzZXRJY29uKHRoaXMuc3RhdHVzQmFySWNvbkVsLCBcImdpdC1icmFuY2hcIik7XG4gICAgICB0aGlzLnN0YXR1c0JhclRleHRFbC5zZXRUZXh0KFwiXHU0RTBEXHU1NzI4XHU1NDBDXHU2QjY1XHU3NkVFXHU1RjU1XCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHN0YXRlID0gYXdhaXQgdGhpcy5nZXRFZmZlY3RpdmVTdGF0ZShmaWxlKTtcbiAgICBjb25zdCBsYWJlbCA9IHRvU3RhdHVzTGFiZWwoc3RhdGUuc3RhdHVzKTtcbiAgICB0aGlzLnNldFN0YXR1c0JhclN0YXRlKHRvU3RhdHVzQ2xhc3Moc3RhdGUuc3RhdHVzKSk7XG5cbiAgICBzZXRJY29uKHRoaXMuc3RhdHVzQmFySWNvbkVsLCB0b1N0YXR1c0ljb24oc3RhdGUuc3RhdHVzKSk7XG4gICAgdGhpcy5zdGF0dXNCYXJUZXh0RWwuc2V0VGV4dChsYWJlbCk7XG4gIH1cblxuICBhc3luYyBlbnN1cmVUZW1wbGF0ZUZyb250bWF0dGVyKGZpbGU6IFRGaWxlKSB7XG4gICAgaWYgKCF0aGlzLmlzSW5zaWRlUm9vdChmaWxlKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU1RjUzXHU1MjREXHU2NTg3XHU3QUUwXHU0RTBEXHU1NzI4IExvY2FsIFJvb3QgUGF0aCBcdTUxODVcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgY29uc3QgcGFyc2VkID0gcGFyc2VGcm9udG1hdHRlcihjb250ZW50KTtcblxuICAgIGlmIChPYmplY3Qua2V5cyhwYXJzZWQuZGF0YSkubGVuZ3RoID4gMCkge1xuICAgICAgbmV3IE5vdGljZShcIlx1NUY1M1x1NTI0RFx1NjU4N1x1N0FFMFx1NURGMlx1N0VDRlx1NUI1OFx1NTcyOFx1NjU4N1x1N0FFMFx1NUM1RVx1NjAyN1x1MzAwMlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBuZXh0Q29udGVudCA9IGAke2J1aWxkRnJvbnRtYXR0ZXIoZmlsZSl9JHtjb250ZW50fWA7XG4gICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIG5leHRDb250ZW50KTtcbiAgICBuZXcgTm90aWNlKFwiXHU2NTg3XHU3QUUwXHU1QzVFXHU2MDI3XHU1REYyXHU2M0QyXHU1MTY1XHUzMDAyXCIpO1xuICB9XG5cbiAgZ2V0U3luY01lbnVUaXRsZShzdGF0ZTogTG9jYWxGaWxlU3RhdGUpOiBzdHJpbmcge1xuICAgIHN3aXRjaCAoc3RhdGUuc3RhdHVzKSB7XG4gICAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIGNhc2UgXCJkZWxldGVkXCI6XG4gICAgICAgIHJldHVybiBcIlx1OTFDRFx1NjVCMFx1NTQwQ1x1NkI2NVwiO1xuICAgICAgY2FzZSBcImZhaWxlZFwiOlxuICAgICAgICByZXR1cm4gXCJcdTUxOERcdTZCMjFcdTU0MENcdTZCNjVcIjtcbiAgICAgIGNhc2UgXCJzeW5jZWRcIjpcbiAgICAgICAgcmV0dXJuIFwiXHU1REYyXHU1NDBDXHU2QjY1XCI7XG4gICAgICBjYXNlIFwiZHJhZnRcIjpcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiBcIlx1NTQwQ1x1NkI2NVx1NTIzMCBHaXRIdWJcIjtcbiAgICB9XG4gIH1cblxuICBidWlsZEFjdGlvbkNvbnRleHQoZmlsZTogVEZpbGUsIHN0YXRlOiBMb2NhbEZpbGVTdGF0ZSwgaGFzUHJvcGVydGllczogYm9vbGVhbik6IEFydGljbGVBY3Rpb25Db250ZXh0IHtcbiAgICBjb25zdCBpblJvb3QgPSB0aGlzLmlzSW5zaWRlUm9vdChmaWxlKTtcbiAgICBjb25zdCBzeW5jVGl0bGUgPSB0aGlzLmdldFN5bmNNZW51VGl0bGUoc3RhdGUpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGZpbGUsXG4gICAgICBpblJvb3QsXG4gICAgICBoYXNQcm9wZXJ0aWVzLFxuICAgICAgc3RhdGUsXG4gICAgICBzeW5jVGl0bGUsXG4gICAgICBjYW5TeW5jOiBpblJvb3QgJiYgc3RhdGUuc3RhdHVzICE9PSBcInN5bmNlZFwiLFxuICAgICAgY2FuRGVsZXRlUmVtb3RlOiBCb29sZWFuKHN0YXRlLnNoYSkgJiYgc3RhdGUuc3RhdHVzICE9PSBcImRlbGV0ZWRcIixcbiAgICAgIGNhbk9wZW5SZW1vdGU6IEJvb2xlYW4oc3RhdGUuaHRtbFVybCB8fCBzdGF0ZS5yZW1vdGVQYXRoKSAmJiBzdGF0ZS5zdGF0dXMgIT09IFwiZGVsZXRlZFwiLFxuICAgICAgY2FuSW5zZXJ0UHJvcGVydGllczogaW5Sb290ICYmICFoYXNQcm9wZXJ0aWVzXG4gICAgfTtcbiAgfVxuXG4gIGFzeW5jIGdldEFjdGlvbkNvbnRleHQoZmlsZTogVEZpbGUpOiBQcm9taXNlPEFydGljbGVBY3Rpb25Db250ZXh0PiB7XG4gICAgY29uc3QgW3N0YXRlLCBjb250ZW50XSA9IGF3YWl0IFByb21pc2UuYWxsKFt0aGlzLmdldEVmZmVjdGl2ZVN0YXRlKGZpbGUpLCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpXSk7XG4gICAgY29uc3QgcHJvcGVydGllcyA9IHBhcnNlRnJvbnRtYXR0ZXIoY29udGVudCkuZGF0YTtcbiAgICByZXR1cm4gdGhpcy5idWlsZEFjdGlvbkNvbnRleHQoZmlsZSwgc3RhdGUsIE9iamVjdC5rZXlzKHByb3BlcnRpZXMpLmxlbmd0aCA+IDApO1xuICB9XG5cbiAgZ2V0Q2FjaGVkQWN0aW9uQ29udGV4dChmaWxlOiBURmlsZSk6IEFydGljbGVBY3Rpb25Db250ZXh0IHtcbiAgICBjb25zdCBwcm9wZXJ0aWVzID0gdGhpcy5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoZmlsZSk/LmZyb250bWF0dGVyID8/IHt9O1xuICAgIGNvbnN0IHN0YXRlID0gdGhpcy5nZXRTdGF0ZShmaWxlKTtcbiAgICByZXR1cm4gdGhpcy5idWlsZEFjdGlvbkNvbnRleHQoZmlsZSwgc3RhdGUsIE9iamVjdC5rZXlzKHByb3BlcnRpZXMpLmxlbmd0aCA+IDApO1xuICB9XG5cbiAgYXN5bmMgc2hvd1JpYmJvbk1lbnUoZXZ0OiBNb3VzZUV2ZW50KSB7XG4gICAgY29uc3QgbWVudSA9IG5ldyBNZW51KCk7XG4gICAgY29uc3QgY3VycmVudEZpbGUgPSB0aGlzLmdldEN1cnJlbnRGaWxlKCk7XG4gICAgY29uc3QgY29udGV4dCA9IGN1cnJlbnRGaWxlID8gYXdhaXQgdGhpcy5nZXRBY3Rpb25Db250ZXh0KGN1cnJlbnRGaWxlKSA6IG51bGw7XG5cbiAgICBtZW51LnNldFVzZU5hdGl2ZU1lbnUodHJ1ZSk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoY29udGV4dD8uc3luY1RpdGxlID8/IFwiXHU1NDBDXHU2QjY1XHU1MjMwIEdpdEh1YlwiKVxuICAgICAgICAuc2V0SWNvbihcImNsb3VkLXVwbG9hZFwiKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQ/LmNhblN5bmMpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICBpZiAoY29udGV4dCkge1xuICAgICAgICAgICAgdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnN5bmNGaWxlVG9HaXRIdWIoY29udGV4dC5maWxlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICApO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiXHU1NDBDXHU2QjY1XHU0RTJEXHU1RkMzXCIpXG4gICAgICAgIC5zZXRJY29uKFwibGlzdC10cmVlXCIpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMub3BlblN5bmNDZW50ZXIoKSlcbiAgICApO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiXHU2MjUzXHU1RjAwIEdpdEh1YlwiKVxuICAgICAgICAuc2V0SWNvbihcImV4dGVybmFsLWxpbmtcIilcbiAgICAgICAgLnNldERpc2FibGVkKCFjb250ZXh0Py5jYW5PcGVuUmVtb3RlKVxuICAgICAgICAub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbnRleHQpIHtcbiAgICAgICAgICAgIHZvaWQgdGhpcy5ydW5XaXRoTm90aWNlKCgpID0+IHRoaXMub3BlblJlbW90ZVVybEZvckZpbGUoY29udGV4dC5maWxlKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJcdTYzRDJcdTUxNjVcdTY1ODdcdTdBRTBcdTVDNUVcdTYwMjdcIilcbiAgICAgICAgLnNldEljb24oXCJmaWxlLXBsdXMtMlwiKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQ/LmNhbkluc2VydFByb3BlcnRpZXMpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICBpZiAoY29udGV4dCkge1xuICAgICAgICAgICAgdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoKCkgPT4gdGhpcy5lbnN1cmVUZW1wbGF0ZUZyb250bWF0dGVyKGNvbnRleHQuZmlsZSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICApO1xuICAgIG1lbnUuYWRkU2VwYXJhdG9yKCk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoY29udGV4dD8uc3RhdGUuc3RhdHVzID09PSBcImRlbGV0ZWRcIiA/IFwiXHU4RkRDXHU3QUVGXHU1REYyXHU1MjIwXHU5NjY0XCIgOiBcIlx1NTIyMFx1OTY2NFx1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlwiKVxuICAgICAgICAuc2V0SWNvbihcImNsb3VkLW9mZlwiKVxuICAgICAgICAuc2V0V2FybmluZyh0cnVlKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQ/LmNhbkRlbGV0ZVJlbW90ZSlcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xuICAgICAgICAgIGlmIChjb250ZXh0KSB7XG4gICAgICAgICAgICB2b2lkIHRoaXMucnVuV2l0aE5vdGljZSgoKSA9PiB0aGlzLmRlbGV0ZVJlbW90ZUZpbGUoY29udGV4dC5maWxlKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICk7XG4gICAgbWVudS5hZGRTZXBhcmF0b3IoKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIlx1NkQ0Qlx1OEJENSBHaXRIdWIgXHU4RkRFXHU2M0E1XCIpXG4gICAgICAgIC5zZXRJY29uKFwiZ2xvYmVcIilcbiAgICAgICAgLm9uQ2xpY2soKCkgPT5cbiAgICAgICAgICB2b2lkIHRoaXMucnVuV2l0aE5vdGljZShhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnRlc3RDb25uZWN0aW9uKCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgKVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJcdThCQkVcdTdGNkVcIilcbiAgICAgICAgLnNldEljb24oXCJzZXR0aW5nc1wiKVxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLm9wZW5QbHVnaW5TZXR0aW5ncygpKVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoYFx1NzI0OFx1NjcyQyB2JHt0aGlzLm1hbmlmZXN0LnZlcnNpb259YClcbiAgICAgICAgLnNldEljb24oXCJpbmZvXCIpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMub3BlblZlcnNpb25JbmZvKCkpXG4gICAgKTtcbiAgICBtZW51LnNob3dBdE1vdXNlRXZlbnQoZXZ0KTtcbiAgfVxuXG4gIGFkZEFydGljbGVDb250ZXh0TWVudUl0ZW1zKG1lbnU6IE1lbnUsIGZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3QgY29udGV4dCA9IHRoaXMuZ2V0Q2FjaGVkQWN0aW9uQ29udGV4dChmaWxlKTtcblxuICAgIG1lbnUuYWRkU2VwYXJhdG9yKCk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoY29udGV4dC5zeW5jVGl0bGUpXG4gICAgICAgIC5zZXRJY29uKFwiY2xvdWQtdXBsb2FkXCIpXG4gICAgICAgIC5zZXREaXNhYmxlZCghY29udGV4dC5jYW5TeW5jKVxuICAgICAgICAub25DbGljaygoKSA9PlxuICAgICAgICAgIHZvaWQgdGhpcy5ydW5XaXRoTm90aWNlKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuc3luY0ZpbGVUb0dpdEh1Yihjb250ZXh0LmZpbGUpO1xuICAgICAgICAgIH0pXG4gICAgICAgIClcbiAgICApO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiXHU2MjUzXHU1RjAwIEdpdEh1YlwiKVxuICAgICAgICAuc2V0SWNvbihcImV4dGVybmFsLWxpbmtcIilcbiAgICAgICAgLnNldERpc2FibGVkKCFjb250ZXh0LmNhbk9wZW5SZW1vdGUpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHZvaWQgdGhpcy5ydW5XaXRoTm90aWNlKCgpID0+IHRoaXMub3BlblJlbW90ZVVybEZvckZpbGUoY29udGV4dC5maWxlKSkpXG4gICAgKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIlx1NjNEMlx1NTE2NVx1NjU4N1x1N0FFMFx1NUM1RVx1NjAyN1wiKVxuICAgICAgICAuc2V0SWNvbihcImZpbGUtcGx1cy0yXCIpXG4gICAgICAgIC5zZXREaXNhYmxlZCghY29udGV4dC5jYW5JbnNlcnRQcm9wZXJ0aWVzKVxuICAgICAgICAub25DbGljaygoKSA9PiB2b2lkIHRoaXMucnVuV2l0aE5vdGljZSgoKSA9PiB0aGlzLmVuc3VyZVRlbXBsYXRlRnJvbnRtYXR0ZXIoY29udGV4dC5maWxlKSkpXG4gICAgKTtcbiAgICBtZW51LmFkZFNlcGFyYXRvcigpO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKGNvbnRleHQuc3RhdGUuc3RhdHVzID09PSBcImRlbGV0ZWRcIiA/IFwiXHU4RkRDXHU3QUVGXHU1REYyXHU1MjIwXHU5NjY0XCIgOiBcIlx1NTIyMFx1OTY2NFx1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlwiKVxuICAgICAgICAuc2V0SWNvbihcImNsb3VkLW9mZlwiKVxuICAgICAgICAuc2V0V2FybmluZyh0cnVlKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQuY2FuRGVsZXRlUmVtb3RlKVxuICAgICAgICAub25DbGljaygoKSA9PiB2b2lkIHRoaXMucnVuV2l0aE5vdGljZSgoKSA9PiB0aGlzLmRlbGV0ZVJlbW90ZUZpbGUoY29udGV4dC5maWxlKSkpXG4gICAgKTtcbiAgfVxuXG4gIG9wZW5QbHVnaW5TZXR0aW5ncygpIHtcbiAgICBjb25zdCBpbnRlcm5hbEFwcCA9IHRoaXMuYXBwIGFzIEFwcCAmIHtcbiAgICAgIHNldHRpbmc/OiB7XG4gICAgICAgIG9wZW46ICgpID0+IHZvaWQ7XG4gICAgICAgIG9wZW5UYWJCeUlkPzogKGlkOiBzdHJpbmcpID0+IHZvaWQ7XG4gICAgICB9O1xuICAgIH07XG5cbiAgICBpZiAoIWludGVybmFsQXBwLnNldHRpbmcpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJcdTVGNTNcdTUyNERcdTczQUZcdTU4ODNcdTRFMERcdTY1MkZcdTYzMDFcdTc2RjRcdTYzQTVcdThERjNcdThGNkNcdTYzRDJcdTRFRjZcdThCQkVcdTdGNkVcdTMwMDJcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaW50ZXJuYWxBcHAuc2V0dGluZy5vcGVuKCk7XG4gICAgaW50ZXJuYWxBcHAuc2V0dGluZy5vcGVuVGFiQnlJZD8uKHRoaXMubWFuaWZlc3QuaWQpO1xuICB9XG5cbiAgb3BlblZlcnNpb25JbmZvKCkge1xuICAgIG5ldyBQbHVnaW5WZXJzaW9uTW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcbiAgfVxuXG4gIG9wZW5TeW5jQ2VudGVyKCkge1xuICAgIG5ldyBTeW5jQ2VudGVyTW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcbiAgfVxuXG4gIGFzeW5jIHJ1bldpdGhOb3RpY2UoYWN0aW9uOiAoKSA9PiBQcm9taXNlPHZvaWQ+KSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGFjdGlvbigpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIlx1NjcyQVx1NzdFNVx1OTUxOVx1OEJFRlwiO1xuICAgICAgbmV3IE5vdGljZShtZXNzYWdlKTtcbiAgICB9XG4gIH1cblxuICBidWlsZEdpdEh1YkFwaVVybChwYXRoOiBzdHJpbmcsIHBhcmFtcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4pOiBzdHJpbmcge1xuICAgIGNvbnN0IHVybCA9IG5ldyBVUkwoYGh0dHBzOi8vYXBpLmdpdGh1Yi5jb20ke3BhdGh9YCk7XG5cbiAgICBPYmplY3QuZW50cmllcyhwYXJhbXMgPz8ge30pLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgIHVybC5zZWFyY2hQYXJhbXMuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHVybC50b1N0cmluZygpO1xuICB9XG5cbiAgYnVpbGRDb250ZW50QXBpUGF0aChyZW1vdGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLmdldFJlcG9zaXRvcnkoKTtcbiAgICByZXR1cm4gYC9yZXBvcy8ke2VuY29kZVVSSUNvbXBvbmVudChyZXBvc2l0b3J5Lm93bmVyKX0vJHtlbmNvZGVVUklDb21wb25lbnQocmVwb3NpdG9yeS5yZXBvKX0vY29udGVudHMvJHtlbmNvZGVHaXRIdWJQYXRoKHJlbW90ZVBhdGgpfWA7XG4gIH1cblxuICBidWlsZFJlcG9BcGlQYXRoKCk6IHN0cmluZyB7XG4gICAgY29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuZ2V0UmVwb3NpdG9yeSgpO1xuICAgIHJldHVybiBgL3JlcG9zLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlcG9zaXRvcnkub3duZXIpfS8ke2VuY29kZVVSSUNvbXBvbmVudChyZXBvc2l0b3J5LnJlcG8pfWA7XG4gIH1cblxuICBidWlsZEJyYW5jaEFwaVBhdGgoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYCR7dGhpcy5idWlsZFJlcG9BcGlQYXRoKCl9L2JyYW5jaGVzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKSl9YDtcbiAgfVxuXG4gIGJ1aWxkR2l0VHJlZUFwaVBhdGgoKTogc3RyaW5nIHtcbiAgICBjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5nZXRSZXBvc2l0b3J5KCk7XG4gICAgcmV0dXJuIGAvcmVwb3MvJHtlbmNvZGVVUklDb21wb25lbnQocmVwb3NpdG9yeS5vd25lcil9LyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlcG9zaXRvcnkucmVwbyl9L2dpdC90cmVlcy8ke2VuY29kZVVSSUNvbXBvbmVudCh0aGlzLnNldHRpbmdzLmJyYW5jaC50cmltKCkpfWA7XG4gIH1cblxuICBidWlsZEdpdEh1YkJsb2JVcmwocmVtb3RlUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5nZXRSZXBvc2l0b3J5KCk7XG4gICAgcmV0dXJuIGBodHRwczovL2dpdGh1Yi5jb20vJHtyZXBvc2l0b3J5Lm93bmVyfS8ke3JlcG9zaXRvcnkucmVwb30vYmxvYi8ke2VuY29kZVVSSUNvbXBvbmVudCh0aGlzLnNldHRpbmdzLmJyYW5jaC50cmltKCkpfS8ke2VuY29kZUdpdEh1YlBhdGgocmVtb3RlUGF0aCl9YDtcbiAgfVxuXG4gIGFzeW5jIGdpdGh1YlJlcXVlc3Q8VFJlc3BvbnNlPihcbiAgICBtZXRob2Q6IFwiR0VUXCIgfCBcIlBVVFwiIHwgXCJERUxFVEVcIixcbiAgICBwYXRoOiBzdHJpbmcsXG4gICAgcGF5bG9hZD86IHVua25vd24sXG4gICAgcGFyYW1zPzogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPlxuICApOiBQcm9taXNlPFRSZXNwb25zZT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdFVybCh7XG4gICAgICB1cmw6IHRoaXMuYnVpbGRHaXRIdWJBcGlVcmwocGF0aCwgcGFyYW1zKSxcbiAgICAgIG1ldGhvZCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQWNjZXB0OiBcImFwcGxpY2F0aW9uL3ZuZC5naXRodWIranNvblwiLFxuICAgICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7dGhpcy5zZXR0aW5ncy5naXRodWJUb2tlbi50cmltKCl9YCxcbiAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICAgIFwiWC1HaXRIdWItQXBpLVZlcnNpb25cIjogXCIyMDIyLTExLTI4XCJcbiAgICAgIH0sXG4gICAgICBib2R5OiBwYXlsb2FkID8gSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkgOiB1bmRlZmluZWRcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPj0gNDAwKSB7XG4gICAgICBsZXQgZXJyb3JNZXNzYWdlID0gcmVzcG9uc2UudGV4dDtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyZXNwb25zZS50ZXh0KSBhcyBHaXRIdWJFcnJvclBheWxvYWQ7XG4gICAgICAgIGlmIChwYXJzZWQubWVzc2FnZSkge1xuICAgICAgICAgIGVycm9yTWVzc2FnZSA9IHBhcnNlZC5tZXNzYWdlO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gS2VlcCByYXcgcmVzcG9uc2UgdGV4dCB3aGVuIGl0IGlzIG5vdCBKU09OLlxuICAgICAgfVxuXG4gICAgICB0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKHJlc3BvbnNlLnN0YXR1cywgZXJyb3JNZXNzYWdlIHx8IGBHaXRIdWIgSFRUUCAke3Jlc3BvbnNlLnN0YXR1c31gLCBtZXRob2QsIHBhdGgpO1xuICAgIH1cblxuICAgIHJldHVybiByZXNwb25zZS5qc29uIGFzIFRSZXNwb25zZTtcbiAgfVxuXG4gIGFzeW5jIGdldFJlbW90ZUNvbnRlbnQocmVtb3RlUGF0aDogc3RyaW5nKTogUHJvbWlzZTxHaXRIdWJDb250ZW50UmVzcG9uc2UgfCBudWxsPiB7XG4gICAgaWYgKCFpc1NhZmVDb250ZW50UGF0aChyZW1vdGVQYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4RkRDXHU3QUVGXHU4REVGXHU1Rjg0XHU1RkM1XHU5ODdCXHU0RjREXHU0RThFXHU0RUQzXHU1RTkzIGNvbnRlbnQgXHU3NkVFXHU1RjU1XHU1MTg1XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YlJlcXVlc3Q8R2l0SHViQ29udGVudFJlc3BvbnNlIHwgR2l0SHViQ29udGVudFJlc3BvbnNlW10+KFxuICAgICAgICBcIkdFVFwiLFxuICAgICAgICB0aGlzLmJ1aWxkQ29udGVudEFwaVBhdGgocmVtb3RlUGF0aCksXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgeyByZWY6IHRoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKSB9XG4gICAgICApO1xuXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShyZXN1bHQpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1OEZEQ1x1N0FFRlx1OERFRlx1NUY4NFx1NjMwN1x1NTQxMVx1NzZFRVx1NUY1NVx1RkYwQ1x1NEUwRFx1ODBGRFx1NEY1Q1x1NEUzQVx1NjU4N1x1N0FFMFx1NTQwQ1x1NkI2NVx1NzZFRVx1NjgwN1x1MzAwMlwiKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlc3VsdC50eXBlICE9PSBcImZpbGVcIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdThGRENcdTdBRUZcdThERUZcdTVGODRcdTRFMERcdTY2MkZcdTY2NkVcdTkwMUFcdTY1ODdcdTRFRjZcdUZGMENcdTRFMERcdTgwRkRcdTRGNUNcdTRFM0FcdTY1ODdcdTdBRTBcdTU0MENcdTZCNjVcdTc2RUVcdTY4MDdcdTMwMDJcIik7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEdpdEh1YlJlcXVlc3RFcnJvciAmJiBlcnJvci5zdGF0dXMgPT09IDQwNCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZ2V0UmVtb3RlRmlsZUJ5dGVzKHJlbW90ZVBhdGg6IHN0cmluZyk6IFByb21pc2U8eyBjb250ZW50OiBVaW50OEFycmF5OyByZW1vdGU6IEdpdEh1YkNvbnRlbnRSZXNwb25zZSB9PiB7XG4gICAgY29uc3QgcmVtb3RlID0gYXdhaXQgdGhpcy5nZXRSZW1vdGVDb250ZW50KHJlbW90ZVBhdGgpO1xuXG4gICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgXHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHU0RTBEXHU1QjU4XHU1NzI4XHVGRjFBJHtyZW1vdGVQYXRofWApO1xuICAgIH1cblxuICAgIGlmIChyZW1vdGUuZW5jb2RpbmcgIT09IFwiYmFzZTY0XCIgfHwgIXJlbW90ZS5jb250ZW50KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFx1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlx1NTE4NVx1NUJCOVx1N0YxNlx1NzgwMVx1NEUwRFx1NTNEN1x1NjUyRlx1NjMwMVx1RkYxQSR7cmVtb3RlUGF0aH1gKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgY29udGVudDogZGVjb2RlQmFzZTY0Qnl0ZXMocmVtb3RlLmNvbnRlbnQpLFxuICAgICAgcmVtb3RlXG4gICAgfTtcbiAgfVxuXG4gIGFzeW5jIHB1bGxSZW1vdGVGaWxlKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIHRoaXMudmFsaWRhdGVDb25maWcoKTtcblxuICAgIGNvbnN0IHsgY29udGVudCwgcmVtb3RlIH0gPSBhd2FpdCB0aGlzLmdldFJlbW90ZUZpbGVCeXRlcyhyZW1vdGVQYXRoKTtcbiAgICBjb25zdCBsb2NhbFBhdGggPSB0aGlzLmxvY2FsUGF0aEZyb21SZW1vdGVQYXRoKHJlbW90ZVBhdGgpO1xuICAgIGNvbnN0IHBhcmVudFBhdGggPSBsb2NhbFBhdGguaW5jbHVkZXMoXCIvXCIpID8gbG9jYWxQYXRoLnNsaWNlKDAsIGxvY2FsUGF0aC5sYXN0SW5kZXhPZihcIi9cIikpIDogXCJcIjtcbiAgICBhd2FpdCB0aGlzLmVuc3VyZUZvbGRlclBhdGgocGFyZW50UGF0aCk7XG5cbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChsb2NhbFBhdGgpO1xuICAgIGNvbnN0IGlzTWFya2Rvd24gPSBsb2NhbFBhdGgudG9Mb3dlckNhc2UoKS5lbmRzV2l0aChcIi5tZFwiKTtcbiAgICBjb25zdCB0ZXh0Q29udGVudCA9IGlzTWFya2Rvd24gPyBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoY29udGVudCkgOiBcIlwiO1xuICAgIGxldCBmaWxlOiBURmlsZTtcblxuICAgIGlmIChleGlzdGluZyBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICBpZiAoaXNNYXJrZG93bikge1xuICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZXhpc3RpbmcsIHRleHRDb250ZW50KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeUJpbmFyeShleGlzdGluZywgY29udGVudC5idWZmZXIuc2xpY2UoY29udGVudC5ieXRlT2Zmc2V0LCBjb250ZW50LmJ5dGVPZmZzZXQgKyBjb250ZW50LmJ5dGVMZW5ndGgpKTtcbiAgICAgIH1cbiAgICAgIGZpbGUgPSBleGlzdGluZztcbiAgICB9IGVsc2UgaWYgKGV4aXN0aW5nKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFx1NjVFMFx1NkNENVx1NjJDOVx1NTNENlx1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlx1RkYwQ1x1NjcyQ1x1NTczMFx1OERFRlx1NUY4NFx1NURGMlx1ODhBQlx1NzZFRVx1NUY1NVx1NTM2MFx1NzUyOFx1RkYxQSR7bG9jYWxQYXRofWApO1xuICAgIH0gZWxzZSBpZiAoaXNNYXJrZG93bikge1xuICAgICAgZmlsZSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZShsb2NhbFBhdGgsIHRleHRDb250ZW50KTtcbiAgICB9IGVsc2Uge1xuICAgICAgZmlsZSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZUJpbmFyeShsb2NhbFBhdGgsIGNvbnRlbnQuYnVmZmVyLnNsaWNlKGNvbnRlbnQuYnl0ZU9mZnNldCwgY29udGVudC5ieXRlT2Zmc2V0ICsgY29udGVudC5ieXRlTGVuZ3RoKSk7XG4gICAgfVxuXG4gICAgdGhpcy5kYXRhLmZpbGVzW2ZpbGUucGF0aF0gPSB7XG4gICAgICByZW1vdGVQYXRoLFxuICAgICAgc2hhOiByZW1vdGUuc2hhLFxuICAgICAgc3RhdHVzOiBcInN5bmNlZFwiLFxuICAgICAgbGFzdFN5bmNlZEF0OiBmb3JtYXREYXRlVGltZShuZXcgRGF0ZSgpKSxcbiAgICAgIGxhc3RTeW5jZWRIYXNoOiBpc01hcmtkb3duID8gaGFzaENvbnRlbnQodGV4dENvbnRlbnQpIDogaGFzaEJ5dGVzKGNvbnRlbnQuYnVmZmVyLnNsaWNlKGNvbnRlbnQuYnl0ZU9mZnNldCwgY29udGVudC5ieXRlT2Zmc2V0ICsgY29udGVudC5ieXRlTGVuZ3RoKSksXG4gICAgICBodG1sVXJsOiByZW1vdGUuaHRtbF91cmwgPz8gdGhpcy5idWlsZEdpdEh1YkJsb2JVcmwocmVtb3RlUGF0aClcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMuc2F2ZUFsbERhdGEoKTtcbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hTdGF0dXNCYXIoKTtcbiAgfVxuXG4gIGNvbGxlY3RTeW5jYWJsZUZpbGVzKGZvbGRlcjogVEZvbGRlciwgZmlsZXM6IFRGaWxlW10gPSBbXSk6IFRGaWxlW10ge1xuICAgIGZvbGRlci5jaGlsZHJlbi5mb3JFYWNoKChlbnRyeSkgPT4ge1xuICAgICAgaWYgKGVudHJ5IGluc3RhbmNlb2YgVEZpbGUgJiYgaXNTeW5jYWJsZUZpbGUoZW50cnkpKSB7XG4gICAgICAgIGZpbGVzLnB1c2goZW50cnkpO1xuICAgICAgfSBlbHNlIGlmIChlbnRyeSBpbnN0YW5jZW9mIFRGb2xkZXIpIHtcbiAgICAgICAgdGhpcy5jb2xsZWN0U3luY2FibGVGaWxlcyhlbnRyeSwgZmlsZXMpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGZpbGVzO1xuICB9XG5cbiAgZ2V0TG9jYWxTeW5jYWJsZUZpbGVzKCk6IFRGaWxlW10ge1xuICAgIGNvbnN0IHJvb3QgPSB0aGlzLmdldEV4aXN0aW5nRm9sZGVyKHRoaXMuc2V0dGluZ3MubG9jYWxSb290UGF0aCk7XG4gICAgaWYgKCFyb290KSB7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuY29sbGVjdFN5bmNhYmxlRmlsZXMocm9vdClcbiAgICAgIC5maWx0ZXIoKGZpbGUpID0+IHRoaXMuaXNJbnNpZGVSb290KGZpbGUpKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEucGF0aC5sb2NhbGVDb21wYXJlKGIucGF0aCwgXCJ6aC1DTlwiKSk7XG4gIH1cblxuICBhc3luYyBnZXRSZW1vdGVTeW5jYWJsZUZpbGVzKCk6IFByb21pc2U8TWFwPHN0cmluZywgUmVtb3RlU3luY0ZpbGU+PiB7XG4gICAgdGhpcy52YWxpZGF0ZUNvbmZpZygpO1xuXG4gICAgY29uc3QgdHJlZSA9IGF3YWl0IHRoaXMuZ2l0aHViUmVxdWVzdDxHaXRIdWJUcmVlUmVzcG9uc2U+KFwiR0VUXCIsIHRoaXMuYnVpbGRHaXRUcmVlQXBpUGF0aCgpLCB1bmRlZmluZWQsIHtcbiAgICAgIHJlY3Vyc2l2ZTogXCIxXCJcbiAgICB9KTtcblxuICAgIGlmICh0cmVlLnRydW5jYXRlZCkge1xuICAgICAgbmV3IE5vdGljZShcIkdpdEh1YiBcdThGRDRcdTU2REVcdTc2ODRcdThGRENcdTdBRUZcdTc2RUVcdTVGNTVcdTY4MTFcdTg4QUJcdTYyMkFcdTY1QURcdUZGMENcdTUyMTdcdTg4NjhcdTUzRUZcdTgwRkRcdTRFMERcdTVCOENcdTY1NzRcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgY29uc3QgcmVtb3RlRmlsZXMgPSBuZXcgTWFwPHN0cmluZywgUmVtb3RlU3luY0ZpbGU+KCk7XG5cbiAgICB0cmVlLnRyZWUuZm9yRWFjaCgoZW50cnkpID0+IHtcbiAgICAgIGNvbnN0IGZpbGVOYW1lID0gZW50cnkucGF0aC5zcGxpdChcIi9cIikucG9wKCkgPz8gXCJcIjtcbiAgICAgIGlmIChlbnRyeS50eXBlICE9PSBcImJsb2JcIiB8fCAhZW50cnkucGF0aC5zdGFydHNXaXRoKGAke1JFTU9URV9DT05URU5UX1JPT1R9L2ApIHx8IGZpbGVOYW1lLnN0YXJ0c1dpdGgoXCIuXCIpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKCFpc1NhZmVDb250ZW50UGF0aChlbnRyeS5wYXRoKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHJlbW90ZUZpbGVzLnNldChlbnRyeS5wYXRoLCB7XG4gICAgICAgIHJlbW90ZVBhdGg6IGVudHJ5LnBhdGgsXG4gICAgICAgIHNoYTogZW50cnkuc2hhLFxuICAgICAgICBodG1sVXJsOiB0aGlzLmJ1aWxkR2l0SHViQmxvYlVybChlbnRyeS5wYXRoKVxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcmVtb3RlRmlsZXM7XG4gIH1cblxuICBhc3luYyBidWlsZFN5bmNDZW50ZXJJdGVtcygpOiBQcm9taXNlPFN5bmNDZW50ZXJJdGVtW10+IHtcbiAgICB0aGlzLnZhbGlkYXRlQ29uZmlnKCk7XG5cbiAgICBjb25zdCBbcmVtb3RlRmlsZXMsIGxvY2FsRmlsZXNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgdGhpcy5nZXRSZW1vdGVTeW5jYWJsZUZpbGVzKCksXG4gICAgICBQcm9taXNlLnJlc29sdmUodGhpcy5nZXRMb2NhbFN5bmNhYmxlRmlsZXMoKSlcbiAgICBdKTtcbiAgICBjb25zdCBpdGVtczogU3luY0NlbnRlckl0ZW1bXSA9IFtdO1xuICAgIGNvbnN0IHNlZW5SZW1vdGVQYXRocyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG4gICAgZm9yIChjb25zdCBmaWxlIG9mIGxvY2FsRmlsZXMpIHtcbiAgICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLnJlbW90ZVBhdGgoZmlsZSk7XG4gICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVGaWxlcy5nZXQocmVtb3RlUGF0aCk7XG4gICAgICBjb25zdCBzdGF0ZSA9IHRoaXMuZ2V0U3RhdGUoZmlsZSk7XG4gICAgICBjb25zdCB0ZXh0Q29udGVudCA9IGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIgPyBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpIDogXCJcIjtcbiAgICAgIGNvbnN0IGJpbmFyeUNvbnRlbnQgPSBmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiID8gdGV4dEJ5dGVzKHRleHRDb250ZW50KS5idWZmZXIgOiBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgICAgY29uc3QgY3VycmVudEhhc2ggPSBmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiID8gaGFzaENvbnRlbnQodGV4dENvbnRlbnQpIDogaGFzaEJ5dGVzKGJpbmFyeUNvbnRlbnQpO1xuICAgICAgY29uc3QgY3VycmVudEJsb2JTaGEgPSBhd2FpdCBnaXRCbG9iU2hhKGJpbmFyeUNvbnRlbnQpO1xuICAgICAgbGV0IHN0YXR1czogU3luY0NlbnRlclN0YXR1cztcblxuICAgICAgc2VlblJlbW90ZVBhdGhzLmFkZChyZW1vdGVQYXRoKTtcblxuICAgICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgICAgc3RhdHVzID0gXCJ1bnB1Ymxpc2hlZFwiO1xuICAgICAgfSBlbHNlIGlmIChyZW1vdGUuc2hhID09PSBjdXJyZW50QmxvYlNoYSkge1xuICAgICAgICBzdGF0dXMgPSBcInB1Ymxpc2hlZFwiO1xuICAgICAgfSBlbHNlIGlmIChzdGF0ZS5zaGEgPT09IGN1cnJlbnRCbG9iU2hhICYmIHN0YXRlLnN0YXR1cyA9PT0gXCJzeW5jZWRcIikge1xuICAgICAgICBzdGF0dXMgPSBcInB1Ymxpc2hlZFwiO1xuICAgICAgfSBlbHNlIGlmIChzdGF0ZS5sYXN0U3luY2VkSGFzaCAmJiBzdGF0ZS5sYXN0U3luY2VkSGFzaCA9PT0gY3VycmVudEhhc2ggJiYgc3RhdGUuc2hhID09PSByZW1vdGUuc2hhKSB7XG4gICAgICAgIHN0YXR1cyA9IFwicHVibGlzaGVkXCI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdGF0dXMgPSBcIm1vZGlmaWVkXCI7XG4gICAgICB9XG5cbiAgICAgIGl0ZW1zLnB1c2goe1xuICAgICAgICBpZDogYGxvY2FsOiR7ZmlsZS5wYXRofWAsXG4gICAgICAgIG5hbWU6IGZpbGUubmFtZSxcbiAgICAgICAgc3RhdHVzLFxuICAgICAgICBsb2NhbFBhdGg6IGZpbGUucGF0aCxcbiAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgZm9sZGVyUGF0aDogcmVtb3RlUGF0aC5zbGljZSgwLCBNYXRoLm1heChyZW1vdGVQYXRoLmxhc3RJbmRleE9mKFwiL1wiKSwgUkVNT1RFX0NPTlRFTlRfUk9PVC5sZW5ndGgpKSxcbiAgICAgICAgZmlsZSxcbiAgICAgICAgcmVtb3RlLFxuICAgICAgICBzdGF0ZVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmVtb3RlRmlsZXMuZm9yRWFjaCgocmVtb3RlLCByZW1vdGVQYXRoKSA9PiB7XG4gICAgICBpZiAoc2VlblJlbW90ZVBhdGhzLmhhcyhyZW1vdGVQYXRoKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5hbWUgPSByZW1vdGVQYXRoLnNwbGl0KFwiL1wiKS5wb3AoKSA/PyByZW1vdGVQYXRoO1xuICAgICAgaXRlbXMucHVzaCh7XG4gICAgICAgIGlkOiBgcmVtb3RlOiR7cmVtb3RlUGF0aH1gLFxuICAgICAgICBuYW1lLFxuICAgICAgICBzdGF0dXM6IFwibG9jYWxEZWxldGVkXCIsXG4gICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIGZvbGRlclBhdGg6IHJlbW90ZVBhdGguc2xpY2UoMCwgTWF0aC5tYXgocmVtb3RlUGF0aC5sYXN0SW5kZXhPZihcIi9cIiksIFJFTU9URV9DT05URU5UX1JPT1QubGVuZ3RoKSksXG4gICAgICAgIHJlbW90ZVxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gaXRlbXMuc29ydCgoYSwgYikgPT4ge1xuICAgICAgY29uc3Qgc3RhdHVzT3JkZXI6IFJlY29yZDxTeW5jQ2VudGVyU3RhdHVzLCBudW1iZXI+ID0ge1xuICAgICAgICB1bnB1Ymxpc2hlZDogMCxcbiAgICAgICAgbW9kaWZpZWQ6IDEsXG4gICAgICAgIHB1Ymxpc2hlZDogMixcbiAgICAgICAgbG9jYWxEZWxldGVkOiAzXG4gICAgICB9O1xuXG4gICAgICByZXR1cm4gc3RhdHVzT3JkZXJbYS5zdGF0dXNdIC0gc3RhdHVzT3JkZXJbYi5zdGF0dXNdIHx8IGEucmVtb3RlUGF0aC5sb2NhbGVDb21wYXJlKGIucmVtb3RlUGF0aCwgXCJ6aC1DTlwiKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZVJlbW90ZVBhdGgocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgdGhpcy52YWxpZGF0ZUNvbmZpZygpO1xuXG4gICAgaWYgKCFpc1NhZmVDb250ZW50UGF0aChyZW1vdGVQYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4RkRDXHU3QUVGXHU4REVGXHU1Rjg0XHU1RkM1XHU5ODdCXHU0RjREXHU0RThFXHU0RUQzXHU1RTkzIGNvbnRlbnQgXHU3NkVFXHU1RjU1XHU1MTg1XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuZ2V0UmVtb3RlQ29udGVudChyZW1vdGVQYXRoKTtcbiAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgbmV3IE5vdGljZShgXHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHU0RTBEXHU1QjU4XHU1NzI4XHVGRjFBJHtyZW1vdGVQYXRofWApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuZ2l0aHViUmVxdWVzdDxHaXRIdWJEZWxldGVSZXNwb25zZT4oXCJERUxFVEVcIiwgdGhpcy5idWlsZENvbnRlbnRBcGlQYXRoKHJlbW90ZVBhdGgpLCB7XG4gICAgICBtZXNzYWdlOiBgc3luYzogZGVsZXRlICR7cmVtb3RlUGF0aH1gLFxuICAgICAgc2hhOiByZW1vdGUuc2hhLFxuICAgICAgYnJhbmNoOiB0aGlzLnNldHRpbmdzLmJyYW5jaC50cmltKClcbiAgICB9KTtcblxuICAgIE9iamVjdC5lbnRyaWVzKHRoaXMuZGF0YS5maWxlcykuZm9yRWFjaCgoW2xvY2FsUGF0aCwgc3RhdGVdKSA9PiB7XG4gICAgICBpZiAoc3RhdGUucmVtb3RlUGF0aCA9PT0gcmVtb3RlUGF0aCkge1xuICAgICAgICB0aGlzLmRhdGEuZmlsZXNbbG9jYWxQYXRoXSA9IHtcbiAgICAgICAgICAuLi5zdGF0ZSxcbiAgICAgICAgICBzaGE6IHVuZGVmaW5lZCxcbiAgICAgICAgICBodG1sVXJsOiB1bmRlZmluZWQsXG4gICAgICAgICAgc3RhdHVzOiBcImRlbGV0ZWRcIlxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIGF3YWl0IHRoaXMuc2F2ZUFsbERhdGEoKTtcbiAgfVxuXG4gIGFzeW5jIHN5bmNGaWxlU3RhdGUoZmlsZTogVEZpbGUpOiBQcm9taXNlPExvY2FsRmlsZVN0YXRlPiB7XG4gICAgaWYgKCF0aGlzLmlzSW5zaWRlUm9vdChmaWxlKSkge1xuICAgICAgcmV0dXJuIHsgc3RhdHVzOiBcImRyYWZ0XCIgfTtcbiAgICB9XG5cbiAgICB0aGlzLnZhbGlkYXRlQ29uZmlnKCk7XG5cbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5yZW1vdGVQYXRoKGZpbGUpO1xuICAgIGNvbnN0IGN1cnJlbnQgPSB0aGlzLmdldFN0YXRlKGZpbGUpO1xuICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuZ2V0UmVtb3RlQ29udGVudChyZW1vdGVQYXRoKTtcblxuICAgIGlmICghcmVtb3RlKSB7XG4gICAgICBjb25zdCBuZXh0U3RhdGU6IExvY2FsRmlsZVN0YXRlID0gY3VycmVudC5zaGFcbiAgICAgICAgPyB7XG4gICAgICAgICAgICAuLi5jdXJyZW50LFxuICAgICAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgICAgIHNoYTogdW5kZWZpbmVkLFxuICAgICAgICAgICAgaHRtbFVybDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgc3RhdHVzOiBcImRlbGV0ZWRcIlxuICAgICAgICAgIH1cbiAgICAgICAgOiB7IHJlbW90ZVBhdGgsIHN0YXR1czogXCJkcmFmdFwiIH07XG5cbiAgICAgIHRoaXMuZGF0YS5maWxlc1tmaWxlLnBhdGhdID0gbmV4dFN0YXRlO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlQWxsRGF0YSgpO1xuICAgICAgcmV0dXJuIG5leHRTdGF0ZTtcbiAgICB9XG5cbiAgICBjb25zdCBuZXh0U3RhdGU6IExvY2FsRmlsZVN0YXRlID0ge1xuICAgICAgLi4uY3VycmVudCxcbiAgICAgIHJlbW90ZVBhdGgsXG4gICAgICBzaGE6IHJlbW90ZS5zaGEsXG4gICAgICBodG1sVXJsOiByZW1vdGUuaHRtbF91cmwgPz8gdGhpcy5idWlsZEdpdEh1YkJsb2JVcmwocmVtb3RlUGF0aCksXG4gICAgICBzdGF0dXM6IFwic3luY2VkXCJcbiAgICB9O1xuXG4gICAgaWYgKGN1cnJlbnQuc2hhICE9PSByZW1vdGUuc2hhKSB7XG4gICAgICBuZXh0U3RhdGUubGFzdFN5bmNlZEhhc2ggPSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgdGhpcy5kYXRhLmZpbGVzW2ZpbGUucGF0aF0gPSBuZXh0U3RhdGU7XG4gICAgYXdhaXQgdGhpcy5zYXZlQWxsRGF0YSgpO1xuICAgIHJldHVybiBuZXh0U3RhdGU7XG4gIH1cblxuICBhc3luYyB0ZXN0Q29ubmVjdGlvbigpOiBQcm9taXNlPENvbm5lY3Rpb25TdGF0ZT4ge1xuICAgIHRyeSB7XG4gICAgICB0aGlzLnZhbGlkYXRlQ29uZmlnKCk7XG4gICAgICBjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5nZXRSZXBvc2l0b3J5KCk7XG4gICAgICBjb25zdCB1c2VyID0gYXdhaXQgdGhpcy5naXRodWJSZXF1ZXN0PEdpdEh1YlVzZXJSZXNwb25zZT4oXCJHRVRcIiwgXCIvdXNlclwiKTtcblxuICAgICAgY29uc3QgcmVwbyA9IGF3YWl0IHRoaXMuZ2l0aHViUmVxdWVzdDxHaXRIdWJSZXBvUmVzcG9uc2U+KFwiR0VUXCIsIHRoaXMuYnVpbGRSZXBvQXBpUGF0aCgpKTtcbiAgICAgIGF3YWl0IHRoaXMuZ2l0aHViUmVxdWVzdDx1bmtub3duPihcIkdFVFwiLCB0aGlzLmJ1aWxkQnJhbmNoQXBpUGF0aCgpKTtcblxuICAgICAgaWYgKHVzZXIubG9naW4udG9Mb3dlckNhc2UoKSAhPT0gdGhpcy5zZXR0aW5ncy5naXRodWJVc2VybmFtZS50cmltKCkudG9Mb3dlckNhc2UoKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRva2VuIFx1NzUyOFx1NjIzN1x1NEUzQSAke3VzZXIubG9naW59XHVGRjBDXHU0RTBFXHU5MTREXHU3RjZFXHU3Njg0IEdpdEh1YiBVc2VybmFtZSBcdTRFMERcdTRFMDBcdTgxRjRcdTMwMDJgKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFyZXBvLnBlcm1pc3Npb25zPy5hZG1pbiAmJiAhcmVwby5wZXJtaXNzaW9ucz8ubWFpbnRhaW4gJiYgIXJlcG8ucGVybWlzc2lvbnM/LnB1c2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIGBUb2tlbiBcdTVCRjkgJHtyZXBvLmZ1bGxfbmFtZX0gXHU2Q0ExXHU2NzA5XHU1MTk5XHU2NzQzXHU5NjUwXHUzMDAyXHU4QkY3XHU3ODZFXHU4QkE0IEZpbmUtZ3JhaW5lZCB0b2tlbiBcdTVERjJcdTYzODhcdTY3NDNcdThCRTVcdTRFRDNcdTVFOTNcdUZGMENcdTVFNzZcdTVDMDYgQ29udGVudHMgXHU4QkJFXHU3RjZFXHU0RTNBIFJlYWQgYW5kIHdyaXRlXHUzMDAyYFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzdGF0ZTogQ29ubmVjdGlvblN0YXRlID0ge1xuICAgICAgICBzdGF0dXM6IFwic3VjY2Vzc1wiLFxuICAgICAgICBtZXNzYWdlOiBgXHU4RkRFXHU2M0E1XHU2MjEwXHU1MjlGXHVGRjFBJHtyZXBvc2l0b3J5Lm93bmVyfS8ke3JlcG9zaXRvcnkucmVwb31AJHt0aGlzLnNldHRpbmdzLmJyYW5jaC50cmltKCl9YCxcbiAgICAgICAgY2hlY2tlZEF0OiBmb3JtYXREYXRlVGltZShuZXcgRGF0ZSgpKVxuICAgICAgfTtcbiAgICAgIHRoaXMuZGF0YS5jb25uZWN0aW9uID0gc3RhdGU7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gICAgICBuZXcgTm90aWNlKHN0YXRlLm1lc3NhZ2UpO1xuICAgICAgcmV0dXJuIHN0YXRlO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIlx1OEZERVx1NjNBNVx1NTkzMVx1OEQyNVwiO1xuICAgICAgY29uc3Qgc3RhdGU6IENvbm5lY3Rpb25TdGF0ZSA9IHtcbiAgICAgICAgc3RhdHVzOiBcImZhaWxlZFwiLFxuICAgICAgICBtZXNzYWdlLFxuICAgICAgICBjaGVja2VkQXQ6IGZvcm1hdERhdGVUaW1lKG5ldyBEYXRlKCkpXG4gICAgICB9O1xuICAgICAgdGhpcy5kYXRhLmNvbm5lY3Rpb24gPSBzdGF0ZTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZUFsbERhdGEoKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHN5bmNGaWxlVG9HaXRIdWIoZmlsZTogVEZpbGUpOiBQcm9taXNlPExvY2FsRmlsZVN0YXRlPiB7XG4gICAgdGhpcy52YWxpZGF0ZUNvbmZpZygpO1xuXG4gICAgaWYgKCF0aGlzLmlzSW5zaWRlUm9vdChmaWxlKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU1RjUzXHU1MjREXHU2NTg3XHU3QUUwXHU0RTBEXHU1NzI4IExvY2FsIFJvb3QgUGF0aCBcdTUxODVcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgY29uc3QgaXNNYXJrZG93biA9IGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCI7XG4gICAgY29uc3QgY29udGVudCA9IGlzTWFya2Rvd24gPyBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpIDogXCJcIjtcbiAgICBjb25zdCBiaW5hcnlDb250ZW50ID0gaXNNYXJrZG93biA/IHRleHRCeXRlcyhjb250ZW50KS5idWZmZXIgOiBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgIGNvbnN0IGN1cnJlbnRIYXNoID0gaXNNYXJrZG93biA/IGhhc2hDb250ZW50KGNvbnRlbnQpIDogaGFzaEJ5dGVzKGJpbmFyeUNvbnRlbnQpO1xuICAgIGNvbnN0IGN1cnJlbnRCbG9iU2hhID0gYXdhaXQgZ2l0QmxvYlNoYShiaW5hcnlDb250ZW50KTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5yZW1vdGVQYXRoKGZpbGUpO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHRoaXMuZ2V0U3RhdGUoZmlsZSk7XG4gICAgICBjb25zdCBjYWNoZWRTaGEgPSBjdXJyZW50U3RhdGUucmVtb3RlUGF0aCA9PT0gcmVtb3RlUGF0aCA/IGN1cnJlbnRTdGF0ZS5zaGEgOiB1bmRlZmluZWQ7XG4gICAgICBsZXQgcmVzb2x2ZWRSZW1vdGU6IEdpdEh1YkNvbnRlbnRSZXNwb25zZSB8IG51bGwgPSBudWxsO1xuXG4gICAgICBjb25zdCBwdXRDb250ZW50ID0gKHNoYT86IHN0cmluZykgPT5cbiAgICAgICAgdGhpcy5naXRodWJSZXF1ZXN0PEdpdEh1YlB1dFJlc3BvbnNlPihcIlBVVFwiLCB0aGlzLmJ1aWxkQ29udGVudEFwaVBhdGgocmVtb3RlUGF0aCksIHtcbiAgICAgICAgICBtZXNzYWdlOiBgJHtzaGEgPyBcInN5bmM6IHVwZGF0ZVwiIDogXCJzeW5jOiBhZGRcIn0gJHtyZW1vdGVQYXRofWAsXG4gICAgICAgICAgY29udGVudDogaXNNYXJrZG93biA/IGVuY29kZUJhc2U2NChjb250ZW50KSA6IGVuY29kZUJ5dGVzQmFzZTY0KG5ldyBVaW50OEFycmF5KGJpbmFyeUNvbnRlbnQpKSxcbiAgICAgICAgICBicmFuY2g6IHRoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKSxcbiAgICAgICAgICAuLi4oc2hhID8geyBzaGEgfSA6IHt9KVxuICAgICAgICB9KTtcblxuICAgICAgbGV0IHJlc3VsdDogR2l0SHViUHV0UmVzcG9uc2U7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHB1dENvbnRlbnQoY2FjaGVkU2hhKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEdpdEh1YlJlcXVlc3RFcnJvciAmJiAoZXJyb3Iuc3RhdHVzID09PSA0MDkgfHwgZXJyb3Iuc3RhdHVzID09PSA0MjIpKSB7XG4gICAgICAgICAgcmVzb2x2ZWRSZW1vdGUgPSBhd2FpdCB0aGlzLmdldFJlbW90ZUNvbnRlbnQocmVtb3RlUGF0aCk7XG4gICAgICAgICAgcmVzdWx0ID0gYXdhaXQgcHV0Q29udGVudChyZXNvbHZlZFJlbW90ZT8uc2hhKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBuZXh0U2hhID0gcmVzdWx0LmNvbnRlbnQ/LnNoYSA/PyBjdXJyZW50QmxvYlNoYSA/PyByZXNvbHZlZFJlbW90ZT8uc2hhID8/IGNhY2hlZFNoYTtcbiAgICAgIGNvbnN0IGh0bWxVcmwgPSByZXN1bHQuY29udGVudD8uaHRtbF91cmwgPz8gdGhpcy5idWlsZEdpdEh1YkJsb2JVcmwocmVtb3RlUGF0aCk7XG5cbiAgICAgIGNvbnN0IG5leHRTdGF0ZTogTG9jYWxGaWxlU3RhdGUgPSB7XG4gICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIHNoYTogbmV4dFNoYSxcbiAgICAgICAgc3RhdHVzOiBcInN5bmNlZFwiLFxuICAgICAgICBsYXN0U3luY2VkQXQ6IGZvcm1hdERhdGVUaW1lKG5ldyBEYXRlKCkpLFxuICAgICAgICBsYXN0U3luY2VkSGFzaDogY3VycmVudEhhc2gsXG4gICAgICAgIGh0bWxVcmxcbiAgICAgIH07XG5cbiAgICAgIGF3YWl0IHRoaXMuc2V0U3RhdGUoZmlsZSwgbmV4dFN0YXRlKTtcblxuICAgICAgbmV3IE5vdGljZShgXHU1NDBDXHU2QjY1XHU2MjEwXHU1MjlGXHVGRjFBJHtyZW1vdGVQYXRofWApO1xuICAgICAgcmV0dXJuIG5leHRTdGF0ZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgYXdhaXQgdGhpcy5zZXRTdGF0ZShmaWxlLCB7IHJlbW90ZVBhdGgsIHN0YXR1czogXCJmYWlsZWRcIiB9KTtcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEdpdEh1YlJlcXVlc3RFcnJvciAmJiBlcnJvci5zdGF0dXMgPT09IDQwNCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYEdpdEh1YiBcdTUxOTlcdTUxNjVcdThGRDRcdTU2REUgNDA0XHVGRjFBJHtyZW1vdGVQYXRofVx1MzAwMlx1OTAxQVx1NUUzOFx1NjYyRiBUb2tlbiBcdTZDQTFcdTY3MDlcdTYzODhcdTY3NDNcdTVGNTNcdTUyNERcdTRFRDNcdTVFOTNcdTMwMDFSZXBvc2l0b3J5IFVSTCBcdTRFMERcdTY2MkZcdTc2RUVcdTY4MDdcdTUzNUFcdTVCQTJcdTRFRDNcdTVFOTNcdUZGMENcdTYyMTZcdTUyMDZcdTY1MkYgJHt0aGlzLnNldHRpbmdzLmJyYW5jaC50cmltKCl9IFx1NEUwRFx1NTNFRlx1NTE5OVx1MzAwMlx1OEJGN1x1Nzg2RVx1OEJBNCB0b2tlbiBcdTc2ODQgUmVwb3NpdG9yeSBhY2Nlc3MgXHU1MzA1XHU1NDJCXHU4QkU1XHU0RUQzXHU1RTkzXHVGRjBDXHU0RTE0IENvbnRlbnRzIFx1NEUzQSBSZWFkIGFuZCB3cml0ZVx1MzAwMmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHN5bmNDdXJyZW50Tm90ZSgpIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5nZXRDdXJyZW50RmlsZSgpO1xuXG4gICAgaWYgKCFmaWxlKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdTVGNTNcdTUyNERcdTZDQTFcdTY3MDlcdTZGQzBcdTZEM0JcdTc2ODQgTWFya2Rvd24gXHU2NTg3XHU0RUY2XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuc3luY0ZpbGVUb0dpdEh1YihmaWxlKTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZVJlbW90ZUZpbGUoZmlsZTogVEZpbGUpIHtcbiAgICB0aGlzLnZhbGlkYXRlQ29uZmlnKCk7XG5cbiAgICBpZiAoIXRoaXMuaXNJbnNpZGVSb290KGZpbGUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdTVGNTNcdTUyNERcdTY1ODdcdTdBRTBcdTRFMERcdTU3MjggTG9jYWwgUm9vdCBQYXRoIFx1NTE4NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5yZW1vdGVQYXRoKGZpbGUpO1xuICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuZ2V0UmVtb3RlQ29udGVudChyZW1vdGVQYXRoKTtcblxuICAgIGlmICghcmVtb3RlKSB7XG4gICAgICBhd2FpdCB0aGlzLnNldFN0YXRlKGZpbGUsIHtcbiAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgc2hhOiB1bmRlZmluZWQsXG4gICAgICAgIGh0bWxVcmw6IHVuZGVmaW5lZCxcbiAgICAgICAgc3RhdHVzOiBcImRlbGV0ZWRcIlxuICAgICAgfSk7XG4gICAgICBuZXcgTm90aWNlKFwiXHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHU0RTBEXHU1QjU4XHU1NzI4XHUzMDAyXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuZ2l0aHViUmVxdWVzdDxHaXRIdWJEZWxldGVSZXNwb25zZT4oXCJERUxFVEVcIiwgdGhpcy5idWlsZENvbnRlbnRBcGlQYXRoKHJlbW90ZVBhdGgpLCB7XG4gICAgICBtZXNzYWdlOiBgc3luYzogZGVsZXRlICR7cmVtb3RlUGF0aH1gLFxuICAgICAgc2hhOiByZW1vdGUuc2hhLFxuICAgICAgYnJhbmNoOiB0aGlzLnNldHRpbmdzLmJyYW5jaC50cmltKClcbiAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuc2V0U3RhdGUoZmlsZSwge1xuICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIHNoYTogdW5kZWZpbmVkLFxuICAgICAgaHRtbFVybDogdW5kZWZpbmVkLFxuICAgICAgc3RhdHVzOiBcImRlbGV0ZWRcIlxuICAgIH0pO1xuICAgIG5ldyBOb3RpY2UoXCJcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcdTVERjJcdTUyMjBcdTk2NjRcdTMwMDJcIik7XG4gIH1cblxuICBhc3luYyBkZWxldGVDdXJyZW50UmVtb3RlTm90ZSgpIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5nZXRDdXJyZW50RmlsZSgpO1xuXG4gICAgaWYgKCFmaWxlKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdTVGNTNcdTUyNERcdTZDQTFcdTY3MDlcdTZGQzBcdTZEM0JcdTc2ODQgTWFya2Rvd24gXHU2NTg3XHU0RUY2XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlRmlsZShmaWxlKTtcbiAgfVxuXG4gIGFzeW5jIG9wZW5SZW1vdGVVcmxGb3JGaWxlKGZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3Qgc3RhdGUgPSBhd2FpdCB0aGlzLmdldEVmZmVjdGl2ZVN0YXRlKGZpbGUpO1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSBzdGF0ZS5yZW1vdGVQYXRoID8/IHRoaXMucmVtb3RlUGF0aChmaWxlKTtcblxuICAgIGlmIChzdGF0ZS5zdGF0dXMgPT09IFwiZGVsZXRlZFwiKSB7XG4gICAgICBuZXcgTm90aWNlKFwiXHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHU1REYyXHU3RUNGXHU1MjIwXHU5NjY0XHUzMDAyXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHdpbmRvdy5vcGVuKHN0YXRlLmh0bWxVcmwgPz8gdGhpcy5idWlsZEdpdEh1YkJsb2JVcmwocmVtb3RlUGF0aCksIFwiX2JsYW5rXCIpO1xuICB9XG5cbiAgYXN5bmMgb3BlblJlbW90ZVVybCgpIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5nZXRDdXJyZW50RmlsZSgpO1xuICAgIGlmICghZmlsZSkge1xuICAgICAgbmV3IE5vdGljZShcIlx1NUY1M1x1NTI0RFx1NkNBMVx1NjcwOVx1NkZDMFx1NkQzQlx1NjU4N1x1NEVGNlx1MzAwMlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLm9wZW5SZW1vdGVVcmxGb3JGaWxlKGZpbGUpO1xuICB9XG59XG5cbmNsYXNzIFN5bmNDZW50ZXJNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgcGx1Z2luOiBPYnNpZGlhbkdpdFN5bmNlclBsdWdpbjtcbiAgaXRlbXM6IFN5bmNDZW50ZXJJdGVtW10gPSBbXTtcbiAgc2VsZWN0ZWRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29sbGFwc2VkUGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgbG9hZGluZyA9IGZhbHNlO1xuICBlcnJvck1lc3NhZ2UgPSBcIlwiO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luKSB7XG4gICAgc3VwZXIoYXBwKTtcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgfVxuXG4gIG9uT3BlbigpIHtcbiAgICB2b2lkIHRoaXMucmVmcmVzaCgpO1xuICB9XG5cbiAgYXN5bmMgcmVmcmVzaCgpIHtcbiAgICB0aGlzLmxvYWRpbmcgPSB0cnVlO1xuICAgIHRoaXMuZXJyb3JNZXNzYWdlID0gXCJcIjtcbiAgICB0aGlzLnJlbmRlcigpO1xuXG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuaXRlbXMgPSBhd2FpdCB0aGlzLnBsdWdpbi5idWlsZFN5bmNDZW50ZXJJdGVtcygpO1xuICAgICAgY29uc3QgdmFsaWRJZHMgPSBuZXcgU2V0KHRoaXMuaXRlbXMubWFwKChpdGVtKSA9PiBpdGVtLmlkKSk7XG4gICAgICB0aGlzLnNlbGVjdGVkSWRzLmZvckVhY2goKGlkKSA9PiB7XG4gICAgICAgIGlmICghdmFsaWRJZHMuaGFzKGlkKSkge1xuICAgICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZGVsZXRlKGlkKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHRoaXMuZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIlx1NTQwQ1x1NkI2NVx1NEUyRFx1NUZDM1x1NTJBMFx1OEY3RFx1NTkzMVx1OEQyNVx1MzAwMlwiO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLmxvYWRpbmcgPSBmYWxzZTtcbiAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgfVxuICB9XG5cbiAgZ2V0U2VsZWN0ZWRJdGVtcygpOiBTeW5jQ2VudGVySXRlbVtdIHtcbiAgICByZXR1cm4gdGhpcy5pdGVtcy5maWx0ZXIoKGl0ZW0pID0+IHRoaXMuc2VsZWN0ZWRJZHMuaGFzKGl0ZW0uaWQpKTtcbiAgfVxuXG4gIGdldFNlbGVjdGVkTG9jYWxJdGVtcygpOiBTeW5jQ2VudGVySXRlbVtdIHtcbiAgICByZXR1cm4gdGhpcy5nZXRTZWxlY3RlZEl0ZW1zKCkuZmlsdGVyKFxuICAgICAgKGl0ZW0pID0+IGl0ZW0uZmlsZSAmJiB0aGlzLnBsdWdpbi5pc0luc2lkZVJvb3QoaXRlbS5maWxlKSAmJiBpdGVtLnN0YXR1cyAhPT0gXCJwdWJsaXNoZWRcIiAmJiBpdGVtLnN0YXR1cyAhPT0gXCJsb2NhbERlbGV0ZWRcIlxuICAgICk7XG4gIH1cblxuICBnZXRTZWxlY3RlZFJlbW90ZU9ubHlJdGVtcygpOiBTeW5jQ2VudGVySXRlbVtdIHtcbiAgICByZXR1cm4gdGhpcy5nZXRTZWxlY3RlZEl0ZW1zKCkuZmlsdGVyKChpdGVtKSA9PiBpdGVtLnN0YXR1cyA9PT0gXCJsb2NhbERlbGV0ZWRcIik7XG4gIH1cblxuICBnZXRTZWxlY3RlZFJlbW90ZUl0ZW1zKCk6IFN5bmNDZW50ZXJJdGVtW10ge1xuICAgIHJldHVybiB0aGlzLmdldFNlbGVjdGVkSXRlbXMoKS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0ucmVtb3RlKTtcbiAgfVxuXG4gIHNldEl0ZW1zU2VsZWN0ZWQoaXRlbXM6IFN5bmNDZW50ZXJJdGVtW10sIHNlbGVjdGVkOiBib29sZWFuKSB7XG4gICAgaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgICAgaWYgKHNlbGVjdGVkKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuYWRkKGl0ZW0uaWQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5zZWxlY3RlZElkcy5kZWxldGUoaXRlbS5pZCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICByZW5kZXJQcmVzZXJ2aW5nU2Nyb2xsKCkge1xuICAgIGNvbnN0IGJvZHlFbCA9IHRoaXMuY29udGVudEVsLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiLm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1jZW50ZXItYm9keVwiKTtcbiAgICBjb25zdCBtb2RhbENvbnRlbnRFbCA9IHRoaXMuY29udGVudEVsLnBhcmVudEVsZW1lbnQ7XG4gICAgY29uc3QgYm9keVNjcm9sbFRvcCA9IGJvZHlFbD8uc2Nyb2xsVG9wID8/IDA7XG4gICAgY29uc3QgbW9kYWxTY3JvbGxUb3AgPSBtb2RhbENvbnRlbnRFbD8uc2Nyb2xsVG9wID8/IDA7XG5cbiAgICB0aGlzLnJlbmRlcigpO1xuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICBjb25zdCBuZXh0Qm9keUVsID0gdGhpcy5jb250ZW50RWwucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXCIub2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLWNlbnRlci1ib2R5XCIpO1xuICAgICAgaWYgKG5leHRCb2R5RWwpIHtcbiAgICAgICAgbmV4dEJvZHlFbC5zY3JvbGxUb3AgPSBib2R5U2Nyb2xsVG9wO1xuICAgICAgfVxuICAgICAgaWYgKG1vZGFsQ29udGVudEVsKSB7XG4gICAgICAgIG1vZGFsQ29udGVudEVsLnNjcm9sbFRvcCA9IG1vZGFsU2Nyb2xsVG9wO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgdG9nZ2xlRGlyZWN0b3J5KHBhdGg6IHN0cmluZykge1xuICAgIGlmICh0aGlzLmNvbGxhcHNlZFBhdGhzLmhhcyhwYXRoKSkge1xuICAgICAgdGhpcy5jb2xsYXBzZWRQYXRocy5kZWxldGUocGF0aCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuY29sbGFwc2VkUGF0aHMuYWRkKHBhdGgpO1xuICAgIH1cbiAgICB0aGlzLnJlbmRlclByZXNlcnZpbmdTY3JvbGwoKTtcbiAgfVxuXG4gIGJ1aWxkVHJlZShpdGVtczogU3luY0NlbnRlckl0ZW1bXSk6IFN5bmNUcmVlTm9kZSB7XG4gICAgY29uc3Qgcm9vdDogU3luY1RyZWVOb2RlID0ge1xuICAgICAgbmFtZTogUkVNT1RFX0NPTlRFTlRfUk9PVCxcbiAgICAgIHBhdGg6IFJFTU9URV9DT05URU5UX1JPT1QsXG4gICAgICBjaGlsZHJlbjogbmV3IE1hcCgpLFxuICAgICAgaXRlbXM6IFtdXG4gICAgfTtcblxuICAgIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICAgIGNvbnN0IHJlbGF0aXZlID0gaXRlbS5yZW1vdGVQYXRoLnN0YXJ0c1dpdGgoYCR7UkVNT1RFX0NPTlRFTlRfUk9PVH0vYClcbiAgICAgICAgPyBpdGVtLnJlbW90ZVBhdGguc2xpY2UoUkVNT1RFX0NPTlRFTlRfUk9PVC5sZW5ndGggKyAxKVxuICAgICAgICA6IGl0ZW0ucmVtb3RlUGF0aDtcbiAgICAgIGNvbnN0IHBhcnRzID0gcmVsYXRpdmUuc3BsaXQoXCIvXCIpO1xuICAgICAgY29uc3QgZm9sZGVycyA9IHBhcnRzLnNsaWNlKDAsIC0xKTtcbiAgICAgIGxldCBub2RlID0gcm9vdDtcblxuICAgICAgZm9sZGVycy5mb3JFYWNoKChmb2xkZXIpID0+IHtcbiAgICAgICAgY29uc3QgY2hpbGRQYXRoID0gYCR7bm9kZS5wYXRofS8ke2ZvbGRlcn1gO1xuICAgICAgICBsZXQgY2hpbGQgPSBub2RlLmNoaWxkcmVuLmdldChmb2xkZXIpO1xuICAgICAgICBpZiAoIWNoaWxkKSB7XG4gICAgICAgICAgY2hpbGQgPSB7XG4gICAgICAgICAgICBuYW1lOiBmb2xkZXIsXG4gICAgICAgICAgICBwYXRoOiBjaGlsZFBhdGgsXG4gICAgICAgICAgICBjaGlsZHJlbjogbmV3IE1hcCgpLFxuICAgICAgICAgICAgaXRlbXM6IFtdXG4gICAgICAgICAgfTtcbiAgICAgICAgICBub2RlLmNoaWxkcmVuLnNldChmb2xkZXIsIGNoaWxkKTtcbiAgICAgICAgfVxuICAgICAgICBub2RlID0gY2hpbGQ7XG4gICAgICB9KTtcblxuICAgICAgbm9kZS5pdGVtcy5wdXNoKGl0ZW0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJvb3Q7XG4gIH1cblxuICBnZXROb2RlSXRlbXMobm9kZTogU3luY1RyZWVOb2RlKTogU3luY0NlbnRlckl0ZW1bXSB7XG4gICAgY29uc3QgaXRlbXMgPSBbLi4ubm9kZS5pdGVtc107XG4gICAgbm9kZS5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZCkgPT4ge1xuICAgICAgaXRlbXMucHVzaCguLi50aGlzLmdldE5vZGVJdGVtcyhjaGlsZCkpO1xuICAgIH0pO1xuICAgIHJldHVybiBpdGVtcztcbiAgfVxuXG4gIHJlbmRlcigpIHtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuZW1wdHkoKTtcbiAgICBjb250ZW50RWwuYWRkQ2xhc3MoXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtY2VudGVyXCIpO1xuXG4gICAgdGhpcy5yZW5kZXJIZWFkZXIoY29udGVudEVsKTtcblxuICAgIGlmICh0aGlzLmxvYWRpbmcpIHtcbiAgICAgIGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLWNlbnRlci1lbXB0eVwiLCB0ZXh0OiBcIlx1NkI2M1x1NTcyOFx1NTJBMFx1OEY3RFx1NjcyQ1x1NTczMFx1NEUwRVx1OEZEQ1x1N0FFRlx1NTE4NVx1NUJCOS4uLlwiIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmVycm9yTWVzc2FnZSkge1xuICAgICAgY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtY2VudGVyLWVycm9yXCIsIHRleHQ6IHRoaXMuZXJyb3JNZXNzYWdlIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMucmVuZGVyU3VtbWFyeShjb250ZW50RWwpO1xuICAgIHRoaXMucmVuZGVyVG9vbGJhcihjb250ZW50RWwpO1xuXG4gICAgY29uc3QgYm9keUVsID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtY2VudGVyLWJvZHlcIiB9KTtcbiAgICBjb25zdCBzdGF0dXNlczogU3luY0NlbnRlclN0YXR1c1tdID0gW1widW5wdWJsaXNoZWRcIiwgXCJtb2RpZmllZFwiLCBcInB1Ymxpc2hlZFwiLCBcImxvY2FsRGVsZXRlZFwiXTtcbiAgICBzdGF0dXNlcy5mb3JFYWNoKChzdGF0dXMpID0+IHRoaXMucmVuZGVyU3RhdHVzU2VjdGlvbihib2R5RWwsIHN0YXR1cykpO1xuICB9XG5cbiAgcmVuZGVySGVhZGVyKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnN0IGhlYWRlckVsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1jZW50ZXItaGVhZGVyXCIgfSk7XG4gICAgY29uc3QgdGl0bGVHcm91cEVsID0gaGVhZGVyRWwuY3JlYXRlRGl2KCk7XG4gICAgY29uc3QgdGl0bGVSb3dFbCA9IHRpdGxlR3JvdXBFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLWNlbnRlci10aXRsZS1yb3dcIiB9KTtcbiAgICB0aXRsZVJvd0VsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIlx1NTQwQ1x1NkI2NVx1NEUyRFx1NUZDM1wiIH0pO1xuICAgIGNvbnN0IHJlZnJlc2hCdXR0b24gPSB0aXRsZVJvd0VsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItaWNvbi1idXR0b25cIiB9KTtcbiAgICByZWZyZXNoQnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgIHJlZnJlc2hCdXR0b24uc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBcIlx1NTIzN1x1NjVCMFx1NTQwQ1x1NkI2NVx1NEUyRFx1NUZDM1wiKTtcbiAgICByZWZyZXNoQnV0dG9uLnNldEF0dHJpYnV0ZShcInRpdGxlXCIsIFwiXHU1MjM3XHU2NUIwXCIpO1xuICAgIHNldEljb24ocmVmcmVzaEJ1dHRvbiwgXCJyZWZyZXNoLWN3XCIpO1xuICAgIHJlZnJlc2hCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5yZWZyZXNoKCkpO1xuICAgIHRpdGxlR3JvdXBFbC5jcmVhdGVEaXYoe1xuICAgICAgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItbXV0ZWRcIixcbiAgICAgIHRleHQ6IGAke3RoaXMucGx1Z2luLnNldHRpbmdzLnJlcG9zaXRvcnlVcmwgfHwgXCJcdTY3MkFcdTkxNERcdTdGNkVcdTRFRDNcdTVFOTNcIn0gXHUwMEI3ICR7dGhpcy5wbHVnaW4uc2V0dGluZ3MuYnJhbmNoIHx8IFwiXHU2NzJBXHU5MTREXHU3RjZFXHU1MjA2XHU2NTJGXCJ9YFxuICAgIH0pO1xuICB9XG5cbiAgcmVuZGVyU3VtbWFyeShjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBzdW1tYXJ5RWwgPSBjb250YWluZXJFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXN1bW1hcnlcIiB9KTtcbiAgICBjb25zdCBzdGF0dXNlczogU3luY0NlbnRlclN0YXR1c1tdID0gW1widW5wdWJsaXNoZWRcIiwgXCJtb2RpZmllZFwiLCBcInB1Ymxpc2hlZFwiLCBcImxvY2FsRGVsZXRlZFwiXTtcblxuICAgIHN0YXR1c2VzLmZvckVhY2goKHN0YXR1cykgPT4ge1xuICAgICAgY29uc3QgY291bnQgPSB0aGlzLml0ZW1zLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5zdGF0dXMgPT09IHN0YXR1cykubGVuZ3RoO1xuICAgICAgY29uc3QgYmFkZ2VFbCA9IHN1bW1hcnlFbC5jcmVhdGVEaXYoe1xuICAgICAgICBjbHM6IGBvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtc3VtbWFyeS1pdGVtICR7dG9TeW5jQ2VudGVyU3RhdHVzQ2xhc3Moc3RhdHVzKX1gXG4gICAgICB9KTtcbiAgICAgIGJhZGdlRWwuY3JlYXRlU3Bhbih7IHRleHQ6IHRvU3luY0NlbnRlclN0YXR1c0xhYmVsKHN0YXR1cykgfSk7XG4gICAgICBiYWRnZUVsLmNyZWF0ZVNwYW4oeyB0ZXh0OiBTdHJpbmcoY291bnQpLCBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXN1bW1hcnktY291bnRcIiB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHJlbmRlclRvb2xiYXIoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3QgdG9vbGJhckVsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10b29sYmFyXCIgfSk7XG4gICAgY29uc3Qgc2VsZWN0ZWRMb2NhbENvdW50ID0gdGhpcy5nZXRTZWxlY3RlZExvY2FsSXRlbXMoKS5sZW5ndGg7XG4gICAgY29uc3Qgc2VsZWN0ZWRSZW1vdGVPbmx5Q291bnQgPSB0aGlzLmdldFNlbGVjdGVkUmVtb3RlT25seUl0ZW1zKCkubGVuZ3RoO1xuICAgIGNvbnN0IHNlbGVjdGVkUmVtb3RlQ291bnQgPSB0aGlzLmdldFNlbGVjdGVkUmVtb3RlSXRlbXMoKS5sZW5ndGg7XG5cbiAgICB0b29sYmFyRWwuY3JlYXRlRGl2KHtcbiAgICAgIGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLW11dGVkXCIsXG4gICAgICB0ZXh0OiBgXHU1REYyXHU5MDA5XHU2MkU5ICR7dGhpcy5zZWxlY3RlZElkcy5zaXplfSBcdTk4NzlgXG4gICAgfSk7XG5cbiAgICBjb25zdCBjcmVhdGVUb29sYmFyQnV0dG9uID0gKGxhYmVsOiBzdHJpbmcsIGljb246IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgYnV0dG9uRWwgPSB0b29sYmFyRWwuY3JlYXRlRWwoXCJidXR0b25cIik7XG4gICAgICBidXR0b25FbC50eXBlID0gXCJidXR0b25cIjtcblxuICAgICAgY29uc3QgaWNvbkVsID0gYnV0dG9uRWwuY3JlYXRlU3Bhbih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLWJ1dHRvbi1pY29uXCIgfSk7XG4gICAgICBzZXRJY29uKGljb25FbCwgaWNvbik7XG4gICAgICBidXR0b25FbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItYnV0dG9uLWxhYmVsXCIsIHRleHQ6IGxhYmVsIH0pO1xuXG4gICAgICByZXR1cm4gYnV0dG9uRWw7XG4gICAgfTtcblxuICAgIGNvbnN0IGRlbGV0ZUJ1dHRvbiA9IGNyZWF0ZVRvb2xiYXJCdXR0b24oYFx1NTIyMFx1OTY2NFx1OEZEQ1x1N0FFRiAoJHtzZWxlY3RlZFJlbW90ZUNvdW50fSlgLCBcImNsb3VkLW9mZlwiKTtcbiAgICBkZWxldGVCdXR0b24uZGlzYWJsZWQgPSBzZWxlY3RlZFJlbW90ZUNvdW50ID09PSAwO1xuICAgIGRlbGV0ZUJ1dHRvbi5hZGRDbGFzcyhcIm1vZC13YXJuaW5nXCIpO1xuICAgIGRlbGV0ZUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdm9pZCB0aGlzLmRlbGV0ZVNlbGVjdGVkUmVtb3RlRmlsZXMoKSk7XG5cbiAgICBjb25zdCBwdWxsQnV0dG9uID0gY3JlYXRlVG9vbGJhckJ1dHRvbihgXHU2MkM5XHU1M0Q2XHU4RkRDXHU3QUVGICgke3NlbGVjdGVkUmVtb3RlT25seUNvdW50fSlgLCBcImNsb3VkLWRvd25sb2FkXCIpO1xuICAgIHB1bGxCdXR0b24uZGlzYWJsZWQgPSBzZWxlY3RlZFJlbW90ZU9ubHlDb3VudCA9PT0gMDtcbiAgICBwdWxsQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB2b2lkIHRoaXMucHVsbFNlbGVjdGVkUmVtb3RlRmlsZXMoKSk7XG5cbiAgICBjb25zdCBzeW5jQnV0dG9uID0gY3JlYXRlVG9vbGJhckJ1dHRvbihgXHU1NDBDXHU2QjY1XHU2NzJDXHU1NzMwICgke3NlbGVjdGVkTG9jYWxDb3VudH0pYCwgXCJjbG91ZC11cGxvYWRcIik7XG4gICAgc3luY0J1dHRvbi5kaXNhYmxlZCA9IHNlbGVjdGVkTG9jYWxDb3VudCA9PT0gMDtcbiAgICBzeW5jQnV0dG9uLmFkZENsYXNzKFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLWFjdGlvblwiKTtcbiAgICBzeW5jQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB2b2lkIHRoaXMuc3luY1NlbGVjdGVkTG9jYWxGaWxlcygpKTtcbiAgfVxuXG4gIHJlbmRlclN0YXR1c1NlY3Rpb24oY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBzdGF0dXM6IFN5bmNDZW50ZXJTdGF0dXMpIHtcbiAgICBjb25zdCBzZWN0aW9uSXRlbXMgPSB0aGlzLml0ZW1zLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5zdGF0dXMgPT09IHN0YXR1cyk7XG4gICAgY29uc3Qgc2VjdGlvbkVsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1zZWN0aW9uXCIgfSk7XG4gICAgY29uc3QgaGVhZGVyRWwgPSBzZWN0aW9uRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1zZWN0aW9uLWhlYWRlclwiIH0pO1xuICAgIGhlYWRlckVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0b1N5bmNDZW50ZXJTdGF0dXNMYWJlbChzdGF0dXMpIH0pO1xuICAgIGhlYWRlckVsLmNyZWF0ZVNwYW4oe1xuICAgICAgY2xzOiBgb2JzaWRpYW4tZ2l0LXN5bmNlci1zdGF0dXMtYmFkZ2UgJHt0b1N5bmNDZW50ZXJTdGF0dXNDbGFzcyhzdGF0dXMpfWAsXG4gICAgICB0ZXh0OiBTdHJpbmcoc2VjdGlvbkl0ZW1zLmxlbmd0aClcbiAgICB9KTtcblxuICAgIGlmIChzZWN0aW9uSXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBzZWN0aW9uRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1jZW50ZXItZW1wdHlcIiwgdGV4dDogXCJcdTY2ODJcdTY1RTBcdTY1ODdcdTRFRjZcdTMwMDJcIiB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB0cmVlID0gdGhpcy5idWlsZFRyZWUoc2VjdGlvbkl0ZW1zKTtcbiAgICBjb25zdCB0cmVlRWwgPSBzZWN0aW9uRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10cmVlXCIgfSk7XG4gICAgdGhpcy5yZW5kZXJUcmVlQ29udGVudHModHJlZUVsLCB0cmVlLCAwKTtcbiAgfVxuXG4gIHJlbmRlclRyZWVDb250ZW50cyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIG5vZGU6IFN5bmNUcmVlTm9kZSwgZGVwdGg6IG51bWJlcikge1xuICAgIEFycmF5LmZyb20obm9kZS5jaGlsZHJlbi52YWx1ZXMoKSlcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUsIFwiemgtQ05cIikpXG4gICAgICAuZm9yRWFjaCgoY2hpbGQpID0+IHtcbiAgICAgICAgdGhpcy5yZW5kZXJEaXJlY3RvcnlSb3coY29udGFpbmVyRWwsIGNoaWxkLCBkZXB0aCk7XG4gICAgICAgIGlmICghdGhpcy5jb2xsYXBzZWRQYXRocy5oYXMoY2hpbGQucGF0aCkpIHtcbiAgICAgICAgICB0aGlzLnJlbmRlclRyZWVDb250ZW50cyhjb250YWluZXJFbCwgY2hpbGQsIGRlcHRoICsgMSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgbm9kZS5pdGVtc1xuICAgICAgLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSwgXCJ6aC1DTlwiKSlcbiAgICAgIC5mb3JFYWNoKChpdGVtKSA9PiB0aGlzLnJlbmRlckZpbGVSb3coY29udGFpbmVyRWwsIGl0ZW0sIGRlcHRoKSk7XG4gIH1cblxuICByZW5kZXJEaXJlY3RvcnlSb3coY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBub2RlOiBTeW5jVHJlZU5vZGUsIGRlcHRoOiBudW1iZXIpIHtcbiAgICBjb25zdCBpdGVtcyA9IHRoaXMuZ2V0Tm9kZUl0ZW1zKG5vZGUpO1xuICAgIGNvbnN0IHNlbGVjdGVkQ291bnQgPSBpdGVtcy5maWx0ZXIoKGl0ZW0pID0+IHRoaXMuc2VsZWN0ZWRJZHMuaGFzKGl0ZW0uaWQpKS5sZW5ndGg7XG4gICAgY29uc3QgaXNDb2xsYXBzZWQgPSB0aGlzLmNvbGxhcHNlZFBhdGhzLmhhcyhub2RlLnBhdGgpO1xuICAgIGNvbnN0IHJvd0VsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10cmVlLXJvdyBpcy1mb2xkZXJcIiB9KTtcbiAgICByb3dFbC5hZGRDbGFzcyhpc0NvbGxhcHNlZCA/IFwiaXMtY29sbGFwc2VkXCIgOiBcImlzLWV4cGFuZGVkXCIpO1xuICAgIHJvd0VsLnN0eWxlLnNldFByb3BlcnR5KFwiLS1zeW5jLXRyZWUtZGVwdGhcIiwgU3RyaW5nKGRlcHRoKSk7XG5cbiAgICBjb25zdCBjaGVja2JveCA9IHJvd0VsLmNyZWF0ZUVsKFwiaW5wdXRcIik7XG4gICAgY2hlY2tib3gudHlwZSA9IFwiY2hlY2tib3hcIjtcbiAgICBjaGVja2JveC5jaGVja2VkID0gc2VsZWN0ZWRDb3VudCA+IDAgJiYgc2VsZWN0ZWRDb3VudCA9PT0gaXRlbXMubGVuZ3RoO1xuICAgIGNoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBzZWxlY3RlZENvdW50ID4gMCAmJiBzZWxlY3RlZENvdW50IDwgaXRlbXMubGVuZ3RoO1xuICAgIGNoZWNrYm94LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpKTtcbiAgICBjaGVja2JveC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHtcbiAgICAgIHRoaXMuc2V0SXRlbXNTZWxlY3RlZChpdGVtcywgY2hlY2tib3guY2hlY2tlZCk7XG4gICAgICB0aGlzLnJlbmRlclByZXNlcnZpbmdTY3JvbGwoKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGljb25FbCA9IHJvd0VsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXRyZWUtaWNvblwiIH0pO1xuICAgIHNldEljb24oaWNvbkVsLCBpc0NvbGxhcHNlZCA/IFwiZm9sZGVyLWNsb3NlZFwiIDogXCJmb2xkZXItb3BlblwiKTtcblxuICAgIGNvbnN0IG5hbWVFbCA9IHJvd0VsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXRyZWUtbmFtZVwiLCB0ZXh0OiBub2RlLm5hbWUgfSk7XG4gICAgcm93RWwuY3JlYXRlU3Bhbih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtdHJlZS1tZXRhXCIsIHRleHQ6IGAke2l0ZW1zLmxlbmd0aH0gXHU5ODc5YCB9KTtcbiAgICByb3dFbC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy50b2dnbGVEaXJlY3Rvcnkobm9kZS5wYXRoKSk7XG4gIH1cblxuICByZW5kZXJGaWxlUm93KGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgaXRlbTogU3luY0NlbnRlckl0ZW0sIGRlcHRoOiBudW1iZXIpIHtcbiAgICBjb25zdCByb3dFbCA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtdHJlZS1yb3cgaXMtZmlsZVwiIH0pO1xuICAgIHJvd0VsLnN0eWxlLnNldFByb3BlcnR5KFwiLS1zeW5jLXRyZWUtZGVwdGhcIiwgU3RyaW5nKGRlcHRoKSk7XG5cbiAgICBjb25zdCBjaGVja2JveCA9IHJvd0VsLmNyZWF0ZUVsKFwiaW5wdXRcIik7XG4gICAgY2hlY2tib3gudHlwZSA9IFwiY2hlY2tib3hcIjtcbiAgICBjaGVja2JveC5jaGVja2VkID0gdGhpcy5zZWxlY3RlZElkcy5oYXMoaXRlbS5pZCk7XG4gICAgY2hlY2tib3guYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gICAgICBpZiAoY2hlY2tib3guY2hlY2tlZCkge1xuICAgICAgICB0aGlzLnNlbGVjdGVkSWRzLmFkZChpdGVtLmlkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZGVsZXRlKGl0ZW0uaWQpO1xuICAgICAgfVxuICAgICAgdGhpcy5yZW5kZXJQcmVzZXJ2aW5nU2Nyb2xsKCk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBpY29uRWwgPSByb3dFbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10cmVlLWljb25cIiB9KTtcbiAgICBzZXRJY29uKGljb25FbCwgaXRlbS5zdGF0dXMgPT09IFwibG9jYWxEZWxldGVkXCIgPyBcImNsb3VkLW9mZlwiIDogaXNJbWFnZVBhdGgoaXRlbS5yZW1vdGVQYXRoKSA/IFwiaW1hZ2VcIiA6IFwiZmlsZS10ZXh0XCIpO1xuICAgIGNvbnN0IHRleHRFbCA9IHJvd0VsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXRyZWUtdGV4dFwiIH0pO1xuICAgIHRleHRFbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10cmVlLW5hbWVcIiwgdGV4dDogaXRlbS5uYW1lIH0pO1xuICAgIHRleHRFbC5jcmVhdGVTcGFuKHtcbiAgICAgIGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtdHJlZS1wYXRoXCIsXG4gICAgICB0ZXh0OiBpdGVtLmxvY2FsUGF0aCA/IGl0ZW0ubG9jYWxQYXRoIDogaXRlbS5yZW1vdGVQYXRoXG4gICAgfSk7XG4gICAgcm93RWwuY3JlYXRlU3Bhbih7XG4gICAgICBjbHM6IGBvYnNpZGlhbi1naXQtc3luY2VyLXN0YXR1cy1iYWRnZSAke3RvU3luY0NlbnRlclN0YXR1c0NsYXNzKGl0ZW0uc3RhdHVzKX1gLFxuICAgICAgdGV4dDogdG9TeW5jQ2VudGVyU3RhdHVzTGFiZWwoaXRlbS5zdGF0dXMpXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzeW5jU2VsZWN0ZWRMb2NhbEZpbGVzKCkge1xuICAgIGNvbnN0IGl0ZW1zID0gdGhpcy5nZXRTZWxlY3RlZExvY2FsSXRlbXMoKTtcbiAgICBsZXQgc3VjY2Vzc0NvdW50ID0gMDtcbiAgICBsZXQgZmFpbHVyZUNvdW50ID0gMDtcblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuICAgICAgaWYgKCFpdGVtLmZpbGUpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IG5leHRTdGF0ZSA9IGF3YWl0IHRoaXMucGx1Z2luLnN5bmNGaWxlVG9HaXRIdWIoaXRlbS5maWxlKTtcbiAgICAgICAgc3VjY2Vzc0NvdW50ICs9IDE7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZGVsZXRlKGl0ZW0uaWQpO1xuICAgICAgICBpdGVtLnN0YXR1cyA9IFwicHVibGlzaGVkXCI7XG4gICAgICAgIGl0ZW0uc3RhdGUgPSBuZXh0U3RhdGU7XG4gICAgICAgIGl0ZW0ucmVtb3RlID0ge1xuICAgICAgICAgIHJlbW90ZVBhdGg6IGl0ZW0ucmVtb3RlUGF0aCxcbiAgICAgICAgICBzaGE6IG5leHRTdGF0ZS5zaGEgPz8gXCJcIixcbiAgICAgICAgICBodG1sVXJsOiBuZXh0U3RhdGUuaHRtbFVybCA/PyB0aGlzLnBsdWdpbi5idWlsZEdpdEh1YkJsb2JVcmwoaXRlbS5yZW1vdGVQYXRoKVxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIGZhaWx1cmVDb3VudCArPSAxO1xuICAgICAgfVxuICAgIH1cblxuICAgIG5ldyBOb3RpY2UoYFx1NTQwQ1x1NkI2NVx1NUI4Q1x1NjIxMFx1RkYxQVx1NjIxMFx1NTI5RiAke3N1Y2Nlc3NDb3VudH1cdUZGMENcdTU5MzFcdThEMjUgJHtmYWlsdXJlQ291bnR9YCk7XG4gICAgdGhpcy5yZW5kZXJQcmVzZXJ2aW5nU2Nyb2xsKCk7XG4gIH1cblxuICBhc3luYyBwdWxsU2VsZWN0ZWRSZW1vdGVGaWxlcygpIHtcbiAgICBjb25zdCBpdGVtcyA9IHRoaXMuZ2V0U2VsZWN0ZWRSZW1vdGVPbmx5SXRlbXMoKTtcbiAgICBsZXQgc3VjY2Vzc0NvdW50ID0gMDtcbiAgICBsZXQgZmFpbHVyZUNvdW50ID0gMDtcblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ucHVsbFJlbW90ZUZpbGUoaXRlbS5yZW1vdGVQYXRoKTtcbiAgICAgICAgc3VjY2Vzc0NvdW50ICs9IDE7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZGVsZXRlKGl0ZW0uaWQpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIGZhaWx1cmVDb3VudCArPSAxO1xuICAgICAgfVxuICAgIH1cblxuICAgIG5ldyBOb3RpY2UoYFx1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlx1NjJDOVx1NTNENlx1NUI4Q1x1NjIxMFx1RkYxQVx1NjIxMFx1NTI5RiAke3N1Y2Nlc3NDb3VudH1cdUZGMENcdTU5MzFcdThEMjUgJHtmYWlsdXJlQ291bnR9YCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoKCk7XG4gIH1cblxuICBhc3luYyBkZWxldGVTZWxlY3RlZFJlbW90ZUZpbGVzKCkge1xuICAgIGNvbnN0IGl0ZW1zID0gdGhpcy5nZXRTZWxlY3RlZFJlbW90ZUl0ZW1zKCk7XG4gICAgbGV0IHN1Y2Nlc3NDb3VudCA9IDA7XG4gICAgbGV0IGZhaWx1cmVDb3VudCA9IDA7XG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmRlbGV0ZVJlbW90ZVBhdGgoaXRlbS5yZW1vdGVQYXRoKTtcbiAgICAgICAgaWYgKGl0ZW0uZmlsZSkge1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNldFN0YXRlKGl0ZW0uZmlsZSwge1xuICAgICAgICAgICAgcmVtb3RlUGF0aDogaXRlbS5yZW1vdGVQYXRoLFxuICAgICAgICAgICAgc2hhOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBodG1sVXJsOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBzdGF0dXM6IFwiZGVsZXRlZFwiXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgc3VjY2Vzc0NvdW50ICs9IDE7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZGVsZXRlKGl0ZW0uaWQpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIGZhaWx1cmVDb3VudCArPSAxO1xuICAgICAgfVxuICAgIH1cblxuICAgIG5ldyBOb3RpY2UoYFx1OEZEQ1x1N0FFRlx1NkI4Qlx1NzU1OVx1NkUwNVx1NzQwNlx1NUI4Q1x1NjIxMFx1RkYxQVx1NjIxMFx1NTI5RiAke3N1Y2Nlc3NDb3VudH1cdUZGMENcdTU5MzFcdThEMjUgJHtmYWlsdXJlQ291bnR9YCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoKCk7XG4gIH1cbn1cblxuY2xhc3MgUGx1Z2luVmVyc2lvbk1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luKSB7XG4gICAgc3VwZXIoYXBwKTtcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgfVxuXG4gIG9uT3BlbigpIHtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuZW1wdHkoKTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXHU0RkUxXHU2MDZGXCIgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBcdTU0MERcdTc5RjBcdUZGMUEke3RoaXMucGx1Z2luLm1hbmlmZXN0Lm5hbWV9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFx1NzI0OFx1NjcyQ1x1RkYxQSR7dGhpcy5wbHVnaW4ubWFuaWZlc3QudmVyc2lvbn1gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgXHU2M0QyXHU0RUY2IElEXHVGRjFBJHt0aGlzLnBsdWdpbi5tYW5pZmVzdC5pZH1gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgXHU2NzAwXHU0RjRFIE9ic2lkaWFuIFx1NzI0OFx1NjcyQ1x1RkYxQSR7dGhpcy5wbHVnaW4ubWFuaWZlc3QubWluQXBwVmVyc2lvbn1gIH0pO1xuICB9XG59XG5cbmNsYXNzIEdpdFN5bmNlclNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcbiAgcGx1Z2luOiBPYnNpZGlhbkdpdFN5bmNlclBsdWdpbjtcbiAgYWN0aXZlU2VjdGlvbjogXCJnZW5lcmFsXCIgfCBcInJlbW90ZVwiIHwgXCJzeW5jXCIgfCBcIm1lZGlhXCIgfCBcImRlYnVnXCIgPSBcImdlbmVyYWxcIjtcbiAgc2VhcmNoUXVlcnkgPSBcIlwiO1xuICByb290RWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIG5hdkVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBwYW5lbEVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luKSB7XG4gICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICB9XG5cbiAgZ2V0U2VjdGlvbnMoKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgIHtcbiAgICAgICAgaWQ6IFwiZ2VuZXJhbFwiIGFzIGNvbnN0LFxuICAgICAgICBsYWJlbDogXCJcdTkwMUFcdTc1MjhcdThCQkVcdTdGNkVcIixcbiAgICAgICAgdGl0bGU6IFwiXHU5MDFBXHU3NTI4XHU4QkJFXHU3RjZFXCIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlx1N0JBMVx1NzQwNlx1NjcyQ1x1NTczMFx1NTQwQ1x1NkI2NVx1NzZFRVx1NUY1NVx1NTQ4Q1x1NjNEMlx1NEVGNlx1NTdGQVx1Nzg0MFx1NEZFMVx1NjA2Rlx1MzAwMlwiXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBpZDogXCJyZW1vdGVcIiBhcyBjb25zdCxcbiAgICAgICAgbGFiZWw6IFwiR2l0SHViIFx1OTE0RFx1N0Y2RVwiLFxuICAgICAgICB0aXRsZTogXCJHaXRIdWIgXHU5MTREXHU3RjZFXCIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlx1OTE0RFx1N0Y2RSBHaXRIdWIgXHU0RUQzXHU1RTkzXHUzMDAxVG9rZW5cdTMwMDFcdTc1MjhcdTYyMzdcdTU0MERcdTU0OENcdTc2RUVcdTY4MDdcdTUyMDZcdTY1MkZcdTMwMDJcIlxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgaWQ6IFwic3luY1wiIGFzIGNvbnN0LFxuICAgICAgICBsYWJlbDogXCJcdTU0MENcdTZCNjVcdTYzQTdcdTUyMzZcIixcbiAgICAgICAgdGl0bGU6IFwiXHU1NDBDXHU2QjY1XHU2M0E3XHU1MjM2XCIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlx1NjdFNVx1NzcwQiBjb250ZW50IFx1NzZFRVx1NUY1NVx1NjYyMFx1NUMwNFx1MzAwMVx1NzJCNlx1NjAwMVx1N0YxM1x1NUI1OFx1NTQ4Q1x1NTQwQ1x1NkI2NVx1N0I1Nlx1NzU2NVx1MzAwMlwiXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBpZDogXCJtZWRpYVwiIGFzIGNvbnN0LFxuICAgICAgICBsYWJlbDogXCJcdTk2NDRcdTRFRjZcdTU5MDRcdTc0MDZcIixcbiAgICAgICAgdGl0bGU6IFwiXHU5NjQ0XHU0RUY2XHU1OTA0XHU3NDA2XCIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlx1NTQwRVx1N0VFRFx1NTNFRlx1NjI2OVx1NUM1NVx1NTZGRVx1NzI0N1x1NEUwQVx1NEYyMFx1MzAwMVx1OTY0NFx1NEVGNlx1NTkwRFx1NTIzNlx1NTQ4Q1x1OEQ0NFx1NkU5MFx1NUYxNVx1NzUyOFx1OTFDRFx1NTE5OVx1MzAwMlwiXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBpZDogXCJkZWJ1Z1wiIGFzIGNvbnN0LFxuICAgICAgICBsYWJlbDogXCJcdThDMDNcdThCRDVcIixcbiAgICAgICAgdGl0bGU6IFwiXHU4QzAzXHU4QkQ1XHU0RTBFXHU2NUU1XHU1RkQ3XCIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlx1NjdFNVx1NzcwQlx1NjNEMlx1NEVGNlx1NzI0OFx1NjcyQ1x1NTQ4Q1x1OEJDQVx1NjVBRFx1NTE2NVx1NTNFM1x1MzAwMlwiXG4gICAgICB9XG4gICAgXTtcbiAgfVxuXG4gIGdldEZpbHRlclRleHQoLi4ucGFydHM6IEFycmF5PHN0cmluZyB8IHVuZGVmaW5lZD4pIHtcbiAgICByZXR1cm4gcGFydHNcbiAgICAgIC5maWx0ZXIoKHBhcnQpOiBwYXJ0IGlzIHN0cmluZyA9PiBCb29sZWFuKHBhcnQpKVxuICAgICAgLmpvaW4oXCIgXCIpXG4gICAgICAudG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIGNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgLi4ucGFydHM6IEFycmF5PHN0cmluZyB8IHVuZGVmaW5lZD4pIHtcbiAgICBjb25zdCBzZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpO1xuICAgIHNldHRpbmcuc2V0dGluZ0VsLmRhdGFzZXQuZmlsdGVyVGV4dCA9IHRoaXMuZ2V0RmlsdGVyVGV4dCguLi5wYXJ0cyk7XG4gICAgcmV0dXJuIHNldHRpbmc7XG4gIH1cblxuICByZW5kZXJTZWFyY2hCYXIoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3Qgc2VhcmNoU2V0dGluZyA9IG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXRDbGFzcyhcIm9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3Mtc2VhcmNoLXJvd1wiKTtcbiAgICBzZWFyY2hTZXR0aW5nLmluZm9FbC5yZW1vdmUoKTtcbiAgICBzZWFyY2hTZXR0aW5nLmFkZFNlYXJjaCgoc2VhcmNoKSA9PlxuICAgICAgc2VhcmNoLnNldFBsYWNlaG9sZGVyKFwiXHU2NDFDXHU3RDIyXHU5NzYyXHU2NzdGXHU4QkJFXHU3RjZFLi4uXCIpLnNldFZhbHVlKHRoaXMuc2VhcmNoUXVlcnkpLm9uQ2hhbmdlKCh2YWx1ZSkgPT4ge1xuICAgICAgICB0aGlzLnNlYXJjaFF1ZXJ5ID0gdmFsdWU7XG4gICAgICAgIGNvbnN0IHBhbmVsRWwgPSB0aGlzLmNvbnRhaW5lckVsLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiLm9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3MtcGFuZWxcIik7XG4gICAgICAgIGlmIChwYW5lbEVsKSB7XG4gICAgICAgICAgdGhpcy5hcHBseVNlYXJjaEZpbHRlcihwYW5lbEVsKTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgcmVuZGVyU2VjdGlvblRhYnMoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3QgbmF2RWwgPSBjb250YWluZXJFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1uYXZcIiB9KTtcbiAgICB0aGlzLm5hdkVsID0gbmF2RWw7XG5cbiAgICB0aGlzLmdldFNlY3Rpb25zKCkuZm9yRWFjaCgoc2VjdGlvbikgPT4ge1xuICAgICAgY29uc3QgYnV0dG9uID0gbmF2RWwuY3JlYXRlRWwoXCJidXR0b25cIiwge1xuICAgICAgICBjbHM6IGBvYnNpZGlhbi1naXQtc3luY2VyLXNldHRpbmdzLW5hdi1pdGVtJHt0aGlzLmFjdGl2ZVNlY3Rpb24gPT09IHNlY3Rpb24uaWQgPyBcIiBpcy1hY3RpdmVcIiA6IFwiXCJ9YCxcbiAgICAgICAgdGV4dDogc2VjdGlvbi5sYWJlbFxuICAgICAgfSk7XG4gICAgICBidXR0b24udHlwZSA9IFwiYnV0dG9uXCI7XG4gICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgICAgaWYgKHRoaXMuYWN0aXZlU2VjdGlvbiA9PT0gc2VjdGlvbi5pZCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYWN0aXZlU2VjdGlvbiA9IHNlY3Rpb24uaWQ7XG4gICAgICAgIHRoaXMuc3luY1RhYlN0YXRlKCk7XG4gICAgICAgIGlmICh0aGlzLnBhbmVsRWwpIHtcbiAgICAgICAgICB0aGlzLnJlbmRlclBhbmVsKHRoaXMucGFuZWxFbCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgc3luY1RhYlN0YXRlKCkge1xuICAgIGlmICghdGhpcy5uYXZFbCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGl0ZW1zID0gQXJyYXkuZnJvbSh0aGlzLm5hdkVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFwiLm9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3MtbmF2LWl0ZW1cIikpO1xuICAgIGl0ZW1zLmZvckVhY2goKGl0ZW0sIGluZGV4KSA9PiB7XG4gICAgICBjb25zdCBzZWN0aW9uID0gdGhpcy5nZXRTZWN0aW9ucygpW2luZGV4XTtcbiAgICAgIGl0ZW0uY2xhc3NMaXN0LnRvZ2dsZShcImlzLWFjdGl2ZVwiLCBzZWN0aW9uPy5pZCA9PT0gdGhpcy5hY3RpdmVTZWN0aW9uKTtcbiAgICB9KTtcbiAgfVxuXG4gIHJlbmRlclBsYWNlaG9sZGVyU2V0dGluZyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIHRpdGxlOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIGJhZGdlID0gXCJcdTg5QzRcdTUyMTJcdTRFMkRcIikge1xuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIHRpdGxlLCBkZXNjcmlwdGlvbiwgYmFkZ2UpXG4gICAgICAuc2V0TmFtZSh0aXRsZSlcbiAgICAgIC5zZXREZXNjKGAke2Rlc2NyaXB0aW9ufVx1RkYwOCR7YmFkZ2V9XHVGRjA5YCk7XG4gIH1cblxuICByZW5kZXJTZWN0aW9uU3ViaGVhZGluZyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIHRleHQ6IHN0cmluZykge1xuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKHRleHQpLnNldEhlYWRpbmcoKTtcbiAgfVxuXG4gIHJlbmRlckNvbm5lY3Rpb25TdGF0dXMoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3QgY29ubmVjdGlvbiA9IHRoaXMucGx1Z2luLmRhdGEuY29ubmVjdGlvbiA/PyBERUZBVUxUX0RBVEEuY29ubmVjdGlvbjtcbiAgICBjb25zdCBzdGF0dXNFbCA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdih7XG4gICAgICBjbHM6IGBvYnNpZGlhbi1naXQtc3luY2VyLWNvbm5lY3Rpb24tc3RhdHVzIGlzLSR7Y29ubmVjdGlvbj8uc3RhdHVzID8/IFwidW5rbm93blwifWBcbiAgICB9KTtcbiAgICBjb25zdCBpY29uRWwgPSBzdGF0dXNFbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItY29ubmVjdGlvbi1zdGF0dXMtaWNvblwiIH0pO1xuICAgIGNvbnN0IGljb25OYW1lID1cbiAgICAgIGNvbm5lY3Rpb24/LnN0YXR1cyA9PT0gXCJzdWNjZXNzXCJcbiAgICAgICAgPyBcImNoZWNrLWNpcmNsZS0yXCJcbiAgICAgICAgOiBjb25uZWN0aW9uPy5zdGF0dXMgPT09IFwiZmFpbGVkXCJcbiAgICAgICAgICA/IFwieC1jaXJjbGVcIlxuICAgICAgICAgIDogY29ubmVjdGlvbj8uc3RhdHVzID09PSBcInN0YWxlXCJcbiAgICAgICAgICAgID8gXCJhbGVydC1jaXJjbGVcIlxuICAgICAgICAgICAgOiBcImNpcmNsZS1oZWxwXCI7XG4gICAgc2V0SWNvbihpY29uRWwsIGljb25OYW1lKTtcbiAgICBzdGF0dXNFbC5jcmVhdGVTcGFuKHtcbiAgICAgIGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLWNvbm5lY3Rpb24tc3RhdHVzLXRleHRcIixcbiAgICAgIHRleHQ6IGAke2Nvbm5lY3Rpb24/Lm1lc3NhZ2UgPz8gXCJcdTVDMUFcdTY3MkFcdTZENEJcdThCRDVcdThGREVcdTYzQTVcdTMwMDJcIn0ke2Nvbm5lY3Rpb24/LmNoZWNrZWRBdCA/IGAgXHUwMEI3ICR7Y29ubmVjdGlvbi5jaGVja2VkQXR9YCA6IFwiXCJ9YFxuICAgIH0pO1xuICB9XG5cbiAgcmVuZGVyR2VuZXJhbFNldHRpbmdzKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnN0IGxvY2FsUm9vdERlc2NyaXB0aW9uID0gdGhpcy5wbHVnaW4uZ2V0RXhpc3RpbmdGb2xkZXIodGhpcy5wbHVnaW4uc2V0dGluZ3MubG9jYWxSb290UGF0aClcbiAgICAgID8gYFx1NUY1M1x1NTI0RFx1NzZFRVx1NUY1NVx1NjcwOVx1NjU0OFx1RkYxQSR7dGhpcy5wbHVnaW4uc2V0dGluZ3MubG9jYWxSb290UGF0aH1gXG4gICAgICA6IFwiXHU1M0VBXHU2NzA5XHU4QkU1XHU3NkVFXHU1RjU1XHU1MTg1XHU3Njg0XHU2NTg3XHU0RUY2XHU2MjREXHU1MTQxXHU4QkI4XHU1NDBDXHU2QjY1XHUzMDAyXHU1RjUzXHU1MjREXHU1MDNDXHU2NUUwXHU2NTQ4XHU2NUY2XHU4QkY3XHU5MUNEXHU2NUIwXHU5MDA5XHU2MkU5XHU3NkVFXHU1RjU1XHUzMDAyXCI7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIkxvY2FsIFJvb3QgUGF0aFwiLCBsb2NhbFJvb3REZXNjcmlwdGlvbiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MubG9jYWxSb290UGF0aClcbiAgICAgIC5zZXROYW1lKFwiTG9jYWwgUm9vdCBQYXRoXCIpXG4gICAgICAuc2V0RGVzYyhsb2NhbFJvb3REZXNjcmlwdGlvbilcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvY2FsUm9vdFBhdGgpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmxvY2FsUm9vdFBhdGggPSBub3JtYWxpemVQYXRoKHZhbHVlLnRyaW0oKSk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KFwiXHU5MDA5XHU2MkU5XHU3NkVFXHU1RjU1XCIpLm9uQ2xpY2soKCkgPT4ge1xuICAgICAgICAgIG5ldyBGb2xkZXJTZWxlY3RNb2RhbCh0aGlzLmFwcCwgdGhpcy5wbHVnaW4sIGFzeW5jIChmb2xkZXIpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNldExvY2FsUm9vdFBhdGgoZm9sZGVyLnBhdGgpO1xuICAgICAgICAgICAgICBuZXcgTm90aWNlKGBcdTVERjJcdThCQkVcdTdGNkUgTG9jYWwgUm9vdCBQYXRoXHVGRjFBJHtmb2xkZXIucGF0aH1gKTtcbiAgICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIlx1OEJCRVx1N0Y2RVx1NTkzMVx1OEQyNVwiO1xuICAgICAgICAgICAgICBuZXcgTm90aWNlKG1lc3NhZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pLm9wZW4oKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIlx1OEZEQ1x1N0FFRlx1NzZFRVx1NUY1NVwiLCBcIlx1NTZGQVx1NUI5QVx1NTE5OVx1NTE2NSBHaXRIdWIgXHU0RUQzXHU1RTkzIGNvbnRlbnQgXHU3NkVFXHU1RjU1XHUzMDAyXCIsIFJFTU9URV9DT05URU5UX1JPT1QpXG4gICAgICAuc2V0TmFtZShcIlx1OEZEQ1x1N0FFRlx1NzZFRVx1NUY1NVwiKVxuICAgICAgLnNldERlc2MoXCJcdTYzRDJcdTRFRjZcdTUzRUFcdThCRkJcdTUxOTlcdTRFRDNcdTVFOTMgY29udGVudCBcdTc2RUVcdTVGNTVcdUZGMUJcdTY3MkNcdTU3MzBcdTU0MENcdTZCNjVcdTc2RUVcdTVGNTVcdTUxODVcdTc2ODRcdTc2RjhcdTVCRjlcdThERUZcdTVGODRcdTRGMUFcdTY2MjBcdTVDMDRcdTUyMzAgY29udGVudCBcdTRFMEJcdTMwMDJcIik7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIlx1NjNEMlx1NEVGNlx1NzI0OFx1NjcyQ1wiLCB0aGlzLnBsdWdpbi5tYW5pZmVzdC52ZXJzaW9uLCB0aGlzLnBsdWdpbi5tYW5pZmVzdC5pZClcbiAgICAgIC5zZXROYW1lKFwiXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXCIpXG4gICAgICAuc2V0RGVzYyhgJHt0aGlzLnBsdWdpbi5tYW5pZmVzdC5uYW1lfSB2JHt0aGlzLnBsdWdpbi5tYW5pZmVzdC52ZXJzaW9ufSBcdTAwQjcgJHt0aGlzLnBsdWdpbi5tYW5pZmVzdC5pZH1gKTtcbiAgfVxuXG4gIHJlbmRlclJlbW90ZVNldHRpbmdzKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoXG4gICAgICBjb250YWluZXJFbCxcbiAgICAgIFwiUmVwb3NpdG9yeSBVUkxcIixcbiAgICAgIFwiXHU0RjhCXHU1OTgyIGh0dHBzOi8vZ2l0aHViLmNvbS9pbWxpdXN4L29ic2lkaWFuLWdpdC1zeW5jZXIuZ2l0XCIsXG4gICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZXBvc2l0b3J5VXJsXG4gICAgKVxuICAgICAgLnNldE5hbWUoXCJSZXBvc2l0b3J5IFVSTFwiKVxuICAgICAgLnNldERlc2MoXCJHaXRIdWIgXHU5ODc5XHU3NkVFXHU0RUQzXHU1RTkzXHU1NzMwXHU1NzQwXHVGRjBDXHU2NTJGXHU2MzAxIEhUVFBTXHUzMDAxU1NIIFx1NjIxNiBvd25lci9yZXBvXHUzMDAyXCIpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImh0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvLmdpdFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZXBvc2l0b3J5VXJsKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnJlcG9zaXRvcnlVcmwgPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5tYXJrQ29ubmVjdGlvblN0YWxlKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiR2l0SHViIFVzZXJuYW1lXCIsIFwiXHU1RjUzXHU1MjREXHU2Mzg4XHU2NzQzIFRva2VuIFx1NUJGOVx1NUU5NFx1NzY4NCBHaXRIdWIgXHU3NTI4XHU2MjM3XHU1NDBEXHUzMDAyXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLmdpdGh1YlVzZXJuYW1lKVxuICAgICAgLnNldE5hbWUoXCJHaXRIdWIgVXNlcm5hbWVcIilcbiAgICAgIC5zZXREZXNjKFwiXHU1RjUzXHU1MjREXHU2Mzg4XHU2NzQzIFRva2VuIFx1NUJGOVx1NUU5NFx1NzY4NCBHaXRIdWIgXHU3NTI4XHU2MjM3XHU1NDBEXHUzMDAyXCIpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImltbGl1c3hcIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZ2l0aHViVXNlcm5hbWUpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZ2l0aHViVXNlcm5hbWUgPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5tYXJrQ29ubmVjdGlvblN0YWxlKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiR2l0SHViIFRva2VuXCIsIFwiRmluZS1ncmFpbmVkIFRva2VuIFx1OTcwMFx1ODk4MVx1NUYwMFx1NTQyRiBDb250ZW50cyBcdThCRkJcdTUxOTlcdTY3NDNcdTk2NTBcdTMwMDJcIilcbiAgICAgIC5zZXROYW1lKFwiR2l0SHViIFRva2VuXCIpXG4gICAgICAuc2V0RGVzYyhcIkZpbmUtZ3JhaW5lZCBUb2tlbiBcdTk3MDBcdTg5ODFcdTYzODhcdTY3NDNcdTc2RUVcdTY4MDdcdTRFRDNcdTVFOTNcdUZGMENcdTVFNzZcdTVGMDBcdTU0MkYgQ29udGVudHMgXHU4QkZCXHU1MTk5XHU2NzQzXHU5NjUwXHUzMDAyXCIpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT4ge1xuICAgICAgICB0ZXh0LmlucHV0RWwudHlwZSA9IFwicGFzc3dvcmRcIjtcbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImdpdGh1Yl9wYXRfLi4uXCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmdpdGh1YlRva2VuKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmdpdGh1YlRva2VuID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ubWFya0Nvbm5lY3Rpb25TdGFsZSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiQnJhbmNoXCIsIFwiXHU0RjhCXHU1OTgyIG1haW5cIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYnJhbmNoKVxuICAgICAgLnNldE5hbWUoXCJCcmFuY2hcIilcbiAgICAgIC5zZXREZXNjKFwiXHU1NDBDXHU2QjY1XHU1MTk5XHU1MTY1XHU3Njg0XHU3NkVFXHU2ODA3XHU1MjA2XHU2NTJGXHUzMDAyXCIpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIm1haW5cIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYnJhbmNoKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmJyYW5jaCA9IHZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLm1hcmtDb25uZWN0aW9uU3RhbGUoKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJcdTZENEJcdThCRDVcdThGREVcdTYzQTVcIiwgXCJcdTlBOENcdThCQzFcdTVGNTNcdTUyNERcdTRFRDNcdTVFOTNcdTMwMDFUb2tlbiBcdTU0OENcdTUyMDZcdTY1MkZcdTkxNERcdTdGNkVcdTY2MkZcdTU0MjZcdTUzRUZcdThCQkZcdTk1RUVcdTMwMDJcIilcbiAgICAgIC5zZXROYW1lKFwiXHU2RDRCXHU4QkQ1XHU4RkRFXHU2M0E1XCIpXG4gICAgICAuc2V0RGVzYyhcIlx1OUE4Q1x1OEJDMVx1NUY1M1x1NTI0RFx1NEVEM1x1NUU5M1x1MzAwMVRva2VuIFx1NTQ4Q1x1NTIwNlx1NjUyRlx1OTE0RFx1N0Y2RVx1NjYyRlx1NTQyNlx1NTNFRlx1OEJCRlx1OTVFRVx1MzAwMlwiKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dChcIlx1NkQ0Qlx1OEJENVx1OEZERVx1NjNBNVwiKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4udGVzdENvbm5lY3Rpb24oKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyUGFuZWwodGhpcy5wYW5lbEVsID8/IGNvbnRhaW5lckVsKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJcdThGREVcdTYzQTVcdTU5MzFcdThEMjVcIjtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UobWVzc2FnZSk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlclBhbmVsKHRoaXMucGFuZWxFbCA/PyBjb250YWluZXJFbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIHRoaXMucmVuZGVyQ29ubmVjdGlvblN0YXR1cyhjb250YWluZXJFbCk7XG4gIH1cblxuICByZW5kZXJTeW5jU2V0dGluZ3MoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJDb250ZW50IFJvb3RcIiwgXCJcdTU2RkFcdTVCOUFcdTRFM0EgY29udGVudFwiLCBSRU1PVEVfQ09OVEVOVF9ST09UKVxuICAgICAgLnNldE5hbWUoXCJDb250ZW50IFJvb3RcIilcbiAgICAgIC5zZXREZXNjKFwiXHU4RkRDXHU3QUVGXHU4QkZCXHU1MTk5XHU4REVGXHU1Rjg0XHU1NkZBXHU1QjlBXHU0RTNBIGNvbnRlbnQvPFx1NjcyQ1x1NTczMFx1NzZGOFx1NUJGOVx1OERFRlx1NUY4ND5cdTMwMDJcIik7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIlx1NTQwQ1x1NkI2NVx1OEJGNFx1NjYwRVwiLCBcIlx1NzJCNlx1NjAwMVx1N0YxM1x1NUI1OFx1MzAwMVx1NjcyQ1x1NTczMFx1NEZFRVx1NjUzOVx1NjhDMFx1NkQ0Qlx1MzAwMVx1OEZEQ1x1N0FFRlx1NTIyMFx1OTY2NFx1NjhDMFx1NkQ0QlwiLCBcIlx1OEJGNFx1NjYwRVwiKVxuICAgICAgLnNldE5hbWUoXCJcdTU0MENcdTZCNjVcdThCRjRcdTY2MEVcIilcbiAgICAgIC5zZXREZXNjKFwiXHU2M0QyXHU0RUY2XHU0RjFBXHU3RjEzXHU1QjU4XHU2NzAwXHU4RkQxXHU1NDBDXHU2QjY1XHU3Njg0XHU1MTg1XHU1QkI5XHU1NEM4XHU1RTBDXHVGRjFCXHU2NzJDXHU1NzMwXHU1MTg1XHU1QkI5XHU1M0Q4XHU1MzE2XHU2NjNFXHU3OTNBXHU0RTNBXHU1REYyXHU0RkVFXHU2NTM5XHVGRjBDXHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHU0RTBEXHU1QjU4XHU1NzI4XHU2NjNFXHU3OTNBXHU0RTNBXHU4RkRDXHU3QUVGXHU1REYyXHU1MjIwXHU5NjY0XHUzMDAyXCIpO1xuXG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJcdTZFMDVcdTc0MDZcdTcyQjZcdTYwMDFcdTdGMTNcdTVCNThcIiwgXCJcdTZFMDVcdTc0MDZcdTY3MkNcdTU3MzBcdTU0MENcdTZCNjVcdTcyQjZcdTYwMDFcdUZGMENcdTRFMERcdTVGNzFcdTU0Q0QgR2l0SHViIFx1NEVEM1x1NUU5M1x1NjU4N1x1NEVGNlx1MzAwMlwiKVxuICAgICAgLnNldE5hbWUoXCJcdTZFMDVcdTc0MDZcdTcyQjZcdTYwMDFcdTdGMTNcdTVCNThcIilcbiAgICAgIC5zZXREZXNjKFwiXHU2RTA1XHU3NDA2XHU2NzJDXHU1NzMwXHU1NDBDXHU2QjY1XHU3MkI2XHU2MDAxXHVGRjBDXHU0RTBEXHU1RjcxXHU1NENEIEdpdEh1YiBcdTRFRDNcdTVFOTNcdTY1ODdcdTRFRjZcdTMwMDJcIilcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQoXCJcdTZFMDVcdTc0MDZcIikuc2V0V2FybmluZygpLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLmRhdGEuZmlsZXMgPSB7fTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlQWxsRGF0YSgpO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnJlZnJlc2hTdGF0dXNCYXIoKTtcbiAgICAgICAgICBuZXcgTm90aWNlKFwiXHU3MkI2XHU2MDAxXHU3RjEzXHU1QjU4XHU1REYyXHU2RTA1XHU3NDA2XHUzMDAyXCIpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgfVxuXG4gIHJlbmRlck1lZGlhU2V0dGluZ3MoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgdGhpcy5yZW5kZXJQbGFjZWhvbGRlclNldHRpbmcoXG4gICAgICBjb250YWluZXJFbCxcbiAgICAgIFwiXHU5NjQ0XHU0RUY2XHU0RTBFXHU1NkZFXHU3MjQ3XCIsXG4gICAgICBcIlx1OEZEOVx1OTFDQ1x1NUMwNlx1NzUyOFx1NEU4RVx1OTE0RFx1N0Y2RVx1NTZGRVx1NzI0N1x1NTkwRFx1NTIzNlx1N0I1Nlx1NzU2NVx1MzAwMVx1OTY0NFx1NEVGNlx1NzZFRVx1NUY1NVx1NjYyMFx1NUMwNFx1MzAwMVx1OEZEQ1x1N0EwQlx1OEQ0NFx1NkU5MFx1NTczMFx1NTc0MFx1NEUwRVx1NUYxNVx1NzUyOFx1OTFDRFx1NTE5OVx1ODlDNFx1NTIxOVx1MzAwMlwiXG4gICAgKTtcbiAgfVxuXG4gIHJlbmRlckRlYnVnU2V0dGluZ3MoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgdGhpcy5yZW5kZXJQbGFjZWhvbGRlclNldHRpbmcoXG4gICAgICBjb250YWluZXJFbCxcbiAgICAgIFwiXHU4QzAzXHU4QkQ1XHU0RTBFXHU2NUU1XHU1RkQ3XCIsXG4gICAgICBcIlx1OEZEOVx1OTFDQ1x1NUMwNlx1NzUyOFx1NEU4RVx1NjdFNVx1NzcwQlx1NTQwQ1x1NkI2NVx1NjVFNVx1NUZEN1x1MzAwMVx1OEJGN1x1NkM0Mlx1N0VEM1x1Njc5Q1x1NTQ4Q1x1OTUxOVx1OEJFRlx1NjM5Mlx1NjdFNVx1NEZFMVx1NjA2Rlx1MzAwMlwiXG4gICAgKTtcblxuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXHU0RkUxXHU2MDZGXCIsIFwiXHU2N0U1XHU3NzBCXHU3MjQ4XHU2NzJDXHUzMDAxXHU2M0QyXHU0RUY2IElEIFx1NTQ4Q1x1NjcwMFx1NEY0RVx1NTE3Q1x1NUJCOVx1NzI0OFx1NjcyQ1x1MzAwMlwiKVxuICAgICAgLnNldE5hbWUoXCJcdTYzRDJcdTRFRjZcdTcyNDhcdTY3MkNcdTRGRTFcdTYwNkZcIilcbiAgICAgIC5zZXREZXNjKFwiXHU2N0U1XHU3NzBCXHU3MjQ4XHU2NzJDXHUzMDAxXHU2M0QyXHU0RUY2IElEIFx1NTQ4Q1x1NjcwMFx1NEY0RVx1NTE3Q1x1NUJCOVx1NzI0OFx1NjcyQ1x1MzAwMlwiKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dChcIlx1NjI1M1x1NUYwMFwiKS5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICBuZXcgUGx1Z2luVmVyc2lvbk1vZGFsKHRoaXMuYXBwLCB0aGlzLnBsdWdpbikub3BlbigpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgfVxuXG4gIGFwcGx5U2VhcmNoRmlsdGVyKHBhbmVsRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3QgcXVlcnkgPSB0aGlzLnNlYXJjaFF1ZXJ5LnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IGl0ZW1zID0gQXJyYXkuZnJvbShwYW5lbEVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFwiLnNldHRpbmctaXRlbVtkYXRhLWZpbHRlci10ZXh0XVwiKSk7XG4gICAgbGV0IHZpc2libGVDb3VudCA9IDA7XG5cbiAgICBpdGVtcy5mb3JFYWNoKChpdGVtRWwpID0+IHtcbiAgICAgIGNvbnN0IG1hdGNoZXMgPSAhcXVlcnkgfHwgKGl0ZW1FbC5kYXRhc2V0LmZpbHRlclRleHQgPz8gXCJcIikuaW5jbHVkZXMocXVlcnkpO1xuICAgICAgaXRlbUVsLmNsYXNzTGlzdC50b2dnbGUoXCJpcy1oaWRkZW5cIiwgIW1hdGNoZXMpO1xuICAgICAgaWYgKG1hdGNoZXMpIHtcbiAgICAgICAgdmlzaWJsZUNvdW50ICs9IDE7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBlbXB0eVN0YXRlRWwgPSBwYW5lbEVsLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiLm9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3MtZW1wdHlcIik7XG4gICAgaWYgKGVtcHR5U3RhdGVFbCkge1xuICAgICAgZW1wdHlTdGF0ZUVsLmNsYXNzTGlzdC50b2dnbGUoXCJpcy1oaWRkZW5cIiwgdmlzaWJsZUNvdW50ID4gMCk7XG4gICAgfVxuICB9XG5cbiAgcmVuZGVyQWN0aXZlU2VjdGlvbihjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBzd2l0Y2ggKHRoaXMuYWN0aXZlU2VjdGlvbikge1xuICAgICAgY2FzZSBcImdlbmVyYWxcIjpcbiAgICAgICAgdGhpcy5yZW5kZXJHZW5lcmFsU2V0dGluZ3MoY29udGFpbmVyRWwpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJyZW1vdGVcIjpcbiAgICAgICAgdGhpcy5yZW5kZXJSZW1vdGVTZXR0aW5ncyhjb250YWluZXJFbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInN5bmNcIjpcbiAgICAgICAgdGhpcy5yZW5kZXJTeW5jU2V0dGluZ3MoY29udGFpbmVyRWwpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJtZWRpYVwiOlxuICAgICAgICB0aGlzLnJlbmRlck1lZGlhU2V0dGluZ3MoY29udGFpbmVyRWwpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJkZWJ1Z1wiOlxuICAgICAgICB0aGlzLnJlbmRlckRlYnVnU2V0dGluZ3MoY29udGFpbmVyRWwpO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHJlbmRlclBhbmVsKHBhbmVsRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgcGFuZWxFbC5lbXB0eSgpO1xuICAgIHRoaXMucmVuZGVyQWN0aXZlU2VjdGlvbihwYW5lbEVsKTtcbiAgICBwYW5lbEVsLmNyZWF0ZURpdih7XG4gICAgICBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1lbXB0eSBpcy1oaWRkZW5cIixcbiAgICAgIHRleHQ6IFwiXHU2Q0ExXHU2NzA5XHU1MzM5XHU5MTREXHU1MjMwXHU1RjUzXHU1MjREXHU3QjVCXHU5MDA5XHU2NzYxXHU0RUY2XHU3Njg0XHU4QkJFXHU3RjZFXHU5ODc5XHUzMDAyXCJcbiAgICB9KTtcbiAgICB0aGlzLmFwcGx5U2VhcmNoRmlsdGVyKHBhbmVsRWwpO1xuICB9XG5cbiAgZGlzcGxheSgpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xuICAgIGNvbnRhaW5lckVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCIub2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1yb290XCIpLmZvckVhY2goKGVsZW1lbnQpID0+IGVsZW1lbnQucmVtb3ZlKCkpO1xuICAgIHRoaXMucm9vdEVsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3Mtcm9vdFwiIH0pO1xuICAgIHRoaXMubmF2RWwgPSBudWxsO1xuICAgIHRoaXMucGFuZWxFbCA9IG51bGw7XG5cbiAgICB0aGlzLnJlbmRlclNlYXJjaEJhcih0aGlzLnJvb3RFbCk7XG4gICAgdGhpcy5yZW5kZXJTZWN0aW9uVGFicyh0aGlzLnJvb3RFbCk7XG5cbiAgICBjb25zdCBzZWN0aW9uRWwgPSB0aGlzLnJvb3RFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1wYW5lbFwiIH0pO1xuICAgIHRoaXMucGFuZWxFbCA9IHNlY3Rpb25FbDtcbiAgICB0aGlzLnJlbmRlclBhbmVsKHNlY3Rpb25FbCk7XG4gIH1cbn1cblxuY2xhc3MgRm9sZGVyU2VsZWN0TW9kYWwgZXh0ZW5kcyBGdXp6eVN1Z2dlc3RNb2RhbDxURm9sZGVyPiB7XG4gIHBsdWdpbjogT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW47XG4gIG9uQ2hvb3NlRm9sZGVyOiAoZm9sZGVyOiBURm9sZGVyKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZDtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBhcHA6IEFwcCxcbiAgICBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luLFxuICAgIG9uQ2hvb3NlRm9sZGVyOiAoZm9sZGVyOiBURm9sZGVyKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZFxuICApIHtcbiAgICBzdXBlcihhcHApO1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICAgIHRoaXMub25DaG9vc2VGb2xkZXIgPSBvbkNob29zZUZvbGRlcjtcbiAgICB0aGlzLnNldFBsYWNlaG9sZGVyKFwiXHU5MDA5XHU2MkU5IExvY2FsIFJvb3QgUGF0aCBcdTc2RUVcdTVGNTVcIik7XG4gIH1cblxuICBnZXRJdGVtcygpOiBURm9sZGVyW10ge1xuICAgIHJldHVybiB0aGlzLnBsdWdpbi5nZXRBbGxWYXVsdEZvbGRlcnMoKTtcbiAgfVxuXG4gIGdldEl0ZW1UZXh0KGZvbGRlcjogVEZvbGRlcik6IHN0cmluZyB7XG4gICAgcmV0dXJuIGZvbGRlci5wYXRoO1xuICB9XG5cbiAgYXN5bmMgb25DaG9vc2VJdGVtKGZvbGRlcjogVEZvbGRlcik6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMub25DaG9vc2VGb2xkZXIoZm9sZGVyKTtcbiAgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxzQkFjTztBQTBIUCxJQUFNLHNCQUFzQjtBQUU1QixJQUFNLG1CQUF1QztBQUFBLEVBQzNDLGVBQWU7QUFBQSxFQUNmLGdCQUFnQjtBQUFBLEVBQ2hCLGFBQWE7QUFBQSxFQUNiLFFBQVE7QUFBQSxFQUNSLGVBQWU7QUFDakI7QUFFQSxJQUFNLGVBQThCO0FBQUEsRUFDbEMsT0FBTyxDQUFDO0FBQUEsRUFDUixZQUFZO0FBQUEsSUFDVixRQUFRO0FBQUEsSUFDUixTQUFTO0FBQUEsRUFDWDtBQUNGO0FBRUEsSUFBTSxxQkFBTixjQUFpQyxNQUFNO0FBQUEsRUFLckMsWUFBWSxRQUFnQixTQUFpQixRQUFnQixNQUFjO0FBQ3pFLFVBQU0sT0FBTztBQUNiLFNBQUssU0FBUztBQUNkLFNBQUssU0FBUztBQUNkLFNBQUssT0FBTztB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QWEsZUFBZSxDQUFDO0FBQUEsSUFDN0Q7QUFBQSxFQUNGO0FBQUEsRUFFQSxvQkFBb0IsYUFBMEI7QUFDNUMsWUFBUSxLQUFLLGVBQWU7QUFBQSxNQUMxQixLQUFLO0FBQ0gsYUFBSyxzQkFBc0IsV0FBVztBQUN0QztBQUFBLE1BQ0YsS0FBSztBQUNILGFBQUsscUJBQXFCLFdBQVc7QUFDckM7QUFBQSxNQUNGLEtBQUs7QUFDSCxhQUFLLG1CQUFtQixXQUFXO0FBQ25DO0FBQUEsTUFDRixLQUFLO0FBQ0gsYUFBSyxvQkFBb0IsV0FBVztBQUNwQztBQUFBLE1BQ0YsS0FBSztBQUNILGFBQUssb0JBQW9CLFdBQVc7QUFDcEM7QUFBQSxNQUNGO0FBQ0U7QUFBQSxJQUNKO0FBQUEsRUFDRjtBQUFBLEVBRUEsWUFBWSxTQUFzQjtBQUNoQyxZQUFRLE1BQU07QUFDZCxTQUFLLG9CQUFvQixPQUFPO0FBQ2hDLFlBQVEsVUFBVTtBQUFBLE1BQ2hCLEtBQUs7QUFBQSxNQUNMLE1BQU07QUFBQSxJQUNSLENBQUM7QUFDRCxTQUFLLGtCQUFrQixPQUFPO0FBQUEsRUFDaEM7QUFBQSxFQUVBLFVBQWdCO0FBQ2QsVUFBTSxFQUFFLFlBQVksSUFBSTtBQUN4QixnQkFBWSxpQkFBaUIsb0NBQW9DLEVBQUUsUUFBUSxDQUFDLFlBQVksUUFBUSxPQUFPLENBQUM7QUFDeEcsU0FBSyxTQUFTLFlBQVksVUFBVSxFQUFFLEtBQUssb0NBQW9DLENBQUM7QUFDaEYsU0FBSyxRQUFRO0FBQ2IsU0FBSyxVQUFVO0FBRWYsU0FBSyxnQkFBZ0IsS0FBSyxNQUFNO0FBQ2hDLFNBQUssa0JBQWtCLEtBQUssTUFBTTtBQUVsQyxVQUFNLFlBQVksS0FBSyxPQUFPLFVBQVUsRUFBRSxLQUFLLHFDQUFxQyxDQUFDO0FBQ3JGLFNBQUssVUFBVTtBQUNmLFNBQUssWUFBWSxTQUFTO0FBQUEsRUFDNUI7QUFDRjtBQUVBLElBQU0sb0JBQU4sY0FBZ0Msa0NBQTJCO0FBQUEsRUFJekQsWUFDRSxLQUNBLFFBQ0EsZ0JBQ0E7QUFDQSxVQUFNLEdBQUc7QUFDVCxTQUFLLFNBQVM7QUFDZCxTQUFLLGlCQUFpQjtBQUN0QixTQUFLLGVBQWUsMkNBQXVCO0FBQUEsRUFDN0M7QUFBQSxFQUVBLFdBQXNCO0FBQ3BCLFdBQU8sS0FBSyxPQUFPLG1CQUFtQjtBQUFBLEVBQ3hDO0FBQUEsRUFFQSxZQUFZLFFBQXlCO0FBQ25DLFdBQU8sT0FBTztBQUFBLEVBQ2hCO0FBQUEsRUFFQSxNQUFNLGFBQWEsUUFBZ0M7QUFDakQsVUFBTSxLQUFLLGVBQWUsTUFBTTtBQUFBLEVBQ2xDO0FBQ0Y7IiwKICAibmFtZXMiOiBbIm5leHRTdGF0ZSJdCn0K
