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
    this.addSettingTab(new GitSyncerSettingTab(this.app, this));
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu) => {
        const file = this.getCurrentFile();
        if (!file) {
          return;
        }
        this.addArticleContextMenuItems(menu, file);
      })
    );
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
  async refreshStatusBar() {
    return;
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
    this.activeOperation = null;
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
    const isBusy = this.loading || this.activeOperation !== null;
    toolbarEl.createDiv({
      cls: "obsidian-git-syncer-muted",
      text: `\u5DF2\u9009\u62E9 ${this.selectedIds.size} \u9879`
    });
    const createToolbarButton = (label, icon, operation) => {
      const isRunning = this.activeOperation === operation;
      const buttonEl = toolbarEl.createEl("button");
      buttonEl.type = "button";
      buttonEl.toggleClass("is-running", isRunning);
      buttonEl.setAttribute("aria-busy", isRunning ? "true" : "false");
      const iconEl = buttonEl.createSpan({ cls: "obsidian-git-syncer-button-icon" });
      (0, import_obsidian.setIcon)(iconEl, isRunning ? "loader-circle" : icon);
      buttonEl.createSpan({ cls: "obsidian-git-syncer-button-label", text: isRunning ? this.getOperationButtonLabel(operation) : label });
      return buttonEl;
    };
    const deleteButton = createToolbarButton(`\u5220\u9664\u8FDC\u7AEF (${selectedRemoteCount})`, "cloud-off", "delete");
    deleteButton.disabled = isBusy || selectedRemoteCount === 0;
    deleteButton.addClass("mod-warning");
    deleteButton.addEventListener("click", () => void this.deleteSelectedRemoteFiles());
    const pullButton = createToolbarButton(`\u62C9\u53D6\u8FDC\u7AEF (${selectedRemoteOnlyCount})`, "cloud-download", "pull");
    pullButton.disabled = isBusy || selectedRemoteOnlyCount === 0;
    pullButton.addEventListener("click", () => void this.pullSelectedRemoteFiles());
    const syncButton = createToolbarButton(`\u540C\u6B65\u672C\u5730 (${selectedLocalCount})`, "cloud-upload", "sync");
    syncButton.disabled = isBusy || selectedLocalCount === 0;
    syncButton.addClass("obsidian-git-syncer-sync-action");
    syncButton.addEventListener("click", () => void this.syncSelectedLocalFiles());
    if (this.activeOperation) {
      containerEl.createDiv({
        cls: "obsidian-git-syncer-sync-operation-status",
        text: this.getOperationStatusText(this.activeOperation)
      });
    }
  }
  getOperationButtonLabel(operation) {
    switch (operation) {
      case "delete":
        return "\u5220\u9664\u4E2D...";
      case "pull":
        return "\u62C9\u53D6\u4E2D...";
      case "sync":
      default:
        return "\u540C\u6B65\u4E2D...";
    }
  }
  getOperationStatusText(operation) {
    switch (operation) {
      case "delete":
        return "\u6B63\u5728\u5220\u9664\u8FDC\u7AEF\u6587\u4EF6\uFF0C\u8BF7\u7A0D\u5019...";
      case "pull":
        return "\u6B63\u5728\u62C9\u53D6\u8FDC\u7AEF\u6587\u4EF6\uFF0C\u8BF7\u7A0D\u5019...";
      case "sync":
      default:
        return "\u6B63\u5728\u540C\u6B65\u672C\u5730\u6587\u4EF6\uFF0C\u8BF7\u7A0D\u5019...";
    }
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
    if (this.activeOperation) {
      return;
    }
    const items = this.getSelectedLocalItems();
    if (items.length === 0) {
      return;
    }
    let successCount = 0;
    let failureCount = 0;
    this.activeOperation = "sync";
    this.renderPreservingScroll();
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
    this.activeOperation = null;
    this.renderPreservingScroll();
  }
  async pullSelectedRemoteFiles() {
    if (this.activeOperation) {
      return;
    }
    const items = this.getSelectedRemoteOnlyItems();
    if (items.length === 0) {
      return;
    }
    let successCount = 0;
    let failureCount = 0;
    this.activeOperation = "pull";
    this.renderPreservingScroll();
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
    this.activeOperation = null;
    await this.refresh();
  }
  async deleteSelectedRemoteFiles() {
    if (this.activeOperation) {
      return;
    }
    const items = this.getSelectedRemoteItems();
    if (items.length === 0) {
      return;
    }
    let successCount = 0;
    let failureCount = 0;
    this.activeOperation = "delete";
    this.renderPreservingScroll();
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
    this.activeOperation = null;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7XG4gIEFwcCxcbiAgRnV6enlTdWdnZXN0TW9kYWwsXG4gIE1lbnUsXG4gIE1vZGFsLFxuICBOb3RpY2UsXG4gIFBsdWdpbixcbiAgUGx1Z2luU2V0dGluZ1RhYixcbiAgU2V0dGluZyxcbiAgc2V0SWNvbixcbiAgVEZpbGUsXG4gIFRGb2xkZXIsXG4gIG5vcm1hbGl6ZVBhdGgsXG4gIHJlcXVlc3RVcmxcbn0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmludGVyZmFjZSBHaXRIdWJTeW5jU2V0dGluZ3Mge1xuICByZXBvc2l0b3J5VXJsOiBzdHJpbmc7XG4gIGdpdGh1YlVzZXJuYW1lOiBzdHJpbmc7XG4gIGdpdGh1YlRva2VuOiBzdHJpbmc7XG4gIGJyYW5jaDogc3RyaW5nO1xuICBsb2NhbFJvb3RQYXRoOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBMb2NhbEZpbGVTdGF0ZSB7XG4gIHJlbW90ZVBhdGg/OiBzdHJpbmc7XG4gIHNoYT86IHN0cmluZztcbiAgc3RhdHVzOiBcImRyYWZ0XCIgfCBcInN5bmNlZFwiIHwgXCJtb2RpZmllZFwiIHwgXCJkZWxldGVkXCIgfCBcImZhaWxlZFwiO1xuICBsYXN0U3luY2VkQXQ/OiBzdHJpbmc7XG4gIGxhc3RTeW5jZWRIYXNoPzogc3RyaW5nO1xuICBodG1sVXJsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUGVyc2lzdGVkRGF0YSB7XG4gIGZpbGVzOiBSZWNvcmQ8c3RyaW5nLCBMb2NhbEZpbGVTdGF0ZT47XG4gIGNvbm5lY3Rpb24/OiBDb25uZWN0aW9uU3RhdGU7XG59XG5cbmludGVyZmFjZSBDb25uZWN0aW9uU3RhdGUge1xuICBzdGF0dXM6IFwidW5rbm93blwiIHwgXCJzdWNjZXNzXCIgfCBcImZhaWxlZFwiIHwgXCJzdGFsZVwiO1xuICBtZXNzYWdlOiBzdHJpbmc7XG4gIGNoZWNrZWRBdD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEFydGljbGVBY3Rpb25Db250ZXh0IHtcbiAgZmlsZTogVEZpbGU7XG4gIGluUm9vdDogYm9vbGVhbjtcbiAgaGFzUHJvcGVydGllczogYm9vbGVhbjtcbiAgc3RhdGU6IExvY2FsRmlsZVN0YXRlO1xuICBzeW5jVGl0bGU6IHN0cmluZztcbiAgY2FuU3luYzogYm9vbGVhbjtcbiAgY2FuRGVsZXRlUmVtb3RlOiBib29sZWFuO1xuICBjYW5PcGVuUmVtb3RlOiBib29sZWFuO1xuICBjYW5JbnNlcnRQcm9wZXJ0aWVzOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViUmVwbyB7XG4gIG93bmVyOiBzdHJpbmc7XG4gIHJlcG86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEdpdEh1YkVycm9yUGF5bG9hZCB7XG4gIG1lc3NhZ2U/OiBzdHJpbmc7XG4gIGRvY3VtZW50YXRpb25fdXJsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViQ29udGVudFJlc3BvbnNlIHtcbiAgdHlwZTogc3RyaW5nO1xuICBwYXRoOiBzdHJpbmc7XG4gIHNoYTogc3RyaW5nO1xuICBodG1sX3VybD86IHN0cmluZztcbiAgY29udGVudD86IHN0cmluZztcbiAgZW5jb2Rpbmc/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBHaXRIdWJQdXRSZXNwb25zZSB7XG4gIGNvbnRlbnQ/OiBHaXRIdWJDb250ZW50UmVzcG9uc2UgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViRGVsZXRlUmVzcG9uc2Uge1xuICBjb250ZW50PzogR2l0SHViQ29udGVudFJlc3BvbnNlIHwgbnVsbDtcbn1cblxuaW50ZXJmYWNlIEdpdEh1YlVzZXJSZXNwb25zZSB7XG4gIGxvZ2luOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBHaXRIdWJSZXBvUmVzcG9uc2Uge1xuICBmdWxsX25hbWU6IHN0cmluZztcbiAgcGVybWlzc2lvbnM/OiB7XG4gICAgYWRtaW4/OiBib29sZWFuO1xuICAgIG1haW50YWluPzogYm9vbGVhbjtcbiAgICBwdXNoPzogYm9vbGVhbjtcbiAgICB0cmlhZ2U/OiBib29sZWFuO1xuICAgIHB1bGw/OiBib29sZWFuO1xuICB9O1xufVxuXG5pbnRlcmZhY2UgR2l0SHViVHJlZUl0ZW0ge1xuICBwYXRoOiBzdHJpbmc7XG4gIHR5cGU6IFwiYmxvYlwiIHwgXCJ0cmVlXCIgfCBzdHJpbmc7XG4gIHNoYTogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViVHJlZVJlc3BvbnNlIHtcbiAgdHJlZTogR2l0SHViVHJlZUl0ZW1bXTtcbiAgdHJ1bmNhdGVkOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgUmVtb3RlU3luY0ZpbGUge1xuICByZW1vdGVQYXRoOiBzdHJpbmc7XG4gIHNoYTogc3RyaW5nO1xuICBodG1sVXJsOiBzdHJpbmc7XG59XG5cbnR5cGUgU3luY0NlbnRlclN0YXR1cyA9IFwidW5wdWJsaXNoZWRcIiB8IFwibW9kaWZpZWRcIiB8IFwicHVibGlzaGVkXCIgfCBcImxvY2FsRGVsZXRlZFwiO1xudHlwZSBTeW5jQ2VudGVyT3BlcmF0aW9uID0gXCJzeW5jXCIgfCBcInB1bGxcIiB8IFwiZGVsZXRlXCI7XG5cbmludGVyZmFjZSBTeW5jQ2VudGVySXRlbSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgc3RhdHVzOiBTeW5jQ2VudGVyU3RhdHVzO1xuICBsb2NhbFBhdGg/OiBzdHJpbmc7XG4gIHJlbW90ZVBhdGg6IHN0cmluZztcbiAgZm9sZGVyUGF0aDogc3RyaW5nO1xuICBmaWxlPzogVEZpbGU7XG4gIHJlbW90ZT86IFJlbW90ZVN5bmNGaWxlO1xuICBzdGF0ZT86IExvY2FsRmlsZVN0YXRlO1xufVxuXG5pbnRlcmZhY2UgU3luY1RyZWVOb2RlIHtcbiAgbmFtZTogc3RyaW5nO1xuICBwYXRoOiBzdHJpbmc7XG4gIGNoaWxkcmVuOiBNYXA8c3RyaW5nLCBTeW5jVHJlZU5vZGU+O1xuICBpdGVtczogU3luY0NlbnRlckl0ZW1bXTtcbn1cblxuY29uc3QgUkVNT1RFX0NPTlRFTlRfUk9PVCA9IFwiY29udGVudFwiO1xuY29uc3QgVkFVTFRfUk9PVF9QQVRIID0gXCIvXCI7XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IEdpdEh1YlN5bmNTZXR0aW5ncyA9IHtcbiAgcmVwb3NpdG9yeVVybDogXCJcIixcbiAgZ2l0aHViVXNlcm5hbWU6IFwiXCIsXG4gIGdpdGh1YlRva2VuOiBcIlwiLFxuICBicmFuY2g6IFwibWFpblwiLFxuICBsb2NhbFJvb3RQYXRoOiBcImNvbnRlbnRcIlxufTtcblxuY29uc3QgREVGQVVMVF9EQVRBOiBQZXJzaXN0ZWREYXRhID0ge1xuICBmaWxlczoge30sXG4gIGNvbm5lY3Rpb246IHtcbiAgICBzdGF0dXM6IFwidW5rbm93blwiLFxuICAgIG1lc3NhZ2U6IFwiXHU1QzFBXHU2NzJBXHU2RDRCXHU4QkQ1XHU4RkRFXHU2M0E1XHUzMDAyXCJcbiAgfVxufTtcblxuY2xhc3MgR2l0SHViUmVxdWVzdEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICBzdGF0dXM6IG51bWJlcjtcbiAgbWV0aG9kOiBzdHJpbmc7XG4gIHBhdGg6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihzdGF0dXM6IG51bWJlciwgbWVzc2FnZTogc3RyaW5nLCBtZXRob2Q6IHN0cmluZywgcGF0aDogc3RyaW5nKSB7XG4gICAgc3VwZXIobWVzc2FnZSk7XG4gICAgdGhpcy5zdGF0dXMgPSBzdGF0dXM7XG4gICAgdGhpcy5tZXRob2QgPSBtZXRob2Q7XG4gICAgdGhpcy5wYXRoID0gcGF0aDtcbiAgfVxufVxuXG5mdW5jdGlvbiBlc2NhcGVZYW1sKGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gaW5wdXQucmVwbGFjZSgvXCIvZywgJ1xcXFxcIicpO1xufVxuXG5mdW5jdGlvbiBwYXJzZUZyb250bWF0dGVyKGNvbnRlbnQ6IHN0cmluZyk6IHsgZGF0YTogUmVjb3JkPHN0cmluZywgc3RyaW5nPjsgYm9keTogc3RyaW5nIH0ge1xuICBpZiAoIWNvbnRlbnQuc3RhcnRzV2l0aChcIi0tLVxcblwiKSkge1xuICAgIHJldHVybiB7IGRhdGE6IHt9LCBib2R5OiBjb250ZW50IH07XG4gIH1cblxuICBjb25zdCBlbmQgPSBjb250ZW50LmluZGV4T2YoXCJcXG4tLS1cXG5cIiwgNCk7XG4gIGlmIChlbmQgPT09IC0xKSB7XG4gICAgcmV0dXJuIHsgZGF0YToge30sIGJvZHk6IGNvbnRlbnQgfTtcbiAgfVxuXG4gIGNvbnN0IHJhdyA9IGNvbnRlbnQuc2xpY2UoNCwgZW5kKS5zcGxpdChcIlxcblwiKTtcbiAgY29uc3QgZGF0YTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXG4gIGZvciAoY29uc3QgbGluZSBvZiByYXcpIHtcbiAgICBjb25zdCBzZXBhcmF0b3IgPSBsaW5lLmluZGV4T2YoXCI6XCIpO1xuICAgIGlmIChzZXBhcmF0b3IgPT09IC0xKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBrZXkgPSBsaW5lLnNsaWNlKDAsIHNlcGFyYXRvcikudHJpbSgpO1xuICAgIGNvbnN0IHZhbHVlID0gbGluZS5zbGljZShzZXBhcmF0b3IgKyAxKS50cmltKCkucmVwbGFjZSgvXlwifFwiJC9nLCBcIlwiKTtcbiAgICBpZiAoa2V5KSB7XG4gICAgICBkYXRhW2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBkYXRhLCBib2R5OiBjb250ZW50LnNsaWNlKGVuZCArIDUpIH07XG59XG5cbmZ1bmN0aW9uIGJ1aWxkRnJvbnRtYXR0ZXIoZmlsZTogVEZpbGUsIHRpdGxlPzogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgdG9kYXkgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICBjb25zdCByZXNvbHZlZFRpdGxlID0gdGl0bGU/LnRyaW0oKSB8fCBmaWxlLmJhc2VuYW1lO1xuICBjb25zdCBzbHVnID0gcmVzb2x2ZWRUaXRsZVxuICAgIC50cmltKClcbiAgICAudG9Mb3dlckNhc2UoKVxuICAgIC5yZXBsYWNlKC9cXHMrL2csIFwiLVwiKVxuICAgIC5yZXBsYWNlKC9bXlxccHtMfVxccHtOfS1dKy9ndSwgXCJcIilcbiAgICAucmVwbGFjZSgvLSsvZywgXCItXCIpXG4gICAgLnJlcGxhY2UoL14tfC0kL2csIFwiXCIpO1xuXG4gIHJldHVybiBbXG4gICAgXCItLS1cIixcbiAgICBgdGl0bGU6ICR7ZXNjYXBlWWFtbChyZXNvbHZlZFRpdGxlKX1gLFxuICAgIGBzbHVnOiAke3NsdWcgfHwgZmlsZS5iYXNlbmFtZX1gLFxuICAgIGBkYXRlOiAke3RvZGF5fWAsXG4gICAgXCJjYXRlZ29yeTogXHU1RjAwXHU1M0QxXCIsXG4gICAgXCJ0YWdzOlwiLFxuICAgIFwiICAtIEphdmFcIixcbiAgICBcIiAgLSBOZXh0SlNcIixcbiAgICBcImRlc2NyaXB0aW9uOiBcdTY1ODdcdTdBRTBcdTY0NThcdTg5ODFcIixcbiAgICBcImNvdmVyOlwiLFxuICAgIFwicHVibGlzaGVkOiB0cnVlXCIsXG4gICAgXCItLS1cIixcbiAgICBcIlwiXG4gIF0uam9pbihcIlxcblwiKTtcbn1cblxuZnVuY3Rpb24gcGFkRGF0ZU51bWJlcih2YWx1ZTogbnVtYmVyKTogc3RyaW5nIHtcbiAgcmV0dXJuIFN0cmluZyh2YWx1ZSkucGFkU3RhcnQoMiwgXCIwXCIpO1xufVxuXG5mdW5jdGlvbiBmb3JtYXREYXRlVGltZShpbnB1dDogRGF0ZSB8IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGRhdGUgPSB0eXBlb2YgaW5wdXQgPT09IFwic3RyaW5nXCIgPyBuZXcgRGF0ZShpbnB1dCkgOiBpbnB1dDtcblxuICBpZiAoTnVtYmVyLmlzTmFOKGRhdGUuZ2V0VGltZSgpKSkge1xuICAgIHJldHVybiB0eXBlb2YgaW5wdXQgPT09IFwic3RyaW5nXCIgPyBpbnB1dCA6IFwiXCI7XG4gIH1cblxuICByZXR1cm4gW1xuICAgIGAke2RhdGUuZ2V0RnVsbFllYXIoKX0tJHtwYWREYXRlTnVtYmVyKGRhdGUuZ2V0TW9udGgoKSArIDEpfS0ke3BhZERhdGVOdW1iZXIoZGF0ZS5nZXREYXRlKCkpfWAsXG4gICAgYCR7cGFkRGF0ZU51bWJlcihkYXRlLmdldEhvdXJzKCkpfToke3BhZERhdGVOdW1iZXIoZGF0ZS5nZXRNaW51dGVzKCkpfToke3BhZERhdGVOdW1iZXIoZGF0ZS5nZXRTZWNvbmRzKCkpfWBcbiAgXS5qb2luKFwiIFwiKTtcbn1cblxuZnVuY3Rpb24gaGFzaENvbnRlbnQoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBoYXNoID0gMDtcblxuICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgaW5wdXQubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgaGFzaCA9IChoYXNoICogMzEgKyBpbnB1dC5jaGFyQ29kZUF0KGluZGV4KSkgfCAwO1xuICB9XG5cbiAgcmV0dXJuIGBoJHtNYXRoLmFicyhoYXNoKX1gO1xufVxuXG5mdW5jdGlvbiBlbmNvZGVCYXNlNjQoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGJ5dGVzID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKGlucHV0KTtcbiAgcmV0dXJuIGVuY29kZUJ5dGVzQmFzZTY0KGJ5dGVzKTtcbn1cblxuZnVuY3Rpb24gZW5jb2RlQnl0ZXNCYXNlNjQoYnl0ZXM6IFVpbnQ4QXJyYXkpOiBzdHJpbmcge1xuICBsZXQgYmluYXJ5ID0gXCJcIjtcblxuICBieXRlcy5mb3JFYWNoKChieXRlKSA9PiB7XG4gICAgYmluYXJ5ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZSk7XG4gIH0pO1xuXG4gIHJldHVybiBidG9hKGJpbmFyeSk7XG59XG5cbmZ1bmN0aW9uIHRleHRCeXRlcyhpbnB1dDogc3RyaW5nKTogVWludDhBcnJheSB7XG4gIHJldHVybiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoaW5wdXQpO1xufVxuXG5mdW5jdGlvbiBkZWNvZGVCYXNlNjRCeXRlcyhpbnB1dDogc3RyaW5nKTogVWludDhBcnJheSB7XG4gIGNvbnN0IGJpbmFyeSA9IGF0b2IoaW5wdXQucmVwbGFjZSgvXFxzL2csIFwiXCIpKTtcbiAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShiaW5hcnkubGVuZ3RoKTtcblxuICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYmluYXJ5Lmxlbmd0aDsgaW5kZXggKz0gMSkge1xuICAgIGJ5dGVzW2luZGV4XSA9IGJpbmFyeS5jaGFyQ29kZUF0KGluZGV4KTtcbiAgfVxuXG4gIHJldHVybiBieXRlcztcbn1cblxuZnVuY3Rpb24gZGVjb2RlQmFzZTY0KGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGRlY29kZUJhc2U2NEJ5dGVzKGlucHV0KSk7XG59XG5cbmZ1bmN0aW9uIGhhc2hCeXRlcyhpbnB1dDogQXJyYXlCdWZmZXIpOiBzdHJpbmcge1xuICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGlucHV0KTtcbiAgbGV0IGhhc2ggPSAwO1xuXG4gIGZvciAoY29uc3QgYnl0ZSBvZiBieXRlcykge1xuICAgIGhhc2ggPSAoaGFzaCAqIDMxICsgYnl0ZSkgfCAwO1xuICB9XG5cbiAgcmV0dXJuIGBoJHtNYXRoLmFicyhoYXNoKX1gO1xufVxuXG5mdW5jdGlvbiB0b0hleChieXRlczogVWludDhBcnJheSk6IHN0cmluZyB7XG4gIHJldHVybiBBcnJheS5mcm9tKGJ5dGVzKVxuICAgIC5tYXAoKGJ5dGUpID0+IGJ5dGUudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsIFwiMFwiKSlcbiAgICAuam9pbihcIlwiKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2l0QmxvYlNoYShpbnB1dDogQXJyYXlCdWZmZXIpOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGlucHV0KTtcbiAgY29uc3QgaGVhZGVyID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKGBibG9iICR7Ynl0ZXMuYnl0ZUxlbmd0aH1cXDBgKTtcbiAgY29uc3QgcGF5bG9hZCA9IG5ldyBVaW50OEFycmF5KGhlYWRlci5ieXRlTGVuZ3RoICsgYnl0ZXMuYnl0ZUxlbmd0aCk7XG4gIHBheWxvYWQuc2V0KGhlYWRlciwgMCk7XG4gIHBheWxvYWQuc2V0KGJ5dGVzLCBoZWFkZXIuYnl0ZUxlbmd0aCk7XG4gIGNvbnN0IGRpZ2VzdCA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGlnZXN0KFwiU0hBLTFcIiwgcGF5bG9hZCk7XG4gIHJldHVybiB0b0hleChuZXcgVWludDhBcnJheShkaWdlc3QpKTtcbn1cblxuZnVuY3Rpb24gaXNTeW5jYWJsZUZpbGUoZmlsZTogVEZpbGUpOiBib29sZWFuIHtcbiAgY29uc3QgbmFtZSA9IGZpbGUubmFtZS50b0xvd2VyQ2FzZSgpO1xuICBpZiAoaXNIaWRkZW5QYXRoKGZpbGUucGF0aCkgfHwgbmFtZS5zdGFydHNXaXRoKFwiLlwiKSB8fCBuYW1lID09PSBcIi5kc19zdG9yZVwiIHx8IG5hbWUgPT09IFwidGh1bWJzLmRiXCIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaXNIaWRkZW5QYXRoKHBhdGg6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGF0aChwYXRoKS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuICBpZiAoIW5vcm1hbGl6ZWQpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gbm9ybWFsaXplZC5zcGxpdChcIi9cIikuc29tZSgoc2VnbWVudCkgPT4gc2VnbWVudC5zdGFydHNXaXRoKFwiLlwiKSk7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZUxvY2FsUm9vdFBhdGgocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVBhdGgocGF0aC50cmltKCkpO1xuICBpZiAoIW5vcm1hbGl6ZWQgfHwgbm9ybWFsaXplZCA9PT0gVkFVTFRfUk9PVF9QQVRIIHx8IG5vcm1hbGl6ZWQgPT09IFwiLlwiKSB7XG4gICAgcmV0dXJuIFZBVUxUX1JPT1RfUEFUSDtcbiAgfVxuXG4gIHJldHVybiBub3JtYWxpemVkLnJlcGxhY2UoL15cXC8rLywgXCJcIikucmVwbGFjZSgvXFwvKyQvLCBcIlwiKSB8fCBWQVVMVF9ST09UX1BBVEg7XG59XG5cbmZ1bmN0aW9uIGRpc3BsYXlMb2NhbFJvb3RQYXRoKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBub3JtYWxpemVMb2NhbFJvb3RQYXRoKHBhdGgpO1xufVxuXG5mdW5jdGlvbiBpc0ltYWdlUGF0aChwYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIC9cXC4oYXZpZnxnaWZ8anBlP2d8cG5nfHN2Z3x3ZWJwKSQvaS50ZXN0KHBhdGgpO1xufVxuXG5mdW5jdGlvbiBwYXJzZVJlcG9zaXRvcnlVcmwoaW5wdXQ6IHN0cmluZyk6IEdpdEh1YlJlcG8gfCBudWxsIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IGlucHV0LnRyaW0oKS5yZXBsYWNlKC9cXC8kLywgXCJcIikucmVwbGFjZSgvXFwuZ2l0JC8sIFwiXCIpO1xuICBjb25zdCBodHRwc01hdGNoID0gL15odHRwcz86XFwvXFwvZ2l0aHViXFwuY29tXFwvKFteL10rKVxcLyhbXi9dKykkLy5leGVjKG5vcm1hbGl6ZWQpO1xuICBjb25zdCBzc2hNYXRjaCA9IC9eZ2l0QGdpdGh1YlxcLmNvbTooW14vXSspXFwvKFteL10rKSQvLmV4ZWMobm9ybWFsaXplZCk7XG4gIGNvbnN0IHNob3J0aGFuZE1hdGNoID0gL14oW14vXFxzXSspXFwvKFteL1xcc10rKSQvLmV4ZWMobm9ybWFsaXplZCk7XG4gIGNvbnN0IG1hdGNoID0gaHR0cHNNYXRjaCA/PyBzc2hNYXRjaCA/PyBzaG9ydGhhbmRNYXRjaDtcblxuICBpZiAoIW1hdGNoKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG93bmVyOiBtYXRjaFsxXSxcbiAgICByZXBvOiBtYXRjaFsyXVxuICB9O1xufVxuXG5mdW5jdGlvbiBlbmNvZGVHaXRIdWJQYXRoKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBwYXRoLnNwbGl0KFwiL1wiKS5tYXAoZW5jb2RlVVJJQ29tcG9uZW50KS5qb2luKFwiL1wiKTtcbn1cblxuZnVuY3Rpb24gaXNTYWZlQ29udGVudFBhdGgocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQYXRoKHBhdGgpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gIGNvbnN0IHNlZ21lbnRzID0gbm9ybWFsaXplZC5zcGxpdChcIi9cIik7XG4gIHJldHVybiBub3JtYWxpemVkLnN0YXJ0c1dpdGgoYCR7UkVNT1RFX0NPTlRFTlRfUk9PVH0vYCkgJiYgIXNlZ21lbnRzLnNvbWUoKHNlZ21lbnQpID0+IHNlZ21lbnQgPT09IFwiLi5cIiB8fCBzZWdtZW50ID09PSBcIlwiKTtcbn1cblxuZnVuY3Rpb24gdG9TdGF0dXNMYWJlbChzdGF0dXM6IExvY2FsRmlsZVN0YXRlW1wic3RhdHVzXCJdKTogc3RyaW5nIHtcbiAgc3dpdGNoIChzdGF0dXMpIHtcbiAgICBjYXNlIFwic3luY2VkXCI6XG4gICAgICByZXR1cm4gXCJcdTVERjJcdTU0MENcdTZCNjVcIjtcbiAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIHJldHVybiBcIlx1NURGMlx1NEZFRVx1NjUzOVwiO1xuICAgIGNhc2UgXCJkZWxldGVkXCI6XG4gICAgICByZXR1cm4gXCJcdThGRENcdTdBRUZcdTVERjJcdTUyMjBcdTk2NjRcIjtcbiAgICBjYXNlIFwiZmFpbGVkXCI6XG4gICAgICByZXR1cm4gXCJcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIjtcbiAgICBjYXNlIFwiZHJhZnRcIjpcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIFwiXHU2NzJBXHU1NDBDXHU2QjY1XCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gdG9TdGF0dXNDbGFzcyhzdGF0dXM6IExvY2FsRmlsZVN0YXRlW1wic3RhdHVzXCJdKTogc3RyaW5nIHtcbiAgc3dpdGNoIChzdGF0dXMpIHtcbiAgICBjYXNlIFwic3luY2VkXCI6XG4gICAgICByZXR1cm4gXCJpcy1zeW5jZWRcIjtcbiAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIHJldHVybiBcImlzLW1vZGlmaWVkXCI7XG4gICAgY2FzZSBcImRlbGV0ZWRcIjpcbiAgICAgIHJldHVybiBcImlzLWRlbGV0ZWRcIjtcbiAgICBjYXNlIFwiZmFpbGVkXCI6XG4gICAgICByZXR1cm4gXCJpcy1mYWlsZWRcIjtcbiAgICBjYXNlIFwiZHJhZnRcIjpcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIFwiaXMtZHJhZnRcIjtcbiAgfVxufVxuXG5mdW5jdGlvbiB0b1N0YXR1c0ljb24oc3RhdHVzOiBMb2NhbEZpbGVTdGF0ZVtcInN0YXR1c1wiXSk6IHN0cmluZyB7XG4gIHN3aXRjaCAoc3RhdHVzKSB7XG4gICAgY2FzZSBcInN5bmNlZFwiOlxuICAgICAgcmV0dXJuIFwiY2xvdWQtY2hlY2tcIjtcbiAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIHJldHVybiBcInBlbmNpbFwiO1xuICAgIGNhc2UgXCJkZWxldGVkXCI6XG4gICAgICByZXR1cm4gXCJjbG91ZC1vZmZcIjtcbiAgICBjYXNlIFwiZmFpbGVkXCI6XG4gICAgICByZXR1cm4gXCJhbGVydC10cmlhbmdsZVwiO1xuICAgIGNhc2UgXCJkcmFmdFwiOlxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gXCJmaWxlLXBlblwiO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRvU3luY0NlbnRlclN0YXR1c0xhYmVsKHN0YXR1czogU3luY0NlbnRlclN0YXR1cyk6IHN0cmluZyB7XG4gIHN3aXRjaCAoc3RhdHVzKSB7XG4gICAgY2FzZSBcInVucHVibGlzaGVkXCI6XG4gICAgICByZXR1cm4gXCJcdTY3MkNcdTU3MzBcdTY3MkFcdTUzRDFcdTVFMDNcIjtcbiAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIHJldHVybiBcIlx1NURGMlx1NEZFRVx1NjUzOVwiO1xuICAgIGNhc2UgXCJwdWJsaXNoZWRcIjpcbiAgICAgIHJldHVybiBcIlx1NURGMlx1NTNEMVx1NUUwM1wiO1xuICAgIGNhc2UgXCJsb2NhbERlbGV0ZWRcIjpcbiAgICAgIHJldHVybiBcIlx1NjcyQ1x1NTczMFx1NURGMlx1NTIyMFx1OTY2NFwiO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gc3RhdHVzO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRvU3luY0NlbnRlclN0YXR1c0NsYXNzKHN0YXR1czogU3luY0NlbnRlclN0YXR1cyk6IHN0cmluZyB7XG4gIHN3aXRjaCAoc3RhdHVzKSB7XG4gICAgY2FzZSBcInVucHVibGlzaGVkXCI6XG4gICAgICByZXR1cm4gXCJpcy1kcmFmdFwiO1xuICAgIGNhc2UgXCJtb2RpZmllZFwiOlxuICAgICAgcmV0dXJuIFwiaXMtbW9kaWZpZWRcIjtcbiAgICBjYXNlIFwicHVibGlzaGVkXCI6XG4gICAgICByZXR1cm4gXCJpcy1zeW5jZWRcIjtcbiAgICBjYXNlIFwibG9jYWxEZWxldGVkXCI6XG4gICAgICByZXR1cm4gXCJpcy1kZWxldGVkXCI7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBcImlzLWRyYWZ0XCI7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogR2l0SHViU3luY1NldHRpbmdzID0gREVGQVVMVF9TRVRUSU5HUztcbiAgZGF0YTogUGVyc2lzdGVkRGF0YSA9IERFRkFVTFRfREFUQTtcblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcblxuICAgIHRoaXMuYWRkUmliYm9uSWNvbihcImdpdC1icmFuY2hcIiwgXCJPYnNpZGlhbiBHaXQgU3luY2VyXCIsIChldnQpID0+IHtcbiAgICAgIHRoaXMuc2hvd1JpYmJvbk1lbnUoZXZ0KTtcbiAgICB9KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwib3Blbi1zeW5jLWNlbnRlclwiLFxuICAgICAgbmFtZTogXCJcdTYyNTNcdTVGMDBcdTU0MENcdTZCNjVcdTRFMkRcdTVGQzNcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB0aGlzLm9wZW5TeW5jQ2VudGVyKClcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgR2l0U3luY2VyU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFwiZWRpdG9yLW1lbnVcIiwgKG1lbnUpID0+IHtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuZ2V0Q3VycmVudEZpbGUoKTtcbiAgICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5hZGRBcnRpY2xlQ29udGV4dE1lbnVJdGVtcyhtZW51LCBmaWxlKTtcbiAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIGxvYWRTZXR0aW5ncygpIHtcbiAgICBjb25zdCBzYXZlZCA9IChhd2FpdCB0aGlzLmxvYWREYXRhKCkpIGFzIHsgc2V0dGluZ3M/OiBQYXJ0aWFsPEdpdEh1YlN5bmNTZXR0aW5ncz47IGRhdGE/OiBQZXJzaXN0ZWREYXRhIH0gfCBudWxsO1xuICAgIHRoaXMuc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MsIC4uLihzYXZlZD8uc2V0dGluZ3MgPz8ge30pIH07XG4gICAgdGhpcy5kYXRhID0geyAuLi5ERUZBVUxUX0RBVEEsIC4uLihzYXZlZD8uZGF0YSA/PyB7fSkgfTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVBbGxEYXRhKCkge1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEoe1xuICAgICAgc2V0dGluZ3M6IHRoaXMuc2V0dGluZ3MsXG4gICAgICBkYXRhOiB0aGlzLmRhdGFcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gIH1cblxuICBhc3luYyBtYXJrQ29ubmVjdGlvblN0YWxlKCkge1xuICAgIHRoaXMuZGF0YS5jb25uZWN0aW9uID0ge1xuICAgICAgc3RhdHVzOiBcInN0YWxlXCIsXG4gICAgICBtZXNzYWdlOiBcIlx1OTE0RFx1N0Y2RVx1NURGMlx1NTNEOFx1NjZGNFx1RkYwQ1x1OEJGN1x1OTFDRFx1NjVCMFx1NkQ0Qlx1OEJENVx1OEZERVx1NjNBNVx1MzAwMlwiXG4gICAgfTtcbiAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gIH1cblxuICBnZXRSZXBvc2l0b3J5KCk6IEdpdEh1YlJlcG8ge1xuICAgIGNvbnN0IHJlcG9zaXRvcnkgPSBwYXJzZVJlcG9zaXRvcnlVcmwodGhpcy5zZXR0aW5ncy5yZXBvc2l0b3J5VXJsKTtcbiAgICBpZiAoIXJlcG9zaXRvcnkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkdpdEh1YiBcdTRFRDNcdTVFOTNcdTU3MzBcdTU3NDBcdTY4M0NcdTVGMEZcdTRFMERcdTZCNjNcdTc4NkVcdTMwMDJcdTY1MkZcdTYzMDEgaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8uZ2l0XHUzMDAxZ2l0QGdpdGh1Yi5jb206b3duZXIvcmVwby5naXQgXHU2MjE2IG93bmVyL3JlcG9cdTMwMDJcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlcG9zaXRvcnk7XG4gIH1cblxuICB2YWxpZGF0ZUNvbmZpZygpIHtcbiAgICB0aGlzLmdldFJlcG9zaXRvcnkoKTtcblxuICAgIGlmICghdGhpcy5zZXR0aW5ncy5naXRodWJVc2VybmFtZS50cmltKCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1OEJGN1x1NTE0OFx1NTg2Qlx1NTE5OSBHaXRIdWIgVXNlcm5hbWVcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLmdpdGh1YlRva2VuLnRyaW0oKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4QkY3XHU1MTQ4XHU1ODZCXHU1MTk5IEdpdEh1YiBUb2tlblx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4QkY3XHU1MTQ4XHU1ODZCXHU1MTk5XHU3NkVFXHU2ODA3XHU1MjA2XHU2NTJGXHUzMDAyXCIpO1xuICAgIH1cbiAgfVxuXG4gIGdldEV4aXN0aW5nRm9sZGVyKHBhdGg6IHN0cmluZyk6IFRGb2xkZXIgfCBudWxsIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplTG9jYWxSb290UGF0aChwYXRoKTtcbiAgICBpZiAobm9ybWFsaXplZCA9PT0gVkFVTFRfUk9PVF9QQVRIKSB7XG4gICAgICByZXR1cm4gdGhpcy5hcHAudmF1bHQuZ2V0Um9vdCgpO1xuICAgIH1cblxuICAgIGNvbnN0IHRhcmdldCA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChub3JtYWxpemVkKTtcbiAgICByZXR1cm4gdGFyZ2V0IGluc3RhbmNlb2YgVEZvbGRlciA/IHRhcmdldCA6IG51bGw7XG4gIH1cblxuICBnZXRBbGxWYXVsdEZvbGRlcnMoKTogVEZvbGRlcltdIHtcbiAgICBjb25zdCBmb2xkZXJzID0gbmV3IE1hcDxzdHJpbmcsIFRGb2xkZXI+KCk7XG4gICAgZm9sZGVycy5zZXQoVkFVTFRfUk9PVF9QQVRILCB0aGlzLmFwcC52YXVsdC5nZXRSb290KCkpO1xuXG4gICAgdGhpcy5hcHAudmF1bHQuZ2V0QWxsTG9hZGVkRmlsZXMoKS5mb3JFYWNoKChlbnRyeSkgPT4ge1xuICAgICAgaWYgKGVudHJ5IGluc3RhbmNlb2YgVEZvbGRlciAmJiAhaXNIaWRkZW5QYXRoKGVudHJ5LnBhdGgpKSB7XG4gICAgICAgIGZvbGRlcnMuc2V0KG5vcm1hbGl6ZUxvY2FsUm9vdFBhdGgoZW50cnkucGF0aCksIGVudHJ5KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBBcnJheS5mcm9tKGZvbGRlcnMudmFsdWVzKCkpLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgIGNvbnN0IGFQYXRoID0gZGlzcGxheUxvY2FsUm9vdFBhdGgoYS5wYXRoKTtcbiAgICAgIGNvbnN0IGJQYXRoID0gZGlzcGxheUxvY2FsUm9vdFBhdGgoYi5wYXRoKTtcblxuICAgICAgaWYgKGFQYXRoID09PSBWQVVMVF9ST09UX1BBVEgpIHtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgfVxuXG4gICAgICBpZiAoYlBhdGggPT09IFZBVUxUX1JPT1RfUEFUSCkge1xuICAgICAgICByZXR1cm4gMTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGFQYXRoLmxvY2FsZUNvbXBhcmUoYlBhdGgsIFwiemgtQ05cIik7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzZXRMb2NhbFJvb3RQYXRoKHBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVMb2NhbFJvb3RQYXRoKHBhdGgpO1xuXG4gICAgY29uc3QgZm9sZGVyID0gdGhpcy5nZXRFeGlzdGluZ0ZvbGRlcihub3JtYWxpemVkKTtcbiAgICBpZiAoIWZvbGRlcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4QkU1XHU3NkVFXHU1RjU1XHU0RTBEXHU1QjU4XHU1NzI4XHVGRjBDXHU4QkY3XHU0RUNFIFZhdWx0IFx1NEUyRFx1OTAwOVx1NjJFOVx1NURGMlx1NjcwOVx1NzZFRVx1NUY1NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICB0aGlzLnNldHRpbmdzLmxvY2FsUm9vdFBhdGggPSBub3JtYWxpemVkID09PSBWQVVMVF9ST09UX1BBVEggPyBWQVVMVF9ST09UX1BBVEggOiBmb2xkZXIucGF0aDtcbiAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5ncygpO1xuICB9XG5cbiAgZ2V0Q3VycmVudEZpbGUoKTogVEZpbGUgfCBudWxsIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICByZXR1cm4gZmlsZSBpbnN0YW5jZW9mIFRGaWxlICYmIGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIgPyBmaWxlIDogbnVsbDtcbiAgfVxuXG4gIGlzSW5zaWRlUm9vdChmaWxlOiBURmlsZSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHJvb3QgPSBub3JtYWxpemVMb2NhbFJvb3RQYXRoKHRoaXMuc2V0dGluZ3MubG9jYWxSb290UGF0aCk7XG4gICAgaWYgKHJvb3QgPT09IFZBVUxUX1JPT1RfUEFUSCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZpbGUucGF0aCA9PT0gcm9vdCB8fCBmaWxlLnBhdGguc3RhcnRzV2l0aChgJHtyb290fS9gKTtcbiAgfVxuXG4gIHJlbGF0aXZlUGF0aChmaWxlOiBURmlsZSk6IHN0cmluZyB7XG4gICAgY29uc3Qgcm9vdCA9IG5vcm1hbGl6ZUxvY2FsUm9vdFBhdGgodGhpcy5zZXR0aW5ncy5sb2NhbFJvb3RQYXRoKTtcbiAgICBjb25zdCBmdWxsUGF0aCA9IG5vcm1hbGl6ZVBhdGgoZmlsZS5wYXRoKTtcblxuICAgIGlmIChyb290ID09PSBWQVVMVF9ST09UX1BBVEgpIHtcbiAgICAgIHJldHVybiBmdWxsUGF0aDtcbiAgICB9XG5cbiAgICBpZiAoZnVsbFBhdGggPT09IHJvb3QpIHtcbiAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cblxuICAgIGlmIChmdWxsUGF0aC5zdGFydHNXaXRoKGAke3Jvb3R9L2ApKSB7XG4gICAgICByZXR1cm4gZnVsbFBhdGguc2xpY2Uocm9vdC5sZW5ndGggKyAxKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVsbFBhdGg7XG4gIH1cblxuICByZW1vdGVQYXRoKGZpbGU6IFRGaWxlKTogc3RyaW5nIHtcbiAgICBjb25zdCByZWxhdGl2ZSA9IG5vcm1hbGl6ZVBhdGgodGhpcy5yZWxhdGl2ZVBhdGgoZmlsZSkpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gICAgY29uc3QgcGF0aCA9IG5vcm1hbGl6ZVBhdGgoYCR7UkVNT1RFX0NPTlRFTlRfUk9PVH0vJHtyZWxhdGl2ZX1gKS5yZXBsYWNlKC9eXFwvKy8sIFwiXCIpO1xuXG4gICAgaWYgKCFyZWxhdGl2ZSB8fCAhaXNTYWZlQ29udGVudFBhdGgocGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1OEZEQ1x1N0FFRlx1OERFRlx1NUY4NFx1NUZDNVx1OTg3Qlx1NEY0RFx1NEU4RVx1NEVEM1x1NUU5MyBjb250ZW50IFx1NzZFRVx1NUY1NVx1NTE4NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcGF0aDtcbiAgfVxuXG4gIGxvY2FsUGF0aEZyb21SZW1vdGVQYXRoKHJlbW90ZVBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgY29uc3Qgbm9ybWFsaXplZFJlbW90ZVBhdGggPSBub3JtYWxpemVQYXRoKHJlbW90ZVBhdGgpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG5cbiAgICBpZiAoIWlzU2FmZUNvbnRlbnRQYXRoKG5vcm1hbGl6ZWRSZW1vdGVQYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4RkRDXHU3QUVGXHU4REVGXHU1Rjg0XHU1RkM1XHU5ODdCXHU0RjREXHU0RThFXHU0RUQzXHU1RTkzIGNvbnRlbnQgXHU3NkVFXHU1RjU1XHU1MTg1XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IHJlbGF0aXZlID0gbm9ybWFsaXplZFJlbW90ZVBhdGguc2xpY2UoUkVNT1RFX0NPTlRFTlRfUk9PVC5sZW5ndGggKyAxKTtcbiAgICBjb25zdCBsb2NhbFJvb3QgPSBub3JtYWxpemVMb2NhbFJvb3RQYXRoKHRoaXMuc2V0dGluZ3MubG9jYWxSb290UGF0aCk7XG4gICAgaWYgKGxvY2FsUm9vdCA9PT0gVkFVTFRfUk9PVF9QQVRIKSB7XG4gICAgICByZXR1cm4gbm9ybWFsaXplUGF0aChyZWxhdGl2ZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG5vcm1hbGl6ZVBhdGgoYCR7bG9jYWxSb290fS8ke3JlbGF0aXZlfWApO1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlRm9sZGVyUGF0aChmb2xkZXJQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGF0aChmb2xkZXJQYXRoKS5yZXBsYWNlKC9cXC8kLywgXCJcIik7XG5cbiAgICBpZiAoIW5vcm1hbGl6ZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBwYXJ0cyA9IG5vcm1hbGl6ZWQuc3BsaXQoXCIvXCIpO1xuICAgIGxldCBjdXJyZW50ID0gXCJcIjtcblxuICAgIGZvciAoY29uc3QgcGFydCBvZiBwYXJ0cykge1xuICAgICAgY3VycmVudCA9IGN1cnJlbnQgPyBgJHtjdXJyZW50fS8ke3BhcnR9YCA6IHBhcnQ7XG4gICAgICBjb25zdCBlbnRyeSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChjdXJyZW50KTtcblxuICAgICAgaWYgKGVudHJ5IGluc3RhbmNlb2YgVEZvbGRlcikge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGVudHJ5KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgXHU2NUUwXHU2Q0Q1XHU1MjFCXHU1RUZBXHU3NkVFXHU1RjU1XHVGRjBDXHU4REVGXHU1Rjg0XHU1REYyXHU4OEFCXHU2NTg3XHU0RUY2XHU1MzYwXHU3NTI4XHVGRjFBJHtjdXJyZW50fWApO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVGb2xkZXIoY3VycmVudCk7XG4gICAgfVxuICB9XG5cbiAgZ2V0U3RhdGUoZmlsZTogVEZpbGUpOiBMb2NhbEZpbGVTdGF0ZSB7XG4gICAgcmV0dXJuIHRoaXMuZGF0YS5maWxlc1tmaWxlLnBhdGhdID8/IHsgc3RhdHVzOiBcImRyYWZ0XCIgfTtcbiAgfVxuXG4gIGFzeW5jIGNhY2hlRWZmZWN0aXZlU3RhdGUoZmlsZTogVEZpbGUsIHN0YXRlOiBMb2NhbEZpbGVTdGF0ZSkge1xuICAgIGNvbnN0IGN1cnJlbnQgPSB0aGlzLmRhdGEuZmlsZXNbZmlsZS5wYXRoXTtcblxuICAgIGlmIChcbiAgICAgIGN1cnJlbnQ/LnJlbW90ZVBhdGggPT09IHN0YXRlLnJlbW90ZVBhdGggJiZcbiAgICAgIGN1cnJlbnQ/LnNoYSA9PT0gc3RhdGUuc2hhICYmXG4gICAgICBjdXJyZW50Py5zdGF0dXMgPT09IHN0YXRlLnN0YXR1cyAmJlxuICAgICAgY3VycmVudD8ubGFzdFN5bmNlZEF0ID09PSBzdGF0ZS5sYXN0U3luY2VkQXQgJiZcbiAgICAgIGN1cnJlbnQ/Lmxhc3RTeW5jZWRIYXNoID09PSBzdGF0ZS5sYXN0U3luY2VkSGFzaCAmJlxuICAgICAgY3VycmVudD8uaHRtbFVybCA9PT0gc3RhdGUuaHRtbFVybFxuICAgICkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuZGF0YS5maWxlc1tmaWxlLnBhdGhdID0gc3RhdGU7XG4gICAgYXdhaXQgdGhpcy5zYXZlQWxsRGF0YSgpO1xuICB9XG5cbiAgYXN5bmMgZ2V0RWZmZWN0aXZlU3RhdGUoZmlsZTogVEZpbGUpOiBQcm9taXNlPExvY2FsRmlsZVN0YXRlPiB7XG4gICAgbGV0IHN0YXRlID0gdGhpcy5nZXRTdGF0ZShmaWxlKTtcblxuICAgIHRyeSB7XG4gICAgICBzdGF0ZSA9IGF3YWl0IHRoaXMuc3luY0ZpbGVTdGF0ZShmaWxlKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIEtlZXAgdGhlIGxhc3QgbG9jYWwgc3RhdGUgd2hlbiBHaXRIdWIgaXMgdGVtcG9yYXJpbHkgdW5hdmFpbGFibGUuXG4gICAgfVxuXG4gICAgaWYgKHN0YXRlLnN0YXR1cyAhPT0gXCJzeW5jZWRcIiB8fCAhc3RhdGUubGFzdFN5bmNlZEhhc2gpIHtcbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBjdXJyZW50SGFzaCA9IGhhc2hDb250ZW50KGNvbnRlbnQpO1xuXG4gICAgaWYgKGN1cnJlbnRIYXNoICE9PSBzdGF0ZS5sYXN0U3luY2VkSGFzaCkge1xuICAgICAgY29uc3QgbmV4dFN0YXRlID0geyAuLi5zdGF0ZSwgc3RhdHVzOiBcIm1vZGlmaWVkXCIgYXMgY29uc3QgfTtcbiAgICAgIGF3YWl0IHRoaXMuY2FjaGVFZmZlY3RpdmVTdGF0ZShmaWxlLCBuZXh0U3RhdGUpO1xuICAgICAgcmV0dXJuIG5leHRTdGF0ZTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLmNhY2hlRWZmZWN0aXZlU3RhdGUoZmlsZSwgc3RhdGUpO1xuICAgIHJldHVybiBzdGF0ZTtcbiAgfVxuXG4gIGFzeW5jIHNldFN0YXRlKGZpbGU6IFRGaWxlLCBwYXRjaDogUGFydGlhbDxMb2NhbEZpbGVTdGF0ZT4pIHtcbiAgICB0aGlzLmRhdGEuZmlsZXNbZmlsZS5wYXRoXSA9IHsgLi4udGhpcy5nZXRTdGF0ZShmaWxlKSwgLi4ucGF0Y2ggfTtcbiAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoU3RhdHVzQmFyKCk7XG4gIH1cblxuICBhc3luYyByZWZyZXNoU3RhdHVzQmFyKCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZVRlbXBsYXRlRnJvbnRtYXR0ZXIoZmlsZTogVEZpbGUpIHtcbiAgICBpZiAoIXRoaXMuaXNJbnNpZGVSb290KGZpbGUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdTVGNTNcdTUyNERcdTY1ODdcdTdBRTBcdTRFMERcdTU3MjggTG9jYWwgUm9vdCBQYXRoIFx1NTE4NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBwYXJzZWQgPSBwYXJzZUZyb250bWF0dGVyKGNvbnRlbnQpO1xuXG4gICAgaWYgKE9iamVjdC5rZXlzKHBhcnNlZC5kYXRhKS5sZW5ndGggPiAwKSB7XG4gICAgICBuZXcgTm90aWNlKFwiXHU1RjUzXHU1MjREXHU2NTg3XHU3QUUwXHU1REYyXHU3RUNGXHU1QjU4XHU1NzI4XHU2NTg3XHU3QUUwXHU1QzVFXHU2MDI3XHUzMDAyXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IG5leHRDb250ZW50ID0gYCR7YnVpbGRGcm9udG1hdHRlcihmaWxlKX0ke2NvbnRlbnR9YDtcbiAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgbmV4dENvbnRlbnQpO1xuICAgIG5ldyBOb3RpY2UoXCJcdTY1ODdcdTdBRTBcdTVDNUVcdTYwMjdcdTVERjJcdTYzRDJcdTUxNjVcdTMwMDJcIik7XG4gIH1cblxuICBnZXRTeW5jTWVudVRpdGxlKHN0YXRlOiBMb2NhbEZpbGVTdGF0ZSk6IHN0cmluZyB7XG4gICAgc3dpdGNoIChzdGF0ZS5zdGF0dXMpIHtcbiAgICAgIGNhc2UgXCJtb2RpZmllZFwiOlxuICAgICAgY2FzZSBcImRlbGV0ZWRcIjpcbiAgICAgICAgcmV0dXJuIFwiXHU5MUNEXHU2NUIwXHU1NDBDXHU2QjY1XCI7XG4gICAgICBjYXNlIFwiZmFpbGVkXCI6XG4gICAgICAgIHJldHVybiBcIlx1NTE4RFx1NkIyMVx1NTQwQ1x1NkI2NVwiO1xuICAgICAgY2FzZSBcInN5bmNlZFwiOlxuICAgICAgICByZXR1cm4gXCJcdTVERjJcdTU0MENcdTZCNjVcIjtcbiAgICAgIGNhc2UgXCJkcmFmdFwiOlxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIFwiXHU1NDBDXHU2QjY1XHU1MjMwIEdpdEh1YlwiO1xuICAgIH1cbiAgfVxuXG4gIGJ1aWxkQWN0aW9uQ29udGV4dChmaWxlOiBURmlsZSwgc3RhdGU6IExvY2FsRmlsZVN0YXRlLCBoYXNQcm9wZXJ0aWVzOiBib29sZWFuKTogQXJ0aWNsZUFjdGlvbkNvbnRleHQge1xuICAgIGNvbnN0IGluUm9vdCA9IHRoaXMuaXNJbnNpZGVSb290KGZpbGUpO1xuICAgIGNvbnN0IHN5bmNUaXRsZSA9IHRoaXMuZ2V0U3luY01lbnVUaXRsZShzdGF0ZSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZmlsZSxcbiAgICAgIGluUm9vdCxcbiAgICAgIGhhc1Byb3BlcnRpZXMsXG4gICAgICBzdGF0ZSxcbiAgICAgIHN5bmNUaXRsZSxcbiAgICAgIGNhblN5bmM6IGluUm9vdCAmJiBzdGF0ZS5zdGF0dXMgIT09IFwic3luY2VkXCIsXG4gICAgICBjYW5EZWxldGVSZW1vdGU6IEJvb2xlYW4oc3RhdGUuc2hhKSAmJiBzdGF0ZS5zdGF0dXMgIT09IFwiZGVsZXRlZFwiLFxuICAgICAgY2FuT3BlblJlbW90ZTogQm9vbGVhbihzdGF0ZS5odG1sVXJsIHx8IHN0YXRlLnJlbW90ZVBhdGgpICYmIHN0YXRlLnN0YXR1cyAhPT0gXCJkZWxldGVkXCIsXG4gICAgICBjYW5JbnNlcnRQcm9wZXJ0aWVzOiBpblJvb3QgJiYgIWhhc1Byb3BlcnRpZXNcbiAgICB9O1xuICB9XG5cbiAgYXN5bmMgZ2V0QWN0aW9uQ29udGV4dChmaWxlOiBURmlsZSk6IFByb21pc2U8QXJ0aWNsZUFjdGlvbkNvbnRleHQ+IHtcbiAgICBjb25zdCBbc3RhdGUsIGNvbnRlbnRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW3RoaXMuZ2V0RWZmZWN0aXZlU3RhdGUoZmlsZSksIHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSldKTtcbiAgICBjb25zdCBwcm9wZXJ0aWVzID0gcGFyc2VGcm9udG1hdHRlcihjb250ZW50KS5kYXRhO1xuICAgIHJldHVybiB0aGlzLmJ1aWxkQWN0aW9uQ29udGV4dChmaWxlLCBzdGF0ZSwgT2JqZWN0LmtleXMocHJvcGVydGllcykubGVuZ3RoID4gMCk7XG4gIH1cblxuICBnZXRDYWNoZWRBY3Rpb25Db250ZXh0KGZpbGU6IFRGaWxlKTogQXJ0aWNsZUFjdGlvbkNvbnRleHQge1xuICAgIGNvbnN0IHByb3BlcnRpZXMgPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpbGVDYWNoZShmaWxlKT8uZnJvbnRtYXR0ZXIgPz8ge307XG4gICAgY29uc3Qgc3RhdGUgPSB0aGlzLmdldFN0YXRlKGZpbGUpO1xuICAgIHJldHVybiB0aGlzLmJ1aWxkQWN0aW9uQ29udGV4dChmaWxlLCBzdGF0ZSwgT2JqZWN0LmtleXMocHJvcGVydGllcykubGVuZ3RoID4gMCk7XG4gIH1cblxuICBhc3luYyBzaG93UmliYm9uTWVudShldnQ6IE1vdXNlRXZlbnQpIHtcbiAgICBjb25zdCBtZW51ID0gbmV3IE1lbnUoKTtcbiAgICBjb25zdCBjdXJyZW50RmlsZSA9IHRoaXMuZ2V0Q3VycmVudEZpbGUoKTtcbiAgICBjb25zdCBjb250ZXh0ID0gY3VycmVudEZpbGUgPyBhd2FpdCB0aGlzLmdldEFjdGlvbkNvbnRleHQoY3VycmVudEZpbGUpIDogbnVsbDtcblxuICAgIG1lbnUuc2V0VXNlTmF0aXZlTWVudSh0cnVlKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShjb250ZXh0Py5zeW5jVGl0bGUgPz8gXCJcdTU0MENcdTZCNjVcdTUyMzAgR2l0SHViXCIpXG4gICAgICAgIC5zZXRJY29uKFwiY2xvdWQtdXBsb2FkXCIpXG4gICAgICAgIC5zZXREaXNhYmxlZCghY29udGV4dD8uY2FuU3luYylcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xuICAgICAgICAgIGlmIChjb250ZXh0KSB7XG4gICAgICAgICAgICB2b2lkIHRoaXMucnVuV2l0aE5vdGljZShhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMuc3luY0ZpbGVUb0dpdEh1Yihjb250ZXh0LmZpbGUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJcdTU0MENcdTZCNjVcdTRFMkRcdTVGQzNcIilcbiAgICAgICAgLnNldEljb24oXCJsaXN0LXRyZWVcIilcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdGhpcy5vcGVuU3luY0NlbnRlcigpKVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJcdTYyNTNcdTVGMDAgR2l0SHViXCIpXG4gICAgICAgIC5zZXRJY29uKFwiZXh0ZXJuYWwtbGlua1wiKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQ/LmNhbk9wZW5SZW1vdGUpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICBpZiAoY29udGV4dCkge1xuICAgICAgICAgICAgdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoKCkgPT4gdGhpcy5vcGVuUmVtb3RlVXJsRm9yRmlsZShjb250ZXh0LmZpbGUpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIlx1NjNEMlx1NTE2NVx1NjU4N1x1N0FFMFx1NUM1RVx1NjAyN1wiKVxuICAgICAgICAuc2V0SWNvbihcImZpbGUtcGx1cy0yXCIpXG4gICAgICAgIC5zZXREaXNhYmxlZCghY29udGV4dD8uY2FuSW5zZXJ0UHJvcGVydGllcylcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xuICAgICAgICAgIGlmIChjb250ZXh0KSB7XG4gICAgICAgICAgICB2b2lkIHRoaXMucnVuV2l0aE5vdGljZSgoKSA9PiB0aGlzLmVuc3VyZVRlbXBsYXRlRnJvbnRtYXR0ZXIoY29udGV4dC5maWxlKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICk7XG4gICAgbWVudS5hZGRTZXBhcmF0b3IoKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShjb250ZXh0Py5zdGF0ZS5zdGF0dXMgPT09IFwiZGVsZXRlZFwiID8gXCJcdThGRENcdTdBRUZcdTVERjJcdTUyMjBcdTk2NjRcIiA6IFwiXHU1MjIwXHU5NjY0XHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XCIpXG4gICAgICAgIC5zZXRJY29uKFwiY2xvdWQtb2ZmXCIpXG4gICAgICAgIC5zZXRXYXJuaW5nKHRydWUpXG4gICAgICAgIC5zZXREaXNhYmxlZCghY29udGV4dD8uY2FuRGVsZXRlUmVtb3RlKVxuICAgICAgICAub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbnRleHQpIHtcbiAgICAgICAgICAgIHZvaWQgdGhpcy5ydW5XaXRoTm90aWNlKCgpID0+IHRoaXMuZGVsZXRlUmVtb3RlRmlsZShjb250ZXh0LmZpbGUpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgKTtcbiAgICBtZW51LmFkZFNlcGFyYXRvcigpO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiXHU2RDRCXHU4QkQ1IEdpdEh1YiBcdThGREVcdTYzQTVcIilcbiAgICAgICAgLnNldEljb24oXCJnbG9iZVwiKVxuICAgICAgICAub25DbGljaygoKSA9PlxuICAgICAgICAgIHZvaWQgdGhpcy5ydW5XaXRoTm90aWNlKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMudGVzdENvbm5lY3Rpb24oKTtcbiAgICAgICAgICB9KVxuICAgICAgICApXG4gICAgKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIlx1OEJCRVx1N0Y2RVwiKVxuICAgICAgICAuc2V0SWNvbihcInNldHRpbmdzXCIpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMub3BlblBsdWdpblNldHRpbmdzKCkpXG4gICAgKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShgXHU3MjQ4XHU2NzJDIHYke3RoaXMubWFuaWZlc3QudmVyc2lvbn1gKVxuICAgICAgICAuc2V0SWNvbihcImluZm9cIilcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdGhpcy5vcGVuVmVyc2lvbkluZm8oKSlcbiAgICApO1xuICAgIG1lbnUuc2hvd0F0TW91c2VFdmVudChldnQpO1xuICB9XG5cbiAgYWRkQXJ0aWNsZUNvbnRleHRNZW51SXRlbXMobWVudTogTWVudSwgZmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCBjb250ZXh0ID0gdGhpcy5nZXRDYWNoZWRBY3Rpb25Db250ZXh0KGZpbGUpO1xuXG4gICAgbWVudS5hZGRTZXBhcmF0b3IoKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShjb250ZXh0LnN5bmNUaXRsZSlcbiAgICAgICAgLnNldEljb24oXCJjbG91ZC11cGxvYWRcIilcbiAgICAgICAgLnNldERpc2FibGVkKCFjb250ZXh0LmNhblN5bmMpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+XG4gICAgICAgICAgdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5zeW5jRmlsZVRvR2l0SHViKGNvbnRleHQuZmlsZSk7XG4gICAgICAgICAgfSlcbiAgICAgICAgKVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJcdTYyNTNcdTVGMDAgR2l0SHViXCIpXG4gICAgICAgIC5zZXRJY29uKFwiZXh0ZXJuYWwtbGlua1wiKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQuY2FuT3BlblJlbW90ZSlcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoKCkgPT4gdGhpcy5vcGVuUmVtb3RlVXJsRm9yRmlsZShjb250ZXh0LmZpbGUpKSlcbiAgICApO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiXHU2M0QyXHU1MTY1XHU2NTg3XHU3QUUwXHU1QzVFXHU2MDI3XCIpXG4gICAgICAgIC5zZXRJY29uKFwiZmlsZS1wbHVzLTJcIilcbiAgICAgICAgLnNldERpc2FibGVkKCFjb250ZXh0LmNhbkluc2VydFByb3BlcnRpZXMpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHZvaWQgdGhpcy5ydW5XaXRoTm90aWNlKCgpID0+IHRoaXMuZW5zdXJlVGVtcGxhdGVGcm9udG1hdHRlcihjb250ZXh0LmZpbGUpKSlcbiAgICApO1xuICAgIG1lbnUuYWRkU2VwYXJhdG9yKCk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoY29udGV4dC5zdGF0ZS5zdGF0dXMgPT09IFwiZGVsZXRlZFwiID8gXCJcdThGRENcdTdBRUZcdTVERjJcdTUyMjBcdTk2NjRcIiA6IFwiXHU1MjIwXHU5NjY0XHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XCIpXG4gICAgICAgIC5zZXRJY29uKFwiY2xvdWQtb2ZmXCIpXG4gICAgICAgIC5zZXRXYXJuaW5nKHRydWUpXG4gICAgICAgIC5zZXREaXNhYmxlZCghY29udGV4dC5jYW5EZWxldGVSZW1vdGUpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHZvaWQgdGhpcy5ydW5XaXRoTm90aWNlKCgpID0+IHRoaXMuZGVsZXRlUmVtb3RlRmlsZShjb250ZXh0LmZpbGUpKSlcbiAgICApO1xuICB9XG5cbiAgb3BlblBsdWdpblNldHRpbmdzKCkge1xuICAgIGNvbnN0IGludGVybmFsQXBwID0gdGhpcy5hcHAgYXMgQXBwICYge1xuICAgICAgc2V0dGluZz86IHtcbiAgICAgICAgb3BlbjogKCkgPT4gdm9pZDtcbiAgICAgICAgb3BlblRhYkJ5SWQ/OiAoaWQ6IHN0cmluZykgPT4gdm9pZDtcbiAgICAgIH07XG4gICAgfTtcblxuICAgIGlmICghaW50ZXJuYWxBcHAuc2V0dGluZykge1xuICAgICAgbmV3IE5vdGljZShcIlx1NUY1M1x1NTI0RFx1NzNBRlx1NTg4M1x1NEUwRFx1NjUyRlx1NjMwMVx1NzZGNFx1NjNBNVx1OERGM1x1OEY2Q1x1NjNEMlx1NEVGNlx1OEJCRVx1N0Y2RVx1MzAwMlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpbnRlcm5hbEFwcC5zZXR0aW5nLm9wZW4oKTtcbiAgICBpbnRlcm5hbEFwcC5zZXR0aW5nLm9wZW5UYWJCeUlkPy4odGhpcy5tYW5pZmVzdC5pZCk7XG4gIH1cblxuICBvcGVuVmVyc2lvbkluZm8oKSB7XG4gICAgbmV3IFBsdWdpblZlcnNpb25Nb2RhbCh0aGlzLmFwcCwgdGhpcykub3BlbigpO1xuICB9XG5cbiAgb3BlblN5bmNDZW50ZXIoKSB7XG4gICAgbmV3IFN5bmNDZW50ZXJNb2RhbCh0aGlzLmFwcCwgdGhpcykub3BlbigpO1xuICB9XG5cbiAgYXN5bmMgcnVuV2l0aE5vdGljZShhY3Rpb246ICgpID0+IFByb21pc2U8dm9pZD4pIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgYWN0aW9uKCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiXHU2NzJBXHU3N0U1XHU5NTE5XHU4QkVGXCI7XG4gICAgICBuZXcgTm90aWNlKG1lc3NhZ2UpO1xuICAgIH1cbiAgfVxuXG4gIGJ1aWxkR2l0SHViQXBpVXJsKHBhdGg6IHN0cmluZywgcGFyYW1zPzogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPik6IHN0cmluZyB7XG4gICAgY29uc3QgdXJsID0gbmV3IFVSTChgaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbSR7cGF0aH1gKTtcblxuICAgIE9iamVjdC5lbnRyaWVzKHBhcmFtcyA/PyB7fSkuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiB7XG4gICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgdXJsLnNlYXJjaFBhcmFtcy5zZXQoa2V5LCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gdXJsLnRvU3RyaW5nKCk7XG4gIH1cblxuICBidWlsZENvbnRlbnRBcGlQYXRoKHJlbW90ZVBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgY29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuZ2V0UmVwb3NpdG9yeSgpO1xuICAgIHJldHVybiBgL3JlcG9zLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlcG9zaXRvcnkub3duZXIpfS8ke2VuY29kZVVSSUNvbXBvbmVudChyZXBvc2l0b3J5LnJlcG8pfS9jb250ZW50cy8ke2VuY29kZUdpdEh1YlBhdGgocmVtb3RlUGF0aCl9YDtcbiAgfVxuXG4gIGJ1aWxkUmVwb0FwaVBhdGgoKTogc3RyaW5nIHtcbiAgICBjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5nZXRSZXBvc2l0b3J5KCk7XG4gICAgcmV0dXJuIGAvcmVwb3MvJHtlbmNvZGVVUklDb21wb25lbnQocmVwb3NpdG9yeS5vd25lcil9LyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlcG9zaXRvcnkucmVwbyl9YDtcbiAgfVxuXG4gIGJ1aWxkQnJhbmNoQXBpUGF0aCgpOiBzdHJpbmcge1xuICAgIHJldHVybiBgJHt0aGlzLmJ1aWxkUmVwb0FwaVBhdGgoKX0vYnJhbmNoZXMvJHtlbmNvZGVVUklDb21wb25lbnQodGhpcy5zZXR0aW5ncy5icmFuY2gudHJpbSgpKX1gO1xuICB9XG5cbiAgYnVpbGRHaXRUcmVlQXBpUGF0aCgpOiBzdHJpbmcge1xuICAgIGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLmdldFJlcG9zaXRvcnkoKTtcbiAgICByZXR1cm4gYC9yZXBvcy8ke2VuY29kZVVSSUNvbXBvbmVudChyZXBvc2l0b3J5Lm93bmVyKX0vJHtlbmNvZGVVUklDb21wb25lbnQocmVwb3NpdG9yeS5yZXBvKX0vZ2l0L3RyZWVzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKSl9YDtcbiAgfVxuXG4gIGJ1aWxkR2l0SHViQmxvYlVybChyZW1vdGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLmdldFJlcG9zaXRvcnkoKTtcbiAgICByZXR1cm4gYGh0dHBzOi8vZ2l0aHViLmNvbS8ke3JlcG9zaXRvcnkub3duZXJ9LyR7cmVwb3NpdG9yeS5yZXBvfS9ibG9iLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKSl9LyR7ZW5jb2RlR2l0SHViUGF0aChyZW1vdGVQYXRoKX1gO1xuICB9XG5cbiAgYXN5bmMgZ2l0aHViUmVxdWVzdDxUUmVzcG9uc2U+KFxuICAgIG1ldGhvZDogXCJHRVRcIiB8IFwiUFVUXCIgfCBcIkRFTEVURVwiLFxuICAgIHBhdGg6IHN0cmluZyxcbiAgICBwYXlsb2FkPzogdW5rbm93bixcbiAgICBwYXJhbXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+XG4gICk6IFByb21pc2U8VFJlc3BvbnNlPiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZEdpdEh1YkFwaVVybChwYXRoLCBwYXJhbXMpLFxuICAgICAgbWV0aG9kLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBY2NlcHQ6IFwiYXBwbGljYXRpb24vdm5kLmdpdGh1Yitqc29uXCIsXG4gICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHt0aGlzLnNldHRpbmdzLmdpdGh1YlRva2VuLnRyaW0oKX1gLFxuICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgICAgXCJYLUdpdEh1Yi1BcGktVmVyc2lvblwiOiBcIjIwMjItMTEtMjhcIlxuICAgICAgfSxcbiAgICAgIGJvZHk6IHBheWxvYWQgPyBKU09OLnN0cmluZ2lmeShwYXlsb2FkKSA6IHVuZGVmaW5lZFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA+PSA0MDApIHtcbiAgICAgIGxldCBlcnJvck1lc3NhZ2UgPSByZXNwb25zZS50ZXh0O1xuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJlc3BvbnNlLnRleHQpIGFzIEdpdEh1YkVycm9yUGF5bG9hZDtcbiAgICAgICAgaWYgKHBhcnNlZC5tZXNzYWdlKSB7XG4gICAgICAgICAgZXJyb3JNZXNzYWdlID0gcGFyc2VkLm1lc3NhZ2U7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBLZWVwIHJhdyByZXNwb25zZSB0ZXh0IHdoZW4gaXQgaXMgbm90IEpTT04uXG4gICAgICB9XG5cbiAgICAgIHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IocmVzcG9uc2Uuc3RhdHVzLCBlcnJvck1lc3NhZ2UgfHwgYEdpdEh1YiBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfWAsIG1ldGhvZCwgcGF0aCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3BvbnNlLmpzb24gYXMgVFJlc3BvbnNlO1xuICB9XG5cbiAgYXN5bmMgZ2V0UmVtb3RlQ29udGVudChyZW1vdGVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPEdpdEh1YkNvbnRlbnRSZXNwb25zZSB8IG51bGw+IHtcbiAgICBpZiAoIWlzU2FmZUNvbnRlbnRQYXRoKHJlbW90ZVBhdGgpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdThGRENcdTdBRUZcdThERUZcdTVGODRcdTVGQzVcdTk4N0JcdTRGNERcdTRFOEVcdTRFRDNcdTVFOTMgY29udGVudCBcdTc2RUVcdTVGNTVcdTUxODVcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZ2l0aHViUmVxdWVzdDxHaXRIdWJDb250ZW50UmVzcG9uc2UgfCBHaXRIdWJDb250ZW50UmVzcG9uc2VbXT4oXG4gICAgICAgIFwiR0VUXCIsXG4gICAgICAgIHRoaXMuYnVpbGRDb250ZW50QXBpUGF0aChyZW1vdGVQYXRoKSxcbiAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICB7IHJlZjogdGhpcy5zZXR0aW5ncy5icmFuY2gudHJpbSgpIH1cbiAgICAgICk7XG5cbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHJlc3VsdCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4RkRDXHU3QUVGXHU4REVGXHU1Rjg0XHU2MzA3XHU1NDExXHU3NkVFXHU1RjU1XHVGRjBDXHU0RTBEXHU4MEZEXHU0RjVDXHU0RTNBXHU2NTg3XHU3QUUwXHU1NDBDXHU2QjY1XHU3NkVFXHU2ODA3XHUzMDAyXCIpO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVzdWx0LnR5cGUgIT09IFwiZmlsZVwiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1OEZEQ1x1N0FFRlx1OERFRlx1NUY4NFx1NEUwRFx1NjYyRlx1NjY2RVx1OTAxQVx1NjU4N1x1NEVGNlx1RkYwQ1x1NEUwRFx1ODBGRFx1NEY1Q1x1NEUzQVx1NjU4N1x1N0FFMFx1NTQwQ1x1NkI2NVx1NzZFRVx1NjgwN1x1MzAwMlwiKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgR2l0SHViUmVxdWVzdEVycm9yICYmIGVycm9yLnN0YXR1cyA9PT0gNDA0KSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuXG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBhc3luYyBnZXRSZW1vdGVGaWxlQnl0ZXMocmVtb3RlUGF0aDogc3RyaW5nKTogUHJvbWlzZTx7IGNvbnRlbnQ6IFVpbnQ4QXJyYXk7IHJlbW90ZTogR2l0SHViQ29udGVudFJlc3BvbnNlIH0+IHtcbiAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLmdldFJlbW90ZUNvbnRlbnQocmVtb3RlUGF0aCk7XG5cbiAgICBpZiAoIXJlbW90ZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcdTRFMERcdTVCNThcdTU3MjhcdUZGMUEke3JlbW90ZVBhdGh9YCk7XG4gICAgfVxuXG4gICAgaWYgKHJlbW90ZS5lbmNvZGluZyAhPT0gXCJiYXNlNjRcIiB8fCAhcmVtb3RlLmNvbnRlbnQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgXHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHU1MTg1XHU1QkI5XHU3RjE2XHU3ODAxXHU0RTBEXHU1M0Q3XHU2NTJGXHU2MzAxXHVGRjFBJHtyZW1vdGVQYXRofWApO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBjb250ZW50OiBkZWNvZGVCYXNlNjRCeXRlcyhyZW1vdGUuY29udGVudCksXG4gICAgICByZW1vdGVcbiAgICB9O1xuICB9XG5cbiAgYXN5bmMgcHVsbFJlbW90ZUZpbGUocmVtb3RlUGF0aDogc3RyaW5nKSB7XG4gICAgdGhpcy52YWxpZGF0ZUNvbmZpZygpO1xuXG4gICAgY29uc3QgeyBjb250ZW50LCByZW1vdGUgfSA9IGF3YWl0IHRoaXMuZ2V0UmVtb3RlRmlsZUJ5dGVzKHJlbW90ZVBhdGgpO1xuICAgIGNvbnN0IGxvY2FsUGF0aCA9IHRoaXMubG9jYWxQYXRoRnJvbVJlbW90ZVBhdGgocmVtb3RlUGF0aCk7XG4gICAgY29uc3QgcGFyZW50UGF0aCA9IGxvY2FsUGF0aC5pbmNsdWRlcyhcIi9cIikgPyBsb2NhbFBhdGguc2xpY2UoMCwgbG9jYWxQYXRoLmxhc3RJbmRleE9mKFwiL1wiKSkgOiBcIlwiO1xuICAgIGF3YWl0IHRoaXMuZW5zdXJlRm9sZGVyUGF0aChwYXJlbnRQYXRoKTtcblxuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGxvY2FsUGF0aCk7XG4gICAgY29uc3QgaXNNYXJrZG93biA9IGxvY2FsUGF0aC50b0xvd2VyQ2FzZSgpLmVuZHNXaXRoKFwiLm1kXCIpO1xuICAgIGNvbnN0IHRleHRDb250ZW50ID0gaXNNYXJrZG93biA/IG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShjb250ZW50KSA6IFwiXCI7XG4gICAgbGV0IGZpbGU6IFRGaWxlO1xuXG4gICAgaWYgKGV4aXN0aW5nIGluc3RhbmNlb2YgVEZpbGUpIHtcbiAgICAgIGlmIChpc01hcmtkb3duKSB7XG4gICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShleGlzdGluZywgdGV4dENvbnRlbnQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5QmluYXJ5KGV4aXN0aW5nLCBjb250ZW50LmJ1ZmZlci5zbGljZShjb250ZW50LmJ5dGVPZmZzZXQsIGNvbnRlbnQuYnl0ZU9mZnNldCArIGNvbnRlbnQuYnl0ZUxlbmd0aCkpO1xuICAgICAgfVxuICAgICAgZmlsZSA9IGV4aXN0aW5nO1xuICAgIH0gZWxzZSBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgXHU2NUUwXHU2Q0Q1XHU2MkM5XHU1M0Q2XHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHVGRjBDXHU2NzJDXHU1NzMwXHU4REVGXHU1Rjg0XHU1REYyXHU4OEFCXHU3NkVFXHU1RjU1XHU1MzYwXHU3NTI4XHVGRjFBJHtsb2NhbFBhdGh9YCk7XG4gICAgfSBlbHNlIGlmIChpc01hcmtkb3duKSB7XG4gICAgICBmaWxlID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKGxvY2FsUGF0aCwgdGV4dENvbnRlbnQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBmaWxlID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlQmluYXJ5KGxvY2FsUGF0aCwgY29udGVudC5idWZmZXIuc2xpY2UoY29udGVudC5ieXRlT2Zmc2V0LCBjb250ZW50LmJ5dGVPZmZzZXQgKyBjb250ZW50LmJ5dGVMZW5ndGgpKTtcbiAgICB9XG5cbiAgICB0aGlzLmRhdGEuZmlsZXNbZmlsZS5wYXRoXSA9IHtcbiAgICAgIHJlbW90ZVBhdGgsXG4gICAgICBzaGE6IHJlbW90ZS5zaGEsXG4gICAgICBzdGF0dXM6IFwic3luY2VkXCIsXG4gICAgICBsYXN0U3luY2VkQXQ6IGZvcm1hdERhdGVUaW1lKG5ldyBEYXRlKCkpLFxuICAgICAgbGFzdFN5bmNlZEhhc2g6IGlzTWFya2Rvd24gPyBoYXNoQ29udGVudCh0ZXh0Q29udGVudCkgOiBoYXNoQnl0ZXMoY29udGVudC5idWZmZXIuc2xpY2UoY29udGVudC5ieXRlT2Zmc2V0LCBjb250ZW50LmJ5dGVPZmZzZXQgKyBjb250ZW50LmJ5dGVMZW5ndGgpKSxcbiAgICAgIGh0bWxVcmw6IHJlbW90ZS5odG1sX3VybCA/PyB0aGlzLmJ1aWxkR2l0SHViQmxvYlVybChyZW1vdGVQYXRoKVxuICAgIH07XG4gICAgYXdhaXQgdGhpcy5zYXZlQWxsRGF0YSgpO1xuICAgIGF3YWl0IHRoaXMucmVmcmVzaFN0YXR1c0JhcigpO1xuICB9XG5cbiAgY29sbGVjdFN5bmNhYmxlRmlsZXMoZm9sZGVyOiBURm9sZGVyLCBmaWxlczogVEZpbGVbXSA9IFtdKTogVEZpbGVbXSB7XG4gICAgZm9sZGVyLmNoaWxkcmVuLmZvckVhY2goKGVudHJ5KSA9PiB7XG4gICAgICBpZiAoZW50cnkgaW5zdGFuY2VvZiBURmlsZSAmJiBpc1N5bmNhYmxlRmlsZShlbnRyeSkpIHtcbiAgICAgICAgZmlsZXMucHVzaChlbnRyeSk7XG4gICAgICB9IGVsc2UgaWYgKGVudHJ5IGluc3RhbmNlb2YgVEZvbGRlciAmJiAhaXNIaWRkZW5QYXRoKGVudHJ5LnBhdGgpKSB7XG4gICAgICAgIHRoaXMuY29sbGVjdFN5bmNhYmxlRmlsZXMoZW50cnksIGZpbGVzKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBmaWxlcztcbiAgfVxuXG4gIGdldExvY2FsU3luY2FibGVGaWxlcygpOiBURmlsZVtdIHtcbiAgICBjb25zdCByb290ID0gdGhpcy5nZXRFeGlzdGluZ0ZvbGRlcih0aGlzLnNldHRpbmdzLmxvY2FsUm9vdFBhdGgpO1xuICAgIGlmICghcm9vdCkge1xuICAgICAgcmV0dXJuIFtdO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmNvbGxlY3RTeW5jYWJsZUZpbGVzKHJvb3QpXG4gICAgICAuZmlsdGVyKChmaWxlKSA9PiB0aGlzLmlzSW5zaWRlUm9vdChmaWxlKSlcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBhLnBhdGgubG9jYWxlQ29tcGFyZShiLnBhdGgsIFwiemgtQ05cIikpO1xuICB9XG5cbiAgYXN5bmMgZ2V0UmVtb3RlU3luY2FibGVGaWxlcygpOiBQcm9taXNlPE1hcDxzdHJpbmcsIFJlbW90ZVN5bmNGaWxlPj4ge1xuICAgIHRoaXMudmFsaWRhdGVDb25maWcoKTtcblxuICAgIGNvbnN0IHRyZWUgPSBhd2FpdCB0aGlzLmdpdGh1YlJlcXVlc3Q8R2l0SHViVHJlZVJlc3BvbnNlPihcIkdFVFwiLCB0aGlzLmJ1aWxkR2l0VHJlZUFwaVBhdGgoKSwgdW5kZWZpbmVkLCB7XG4gICAgICByZWN1cnNpdmU6IFwiMVwiXG4gICAgfSk7XG5cbiAgICBpZiAodHJlZS50cnVuY2F0ZWQpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJHaXRIdWIgXHU4RkQ0XHU1NkRFXHU3Njg0XHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XHU2ODExXHU4OEFCXHU2MjJBXHU2NUFEXHVGRjBDXHU1MjE3XHU4ODY4XHU1M0VGXHU4MEZEXHU0RTBEXHU1QjhDXHU2NTc0XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IHJlbW90ZUZpbGVzID0gbmV3IE1hcDxzdHJpbmcsIFJlbW90ZVN5bmNGaWxlPigpO1xuXG4gICAgdHJlZS50cmVlLmZvckVhY2goKGVudHJ5KSA9PiB7XG4gICAgICBjb25zdCBmaWxlTmFtZSA9IGVudHJ5LnBhdGguc3BsaXQoXCIvXCIpLnBvcCgpID8/IFwiXCI7XG4gICAgICBpZiAoZW50cnkudHlwZSAhPT0gXCJibG9iXCIgfHwgIWVudHJ5LnBhdGguc3RhcnRzV2l0aChgJHtSRU1PVEVfQ09OVEVOVF9ST09UfS9gKSB8fCBmaWxlTmFtZS5zdGFydHNXaXRoKFwiLlwiKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmICghaXNTYWZlQ29udGVudFBhdGgoZW50cnkucGF0aCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICByZW1vdGVGaWxlcy5zZXQoZW50cnkucGF0aCwge1xuICAgICAgICByZW1vdGVQYXRoOiBlbnRyeS5wYXRoLFxuICAgICAgICBzaGE6IGVudHJ5LnNoYSxcbiAgICAgICAgaHRtbFVybDogdGhpcy5idWlsZEdpdEh1YkJsb2JVcmwoZW50cnkucGF0aClcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJlbW90ZUZpbGVzO1xuICB9XG5cbiAgYXN5bmMgYnVpbGRTeW5jQ2VudGVySXRlbXMoKTogUHJvbWlzZTxTeW5jQ2VudGVySXRlbVtdPiB7XG4gICAgdGhpcy52YWxpZGF0ZUNvbmZpZygpO1xuXG4gICAgY29uc3QgW3JlbW90ZUZpbGVzLCBsb2NhbEZpbGVzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgIHRoaXMuZ2V0UmVtb3RlU3luY2FibGVGaWxlcygpLFxuICAgICAgUHJvbWlzZS5yZXNvbHZlKHRoaXMuZ2V0TG9jYWxTeW5jYWJsZUZpbGVzKCkpXG4gICAgXSk7XG4gICAgY29uc3QgaXRlbXM6IFN5bmNDZW50ZXJJdGVtW10gPSBbXTtcbiAgICBjb25zdCBzZWVuUmVtb3RlUGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICAgIGZvciAoY29uc3QgZmlsZSBvZiBsb2NhbEZpbGVzKSB7XG4gICAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5yZW1vdGVQYXRoKGZpbGUpO1xuICAgICAgY29uc3QgcmVtb3RlID0gcmVtb3RlRmlsZXMuZ2V0KHJlbW90ZVBhdGgpO1xuICAgICAgY29uc3Qgc3RhdGUgPSB0aGlzLmdldFN0YXRlKGZpbGUpO1xuICAgICAgY29uc3QgdGV4dENvbnRlbnQgPSBmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiID8gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKSA6IFwiXCI7XG4gICAgICBjb25zdCBiaW5hcnlDb250ZW50ID0gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIiA/IHRleHRCeXRlcyh0ZXh0Q29udGVudCkuYnVmZmVyIDogYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZEJpbmFyeShmaWxlKTtcbiAgICAgIGNvbnN0IGN1cnJlbnRIYXNoID0gZmlsZS5leHRlbnNpb24gPT09IFwibWRcIiA/IGhhc2hDb250ZW50KHRleHRDb250ZW50KSA6IGhhc2hCeXRlcyhiaW5hcnlDb250ZW50KTtcbiAgICAgIGNvbnN0IGN1cnJlbnRCbG9iU2hhID0gYXdhaXQgZ2l0QmxvYlNoYShiaW5hcnlDb250ZW50KTtcbiAgICAgIGxldCBzdGF0dXM6IFN5bmNDZW50ZXJTdGF0dXM7XG5cbiAgICAgIHNlZW5SZW1vdGVQYXRocy5hZGQocmVtb3RlUGF0aCk7XG5cbiAgICAgIGlmICghcmVtb3RlKSB7XG4gICAgICAgIHN0YXR1cyA9IFwidW5wdWJsaXNoZWRcIjtcbiAgICAgIH0gZWxzZSBpZiAocmVtb3RlLnNoYSA9PT0gY3VycmVudEJsb2JTaGEpIHtcbiAgICAgICAgc3RhdHVzID0gXCJwdWJsaXNoZWRcIjtcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUuc2hhID09PSBjdXJyZW50QmxvYlNoYSAmJiBzdGF0ZS5zdGF0dXMgPT09IFwic3luY2VkXCIpIHtcbiAgICAgICAgc3RhdHVzID0gXCJwdWJsaXNoZWRcIjtcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUubGFzdFN5bmNlZEhhc2ggJiYgc3RhdGUubGFzdFN5bmNlZEhhc2ggPT09IGN1cnJlbnRIYXNoICYmIHN0YXRlLnNoYSA9PT0gcmVtb3RlLnNoYSkge1xuICAgICAgICBzdGF0dXMgPSBcInB1Ymxpc2hlZFwiO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RhdHVzID0gXCJtb2RpZmllZFwiO1xuICAgICAgfVxuXG4gICAgICBpdGVtcy5wdXNoKHtcbiAgICAgICAgaWQ6IGBsb2NhbDoke2ZpbGUucGF0aH1gLFxuICAgICAgICBuYW1lOiBmaWxlLm5hbWUsXG4gICAgICAgIHN0YXR1cyxcbiAgICAgICAgbG9jYWxQYXRoOiBmaWxlLnBhdGgsXG4gICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIGZvbGRlclBhdGg6IHJlbW90ZVBhdGguc2xpY2UoMCwgTWF0aC5tYXgocmVtb3RlUGF0aC5sYXN0SW5kZXhPZihcIi9cIiksIFJFTU9URV9DT05URU5UX1JPT1QubGVuZ3RoKSksXG4gICAgICAgIGZpbGUsXG4gICAgICAgIHJlbW90ZSxcbiAgICAgICAgc3RhdGVcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJlbW90ZUZpbGVzLmZvckVhY2goKHJlbW90ZSwgcmVtb3RlUGF0aCkgPT4ge1xuICAgICAgaWYgKHNlZW5SZW1vdGVQYXRocy5oYXMocmVtb3RlUGF0aCkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBuYW1lID0gcmVtb3RlUGF0aC5zcGxpdChcIi9cIikucG9wKCkgPz8gcmVtb3RlUGF0aDtcbiAgICAgIGl0ZW1zLnB1c2goe1xuICAgICAgICBpZDogYHJlbW90ZToke3JlbW90ZVBhdGh9YCxcbiAgICAgICAgbmFtZSxcbiAgICAgICAgc3RhdHVzOiBcImxvY2FsRGVsZXRlZFwiLFxuICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICBmb2xkZXJQYXRoOiByZW1vdGVQYXRoLnNsaWNlKDAsIE1hdGgubWF4KHJlbW90ZVBhdGgubGFzdEluZGV4T2YoXCIvXCIpLCBSRU1PVEVfQ09OVEVOVF9ST09ULmxlbmd0aCkpLFxuICAgICAgICByZW1vdGVcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIGl0ZW1zLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgIGNvbnN0IHN0YXR1c09yZGVyOiBSZWNvcmQ8U3luY0NlbnRlclN0YXR1cywgbnVtYmVyPiA9IHtcbiAgICAgICAgdW5wdWJsaXNoZWQ6IDAsXG4gICAgICAgIG1vZGlmaWVkOiAxLFxuICAgICAgICBwdWJsaXNoZWQ6IDIsXG4gICAgICAgIGxvY2FsRGVsZXRlZDogM1xuICAgICAgfTtcblxuICAgICAgcmV0dXJuIHN0YXR1c09yZGVyW2Euc3RhdHVzXSAtIHN0YXR1c09yZGVyW2Iuc3RhdHVzXSB8fCBhLnJlbW90ZVBhdGgubG9jYWxlQ29tcGFyZShiLnJlbW90ZVBhdGgsIFwiemgtQ05cIik7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBkZWxldGVSZW1vdGVQYXRoKHJlbW90ZVBhdGg6IHN0cmluZykge1xuICAgIHRoaXMudmFsaWRhdGVDb25maWcoKTtcblxuICAgIGlmICghaXNTYWZlQ29udGVudFBhdGgocmVtb3RlUGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1OEZEQ1x1N0FFRlx1OERFRlx1NUY4NFx1NUZDNVx1OTg3Qlx1NEY0RFx1NEU4RVx1NEVEM1x1NUU5MyBjb250ZW50IFx1NzZFRVx1NUY1NVx1NTE4NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLmdldFJlbW90ZUNvbnRlbnQocmVtb3RlUGF0aCk7XG4gICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgIG5ldyBOb3RpY2UoYFx1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlx1NEUwRFx1NUI1OFx1NTcyOFx1RkYxQSR7cmVtb3RlUGF0aH1gKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLmdpdGh1YlJlcXVlc3Q8R2l0SHViRGVsZXRlUmVzcG9uc2U+KFwiREVMRVRFXCIsIHRoaXMuYnVpbGRDb250ZW50QXBpUGF0aChyZW1vdGVQYXRoKSwge1xuICAgICAgbWVzc2FnZTogYHN5bmM6IGRlbGV0ZSAke3JlbW90ZVBhdGh9YCxcbiAgICAgIHNoYTogcmVtb3RlLnNoYSxcbiAgICAgIGJyYW5jaDogdGhpcy5zZXR0aW5ncy5icmFuY2gudHJpbSgpXG4gICAgfSk7XG5cbiAgICBPYmplY3QuZW50cmllcyh0aGlzLmRhdGEuZmlsZXMpLmZvckVhY2goKFtsb2NhbFBhdGgsIHN0YXRlXSkgPT4ge1xuICAgICAgaWYgKHN0YXRlLnJlbW90ZVBhdGggPT09IHJlbW90ZVBhdGgpIHtcbiAgICAgICAgdGhpcy5kYXRhLmZpbGVzW2xvY2FsUGF0aF0gPSB7XG4gICAgICAgICAgLi4uc3RhdGUsXG4gICAgICAgICAgc2hhOiB1bmRlZmluZWQsXG4gICAgICAgICAgaHRtbFVybDogdW5kZWZpbmVkLFxuICAgICAgICAgIHN0YXR1czogXCJkZWxldGVkXCJcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gIH1cblxuICBhc3luYyBzeW5jRmlsZVN0YXRlKGZpbGU6IFRGaWxlKTogUHJvbWlzZTxMb2NhbEZpbGVTdGF0ZT4ge1xuICAgIGlmICghdGhpcy5pc0luc2lkZVJvb3QoZmlsZSkgfHwgIWlzU3luY2FibGVGaWxlKGZpbGUpKSB7XG4gICAgICByZXR1cm4geyBzdGF0dXM6IFwiZHJhZnRcIiB9O1xuICAgIH1cblxuICAgIHRoaXMudmFsaWRhdGVDb25maWcoKTtcblxuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLnJlbW90ZVBhdGgoZmlsZSk7XG4gICAgY29uc3QgY3VycmVudCA9IHRoaXMuZ2V0U3RhdGUoZmlsZSk7XG4gICAgY29uc3QgcmVtb3RlID0gYXdhaXQgdGhpcy5nZXRSZW1vdGVDb250ZW50KHJlbW90ZVBhdGgpO1xuXG4gICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgIGNvbnN0IG5leHRTdGF0ZTogTG9jYWxGaWxlU3RhdGUgPSBjdXJyZW50LnNoYVxuICAgICAgICA/IHtcbiAgICAgICAgICAgIC4uLmN1cnJlbnQsXG4gICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgICAgc2hhOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBodG1sVXJsOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBzdGF0dXM6IFwiZGVsZXRlZFwiXG4gICAgICAgICAgfVxuICAgICAgICA6IHsgcmVtb3RlUGF0aCwgc3RhdHVzOiBcImRyYWZ0XCIgfTtcblxuICAgICAgdGhpcy5kYXRhLmZpbGVzW2ZpbGUucGF0aF0gPSBuZXh0U3RhdGU7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gICAgICByZXR1cm4gbmV4dFN0YXRlO1xuICAgIH1cblxuICAgIGNvbnN0IG5leHRTdGF0ZTogTG9jYWxGaWxlU3RhdGUgPSB7XG4gICAgICAuLi5jdXJyZW50LFxuICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIHNoYTogcmVtb3RlLnNoYSxcbiAgICAgIGh0bWxVcmw6IHJlbW90ZS5odG1sX3VybCA/PyB0aGlzLmJ1aWxkR2l0SHViQmxvYlVybChyZW1vdGVQYXRoKSxcbiAgICAgIHN0YXR1czogXCJzeW5jZWRcIlxuICAgIH07XG5cbiAgICBpZiAoY3VycmVudC5zaGEgIT09IHJlbW90ZS5zaGEpIHtcbiAgICAgIG5leHRTdGF0ZS5sYXN0U3luY2VkSGFzaCA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICB0aGlzLmRhdGEuZmlsZXNbZmlsZS5wYXRoXSA9IG5leHRTdGF0ZTtcbiAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gICAgcmV0dXJuIG5leHRTdGF0ZTtcbiAgfVxuXG4gIGFzeW5jIHRlc3RDb25uZWN0aW9uKCk6IFByb21pc2U8Q29ubmVjdGlvblN0YXRlPiB7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMudmFsaWRhdGVDb25maWcoKTtcbiAgICAgIGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLmdldFJlcG9zaXRvcnkoKTtcbiAgICAgIGNvbnN0IHVzZXIgPSBhd2FpdCB0aGlzLmdpdGh1YlJlcXVlc3Q8R2l0SHViVXNlclJlc3BvbnNlPihcIkdFVFwiLCBcIi91c2VyXCIpO1xuXG4gICAgICBjb25zdCByZXBvID0gYXdhaXQgdGhpcy5naXRodWJSZXF1ZXN0PEdpdEh1YlJlcG9SZXNwb25zZT4oXCJHRVRcIiwgdGhpcy5idWlsZFJlcG9BcGlQYXRoKCkpO1xuICAgICAgYXdhaXQgdGhpcy5naXRodWJSZXF1ZXN0PHVua25vd24+KFwiR0VUXCIsIHRoaXMuYnVpbGRCcmFuY2hBcGlQYXRoKCkpO1xuXG4gICAgICBpZiAodXNlci5sb2dpbi50b0xvd2VyQ2FzZSgpICE9PSB0aGlzLnNldHRpbmdzLmdpdGh1YlVzZXJuYW1lLnRyaW0oKS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVG9rZW4gXHU3NTI4XHU2MjM3XHU0RTNBICR7dXNlci5sb2dpbn1cdUZGMENcdTRFMEVcdTkxNERcdTdGNkVcdTc2ODQgR2l0SHViIFVzZXJuYW1lIFx1NEUwRFx1NEUwMFx1ODFGNFx1MzAwMmApO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXJlcG8ucGVybWlzc2lvbnM/LmFkbWluICYmICFyZXBvLnBlcm1pc3Npb25zPy5tYWludGFpbiAmJiAhcmVwby5wZXJtaXNzaW9ucz8ucHVzaCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYFRva2VuIFx1NUJGOSAke3JlcG8uZnVsbF9uYW1lfSBcdTZDQTFcdTY3MDlcdTUxOTlcdTY3NDNcdTk2NTBcdTMwMDJcdThCRjdcdTc4NkVcdThCQTQgRmluZS1ncmFpbmVkIHRva2VuIFx1NURGMlx1NjM4OFx1Njc0M1x1OEJFNVx1NEVEM1x1NUU5M1x1RkYwQ1x1NUU3Nlx1NUMwNiBDb250ZW50cyBcdThCQkVcdTdGNkVcdTRFM0EgUmVhZCBhbmQgd3JpdGVcdTMwMDJgXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHN0YXRlOiBDb25uZWN0aW9uU3RhdGUgPSB7XG4gICAgICAgIHN0YXR1czogXCJzdWNjZXNzXCIsXG4gICAgICAgIG1lc3NhZ2U6IGBcdThGREVcdTYzQTVcdTYyMTBcdTUyOUZcdUZGMUEke3JlcG9zaXRvcnkub3duZXJ9LyR7cmVwb3NpdG9yeS5yZXBvfUAke3RoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKX1gLFxuICAgICAgICBjaGVja2VkQXQ6IGZvcm1hdERhdGVUaW1lKG5ldyBEYXRlKCkpXG4gICAgICB9O1xuICAgICAgdGhpcy5kYXRhLmNvbm5lY3Rpb24gPSBzdGF0ZTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZUFsbERhdGEoKTtcbiAgICAgIG5ldyBOb3RpY2Uoc3RhdGUubWVzc2FnZSk7XG4gICAgICByZXR1cm4gc3RhdGU7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiXHU4RkRFXHU2M0E1XHU1OTMxXHU4RDI1XCI7XG4gICAgICBjb25zdCBzdGF0ZTogQ29ubmVjdGlvblN0YXRlID0ge1xuICAgICAgICBzdGF0dXM6IFwiZmFpbGVkXCIsXG4gICAgICAgIG1lc3NhZ2UsXG4gICAgICAgIGNoZWNrZWRBdDogZm9ybWF0RGF0ZVRpbWUobmV3IERhdGUoKSlcbiAgICAgIH07XG4gICAgICB0aGlzLmRhdGEuY29ubmVjdGlvbiA9IHN0YXRlO1xuICAgICAgYXdhaXQgdGhpcy5zYXZlQWxsRGF0YSgpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc3luY0ZpbGVUb0dpdEh1YihmaWxlOiBURmlsZSk6IFByb21pc2U8TG9jYWxGaWxlU3RhdGU+IHtcbiAgICB0aGlzLnZhbGlkYXRlQ29uZmlnKCk7XG5cbiAgICBpZiAoIXRoaXMuaXNJbnNpZGVSb290KGZpbGUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdTVGNTNcdTUyNERcdTY1ODdcdTdBRTBcdTRFMERcdTU3MjggTG9jYWwgUm9vdCBQYXRoIFx1NTE4NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICBpZiAoIWlzU3luY2FibGVGaWxlKGZpbGUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdTk2OTBcdTg1Q0ZcdTY1ODdcdTRFRjZcdTYyMTZcdTdDRkJcdTdFREZcdTY1ODdcdTRFRjZcdTRFMERcdTUxNDFcdThCQjhcdTU0MENcdTZCNjVcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgY29uc3QgaXNNYXJrZG93biA9IGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCI7XG4gICAgY29uc3QgY29udGVudCA9IGlzTWFya2Rvd24gPyBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpIDogXCJcIjtcbiAgICBjb25zdCBiaW5hcnlDb250ZW50ID0gaXNNYXJrZG93biA/IHRleHRCeXRlcyhjb250ZW50KS5idWZmZXIgOiBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkQmluYXJ5KGZpbGUpO1xuICAgIGNvbnN0IGN1cnJlbnRIYXNoID0gaXNNYXJrZG93biA/IGhhc2hDb250ZW50KGNvbnRlbnQpIDogaGFzaEJ5dGVzKGJpbmFyeUNvbnRlbnQpO1xuICAgIGNvbnN0IGN1cnJlbnRCbG9iU2hhID0gYXdhaXQgZ2l0QmxvYlNoYShiaW5hcnlDb250ZW50KTtcbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5yZW1vdGVQYXRoKGZpbGUpO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHRoaXMuZ2V0U3RhdGUoZmlsZSk7XG4gICAgICBjb25zdCBjYWNoZWRTaGEgPSBjdXJyZW50U3RhdGUucmVtb3RlUGF0aCA9PT0gcmVtb3RlUGF0aCA/IGN1cnJlbnRTdGF0ZS5zaGEgOiB1bmRlZmluZWQ7XG4gICAgICBsZXQgcmVzb2x2ZWRSZW1vdGU6IEdpdEh1YkNvbnRlbnRSZXNwb25zZSB8IG51bGwgPSBudWxsO1xuXG4gICAgICBjb25zdCBwdXRDb250ZW50ID0gKHNoYT86IHN0cmluZykgPT5cbiAgICAgICAgdGhpcy5naXRodWJSZXF1ZXN0PEdpdEh1YlB1dFJlc3BvbnNlPihcIlBVVFwiLCB0aGlzLmJ1aWxkQ29udGVudEFwaVBhdGgocmVtb3RlUGF0aCksIHtcbiAgICAgICAgICBtZXNzYWdlOiBgJHtzaGEgPyBcInN5bmM6IHVwZGF0ZVwiIDogXCJzeW5jOiBhZGRcIn0gJHtyZW1vdGVQYXRofWAsXG4gICAgICAgICAgY29udGVudDogaXNNYXJrZG93biA/IGVuY29kZUJhc2U2NChjb250ZW50KSA6IGVuY29kZUJ5dGVzQmFzZTY0KG5ldyBVaW50OEFycmF5KGJpbmFyeUNvbnRlbnQpKSxcbiAgICAgICAgICBicmFuY2g6IHRoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKSxcbiAgICAgICAgICAuLi4oc2hhID8geyBzaGEgfSA6IHt9KVxuICAgICAgICB9KTtcblxuICAgICAgbGV0IHJlc3VsdDogR2l0SHViUHV0UmVzcG9uc2U7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IHB1dENvbnRlbnQoY2FjaGVkU2hhKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEdpdEh1YlJlcXVlc3RFcnJvciAmJiAoZXJyb3Iuc3RhdHVzID09PSA0MDkgfHwgZXJyb3Iuc3RhdHVzID09PSA0MjIpKSB7XG4gICAgICAgICAgcmVzb2x2ZWRSZW1vdGUgPSBhd2FpdCB0aGlzLmdldFJlbW90ZUNvbnRlbnQocmVtb3RlUGF0aCk7XG4gICAgICAgICAgcmVzdWx0ID0gYXdhaXQgcHV0Q29udGVudChyZXNvbHZlZFJlbW90ZT8uc2hhKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBuZXh0U2hhID0gcmVzdWx0LmNvbnRlbnQ/LnNoYSA/PyBjdXJyZW50QmxvYlNoYSA/PyByZXNvbHZlZFJlbW90ZT8uc2hhID8/IGNhY2hlZFNoYTtcbiAgICAgIGNvbnN0IGh0bWxVcmwgPSByZXN1bHQuY29udGVudD8uaHRtbF91cmwgPz8gdGhpcy5idWlsZEdpdEh1YkJsb2JVcmwocmVtb3RlUGF0aCk7XG5cbiAgICAgIGNvbnN0IG5leHRTdGF0ZTogTG9jYWxGaWxlU3RhdGUgPSB7XG4gICAgICAgIHJlbW90ZVBhdGgsXG4gICAgICAgIHNoYTogbmV4dFNoYSxcbiAgICAgICAgc3RhdHVzOiBcInN5bmNlZFwiLFxuICAgICAgICBsYXN0U3luY2VkQXQ6IGZvcm1hdERhdGVUaW1lKG5ldyBEYXRlKCkpLFxuICAgICAgICBsYXN0U3luY2VkSGFzaDogY3VycmVudEhhc2gsXG4gICAgICAgIGh0bWxVcmxcbiAgICAgIH07XG5cbiAgICAgIGF3YWl0IHRoaXMuc2V0U3RhdGUoZmlsZSwgbmV4dFN0YXRlKTtcblxuICAgICAgbmV3IE5vdGljZShgXHU1NDBDXHU2QjY1XHU2MjEwXHU1MjlGXHVGRjFBJHtyZW1vdGVQYXRofWApO1xuICAgICAgcmV0dXJuIG5leHRTdGF0ZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgYXdhaXQgdGhpcy5zZXRTdGF0ZShmaWxlLCB7IHJlbW90ZVBhdGgsIHN0YXR1czogXCJmYWlsZWRcIiB9KTtcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEdpdEh1YlJlcXVlc3RFcnJvciAmJiBlcnJvci5zdGF0dXMgPT09IDQwNCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYEdpdEh1YiBcdTUxOTlcdTUxNjVcdThGRDRcdTU2REUgNDA0XHVGRjFBJHtyZW1vdGVQYXRofVx1MzAwMlx1OTAxQVx1NUUzOFx1NjYyRiBUb2tlbiBcdTZDQTFcdTY3MDlcdTYzODhcdTY3NDNcdTVGNTNcdTUyNERcdTRFRDNcdTVFOTNcdTMwMDFSZXBvc2l0b3J5IFVSTCBcdTRFMERcdTY2MkZcdTc2RUVcdTY4MDdcdTUzNUFcdTVCQTJcdTRFRDNcdTVFOTNcdUZGMENcdTYyMTZcdTUyMDZcdTY1MkYgJHt0aGlzLnNldHRpbmdzLmJyYW5jaC50cmltKCl9IFx1NEUwRFx1NTNFRlx1NTE5OVx1MzAwMlx1OEJGN1x1Nzg2RVx1OEJBNCB0b2tlbiBcdTc2ODQgUmVwb3NpdG9yeSBhY2Nlc3MgXHU1MzA1XHU1NDJCXHU4QkU1XHU0RUQzXHU1RTkzXHVGRjBDXHU0RTE0IENvbnRlbnRzIFx1NEUzQSBSZWFkIGFuZCB3cml0ZVx1MzAwMmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHN5bmNDdXJyZW50Tm90ZSgpIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5nZXRDdXJyZW50RmlsZSgpO1xuXG4gICAgaWYgKCFmaWxlKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdTVGNTNcdTUyNERcdTZDQTFcdTY3MDlcdTZGQzBcdTZEM0JcdTc2ODQgTWFya2Rvd24gXHU2NTg3XHU0RUY2XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuc3luY0ZpbGVUb0dpdEh1YihmaWxlKTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZVJlbW90ZUZpbGUoZmlsZTogVEZpbGUpIHtcbiAgICB0aGlzLnZhbGlkYXRlQ29uZmlnKCk7XG5cbiAgICBpZiAoIXRoaXMuaXNJbnNpZGVSb290KGZpbGUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdTVGNTNcdTUyNERcdTY1ODdcdTdBRTBcdTRFMERcdTU3MjggTG9jYWwgUm9vdCBQYXRoIFx1NTE4NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5yZW1vdGVQYXRoKGZpbGUpO1xuICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuZ2V0UmVtb3RlQ29udGVudChyZW1vdGVQYXRoKTtcblxuICAgIGlmICghcmVtb3RlKSB7XG4gICAgICBhd2FpdCB0aGlzLnNldFN0YXRlKGZpbGUsIHtcbiAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgc2hhOiB1bmRlZmluZWQsXG4gICAgICAgIGh0bWxVcmw6IHVuZGVmaW5lZCxcbiAgICAgICAgc3RhdHVzOiBcImRlbGV0ZWRcIlxuICAgICAgfSk7XG4gICAgICBuZXcgTm90aWNlKFwiXHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHU0RTBEXHU1QjU4XHU1NzI4XHUzMDAyXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuZ2l0aHViUmVxdWVzdDxHaXRIdWJEZWxldGVSZXNwb25zZT4oXCJERUxFVEVcIiwgdGhpcy5idWlsZENvbnRlbnRBcGlQYXRoKHJlbW90ZVBhdGgpLCB7XG4gICAgICBtZXNzYWdlOiBgc3luYzogZGVsZXRlICR7cmVtb3RlUGF0aH1gLFxuICAgICAgc2hhOiByZW1vdGUuc2hhLFxuICAgICAgYnJhbmNoOiB0aGlzLnNldHRpbmdzLmJyYW5jaC50cmltKClcbiAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuc2V0U3RhdGUoZmlsZSwge1xuICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIHNoYTogdW5kZWZpbmVkLFxuICAgICAgaHRtbFVybDogdW5kZWZpbmVkLFxuICAgICAgc3RhdHVzOiBcImRlbGV0ZWRcIlxuICAgIH0pO1xuICAgIG5ldyBOb3RpY2UoXCJcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcdTVERjJcdTUyMjBcdTk2NjRcdTMwMDJcIik7XG4gIH1cblxuICBhc3luYyBkZWxldGVDdXJyZW50UmVtb3RlTm90ZSgpIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5nZXRDdXJyZW50RmlsZSgpO1xuXG4gICAgaWYgKCFmaWxlKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdTVGNTNcdTUyNERcdTZDQTFcdTY3MDlcdTZGQzBcdTZEM0JcdTc2ODQgTWFya2Rvd24gXHU2NTg3XHU0RUY2XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlRmlsZShmaWxlKTtcbiAgfVxuXG4gIGFzeW5jIG9wZW5SZW1vdGVVcmxGb3JGaWxlKGZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3Qgc3RhdGUgPSBhd2FpdCB0aGlzLmdldEVmZmVjdGl2ZVN0YXRlKGZpbGUpO1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSBzdGF0ZS5yZW1vdGVQYXRoID8/IHRoaXMucmVtb3RlUGF0aChmaWxlKTtcblxuICAgIGlmIChzdGF0ZS5zdGF0dXMgPT09IFwiZGVsZXRlZFwiKSB7XG4gICAgICBuZXcgTm90aWNlKFwiXHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHU1REYyXHU3RUNGXHU1MjIwXHU5NjY0XHUzMDAyXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHdpbmRvdy5vcGVuKHN0YXRlLmh0bWxVcmwgPz8gdGhpcy5idWlsZEdpdEh1YkJsb2JVcmwocmVtb3RlUGF0aCksIFwiX2JsYW5rXCIpO1xuICB9XG5cbiAgYXN5bmMgb3BlblJlbW90ZVVybCgpIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5nZXRDdXJyZW50RmlsZSgpO1xuICAgIGlmICghZmlsZSkge1xuICAgICAgbmV3IE5vdGljZShcIlx1NUY1M1x1NTI0RFx1NkNBMVx1NjcwOVx1NkZDMFx1NkQzQlx1NjU4N1x1NEVGNlx1MzAwMlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLm9wZW5SZW1vdGVVcmxGb3JGaWxlKGZpbGUpO1xuICB9XG59XG5cbmNsYXNzIFN5bmNDZW50ZXJNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgcGx1Z2luOiBPYnNpZGlhbkdpdFN5bmNlclBsdWdpbjtcbiAgaXRlbXM6IFN5bmNDZW50ZXJJdGVtW10gPSBbXTtcbiAgc2VsZWN0ZWRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgY29sbGFwc2VkUGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgZGVsZXRlZFJlbW90ZVBhdGhzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGFjdGl2ZU9wZXJhdGlvbjogU3luY0NlbnRlck9wZXJhdGlvbiB8IG51bGwgPSBudWxsO1xuICBsb2FkaW5nID0gZmFsc2U7XG4gIGVycm9yTWVzc2FnZSA9IFwiXCI7XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW4pIHtcbiAgICBzdXBlcihhcHApO1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICB9XG5cbiAgb25PcGVuKCkge1xuICAgIHZvaWQgdGhpcy5yZWZyZXNoKCk7XG4gIH1cblxuICBhc3luYyByZWZyZXNoKCkge1xuICAgIHRoaXMubG9hZGluZyA9IHRydWU7XG4gICAgdGhpcy5lcnJvck1lc3NhZ2UgPSBcIlwiO1xuICAgIHRoaXMucmVuZGVyKCk7XG5cbiAgICB0cnkge1xuICAgICAgdGhpcy5pdGVtcyA9IHRoaXMuYXBwbHlEZWxldGVkUmVtb3RlT3ZlcnJpZGVzKGF3YWl0IHRoaXMucGx1Z2luLmJ1aWxkU3luY0NlbnRlckl0ZW1zKCkpO1xuICAgICAgY29uc3QgdmFsaWRJZHMgPSBuZXcgU2V0KHRoaXMuaXRlbXMubWFwKChpdGVtKSA9PiBpdGVtLmlkKSk7XG4gICAgICB0aGlzLnNlbGVjdGVkSWRzLmZvckVhY2goKGlkKSA9PiB7XG4gICAgICAgIGlmICghdmFsaWRJZHMuaGFzKGlkKSkge1xuICAgICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZGVsZXRlKGlkKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHRoaXMuZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIlx1NTQwQ1x1NkI2NVx1NEUyRFx1NUZDM1x1NTJBMFx1OEY3RFx1NTkzMVx1OEQyNVx1MzAwMlwiO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLmxvYWRpbmcgPSBmYWxzZTtcbiAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgfVxuICB9XG5cbiAgYXBwbHlEZWxldGVkUmVtb3RlT3ZlcnJpZGVzKGl0ZW1zOiBTeW5jQ2VudGVySXRlbVtdKTogU3luY0NlbnRlckl0ZW1bXSB7XG4gICAgcmV0dXJuIGl0ZW1zLmZsYXRNYXAoKGl0ZW0pID0+IHtcbiAgICAgIGlmICghdGhpcy5kZWxldGVkUmVtb3RlUGF0aHMuaGFzKGl0ZW0ucmVtb3RlUGF0aCkpIHtcbiAgICAgICAgcmV0dXJuIFtpdGVtXTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFpdGVtLmZpbGUpIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gW1xuICAgICAgICB7XG4gICAgICAgICAgLi4uaXRlbSxcbiAgICAgICAgICBzdGF0dXM6IFwidW5wdWJsaXNoZWRcIixcbiAgICAgICAgICByZW1vdGU6IHVuZGVmaW5lZFxuICAgICAgICB9XG4gICAgICBdO1xuICAgIH0pO1xuICB9XG5cbiAgZ2V0U2VsZWN0ZWRJdGVtcygpOiBTeW5jQ2VudGVySXRlbVtdIHtcbiAgICByZXR1cm4gdGhpcy5pdGVtcy5maWx0ZXIoKGl0ZW0pID0+IHRoaXMuc2VsZWN0ZWRJZHMuaGFzKGl0ZW0uaWQpKTtcbiAgfVxuXG4gIGdldFNlbGVjdGVkTG9jYWxJdGVtcygpOiBTeW5jQ2VudGVySXRlbVtdIHtcbiAgICByZXR1cm4gdGhpcy5nZXRTZWxlY3RlZEl0ZW1zKCkuZmlsdGVyKFxuICAgICAgKGl0ZW0pID0+IGl0ZW0uZmlsZSAmJiB0aGlzLnBsdWdpbi5pc0luc2lkZVJvb3QoaXRlbS5maWxlKSAmJiBpdGVtLnN0YXR1cyAhPT0gXCJwdWJsaXNoZWRcIiAmJiBpdGVtLnN0YXR1cyAhPT0gXCJsb2NhbERlbGV0ZWRcIlxuICAgICk7XG4gIH1cblxuICBnZXRTZWxlY3RlZFJlbW90ZU9ubHlJdGVtcygpOiBTeW5jQ2VudGVySXRlbVtdIHtcbiAgICByZXR1cm4gdGhpcy5nZXRTZWxlY3RlZEl0ZW1zKCkuZmlsdGVyKChpdGVtKSA9PiBpdGVtLnN0YXR1cyA9PT0gXCJsb2NhbERlbGV0ZWRcIik7XG4gIH1cblxuICBnZXRTZWxlY3RlZFJlbW90ZUl0ZW1zKCk6IFN5bmNDZW50ZXJJdGVtW10ge1xuICAgIHJldHVybiB0aGlzLmdldFNlbGVjdGVkSXRlbXMoKS5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0ucmVtb3RlKTtcbiAgfVxuXG4gIHNldEl0ZW1zU2VsZWN0ZWQoaXRlbXM6IFN5bmNDZW50ZXJJdGVtW10sIHNlbGVjdGVkOiBib29sZWFuKSB7XG4gICAgaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgICAgaWYgKHNlbGVjdGVkKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuYWRkKGl0ZW0uaWQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5zZWxlY3RlZElkcy5kZWxldGUoaXRlbS5pZCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICByZW5kZXJQcmVzZXJ2aW5nU2Nyb2xsKCkge1xuICAgIGNvbnN0IGJvZHlFbCA9IHRoaXMuY29udGVudEVsLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiLm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1jZW50ZXItYm9keVwiKTtcbiAgICBjb25zdCBtb2RhbENvbnRlbnRFbCA9IHRoaXMuY29udGVudEVsLnBhcmVudEVsZW1lbnQ7XG4gICAgY29uc3QgYm9keVNjcm9sbFRvcCA9IGJvZHlFbD8uc2Nyb2xsVG9wID8/IDA7XG4gICAgY29uc3QgbW9kYWxTY3JvbGxUb3AgPSBtb2RhbENvbnRlbnRFbD8uc2Nyb2xsVG9wID8/IDA7XG5cbiAgICB0aGlzLnJlbmRlcigpO1xuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICBjb25zdCBuZXh0Qm9keUVsID0gdGhpcy5jb250ZW50RWwucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXCIub2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLWNlbnRlci1ib2R5XCIpO1xuICAgICAgaWYgKG5leHRCb2R5RWwpIHtcbiAgICAgICAgbmV4dEJvZHlFbC5zY3JvbGxUb3AgPSBib2R5U2Nyb2xsVG9wO1xuICAgICAgfVxuICAgICAgaWYgKG1vZGFsQ29udGVudEVsKSB7XG4gICAgICAgIG1vZGFsQ29udGVudEVsLnNjcm9sbFRvcCA9IG1vZGFsU2Nyb2xsVG9wO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgdG9nZ2xlRGlyZWN0b3J5KHBhdGg6IHN0cmluZykge1xuICAgIGlmICh0aGlzLmNvbGxhcHNlZFBhdGhzLmhhcyhwYXRoKSkge1xuICAgICAgdGhpcy5jb2xsYXBzZWRQYXRocy5kZWxldGUocGF0aCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuY29sbGFwc2VkUGF0aHMuYWRkKHBhdGgpO1xuICAgIH1cbiAgICB0aGlzLnJlbmRlclByZXNlcnZpbmdTY3JvbGwoKTtcbiAgfVxuXG4gIGJ1aWxkVHJlZShpdGVtczogU3luY0NlbnRlckl0ZW1bXSk6IFN5bmNUcmVlTm9kZSB7XG4gICAgY29uc3Qgcm9vdDogU3luY1RyZWVOb2RlID0ge1xuICAgICAgbmFtZTogUkVNT1RFX0NPTlRFTlRfUk9PVCxcbiAgICAgIHBhdGg6IFJFTU9URV9DT05URU5UX1JPT1QsXG4gICAgICBjaGlsZHJlbjogbmV3IE1hcCgpLFxuICAgICAgaXRlbXM6IFtdXG4gICAgfTtcblxuICAgIGl0ZW1zLmZvckVhY2goKGl0ZW0pID0+IHtcbiAgICAgIGNvbnN0IHJlbGF0aXZlID0gaXRlbS5yZW1vdGVQYXRoLnN0YXJ0c1dpdGgoYCR7UkVNT1RFX0NPTlRFTlRfUk9PVH0vYClcbiAgICAgICAgPyBpdGVtLnJlbW90ZVBhdGguc2xpY2UoUkVNT1RFX0NPTlRFTlRfUk9PVC5sZW5ndGggKyAxKVxuICAgICAgICA6IGl0ZW0ucmVtb3RlUGF0aDtcbiAgICAgIGNvbnN0IHBhcnRzID0gcmVsYXRpdmUuc3BsaXQoXCIvXCIpO1xuICAgICAgY29uc3QgZm9sZGVycyA9IHBhcnRzLnNsaWNlKDAsIC0xKTtcbiAgICAgIGxldCBub2RlID0gcm9vdDtcblxuICAgICAgZm9sZGVycy5mb3JFYWNoKChmb2xkZXIpID0+IHtcbiAgICAgICAgY29uc3QgY2hpbGRQYXRoID0gYCR7bm9kZS5wYXRofS8ke2ZvbGRlcn1gO1xuICAgICAgICBsZXQgY2hpbGQgPSBub2RlLmNoaWxkcmVuLmdldChmb2xkZXIpO1xuICAgICAgICBpZiAoIWNoaWxkKSB7XG4gICAgICAgICAgY2hpbGQgPSB7XG4gICAgICAgICAgICBuYW1lOiBmb2xkZXIsXG4gICAgICAgICAgICBwYXRoOiBjaGlsZFBhdGgsXG4gICAgICAgICAgICBjaGlsZHJlbjogbmV3IE1hcCgpLFxuICAgICAgICAgICAgaXRlbXM6IFtdXG4gICAgICAgICAgfTtcbiAgICAgICAgICBub2RlLmNoaWxkcmVuLnNldChmb2xkZXIsIGNoaWxkKTtcbiAgICAgICAgfVxuICAgICAgICBub2RlID0gY2hpbGQ7XG4gICAgICB9KTtcblxuICAgICAgbm9kZS5pdGVtcy5wdXNoKGl0ZW0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJvb3Q7XG4gIH1cblxuICBnZXROb2RlSXRlbXMobm9kZTogU3luY1RyZWVOb2RlKTogU3luY0NlbnRlckl0ZW1bXSB7XG4gICAgY29uc3QgaXRlbXMgPSBbLi4ubm9kZS5pdGVtc107XG4gICAgbm9kZS5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZCkgPT4ge1xuICAgICAgaXRlbXMucHVzaCguLi50aGlzLmdldE5vZGVJdGVtcyhjaGlsZCkpO1xuICAgIH0pO1xuICAgIHJldHVybiBpdGVtcztcbiAgfVxuXG4gIHJlbmRlcigpIHtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuZW1wdHkoKTtcbiAgICBjb250ZW50RWwuYWRkQ2xhc3MoXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtY2VudGVyXCIpO1xuXG4gICAgdGhpcy5yZW5kZXJIZWFkZXIoY29udGVudEVsKTtcblxuICAgIGlmICh0aGlzLmxvYWRpbmcpIHtcbiAgICAgIGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLWNlbnRlci1lbXB0eVwiLCB0ZXh0OiBcIlx1NkI2M1x1NTcyOFx1NTJBMFx1OEY3RFx1NjcyQ1x1NTczMFx1NEUwRVx1OEZEQ1x1N0FFRlx1NTE4NVx1NUJCOS4uLlwiIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmVycm9yTWVzc2FnZSkge1xuICAgICAgY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtY2VudGVyLWVycm9yXCIsIHRleHQ6IHRoaXMuZXJyb3JNZXNzYWdlIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMucmVuZGVyU3VtbWFyeShjb250ZW50RWwpO1xuICAgIHRoaXMucmVuZGVyVG9vbGJhcihjb250ZW50RWwpO1xuXG4gICAgY29uc3QgYm9keUVsID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtY2VudGVyLWJvZHlcIiB9KTtcbiAgICBjb25zdCBzdGF0dXNlczogU3luY0NlbnRlclN0YXR1c1tdID0gW1widW5wdWJsaXNoZWRcIiwgXCJtb2RpZmllZFwiLCBcInB1Ymxpc2hlZFwiLCBcImxvY2FsRGVsZXRlZFwiXTtcbiAgICBzdGF0dXNlcy5mb3JFYWNoKChzdGF0dXMpID0+IHRoaXMucmVuZGVyU3RhdHVzU2VjdGlvbihib2R5RWwsIHN0YXR1cykpO1xuICB9XG5cbiAgcmVuZGVySGVhZGVyKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnN0IGhlYWRlckVsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1jZW50ZXItaGVhZGVyXCIgfSk7XG4gICAgY29uc3QgdGl0bGVHcm91cEVsID0gaGVhZGVyRWwuY3JlYXRlRGl2KCk7XG4gICAgY29uc3QgdGl0bGVSb3dFbCA9IHRpdGxlR3JvdXBFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLWNlbnRlci10aXRsZS1yb3dcIiB9KTtcbiAgICB0aXRsZVJvd0VsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIlx1NTQwQ1x1NkI2NVx1NEUyRFx1NUZDM1wiIH0pO1xuICAgIGNvbnN0IHJlZnJlc2hCdXR0b24gPSB0aXRsZVJvd0VsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItaWNvbi1idXR0b25cIiB9KTtcbiAgICByZWZyZXNoQnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgIHJlZnJlc2hCdXR0b24uc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCBcIlx1NTIzN1x1NjVCMFx1NTQwQ1x1NkI2NVx1NEUyRFx1NUZDM1wiKTtcbiAgICByZWZyZXNoQnV0dG9uLnNldEF0dHJpYnV0ZShcInRpdGxlXCIsIFwiXHU1MjM3XHU2NUIwXCIpO1xuICAgIHNldEljb24ocmVmcmVzaEJ1dHRvbiwgXCJyZWZyZXNoLWN3XCIpO1xuICAgIHJlZnJlc2hCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5yZWZyZXNoKCkpO1xuICAgIHRpdGxlR3JvdXBFbC5jcmVhdGVEaXYoe1xuICAgICAgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItbXV0ZWRcIixcbiAgICAgIHRleHQ6IGAke3RoaXMucGx1Z2luLnNldHRpbmdzLnJlcG9zaXRvcnlVcmwgfHwgXCJcdTY3MkFcdTkxNERcdTdGNkVcdTRFRDNcdTVFOTNcIn0gXHUwMEI3ICR7dGhpcy5wbHVnaW4uc2V0dGluZ3MuYnJhbmNoIHx8IFwiXHU2NzJBXHU5MTREXHU3RjZFXHU1MjA2XHU2NTJGXCJ9YFxuICAgIH0pO1xuICB9XG5cbiAgcmVuZGVyU3VtbWFyeShjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBzdW1tYXJ5RWwgPSBjb250YWluZXJFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXN1bW1hcnlcIiB9KTtcbiAgICBjb25zdCBzdGF0dXNlczogU3luY0NlbnRlclN0YXR1c1tdID0gW1widW5wdWJsaXNoZWRcIiwgXCJtb2RpZmllZFwiLCBcInB1Ymxpc2hlZFwiLCBcImxvY2FsRGVsZXRlZFwiXTtcblxuICAgIHN0YXR1c2VzLmZvckVhY2goKHN0YXR1cykgPT4ge1xuICAgICAgY29uc3QgY291bnQgPSB0aGlzLml0ZW1zLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5zdGF0dXMgPT09IHN0YXR1cykubGVuZ3RoO1xuICAgICAgY29uc3QgYmFkZ2VFbCA9IHN1bW1hcnlFbC5jcmVhdGVEaXYoe1xuICAgICAgICBjbHM6IGBvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtc3VtbWFyeS1pdGVtICR7dG9TeW5jQ2VudGVyU3RhdHVzQ2xhc3Moc3RhdHVzKX1gXG4gICAgICB9KTtcbiAgICAgIGJhZGdlRWwuY3JlYXRlU3Bhbih7IHRleHQ6IHRvU3luY0NlbnRlclN0YXR1c0xhYmVsKHN0YXR1cykgfSk7XG4gICAgICBiYWRnZUVsLmNyZWF0ZVNwYW4oeyB0ZXh0OiBTdHJpbmcoY291bnQpLCBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXN1bW1hcnktY291bnRcIiB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHJlbmRlclRvb2xiYXIoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3QgdG9vbGJhckVsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10b29sYmFyXCIgfSk7XG4gICAgY29uc3Qgc2VsZWN0ZWRMb2NhbENvdW50ID0gdGhpcy5nZXRTZWxlY3RlZExvY2FsSXRlbXMoKS5sZW5ndGg7XG4gICAgY29uc3Qgc2VsZWN0ZWRSZW1vdGVPbmx5Q291bnQgPSB0aGlzLmdldFNlbGVjdGVkUmVtb3RlT25seUl0ZW1zKCkubGVuZ3RoO1xuICAgIGNvbnN0IHNlbGVjdGVkUmVtb3RlQ291bnQgPSB0aGlzLmdldFNlbGVjdGVkUmVtb3RlSXRlbXMoKS5sZW5ndGg7XG4gICAgY29uc3QgaXNCdXN5ID0gdGhpcy5sb2FkaW5nIHx8IHRoaXMuYWN0aXZlT3BlcmF0aW9uICE9PSBudWxsO1xuXG4gICAgdG9vbGJhckVsLmNyZWF0ZURpdih7XG4gICAgICBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1tdXRlZFwiLFxuICAgICAgdGV4dDogYFx1NURGMlx1OTAwOVx1NjJFOSAke3RoaXMuc2VsZWN0ZWRJZHMuc2l6ZX0gXHU5ODc5YFxuICAgIH0pO1xuXG4gICAgY29uc3QgY3JlYXRlVG9vbGJhckJ1dHRvbiA9IChsYWJlbDogc3RyaW5nLCBpY29uOiBzdHJpbmcsIG9wZXJhdGlvbjogU3luY0NlbnRlck9wZXJhdGlvbikgPT4ge1xuICAgICAgY29uc3QgaXNSdW5uaW5nID0gdGhpcy5hY3RpdmVPcGVyYXRpb24gPT09IG9wZXJhdGlvbjtcbiAgICAgIGNvbnN0IGJ1dHRvbkVsID0gdG9vbGJhckVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIpO1xuICAgICAgYnV0dG9uRWwudHlwZSA9IFwiYnV0dG9uXCI7XG4gICAgICBidXR0b25FbC50b2dnbGVDbGFzcyhcImlzLXJ1bm5pbmdcIiwgaXNSdW5uaW5nKTtcbiAgICAgIGJ1dHRvbkVsLnNldEF0dHJpYnV0ZShcImFyaWEtYnVzeVwiLCBpc1J1bm5pbmcgPyBcInRydWVcIiA6IFwiZmFsc2VcIik7XG5cbiAgICAgIGNvbnN0IGljb25FbCA9IGJ1dHRvbkVsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1idXR0b24taWNvblwiIH0pO1xuICAgICAgc2V0SWNvbihpY29uRWwsIGlzUnVubmluZyA/IFwibG9hZGVyLWNpcmNsZVwiIDogaWNvbik7XG4gICAgICBidXR0b25FbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItYnV0dG9uLWxhYmVsXCIsIHRleHQ6IGlzUnVubmluZyA/IHRoaXMuZ2V0T3BlcmF0aW9uQnV0dG9uTGFiZWwob3BlcmF0aW9uKSA6IGxhYmVsIH0pO1xuXG4gICAgICByZXR1cm4gYnV0dG9uRWw7XG4gICAgfTtcblxuICAgIGNvbnN0IGRlbGV0ZUJ1dHRvbiA9IGNyZWF0ZVRvb2xiYXJCdXR0b24oYFx1NTIyMFx1OTY2NFx1OEZEQ1x1N0FFRiAoJHtzZWxlY3RlZFJlbW90ZUNvdW50fSlgLCBcImNsb3VkLW9mZlwiLCBcImRlbGV0ZVwiKTtcbiAgICBkZWxldGVCdXR0b24uZGlzYWJsZWQgPSBpc0J1c3kgfHwgc2VsZWN0ZWRSZW1vdGVDb3VudCA9PT0gMDtcbiAgICBkZWxldGVCdXR0b24uYWRkQ2xhc3MoXCJtb2Qtd2FybmluZ1wiKTtcbiAgICBkZWxldGVCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5kZWxldGVTZWxlY3RlZFJlbW90ZUZpbGVzKCkpO1xuXG4gICAgY29uc3QgcHVsbEJ1dHRvbiA9IGNyZWF0ZVRvb2xiYXJCdXR0b24oYFx1NjJDOVx1NTNENlx1OEZEQ1x1N0FFRiAoJHtzZWxlY3RlZFJlbW90ZU9ubHlDb3VudH0pYCwgXCJjbG91ZC1kb3dubG9hZFwiLCBcInB1bGxcIik7XG4gICAgcHVsbEJ1dHRvbi5kaXNhYmxlZCA9IGlzQnVzeSB8fCBzZWxlY3RlZFJlbW90ZU9ubHlDb3VudCA9PT0gMDtcbiAgICBwdWxsQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB2b2lkIHRoaXMucHVsbFNlbGVjdGVkUmVtb3RlRmlsZXMoKSk7XG5cbiAgICBjb25zdCBzeW5jQnV0dG9uID0gY3JlYXRlVG9vbGJhckJ1dHRvbihgXHU1NDBDXHU2QjY1XHU2NzJDXHU1NzMwICgke3NlbGVjdGVkTG9jYWxDb3VudH0pYCwgXCJjbG91ZC11cGxvYWRcIiwgXCJzeW5jXCIpO1xuICAgIHN5bmNCdXR0b24uZGlzYWJsZWQgPSBpc0J1c3kgfHwgc2VsZWN0ZWRMb2NhbENvdW50ID09PSAwO1xuICAgIHN5bmNCdXR0b24uYWRkQ2xhc3MoXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtYWN0aW9uXCIpO1xuICAgIHN5bmNCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5zeW5jU2VsZWN0ZWRMb2NhbEZpbGVzKCkpO1xuXG4gICAgaWYgKHRoaXMuYWN0aXZlT3BlcmF0aW9uKSB7XG4gICAgICBjb250YWluZXJFbC5jcmVhdGVEaXYoe1xuICAgICAgICBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLW9wZXJhdGlvbi1zdGF0dXNcIixcbiAgICAgICAgdGV4dDogdGhpcy5nZXRPcGVyYXRpb25TdGF0dXNUZXh0KHRoaXMuYWN0aXZlT3BlcmF0aW9uKVxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgZ2V0T3BlcmF0aW9uQnV0dG9uTGFiZWwob3BlcmF0aW9uOiBTeW5jQ2VudGVyT3BlcmF0aW9uKTogc3RyaW5nIHtcbiAgICBzd2l0Y2ggKG9wZXJhdGlvbikge1xuICAgICAgY2FzZSBcImRlbGV0ZVwiOlxuICAgICAgICByZXR1cm4gXCJcdTUyMjBcdTk2NjRcdTRFMkQuLi5cIjtcbiAgICAgIGNhc2UgXCJwdWxsXCI6XG4gICAgICAgIHJldHVybiBcIlx1NjJDOVx1NTNENlx1NEUyRC4uLlwiO1xuICAgICAgY2FzZSBcInN5bmNcIjpcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiBcIlx1NTQwQ1x1NkI2NVx1NEUyRC4uLlwiO1xuICAgIH1cbiAgfVxuXG4gIGdldE9wZXJhdGlvblN0YXR1c1RleHQob3BlcmF0aW9uOiBTeW5jQ2VudGVyT3BlcmF0aW9uKTogc3RyaW5nIHtcbiAgICBzd2l0Y2ggKG9wZXJhdGlvbikge1xuICAgICAgY2FzZSBcImRlbGV0ZVwiOlxuICAgICAgICByZXR1cm4gXCJcdTZCNjNcdTU3MjhcdTUyMjBcdTk2NjRcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcdUZGMENcdThCRjdcdTdBMERcdTUwMTkuLi5cIjtcbiAgICAgIGNhc2UgXCJwdWxsXCI6XG4gICAgICAgIHJldHVybiBcIlx1NkI2M1x1NTcyOFx1NjJDOVx1NTNENlx1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlx1RkYwQ1x1OEJGN1x1N0EwRFx1NTAxOS4uLlwiO1xuICAgICAgY2FzZSBcInN5bmNcIjpcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiBcIlx1NkI2M1x1NTcyOFx1NTQwQ1x1NkI2NVx1NjcyQ1x1NTczMFx1NjU4N1x1NEVGNlx1RkYwQ1x1OEJGN1x1N0EwRFx1NTAxOS4uLlwiO1xuICAgIH1cbiAgfVxuXG4gIHJlbmRlclN0YXR1c1NlY3Rpb24oY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBzdGF0dXM6IFN5bmNDZW50ZXJTdGF0dXMpIHtcbiAgICBjb25zdCBzZWN0aW9uSXRlbXMgPSB0aGlzLml0ZW1zLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5zdGF0dXMgPT09IHN0YXR1cyk7XG4gICAgY29uc3Qgc2VjdGlvbkVsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1zZWN0aW9uXCIgfSk7XG4gICAgY29uc3QgaGVhZGVyRWwgPSBzZWN0aW9uRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1zZWN0aW9uLWhlYWRlclwiIH0pO1xuICAgIGhlYWRlckVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiB0b1N5bmNDZW50ZXJTdGF0dXNMYWJlbChzdGF0dXMpIH0pO1xuICAgIGhlYWRlckVsLmNyZWF0ZVNwYW4oe1xuICAgICAgY2xzOiBgb2JzaWRpYW4tZ2l0LXN5bmNlci1zdGF0dXMtYmFkZ2UgJHt0b1N5bmNDZW50ZXJTdGF0dXNDbGFzcyhzdGF0dXMpfWAsXG4gICAgICB0ZXh0OiBTdHJpbmcoc2VjdGlvbkl0ZW1zLmxlbmd0aClcbiAgICB9KTtcblxuICAgIGlmIChzZWN0aW9uSXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBzZWN0aW9uRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy1jZW50ZXItZW1wdHlcIiwgdGV4dDogXCJcdTY2ODJcdTY1RTBcdTY1ODdcdTRFRjZcdTMwMDJcIiB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB0cmVlID0gdGhpcy5idWlsZFRyZWUoc2VjdGlvbkl0ZW1zKTtcbiAgICBjb25zdCB0cmVlRWwgPSBzZWN0aW9uRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10cmVlXCIgfSk7XG4gICAgdGhpcy5yZW5kZXJUcmVlQ29udGVudHModHJlZUVsLCB0cmVlLCAwKTtcbiAgfVxuXG4gIHJlbmRlclRyZWVDb250ZW50cyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIG5vZGU6IFN5bmNUcmVlTm9kZSwgZGVwdGg6IG51bWJlcikge1xuICAgIEFycmF5LmZyb20obm9kZS5jaGlsZHJlbi52YWx1ZXMoKSlcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUsIFwiemgtQ05cIikpXG4gICAgICAuZm9yRWFjaCgoY2hpbGQpID0+IHtcbiAgICAgICAgdGhpcy5yZW5kZXJEaXJlY3RvcnlSb3coY29udGFpbmVyRWwsIGNoaWxkLCBkZXB0aCk7XG4gICAgICAgIGlmICghdGhpcy5jb2xsYXBzZWRQYXRocy5oYXMoY2hpbGQucGF0aCkpIHtcbiAgICAgICAgICB0aGlzLnJlbmRlclRyZWVDb250ZW50cyhjb250YWluZXJFbCwgY2hpbGQsIGRlcHRoICsgMSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgbm9kZS5pdGVtc1xuICAgICAgLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSwgXCJ6aC1DTlwiKSlcbiAgICAgIC5mb3JFYWNoKChpdGVtKSA9PiB0aGlzLnJlbmRlckZpbGVSb3coY29udGFpbmVyRWwsIGl0ZW0sIGRlcHRoKSk7XG4gIH1cblxuICByZW5kZXJEaXJlY3RvcnlSb3coY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBub2RlOiBTeW5jVHJlZU5vZGUsIGRlcHRoOiBudW1iZXIpIHtcbiAgICBjb25zdCBpdGVtcyA9IHRoaXMuZ2V0Tm9kZUl0ZW1zKG5vZGUpO1xuICAgIGNvbnN0IHNlbGVjdGVkQ291bnQgPSBpdGVtcy5maWx0ZXIoKGl0ZW0pID0+IHRoaXMuc2VsZWN0ZWRJZHMuaGFzKGl0ZW0uaWQpKS5sZW5ndGg7XG4gICAgY29uc3QgaXNDb2xsYXBzZWQgPSB0aGlzLmNvbGxhcHNlZFBhdGhzLmhhcyhub2RlLnBhdGgpO1xuICAgIGNvbnN0IHJvd0VsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10cmVlLXJvdyBpcy1mb2xkZXJcIiB9KTtcbiAgICByb3dFbC5hZGRDbGFzcyhpc0NvbGxhcHNlZCA/IFwiaXMtY29sbGFwc2VkXCIgOiBcImlzLWV4cGFuZGVkXCIpO1xuICAgIHJvd0VsLnN0eWxlLnNldFByb3BlcnR5KFwiLS1zeW5jLXRyZWUtZGVwdGhcIiwgU3RyaW5nKGRlcHRoKSk7XG5cbiAgICBjb25zdCBjaGVja2JveCA9IHJvd0VsLmNyZWF0ZUVsKFwiaW5wdXRcIik7XG4gICAgY2hlY2tib3gudHlwZSA9IFwiY2hlY2tib3hcIjtcbiAgICBjaGVja2JveC5jaGVja2VkID0gc2VsZWN0ZWRDb3VudCA+IDAgJiYgc2VsZWN0ZWRDb3VudCA9PT0gaXRlbXMubGVuZ3RoO1xuICAgIGNoZWNrYm94LmluZGV0ZXJtaW5hdGUgPSBzZWxlY3RlZENvdW50ID4gMCAmJiBzZWxlY3RlZENvdW50IDwgaXRlbXMubGVuZ3RoO1xuICAgIGNoZWNrYm94LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpKTtcbiAgICBjaGVja2JveC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHtcbiAgICAgIHRoaXMuc2V0SXRlbXNTZWxlY3RlZChpdGVtcywgY2hlY2tib3guY2hlY2tlZCk7XG4gICAgICB0aGlzLnJlbmRlclByZXNlcnZpbmdTY3JvbGwoKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGljb25FbCA9IHJvd0VsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXRyZWUtaWNvblwiIH0pO1xuICAgIHNldEljb24oaWNvbkVsLCBpc0NvbGxhcHNlZCA/IFwiZm9sZGVyLWNsb3NlZFwiIDogXCJmb2xkZXItb3BlblwiKTtcblxuICAgIGNvbnN0IG5hbWVFbCA9IHJvd0VsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXRyZWUtbmFtZVwiLCB0ZXh0OiBub2RlLm5hbWUgfSk7XG4gICAgcm93RWwuY3JlYXRlU3Bhbih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtdHJlZS1tZXRhXCIsIHRleHQ6IGAke2l0ZW1zLmxlbmd0aH0gXHU5ODc5YCB9KTtcbiAgICByb3dFbC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy50b2dnbGVEaXJlY3Rvcnkobm9kZS5wYXRoKSk7XG4gIH1cblxuICByZW5kZXJGaWxlUm93KGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgaXRlbTogU3luY0NlbnRlckl0ZW0sIGRlcHRoOiBudW1iZXIpIHtcbiAgICBjb25zdCByb3dFbCA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtdHJlZS1yb3cgaXMtZmlsZVwiIH0pO1xuICAgIHJvd0VsLnN0eWxlLnNldFByb3BlcnR5KFwiLS1zeW5jLXRyZWUtZGVwdGhcIiwgU3RyaW5nKGRlcHRoKSk7XG5cbiAgICBjb25zdCBjaGVja2JveCA9IHJvd0VsLmNyZWF0ZUVsKFwiaW5wdXRcIik7XG4gICAgY2hlY2tib3gudHlwZSA9IFwiY2hlY2tib3hcIjtcbiAgICBjaGVja2JveC5jaGVja2VkID0gdGhpcy5zZWxlY3RlZElkcy5oYXMoaXRlbS5pZCk7XG4gICAgY2hlY2tib3guYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB7XG4gICAgICBpZiAoY2hlY2tib3guY2hlY2tlZCkge1xuICAgICAgICB0aGlzLnNlbGVjdGVkSWRzLmFkZChpdGVtLmlkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZGVsZXRlKGl0ZW0uaWQpO1xuICAgICAgfVxuICAgICAgdGhpcy5yZW5kZXJQcmVzZXJ2aW5nU2Nyb2xsKCk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBpY29uRWwgPSByb3dFbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10cmVlLWljb25cIiB9KTtcbiAgICBzZXRJY29uKGljb25FbCwgaXRlbS5zdGF0dXMgPT09IFwibG9jYWxEZWxldGVkXCIgPyBcImNsb3VkLW9mZlwiIDogaXNJbWFnZVBhdGgoaXRlbS5yZW1vdGVQYXRoKSA/IFwiaW1hZ2VcIiA6IFwiZmlsZS10ZXh0XCIpO1xuICAgIGNvbnN0IHRleHRFbCA9IHJvd0VsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zeW5jLXRyZWUtdGV4dFwiIH0pO1xuICAgIHRleHRFbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3luYy10cmVlLW5hbWVcIiwgdGV4dDogaXRlbS5uYW1lIH0pO1xuICAgIHRleHRFbC5jcmVhdGVTcGFuKHtcbiAgICAgIGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXN5bmMtdHJlZS1wYXRoXCIsXG4gICAgICB0ZXh0OiBpdGVtLmxvY2FsUGF0aCA/IGl0ZW0ubG9jYWxQYXRoIDogaXRlbS5yZW1vdGVQYXRoXG4gICAgfSk7XG4gICAgcm93RWwuY3JlYXRlU3Bhbih7XG4gICAgICBjbHM6IGBvYnNpZGlhbi1naXQtc3luY2VyLXN0YXR1cy1iYWRnZSAke3RvU3luY0NlbnRlclN0YXR1c0NsYXNzKGl0ZW0uc3RhdHVzKX1gLFxuICAgICAgdGV4dDogdG9TeW5jQ2VudGVyU3RhdHVzTGFiZWwoaXRlbS5zdGF0dXMpXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzeW5jU2VsZWN0ZWRMb2NhbEZpbGVzKCkge1xuICAgIGlmICh0aGlzLmFjdGl2ZU9wZXJhdGlvbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGl0ZW1zID0gdGhpcy5nZXRTZWxlY3RlZExvY2FsSXRlbXMoKTtcbiAgICBpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IHN1Y2Nlc3NDb3VudCA9IDA7XG4gICAgbGV0IGZhaWx1cmVDb3VudCA9IDA7XG4gICAgdGhpcy5hY3RpdmVPcGVyYXRpb24gPSBcInN5bmNcIjtcbiAgICB0aGlzLnJlbmRlclByZXNlcnZpbmdTY3JvbGwoKTtcblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuICAgICAgaWYgKCFpdGVtLmZpbGUpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IG5leHRTdGF0ZSA9IGF3YWl0IHRoaXMucGx1Z2luLnN5bmNGaWxlVG9HaXRIdWIoaXRlbS5maWxlKTtcbiAgICAgICAgc3VjY2Vzc0NvdW50ICs9IDE7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZGVsZXRlKGl0ZW0uaWQpO1xuICAgICAgICB0aGlzLmRlbGV0ZWRSZW1vdGVQYXRocy5kZWxldGUoaXRlbS5yZW1vdGVQYXRoKTtcbiAgICAgICAgaXRlbS5zdGF0dXMgPSBcInB1Ymxpc2hlZFwiO1xuICAgICAgICBpdGVtLnN0YXRlID0gbmV4dFN0YXRlO1xuICAgICAgICBpdGVtLnJlbW90ZSA9IHtcbiAgICAgICAgICByZW1vdGVQYXRoOiBpdGVtLnJlbW90ZVBhdGgsXG4gICAgICAgICAgc2hhOiBuZXh0U3RhdGUuc2hhID8/IFwiXCIsXG4gICAgICAgICAgaHRtbFVybDogbmV4dFN0YXRlLmh0bWxVcmwgPz8gdGhpcy5wbHVnaW4uYnVpbGRHaXRIdWJCbG9iVXJsKGl0ZW0ucmVtb3RlUGF0aClcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICBmYWlsdXJlQ291bnQgKz0gMTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBuZXcgTm90aWNlKGBcdTU0MENcdTZCNjVcdTVCOENcdTYyMTBcdUZGMUFcdTYyMTBcdTUyOUYgJHtzdWNjZXNzQ291bnR9XHVGRjBDXHU1OTMxXHU4RDI1ICR7ZmFpbHVyZUNvdW50fWApO1xuICAgIHRoaXMuYWN0aXZlT3BlcmF0aW9uID0gbnVsbDtcbiAgICB0aGlzLnJlbmRlclByZXNlcnZpbmdTY3JvbGwoKTtcbiAgfVxuXG4gIGFzeW5jIHB1bGxTZWxlY3RlZFJlbW90ZUZpbGVzKCkge1xuICAgIGlmICh0aGlzLmFjdGl2ZU9wZXJhdGlvbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGl0ZW1zID0gdGhpcy5nZXRTZWxlY3RlZFJlbW90ZU9ubHlJdGVtcygpO1xuICAgIGlmIChpdGVtcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgc3VjY2Vzc0NvdW50ID0gMDtcbiAgICBsZXQgZmFpbHVyZUNvdW50ID0gMDtcbiAgICB0aGlzLmFjdGl2ZU9wZXJhdGlvbiA9IFwicHVsbFwiO1xuICAgIHRoaXMucmVuZGVyUHJlc2VydmluZ1Njcm9sbCgpO1xuXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5wdWxsUmVtb3RlRmlsZShpdGVtLnJlbW90ZVBhdGgpO1xuICAgICAgICBzdWNjZXNzQ291bnQgKz0gMTtcbiAgICAgICAgdGhpcy5zZWxlY3RlZElkcy5kZWxldGUoaXRlbS5pZCk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgZmFpbHVyZUNvdW50ICs9IDE7XG4gICAgICB9XG4gICAgfVxuXG4gICAgbmV3IE5vdGljZShgXHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHU2MkM5XHU1M0Q2XHU1QjhDXHU2MjEwXHVGRjFBXHU2MjEwXHU1MjlGICR7c3VjY2Vzc0NvdW50fVx1RkYwQ1x1NTkzMVx1OEQyNSAke2ZhaWx1cmVDb3VudH1gKTtcbiAgICB0aGlzLmFjdGl2ZU9wZXJhdGlvbiA9IG51bGw7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoKCk7XG4gIH1cblxuICBhc3luYyBkZWxldGVTZWxlY3RlZFJlbW90ZUZpbGVzKCkge1xuICAgIGlmICh0aGlzLmFjdGl2ZU9wZXJhdGlvbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGl0ZW1zID0gdGhpcy5nZXRTZWxlY3RlZFJlbW90ZUl0ZW1zKCk7XG4gICAgaWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBzdWNjZXNzQ291bnQgPSAwO1xuICAgIGxldCBmYWlsdXJlQ291bnQgPSAwO1xuICAgIHRoaXMuYWN0aXZlT3BlcmF0aW9uID0gXCJkZWxldGVcIjtcbiAgICB0aGlzLnJlbmRlclByZXNlcnZpbmdTY3JvbGwoKTtcblxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uZGVsZXRlUmVtb3RlUGF0aChpdGVtLnJlbW90ZVBhdGgpO1xuICAgICAgICB0aGlzLmRlbGV0ZWRSZW1vdGVQYXRocy5hZGQoaXRlbS5yZW1vdGVQYXRoKTtcbiAgICAgICAgaWYgKGl0ZW0uZmlsZSkge1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNldFN0YXRlKGl0ZW0uZmlsZSwge1xuICAgICAgICAgICAgcmVtb3RlUGF0aDogaXRlbS5yZW1vdGVQYXRoLFxuICAgICAgICAgICAgc2hhOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBodG1sVXJsOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBzdGF0dXM6IFwiZGVsZXRlZFwiXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgc3VjY2Vzc0NvdW50ICs9IDE7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZGVsZXRlKGl0ZW0uaWQpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIGZhaWx1cmVDb3VudCArPSAxO1xuICAgICAgfVxuICAgIH1cblxuICAgIG5ldyBOb3RpY2UoYFx1OEZEQ1x1N0FFRlx1NkI4Qlx1NzU1OVx1NkUwNVx1NzQwNlx1NUI4Q1x1NjIxMFx1RkYxQVx1NjIxMFx1NTI5RiAke3N1Y2Nlc3NDb3VudH1cdUZGMENcdTU5MzFcdThEMjUgJHtmYWlsdXJlQ291bnR9YCk7XG4gICAgdGhpcy5hY3RpdmVPcGVyYXRpb24gPSBudWxsO1xuICAgIHRoaXMuaXRlbXMgPSB0aGlzLmFwcGx5RGVsZXRlZFJlbW90ZU92ZXJyaWRlcyh0aGlzLml0ZW1zKTtcbiAgICB0aGlzLnJlbmRlclByZXNlcnZpbmdTY3JvbGwoKTtcbiAgfVxufVxuXG5jbGFzcyBQbHVnaW5WZXJzaW9uTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHBsdWdpbjogT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW47XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW4pIHtcbiAgICBzdXBlcihhcHApO1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICB9XG5cbiAgb25PcGVuKCkge1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJcdTYzRDJcdTRFRjZcdTcyNDhcdTY3MkNcdTRGRTFcdTYwNkZcIiB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFx1NTQwRFx1NzlGMFx1RkYxQSR7dGhpcy5wbHVnaW4ubWFuaWZlc3QubmFtZX1gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgXHU3MjQ4XHU2NzJDXHVGRjFBJHt0aGlzLnBsdWdpbi5tYW5pZmVzdC52ZXJzaW9ufWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBcdTYzRDJcdTRFRjYgSURcdUZGMUEke3RoaXMucGx1Z2luLm1hbmlmZXN0LmlkfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBcdTY3MDBcdTRGNEUgT2JzaWRpYW4gXHU3MjQ4XHU2NzJDXHVGRjFBJHt0aGlzLnBsdWdpbi5tYW5pZmVzdC5taW5BcHBWZXJzaW9ufWAgfSk7XG4gIH1cbn1cblxuY2xhc3MgR2l0U3luY2VyU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luO1xuICBhY3RpdmVTZWN0aW9uOiBcImdlbmVyYWxcIiB8IFwicmVtb3RlXCIgfCBcInN5bmNcIiB8IFwibWVkaWFcIiB8IFwiZGVidWdcIiA9IFwiZ2VuZXJhbFwiO1xuICBzZWFyY2hRdWVyeSA9IFwiXCI7XG4gIHJvb3RFbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbmF2RWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIHBhbmVsRWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW4pIHtcbiAgICBzdXBlcihhcHAsIHBsdWdpbik7XG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gIH1cblxuICBnZXRTZWN0aW9ucygpIHtcbiAgICByZXR1cm4gW1xuICAgICAge1xuICAgICAgICBpZDogXCJnZW5lcmFsXCIgYXMgY29uc3QsXG4gICAgICAgIGxhYmVsOiBcIlx1OTAxQVx1NzUyOFx1OEJCRVx1N0Y2RVwiLFxuICAgICAgICB0aXRsZTogXCJcdTkwMUFcdTc1MjhcdThCQkVcdTdGNkVcIixcbiAgICAgICAgZGVzY3JpcHRpb246IFwiXHU3QkExXHU3NDA2XHU2NzJDXHU1NzMwXHU1NDBDXHU2QjY1XHU3NkVFXHU1RjU1XHU1NDhDXHU2M0QyXHU0RUY2XHU1N0ZBXHU3ODQwXHU0RkUxXHU2MDZGXHUzMDAyXCJcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIGlkOiBcInJlbW90ZVwiIGFzIGNvbnN0LFxuICAgICAgICBsYWJlbDogXCJHaXRIdWIgXHU5MTREXHU3RjZFXCIsXG4gICAgICAgIHRpdGxlOiBcIkdpdEh1YiBcdTkxNERcdTdGNkVcIixcbiAgICAgICAgZGVzY3JpcHRpb246IFwiXHU5MTREXHU3RjZFIEdpdEh1YiBcdTRFRDNcdTVFOTNcdTMwMDFUb2tlblx1MzAwMVx1NzUyOFx1NjIzN1x1NTQwRFx1NTQ4Q1x1NzZFRVx1NjgwN1x1NTIwNlx1NjUyRlx1MzAwMlwiXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBpZDogXCJzeW5jXCIgYXMgY29uc3QsXG4gICAgICAgIGxhYmVsOiBcIlx1NTQwQ1x1NkI2NVx1NjNBN1x1NTIzNlwiLFxuICAgICAgICB0aXRsZTogXCJcdTU0MENcdTZCNjVcdTYzQTdcdTUyMzZcIixcbiAgICAgICAgZGVzY3JpcHRpb246IFwiXHU2N0U1XHU3NzBCIGNvbnRlbnQgXHU3NkVFXHU1RjU1XHU2NjIwXHU1QzA0XHUzMDAxXHU3MkI2XHU2MDAxXHU3RjEzXHU1QjU4XHU1NDhDXHU1NDBDXHU2QjY1XHU3QjU2XHU3NTY1XHUzMDAyXCJcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIGlkOiBcIm1lZGlhXCIgYXMgY29uc3QsXG4gICAgICAgIGxhYmVsOiBcIlx1OTY0NFx1NEVGNlx1NTkwNFx1NzQwNlwiLFxuICAgICAgICB0aXRsZTogXCJcdTk2NDRcdTRFRjZcdTU5MDRcdTc0MDZcIixcbiAgICAgICAgZGVzY3JpcHRpb246IFwiXHU1NDBFXHU3RUVEXHU1M0VGXHU2MjY5XHU1QzU1XHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHUzMDAxXHU5NjQ0XHU0RUY2XHU1OTBEXHU1MjM2XHU1NDhDXHU4RDQ0XHU2RTkwXHU1RjE1XHU3NTI4XHU5MUNEXHU1MTk5XHUzMDAyXCJcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIGlkOiBcImRlYnVnXCIgYXMgY29uc3QsXG4gICAgICAgIGxhYmVsOiBcIlx1OEMwM1x1OEJENVwiLFxuICAgICAgICB0aXRsZTogXCJcdThDMDNcdThCRDVcdTRFMEVcdTY1RTVcdTVGRDdcIixcbiAgICAgICAgZGVzY3JpcHRpb246IFwiXHU2N0U1XHU3NzBCXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXHU1NDhDXHU4QkNBXHU2NUFEXHU1MTY1XHU1M0UzXHUzMDAyXCJcbiAgICAgIH1cbiAgICBdO1xuICB9XG5cbiAgZ2V0RmlsdGVyVGV4dCguLi5wYXJ0czogQXJyYXk8c3RyaW5nIHwgdW5kZWZpbmVkPikge1xuICAgIHJldHVybiBwYXJ0c1xuICAgICAgLmZpbHRlcigocGFydCk6IHBhcnQgaXMgc3RyaW5nID0+IEJvb2xlYW4ocGFydCkpXG4gICAgICAuam9pbihcIiBcIilcbiAgICAgIC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCAuLi5wYXJ0czogQXJyYXk8c3RyaW5nIHwgdW5kZWZpbmVkPikge1xuICAgIGNvbnN0IHNldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbCk7XG4gICAgc2V0dGluZy5zZXR0aW5nRWwuZGF0YXNldC5maWx0ZXJUZXh0ID0gdGhpcy5nZXRGaWx0ZXJUZXh0KC4uLnBhcnRzKTtcbiAgICByZXR1cm4gc2V0dGluZztcbiAgfVxuXG4gIHJlbmRlclNlYXJjaEJhcihjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBzZWFyY2hTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldENsYXNzKFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1zZWFyY2gtcm93XCIpO1xuICAgIHNlYXJjaFNldHRpbmcuaW5mb0VsLnJlbW92ZSgpO1xuICAgIHNlYXJjaFNldHRpbmcuYWRkU2VhcmNoKChzZWFyY2gpID0+XG4gICAgICBzZWFyY2guc2V0UGxhY2Vob2xkZXIoXCJcdTY0MUNcdTdEMjJcdTk3NjJcdTY3N0ZcdThCQkVcdTdGNkUuLi5cIikuc2V0VmFsdWUodGhpcy5zZWFyY2hRdWVyeSkub25DaGFuZ2UoKHZhbHVlKSA9PiB7XG4gICAgICAgIHRoaXMuc2VhcmNoUXVlcnkgPSB2YWx1ZTtcbiAgICAgICAgY29uc3QgcGFuZWxFbCA9IHRoaXMuY29udGFpbmVyRWwucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXCIub2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1wYW5lbFwiKTtcbiAgICAgICAgaWYgKHBhbmVsRWwpIHtcbiAgICAgICAgICB0aGlzLmFwcGx5U2VhcmNoRmlsdGVyKHBhbmVsRWwpO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICk7XG4gIH1cblxuICByZW5kZXJTZWN0aW9uVGFicyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBuYXZFbCA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXNldHRpbmdzLW5hdlwiIH0pO1xuICAgIHRoaXMubmF2RWwgPSBuYXZFbDtcblxuICAgIHRoaXMuZ2V0U2VjdGlvbnMoKS5mb3JFYWNoKChzZWN0aW9uKSA9PiB7XG4gICAgICBjb25zdCBidXR0b24gPSBuYXZFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG4gICAgICAgIGNsczogYG9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3MtbmF2LWl0ZW0ke3RoaXMuYWN0aXZlU2VjdGlvbiA9PT0gc2VjdGlvbi5pZCA/IFwiIGlzLWFjdGl2ZVwiIDogXCJcIn1gLFxuICAgICAgICB0ZXh0OiBzZWN0aW9uLmxhYmVsXG4gICAgICB9KTtcbiAgICAgIGJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcbiAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgICBpZiAodGhpcy5hY3RpdmVTZWN0aW9uID09PSBzZWN0aW9uLmlkKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5hY3RpdmVTZWN0aW9uID0gc2VjdGlvbi5pZDtcbiAgICAgICAgdGhpcy5zeW5jVGFiU3RhdGUoKTtcbiAgICAgICAgaWYgKHRoaXMucGFuZWxFbCkge1xuICAgICAgICAgIHRoaXMucmVuZGVyUGFuZWwodGhpcy5wYW5lbEVsKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBzeW5jVGFiU3RhdGUoKSB7XG4gICAgaWYgKCF0aGlzLm5hdkVsKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaXRlbXMgPSBBcnJheS5mcm9tKHRoaXMubmF2RWwucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXCIub2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1uYXYtaXRlbVwiKSk7XG4gICAgaXRlbXMuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHtcbiAgICAgIGNvbnN0IHNlY3Rpb24gPSB0aGlzLmdldFNlY3Rpb25zKClbaW5kZXhdO1xuICAgICAgaXRlbS5jbGFzc0xpc3QudG9nZ2xlKFwiaXMtYWN0aXZlXCIsIHNlY3Rpb24/LmlkID09PSB0aGlzLmFjdGl2ZVNlY3Rpb24pO1xuICAgIH0pO1xuICB9XG5cbiAgcmVuZGVyUGxhY2Vob2xkZXJTZXR0aW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgdGl0bGU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgYmFkZ2UgPSBcIlx1ODlDNFx1NTIxMlx1NEUyRFwiKSB7XG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgdGl0bGUsIGRlc2NyaXB0aW9uLCBiYWRnZSlcbiAgICAgIC5zZXROYW1lKHRpdGxlKVxuICAgICAgLnNldERlc2MoYCR7ZGVzY3JpcHRpb259XHVGRjA4JHtiYWRnZX1cdUZGMDlgKTtcbiAgfVxuXG4gIHJlbmRlclNlY3Rpb25TdWJoZWFkaW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgdGV4dDogc3RyaW5nKSB7XG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUodGV4dCkuc2V0SGVhZGluZygpO1xuICB9XG5cbiAgcmVuZGVyQ29ubmVjdGlvblN0YXR1cyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBjb25uZWN0aW9uID0gdGhpcy5wbHVnaW4uZGF0YS5jb25uZWN0aW9uID8/IERFRkFVTFRfREFUQS5jb25uZWN0aW9uO1xuICAgIGNvbnN0IHN0YXR1c0VsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHtcbiAgICAgIGNsczogYG9ic2lkaWFuLWdpdC1zeW5jZXItY29ubmVjdGlvbi1zdGF0dXMgaXMtJHtjb25uZWN0aW9uPy5zdGF0dXMgPz8gXCJ1bmtub3duXCJ9YFxuICAgIH0pO1xuICAgIGNvbnN0IGljb25FbCA9IHN0YXR1c0VsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1jb25uZWN0aW9uLXN0YXR1cy1pY29uXCIgfSk7XG4gICAgY29uc3QgaWNvbk5hbWUgPVxuICAgICAgY29ubmVjdGlvbj8uc3RhdHVzID09PSBcInN1Y2Nlc3NcIlxuICAgICAgICA/IFwiY2hlY2stY2lyY2xlLTJcIlxuICAgICAgICA6IGNvbm5lY3Rpb24/LnN0YXR1cyA9PT0gXCJmYWlsZWRcIlxuICAgICAgICAgID8gXCJ4LWNpcmNsZVwiXG4gICAgICAgICAgOiBjb25uZWN0aW9uPy5zdGF0dXMgPT09IFwic3RhbGVcIlxuICAgICAgICAgICAgPyBcImFsZXJ0LWNpcmNsZVwiXG4gICAgICAgICAgICA6IFwiY2lyY2xlLWhlbHBcIjtcbiAgICBzZXRJY29uKGljb25FbCwgaWNvbk5hbWUpO1xuICAgIHN0YXR1c0VsLmNyZWF0ZVNwYW4oe1xuICAgICAgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItY29ubmVjdGlvbi1zdGF0dXMtdGV4dFwiLFxuICAgICAgdGV4dDogYCR7Y29ubmVjdGlvbj8ubWVzc2FnZSA/PyBcIlx1NUMxQVx1NjcyQVx1NkQ0Qlx1OEJENVx1OEZERVx1NjNBNVx1MzAwMlwifSR7Y29ubmVjdGlvbj8uY2hlY2tlZEF0ID8gYCBcdTAwQjcgJHtjb25uZWN0aW9uLmNoZWNrZWRBdH1gIDogXCJcIn1gXG4gICAgfSk7XG4gIH1cblxuICByZW5kZXJHZW5lcmFsU2V0dGluZ3MoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3QgbG9jYWxSb290UGF0aCA9IGRpc3BsYXlMb2NhbFJvb3RQYXRoKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvY2FsUm9vdFBhdGgpO1xuICAgIGNvbnN0IGxvY2FsUm9vdERlc2NyaXB0aW9uID0gdGhpcy5wbHVnaW4uZ2V0RXhpc3RpbmdGb2xkZXIodGhpcy5wbHVnaW4uc2V0dGluZ3MubG9jYWxSb290UGF0aClcbiAgICAgID8gYFx1NUY1M1x1NTI0RFx1NzZFRVx1NUY1NVx1NjcwOVx1NjU0OFx1RkYxQSR7bG9jYWxSb290UGF0aH1gXG4gICAgICA6IFwiXHU1M0VBXHU2NzA5XHU4QkU1XHU3NkVFXHU1RjU1XHU1MTg1XHU3Njg0XHU2NTg3XHU0RUY2XHU2MjREXHU1MTQxXHU4QkI4XHU1NDBDXHU2QjY1XHUzMDAyXHU1RjUzXHU1MjREXHU1MDNDXHU2NUUwXHU2NTQ4XHU2NUY2XHU4QkY3XHU5MUNEXHU2NUIwXHU5MDA5XHU2MkU5XHU3NkVFXHU1RjU1XHUzMDAyXCI7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIkxvY2FsIFJvb3QgUGF0aFwiLCBsb2NhbFJvb3REZXNjcmlwdGlvbiwgbG9jYWxSb290UGF0aClcbiAgICAgIC5zZXROYW1lKFwiTG9jYWwgUm9vdCBQYXRoXCIpXG4gICAgICAuc2V0RGVzYyhsb2NhbFJvb3REZXNjcmlwdGlvbilcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0LnNldFZhbHVlKGxvY2FsUm9vdFBhdGgpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmxvY2FsUm9vdFBhdGggPSBub3JtYWxpemVMb2NhbFJvb3RQYXRoKHZhbHVlKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQoXCJcdTkwMDlcdTYyRTlcdTc2RUVcdTVGNTVcIikub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgbmV3IEZvbGRlclNlbGVjdE1vZGFsKHRoaXMuYXBwLCB0aGlzLnBsdWdpbiwgYXN5bmMgKGZvbGRlcikgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2V0TG9jYWxSb290UGF0aChmb2xkZXIucGF0aCk7XG4gICAgICAgICAgICAgIG5ldyBOb3RpY2UoYFx1NURGMlx1OEJCRVx1N0Y2RSBMb2NhbCBSb290IFBhdGhcdUZGMUEke2Rpc3BsYXlMb2NhbFJvb3RQYXRoKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvY2FsUm9vdFBhdGgpfWApO1xuICAgICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiXHU4QkJFXHU3RjZFXHU1OTMxXHU4RDI1XCI7XG4gICAgICAgICAgICAgIG5ldyBOb3RpY2UobWVzc2FnZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSkub3BlbigpO1xuICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiXHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XCIsIFwiXHU1NkZBXHU1QjlBXHU1MTk5XHU1MTY1IEdpdEh1YiBcdTRFRDNcdTVFOTMgY29udGVudCBcdTc2RUVcdTVGNTVcdTMwMDJcIiwgUkVNT1RFX0NPTlRFTlRfUk9PVClcbiAgICAgIC5zZXROYW1lKFwiXHU4RkRDXHU3QUVGXHU3NkVFXHU1RjU1XCIpXG4gICAgICAuc2V0RGVzYyhcIlx1NjNEMlx1NEVGNlx1NTNFQVx1OEJGQlx1NTE5OVx1NEVEM1x1NUU5MyBjb250ZW50IFx1NzZFRVx1NUY1NVx1RkYxQlx1NjcyQ1x1NTczMFx1NTQwQ1x1NkI2NVx1NzZFRVx1NUY1NVx1NTE4NVx1NzY4NFx1NzZGOFx1NUJGOVx1OERFRlx1NUY4NFx1NEYxQVx1NjYyMFx1NUMwNFx1NTIzMCBjb250ZW50IFx1NEUwQlx1MzAwMlwiKTtcblxuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXCIsIHRoaXMucGx1Z2luLm1hbmlmZXN0LnZlcnNpb24sIHRoaXMucGx1Z2luLm1hbmlmZXN0LmlkKVxuICAgICAgLnNldE5hbWUoXCJcdTYzRDJcdTRFRjZcdTcyNDhcdTY3MkNcIilcbiAgICAgIC5zZXREZXNjKGAke3RoaXMucGx1Z2luLm1hbmlmZXN0Lm5hbWV9IHYke3RoaXMucGx1Z2luLm1hbmlmZXN0LnZlcnNpb259IFx1MDBCNyAke3RoaXMucGx1Z2luLm1hbmlmZXN0LmlkfWApO1xuICB9XG5cbiAgcmVuZGVyUmVtb3RlU2V0dGluZ3MoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhcbiAgICAgIGNvbnRhaW5lckVsLFxuICAgICAgXCJSZXBvc2l0b3J5IFVSTFwiLFxuICAgICAgXCJcdTRGOEJcdTU5ODIgaHR0cHM6Ly9naXRodWIuY29tL2ltbGl1c3gvb2JzaWRpYW4tZ2l0LXN5bmNlci5naXRcIixcbiAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnJlcG9zaXRvcnlVcmxcbiAgICApXG4gICAgICAuc2V0TmFtZShcIlJlcG9zaXRvcnkgVVJMXCIpXG4gICAgICAuc2V0RGVzYyhcIkdpdEh1YiBcdTk4NzlcdTc2RUVcdTRFRDNcdTVFOTNcdTU3MzBcdTU3NDBcdUZGMENcdTY1MkZcdTYzMDEgSFRUUFNcdTMwMDFTU0ggXHU2MjE2IG93bmVyL3JlcG9cdTMwMDJcIilcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8uZ2l0XCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnJlcG9zaXRvcnlVcmwpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmVwb3NpdG9yeVVybCA9IHZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLm1hcmtDb25uZWN0aW9uU3RhbGUoKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJHaXRIdWIgVXNlcm5hbWVcIiwgXCJcdTVGNTNcdTUyNERcdTYzODhcdTY3NDMgVG9rZW4gXHU1QkY5XHU1RTk0XHU3Njg0IEdpdEh1YiBcdTc1MjhcdTYyMzdcdTU0MERcdTMwMDJcIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZ2l0aHViVXNlcm5hbWUpXG4gICAgICAuc2V0TmFtZShcIkdpdEh1YiBVc2VybmFtZVwiKVxuICAgICAgLnNldERlc2MoXCJcdTVGNTNcdTUyNERcdTYzODhcdTY3NDMgVG9rZW4gXHU1QkY5XHU1RTk0XHU3Njg0IEdpdEh1YiBcdTc1MjhcdTYyMzdcdTU0MERcdTMwMDJcIilcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiaW1saXVzeFwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5naXRodWJVc2VybmFtZSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5naXRodWJVc2VybmFtZSA9IHZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLm1hcmtDb25uZWN0aW9uU3RhbGUoKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJHaXRIdWIgVG9rZW5cIiwgXCJGaW5lLWdyYWluZWQgVG9rZW4gXHU5NzAwXHU4OTgxXHU1RjAwXHU1NDJGIENvbnRlbnRzIFx1OEJGQlx1NTE5OVx1Njc0M1x1OTY1MFx1MzAwMlwiKVxuICAgICAgLnNldE5hbWUoXCJHaXRIdWIgVG9rZW5cIilcbiAgICAgIC5zZXREZXNjKFwiRmluZS1ncmFpbmVkIFRva2VuIFx1OTcwMFx1ODk4MVx1NjM4OFx1Njc0M1x1NzZFRVx1NjgwN1x1NEVEM1x1NUU5M1x1RkYwQ1x1NUU3Nlx1NUYwMFx1NTQyRiBDb250ZW50cyBcdThCRkJcdTUxOTlcdTY3NDNcdTk2NTBcdTMwMDJcIilcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PiB7XG4gICAgICAgIHRleHQuaW5wdXRFbC50eXBlID0gXCJwYXNzd29yZFwiO1xuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiZ2l0aHViX3BhdF8uLi5cIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZ2l0aHViVG9rZW4pXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZ2l0aHViVG9rZW4gPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5tYXJrQ29ubmVjdGlvblN0YWxlKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuXG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJCcmFuY2hcIiwgXCJcdTRGOEJcdTU5ODIgbWFpblwiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5icmFuY2gpXG4gICAgICAuc2V0TmFtZShcIkJyYW5jaFwiKVxuICAgICAgLnNldERlc2MoXCJcdTU0MENcdTZCNjVcdTUxOTlcdTUxNjVcdTc2ODRcdTc2RUVcdTY4MDdcdTUyMDZcdTY1MkZcdTMwMDJcIilcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwibWFpblwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5icmFuY2gpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYnJhbmNoID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ubWFya0Nvbm5lY3Rpb25TdGFsZSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIlx1NkQ0Qlx1OEJENVx1OEZERVx1NjNBNVwiLCBcIlx1OUE4Q1x1OEJDMVx1NUY1M1x1NTI0RFx1NEVEM1x1NUU5M1x1MzAwMVRva2VuIFx1NTQ4Q1x1NTIwNlx1NjUyRlx1OTE0RFx1N0Y2RVx1NjYyRlx1NTQyNlx1NTNFRlx1OEJCRlx1OTVFRVx1MzAwMlwiKVxuICAgICAgLnNldE5hbWUoXCJcdTZENEJcdThCRDVcdThGREVcdTYzQTVcIilcbiAgICAgIC5zZXREZXNjKFwiXHU5QThDXHU4QkMxXHU1RjUzXHU1MjREXHU0RUQzXHU1RTkzXHUzMDAxVG9rZW4gXHU1NDhDXHU1MjA2XHU2NTJGXHU5MTREXHU3RjZFXHU2NjJGXHU1NDI2XHU1M0VGXHU4QkJGXHU5NUVFXHUzMDAyXCIpXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KFwiXHU2RDRCXHU4QkQ1XHU4RkRFXHU2M0E1XCIpLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi50ZXN0Q29ubmVjdGlvbigpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJQYW5lbCh0aGlzLnBhbmVsRWwgPz8gY29udGFpbmVyRWwpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIlx1OEZERVx1NjNBNVx1NTkzMVx1OEQyNVwiO1xuICAgICAgICAgICAgbmV3IE5vdGljZShtZXNzYWdlKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyUGFuZWwodGhpcy5wYW5lbEVsID8/IGNvbnRhaW5lckVsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgdGhpcy5yZW5kZXJDb25uZWN0aW9uU3RhdHVzKGNvbnRhaW5lckVsKTtcbiAgfVxuXG4gIHJlbmRlclN5bmNTZXR0aW5ncyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIkNvbnRlbnQgUm9vdFwiLCBcIlx1NTZGQVx1NUI5QVx1NEUzQSBjb250ZW50XCIsIFJFTU9URV9DT05URU5UX1JPT1QpXG4gICAgICAuc2V0TmFtZShcIkNvbnRlbnQgUm9vdFwiKVxuICAgICAgLnNldERlc2MoXCJcdThGRENcdTdBRUZcdThCRkJcdTUxOTlcdThERUZcdTVGODRcdTU2RkFcdTVCOUFcdTRFM0EgY29udGVudC88XHU2NzJDXHU1NzMwXHU3NkY4XHU1QkY5XHU4REVGXHU1Rjg0Plx1MzAwMlwiKTtcblxuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiXHU1NDBDXHU2QjY1XHU4QkY0XHU2NjBFXCIsIFwiXHU3MkI2XHU2MDAxXHU3RjEzXHU1QjU4XHUzMDAxXHU2NzJDXHU1NzMwXHU0RkVFXHU2NTM5XHU2OEMwXHU2RDRCXHUzMDAxXHU4RkRDXHU3QUVGXHU1MjIwXHU5NjY0XHU2OEMwXHU2RDRCXCIsIFwiXHU4QkY0XHU2NjBFXCIpXG4gICAgICAuc2V0TmFtZShcIlx1NTQwQ1x1NkI2NVx1OEJGNFx1NjYwRVwiKVxuICAgICAgLnNldERlc2MoXCJcdTYzRDJcdTRFRjZcdTRGMUFcdTdGMTNcdTVCNThcdTY3MDBcdThGRDFcdTU0MENcdTZCNjVcdTc2ODRcdTUxODVcdTVCQjlcdTU0QzhcdTVFMENcdUZGMUJcdTY3MkNcdTU3MzBcdTUxODVcdTVCQjlcdTUzRDhcdTUzMTZcdTY2M0VcdTc5M0FcdTRFM0FcdTVERjJcdTRGRUVcdTY1MzlcdUZGMENcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcdTRFMERcdTVCNThcdTU3MjhcdTY2M0VcdTc5M0FcdTRFM0FcdThGRENcdTdBRUZcdTVERjJcdTUyMjBcdTk2NjRcdTMwMDJcIik7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIlx1NkUwNVx1NzQwNlx1NzJCNlx1NjAwMVx1N0YxM1x1NUI1OFwiLCBcIlx1NkUwNVx1NzQwNlx1NjcyQ1x1NTczMFx1NTQwQ1x1NkI2NVx1NzJCNlx1NjAwMVx1RkYwQ1x1NEUwRFx1NUY3MVx1NTRDRCBHaXRIdWIgXHU0RUQzXHU1RTkzXHU2NTg3XHU0RUY2XHUzMDAyXCIpXG4gICAgICAuc2V0TmFtZShcIlx1NkUwNVx1NzQwNlx1NzJCNlx1NjAwMVx1N0YxM1x1NUI1OFwiKVxuICAgICAgLnNldERlc2MoXCJcdTZFMDVcdTc0MDZcdTY3MkNcdTU3MzBcdTU0MENcdTZCNjVcdTcyQjZcdTYwMDFcdUZGMENcdTRFMERcdTVGNzFcdTU0Q0QgR2l0SHViIFx1NEVEM1x1NUU5M1x1NjU4N1x1NEVGNlx1MzAwMlwiKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dChcIlx1NkUwNVx1NzQwNlwiKS5zZXRXYXJuaW5nKCkub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uZGF0YS5maWxlcyA9IHt9O1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVBbGxEYXRhKCk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ucmVmcmVzaFN0YXR1c0JhcigpO1xuICAgICAgICAgIG5ldyBOb3RpY2UoXCJcdTcyQjZcdTYwMDFcdTdGMTNcdTVCNThcdTVERjJcdTZFMDVcdTc0MDZcdTMwMDJcIik7XG4gICAgICAgIH0pXG4gICAgICApO1xuICB9XG5cbiAgcmVuZGVyTWVkaWFTZXR0aW5ncyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICB0aGlzLnJlbmRlclBsYWNlaG9sZGVyU2V0dGluZyhcbiAgICAgIGNvbnRhaW5lckVsLFxuICAgICAgXCJcdTk2NDRcdTRFRjZcdTRFMEVcdTU2RkVcdTcyNDdcIixcbiAgICAgIFwiXHU4RkQ5XHU5MUNDXHU1QzA2XHU3NTI4XHU0RThFXHU5MTREXHU3RjZFXHU1NkZFXHU3MjQ3XHU1OTBEXHU1MjM2XHU3QjU2XHU3NTY1XHUzMDAxXHU5NjQ0XHU0RUY2XHU3NkVFXHU1RjU1XHU2NjIwXHU1QzA0XHUzMDAxXHU4RkRDXHU3QTBCXHU4RDQ0XHU2RTkwXHU1NzMwXHU1NzQwXHU0RTBFXHU1RjE1XHU3NTI4XHU5MUNEXHU1MTk5XHU4OUM0XHU1MjE5XHUzMDAyXCJcbiAgICApO1xuICB9XG5cbiAgcmVuZGVyRGVidWdTZXR0aW5ncyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICB0aGlzLnJlbmRlclBsYWNlaG9sZGVyU2V0dGluZyhcbiAgICAgIGNvbnRhaW5lckVsLFxuICAgICAgXCJcdThDMDNcdThCRDVcdTRFMEVcdTY1RTVcdTVGRDdcIixcbiAgICAgIFwiXHU4RkQ5XHU5MUNDXHU1QzA2XHU3NTI4XHU0RThFXHU2N0U1XHU3NzBCXHU1NDBDXHU2QjY1XHU2NUU1XHU1RkQ3XHUzMDAxXHU4QkY3XHU2QzQyXHU3RUQzXHU2NzlDXHU1NDhDXHU5NTE5XHU4QkVGXHU2MzkyXHU2N0U1XHU0RkUxXHU2MDZGXHUzMDAyXCJcbiAgICApO1xuXG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJcdTYzRDJcdTRFRjZcdTcyNDhcdTY3MkNcdTRGRTFcdTYwNkZcIiwgXCJcdTY3RTVcdTc3MEJcdTcyNDhcdTY3MkNcdTMwMDFcdTYzRDJcdTRFRjYgSUQgXHU1NDhDXHU2NzAwXHU0RjRFXHU1MTdDXHU1QkI5XHU3MjQ4XHU2NzJDXHUzMDAyXCIpXG4gICAgICAuc2V0TmFtZShcIlx1NjNEMlx1NEVGNlx1NzI0OFx1NjcyQ1x1NEZFMVx1NjA2RlwiKVxuICAgICAgLnNldERlc2MoXCJcdTY3RTVcdTc3MEJcdTcyNDhcdTY3MkNcdTMwMDFcdTYzRDJcdTRFRjYgSUQgXHU1NDhDXHU2NzAwXHU0RjRFXHU1MTdDXHU1QkI5XHU3MjQ4XHU2NzJDXHUzMDAyXCIpXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KFwiXHU2MjUzXHU1RjAwXCIpLm9uQ2xpY2soKCkgPT4ge1xuICAgICAgICAgIG5ldyBQbHVnaW5WZXJzaW9uTW9kYWwodGhpcy5hcHAsIHRoaXMucGx1Z2luKS5vcGVuKCk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICB9XG5cbiAgYXBwbHlTZWFyY2hGaWx0ZXIocGFuZWxFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBxdWVyeSA9IHRoaXMuc2VhcmNoUXVlcnkudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgaXRlbXMgPSBBcnJheS5mcm9tKHBhbmVsRWwucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXCIuc2V0dGluZy1pdGVtW2RhdGEtZmlsdGVyLXRleHRdXCIpKTtcbiAgICBsZXQgdmlzaWJsZUNvdW50ID0gMDtcblxuICAgIGl0ZW1zLmZvckVhY2goKGl0ZW1FbCkgPT4ge1xuICAgICAgY29uc3QgbWF0Y2hlcyA9ICFxdWVyeSB8fCAoaXRlbUVsLmRhdGFzZXQuZmlsdGVyVGV4dCA/PyBcIlwiKS5pbmNsdWRlcyhxdWVyeSk7XG4gICAgICBpdGVtRWwuY2xhc3NMaXN0LnRvZ2dsZShcImlzLWhpZGRlblwiLCAhbWF0Y2hlcyk7XG4gICAgICBpZiAobWF0Y2hlcykge1xuICAgICAgICB2aXNpYmxlQ291bnQgKz0gMTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IGVtcHR5U3RhdGVFbCA9IHBhbmVsRWwucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXCIub2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1lbXB0eVwiKTtcbiAgICBpZiAoZW1wdHlTdGF0ZUVsKSB7XG4gICAgICBlbXB0eVN0YXRlRWwuY2xhc3NMaXN0LnRvZ2dsZShcImlzLWhpZGRlblwiLCB2aXNpYmxlQ291bnQgPiAwKTtcbiAgICB9XG4gIH1cblxuICByZW5kZXJBY3RpdmVTZWN0aW9uKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIHN3aXRjaCAodGhpcy5hY3RpdmVTZWN0aW9uKSB7XG4gICAgICBjYXNlIFwiZ2VuZXJhbFwiOlxuICAgICAgICB0aGlzLnJlbmRlckdlbmVyYWxTZXR0aW5ncyhjb250YWluZXJFbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInJlbW90ZVwiOlxuICAgICAgICB0aGlzLnJlbmRlclJlbW90ZVNldHRpbmdzKGNvbnRhaW5lckVsKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic3luY1wiOlxuICAgICAgICB0aGlzLnJlbmRlclN5bmNTZXR0aW5ncyhjb250YWluZXJFbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcIm1lZGlhXCI6XG4gICAgICAgIHRoaXMucmVuZGVyTWVkaWFTZXR0aW5ncyhjb250YWluZXJFbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcImRlYnVnXCI6XG4gICAgICAgIHRoaXMucmVuZGVyRGVidWdTZXR0aW5ncyhjb250YWluZXJFbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgcmVuZGVyUGFuZWwocGFuZWxFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBwYW5lbEVsLmVtcHR5KCk7XG4gICAgdGhpcy5yZW5kZXJBY3RpdmVTZWN0aW9uKHBhbmVsRWwpO1xuICAgIHBhbmVsRWwuY3JlYXRlRGl2KHtcbiAgICAgIGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXNldHRpbmdzLWVtcHR5IGlzLWhpZGRlblwiLFxuICAgICAgdGV4dDogXCJcdTZDQTFcdTY3MDlcdTUzMzlcdTkxNERcdTUyMzBcdTVGNTNcdTUyNERcdTdCNUJcdTkwMDlcdTY3NjFcdTRFRjZcdTc2ODRcdThCQkVcdTdGNkVcdTk4NzlcdTMwMDJcIlxuICAgIH0pO1xuICAgIHRoaXMuYXBwbHlTZWFyY2hGaWx0ZXIocGFuZWxFbCk7XG4gIH1cblxuICBkaXNwbGF5KCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG4gICAgY29udGFpbmVyRWwucXVlcnlTZWxlY3RvckFsbChcIi5vYnNpZGlhbi1naXQtc3luY2VyLXNldHRpbmdzLXJvb3RcIikuZm9yRWFjaCgoZWxlbWVudCkgPT4gZWxlbWVudC5yZW1vdmUoKSk7XG4gICAgdGhpcy5yb290RWwgPSBjb250YWluZXJFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1yb290XCIgfSk7XG4gICAgdGhpcy5uYXZFbCA9IG51bGw7XG4gICAgdGhpcy5wYW5lbEVsID0gbnVsbDtcblxuICAgIHRoaXMucmVuZGVyU2VhcmNoQmFyKHRoaXMucm9vdEVsKTtcbiAgICB0aGlzLnJlbmRlclNlY3Rpb25UYWJzKHRoaXMucm9vdEVsKTtcblxuICAgIGNvbnN0IHNlY3Rpb25FbCA9IHRoaXMucm9vdEVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXNldHRpbmdzLXBhbmVsXCIgfSk7XG4gICAgdGhpcy5wYW5lbEVsID0gc2VjdGlvbkVsO1xuICAgIHRoaXMucmVuZGVyUGFuZWwoc2VjdGlvbkVsKTtcbiAgfVxufVxuXG5jbGFzcyBGb2xkZXJTZWxlY3RNb2RhbCBleHRlbmRzIEZ1enp5U3VnZ2VzdE1vZGFsPFRGb2xkZXI+IHtcbiAgcGx1Z2luOiBPYnNpZGlhbkdpdFN5bmNlclBsdWdpbjtcbiAgb25DaG9vc2VGb2xkZXI6IChmb2xkZXI6IFRGb2xkZXIpID0+IFByb21pc2U8dm9pZD4gfCB2b2lkO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIGFwcDogQXBwLFxuICAgIHBsdWdpbjogT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW4sXG4gICAgb25DaG9vc2VGb2xkZXI6IChmb2xkZXI6IFRGb2xkZXIpID0+IFByb21pc2U8dm9pZD4gfCB2b2lkXG4gICkge1xuICAgIHN1cGVyKGFwcCk7XG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gICAgdGhpcy5vbkNob29zZUZvbGRlciA9IG9uQ2hvb3NlRm9sZGVyO1xuICAgIHRoaXMuc2V0UGxhY2Vob2xkZXIoXCJcdTkwMDlcdTYyRTkgTG9jYWwgUm9vdCBQYXRoIFx1NzZFRVx1NUY1NVwiKTtcbiAgfVxuXG4gIGdldEl0ZW1zKCk6IFRGb2xkZXJbXSB7XG4gICAgcmV0dXJuIHRoaXMucGx1Z2luLmdldEFsbFZhdWx0Rm9sZGVycygpO1xuICB9XG5cbiAgZ2V0SXRlbVRleHQoZm9sZGVyOiBURm9sZGVyKTogc3RyaW5nIHtcbiAgICByZXR1cm4gZm9sZGVyLnBhdGggfHwgVkFVTFRfUk9PVF9QQVRIO1xuICB9XG5cbiAgYXN5bmMgb25DaG9vc2VJdGVtKGZvbGRlcjogVEZvbGRlcik6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMub25DaG9vc2VGb2xkZXIoZm9sZGVyKTtcbiAgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxzQkFjTztBQTJIUCxJQUFNLHNCQUFzQjtBQUM1QixJQUFNLGtCQUFrQjtBQUV4QixJQUFNLG1CQUF1QztBQUFBLEVBQzNDLGVBQWU7QUFBQSxFQUNmLGdCQUFnQjtBQUFBLEVBQ2hCLGFBQWE7QUFBQSxFQUNiLFFBQVE7QUFBQSxFQUNSLGVBQWU7QUFDakI7QUFFQSxJQUFNLGVBQThCO0FBQUEsRUFDbEMsT0FBTyxDQUFDO0FBQUEsRUFDUixZQUFZO0FBQUEsSUFDVixRQUFRO0FBQUEsSUFDUixTQUFTO0FBQUEsRUFDWDtBQUNGO0FBRUEsSUFBTSxxQkFBTixjQUFpQyxNQUFNO0FBQUEsRUFLckMsWUFBWSxRQUFnQixTQUFpQixRQUFnQixNQUFjO0FBQ3pFLFVBQU0sT0FBTztBQUNiLFNBQUssU0FBUztBQUNkLFNBQUssU0FBUztB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
