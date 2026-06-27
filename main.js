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
  repositoryUrl: "https://github.com/imliusx/obsidian-git-syncer.git",
  githubUsername: "",
  githubToken: "",
  branch: "main",
  localRootPath: "content"
};
var DEFAULT_DATA = {
  files: {}
};
var GitHubRequestError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
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
    `title: "${escapeYaml(resolvedTitle)}"`,
    'summary: ""',
    `date: "${today}"`,
    `updated: "${today}"`,
    'tags: ""',
    "draft: false",
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
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
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
      (item) => item.setTitle("\u6253\u5F00 GitHub").setIcon("external-link").setDisabled(!context?.canOpenRemote).onClick(() => {
        if (context) {
          void this.runWithNotice(() => this.openRemoteUrlForFile(context.file));
        }
      })
    );
    menu.addItem(
      (item) => item.setTitle("\u8BE6\u60C5").setIcon("git-branch").setDisabled(!context).onClick(() => this.openActionModal(context?.file))
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
      (item) => item.setTitle("\u6D4B\u8BD5 GitHub \u8FDE\u63A5").setIcon("globe").onClick(() => void this.runWithNotice(() => this.testConnection()))
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
      (item) => item.setTitle("\u8BE6\u60C5").setIcon("git-branch").onClick(() => this.openActionModal(context.file))
    );
    menu.addItem(
      (item) => item.setTitle("\u63D2\u5165\u6587\u7AE0\u5C5E\u6027").setIcon("file-plus-2").setDisabled(!context.canInsertProperties).onClick(() => void this.runWithNotice(() => this.ensureTemplateFrontmatter(context.file)))
    );
    menu.addSeparator();
    menu.addItem(
      (item) => item.setTitle(context.state.status === "deleted" ? "\u8FDC\u7AEF\u5DF2\u5220\u9664" : "\u5220\u9664\u8FDC\u7AEF\u6587\u4EF6").setIcon("cloud-off").setWarning(true).setDisabled(!context.canDeleteRemote).onClick(() => void this.runWithNotice(() => this.deleteRemoteFile(context.file)))
    );
  }
  openActionModal(file) {
    new GitSyncerActionModal(this.app, this, file ?? this.getCurrentFile()).open();
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
      throw new GitHubRequestError(response.status, errorMessage || `GitHub HTTP ${response.status}`);
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
    this.validateConfig();
    const repository = this.getRepository();
    const user = await this.githubRequest("GET", "/user");
    await this.githubRequest("GET", this.buildRepoApiPath());
    await this.githubRequest("GET", this.buildBranchApiPath());
    if (user.login.toLowerCase() !== this.settings.githubUsername.trim().toLowerCase()) {
      throw new Error(`Token \u7528\u6237\u4E3A ${user.login}\uFF0C\u4E0E\u914D\u7F6E\u7684 GitHub Username \u4E0D\u4E00\u81F4\u3002`);
    }
    new import_obsidian.Notice(`\u8FDE\u63A5\u6210\u529F\uFF1A${repository.owner}/${repository.repo}@${this.settings.branch.trim()}`);
  }
  async syncFileToGitHub(file) {
    this.validateConfig();
    if (!this.isInsideRoot(file)) {
      throw new Error("\u5F53\u524D\u6587\u7AE0\u4E0D\u5728 Local Root Path \u5185\u3002");
    }
    const content = await this.app.vault.read(file);
    const currentHash = hashContent(content);
    const remotePath = this.remotePath(file);
    try {
      const remote = await this.getRemoteContent(remotePath);
      const result = await this.githubRequest("PUT", this.buildContentApiPath(remotePath), {
        message: `${remote ? "sync: update" : "sync: add"} ${remotePath}`,
        content: encodeBase64(content),
        branch: this.settings.branch.trim(),
        sha: remote?.sha
      });
      const nextSha = result.content?.sha ?? remote?.sha;
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
var GitSyncerActionModal = class extends import_obsidian.Modal {
  constructor(app, plugin, targetFile) {
    super(app);
    this.plugin = plugin;
    this.targetFile = targetFile ?? null;
  }
  onOpen() {
    void this.render();
  }
  async render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("obsidian-git-syncer-actions");
    const file = this.targetFile ?? this.plugin.getCurrentFile();
    const header = contentEl.createEl("h2", { text: "Obsidian Git Syncer" });
    header.style.marginBottom = "8px";
    if (!file) {
      contentEl.createEl("p", { text: "\u5F53\u524D\u6CA1\u6709\u6FC0\u6D3B\u7684 Markdown \u6587\u4EF6\u3002" });
      return;
    }
    const state = await this.plugin.getEffectiveState(file);
    const inRoot = this.plugin.isInsideRoot(file);
    const content = await this.plugin.app.vault.read(file);
    const frontmatter = parseFrontmatter(content).data;
    const hasFrontmatter = Object.keys(frontmatter).length > 0;
    const canSync = inRoot && state.status !== "synced";
    const canDeleteRemote = Boolean(state.sha) && state.status !== "deleted";
    const canOpenRemote = Boolean(state.htmlUrl || state.remotePath) && state.status !== "deleted";
    const syncButtonText = state.status === "modified" ? "\u66F4\u65B0\u540C\u6B65" : state.status === "deleted" ? "\u91CD\u65B0\u540C\u6B65" : state.status === "failed" ? "\u518D\u6B21\u540C\u6B65" : state.status === "synced" ? "\u5DF2\u540C\u6B65" : "\u540C\u6B65";
    const syncDescription = !inRoot ? "\u5F53\u524D\u6587\u7AE0\u4E0D\u5728 Local Root Path \u5185\u3002" : state.status === "synced" ? "\u5F53\u524D\u8FDC\u7AEF\u6587\u4EF6\u5DF2\u7ECF\u662F\u6700\u65B0\u72B6\u6001\u3002" : `\u4E0A\u4F20\u5F53\u524D\u7B14\u8BB0\u5230 GitHub \u4ED3\u5E93\u7684 ${REMOTE_CONTENT_ROOT} \u76EE\u5F55\u3002`;
    const badge = contentEl.createDiv({
      cls: `obsidian-git-syncer-status-badge ${toStatusClass(state.status)}`
    });
    badge.setText(toStatusLabel(state.status));
    contentEl.createEl("p", { text: `\u5F53\u524D\u6587\u4EF6\uFF1A${file.path}` });
    contentEl.createEl("p", {
      text: `\u8FDC\u7AEF\u8DEF\u5F84\uFF1A${state.remotePath ?? (inRoot ? this.plugin.remotePath(file) : `${REMOTE_CONTENT_ROOT}/...`)}`,
      cls: "obsidian-git-syncer-muted"
    });
    contentEl.createEl("p", {
      text: `\u72B6\u6001\uFF1A${toStatusLabel(state.status)}${state.lastSyncedAt ? ` \xB7 \u6700\u8FD1\u540C\u6B65 ${state.lastSyncedAt}` : ""}`,
      cls: "obsidian-git-syncer-muted"
    });
    contentEl.createEl("p", {
      text: inRoot ? `\u5F53\u524D\u6587\u4EF6\u4F4D\u4E8E\u540C\u6B65\u76EE\u5F55\u5185\uFF1A${this.plugin.settings.localRootPath}` : `\u5F53\u524D\u6587\u4EF6\u4E0D\u5728\u540C\u6B65\u76EE\u5F55\u5185\uFF1A${this.plugin.settings.localRootPath}`,
      cls: "obsidian-git-syncer-muted"
    });
    new import_obsidian.Setting(contentEl).setName("\u63D2\u5165\u6587\u7AE0\u5C5E\u6027").setDesc(hasFrontmatter ? "\u5F53\u524D\u6587\u7AE0\u5DF2\u7ECF\u5B58\u5728\u6587\u7AE0\u5C5E\u6027\u3002" : "\u4E3A\u5F53\u524D\u6587\u7AE0\u63D2\u5165 Quartz \u5E38\u7528\u6587\u7AE0\u5C5E\u6027\u3002").addButton(
      (button) => button.setButtonText(hasFrontmatter ? "\u5DF2\u5B58\u5728" : "\u6267\u884C").setDisabled(!inRoot || hasFrontmatter).onClick(async () => {
        await this.runAction(() => this.plugin.ensureTemplateFrontmatter(file));
        await this.render();
      })
    );
    new import_obsidian.Setting(contentEl).setName("\u540C\u6B65\u5F53\u524D\u6587\u7AE0").setDesc(syncDescription).addButton((button) => {
      button.setButtonText(syncButtonText).setDisabled(!canSync);
      if (canSync) {
        button.setCta();
      }
      button.onClick(async () => {
        await this.runAction(() => this.plugin.syncFileToGitHub(file));
        await this.render();
      });
    });
    new import_obsidian.Setting(contentEl).setName("\u5220\u9664\u8FDC\u7AEF\u6587\u4EF6").setDesc("\u4ECE GitHub \u4ED3\u5E93 content \u76EE\u5F55\u5220\u9664\u5F53\u524D\u6587\u7AE0\u5BF9\u5E94\u6587\u4EF6\u3002").addButton((button) => {
      button.setButtonText("\u5220\u9664").setDisabled(!canDeleteRemote);
      if (canDeleteRemote) {
        button.setWarning();
      }
      button.onClick(async () => {
        await this.runAction(() => this.plugin.deleteRemoteFile(file));
        await this.render();
      });
    });
    new import_obsidian.Setting(contentEl).setName("\u6253\u5F00 GitHub \u6587\u4EF6").setDesc(canOpenRemote ? "\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00\u5F53\u524D\u6587\u7AE0\u7684 GitHub \u6587\u4EF6\u9875\u9762\u3002" : "\u5F53\u524D\u6587\u7AE0\u6CA1\u6709\u53EF\u6253\u5F00\u7684\u8FDC\u7AEF\u6587\u4EF6\u3002").addButton(
      (button) => button.setButtonText("\u6253\u5F00").setDisabled(!canOpenRemote).onClick(() => void this.plugin.openRemoteUrlForFile(file))
    );
  }
  async runAction(action) {
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u672A\u77E5\u9519\u8BEF";
      new import_obsidian.Notice(message);
    }
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
  renderGeneralSettings(containerEl) {
    const localRootDescription = this.plugin.getExistingFolder(this.plugin.settings.localRootPath) ? `\u5F53\u524D\u76EE\u5F55\u6709\u6548\uFF1A${this.plugin.settings.localRootPath}` : "\u53EA\u6709\u8BE5\u76EE\u5F55\u5185\u7684 Markdown \u624D\u5141\u8BB8\u540C\u6B65\u3002\u5F53\u524D\u503C\u65E0\u6548\u65F6\u8BF7\u91CD\u65B0\u9009\u62E9\u76EE\u5F55\u3002";
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
    this.renderSectionSubheading(containerEl, "\u5E2E\u52A9\u4E0E\u652F\u6301");
    this.createSearchableSetting(containerEl, "\u63D2\u4EF6\u7248\u672C", "\u67E5\u770B\u5F53\u524D\u63D2\u4EF6\u7248\u672C\u3001\u63D2\u4EF6 ID \u4E0E\u517C\u5BB9\u6027\u4FE1\u606F\u3002").setName("\u63D2\u4EF6\u7248\u672C").setDesc("\u67E5\u770B\u5F53\u524D\u63D2\u4EF6\u7248\u672C\u3001\u63D2\u4EF6 ID \u4E0E\u517C\u5BB9\u6027\u4FE1\u606F\u3002").addButton(
      (button) => button.setButtonText("\u67E5\u770B").onClick(() => {
        new PluginVersionModal(this.app, this.plugin).open();
      })
    );
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
        await this.plugin.saveSettings();
      })
    );
    this.createSearchableSetting(containerEl, "GitHub Username", "\u5F53\u524D\u6388\u6743 Token \u5BF9\u5E94\u7684 GitHub \u7528\u6237\u540D\u3002", this.plugin.settings.githubUsername).setName("GitHub Username").setDesc("\u5F53\u524D\u6388\u6743 Token \u5BF9\u5E94\u7684 GitHub \u7528\u6237\u540D\u3002").addText(
      (text) => text.setPlaceholder("imliusx").setValue(this.plugin.settings.githubUsername).onChange(async (value) => {
        this.plugin.settings.githubUsername = value.trim();
        await this.plugin.saveSettings();
      })
    );
    this.createSearchableSetting(containerEl, "GitHub Token", "Fine-grained Token \u9700\u8981\u5F00\u542F Contents \u8BFB\u5199\u6743\u9650\u3002").setName("GitHub Token").setDesc("Fine-grained Token \u9700\u8981\u6388\u6743\u76EE\u6807\u4ED3\u5E93\uFF0C\u5E76\u5F00\u542F Contents \u8BFB\u5199\u6743\u9650\u3002").addText((text) => {
      text.inputEl.type = "password";
      text.setPlaceholder("github_pat_...").setValue(this.plugin.settings.githubToken).onChange(async (value) => {
        this.plugin.settings.githubToken = value.trim();
        await this.plugin.saveSettings();
      });
    });
    this.createSearchableSetting(containerEl, "Branch", "\u4F8B\u5982 main", this.plugin.settings.branch).setName("Branch").setDesc("\u540C\u6B65\u5199\u5165\u7684\u76EE\u6807\u5206\u652F\u3002").addText(
      (text) => text.setPlaceholder("main").setValue(this.plugin.settings.branch).onChange(async (value) => {
        this.plugin.settings.branch = value.trim();
        await this.plugin.saveSettings();
      })
    );
    this.createSearchableSetting(containerEl, "\u6D4B\u8BD5\u8FDE\u63A5", "\u9A8C\u8BC1\u5F53\u524D\u4ED3\u5E93\u3001Token \u548C\u5206\u652F\u914D\u7F6E\u662F\u5426\u53EF\u8BBF\u95EE\u3002").setName("\u6D4B\u8BD5\u8FDE\u63A5").setDesc("\u9A8C\u8BC1\u5F53\u524D\u4ED3\u5E93\u3001Token \u548C\u5206\u652F\u914D\u7F6E\u662F\u5426\u53EF\u8BBF\u95EE\u3002").addButton(
      (button) => button.setButtonText("\u6D4B\u8BD5\u8FDE\u63A5").onClick(async () => {
        try {
          await this.plugin.testConnection();
        } catch (error) {
          const message = error instanceof Error ? error.message : "\u8FDE\u63A5\u5931\u8D25";
          new import_obsidian.Notice(message);
        }
      })
    );
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7XG4gIEFwcCxcbiAgRnV6enlTdWdnZXN0TW9kYWwsXG4gIE1lbnUsXG4gIE1vZGFsLFxuICBOb3RpY2UsXG4gIFBsdWdpbixcbiAgUGx1Z2luU2V0dGluZ1RhYixcbiAgU2V0dGluZyxcbiAgc2V0SWNvbixcbiAgVEZpbGUsXG4gIFRGb2xkZXIsXG4gIG5vcm1hbGl6ZVBhdGgsXG4gIHJlcXVlc3RVcmxcbn0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmludGVyZmFjZSBHaXRIdWJTeW5jU2V0dGluZ3Mge1xuICByZXBvc2l0b3J5VXJsOiBzdHJpbmc7XG4gIGdpdGh1YlVzZXJuYW1lOiBzdHJpbmc7XG4gIGdpdGh1YlRva2VuOiBzdHJpbmc7XG4gIGJyYW5jaDogc3RyaW5nO1xuICBsb2NhbFJvb3RQYXRoOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBMb2NhbEZpbGVTdGF0ZSB7XG4gIHJlbW90ZVBhdGg/OiBzdHJpbmc7XG4gIHNoYT86IHN0cmluZztcbiAgc3RhdHVzOiBcImRyYWZ0XCIgfCBcInN5bmNlZFwiIHwgXCJtb2RpZmllZFwiIHwgXCJkZWxldGVkXCIgfCBcImZhaWxlZFwiO1xuICBsYXN0U3luY2VkQXQ/OiBzdHJpbmc7XG4gIGxhc3RTeW5jZWRIYXNoPzogc3RyaW5nO1xuICBodG1sVXJsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUGVyc2lzdGVkRGF0YSB7XG4gIGZpbGVzOiBSZWNvcmQ8c3RyaW5nLCBMb2NhbEZpbGVTdGF0ZT47XG59XG5cbmludGVyZmFjZSBBcnRpY2xlQWN0aW9uQ29udGV4dCB7XG4gIGZpbGU6IFRGaWxlO1xuICBpblJvb3Q6IGJvb2xlYW47XG4gIGhhc1Byb3BlcnRpZXM6IGJvb2xlYW47XG4gIHN0YXRlOiBMb2NhbEZpbGVTdGF0ZTtcbiAgc3luY1RpdGxlOiBzdHJpbmc7XG4gIGNhblN5bmM6IGJvb2xlYW47XG4gIGNhbkRlbGV0ZVJlbW90ZTogYm9vbGVhbjtcbiAgY2FuT3BlblJlbW90ZTogYm9vbGVhbjtcbiAgY2FuSW5zZXJ0UHJvcGVydGllczogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIEdpdEh1YlJlcG8ge1xuICBvd25lcjogc3RyaW5nO1xuICByZXBvOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBHaXRIdWJFcnJvclBheWxvYWQge1xuICBtZXNzYWdlPzogc3RyaW5nO1xuICBkb2N1bWVudGF0aW9uX3VybD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEdpdEh1YkNvbnRlbnRSZXNwb25zZSB7XG4gIHR5cGU6IHN0cmluZztcbiAgcGF0aDogc3RyaW5nO1xuICBzaGE6IHN0cmluZztcbiAgaHRtbF91cmw/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBHaXRIdWJQdXRSZXNwb25zZSB7XG4gIGNvbnRlbnQ/OiBHaXRIdWJDb250ZW50UmVzcG9uc2UgfCBudWxsO1xufVxuXG5pbnRlcmZhY2UgR2l0SHViRGVsZXRlUmVzcG9uc2Uge1xuICBjb250ZW50PzogR2l0SHViQ29udGVudFJlc3BvbnNlIHwgbnVsbDtcbn1cblxuaW50ZXJmYWNlIEdpdEh1YlVzZXJSZXNwb25zZSB7XG4gIGxvZ2luOiBzdHJpbmc7XG59XG5cbmNvbnN0IFJFTU9URV9DT05URU5UX1JPT1QgPSBcImNvbnRlbnRcIjtcblxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogR2l0SHViU3luY1NldHRpbmdzID0ge1xuICByZXBvc2l0b3J5VXJsOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9pbWxpdXN4L29ic2lkaWFuLWdpdC1zeW5jZXIuZ2l0XCIsXG4gIGdpdGh1YlVzZXJuYW1lOiBcIlwiLFxuICBnaXRodWJUb2tlbjogXCJcIixcbiAgYnJhbmNoOiBcIm1haW5cIixcbiAgbG9jYWxSb290UGF0aDogXCJjb250ZW50XCJcbn07XG5cbmNvbnN0IERFRkFVTFRfREFUQTogUGVyc2lzdGVkRGF0YSA9IHtcbiAgZmlsZXM6IHt9XG59O1xuXG5jbGFzcyBHaXRIdWJSZXF1ZXN0RXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIHN0YXR1czogbnVtYmVyO1xuXG4gIGNvbnN0cnVjdG9yKHN0YXR1czogbnVtYmVyLCBtZXNzYWdlOiBzdHJpbmcpIHtcbiAgICBzdXBlcihtZXNzYWdlKTtcbiAgICB0aGlzLnN0YXR1cyA9IHN0YXR1cztcbiAgfVxufVxuXG5mdW5jdGlvbiBlc2NhcGVZYW1sKGlucHV0OiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gaW5wdXQucmVwbGFjZSgvXCIvZywgJ1xcXFxcIicpO1xufVxuXG5mdW5jdGlvbiBwYXJzZUZyb250bWF0dGVyKGNvbnRlbnQ6IHN0cmluZyk6IHsgZGF0YTogUmVjb3JkPHN0cmluZywgc3RyaW5nPjsgYm9keTogc3RyaW5nIH0ge1xuICBpZiAoIWNvbnRlbnQuc3RhcnRzV2l0aChcIi0tLVxcblwiKSkge1xuICAgIHJldHVybiB7IGRhdGE6IHt9LCBib2R5OiBjb250ZW50IH07XG4gIH1cblxuICBjb25zdCBlbmQgPSBjb250ZW50LmluZGV4T2YoXCJcXG4tLS1cXG5cIiwgNCk7XG4gIGlmIChlbmQgPT09IC0xKSB7XG4gICAgcmV0dXJuIHsgZGF0YToge30sIGJvZHk6IGNvbnRlbnQgfTtcbiAgfVxuXG4gIGNvbnN0IHJhdyA9IGNvbnRlbnQuc2xpY2UoNCwgZW5kKS5zcGxpdChcIlxcblwiKTtcbiAgY29uc3QgZGF0YTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXG4gIGZvciAoY29uc3QgbGluZSBvZiByYXcpIHtcbiAgICBjb25zdCBzZXBhcmF0b3IgPSBsaW5lLmluZGV4T2YoXCI6XCIpO1xuICAgIGlmIChzZXBhcmF0b3IgPT09IC0xKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBrZXkgPSBsaW5lLnNsaWNlKDAsIHNlcGFyYXRvcikudHJpbSgpO1xuICAgIGNvbnN0IHZhbHVlID0gbGluZS5zbGljZShzZXBhcmF0b3IgKyAxKS50cmltKCkucmVwbGFjZSgvXlwifFwiJC9nLCBcIlwiKTtcbiAgICBpZiAoa2V5KSB7XG4gICAgICBkYXRhW2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBkYXRhLCBib2R5OiBjb250ZW50LnNsaWNlKGVuZCArIDUpIH07XG59XG5cbmZ1bmN0aW9uIGJ1aWxkRnJvbnRtYXR0ZXIoZmlsZTogVEZpbGUsIHRpdGxlPzogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgdG9kYXkgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xuICBjb25zdCByZXNvbHZlZFRpdGxlID0gdGl0bGU/LnRyaW0oKSB8fCBmaWxlLmJhc2VuYW1lO1xuXG4gIHJldHVybiBbXG4gICAgXCItLS1cIixcbiAgICBgdGl0bGU6IFwiJHtlc2NhcGVZYW1sKHJlc29sdmVkVGl0bGUpfVwiYCxcbiAgICAnc3VtbWFyeTogXCJcIicsXG4gICAgYGRhdGU6IFwiJHt0b2RheX1cImAsXG4gICAgYHVwZGF0ZWQ6IFwiJHt0b2RheX1cImAsXG4gICAgJ3RhZ3M6IFwiXCInLFxuICAgIFwiZHJhZnQ6IGZhbHNlXCIsXG4gICAgXCItLS1cIixcbiAgICBcIlwiXG4gIF0uam9pbihcIlxcblwiKTtcbn1cblxuZnVuY3Rpb24gcGFkRGF0ZU51bWJlcih2YWx1ZTogbnVtYmVyKTogc3RyaW5nIHtcbiAgcmV0dXJuIFN0cmluZyh2YWx1ZSkucGFkU3RhcnQoMiwgXCIwXCIpO1xufVxuXG5mdW5jdGlvbiBmb3JtYXREYXRlVGltZShpbnB1dDogRGF0ZSB8IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGRhdGUgPSB0eXBlb2YgaW5wdXQgPT09IFwic3RyaW5nXCIgPyBuZXcgRGF0ZShpbnB1dCkgOiBpbnB1dDtcblxuICBpZiAoTnVtYmVyLmlzTmFOKGRhdGUuZ2V0VGltZSgpKSkge1xuICAgIHJldHVybiB0eXBlb2YgaW5wdXQgPT09IFwic3RyaW5nXCIgPyBpbnB1dCA6IFwiXCI7XG4gIH1cblxuICByZXR1cm4gW1xuICAgIGAke2RhdGUuZ2V0RnVsbFllYXIoKX0tJHtwYWREYXRlTnVtYmVyKGRhdGUuZ2V0TW9udGgoKSArIDEpfS0ke3BhZERhdGVOdW1iZXIoZGF0ZS5nZXREYXRlKCkpfWAsXG4gICAgYCR7cGFkRGF0ZU51bWJlcihkYXRlLmdldEhvdXJzKCkpfToke3BhZERhdGVOdW1iZXIoZGF0ZS5nZXRNaW51dGVzKCkpfToke3BhZERhdGVOdW1iZXIoZGF0ZS5nZXRTZWNvbmRzKCkpfWBcbiAgXS5qb2luKFwiIFwiKTtcbn1cblxuZnVuY3Rpb24gaGFzaENvbnRlbnQoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBoYXNoID0gMDtcblxuICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgaW5wdXQubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgaGFzaCA9IChoYXNoICogMzEgKyBpbnB1dC5jaGFyQ29kZUF0KGluZGV4KSkgfCAwO1xuICB9XG5cbiAgcmV0dXJuIGBoJHtNYXRoLmFicyhoYXNoKX1gO1xufVxuXG5mdW5jdGlvbiBlbmNvZGVCYXNlNjQoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGJ5dGVzID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKGlucHV0KTtcbiAgbGV0IGJpbmFyeSA9IFwiXCI7XG5cbiAgYnl0ZXMuZm9yRWFjaCgoYnl0ZSkgPT4ge1xuICAgIGJpbmFyeSArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ5dGUpO1xuICB9KTtcblxuICByZXR1cm4gYnRvYShiaW5hcnkpO1xufVxuXG5mdW5jdGlvbiBwYXJzZVJlcG9zaXRvcnlVcmwoaW5wdXQ6IHN0cmluZyk6IEdpdEh1YlJlcG8gfCBudWxsIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IGlucHV0LnRyaW0oKS5yZXBsYWNlKC9cXC8kLywgXCJcIikucmVwbGFjZSgvXFwuZ2l0JC8sIFwiXCIpO1xuICBjb25zdCBodHRwc01hdGNoID0gL15odHRwcz86XFwvXFwvZ2l0aHViXFwuY29tXFwvKFteL10rKVxcLyhbXi9dKykkLy5leGVjKG5vcm1hbGl6ZWQpO1xuICBjb25zdCBzc2hNYXRjaCA9IC9eZ2l0QGdpdGh1YlxcLmNvbTooW14vXSspXFwvKFteL10rKSQvLmV4ZWMobm9ybWFsaXplZCk7XG4gIGNvbnN0IHNob3J0aGFuZE1hdGNoID0gL14oW14vXFxzXSspXFwvKFteL1xcc10rKSQvLmV4ZWMobm9ybWFsaXplZCk7XG4gIGNvbnN0IG1hdGNoID0gaHR0cHNNYXRjaCA/PyBzc2hNYXRjaCA/PyBzaG9ydGhhbmRNYXRjaDtcblxuICBpZiAoIW1hdGNoKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG93bmVyOiBtYXRjaFsxXSxcbiAgICByZXBvOiBtYXRjaFsyXVxuICB9O1xufVxuXG5mdW5jdGlvbiBlbmNvZGVHaXRIdWJQYXRoKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBwYXRoLnNwbGl0KFwiL1wiKS5tYXAoZW5jb2RlVVJJQ29tcG9uZW50KS5qb2luKFwiL1wiKTtcbn1cblxuZnVuY3Rpb24gaXNTYWZlQ29udGVudFBhdGgocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVQYXRoKHBhdGgpLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG4gIGNvbnN0IHNlZ21lbnRzID0gbm9ybWFsaXplZC5zcGxpdChcIi9cIik7XG4gIHJldHVybiBub3JtYWxpemVkLnN0YXJ0c1dpdGgoYCR7UkVNT1RFX0NPTlRFTlRfUk9PVH0vYCkgJiYgIXNlZ21lbnRzLnNvbWUoKHNlZ21lbnQpID0+IHNlZ21lbnQgPT09IFwiLi5cIiB8fCBzZWdtZW50ID09PSBcIlwiKTtcbn1cblxuZnVuY3Rpb24gdG9TdGF0dXNMYWJlbChzdGF0dXM6IExvY2FsRmlsZVN0YXRlW1wic3RhdHVzXCJdKTogc3RyaW5nIHtcbiAgc3dpdGNoIChzdGF0dXMpIHtcbiAgICBjYXNlIFwic3luY2VkXCI6XG4gICAgICByZXR1cm4gXCJcdTVERjJcdTU0MENcdTZCNjVcIjtcbiAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIHJldHVybiBcIlx1NURGMlx1NEZFRVx1NjUzOVwiO1xuICAgIGNhc2UgXCJkZWxldGVkXCI6XG4gICAgICByZXR1cm4gXCJcdThGRENcdTdBRUZcdTVERjJcdTUyMjBcdTk2NjRcIjtcbiAgICBjYXNlIFwiZmFpbGVkXCI6XG4gICAgICByZXR1cm4gXCJcdTU0MENcdTZCNjVcdTU5MzFcdThEMjVcIjtcbiAgICBjYXNlIFwiZHJhZnRcIjpcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIFwiXHU2NzJBXHU1NDBDXHU2QjY1XCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gdG9TdGF0dXNDbGFzcyhzdGF0dXM6IExvY2FsRmlsZVN0YXRlW1wic3RhdHVzXCJdKTogc3RyaW5nIHtcbiAgc3dpdGNoIChzdGF0dXMpIHtcbiAgICBjYXNlIFwic3luY2VkXCI6XG4gICAgICByZXR1cm4gXCJpcy1zeW5jZWRcIjtcbiAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIHJldHVybiBcImlzLW1vZGlmaWVkXCI7XG4gICAgY2FzZSBcImRlbGV0ZWRcIjpcbiAgICAgIHJldHVybiBcImlzLWRlbGV0ZWRcIjtcbiAgICBjYXNlIFwiZmFpbGVkXCI6XG4gICAgICByZXR1cm4gXCJpcy1mYWlsZWRcIjtcbiAgICBjYXNlIFwiZHJhZnRcIjpcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIFwiaXMtZHJhZnRcIjtcbiAgfVxufVxuXG5mdW5jdGlvbiB0b1N0YXR1c0ljb24oc3RhdHVzOiBMb2NhbEZpbGVTdGF0ZVtcInN0YXR1c1wiXSk6IHN0cmluZyB7XG4gIHN3aXRjaCAoc3RhdHVzKSB7XG4gICAgY2FzZSBcInN5bmNlZFwiOlxuICAgICAgcmV0dXJuIFwiY2xvdWQtY2hlY2tcIjtcbiAgICBjYXNlIFwibW9kaWZpZWRcIjpcbiAgICAgIHJldHVybiBcInBlbmNpbFwiO1xuICAgIGNhc2UgXCJkZWxldGVkXCI6XG4gICAgICByZXR1cm4gXCJjbG91ZC1vZmZcIjtcbiAgICBjYXNlIFwiZmFpbGVkXCI6XG4gICAgICByZXR1cm4gXCJhbGVydC10cmlhbmdsZVwiO1xuICAgIGNhc2UgXCJkcmFmdFwiOlxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gXCJmaWxlLXBlblwiO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgc2V0dGluZ3M6IEdpdEh1YlN5bmNTZXR0aW5ncyA9IERFRkFVTFRfU0VUVElOR1M7XG4gIGRhdGE6IFBlcnNpc3RlZERhdGEgPSBERUZBVUxUX0RBVEE7XG4gIHN0YXR1c0JhckVsITogSFRNTEVsZW1lbnQ7XG4gIHN0YXR1c0Jhckljb25FbCE6IEhUTUxFbGVtZW50O1xuICBzdGF0dXNCYXJUZXh0RWwhOiBIVE1MRWxlbWVudDtcblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcblxuICAgIHRoaXMuYWRkUmliYm9uSWNvbihcImdpdC1icmFuY2hcIiwgXCJPYnNpZGlhbiBHaXQgU3luY2VyXCIsIChldnQpID0+IHtcbiAgICAgIHRoaXMuc2hvd1JpYmJvbk1lbnUoZXZ0KTtcbiAgICB9KTtcblxuICAgIHRoaXMuc3RhdHVzQmFyRWwgPSB0aGlzLmFkZFN0YXR1c0Jhckl0ZW0oKTtcbiAgICB0aGlzLnN0YXR1c0JhckVsLmFkZENsYXNzKFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zdGF0dXNcIik7XG4gICAgdGhpcy5zdGF0dXNCYXJJY29uRWwgPSB0aGlzLnN0YXR1c0JhckVsLmNyZWF0ZVNwYW4oeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zdGF0dXMtaWNvblwiIH0pO1xuICAgIHRoaXMuc3RhdHVzQmFyVGV4dEVsID0gdGhpcy5zdGF0dXNCYXJFbC5jcmVhdGVTcGFuKHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc3RhdHVzLXRleHRcIiB9KTtcbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IEdpdFN5bmNlclNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJmaWxlLW9wZW5cIiwgKCkgPT4gdm9pZCB0aGlzLnJlZnJlc2hTdGF0dXNCYXIoKSkpO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLnZhdWx0Lm9uKFwibW9kaWZ5XCIsIChmaWxlKSA9PiB7XG4gICAgICAgIGlmIChmaWxlIGluc3RhbmNlb2YgVEZpbGUgJiYgZmlsZSA9PT0gdGhpcy5nZXRDdXJyZW50RmlsZSgpKSB7XG4gICAgICAgICAgdm9pZCB0aGlzLnJlZnJlc2hTdGF0dXNCYXIoKTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApO1xuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImVkaXRvci1tZW51XCIsIChtZW51KSA9PiB7XG4gICAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmdldEN1cnJlbnRGaWxlKCk7XG4gICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYWRkQXJ0aWNsZUNvbnRleHRNZW51SXRlbXMobWVudSwgZmlsZSk7XG4gICAgICB9KVxuICAgICk7XG5cbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hTdGF0dXNCYXIoKTtcbiAgfVxuXG4gIGFzeW5jIGxvYWRTZXR0aW5ncygpIHtcbiAgICBjb25zdCBzYXZlZCA9IChhd2FpdCB0aGlzLmxvYWREYXRhKCkpIGFzIHsgc2V0dGluZ3M/OiBQYXJ0aWFsPEdpdEh1YlN5bmNTZXR0aW5ncz47IGRhdGE/OiBQZXJzaXN0ZWREYXRhIH0gfCBudWxsO1xuICAgIHRoaXMuc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MsIC4uLihzYXZlZD8uc2V0dGluZ3MgPz8ge30pIH07XG4gICAgdGhpcy5kYXRhID0geyAuLi5ERUZBVUxUX0RBVEEsIC4uLihzYXZlZD8uZGF0YSA/PyB7fSkgfTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVBbGxEYXRhKCkge1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEoe1xuICAgICAgc2V0dGluZ3M6IHRoaXMuc2V0dGluZ3MsXG4gICAgICBkYXRhOiB0aGlzLmRhdGFcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gIH1cblxuICBnZXRSZXBvc2l0b3J5KCk6IEdpdEh1YlJlcG8ge1xuICAgIGNvbnN0IHJlcG9zaXRvcnkgPSBwYXJzZVJlcG9zaXRvcnlVcmwodGhpcy5zZXR0aW5ncy5yZXBvc2l0b3J5VXJsKTtcbiAgICBpZiAoIXJlcG9zaXRvcnkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkdpdEh1YiBcdTRFRDNcdTVFOTNcdTU3MzBcdTU3NDBcdTY4M0NcdTVGMEZcdTRFMERcdTZCNjNcdTc4NkVcdTMwMDJcdTY1MkZcdTYzMDEgaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8uZ2l0XHUzMDAxZ2l0QGdpdGh1Yi5jb206b3duZXIvcmVwby5naXQgXHU2MjE2IG93bmVyL3JlcG9cdTMwMDJcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlcG9zaXRvcnk7XG4gIH1cblxuICB2YWxpZGF0ZUNvbmZpZygpIHtcbiAgICB0aGlzLmdldFJlcG9zaXRvcnkoKTtcblxuICAgIGlmICghdGhpcy5zZXR0aW5ncy5naXRodWJVc2VybmFtZS50cmltKCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1OEJGN1x1NTE0OFx1NTg2Qlx1NTE5OSBHaXRIdWIgVXNlcm5hbWVcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnNldHRpbmdzLmdpdGh1YlRva2VuLnRyaW0oKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4QkY3XHU1MTQ4XHU1ODZCXHU1MTk5IEdpdEh1YiBUb2tlblx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4QkY3XHU1MTQ4XHU1ODZCXHU1MTk5XHU3NkVFXHU2ODA3XHU1MjA2XHU2NTJGXHUzMDAyXCIpO1xuICAgIH1cbiAgfVxuXG4gIGdldEV4aXN0aW5nRm9sZGVyKHBhdGg6IHN0cmluZyk6IFRGb2xkZXIgfCBudWxsIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGF0aChwYXRoKS5yZXBsYWNlKC9cXC8kLywgXCJcIik7XG4gICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKG5vcm1hbGl6ZWQpO1xuICAgIHJldHVybiB0YXJnZXQgaW5zdGFuY2VvZiBURm9sZGVyID8gdGFyZ2V0IDogbnVsbDtcbiAgfVxuXG4gIGdldEFsbFZhdWx0Rm9sZGVycygpOiBURm9sZGVyW10ge1xuICAgIGNvbnN0IGZvbGRlcnM6IFRGb2xkZXJbXSA9IFtdO1xuXG4gICAgdGhpcy5hcHAudmF1bHQuZ2V0QWxsTG9hZGVkRmlsZXMoKS5mb3JFYWNoKChlbnRyeSkgPT4ge1xuICAgICAgaWYgKGVudHJ5IGluc3RhbmNlb2YgVEZvbGRlciAmJiBlbnRyeS5wYXRoKSB7XG4gICAgICAgIGZvbGRlcnMucHVzaChlbnRyeSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gZm9sZGVycy5zb3J0KChhLCBiKSA9PiBhLnBhdGgubG9jYWxlQ29tcGFyZShiLnBhdGgsIFwiemgtQ05cIikpO1xuICB9XG5cbiAgYXN5bmMgc2V0TG9jYWxSb290UGF0aChwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGF0aChwYXRoLnRyaW0oKSkucmVwbGFjZSgvXFwvJC8sIFwiXCIpO1xuXG4gICAgaWYgKCFub3JtYWxpemVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJMb2NhbCBSb290IFBhdGggXHU0RTBEXHU4MEZEXHU0RTNBXHU3QTdBXHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IGZvbGRlciA9IHRoaXMuZ2V0RXhpc3RpbmdGb2xkZXIobm9ybWFsaXplZCk7XG4gICAgaWYgKCFmb2xkZXIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1OEJFNVx1NzZFRVx1NUY1NVx1NEUwRFx1NUI1OFx1NTcyOFx1RkYwQ1x1OEJGN1x1NEVDRSBWYXVsdCBcdTRFMkRcdTkwMDlcdTYyRTlcdTVERjJcdTY3MDlcdTc2RUVcdTVGNTVcdTMwMDJcIik7XG4gICAgfVxuXG4gICAgdGhpcy5zZXR0aW5ncy5sb2NhbFJvb3RQYXRoID0gZm9sZGVyLnBhdGg7XG4gICAgYXdhaXQgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgfVxuXG4gIGdldEN1cnJlbnRGaWxlKCk6IFRGaWxlIHwgbnVsbCB7XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgcmV0dXJuIGZpbGUgaW5zdGFuY2VvZiBURmlsZSAmJiBmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiID8gZmlsZSA6IG51bGw7XG4gIH1cblxuICBpc0luc2lkZVJvb3QoZmlsZTogVEZpbGUpOiBib29sZWFuIHtcbiAgICBjb25zdCByb290ID0gbm9ybWFsaXplUGF0aCh0aGlzLnNldHRpbmdzLmxvY2FsUm9vdFBhdGgpLnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcbiAgICByZXR1cm4gZmlsZS5wYXRoID09PSByb290IHx8IGZpbGUucGF0aC5zdGFydHNXaXRoKGAke3Jvb3R9L2ApO1xuICB9XG5cbiAgcmVsYXRpdmVQYXRoKGZpbGU6IFRGaWxlKTogc3RyaW5nIHtcbiAgICBjb25zdCByb290ID0gbm9ybWFsaXplUGF0aCh0aGlzLnNldHRpbmdzLmxvY2FsUm9vdFBhdGgpLnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcbiAgICBjb25zdCBmdWxsUGF0aCA9IG5vcm1hbGl6ZVBhdGgoZmlsZS5wYXRoKTtcblxuICAgIGlmIChmdWxsUGF0aCA9PT0gcm9vdCkge1xuICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfVxuXG4gICAgaWYgKGZ1bGxQYXRoLnN0YXJ0c1dpdGgoYCR7cm9vdH0vYCkpIHtcbiAgICAgIHJldHVybiBmdWxsUGF0aC5zbGljZShyb290Lmxlbmd0aCArIDEpO1xuICAgIH1cblxuICAgIHJldHVybiBmdWxsUGF0aDtcbiAgfVxuXG4gIHJlbW90ZVBhdGgoZmlsZTogVEZpbGUpOiBzdHJpbmcge1xuICAgIGNvbnN0IHJlbGF0aXZlID0gbm9ybWFsaXplUGF0aCh0aGlzLnJlbGF0aXZlUGF0aChmaWxlKSkucmVwbGFjZSgvXlxcLysvLCBcIlwiKTtcbiAgICBjb25zdCBwYXRoID0gbm9ybWFsaXplUGF0aChgJHtSRU1PVEVfQ09OVEVOVF9ST09UfS8ke3JlbGF0aXZlfWApLnJlcGxhY2UoL15cXC8rLywgXCJcIik7XG5cbiAgICBpZiAoIXJlbGF0aXZlIHx8ICFpc1NhZmVDb250ZW50UGF0aChwYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4RkRDXHU3QUVGXHU4REVGXHU1Rjg0XHU1RkM1XHU5ODdCXHU0RjREXHU0RThFXHU0RUQzXHU1RTkzIGNvbnRlbnQgXHU3NkVFXHU1RjU1XHU1MTg1XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIHJldHVybiBwYXRoO1xuICB9XG5cbiAgZ2V0U3RhdGUoZmlsZTogVEZpbGUpOiBMb2NhbEZpbGVTdGF0ZSB7XG4gICAgcmV0dXJuIHRoaXMuZGF0YS5maWxlc1tmaWxlLnBhdGhdID8/IHsgc3RhdHVzOiBcImRyYWZ0XCIgfTtcbiAgfVxuXG4gIGFzeW5jIGNhY2hlRWZmZWN0aXZlU3RhdGUoZmlsZTogVEZpbGUsIHN0YXRlOiBMb2NhbEZpbGVTdGF0ZSkge1xuICAgIGNvbnN0IGN1cnJlbnQgPSB0aGlzLmRhdGEuZmlsZXNbZmlsZS5wYXRoXTtcblxuICAgIGlmIChcbiAgICAgIGN1cnJlbnQ/LnJlbW90ZVBhdGggPT09IHN0YXRlLnJlbW90ZVBhdGggJiZcbiAgICAgIGN1cnJlbnQ/LnNoYSA9PT0gc3RhdGUuc2hhICYmXG4gICAgICBjdXJyZW50Py5zdGF0dXMgPT09IHN0YXRlLnN0YXR1cyAmJlxuICAgICAgY3VycmVudD8ubGFzdFN5bmNlZEF0ID09PSBzdGF0ZS5sYXN0U3luY2VkQXQgJiZcbiAgICAgIGN1cnJlbnQ/Lmxhc3RTeW5jZWRIYXNoID09PSBzdGF0ZS5sYXN0U3luY2VkSGFzaCAmJlxuICAgICAgY3VycmVudD8uaHRtbFVybCA9PT0gc3RhdGUuaHRtbFVybFxuICAgICkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuZGF0YS5maWxlc1tmaWxlLnBhdGhdID0gc3RhdGU7XG4gICAgYXdhaXQgdGhpcy5zYXZlQWxsRGF0YSgpO1xuICB9XG5cbiAgYXN5bmMgZ2V0RWZmZWN0aXZlU3RhdGUoZmlsZTogVEZpbGUpOiBQcm9taXNlPExvY2FsRmlsZVN0YXRlPiB7XG4gICAgbGV0IHN0YXRlID0gdGhpcy5nZXRTdGF0ZShmaWxlKTtcblxuICAgIHRyeSB7XG4gICAgICBzdGF0ZSA9IGF3YWl0IHRoaXMuc3luY0ZpbGVTdGF0ZShmaWxlKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIEtlZXAgdGhlIGxhc3QgbG9jYWwgc3RhdGUgd2hlbiBHaXRIdWIgaXMgdGVtcG9yYXJpbHkgdW5hdmFpbGFibGUuXG4gICAgfVxuXG4gICAgaWYgKHN0YXRlLnN0YXR1cyAhPT0gXCJzeW5jZWRcIiB8fCAhc3RhdGUubGFzdFN5bmNlZEhhc2gpIHtcbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICBjb25zdCBjdXJyZW50SGFzaCA9IGhhc2hDb250ZW50KGNvbnRlbnQpO1xuXG4gICAgaWYgKGN1cnJlbnRIYXNoICE9PSBzdGF0ZS5sYXN0U3luY2VkSGFzaCkge1xuICAgICAgY29uc3QgbmV4dFN0YXRlID0geyAuLi5zdGF0ZSwgc3RhdHVzOiBcIm1vZGlmaWVkXCIgYXMgY29uc3QgfTtcbiAgICAgIGF3YWl0IHRoaXMuY2FjaGVFZmZlY3RpdmVTdGF0ZShmaWxlLCBuZXh0U3RhdGUpO1xuICAgICAgcmV0dXJuIG5leHRTdGF0ZTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLmNhY2hlRWZmZWN0aXZlU3RhdGUoZmlsZSwgc3RhdGUpO1xuICAgIHJldHVybiBzdGF0ZTtcbiAgfVxuXG4gIGFzeW5jIHNldFN0YXRlKGZpbGU6IFRGaWxlLCBwYXRjaDogUGFydGlhbDxMb2NhbEZpbGVTdGF0ZT4pIHtcbiAgICB0aGlzLmRhdGEuZmlsZXNbZmlsZS5wYXRoXSA9IHsgLi4udGhpcy5nZXRTdGF0ZShmaWxlKSwgLi4ucGF0Y2ggfTtcbiAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoU3RhdHVzQmFyKCk7XG4gIH1cblxuICBzZXRTdGF0dXNCYXJTdGF0ZShzdGF0dXNDbGFzczogc3RyaW5nIHwgbnVsbCkge1xuICAgIHRoaXMuc3RhdHVzQmFyRWwucmVtb3ZlQ2xhc3MoXCJpcy1kcmFmdFwiLCBcImlzLXN5bmNlZFwiLCBcImlzLW1vZGlmaWVkXCIsIFwiaXMtZGVsZXRlZFwiLCBcImlzLWZhaWxlZFwiLCBcImlzLWluYWN0aXZlXCIpO1xuXG4gICAgaWYgKHN0YXR1c0NsYXNzKSB7XG4gICAgICB0aGlzLnN0YXR1c0JhckVsLmFkZENsYXNzKHN0YXR1c0NsYXNzKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyByZWZyZXNoU3RhdHVzQmFyKCkge1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmdldEN1cnJlbnRGaWxlKCk7XG5cbiAgICBpZiAoIWZpbGUpIHtcbiAgICAgIHRoaXMuc2V0U3RhdHVzQmFyU3RhdGUoXCJpcy1pbmFjdGl2ZVwiKTtcbiAgICAgIHNldEljb24odGhpcy5zdGF0dXNCYXJJY29uRWwsIFwiZ2l0LWJyYW5jaFwiKTtcbiAgICAgIHRoaXMuc3RhdHVzQmFyVGV4dEVsLnNldFRleHQoXCJcdTY1RTBcdTZEM0JcdTUyQThcdTY1ODdcdTdBRTBcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLmlzSW5zaWRlUm9vdChmaWxlKSkge1xuICAgICAgdGhpcy5zZXRTdGF0dXNCYXJTdGF0ZShcImlzLWluYWN0aXZlXCIpO1xuICAgICAgc2V0SWNvbih0aGlzLnN0YXR1c0Jhckljb25FbCwgXCJnaXQtYnJhbmNoXCIpO1xuICAgICAgdGhpcy5zdGF0dXNCYXJUZXh0RWwuc2V0VGV4dChcIlx1NEUwRFx1NTcyOFx1NTQwQ1x1NkI2NVx1NzZFRVx1NUY1NVwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzdGF0ZSA9IGF3YWl0IHRoaXMuZ2V0RWZmZWN0aXZlU3RhdGUoZmlsZSk7XG4gICAgY29uc3QgbGFiZWwgPSB0b1N0YXR1c0xhYmVsKHN0YXRlLnN0YXR1cyk7XG4gICAgdGhpcy5zZXRTdGF0dXNCYXJTdGF0ZSh0b1N0YXR1c0NsYXNzKHN0YXRlLnN0YXR1cykpO1xuXG4gICAgc2V0SWNvbih0aGlzLnN0YXR1c0Jhckljb25FbCwgdG9TdGF0dXNJY29uKHN0YXRlLnN0YXR1cykpO1xuICAgIHRoaXMuc3RhdHVzQmFyVGV4dEVsLnNldFRleHQobGFiZWwpO1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlVGVtcGxhdGVGcm9udG1hdHRlcihmaWxlOiBURmlsZSkge1xuICAgIGlmICghdGhpcy5pc0luc2lkZVJvb3QoZmlsZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1NUY1M1x1NTI0RFx1NjU4N1x1N0FFMFx1NEUwRFx1NTcyOCBMb2NhbCBSb290IFBhdGggXHU1MTg1XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlRnJvbnRtYXR0ZXIoY29udGVudCk7XG5cbiAgICBpZiAoT2JqZWN0LmtleXMocGFyc2VkLmRhdGEpLmxlbmd0aCA+IDApIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJcdTVGNTNcdTUyNERcdTY1ODdcdTdBRTBcdTVERjJcdTdFQ0ZcdTVCNThcdTU3MjhcdTY1ODdcdTdBRTBcdTVDNUVcdTYwMjdcdTMwMDJcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgbmV4dENvbnRlbnQgPSBgJHtidWlsZEZyb250bWF0dGVyKGZpbGUpfSR7Y29udGVudH1gO1xuICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBuZXh0Q29udGVudCk7XG4gICAgbmV3IE5vdGljZShcIlx1NjU4N1x1N0FFMFx1NUM1RVx1NjAyN1x1NURGMlx1NjNEMlx1NTE2NVx1MzAwMlwiKTtcbiAgfVxuXG4gIGdldFN5bmNNZW51VGl0bGUoc3RhdGU6IExvY2FsRmlsZVN0YXRlKTogc3RyaW5nIHtcbiAgICBzd2l0Y2ggKHN0YXRlLnN0YXR1cykge1xuICAgICAgY2FzZSBcIm1vZGlmaWVkXCI6XG4gICAgICBjYXNlIFwiZGVsZXRlZFwiOlxuICAgICAgICByZXR1cm4gXCJcdTkxQ0RcdTY1QjBcdTU0MENcdTZCNjVcIjtcbiAgICAgIGNhc2UgXCJmYWlsZWRcIjpcbiAgICAgICAgcmV0dXJuIFwiXHU1MThEXHU2QjIxXHU1NDBDXHU2QjY1XCI7XG4gICAgICBjYXNlIFwic3luY2VkXCI6XG4gICAgICAgIHJldHVybiBcIlx1NURGMlx1NTQwQ1x1NkI2NVwiO1xuICAgICAgY2FzZSBcImRyYWZ0XCI6XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gXCJcdTU0MENcdTZCNjVcdTUyMzAgR2l0SHViXCI7XG4gICAgfVxuICB9XG5cbiAgYnVpbGRBY3Rpb25Db250ZXh0KGZpbGU6IFRGaWxlLCBzdGF0ZTogTG9jYWxGaWxlU3RhdGUsIGhhc1Byb3BlcnRpZXM6IGJvb2xlYW4pOiBBcnRpY2xlQWN0aW9uQ29udGV4dCB7XG4gICAgY29uc3QgaW5Sb290ID0gdGhpcy5pc0luc2lkZVJvb3QoZmlsZSk7XG4gICAgY29uc3Qgc3luY1RpdGxlID0gdGhpcy5nZXRTeW5jTWVudVRpdGxlKHN0YXRlKTtcblxuICAgIHJldHVybiB7XG4gICAgICBmaWxlLFxuICAgICAgaW5Sb290LFxuICAgICAgaGFzUHJvcGVydGllcyxcbiAgICAgIHN0YXRlLFxuICAgICAgc3luY1RpdGxlLFxuICAgICAgY2FuU3luYzogaW5Sb290ICYmIHN0YXRlLnN0YXR1cyAhPT0gXCJzeW5jZWRcIixcbiAgICAgIGNhbkRlbGV0ZVJlbW90ZTogQm9vbGVhbihzdGF0ZS5zaGEpICYmIHN0YXRlLnN0YXR1cyAhPT0gXCJkZWxldGVkXCIsXG4gICAgICBjYW5PcGVuUmVtb3RlOiBCb29sZWFuKHN0YXRlLmh0bWxVcmwgfHwgc3RhdGUucmVtb3RlUGF0aCkgJiYgc3RhdGUuc3RhdHVzICE9PSBcImRlbGV0ZWRcIixcbiAgICAgIGNhbkluc2VydFByb3BlcnRpZXM6IGluUm9vdCAmJiAhaGFzUHJvcGVydGllc1xuICAgIH07XG4gIH1cblxuICBhc3luYyBnZXRBY3Rpb25Db250ZXh0KGZpbGU6IFRGaWxlKTogUHJvbWlzZTxBcnRpY2xlQWN0aW9uQ29udGV4dD4ge1xuICAgIGNvbnN0IFtzdGF0ZSwgY29udGVudF0gPSBhd2FpdCBQcm9taXNlLmFsbChbdGhpcy5nZXRFZmZlY3RpdmVTdGF0ZShmaWxlKSwgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKV0pO1xuICAgIGNvbnN0IHByb3BlcnRpZXMgPSBwYXJzZUZyb250bWF0dGVyKGNvbnRlbnQpLmRhdGE7XG4gICAgcmV0dXJuIHRoaXMuYnVpbGRBY3Rpb25Db250ZXh0KGZpbGUsIHN0YXRlLCBPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKS5sZW5ndGggPiAwKTtcbiAgfVxuXG4gIGdldENhY2hlZEFjdGlvbkNvbnRleHQoZmlsZTogVEZpbGUpOiBBcnRpY2xlQWN0aW9uQ29udGV4dCB7XG4gICAgY29uc3QgcHJvcGVydGllcyA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpPy5mcm9udG1hdHRlciA/PyB7fTtcbiAgICBjb25zdCBzdGF0ZSA9IHRoaXMuZ2V0U3RhdGUoZmlsZSk7XG4gICAgcmV0dXJuIHRoaXMuYnVpbGRBY3Rpb25Db250ZXh0KGZpbGUsIHN0YXRlLCBPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKS5sZW5ndGggPiAwKTtcbiAgfVxuXG4gIGFzeW5jIHNob3dSaWJib25NZW51KGV2dDogTW91c2VFdmVudCkge1xuICAgIGNvbnN0IG1lbnUgPSBuZXcgTWVudSgpO1xuICAgIGNvbnN0IGN1cnJlbnRGaWxlID0gdGhpcy5nZXRDdXJyZW50RmlsZSgpO1xuICAgIGNvbnN0IGNvbnRleHQgPSBjdXJyZW50RmlsZSA/IGF3YWl0IHRoaXMuZ2V0QWN0aW9uQ29udGV4dChjdXJyZW50RmlsZSkgOiBudWxsO1xuXG4gICAgbWVudS5zZXRVc2VOYXRpdmVNZW51KHRydWUpO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKGNvbnRleHQ/LnN5bmNUaXRsZSA/PyBcIlx1NTQwQ1x1NkI2NVx1NTIzMCBHaXRIdWJcIilcbiAgICAgICAgLnNldEljb24oXCJjbG91ZC11cGxvYWRcIilcbiAgICAgICAgLnNldERpc2FibGVkKCFjb250ZXh0Py5jYW5TeW5jKVxuICAgICAgICAub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgaWYgKGNvbnRleHQpIHtcbiAgICAgICAgICAgIHZvaWQgdGhpcy5ydW5XaXRoTm90aWNlKCgpID0+IHRoaXMuc3luY0ZpbGVUb0dpdEh1Yihjb250ZXh0LmZpbGUpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIlx1NjI1M1x1NUYwMCBHaXRIdWJcIilcbiAgICAgICAgLnNldEljb24oXCJleHRlcm5hbC1saW5rXCIpXG4gICAgICAgIC5zZXREaXNhYmxlZCghY29udGV4dD8uY2FuT3BlblJlbW90ZSlcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xuICAgICAgICAgIGlmIChjb250ZXh0KSB7XG4gICAgICAgICAgICB2b2lkIHRoaXMucnVuV2l0aE5vdGljZSgoKSA9PiB0aGlzLm9wZW5SZW1vdGVVcmxGb3JGaWxlKGNvbnRleHQuZmlsZSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICApO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiXHU4QkU2XHU2MEM1XCIpXG4gICAgICAgIC5zZXRJY29uKFwiZ2l0LWJyYW5jaFwiKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMub3BlbkFjdGlvbk1vZGFsKGNvbnRleHQ/LmZpbGUpKVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJcdTYzRDJcdTUxNjVcdTY1ODdcdTdBRTBcdTVDNUVcdTYwMjdcIilcbiAgICAgICAgLnNldEljb24oXCJmaWxlLXBsdXMtMlwiKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQ/LmNhbkluc2VydFByb3BlcnRpZXMpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICBpZiAoY29udGV4dCkge1xuICAgICAgICAgICAgdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoKCkgPT4gdGhpcy5lbnN1cmVUZW1wbGF0ZUZyb250bWF0dGVyKGNvbnRleHQuZmlsZSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICApO1xuICAgIG1lbnUuYWRkU2VwYXJhdG9yKCk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoY29udGV4dD8uc3RhdGUuc3RhdHVzID09PSBcImRlbGV0ZWRcIiA/IFwiXHU4RkRDXHU3QUVGXHU1REYyXHU1MjIwXHU5NjY0XCIgOiBcIlx1NTIyMFx1OTY2NFx1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlwiKVxuICAgICAgICAuc2V0SWNvbihcImNsb3VkLW9mZlwiKVxuICAgICAgICAuc2V0V2FybmluZyh0cnVlKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQ/LmNhbkRlbGV0ZVJlbW90ZSlcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xuICAgICAgICAgIGlmIChjb250ZXh0KSB7XG4gICAgICAgICAgICB2b2lkIHRoaXMucnVuV2l0aE5vdGljZSgoKSA9PiB0aGlzLmRlbGV0ZVJlbW90ZUZpbGUoY29udGV4dC5maWxlKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICk7XG4gICAgbWVudS5hZGRTZXBhcmF0b3IoKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShcIlx1NkQ0Qlx1OEJENSBHaXRIdWIgXHU4RkRFXHU2M0E1XCIpXG4gICAgICAgIC5zZXRJY29uKFwiZ2xvYmVcIilcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoKCkgPT4gdGhpcy50ZXN0Q29ubmVjdGlvbigpKSlcbiAgICApO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiXHU4QkJFXHU3RjZFXCIpXG4gICAgICAgIC5zZXRJY29uKFwic2V0dGluZ3NcIilcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdGhpcy5vcGVuUGx1Z2luU2V0dGluZ3MoKSlcbiAgICApO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKGBcdTcyNDhcdTY3MkMgdiR7dGhpcy5tYW5pZmVzdC52ZXJzaW9ufWApXG4gICAgICAgIC5zZXRJY29uKFwiaW5mb1wiKVxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLm9wZW5WZXJzaW9uSW5mbygpKVxuICAgICk7XG4gICAgbWVudS5zaG93QXRNb3VzZUV2ZW50KGV2dCk7XG4gIH1cblxuICBhZGRBcnRpY2xlQ29udGV4dE1lbnVJdGVtcyhtZW51OiBNZW51LCBmaWxlOiBURmlsZSkge1xuICAgIGNvbnN0IGNvbnRleHQgPSB0aGlzLmdldENhY2hlZEFjdGlvbkNvbnRleHQoZmlsZSk7XG5cbiAgICBtZW51LmFkZFNlcGFyYXRvcigpO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKGNvbnRleHQuc3luY1RpdGxlKVxuICAgICAgICAuc2V0SWNvbihcImNsb3VkLXVwbG9hZFwiKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQuY2FuU3luYylcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoKCkgPT4gdGhpcy5zeW5jRmlsZVRvR2l0SHViKGNvbnRleHQuZmlsZSkpKVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJcdTYyNTNcdTVGMDAgR2l0SHViXCIpXG4gICAgICAgIC5zZXRJY29uKFwiZXh0ZXJuYWwtbGlua1wiKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQuY2FuT3BlblJlbW90ZSlcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoKCkgPT4gdGhpcy5vcGVuUmVtb3RlVXJsRm9yRmlsZShjb250ZXh0LmZpbGUpKSlcbiAgICApO1xuICAgIG1lbnUuYWRkSXRlbSgoaXRlbSkgPT5cbiAgICAgIGl0ZW1cbiAgICAgICAgLnNldFRpdGxlKFwiXHU4QkU2XHU2MEM1XCIpXG4gICAgICAgIC5zZXRJY29uKFwiZ2l0LWJyYW5jaFwiKVxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLm9wZW5BY3Rpb25Nb2RhbChjb250ZXh0LmZpbGUpKVxuICAgICk7XG4gICAgbWVudS5hZGRJdGVtKChpdGVtKSA9PlxuICAgICAgaXRlbVxuICAgICAgICAuc2V0VGl0bGUoXCJcdTYzRDJcdTUxNjVcdTY1ODdcdTdBRTBcdTVDNUVcdTYwMjdcIilcbiAgICAgICAgLnNldEljb24oXCJmaWxlLXBsdXMtMlwiKVxuICAgICAgICAuc2V0RGlzYWJsZWQoIWNvbnRleHQuY2FuSW5zZXJ0UHJvcGVydGllcylcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoKCkgPT4gdGhpcy5lbnN1cmVUZW1wbGF0ZUZyb250bWF0dGVyKGNvbnRleHQuZmlsZSkpKVxuICAgICk7XG4gICAgbWVudS5hZGRTZXBhcmF0b3IoKTtcbiAgICBtZW51LmFkZEl0ZW0oKGl0ZW0pID0+XG4gICAgICBpdGVtXG4gICAgICAgIC5zZXRUaXRsZShjb250ZXh0LnN0YXRlLnN0YXR1cyA9PT0gXCJkZWxldGVkXCIgPyBcIlx1OEZEQ1x1N0FFRlx1NURGMlx1NTIyMFx1OTY2NFwiIDogXCJcdTUyMjBcdTk2NjRcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcIilcbiAgICAgICAgLnNldEljb24oXCJjbG91ZC1vZmZcIilcbiAgICAgICAgLnNldFdhcm5pbmcodHJ1ZSlcbiAgICAgICAgLnNldERpc2FibGVkKCFjb250ZXh0LmNhbkRlbGV0ZVJlbW90ZSlcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdm9pZCB0aGlzLnJ1bldpdGhOb3RpY2UoKCkgPT4gdGhpcy5kZWxldGVSZW1vdGVGaWxlKGNvbnRleHQuZmlsZSkpKVxuICAgICk7XG4gIH1cblxuICBvcGVuQWN0aW9uTW9kYWwoZmlsZT86IFRGaWxlIHwgbnVsbCkge1xuICAgIG5ldyBHaXRTeW5jZXJBY3Rpb25Nb2RhbCh0aGlzLmFwcCwgdGhpcywgZmlsZSA/PyB0aGlzLmdldEN1cnJlbnRGaWxlKCkpLm9wZW4oKTtcbiAgfVxuXG4gIG9wZW5QbHVnaW5TZXR0aW5ncygpIHtcbiAgICBjb25zdCBpbnRlcm5hbEFwcCA9IHRoaXMuYXBwIGFzIEFwcCAmIHtcbiAgICAgIHNldHRpbmc/OiB7XG4gICAgICAgIG9wZW46ICgpID0+IHZvaWQ7XG4gICAgICAgIG9wZW5UYWJCeUlkPzogKGlkOiBzdHJpbmcpID0+IHZvaWQ7XG4gICAgICB9O1xuICAgIH07XG5cbiAgICBpZiAoIWludGVybmFsQXBwLnNldHRpbmcpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJcdTVGNTNcdTUyNERcdTczQUZcdTU4ODNcdTRFMERcdTY1MkZcdTYzMDFcdTc2RjRcdTYzQTVcdThERjNcdThGNkNcdTYzRDJcdTRFRjZcdThCQkVcdTdGNkVcdTMwMDJcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaW50ZXJuYWxBcHAuc2V0dGluZy5vcGVuKCk7XG4gICAgaW50ZXJuYWxBcHAuc2V0dGluZy5vcGVuVGFiQnlJZD8uKHRoaXMubWFuaWZlc3QuaWQpO1xuICB9XG5cbiAgb3BlblZlcnNpb25JbmZvKCkge1xuICAgIG5ldyBQbHVnaW5WZXJzaW9uTW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcbiAgfVxuXG4gIGFzeW5jIHJ1bldpdGhOb3RpY2UoYWN0aW9uOiAoKSA9PiBQcm9taXNlPHZvaWQ+KSB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGFjdGlvbigpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIlx1NjcyQVx1NzdFNVx1OTUxOVx1OEJFRlwiO1xuICAgICAgbmV3IE5vdGljZShtZXNzYWdlKTtcbiAgICB9XG4gIH1cblxuICBidWlsZEdpdEh1YkFwaVVybChwYXRoOiBzdHJpbmcsIHBhcmFtcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4pOiBzdHJpbmcge1xuICAgIGNvbnN0IHVybCA9IG5ldyBVUkwoYGh0dHBzOi8vYXBpLmdpdGh1Yi5jb20ke3BhdGh9YCk7XG5cbiAgICBPYmplY3QuZW50cmllcyhwYXJhbXMgPz8ge30pLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgIHVybC5zZWFyY2hQYXJhbXMuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHVybC50b1N0cmluZygpO1xuICB9XG5cbiAgYnVpbGRDb250ZW50QXBpUGF0aChyZW1vdGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLmdldFJlcG9zaXRvcnkoKTtcbiAgICByZXR1cm4gYC9yZXBvcy8ke2VuY29kZVVSSUNvbXBvbmVudChyZXBvc2l0b3J5Lm93bmVyKX0vJHtlbmNvZGVVUklDb21wb25lbnQocmVwb3NpdG9yeS5yZXBvKX0vY29udGVudHMvJHtlbmNvZGVHaXRIdWJQYXRoKHJlbW90ZVBhdGgpfWA7XG4gIH1cblxuICBidWlsZFJlcG9BcGlQYXRoKCk6IHN0cmluZyB7XG4gICAgY29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuZ2V0UmVwb3NpdG9yeSgpO1xuICAgIHJldHVybiBgL3JlcG9zLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlcG9zaXRvcnkub3duZXIpfS8ke2VuY29kZVVSSUNvbXBvbmVudChyZXBvc2l0b3J5LnJlcG8pfWA7XG4gIH1cblxuICBidWlsZEJyYW5jaEFwaVBhdGgoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYCR7dGhpcy5idWlsZFJlcG9BcGlQYXRoKCl9L2JyYW5jaGVzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKSl9YDtcbiAgfVxuXG4gIGJ1aWxkR2l0SHViQmxvYlVybChyZW1vdGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLmdldFJlcG9zaXRvcnkoKTtcbiAgICByZXR1cm4gYGh0dHBzOi8vZ2l0aHViLmNvbS8ke3JlcG9zaXRvcnkub3duZXJ9LyR7cmVwb3NpdG9yeS5yZXBvfS9ibG9iLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKSl9LyR7ZW5jb2RlR2l0SHViUGF0aChyZW1vdGVQYXRoKX1gO1xuICB9XG5cbiAgYXN5bmMgZ2l0aHViUmVxdWVzdDxUUmVzcG9uc2U+KFxuICAgIG1ldGhvZDogXCJHRVRcIiB8IFwiUFVUXCIgfCBcIkRFTEVURVwiLFxuICAgIHBhdGg6IHN0cmluZyxcbiAgICBwYXlsb2FkPzogdW5rbm93bixcbiAgICBwYXJhbXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+XG4gICk6IFByb21pc2U8VFJlc3BvbnNlPiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogdGhpcy5idWlsZEdpdEh1YkFwaVVybChwYXRoLCBwYXJhbXMpLFxuICAgICAgbWV0aG9kLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBBY2NlcHQ6IFwiYXBwbGljYXRpb24vdm5kLmdpdGh1Yitqc29uXCIsXG4gICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHt0aGlzLnNldHRpbmdzLmdpdGh1YlRva2VuLnRyaW0oKX1gLFxuICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgICAgXCJYLUdpdEh1Yi1BcGktVmVyc2lvblwiOiBcIjIwMjItMTEtMjhcIlxuICAgICAgfSxcbiAgICAgIGJvZHk6IHBheWxvYWQgPyBKU09OLnN0cmluZ2lmeShwYXlsb2FkKSA6IHVuZGVmaW5lZFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA+PSA0MDApIHtcbiAgICAgIGxldCBlcnJvck1lc3NhZ2UgPSByZXNwb25zZS50ZXh0O1xuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJlc3BvbnNlLnRleHQpIGFzIEdpdEh1YkVycm9yUGF5bG9hZDtcbiAgICAgICAgaWYgKHBhcnNlZC5tZXNzYWdlKSB7XG4gICAgICAgICAgZXJyb3JNZXNzYWdlID0gcGFyc2VkLm1lc3NhZ2U7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBLZWVwIHJhdyByZXNwb25zZSB0ZXh0IHdoZW4gaXQgaXMgbm90IEpTT04uXG4gICAgICB9XG5cbiAgICAgIHRocm93IG5ldyBHaXRIdWJSZXF1ZXN0RXJyb3IocmVzcG9uc2Uuc3RhdHVzLCBlcnJvck1lc3NhZ2UgfHwgYEdpdEh1YiBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIH1cblxuICAgIHJldHVybiByZXNwb25zZS5qc29uIGFzIFRSZXNwb25zZTtcbiAgfVxuXG4gIGFzeW5jIGdldFJlbW90ZUNvbnRlbnQocmVtb3RlUGF0aDogc3RyaW5nKTogUHJvbWlzZTxHaXRIdWJDb250ZW50UmVzcG9uc2UgfCBudWxsPiB7XG4gICAgaWYgKCFpc1NhZmVDb250ZW50UGF0aChyZW1vdGVQYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiXHU4RkRDXHU3QUVGXHU4REVGXHU1Rjg0XHU1RkM1XHU5ODdCXHU0RjREXHU0RThFXHU0RUQzXHU1RTkzIGNvbnRlbnQgXHU3NkVFXHU1RjU1XHU1MTg1XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YlJlcXVlc3Q8R2l0SHViQ29udGVudFJlc3BvbnNlIHwgR2l0SHViQ29udGVudFJlc3BvbnNlW10+KFxuICAgICAgICBcIkdFVFwiLFxuICAgICAgICB0aGlzLmJ1aWxkQ29udGVudEFwaVBhdGgocmVtb3RlUGF0aCksXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgeyByZWY6IHRoaXMuc2V0dGluZ3MuYnJhbmNoLnRyaW0oKSB9XG4gICAgICApO1xuXG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShyZXN1bHQpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1OEZEQ1x1N0FFRlx1OERFRlx1NUY4NFx1NjMwN1x1NTQxMVx1NzZFRVx1NUY1NVx1RkYwQ1x1NEUwRFx1ODBGRFx1NEY1Q1x1NEUzQVx1NjU4N1x1N0FFMFx1NTQwQ1x1NkI2NVx1NzZFRVx1NjgwN1x1MzAwMlwiKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlc3VsdC50eXBlICE9PSBcImZpbGVcIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdThGRENcdTdBRUZcdThERUZcdTVGODRcdTRFMERcdTY2MkZcdTY2NkVcdTkwMUFcdTY1ODdcdTRFRjZcdUZGMENcdTRFMERcdTgwRkRcdTRGNUNcdTRFM0FcdTY1ODdcdTdBRTBcdTU0MENcdTZCNjVcdTc2RUVcdTY4MDdcdTMwMDJcIik7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEdpdEh1YlJlcXVlc3RFcnJvciAmJiBlcnJvci5zdGF0dXMgPT09IDQwNCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc3luY0ZpbGVTdGF0ZShmaWxlOiBURmlsZSk6IFByb21pc2U8TG9jYWxGaWxlU3RhdGU+IHtcbiAgICBpZiAoIXRoaXMuaXNJbnNpZGVSb290KGZpbGUpKSB7XG4gICAgICByZXR1cm4geyBzdGF0dXM6IFwiZHJhZnRcIiB9O1xuICAgIH1cblxuICAgIHRoaXMudmFsaWRhdGVDb25maWcoKTtcblxuICAgIGNvbnN0IHJlbW90ZVBhdGggPSB0aGlzLnJlbW90ZVBhdGgoZmlsZSk7XG4gICAgY29uc3QgY3VycmVudCA9IHRoaXMuZ2V0U3RhdGUoZmlsZSk7XG4gICAgY29uc3QgcmVtb3RlID0gYXdhaXQgdGhpcy5nZXRSZW1vdGVDb250ZW50KHJlbW90ZVBhdGgpO1xuXG4gICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgIGNvbnN0IG5leHRTdGF0ZTogTG9jYWxGaWxlU3RhdGUgPSBjdXJyZW50LnNoYVxuICAgICAgICA/IHtcbiAgICAgICAgICAgIC4uLmN1cnJlbnQsXG4gICAgICAgICAgICByZW1vdGVQYXRoLFxuICAgICAgICAgICAgc2hhOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBodG1sVXJsOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBzdGF0dXM6IFwiZGVsZXRlZFwiXG4gICAgICAgICAgfVxuICAgICAgICA6IHsgcmVtb3RlUGF0aCwgc3RhdHVzOiBcImRyYWZ0XCIgfTtcblxuICAgICAgdGhpcy5kYXRhLmZpbGVzW2ZpbGUucGF0aF0gPSBuZXh0U3RhdGU7XG4gICAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gICAgICByZXR1cm4gbmV4dFN0YXRlO1xuICAgIH1cblxuICAgIGNvbnN0IG5leHRTdGF0ZTogTG9jYWxGaWxlU3RhdGUgPSB7XG4gICAgICAuLi5jdXJyZW50LFxuICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIHNoYTogcmVtb3RlLnNoYSxcbiAgICAgIGh0bWxVcmw6IHJlbW90ZS5odG1sX3VybCA/PyB0aGlzLmJ1aWxkR2l0SHViQmxvYlVybChyZW1vdGVQYXRoKSxcbiAgICAgIHN0YXR1czogXCJzeW5jZWRcIlxuICAgIH07XG5cbiAgICBpZiAoY3VycmVudC5zaGEgIT09IHJlbW90ZS5zaGEpIHtcbiAgICAgIG5leHRTdGF0ZS5sYXN0U3luY2VkSGFzaCA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICB0aGlzLmRhdGEuZmlsZXNbZmlsZS5wYXRoXSA9IG5leHRTdGF0ZTtcbiAgICBhd2FpdCB0aGlzLnNhdmVBbGxEYXRhKCk7XG4gICAgcmV0dXJuIG5leHRTdGF0ZTtcbiAgfVxuXG4gIGFzeW5jIHRlc3RDb25uZWN0aW9uKCkge1xuICAgIHRoaXMudmFsaWRhdGVDb25maWcoKTtcbiAgICBjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5nZXRSZXBvc2l0b3J5KCk7XG4gICAgY29uc3QgdXNlciA9IGF3YWl0IHRoaXMuZ2l0aHViUmVxdWVzdDxHaXRIdWJVc2VyUmVzcG9uc2U+KFwiR0VUXCIsIFwiL3VzZXJcIik7XG5cbiAgICBhd2FpdCB0aGlzLmdpdGh1YlJlcXVlc3Q8dW5rbm93bj4oXCJHRVRcIiwgdGhpcy5idWlsZFJlcG9BcGlQYXRoKCkpO1xuICAgIGF3YWl0IHRoaXMuZ2l0aHViUmVxdWVzdDx1bmtub3duPihcIkdFVFwiLCB0aGlzLmJ1aWxkQnJhbmNoQXBpUGF0aCgpKTtcblxuICAgIGlmICh1c2VyLmxvZ2luLnRvTG93ZXJDYXNlKCkgIT09IHRoaXMuc2V0dGluZ3MuZ2l0aHViVXNlcm5hbWUudHJpbSgpLnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVG9rZW4gXHU3NTI4XHU2MjM3XHU0RTNBICR7dXNlci5sb2dpbn1cdUZGMENcdTRFMEVcdTkxNERcdTdGNkVcdTc2ODQgR2l0SHViIFVzZXJuYW1lIFx1NEUwRFx1NEUwMFx1ODFGNFx1MzAwMmApO1xuICAgIH1cblxuICAgIG5ldyBOb3RpY2UoYFx1OEZERVx1NjNBNVx1NjIxMFx1NTI5Rlx1RkYxQSR7cmVwb3NpdG9yeS5vd25lcn0vJHtyZXBvc2l0b3J5LnJlcG99QCR7dGhpcy5zZXR0aW5ncy5icmFuY2gudHJpbSgpfWApO1xuICB9XG5cbiAgYXN5bmMgc3luY0ZpbGVUb0dpdEh1YihmaWxlOiBURmlsZSkge1xuICAgIHRoaXMudmFsaWRhdGVDb25maWcoKTtcblxuICAgIGlmICghdGhpcy5pc0luc2lkZVJvb3QoZmlsZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlx1NUY1M1x1NTI0RFx1NjU4N1x1N0FFMFx1NEUwRFx1NTcyOCBMb2NhbCBSb290IFBhdGggXHU1MTg1XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgIGNvbnN0IGN1cnJlbnRIYXNoID0gaGFzaENvbnRlbnQoY29udGVudCk7XG4gICAgY29uc3QgcmVtb3RlUGF0aCA9IHRoaXMucmVtb3RlUGF0aChmaWxlKTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZW1vdGUgPSBhd2FpdCB0aGlzLmdldFJlbW90ZUNvbnRlbnQocmVtb3RlUGF0aCk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmdpdGh1YlJlcXVlc3Q8R2l0SHViUHV0UmVzcG9uc2U+KFwiUFVUXCIsIHRoaXMuYnVpbGRDb250ZW50QXBpUGF0aChyZW1vdGVQYXRoKSwge1xuICAgICAgICBtZXNzYWdlOiBgJHtyZW1vdGUgPyBcInN5bmM6IHVwZGF0ZVwiIDogXCJzeW5jOiBhZGRcIn0gJHtyZW1vdGVQYXRofWAsXG4gICAgICAgIGNvbnRlbnQ6IGVuY29kZUJhc2U2NChjb250ZW50KSxcbiAgICAgICAgYnJhbmNoOiB0aGlzLnNldHRpbmdzLmJyYW5jaC50cmltKCksXG4gICAgICAgIHNoYTogcmVtb3RlPy5zaGFcbiAgICAgIH0pO1xuICAgICAgY29uc3QgbmV4dFNoYSA9IHJlc3VsdC5jb250ZW50Py5zaGEgPz8gcmVtb3RlPy5zaGE7XG4gICAgICBjb25zdCBodG1sVXJsID0gcmVzdWx0LmNvbnRlbnQ/Lmh0bWxfdXJsID8/IHRoaXMuYnVpbGRHaXRIdWJCbG9iVXJsKHJlbW90ZVBhdGgpO1xuXG4gICAgICBhd2FpdCB0aGlzLnNldFN0YXRlKGZpbGUsIHtcbiAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgc2hhOiBuZXh0U2hhLFxuICAgICAgICBzdGF0dXM6IFwic3luY2VkXCIsXG4gICAgICAgIGxhc3RTeW5jZWRBdDogZm9ybWF0RGF0ZVRpbWUobmV3IERhdGUoKSksXG4gICAgICAgIGxhc3RTeW5jZWRIYXNoOiBjdXJyZW50SGFzaCxcbiAgICAgICAgaHRtbFVybFxuICAgICAgfSk7XG5cbiAgICAgIG5ldyBOb3RpY2UoYFx1NTQwQ1x1NkI2NVx1NjIxMFx1NTI5Rlx1RkYxQSR7cmVtb3RlUGF0aH1gKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgYXdhaXQgdGhpcy5zZXRTdGF0ZShmaWxlLCB7IHJlbW90ZVBhdGgsIHN0YXR1czogXCJmYWlsZWRcIiB9KTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHN5bmNDdXJyZW50Tm90ZSgpIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5nZXRDdXJyZW50RmlsZSgpO1xuXG4gICAgaWYgKCFmaWxlKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdTVGNTNcdTUyNERcdTZDQTFcdTY3MDlcdTZGQzBcdTZEM0JcdTc2ODQgTWFya2Rvd24gXHU2NTg3XHU0RUY2XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuc3luY0ZpbGVUb0dpdEh1YihmaWxlKTtcbiAgfVxuXG4gIGFzeW5jIGRlbGV0ZVJlbW90ZUZpbGUoZmlsZTogVEZpbGUpIHtcbiAgICB0aGlzLnZhbGlkYXRlQ29uZmlnKCk7XG5cbiAgICBpZiAoIXRoaXMuaXNJbnNpZGVSb290KGZpbGUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdTVGNTNcdTUyNERcdTY1ODdcdTdBRTBcdTRFMERcdTU3MjggTG9jYWwgUm9vdCBQYXRoIFx1NTE4NVx1MzAwMlwiKTtcbiAgICB9XG5cbiAgICBjb25zdCByZW1vdGVQYXRoID0gdGhpcy5yZW1vdGVQYXRoKGZpbGUpO1xuICAgIGNvbnN0IHJlbW90ZSA9IGF3YWl0IHRoaXMuZ2V0UmVtb3RlQ29udGVudChyZW1vdGVQYXRoKTtcblxuICAgIGlmICghcmVtb3RlKSB7XG4gICAgICBhd2FpdCB0aGlzLnNldFN0YXRlKGZpbGUsIHtcbiAgICAgICAgcmVtb3RlUGF0aCxcbiAgICAgICAgc2hhOiB1bmRlZmluZWQsXG4gICAgICAgIGh0bWxVcmw6IHVuZGVmaW5lZCxcbiAgICAgICAgc3RhdHVzOiBcImRlbGV0ZWRcIlxuICAgICAgfSk7XG4gICAgICBuZXcgTm90aWNlKFwiXHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHU0RTBEXHU1QjU4XHU1NzI4XHUzMDAyXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuZ2l0aHViUmVxdWVzdDxHaXRIdWJEZWxldGVSZXNwb25zZT4oXCJERUxFVEVcIiwgdGhpcy5idWlsZENvbnRlbnRBcGlQYXRoKHJlbW90ZVBhdGgpLCB7XG4gICAgICBtZXNzYWdlOiBgc3luYzogZGVsZXRlICR7cmVtb3RlUGF0aH1gLFxuICAgICAgc2hhOiByZW1vdGUuc2hhLFxuICAgICAgYnJhbmNoOiB0aGlzLnNldHRpbmdzLmJyYW5jaC50cmltKClcbiAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuc2V0U3RhdGUoZmlsZSwge1xuICAgICAgcmVtb3RlUGF0aCxcbiAgICAgIHNoYTogdW5kZWZpbmVkLFxuICAgICAgaHRtbFVybDogdW5kZWZpbmVkLFxuICAgICAgc3RhdHVzOiBcImRlbGV0ZWRcIlxuICAgIH0pO1xuICAgIG5ldyBOb3RpY2UoXCJcdThGRENcdTdBRUZcdTY1ODdcdTRFRjZcdTVERjJcdTUyMjBcdTk2NjRcdTMwMDJcIik7XG4gIH1cblxuICBhc3luYyBkZWxldGVDdXJyZW50UmVtb3RlTm90ZSgpIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5nZXRDdXJyZW50RmlsZSgpO1xuXG4gICAgaWYgKCFmaWxlKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJcdTVGNTNcdTUyNERcdTZDQTFcdTY3MDlcdTZGQzBcdTZEM0JcdTc2ODQgTWFya2Rvd24gXHU2NTg3XHU0RUY2XHUzMDAyXCIpO1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuZGVsZXRlUmVtb3RlRmlsZShmaWxlKTtcbiAgfVxuXG4gIGFzeW5jIG9wZW5SZW1vdGVVcmxGb3JGaWxlKGZpbGU6IFRGaWxlKSB7XG4gICAgY29uc3Qgc3RhdGUgPSBhd2FpdCB0aGlzLmdldEVmZmVjdGl2ZVN0YXRlKGZpbGUpO1xuICAgIGNvbnN0IHJlbW90ZVBhdGggPSBzdGF0ZS5yZW1vdGVQYXRoID8/IHRoaXMucmVtb3RlUGF0aChmaWxlKTtcblxuICAgIGlmIChzdGF0ZS5zdGF0dXMgPT09IFwiZGVsZXRlZFwiKSB7XG4gICAgICBuZXcgTm90aWNlKFwiXHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHU1REYyXHU3RUNGXHU1MjIwXHU5NjY0XHUzMDAyXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHdpbmRvdy5vcGVuKHN0YXRlLmh0bWxVcmwgPz8gdGhpcy5idWlsZEdpdEh1YkJsb2JVcmwocmVtb3RlUGF0aCksIFwiX2JsYW5rXCIpO1xuICB9XG5cbiAgYXN5bmMgb3BlblJlbW90ZVVybCgpIHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5nZXRDdXJyZW50RmlsZSgpO1xuICAgIGlmICghZmlsZSkge1xuICAgICAgbmV3IE5vdGljZShcIlx1NUY1M1x1NTI0RFx1NkNBMVx1NjcwOVx1NkZDMFx1NkQzQlx1NjU4N1x1NEVGNlx1MzAwMlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLm9wZW5SZW1vdGVVcmxGb3JGaWxlKGZpbGUpO1xuICB9XG59XG5cbmNsYXNzIEdpdFN5bmNlckFjdGlvbk1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luO1xuICB0YXJnZXRGaWxlOiBURmlsZSB8IG51bGw7XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW4sIHRhcmdldEZpbGU/OiBURmlsZSB8IG51bGwpIHtcbiAgICBzdXBlcihhcHApO1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICAgIHRoaXMudGFyZ2V0RmlsZSA9IHRhcmdldEZpbGUgPz8gbnVsbDtcbiAgfVxuXG4gIG9uT3BlbigpIHtcbiAgICB2b2lkIHRoaXMucmVuZGVyKCk7XG4gIH1cblxuICBhc3luYyByZW5kZXIoKSB7XG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG4gICAgY29udGVudEVsLmVtcHR5KCk7XG4gICAgY29udGVudEVsLmFkZENsYXNzKFwib2JzaWRpYW4tZ2l0LXN5bmNlci1hY3Rpb25zXCIpO1xuXG4gICAgY29uc3QgZmlsZSA9IHRoaXMudGFyZ2V0RmlsZSA/PyB0aGlzLnBsdWdpbi5nZXRDdXJyZW50RmlsZSgpO1xuICAgIGNvbnN0IGhlYWRlciA9IGNvbnRlbnRFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJPYnNpZGlhbiBHaXQgU3luY2VyXCIgfSk7XG4gICAgaGVhZGVyLnN0eWxlLm1hcmdpbkJvdHRvbSA9IFwiOHB4XCI7XG5cbiAgICBpZiAoIWZpbGUpIHtcbiAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBcIlx1NUY1M1x1NTI0RFx1NkNBMVx1NjcwOVx1NkZDMFx1NkQzQlx1NzY4NCBNYXJrZG93biBcdTY1ODdcdTRFRjZcdTMwMDJcIiB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzdGF0ZSA9IGF3YWl0IHRoaXMucGx1Z2luLmdldEVmZmVjdGl2ZVN0YXRlKGZpbGUpO1xuICAgIGNvbnN0IGluUm9vdCA9IHRoaXMucGx1Z2luLmlzSW5zaWRlUm9vdChmaWxlKTtcbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5wbHVnaW4uYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgY29uc3QgZnJvbnRtYXR0ZXIgPSBwYXJzZUZyb250bWF0dGVyKGNvbnRlbnQpLmRhdGE7XG4gICAgY29uc3QgaGFzRnJvbnRtYXR0ZXIgPSBPYmplY3Qua2V5cyhmcm9udG1hdHRlcikubGVuZ3RoID4gMDtcbiAgICBjb25zdCBjYW5TeW5jID0gaW5Sb290ICYmIHN0YXRlLnN0YXR1cyAhPT0gXCJzeW5jZWRcIjtcbiAgICBjb25zdCBjYW5EZWxldGVSZW1vdGUgPSBCb29sZWFuKHN0YXRlLnNoYSkgJiYgc3RhdGUuc3RhdHVzICE9PSBcImRlbGV0ZWRcIjtcbiAgICBjb25zdCBjYW5PcGVuUmVtb3RlID0gQm9vbGVhbihzdGF0ZS5odG1sVXJsIHx8IHN0YXRlLnJlbW90ZVBhdGgpICYmIHN0YXRlLnN0YXR1cyAhPT0gXCJkZWxldGVkXCI7XG4gICAgY29uc3Qgc3luY0J1dHRvblRleHQgPVxuICAgICAgc3RhdGUuc3RhdHVzID09PSBcIm1vZGlmaWVkXCJcbiAgICAgICAgPyBcIlx1NjZGNFx1NjVCMFx1NTQwQ1x1NkI2NVwiXG4gICAgICAgIDogc3RhdGUuc3RhdHVzID09PSBcImRlbGV0ZWRcIlxuICAgICAgICAgID8gXCJcdTkxQ0RcdTY1QjBcdTU0MENcdTZCNjVcIlxuICAgICAgICAgIDogc3RhdGUuc3RhdHVzID09PSBcImZhaWxlZFwiXG4gICAgICAgICAgICA/IFwiXHU1MThEXHU2QjIxXHU1NDBDXHU2QjY1XCJcbiAgICAgICAgICAgIDogc3RhdGUuc3RhdHVzID09PSBcInN5bmNlZFwiXG4gICAgICAgICAgICAgID8gXCJcdTVERjJcdTU0MENcdTZCNjVcIlxuICAgICAgICAgICAgICA6IFwiXHU1NDBDXHU2QjY1XCI7XG4gICAgY29uc3Qgc3luY0Rlc2NyaXB0aW9uID1cbiAgICAgICFpblJvb3RcbiAgICAgICAgPyBcIlx1NUY1M1x1NTI0RFx1NjU4N1x1N0FFMFx1NEUwRFx1NTcyOCBMb2NhbCBSb290IFBhdGggXHU1MTg1XHUzMDAyXCJcbiAgICAgICAgOiBzdGF0ZS5zdGF0dXMgPT09IFwic3luY2VkXCJcbiAgICAgICAgICA/IFwiXHU1RjUzXHU1MjREXHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHU1REYyXHU3RUNGXHU2NjJGXHU2NzAwXHU2NUIwXHU3MkI2XHU2MDAxXHUzMDAyXCJcbiAgICAgICAgICA6IGBcdTRFMEFcdTRGMjBcdTVGNTNcdTUyNERcdTdCMTRcdThCQjBcdTUyMzAgR2l0SHViIFx1NEVEM1x1NUU5M1x1NzY4NCAke1JFTU9URV9DT05URU5UX1JPT1R9IFx1NzZFRVx1NUY1NVx1MzAwMmA7XG4gICAgY29uc3QgYmFkZ2UgPSBjb250ZW50RWwuY3JlYXRlRGl2KHtcbiAgICAgIGNsczogYG9ic2lkaWFuLWdpdC1zeW5jZXItc3RhdHVzLWJhZGdlICR7dG9TdGF0dXNDbGFzcyhzdGF0ZS5zdGF0dXMpfWBcbiAgICB9KTtcbiAgICBiYWRnZS5zZXRUZXh0KHRvU3RhdHVzTGFiZWwoc3RhdGUuc3RhdHVzKSk7XG5cbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFx1NUY1M1x1NTI0RFx1NjU4N1x1NEVGNlx1RkYxQSR7ZmlsZS5wYXRofWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7XG4gICAgICB0ZXh0OiBgXHU4RkRDXHU3QUVGXHU4REVGXHU1Rjg0XHVGRjFBJHtzdGF0ZS5yZW1vdGVQYXRoID8/IChpblJvb3QgPyB0aGlzLnBsdWdpbi5yZW1vdGVQYXRoKGZpbGUpIDogYCR7UkVNT1RFX0NPTlRFTlRfUk9PVH0vLi4uYCl9YCxcbiAgICAgIGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLW11dGVkXCJcbiAgICB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHtcbiAgICAgIHRleHQ6IGBcdTcyQjZcdTYwMDFcdUZGMUEke3RvU3RhdHVzTGFiZWwoc3RhdGUuc3RhdHVzKX0ke3N0YXRlLmxhc3RTeW5jZWRBdCA/IGAgXHUwMEI3IFx1NjcwMFx1OEZEMVx1NTQwQ1x1NkI2NSAke3N0YXRlLmxhc3RTeW5jZWRBdH1gIDogXCJcIn1gLFxuICAgICAgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItbXV0ZWRcIlxuICAgIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwge1xuICAgICAgdGV4dDogaW5Sb290XG4gICAgICAgID8gYFx1NUY1M1x1NTI0RFx1NjU4N1x1NEVGNlx1NEY0RFx1NEU4RVx1NTQwQ1x1NkI2NVx1NzZFRVx1NUY1NVx1NTE4NVx1RkYxQSR7dGhpcy5wbHVnaW4uc2V0dGluZ3MubG9jYWxSb290UGF0aH1gXG4gICAgICAgIDogYFx1NUY1M1x1NTI0RFx1NjU4N1x1NEVGNlx1NEUwRFx1NTcyOFx1NTQwQ1x1NkI2NVx1NzZFRVx1NUY1NVx1NTE4NVx1RkYxQSR7dGhpcy5wbHVnaW4uc2V0dGluZ3MubG9jYWxSb290UGF0aH1gLFxuICAgICAgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItbXV0ZWRcIlxuICAgIH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGVudEVsKVxuICAgICAgLnNldE5hbWUoXCJcdTYzRDJcdTUxNjVcdTY1ODdcdTdBRTBcdTVDNUVcdTYwMjdcIilcbiAgICAgIC5zZXREZXNjKGhhc0Zyb250bWF0dGVyID8gXCJcdTVGNTNcdTUyNERcdTY1ODdcdTdBRTBcdTVERjJcdTdFQ0ZcdTVCNThcdTU3MjhcdTY1ODdcdTdBRTBcdTVDNUVcdTYwMjdcdTMwMDJcIiA6IFwiXHU0RTNBXHU1RjUzXHU1MjREXHU2NTg3XHU3QUUwXHU2M0QyXHU1MTY1IFF1YXJ0eiBcdTVFMzhcdTc1MjhcdTY1ODdcdTdBRTBcdTVDNUVcdTYwMjdcdTMwMDJcIilcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uXG4gICAgICAgICAgLnNldEJ1dHRvblRleHQoaGFzRnJvbnRtYXR0ZXIgPyBcIlx1NURGMlx1NUI1OFx1NTcyOFwiIDogXCJcdTYyNjdcdTg4NENcIilcbiAgICAgICAgICAuc2V0RGlzYWJsZWQoIWluUm9vdCB8fCBoYXNGcm9udG1hdHRlcilcbiAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnJ1bkFjdGlvbigoKSA9PiB0aGlzLnBsdWdpbi5lbnN1cmVUZW1wbGF0ZUZyb250bWF0dGVyKGZpbGUpKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucmVuZGVyKCk7XG4gICAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250ZW50RWwpXG4gICAgICAuc2V0TmFtZShcIlx1NTQwQ1x1NkI2NVx1NUY1M1x1NTI0RFx1NjU4N1x1N0FFMFwiKVxuICAgICAgLnNldERlc2Moc3luY0Rlc2NyaXB0aW9uKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PiB7XG4gICAgICAgIGJ1dHRvbi5zZXRCdXR0b25UZXh0KHN5bmNCdXR0b25UZXh0KS5zZXREaXNhYmxlZCghY2FuU3luYyk7XG5cbiAgICAgICAgaWYgKGNhblN5bmMpIHtcbiAgICAgICAgICBidXR0b24uc2V0Q3RhKCk7XG4gICAgICAgIH1cblxuICAgICAgICBidXR0b24ub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5ydW5BY3Rpb24oKCkgPT4gdGhpcy5wbHVnaW4uc3luY0ZpbGVUb0dpdEh1YihmaWxlKSk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5yZW5kZXIoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRlbnRFbClcbiAgICAgIC5zZXROYW1lKFwiXHU1MjIwXHU5NjY0XHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XCIpXG4gICAgICAuc2V0RGVzYyhcIlx1NEVDRSBHaXRIdWIgXHU0RUQzXHU1RTkzIGNvbnRlbnQgXHU3NkVFXHU1RjU1XHU1MjIwXHU5NjY0XHU1RjUzXHU1MjREXHU2NTg3XHU3QUUwXHU1QkY5XHU1RTk0XHU2NTg3XHU0RUY2XHUzMDAyXCIpXG4gICAgICAuYWRkQnV0dG9uKChidXR0b24pID0+IHtcbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQoXCJcdTUyMjBcdTk2NjRcIikuc2V0RGlzYWJsZWQoIWNhbkRlbGV0ZVJlbW90ZSk7XG5cbiAgICAgICAgaWYgKGNhbkRlbGV0ZVJlbW90ZSkge1xuICAgICAgICAgIGJ1dHRvbi5zZXRXYXJuaW5nKCk7XG4gICAgICAgIH1cblxuICAgICAgICBidXR0b24ub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgYXdhaXQgdGhpcy5ydW5BY3Rpb24oKCkgPT4gdGhpcy5wbHVnaW4uZGVsZXRlUmVtb3RlRmlsZShmaWxlKSk7XG4gICAgICAgICAgYXdhaXQgdGhpcy5yZW5kZXIoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRlbnRFbClcbiAgICAgIC5zZXROYW1lKFwiXHU2MjUzXHU1RjAwIEdpdEh1YiBcdTY1ODdcdTRFRjZcIilcbiAgICAgIC5zZXREZXNjKGNhbk9wZW5SZW1vdGUgPyBcIlx1NTcyOFx1NkQ0Rlx1ODlDOFx1NTY2OFx1NEUyRFx1NjI1M1x1NUYwMFx1NUY1M1x1NTI0RFx1NjU4N1x1N0FFMFx1NzY4NCBHaXRIdWIgXHU2NTg3XHU0RUY2XHU5ODc1XHU5NzYyXHUzMDAyXCIgOiBcIlx1NUY1M1x1NTI0RFx1NjU4N1x1N0FFMFx1NkNBMVx1NjcwOVx1NTNFRlx1NjI1M1x1NUYwMFx1NzY4NFx1OEZEQ1x1N0FFRlx1NjU4N1x1NEVGNlx1MzAwMlwiKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b25cbiAgICAgICAgICAuc2V0QnV0dG9uVGV4dChcIlx1NjI1M1x1NUYwMFwiKVxuICAgICAgICAgIC5zZXREaXNhYmxlZCghY2FuT3BlblJlbW90ZSlcbiAgICAgICAgICAub25DbGljaygoKSA9PiB2b2lkIHRoaXMucGx1Z2luLm9wZW5SZW1vdGVVcmxGb3JGaWxlKGZpbGUpKVxuICAgICAgKTtcbiAgfVxuXG4gIGFzeW5jIHJ1bkFjdGlvbihhY3Rpb246ICgpID0+IFByb21pc2U8dm9pZD4pIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgYWN0aW9uKCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiXHU2NzJBXHU3N0U1XHU5NTE5XHU4QkVGXCI7XG4gICAgICBuZXcgTm90aWNlKG1lc3NhZ2UpO1xuICAgIH1cbiAgfVxufVxuXG5jbGFzcyBQbHVnaW5WZXJzaW9uTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHBsdWdpbjogT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW47XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW4pIHtcbiAgICBzdXBlcihhcHApO1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICB9XG5cbiAgb25PcGVuKCkge1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJcdTYzRDJcdTRFRjZcdTcyNDhcdTY3MkNcdTRGRTFcdTYwNkZcIiB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFx1NTQwRFx1NzlGMFx1RkYxQSR7dGhpcy5wbHVnaW4ubWFuaWZlc3QubmFtZX1gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgXHU3MjQ4XHU2NzJDXHVGRjFBJHt0aGlzLnBsdWdpbi5tYW5pZmVzdC52ZXJzaW9ufWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBcdTYzRDJcdTRFRjYgSURcdUZGMUEke3RoaXMucGx1Z2luLm1hbmlmZXN0LmlkfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBcdTY3MDBcdTRGNEUgT2JzaWRpYW4gXHU3MjQ4XHU2NzJDXHVGRjFBJHt0aGlzLnBsdWdpbi5tYW5pZmVzdC5taW5BcHBWZXJzaW9ufWAgfSk7XG4gIH1cbn1cblxuY2xhc3MgR2l0U3luY2VyU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luO1xuICBhY3RpdmVTZWN0aW9uOiBcImdlbmVyYWxcIiB8IFwicmVtb3RlXCIgfCBcInN5bmNcIiB8IFwibWVkaWFcIiB8IFwiZGVidWdcIiA9IFwiZ2VuZXJhbFwiO1xuICBzZWFyY2hRdWVyeSA9IFwiXCI7XG4gIHJvb3RFbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgbmF2RWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIHBhbmVsRWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW4pIHtcbiAgICBzdXBlcihhcHAsIHBsdWdpbik7XG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gIH1cblxuICBnZXRTZWN0aW9ucygpIHtcbiAgICByZXR1cm4gW1xuICAgICAge1xuICAgICAgICBpZDogXCJnZW5lcmFsXCIgYXMgY29uc3QsXG4gICAgICAgIGxhYmVsOiBcIlx1OTAxQVx1NzUyOFx1OEJCRVx1N0Y2RVwiLFxuICAgICAgICB0aXRsZTogXCJcdTkwMUFcdTc1MjhcdThCQkVcdTdGNkVcIixcbiAgICAgICAgZGVzY3JpcHRpb246IFwiXHU3QkExXHU3NDA2XHU2NzJDXHU1NzMwXHU1NDBDXHU2QjY1XHU3NkVFXHU1RjU1XHU1NDhDXHU2M0QyXHU0RUY2XHU1N0ZBXHU3ODQwXHU0RkUxXHU2MDZGXHUzMDAyXCJcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIGlkOiBcInJlbW90ZVwiIGFzIGNvbnN0LFxuICAgICAgICBsYWJlbDogXCJHaXRIdWIgXHU5MTREXHU3RjZFXCIsXG4gICAgICAgIHRpdGxlOiBcIkdpdEh1YiBcdTkxNERcdTdGNkVcIixcbiAgICAgICAgZGVzY3JpcHRpb246IFwiXHU5MTREXHU3RjZFIEdpdEh1YiBcdTRFRDNcdTVFOTNcdTMwMDFUb2tlblx1MzAwMVx1NzUyOFx1NjIzN1x1NTQwRFx1NTQ4Q1x1NzZFRVx1NjgwN1x1NTIwNlx1NjUyRlx1MzAwMlwiXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBpZDogXCJzeW5jXCIgYXMgY29uc3QsXG4gICAgICAgIGxhYmVsOiBcIlx1NTQwQ1x1NkI2NVx1NjNBN1x1NTIzNlwiLFxuICAgICAgICB0aXRsZTogXCJcdTU0MENcdTZCNjVcdTYzQTdcdTUyMzZcIixcbiAgICAgICAgZGVzY3JpcHRpb246IFwiXHU2N0U1XHU3NzBCIGNvbnRlbnQgXHU3NkVFXHU1RjU1XHU2NjIwXHU1QzA0XHUzMDAxXHU3MkI2XHU2MDAxXHU3RjEzXHU1QjU4XHU1NDhDXHU1NDBDXHU2QjY1XHU3QjU2XHU3NTY1XHUzMDAyXCJcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIGlkOiBcIm1lZGlhXCIgYXMgY29uc3QsXG4gICAgICAgIGxhYmVsOiBcIlx1OTY0NFx1NEVGNlx1NTkwNFx1NzQwNlwiLFxuICAgICAgICB0aXRsZTogXCJcdTk2NDRcdTRFRjZcdTU5MDRcdTc0MDZcIixcbiAgICAgICAgZGVzY3JpcHRpb246IFwiXHU1NDBFXHU3RUVEXHU1M0VGXHU2MjY5XHU1QzU1XHU1NkZFXHU3MjQ3XHU0RTBBXHU0RjIwXHUzMDAxXHU5NjQ0XHU0RUY2XHU1OTBEXHU1MjM2XHU1NDhDXHU4RDQ0XHU2RTkwXHU1RjE1XHU3NTI4XHU5MUNEXHU1MTk5XHUzMDAyXCJcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIGlkOiBcImRlYnVnXCIgYXMgY29uc3QsXG4gICAgICAgIGxhYmVsOiBcIlx1OEMwM1x1OEJENVwiLFxuICAgICAgICB0aXRsZTogXCJcdThDMDNcdThCRDVcdTRFMEVcdTY1RTVcdTVGRDdcIixcbiAgICAgICAgZGVzY3JpcHRpb246IFwiXHU2N0U1XHU3NzBCXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXHU1NDhDXHU4QkNBXHU2NUFEXHU1MTY1XHU1M0UzXHUzMDAyXCJcbiAgICAgIH1cbiAgICBdO1xuICB9XG5cbiAgZ2V0RmlsdGVyVGV4dCguLi5wYXJ0czogQXJyYXk8c3RyaW5nIHwgdW5kZWZpbmVkPikge1xuICAgIHJldHVybiBwYXJ0c1xuICAgICAgLmZpbHRlcigocGFydCk6IHBhcnQgaXMgc3RyaW5nID0+IEJvb2xlYW4ocGFydCkpXG4gICAgICAuam9pbihcIiBcIilcbiAgICAgIC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCAuLi5wYXJ0czogQXJyYXk8c3RyaW5nIHwgdW5kZWZpbmVkPikge1xuICAgIGNvbnN0IHNldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbCk7XG4gICAgc2V0dGluZy5zZXR0aW5nRWwuZGF0YXNldC5maWx0ZXJUZXh0ID0gdGhpcy5nZXRGaWx0ZXJUZXh0KC4uLnBhcnRzKTtcbiAgICByZXR1cm4gc2V0dGluZztcbiAgfVxuXG4gIHJlbmRlclNlYXJjaEJhcihjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBzZWFyY2hTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldENsYXNzKFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1zZWFyY2gtcm93XCIpO1xuICAgIHNlYXJjaFNldHRpbmcuaW5mb0VsLnJlbW92ZSgpO1xuICAgIHNlYXJjaFNldHRpbmcuYWRkU2VhcmNoKChzZWFyY2gpID0+XG4gICAgICBzZWFyY2guc2V0UGxhY2Vob2xkZXIoXCJcdTY0MUNcdTdEMjJcdTk3NjJcdTY3N0ZcdThCQkVcdTdGNkUuLi5cIikuc2V0VmFsdWUodGhpcy5zZWFyY2hRdWVyeSkub25DaGFuZ2UoKHZhbHVlKSA9PiB7XG4gICAgICAgIHRoaXMuc2VhcmNoUXVlcnkgPSB2YWx1ZTtcbiAgICAgICAgY29uc3QgcGFuZWxFbCA9IHRoaXMuY29udGFpbmVyRWwucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXCIub2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1wYW5lbFwiKTtcbiAgICAgICAgaWYgKHBhbmVsRWwpIHtcbiAgICAgICAgICB0aGlzLmFwcGx5U2VhcmNoRmlsdGVyKHBhbmVsRWwpO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICk7XG4gIH1cblxuICByZW5kZXJTZWN0aW9uVGFicyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBuYXZFbCA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJvYnNpZGlhbi1naXQtc3luY2VyLXNldHRpbmdzLW5hdlwiIH0pO1xuICAgIHRoaXMubmF2RWwgPSBuYXZFbDtcblxuICAgIHRoaXMuZ2V0U2VjdGlvbnMoKS5mb3JFYWNoKChzZWN0aW9uKSA9PiB7XG4gICAgICBjb25zdCBidXR0b24gPSBuYXZFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG4gICAgICAgIGNsczogYG9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3MtbmF2LWl0ZW0ke3RoaXMuYWN0aXZlU2VjdGlvbiA9PT0gc2VjdGlvbi5pZCA/IFwiIGlzLWFjdGl2ZVwiIDogXCJcIn1gLFxuICAgICAgICB0ZXh0OiBzZWN0aW9uLmxhYmVsXG4gICAgICB9KTtcbiAgICAgIGJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcbiAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgICBpZiAodGhpcy5hY3RpdmVTZWN0aW9uID09PSBzZWN0aW9uLmlkKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5hY3RpdmVTZWN0aW9uID0gc2VjdGlvbi5pZDtcbiAgICAgICAgdGhpcy5zeW5jVGFiU3RhdGUoKTtcbiAgICAgICAgaWYgKHRoaXMucGFuZWxFbCkge1xuICAgICAgICAgIHRoaXMucmVuZGVyUGFuZWwodGhpcy5wYW5lbEVsKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBzeW5jVGFiU3RhdGUoKSB7XG4gICAgaWYgKCF0aGlzLm5hdkVsKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgaXRlbXMgPSBBcnJheS5mcm9tKHRoaXMubmF2RWwucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oXCIub2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1uYXYtaXRlbVwiKSk7XG4gICAgaXRlbXMuZm9yRWFjaCgoaXRlbSwgaW5kZXgpID0+IHtcbiAgICAgIGNvbnN0IHNlY3Rpb24gPSB0aGlzLmdldFNlY3Rpb25zKClbaW5kZXhdO1xuICAgICAgaXRlbS5jbGFzc0xpc3QudG9nZ2xlKFwiaXMtYWN0aXZlXCIsIHNlY3Rpb24/LmlkID09PSB0aGlzLmFjdGl2ZVNlY3Rpb24pO1xuICAgIH0pO1xuICB9XG5cbiAgcmVuZGVyUGxhY2Vob2xkZXJTZXR0aW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgdGl0bGU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgYmFkZ2UgPSBcIlx1ODlDNFx1NTIxMlx1NEUyRFwiKSB7XG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgdGl0bGUsIGRlc2NyaXB0aW9uLCBiYWRnZSlcbiAgICAgIC5zZXROYW1lKHRpdGxlKVxuICAgICAgLnNldERlc2MoYCR7ZGVzY3JpcHRpb259XHVGRjA4JHtiYWRnZX1cdUZGMDlgKTtcbiAgfVxuXG4gIHJlbmRlclNlY3Rpb25TdWJoZWFkaW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgdGV4dDogc3RyaW5nKSB7XG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUodGV4dCkuc2V0SGVhZGluZygpO1xuICB9XG5cbiAgcmVuZGVyR2VuZXJhbFNldHRpbmdzKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCkge1xuICAgIGNvbnN0IGxvY2FsUm9vdERlc2NyaXB0aW9uID0gdGhpcy5wbHVnaW4uZ2V0RXhpc3RpbmdGb2xkZXIodGhpcy5wbHVnaW4uc2V0dGluZ3MubG9jYWxSb290UGF0aClcbiAgICAgID8gYFx1NUY1M1x1NTI0RFx1NzZFRVx1NUY1NVx1NjcwOVx1NjU0OFx1RkYxQSR7dGhpcy5wbHVnaW4uc2V0dGluZ3MubG9jYWxSb290UGF0aH1gXG4gICAgICA6IFwiXHU1M0VBXHU2NzA5XHU4QkU1XHU3NkVFXHU1RjU1XHU1MTg1XHU3Njg0IE1hcmtkb3duIFx1NjI0RFx1NTE0MVx1OEJCOFx1NTQwQ1x1NkI2NVx1MzAwMlx1NUY1M1x1NTI0RFx1NTAzQ1x1NjVFMFx1NjU0OFx1NjVGNlx1OEJGN1x1OTFDRFx1NjVCMFx1OTAwOVx1NjJFOVx1NzZFRVx1NUY1NVx1MzAwMlwiO1xuXG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJMb2NhbCBSb290IFBhdGhcIiwgbG9jYWxSb290RGVzY3JpcHRpb24sIHRoaXMucGx1Z2luLnNldHRpbmdzLmxvY2FsUm9vdFBhdGgpXG4gICAgICAuc2V0TmFtZShcIkxvY2FsIFJvb3QgUGF0aFwiKVxuICAgICAgLnNldERlc2MobG9jYWxSb290RGVzY3JpcHRpb24pXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5sb2NhbFJvb3RQYXRoKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5sb2NhbFJvb3RQYXRoID0gbm9ybWFsaXplUGF0aCh2YWx1ZS50cmltKCkpO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dChcIlx1OTAwOVx1NjJFOVx1NzZFRVx1NUY1NVwiKS5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICBuZXcgRm9sZGVyU2VsZWN0TW9kYWwodGhpcy5hcHAsIHRoaXMucGx1Z2luLCBhc3luYyAoZm9sZGVyKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zZXRMb2NhbFJvb3RQYXRoKGZvbGRlci5wYXRoKTtcbiAgICAgICAgICAgICAgbmV3IE5vdGljZShgXHU1REYyXHU4QkJFXHU3RjZFIExvY2FsIFJvb3QgUGF0aFx1RkYxQSR7Zm9sZGVyLnBhdGh9YCk7XG4gICAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogXCJcdThCQkVcdTdGNkVcdTU5MzFcdThEMjVcIjtcbiAgICAgICAgICAgICAgbmV3IE5vdGljZShtZXNzYWdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KS5vcGVuKCk7XG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJcdThGRENcdTdBRUZcdTc2RUVcdTVGNTVcIiwgXCJcdTU2RkFcdTVCOUFcdTUxOTlcdTUxNjUgR2l0SHViIFx1NEVEM1x1NUU5MyBjb250ZW50IFx1NzZFRVx1NUY1NVx1MzAwMlwiLCBSRU1PVEVfQ09OVEVOVF9ST09UKVxuICAgICAgLnNldE5hbWUoXCJcdThGRENcdTdBRUZcdTc2RUVcdTVGNTVcIilcbiAgICAgIC5zZXREZXNjKFwiXHU2M0QyXHU0RUY2XHU1M0VBXHU4QkZCXHU1MTk5XHU0RUQzXHU1RTkzIGNvbnRlbnQgXHU3NkVFXHU1RjU1XHVGRjFCXHU2NzJDXHU1NzMwXHU1NDBDXHU2QjY1XHU3NkVFXHU1RjU1XHU1MTg1XHU3Njg0XHU3NkY4XHU1QkY5XHU4REVGXHU1Rjg0XHU0RjFBXHU2NjIwXHU1QzA0XHU1MjMwIGNvbnRlbnQgXHU0RTBCXHUzMDAyXCIpO1xuXG4gICAgdGhpcy5yZW5kZXJTZWN0aW9uU3ViaGVhZGluZyhjb250YWluZXJFbCwgXCJcdTVFMkVcdTUyQTlcdTRFMEVcdTY1MkZcdTYzMDFcIik7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIlx1NjNEMlx1NEVGNlx1NzI0OFx1NjcyQ1wiLCBcIlx1NjdFNVx1NzcwQlx1NUY1M1x1NTI0RFx1NjNEMlx1NEVGNlx1NzI0OFx1NjcyQ1x1MzAwMVx1NjNEMlx1NEVGNiBJRCBcdTRFMEVcdTUxN0NcdTVCQjlcdTYwMjdcdTRGRTFcdTYwNkZcdTMwMDJcIilcbiAgICAgIC5zZXROYW1lKFwiXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXCIpXG4gICAgICAuc2V0RGVzYyhcIlx1NjdFNVx1NzcwQlx1NUY1M1x1NTI0RFx1NjNEMlx1NEVGNlx1NzI0OFx1NjcyQ1x1MzAwMVx1NjNEMlx1NEVGNiBJRCBcdTRFMEVcdTUxN0NcdTVCQjlcdTYwMjdcdTRGRTFcdTYwNkZcdTMwMDJcIilcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQoXCJcdTY3RTVcdTc3MEJcIikub25DbGljaygoKSA9PiB7XG4gICAgICAgICAgbmV3IFBsdWdpblZlcnNpb25Nb2RhbCh0aGlzLmFwcCwgdGhpcy5wbHVnaW4pLm9wZW4oKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gIH1cblxuICByZW5kZXJSZW1vdGVTZXR0aW5ncyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKFxuICAgICAgY29udGFpbmVyRWwsXG4gICAgICBcIlJlcG9zaXRvcnkgVVJMXCIsXG4gICAgICBcIlx1NEY4Qlx1NTk4MiBodHRwczovL2dpdGh1Yi5jb20vaW1saXVzeC9vYnNpZGlhbi1naXQtc3luY2VyLmdpdFwiLFxuICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmVwb3NpdG9yeVVybFxuICAgIClcbiAgICAgIC5zZXROYW1lKFwiUmVwb3NpdG9yeSBVUkxcIilcbiAgICAgIC5zZXREZXNjKFwiR2l0SHViIFx1OTg3OVx1NzZFRVx1NEVEM1x1NUU5M1x1NTczMFx1NTc0MFx1RkYwQ1x1NjUyRlx1NjMwMSBIVFRQU1x1MzAwMVNTSCBcdTYyMTYgb3duZXIvcmVwb1x1MzAwMlwiKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby5naXRcIilcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucmVwb3NpdG9yeVVybClcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZXBvc2l0b3J5VXJsID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIkdpdEh1YiBVc2VybmFtZVwiLCBcIlx1NUY1M1x1NTI0RFx1NjM4OFx1Njc0MyBUb2tlbiBcdTVCRjlcdTVFOTRcdTc2ODQgR2l0SHViIFx1NzUyOFx1NjIzN1x1NTQwRFx1MzAwMlwiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5naXRodWJVc2VybmFtZSlcbiAgICAgIC5zZXROYW1lKFwiR2l0SHViIFVzZXJuYW1lXCIpXG4gICAgICAuc2V0RGVzYyhcIlx1NUY1M1x1NTI0RFx1NjM4OFx1Njc0MyBUb2tlbiBcdTVCRjlcdTVFOTRcdTc2ODQgR2l0SHViIFx1NzUyOFx1NjIzN1x1NTQwRFx1MzAwMlwiKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJpbWxpdXN4XCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmdpdGh1YlVzZXJuYW1lKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmdpdGh1YlVzZXJuYW1lID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIkdpdEh1YiBUb2tlblwiLCBcIkZpbmUtZ3JhaW5lZCBUb2tlbiBcdTk3MDBcdTg5ODFcdTVGMDBcdTU0MkYgQ29udGVudHMgXHU4QkZCXHU1MTk5XHU2NzQzXHU5NjUwXHUzMDAyXCIpXG4gICAgICAuc2V0TmFtZShcIkdpdEh1YiBUb2tlblwiKVxuICAgICAgLnNldERlc2MoXCJGaW5lLWdyYWluZWQgVG9rZW4gXHU5NzAwXHU4OTgxXHU2Mzg4XHU2NzQzXHU3NkVFXHU2ODA3XHU0RUQzXHU1RTkzXHVGRjBDXHU1RTc2XHU1RjAwXHU1NDJGIENvbnRlbnRzIFx1OEJGQlx1NTE5OVx1Njc0M1x1OTY1MFx1MzAwMlwiKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+IHtcbiAgICAgICAgdGV4dC5pbnB1dEVsLnR5cGUgPSBcInBhc3N3b3JkXCI7XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJnaXRodWJfcGF0Xy4uLlwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5naXRodWJUb2tlbilcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5naXRodWJUb2tlbiA9IHZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIkJyYW5jaFwiLCBcIlx1NEY4Qlx1NTk4MiBtYWluXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLmJyYW5jaClcbiAgICAgIC5zZXROYW1lKFwiQnJhbmNoXCIpXG4gICAgICAuc2V0RGVzYyhcIlx1NTQwQ1x1NkI2NVx1NTE5OVx1NTE2NVx1NzY4NFx1NzZFRVx1NjgwN1x1NTIwNlx1NjUyRlx1MzAwMlwiKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJtYWluXCIpXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmJyYW5jaClcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5icmFuY2ggPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiXHU2RDRCXHU4QkQ1XHU4RkRFXHU2M0E1XCIsIFwiXHU5QThDXHU4QkMxXHU1RjUzXHU1MjREXHU0RUQzXHU1RTkzXHUzMDAxVG9rZW4gXHU1NDhDXHU1MjA2XHU2NTJGXHU5MTREXHU3RjZFXHU2NjJGXHU1NDI2XHU1M0VGXHU4QkJGXHU5NUVFXHUzMDAyXCIpXG4gICAgICAuc2V0TmFtZShcIlx1NkQ0Qlx1OEJENVx1OEZERVx1NjNBNVwiKVxuICAgICAgLnNldERlc2MoXCJcdTlBOENcdThCQzFcdTVGNTNcdTUyNERcdTRFRDNcdTVFOTNcdTMwMDFUb2tlbiBcdTU0OENcdTUyMDZcdTY1MkZcdTkxNERcdTdGNkVcdTY2MkZcdTU0MjZcdTUzRUZcdThCQkZcdTk1RUVcdTMwMDJcIilcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQoXCJcdTZENEJcdThCRDVcdThGREVcdTYzQTVcIikub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnRlc3RDb25uZWN0aW9uKCk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiXHU4RkRFXHU2M0E1XHU1OTMxXHU4RDI1XCI7XG4gICAgICAgICAgICBuZXcgTm90aWNlKG1lc3NhZ2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICk7XG4gIH1cblxuICByZW5kZXJTeW5jU2V0dGluZ3MoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJDb250ZW50IFJvb3RcIiwgXCJcdTU2RkFcdTVCOUFcdTRFM0EgY29udGVudFwiLCBSRU1PVEVfQ09OVEVOVF9ST09UKVxuICAgICAgLnNldE5hbWUoXCJDb250ZW50IFJvb3RcIilcbiAgICAgIC5zZXREZXNjKFwiXHU4RkRDXHU3QUVGXHU4QkZCXHU1MTk5XHU4REVGXHU1Rjg0XHU1NkZBXHU1QjlBXHU0RTNBIGNvbnRlbnQvPFx1NjcyQ1x1NTczMFx1NzZGOFx1NUJGOVx1OERFRlx1NUY4ND5cdTMwMDJcIik7XG5cbiAgICB0aGlzLmNyZWF0ZVNlYXJjaGFibGVTZXR0aW5nKGNvbnRhaW5lckVsLCBcIlx1NTQwQ1x1NkI2NVx1OEJGNFx1NjYwRVwiLCBcIlx1NzJCNlx1NjAwMVx1N0YxM1x1NUI1OFx1MzAwMVx1NjcyQ1x1NTczMFx1NEZFRVx1NjUzOVx1NjhDMFx1NkQ0Qlx1MzAwMVx1OEZEQ1x1N0FFRlx1NTIyMFx1OTY2NFx1NjhDMFx1NkQ0QlwiLCBcIlx1OEJGNFx1NjYwRVwiKVxuICAgICAgLnNldE5hbWUoXCJcdTU0MENcdTZCNjVcdThCRjRcdTY2MEVcIilcbiAgICAgIC5zZXREZXNjKFwiXHU2M0QyXHU0RUY2XHU0RjFBXHU3RjEzXHU1QjU4XHU2NzAwXHU4RkQxXHU1NDBDXHU2QjY1XHU3Njg0XHU1MTg1XHU1QkI5XHU1NEM4XHU1RTBDXHVGRjFCXHU2NzJDXHU1NzMwXHU1MTg1XHU1QkI5XHU1M0Q4XHU1MzE2XHU2NjNFXHU3OTNBXHU0RTNBXHU1REYyXHU0RkVFXHU2NTM5XHVGRjBDXHU4RkRDXHU3QUVGXHU2NTg3XHU0RUY2XHU0RTBEXHU1QjU4XHU1NzI4XHU2NjNFXHU3OTNBXHU0RTNBXHU4RkRDXHU3QUVGXHU1REYyXHU1MjIwXHU5NjY0XHUzMDAyXCIpO1xuXG4gICAgdGhpcy5jcmVhdGVTZWFyY2hhYmxlU2V0dGluZyhjb250YWluZXJFbCwgXCJcdTZFMDVcdTc0MDZcdTcyQjZcdTYwMDFcdTdGMTNcdTVCNThcIiwgXCJcdTZFMDVcdTc0MDZcdTY3MkNcdTU3MzBcdTU0MENcdTZCNjVcdTcyQjZcdTYwMDFcdUZGMENcdTRFMERcdTVGNzFcdTU0Q0QgR2l0SHViIFx1NEVEM1x1NUU5M1x1NjU4N1x1NEVGNlx1MzAwMlwiKVxuICAgICAgLnNldE5hbWUoXCJcdTZFMDVcdTc0MDZcdTcyQjZcdTYwMDFcdTdGMTNcdTVCNThcIilcbiAgICAgIC5zZXREZXNjKFwiXHU2RTA1XHU3NDA2XHU2NzJDXHU1NzMwXHU1NDBDXHU2QjY1XHU3MkI2XHU2MDAxXHVGRjBDXHU0RTBEXHU1RjcxXHU1NENEIEdpdEh1YiBcdTRFRDNcdTVFOTNcdTY1ODdcdTRFRjZcdTMwMDJcIilcbiAgICAgIC5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgICAgYnV0dG9uLnNldEJ1dHRvblRleHQoXCJcdTZFMDVcdTc0MDZcIikuc2V0V2FybmluZygpLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLmRhdGEuZmlsZXMgPSB7fTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlQWxsRGF0YSgpO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnJlZnJlc2hTdGF0dXNCYXIoKTtcbiAgICAgICAgICBuZXcgTm90aWNlKFwiXHU3MkI2XHU2MDAxXHU3RjEzXHU1QjU4XHU1REYyXHU2RTA1XHU3NDA2XHUzMDAyXCIpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgfVxuXG4gIHJlbmRlck1lZGlhU2V0dGluZ3MoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgdGhpcy5yZW5kZXJQbGFjZWhvbGRlclNldHRpbmcoXG4gICAgICBjb250YWluZXJFbCxcbiAgICAgIFwiXHU5NjQ0XHU0RUY2XHU0RTBFXHU1NkZFXHU3MjQ3XCIsXG4gICAgICBcIlx1OEZEOVx1OTFDQ1x1NUMwNlx1NzUyOFx1NEU4RVx1OTE0RFx1N0Y2RVx1NTZGRVx1NzI0N1x1NTkwRFx1NTIzNlx1N0I1Nlx1NzU2NVx1MzAwMVx1OTY0NFx1NEVGNlx1NzZFRVx1NUY1NVx1NjYyMFx1NUMwNFx1MzAwMVx1OEZEQ1x1N0EwQlx1OEQ0NFx1NkU5MFx1NTczMFx1NTc0MFx1NEUwRVx1NUYxNVx1NzUyOFx1OTFDRFx1NTE5OVx1ODlDNFx1NTIxOVx1MzAwMlwiXG4gICAgKTtcbiAgfVxuXG4gIHJlbmRlckRlYnVnU2V0dGluZ3MoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgdGhpcy5yZW5kZXJQbGFjZWhvbGRlclNldHRpbmcoXG4gICAgICBjb250YWluZXJFbCxcbiAgICAgIFwiXHU4QzAzXHU4QkQ1XHU0RTBFXHU2NUU1XHU1RkQ3XCIsXG4gICAgICBcIlx1OEZEOVx1OTFDQ1x1NUMwNlx1NzUyOFx1NEU4RVx1NjdFNVx1NzcwQlx1NTQwQ1x1NkI2NVx1NjVFNVx1NUZEN1x1MzAwMVx1OEJGN1x1NkM0Mlx1N0VEM1x1Njc5Q1x1NTQ4Q1x1OTUxOVx1OEJFRlx1NjM5Mlx1NjdFNVx1NEZFMVx1NjA2Rlx1MzAwMlwiXG4gICAgKTtcblxuICAgIHRoaXMuY3JlYXRlU2VhcmNoYWJsZVNldHRpbmcoY29udGFpbmVyRWwsIFwiXHU2M0QyXHU0RUY2XHU3MjQ4XHU2NzJDXHU0RkUxXHU2MDZGXCIsIFwiXHU2N0U1XHU3NzBCXHU3MjQ4XHU2NzJDXHUzMDAxXHU2M0QyXHU0RUY2IElEIFx1NTQ4Q1x1NjcwMFx1NEY0RVx1NTE3Q1x1NUJCOVx1NzI0OFx1NjcyQ1x1MzAwMlwiKVxuICAgICAgLnNldE5hbWUoXCJcdTYzRDJcdTRFRjZcdTcyNDhcdTY3MkNcdTRGRTFcdTYwNkZcIilcbiAgICAgIC5zZXREZXNjKFwiXHU2N0U1XHU3NzBCXHU3MjQ4XHU2NzJDXHUzMDAxXHU2M0QyXHU0RUY2IElEIFx1NTQ4Q1x1NjcwMFx1NEY0RVx1NTE3Q1x1NUJCOVx1NzI0OFx1NjcyQ1x1MzAwMlwiKVxuICAgICAgLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgICBidXR0b24uc2V0QnV0dG9uVGV4dChcIlx1NjI1M1x1NUYwMFwiKS5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICBuZXcgUGx1Z2luVmVyc2lvbk1vZGFsKHRoaXMuYXBwLCB0aGlzLnBsdWdpbikub3BlbigpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgfVxuXG4gIGFwcGx5U2VhcmNoRmlsdGVyKHBhbmVsRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3QgcXVlcnkgPSB0aGlzLnNlYXJjaFF1ZXJ5LnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IGl0ZW1zID0gQXJyYXkuZnJvbShwYW5lbEVsLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KFwiLnNldHRpbmctaXRlbVtkYXRhLWZpbHRlci10ZXh0XVwiKSk7XG4gICAgbGV0IHZpc2libGVDb3VudCA9IDA7XG5cbiAgICBpdGVtcy5mb3JFYWNoKChpdGVtRWwpID0+IHtcbiAgICAgIGNvbnN0IG1hdGNoZXMgPSAhcXVlcnkgfHwgKGl0ZW1FbC5kYXRhc2V0LmZpbHRlclRleHQgPz8gXCJcIikuaW5jbHVkZXMocXVlcnkpO1xuICAgICAgaXRlbUVsLmNsYXNzTGlzdC50b2dnbGUoXCJpcy1oaWRkZW5cIiwgIW1hdGNoZXMpO1xuICAgICAgaWYgKG1hdGNoZXMpIHtcbiAgICAgICAgdmlzaWJsZUNvdW50ICs9IDE7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCBlbXB0eVN0YXRlRWwgPSBwYW5lbEVsLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiLm9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3MtZW1wdHlcIik7XG4gICAgaWYgKGVtcHR5U3RhdGVFbCkge1xuICAgICAgZW1wdHlTdGF0ZUVsLmNsYXNzTGlzdC50b2dnbGUoXCJpcy1oaWRkZW5cIiwgdmlzaWJsZUNvdW50ID4gMCk7XG4gICAgfVxuICB9XG5cbiAgcmVuZGVyQWN0aXZlU2VjdGlvbihjb250YWluZXJFbDogSFRNTEVsZW1lbnQpIHtcbiAgICBzd2l0Y2ggKHRoaXMuYWN0aXZlU2VjdGlvbikge1xuICAgICAgY2FzZSBcImdlbmVyYWxcIjpcbiAgICAgICAgdGhpcy5yZW5kZXJHZW5lcmFsU2V0dGluZ3MoY29udGFpbmVyRWwpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJyZW1vdGVcIjpcbiAgICAgICAgdGhpcy5yZW5kZXJSZW1vdGVTZXR0aW5ncyhjb250YWluZXJFbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInN5bmNcIjpcbiAgICAgICAgdGhpcy5yZW5kZXJTeW5jU2V0dGluZ3MoY29udGFpbmVyRWwpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJtZWRpYVwiOlxuICAgICAgICB0aGlzLnJlbmRlck1lZGlhU2V0dGluZ3MoY29udGFpbmVyRWwpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJkZWJ1Z1wiOlxuICAgICAgICB0aGlzLnJlbmRlckRlYnVnU2V0dGluZ3MoY29udGFpbmVyRWwpO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHJlbmRlclBhbmVsKHBhbmVsRWw6IEhUTUxFbGVtZW50KSB7XG4gICAgcGFuZWxFbC5lbXB0eSgpO1xuICAgIHRoaXMucmVuZGVyQWN0aXZlU2VjdGlvbihwYW5lbEVsKTtcbiAgICBwYW5lbEVsLmNyZWF0ZURpdih7XG4gICAgICBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1lbXB0eSBpcy1oaWRkZW5cIixcbiAgICAgIHRleHQ6IFwiXHU2Q0ExXHU2NzA5XHU1MzM5XHU5MTREXHU1MjMwXHU1RjUzXHU1MjREXHU3QjVCXHU5MDA5XHU2NzYxXHU0RUY2XHU3Njg0XHU4QkJFXHU3RjZFXHU5ODc5XHUzMDAyXCJcbiAgICB9KTtcbiAgICB0aGlzLmFwcGx5U2VhcmNoRmlsdGVyKHBhbmVsRWwpO1xuICB9XG5cbiAgZGlzcGxheSgpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xuICAgIGNvbnRhaW5lckVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCIub2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1yb290XCIpLmZvckVhY2goKGVsZW1lbnQpID0+IGVsZW1lbnQucmVtb3ZlKCkpO1xuICAgIHRoaXMucm9vdEVsID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcIm9ic2lkaWFuLWdpdC1zeW5jZXItc2V0dGluZ3Mtcm9vdFwiIH0pO1xuICAgIHRoaXMubmF2RWwgPSBudWxsO1xuICAgIHRoaXMucGFuZWxFbCA9IG51bGw7XG5cbiAgICB0aGlzLnJlbmRlclNlYXJjaEJhcih0aGlzLnJvb3RFbCk7XG4gICAgdGhpcy5yZW5kZXJTZWN0aW9uVGFicyh0aGlzLnJvb3RFbCk7XG5cbiAgICBjb25zdCBzZWN0aW9uRWwgPSB0aGlzLnJvb3RFbC5jcmVhdGVEaXYoeyBjbHM6IFwib2JzaWRpYW4tZ2l0LXN5bmNlci1zZXR0aW5ncy1wYW5lbFwiIH0pO1xuICAgIHRoaXMucGFuZWxFbCA9IHNlY3Rpb25FbDtcbiAgICB0aGlzLnJlbmRlclBhbmVsKHNlY3Rpb25FbCk7XG4gIH1cbn1cblxuY2xhc3MgRm9sZGVyU2VsZWN0TW9kYWwgZXh0ZW5kcyBGdXp6eVN1Z2dlc3RNb2RhbDxURm9sZGVyPiB7XG4gIHBsdWdpbjogT2JzaWRpYW5HaXRTeW5jZXJQbHVnaW47XG4gIG9uQ2hvb3NlRm9sZGVyOiAoZm9sZGVyOiBURm9sZGVyKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZDtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBhcHA6IEFwcCxcbiAgICBwbHVnaW46IE9ic2lkaWFuR2l0U3luY2VyUGx1Z2luLFxuICAgIG9uQ2hvb3NlRm9sZGVyOiAoZm9sZGVyOiBURm9sZGVyKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZFxuICApIHtcbiAgICBzdXBlcihhcHApO1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICAgIHRoaXMub25DaG9vc2VGb2xkZXIgPSBvbkNob29zZUZvbGRlcjtcbiAgICB0aGlzLnNldFBsYWNlaG9sZGVyKFwiXHU5MDA5XHU2MkU5IExvY2FsIFJvb3QgUGF0aCBcdTc2RUVcdTVGNTVcIik7XG4gIH1cblxuICBnZXRJdGVtcygpOiBURm9sZGVyW10ge1xuICAgIHJldHVybiB0aGlzLnBsdWdpbi5nZXRBbGxWYXVsdEZvbGRlcnMoKTtcbiAgfVxuXG4gIGdldEl0ZW1UZXh0KGZvbGRlcjogVEZvbGRlcik6IHN0cmluZyB7XG4gICAgcmV0dXJuIGZvbGRlci5wYXRoO1xuICB9XG5cbiAgYXN5bmMgb25DaG9vc2VJdGVtKGZvbGRlcjogVEZvbGRlcik6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMub25DaG9vc2VGb2xkZXIoZm9sZGVyKTtcbiAgfVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxzQkFjTztBQWdFUCxJQUFNLHNCQUFzQjtBQUU1QixJQUFNLG1CQUF1QztBQUFBLEVBQzNDLGVBQWU7QUFBQSxFQUNmLGdCQUFnQjtBQUFBLEVBQ2hCLGFBQWE7QUFBQSxFQUNiLFFBQVE7QUFBQSxFQUNSLGVBQWU7QUFDakI7QUFFQSxJQUFNLGVBQThCO0FBQUEsRUFDbEMsT0FBTyxDQUFDO0FBQ1Y7QUFFQSxJQUFNLHFCQUFOLGNBQWlDLE1BQU07QUFBQSxFQUdyQyxZQUFZLFFBQWdCLFNBQWlCO0FBQzNDLFVBQU0sT0FBTztBQUNiLFNBQUssU0FBUztBQUFBLEVBQ2hCO0FBQ0Y7QUFFQSxTQUFTLFdBQVcsT0FBdUI7QUFDekMsU0FBTyxNQUFNLFFBQVEsTUFBTSxLQUFLO0FBQ2xDO0FBRUEsU0FBUyxpQkFBaUIsU0FBaUU7QUFDekYsTUFBSSxDQUFDLFFBQVEsV0FBVyxPQUFPLEdBQUc7QUFDaEMsV0FBTyxFQUFFLE1BQU0sQ0FBQyxHQUFHLE1BQU0sUUFBUTtBQUFBLEVBQ25DO0FBRUEsUUFBTSxNQUFNLFFBQVEsUUFBUSxXQUFXLENBQUM7QUFDeEMsTUFBSSxRQUFRLElBQUk7QUFDZCxXQUFPLEVBQUUsTUFBTSxDQUFDLEdBQUcsTUFBTSxRQUFRO0FBQUEsRUFDbkM7QUFFQSxRQUFNLE1BQU0sUUFBUSxNQUFNLEdBQUcsR0FBRyxFQUFFLE1BQU0sSUFBSTtBQUM1QyxRQUFNLE9BQStCLENBQUM7QUFFdEMsYUFBVyxRQUFRLEtBQUs7QUFDdEIsVUFBTSxZQUFZLEtBQUssUUFBUSxHQUFHO0FBQ2xDLFFBQUksY0FBYyxJQUFJO0FBQ3BCO0FBQUEsSUFDRjtBQUVBLFVBQU0sTUFBTSxLQUFLLE1BQU0sR0FBRyxTQUFTLEVBQUUsS0FBSztBQUMxQyxVQUFNLFFBQVEsS0FBSyxNQUFNLFlBQVksQ0FBQyxFQUFFLEtBQUssRUFBRSxRQUFRLFVBQVUsRUFBRTtBQUNuRSxRQUFJLEtBQUs7QUFDUCxXQUFLLEdBQUcsSUFBSTtBQUFBLElBQ2Q7QUFBQSxFQUNGO0FBRUEsU0FBTyxFQUFFLE1BQU0sTUFBTSxRQUFRLE1BQU0sTUFBTSxDQUFDLEVBQUU7QUFDOUM7QUFFQSxTQUFTLGlCQUFpQixNQUFhLE9BQXdCO0FBQzdELFFBQU0sU0FBUSxvQkFBSSxLQUFLLEdBQUUsWUFBWSxFQUFFLE1BQU0sR0FBRyxFQUFFO0FBQ2xELFFBQU0sZ0JBQWdCLE9BQU8sS0FBSyxLQUFLLEtBQUs7QUFFNUMsU0FBTztBQUFBLElBQ0w7QUFBQSxJQUNBLFdBQVcsV0FBVyxhQUFhLENBQUM7QUFBQSxJQUNwQztBQUFBLElBQ0EsVUFBVSxLQUFLO0FBQUEsSUFDZixhQUFhLEtBQUs7QUFBQSxJQUNsQjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0YsRUFBRSxLQUFLLElBQUk7QUFDYjtBQUVBLFNBQVMsY0FBYyxPQUF1QjtBQUM1QyxTQUFPLE9BQU8sS0FBSyxFQUFFLFNBQVMsR0FBRyxHQUFHO0FBQ3RDO0FBRUEsU0FBUyxlQUFlLE9BQThCO0FBQ3BELFFBQU0sT0FBTyxPQUFPLFVBQVUsV0FBVyxJQUFJLEtBQUssS0FBSyxJQUFJO0FBRTNELE1BQUksT0FBTyxNQUFNLEtBQUssUUFBUSxDQUFDLEdBQUc7QUFDaEMsV0FBTyxPQUFPLFVBQVUsV0FBVyxRQUFRO0FBQUEsRUFDN0M7QUFFQSxTQUFPO0FBQUEsSUFDTCxHQUFHLEtBQUssWUFBWSxDQUFDLElBQUksY0FBYyxLQUFLLFNBQVMsSUFBSSxDQUFDLENBQUMsSUFBSSxjQUFjLEtBQUssUUFBUSxDQUFDLENBQUM7QUFBQSxJQUM1RixHQUFHLGNBQWMsS0FBSyxTQUFTLENBQUMsQ0FBQyxJQUFJLGNBQWMsS0FBSyxXQUFXLENBQUMsQ0FBQyxJQUFJLGNBQWMsS0FBSyxXQUFXLENBQUMsQ0FBQztBQUFBLEVBQzNHLEVBQUUsS0FBSyxHQUFHO0FBQ1o7QUFFQSxTQUFTLFlBQVksT0FBdUI7QUFDMUMsTUFBSSxPQUFPO0FBRVgsV0FBUyxRQUFRLEdBQUcsUUFBUSxNQUFNLFFBQVEsU0FBUyxHQUFHO0FBQ3BELFdBQVEsT0FBTyxLQUFLLE1BQU0sV0FBVyxLQUFLLElBQUs7QUFBQSxFQUNqRDtBQUVBLFNBQU8sSUFBSSxLQUFLLElBQUksSUFBSSxDQUFDO0FBQzNCO0FBRUEsU0FBUyxhQUFhLE9BQXVCO0FBQzNDLFFBQU0sUUFBUSxJQUFJLFlBQVksRUFBRSxPQUFPLEtBQUs7QUFDNUMsTUFBSSxTQUFTO0FBRWIsUUFBTSxRQUFRLENBQUMsU0FBUztBQUN0QixjQUFVLE9BQU8sYUFBYSxJQUFJO0FBQUEsRUFDcEMsQ0FBQztBQUVELFNBQU8sS0FBSyxNQUFNO0FBQ3BCO0FBRUEsU0FBUyxtQkFBbUIsT0FBa0M7QUFDNUQsUUFBTSxhQUFhLE1BQU0sS0FBSyxFQUFFLFFBQVEsT0FBTyxFQUFFLEVBQUUsUUFBUSxVQUFVLEVBQUU7QUFDdkUsUUFBTSxhQUFhLDZDQUE2QyxLQUFLLFVBQVU7QUFDL0UsUUFBTSxXQUFXLHFDQUFxQyxLQUFLLFVBQVU7QUFDckUsUUFBTSxpQkFBaUIseUJBQXlCLEtBQUssVUFBVTtBQUMvRCxRQUFNLFFBQVEsY0FBYyxZQUFZO0FBRXhDLE1BQUksQ0FBQyxPQUFPO0FBQ1YsV0FBTztBQUFBLEVBQ1Q7QUFFQSxTQUFPO0FBQUEsSUFDTCxPQUFPLE1BQU0sQ0FBQztBQUFBLElBQ2QsTUFBTSxNQUFNLENBQUM7QUFBQSxFQUNmO0FBQ0Y7QUFFQSxTQUFTLGlCQUFpQixNQUFzQjtBQUM5QyxTQUFPLEtBQUssTUFBTSxHQUFHLEVBQUUsSUFBSSxrQkFBa0IsRUFBRSxLQUFLLEdBQUc7QUFDekQ7QUFFQSxTQUFTLGtCQUFrQixNQUF1QjtBQUNoRCxRQUFNLGlCQUFhLCtCQUFjLElBQUksRUFBRSxRQUFRLFFBQVEsRUFBRTtBQUN6RCxRQUFNLFdBQVcsV0FBVyxNQUFNLEdBQUc7QUFDckMsU0FBTyxXQUFXLFdBQVcsR0FBRyxtQkFBbUIsR0FBRyxLQUFLLENBQUMsU0FBUyxLQUFLLENBQUMsWUFBWSxZQUFZLFFBQVEsWUFBWSxFQUFFO0FBQzNIO0FBRUEsU0FBUyxjQUFjLFFBQTBDO0FBQy9ELFVBQVEsUUFBUTtBQUFBLElBQ2QsS0FBSztBQUNILGFBQU87QUFBQSxJQUNULEtBQUs7QUFDSCxhQUFPO0FBQUEsSUFDVCxLQUFLO0FBQ0gsYUFBTztBQUFBLElBQ1QsS0FBSztBQUNILGFBQU87QUFBQSxJQUNULEtBQUs7QUFBQSxJQUNMO0FBQ0UsYUFBTztBQUFBLEVBQ1g7QUFDRjtBQUVBLFNBQVMsY0FBYyxRQUEwQztBQUMvRCxVQUFRLFFBQVE7QUFBQSxJQUNkLEtBQUs7QUFDSCxhQUFPO0FBQUEsSUFDVCxLQUFLO0FBQ0gsYUFBTztBQUFBLElBQ1QsS0FBSztBQUNILGFBQU87QUFBQSxJQUNULEtBQUs7QUFDSCxhQUFPO0FBQUEsSUFDVCxLQUFLO0FBQUEsSUFDTDtBQUNFLGFBQU87QUFBQSxFQUNYO0FBQ0Y7QUFFQSxTQUFTLGFBQWEsUUFBMEM7QUFDOUQsVUFBUSxRQUFRO0FBQUEsSUFDZCxLQUFLO0FBQ0gsYUFBTztBQUFBLElBQ1QsS0FBSztBQUNILGFBQU87QUFBQSxJQUNULEtBQUs7QUFDSCxhQUFPO0FBQUEsSUFDVCxLQUFLO0FBQ0gsYUFBTztBQUFBLElBQ1QsS0FBSztBQUFBLElBQ0w7QUFDRSxhQUFPO0FBQUEsRUFDWDtBQUNGO0FBRUEsSUFBcUIsMEJBQXJCLGNBQXFELHVCQUFPO0FBQUEsRUFBNUQ7QUFBQTtBQUNFLG9CQUErQjtBQUMvQixnQkFBc0I7QUFBQTtBQUFBLEVBS3RCLE1BQU0sU0FBUztBQUNiLFVBQU0sS0FBSyxhQUFhO0FBRXhCLFNBQUssY0FBYyxjQUFjLHVCQUF1QixDQUFDLFFBQVE7QUFDL0QsV0FBSyxlQUFlLEdBQUc7QUFBQSxJQUN6QixDQUFDO0FBRUQsU0FBSyxjQUFjLEtBQUssaUJBQWlCO0FBQ3pDLFNBQUssWUFBWSxTQUFTLDRCQUE0QjtBQUN0RCxTQUFLLGtCQUFrQixLQUFLLFlBQVksV0FBVyxFQUFFLEtBQUssa0NBQWtDLENBQUM7QUFDN0YsU0FBSyxrQkFBa0IsS0FBSyxZQUFZLFdBQVcsRUFBRSxLQUFLLGtDQUFrQyxDQUFDO0FBQzdGLFNBQUssY0FBYyxJQUFJLG9CQUFvQixLQUFLLEtBQUssSUFBSSxDQUFDO0FBRTFELFNBQUssY0FBYyxLQUFLLElBQUksVUFBVSxHQUFHLGFBQWEsTUFBTSxLQUFLLEtBQUssaUJBQWlCLENBQUMsQ0FBQztBQUN6RixTQUFLO0FBQUEsTUFDSCxLQUFLLElBQUksTUFBTSxHQUFHLFVBQVUsQ0FBQyxTQUFTO0FBQ3BDLFlBQUksZ0JBQWdCLHlCQUFTLFNBQVMsS0FBSyxlQUFlLEdBQUc7QUFDM0QsZUFBSyxLQUFLLGlCQUFpQjtBQUFBLFFBQzdCO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDSDtBQUNBLFNBQUs7QUFBQSxNQUNILEtBQUssSUFBSSxVQUFVLEdBQUcsZUFBZSxDQUFDLFNBQVM7QUFDN0MsY0FBTSxPQUFPLEtBQUssZUFBZTtBQUNqQyxZQUFJLENBQUMsTUFBTTtBQUNUO0FBQUEsUUFDRjtBQUVBLGFBQUssMkJBQTJCLE1BQU0sSUFBSTtBQUFBLE1BQzVDLENBQUM7QUFBQSxJQUNIO0FBRUEsVUFBTSxLQUFLLGlCQUFpQjtBQUFBLEVBQzlCO0FBQUEsRUFFQSxNQUFNLGVBQWU7QUFDbkIsVUFBTSxRQUFTLE1BQU0sS0FBSyxTQUFTO0FBQ25DLFNBQUssV0FBVyxFQUFFLEdBQUcsa0JBQWtCLEdBQUksT0FBTyxZQUFZLENBQUMsRUFBRztBQUNsRSxTQUFLLE9BQU8sRUFBRSxHQUFHLGNBQWMsR0FBSSxPQUFPLFFBQVEsQ0FBQyxFQUFHO0FBQUEsRUFDeEQ7QUFBQSxFQUVBLE1BQU0sY0FBYztBQUNsQixVQUFNLEtBQUssU0FBUztBQUFBLE1BQ2xCLFVBQVUsS0FBSztBQUFBLE1BQ2YsTUFBTSxLQUFLO0FBQUEsSUFDYixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsTUFBTSxlQUFlO0FBQ25CLFVBQU0sS0FBSyxZQUFZO0FBQUEsRUFDekI7QUFBQSxFQUVBLGdCQUE0QjtBQUMxQixVQUFNLGFBQWEsbUJBQW1CLEtBQUssU0FBUyxhQUFhO0FBQ2pFLFFBQUksQ0FBQyxZQUFZO0FBQ2YsWUFBTSxJQUFJLE1BQU0sOEtBQW1HO0FBQUEsSUFDckg7QUFFQSxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBRUEsaUJBQWlCO0FBQ2YsU0FBSyxjQUFjO0FBRW5CLFFBQUksQ0FBQyxLQUFLLFNBQVMsZUFBZSxLQUFLLEdBQUc7QUFDeEMsWUFBTSxJQUFJLE1BQU0sZ0RBQXVCO0FBQUEsSUFDekM7QUFFQSxRQUFJLENBQUMsS0FBSyxTQUFTLFlBQVksS0FBSyxHQUFHO0FBQ3JDLFlBQU0sSUFBSSxNQUFNLDZDQUFvQjtBQUFBLElBQ3RDO0FBRUEsUUFBSSxDQUFDLEtBQUssU0FBUyxPQUFPLEtBQUssR0FBRztBQUNoQyxZQUFNLElBQUksTUFBTSx3REFBVztBQUFBLElBQzdCO0FBQUEsRUFDRjtBQUFBLEVBRUEsa0JBQWtCLE1BQThCO0FBQzlDLFVBQU0saUJBQWEsK0JBQWMsSUFBSSxFQUFFLFFBQVEsT0FBTyxFQUFFO0FBQ3hELFVBQU0sU0FBUyxLQUFLLElBQUksTUFBTSxzQkFBc0IsVUFBVTtBQUM5RCxXQUFPLGtCQUFrQiwwQkFBVSxTQUFTO0FBQUEsRUFDOUM7QUFBQSxFQUVBLHFCQUFnQztBQUM5QixVQUFNLFVBQXFCLENBQUM7QUFFNUIsU0FBSyxJQUFJLE1BQU0sa0JBQWtCLEVBQUUsUUFBUSxDQUFDLFVBQVU7QUFDcEQsVUFBSSxpQkFBaUIsMkJBQVcsTUFBTSxNQUFNO0FBQzFDLGdCQUFRLEtBQUssS0FBSztBQUFBLE1BQ3BCO0FBQUEsSUFDRixDQUFDO0FBRUQsV0FBTyxRQUFRLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxLQUFLLGNBQWMsRUFBRSxNQUFNLE9BQU8sQ0FBQztBQUFBLEVBQ3JFO0FBQUEsRUFFQSxNQUFNLGlCQUFpQixNQUFjO0FBQ25DLFVBQU0saUJBQWEsK0JBQWMsS0FBSyxLQUFLLENBQUMsRUFBRSxRQUFRLE9BQU8sRUFBRTtBQUUvRCxRQUFJLENBQUMsWUFBWTtBQUNmLFlBQU0sSUFBSSxNQUFNLGdEQUF1QjtBQUFBLElBQ3pDO0FBRUEsVUFBTSxTQUFTLEtBQUssa0JBQWtCLFVBQVU7QUFDaEQsUUFBSSxDQUFDLFFBQVE7QUFDWCxZQUFNLElBQUksTUFBTSwrR0FBMEI7QUFBQSxJQUM1QztBQUVBLFNBQUssU0FBUyxnQkFBZ0IsT0FBTztBQUNyQyxVQUFNLEtBQUssYUFBYTtBQUFBLEVBQzFCO0FBQUEsRUFFQSxpQkFBK0I7QUFDN0IsVUFBTSxPQUFPLEtBQUssSUFBSSxVQUFVLGNBQWM7QUFDOUMsV0FBTyxnQkFBZ0IseUJBQVMsS0FBSyxjQUFjLE9BQU8sT0FBTztBQUFBLEVBQ25FO0FBQUEsRUFFQSxhQUFhLE1BQXNCO0FBQ2pDLFVBQU0sV0FBTywrQkFBYyxLQUFLLFNBQVMsYUFBYSxFQUFFLFFBQVEsT0FBTyxFQUFFO0FBQ3pFLFdBQU8sS0FBSyxTQUFTLFFBQVEsS0FBSyxLQUFLLFdBQVcsR0FBRyxJQUFJLEdBQUc7QUFBQSxFQUM5RDtBQUFBLEVBRUEsYUFBYSxNQUFxQjtBQUNoQyxVQUFNLFdBQU8sK0JBQWMsS0FBSyxTQUFTLGFBQWEsRUFBRSxRQUFRLE9BQU8sRUFBRTtBQUN6RSxVQUFNLGVBQVcsK0JBQWMsS0FBSyxJQUFJO0FBRXhDLFFBQUksYUFBYSxNQUFNO0FBQ3JCLGFBQU87QUFBQSxJQUNUO0FBRUEsUUFBSSxTQUFTLFdBQVcsR0FBRyxJQUFJLEdBQUcsR0FBRztBQUNuQyxhQUFPLFNBQVMsTUFBTSxLQUFLLFNBQVMsQ0FBQztBQUFBLElBQ3ZDO0FBRUEsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVBLFdBQVcsTUFBcUI7QUFDOUIsVUFBTSxlQUFXLCtCQUFjLEtBQUssYUFBYSxJQUFJLENBQUMsRUFBRSxRQUFRLFFBQVEsRUFBRTtBQUMxRSxVQUFNLFdBQU8sK0JBQWMsR0FBRyxtQkFBbUIsSUFBSSxRQUFRLEVBQUUsRUFBRSxRQUFRLFFBQVEsRUFBRTtBQUVuRixRQUFJLENBQUMsWUFBWSxDQUFDLGtCQUFrQixJQUFJLEdBQUc7QUFDekMsWUFBTSxJQUFJLE1BQU0sK0ZBQXlCO0FBQUEsSUFDM0M7QUFFQSxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBRUEsU0FBUyxNQUE2QjtBQUNwQyxXQUFPLEtBQUssS0FBSyxNQUFNLEtBQUssSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRO0FBQUEsRUFDekQ7QUFBQSxFQUVBLE1BQU0sb0JBQW9CLE1BQWEsT0FBdUI7QUFDNUQsVUFBTSxVQUFVLEtBQUssS0FBSyxNQUFNLEtBQUssSUFBSTtBQUV6QyxRQUNFLFNBQVMsZUFBZSxNQUFNLGNBQzlCLFNBQVMsUUFBUSxNQUFNLE9BQ3ZCLFNBQVMsV0FBVyxNQUFNLFVBQzFCLFNBQVMsaUJBQWlCLE1BQU0sZ0JBQ2hDLFNBQVMsbUJBQW1CLE1BQU0sa0JBQ2xDLFNBQVMsWUFBWSxNQUFNLFNBQzNCO0FBQ0E7QUFBQSxJQUNGO0FBRUEsU0FBSyxLQUFLLE1BQU0sS0FBSyxJQUFJLElBQUk7QUFDN0IsVUFBTSxLQUFLLFlBQVk7QUFBQSxFQUN6QjtBQUFBLEVBRUEsTUFBTSxrQkFBa0IsTUFBc0M7QUFDNUQsUUFBSSxRQUFRLEtBQUssU0FBUyxJQUFJO0FBRTlCLFFBQUk7QUFDRixjQUFRLE1BQU0sS0FBSyxjQUFjLElBQUk7QUFBQSxJQUN2QyxRQUFRO0FBQUEsSUFFUjtBQUVBLFFBQUksTUFBTSxXQUFXLFlBQVksQ0FBQyxNQUFNLGdCQUFnQjtBQUN0RCxhQUFPO0FBQUEsSUFDVDtBQUVBLFVBQU0sVUFBVSxNQUFNLEtBQUssSUFBSSxNQUFNLEtBQUssSUFBSTtBQUM5QyxVQUFNLGNBQWMsWUFBWSxPQUFPO0FBRXZDLFFBQUksZ0JBQWdCLE1BQU0sZ0JBQWdCO0FBQ3hDLFlBQU0sWUFBWSxFQUFFLEdBQUcsT0FBTyxRQUFRLFdBQW9CO0FBQzFELFlBQU0sS0FBSyxvQkFBb0IsTUFBTSxTQUFTO0FBQzlDLGFBQU87QUFBQSxJQUNUO0FBRUEsVUFBTSxLQUFLLG9CQUFvQixNQUFNLEtBQUs7QUFDMUMsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVBLE1BQU0sU0FBUyxNQUFhLE9BQWdDO0FBQzFELFNBQUssS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLEVBQUUsR0FBRyxLQUFLLFNBQVMsSUFBSSxHQUFHLEdBQUcsTUFBTTtBQUNoRSxVQUFNLEtBQUssWUFBWTtBQUN2QixVQUFNLEtBQUssaUJBQWlCO0FBQUEsRUFDOUI7QUFBQSxFQUVBLGtCQUFrQixhQUE0QjtBQUM1QyxTQUFLLFlBQVksWUFBWSxZQUFZLGFBQWEsZUFBZSxjQUFjLGFBQWEsYUFBYTtBQUU3RyxRQUFJLGFBQWE7QUFDZixXQUFLLFlBQVksU0FBUyxXQUFXO0FBQUEsSUFDdkM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLG1CQUFtQjtBQUN2QixVQUFNLE9BQU8sS0FBSyxlQUFlO0FBRWpDLFFBQUksQ0FBQyxNQUFNO0FBQ1QsV0FBSyxrQkFBa0IsYUFBYTtBQUNwQyxtQ0FBUSxLQUFLLGlCQUFpQixZQUFZO0FBQzFDLFdBQUssZ0JBQWdCLFFBQVEsZ0NBQU87QUFDcEM7QUFBQSxJQUNGO0FBRUEsUUFBSSxDQUFDLEtBQUssYUFBYSxJQUFJLEdBQUc7QUFDNUIsV0FBSyxrQkFBa0IsYUFBYTtBQUNwQyxtQ0FBUSxLQUFLLGlCQUFpQixZQUFZO0FBQzFDLFdBQUssZ0JBQWdCLFFBQVEsc0NBQVE7QUFDckM7QUFBQSxJQUNGO0FBRUEsVUFBTSxRQUFRLE1BQU0sS0FBSyxrQkFBa0IsSUFBSTtBQUMvQyxVQUFNLFFBQVEsY0FBYyxNQUFNLE1BQU07QUFDeEMsU0FBSyxrQkFBa0IsY0FBYyxNQUFNLE1BQU0sQ0FBQztBQUVsRCxpQ0FBUSxLQUFLLGlCQUFpQixhQUFhLE1BQU0sTUFBTSxDQUFDO0FBQ3hELFNBQUssZ0JBQWdCLFFBQVEsS0FBSztBQUFBLEVBQ3BDO0FBQUEsRUFFQSxNQUFNLDBCQUEwQixNQUFhO0FBQzNDLFFBQUksQ0FBQyxLQUFLLGFBQWEsSUFBSSxHQUFHO0FBQzVCLFlBQU0sSUFBSSxNQUFNLG1FQUEyQjtBQUFBLElBQzdDO0FBRUEsVUFBTSxVQUFVLE1BQU0sS0FBSyxJQUFJLE1BQU0sS0FBSyxJQUFJO0FBQzlDLFVBQU0sU0FBUyxpQkFBaUIsT0FBTztBQUV2QyxRQUFJLE9BQU8sS0FBSyxPQUFPLElBQUksRUFBRSxTQUFTLEdBQUc7QUFDdkMsVUFBSSx1QkFBTyxnRkFBZTtBQUMxQjtBQUFBLElBQ0Y7QUFFQSxVQUFNLGNBQWMsR0FBRyxpQkFBaUIsSUFBSSxDQUFDLEdBQUcsT0FBTztBQUN2RCxVQUFNLEtBQUssSUFBSSxNQUFNLE9BQU8sTUFBTSxXQUFXO0FBQzdDLFFBQUksdUJBQU8sa0RBQVU7QUFBQSxFQUN2QjtBQUFBLEVBRUEsaUJBQWlCLE9BQStCO0FBQzlDLFlBQVEsTUFBTSxRQUFRO0FBQUEsTUFDcEIsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUNILGVBQU87QUFBQSxNQUNULEtBQUs7QUFDSCxlQUFPO0FBQUEsTUFDVCxLQUFLO0FBQ0gsZUFBTztBQUFBLE1BQ1QsS0FBSztBQUFBLE1BQ0w7QUFDRSxlQUFPO0FBQUEsSUFDWDtBQUFBLEVBQ0Y7QUFBQSxFQUVBLG1CQUFtQixNQUFhLE9BQXVCLGVBQThDO0FBQ25HLFVBQU0sU0FBUyxLQUFLLGFBQWEsSUFBSTtBQUNyQyxVQUFNLFlBQVksS0FBSyxpQkFBaUIsS0FBSztBQUU3QyxXQUFPO0FBQUEsTUFDTDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLFNBQVMsVUFBVSxNQUFNLFdBQVc7QUFBQSxNQUNwQyxpQkFBaUIsUUFBUSxNQUFNLEdBQUcsS0FBSyxNQUFNLFdBQVc7QUFBQSxNQUN4RCxlQUFlLFFBQVEsTUFBTSxXQUFXLE1BQU0sVUFBVSxLQUFLLE1BQU0sV0FBVztBQUFBLE1BQzlFLHFCQUFxQixVQUFVLENBQUM7QUFBQSxJQUNsQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0saUJBQWlCLE1BQTRDO0FBQ2pFLFVBQU0sQ0FBQyxPQUFPLE9BQU8sSUFBSSxNQUFNLFFBQVEsSUFBSSxDQUFDLEtBQUssa0JBQWtCLElBQUksR0FBRyxLQUFLLElBQUksTUFBTSxLQUFLLElBQUksQ0FBQyxDQUFDO0FBQ3BHLFVBQU0sYUFBYSxpQkFBaUIsT0FBTyxFQUFFO0FBQzdDLFdBQU8sS0FBSyxtQkFBbUIsTUFBTSxPQUFPLE9BQU8sS0FBSyxVQUFVLEVBQUUsU0FBUyxDQUFDO0FBQUEsRUFDaEY7QUFBQSxFQUVBLHVCQUF1QixNQUFtQztBQUN4RCxVQUFNLGFBQWEsS0FBSyxJQUFJLGNBQWMsYUFBYSxJQUFJLEdBQUcsZUFBZSxDQUFDO0FBQzlFLFVBQU0sUUFBUSxLQUFLLFNBQVMsSUFBSTtBQUNoQyxXQUFPLEtBQUssbUJBQW1CLE1BQU0sT0FBTyxPQUFPLEtBQUssVUFBVSxFQUFFLFNBQVMsQ0FBQztBQUFBLEVBQ2hGO0FBQUEsRUFFQSxNQUFNLGVBQWUsS0FBaUI7QUFDcEMsVUFBTSxPQUFPLElBQUkscUJBQUs7QUFDdEIsVUFBTSxjQUFjLEtBQUssZUFBZTtBQUN4QyxVQUFNLFVBQVUsY0FBYyxNQUFNLEtBQUssaUJBQWlCLFdBQVcsSUFBSTtBQUV6RSxTQUFLLGlCQUFpQixJQUFJO0FBQzFCLFNBQUs7QUFBQSxNQUFRLENBQUMsU0FDWixLQUNHLFNBQVMsU0FBUyxhQUFhLDJCQUFZLEVBQzNDLFFBQVEsY0FBYyxFQUN0QixZQUFZLENBQUMsU0FBUyxPQUFPLEVBQzdCLFFBQVEsTUFBTTtBQUNiLFlBQUksU0FBUztBQUNYLGVBQUssS0FBSyxjQUFjLE1BQU0sS0FBSyxpQkFBaUIsUUFBUSxJQUFJLENBQUM7QUFBQSxRQUNuRTtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0w7QUFDQSxTQUFLO0FBQUEsTUFBUSxDQUFDLFNBQ1osS0FDRyxTQUFTLHFCQUFXLEVBQ3BCLFFBQVEsZUFBZSxFQUN2QixZQUFZLENBQUMsU0FBUyxhQUFhLEVBQ25DLFFBQVEsTUFBTTtBQUNiLFlBQUksU0FBUztBQUNYLGVBQUssS0FBSyxjQUFjLE1BQU0sS0FBSyxxQkFBcUIsUUFBUSxJQUFJLENBQUM7QUFBQSxRQUN2RTtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0w7QUFDQSxTQUFLO0FBQUEsTUFBUSxDQUFDLFNBQ1osS0FDRyxTQUFTLGNBQUksRUFDYixRQUFRLFlBQVksRUFDcEIsWUFBWSxDQUFDLE9BQU8sRUFDcEIsUUFBUSxNQUFNLEtBQUssZ0JBQWdCLFNBQVMsSUFBSSxDQUFDO0FBQUEsSUFDdEQ7QUFDQSxTQUFLO0FBQUEsTUFBUSxDQUFDLFNBQ1osS0FDRyxTQUFTLHNDQUFRLEVBQ2pCLFFBQVEsYUFBYSxFQUNyQixZQUFZLENBQUMsU0FBUyxtQkFBbUIsRUFDekMsUUFBUSxNQUFNO0FBQ2IsWUFBSSxTQUFTO0FBQ1gsZUFBSyxLQUFLLGNBQWMsTUFBTSxLQUFLLDBCQUEwQixRQUFRLElBQUksQ0FBQztBQUFBLFFBQzVFO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDTDtBQUNBLFNBQUssYUFBYTtBQUNsQixTQUFLO0FBQUEsTUFBUSxDQUFDLFNBQ1osS0FDRyxTQUFTLFNBQVMsTUFBTSxXQUFXLFlBQVksbUNBQVUsc0NBQVEsRUFDakUsUUFBUSxXQUFXLEVBQ25CLFdBQVcsSUFBSSxFQUNmLFlBQVksQ0FBQyxTQUFTLGVBQWUsRUFDckMsUUFBUSxNQUFNO0FBQ2IsWUFBSSxTQUFTO0FBQ1gsZUFBSyxLQUFLLGNBQWMsTUFBTSxLQUFLLGlCQUFpQixRQUFRLElBQUksQ0FBQztBQUFBLFFBQ25FO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDTDtBQUNBLFNBQUssYUFBYTtBQUNsQixTQUFLO0FBQUEsTUFBUSxDQUFDLFNBQ1osS0FDRyxTQUFTLGtDQUFjLEVBQ3ZCLFFBQVEsT0FBTyxFQUNmLFFBQVEsTUFBTSxLQUFLLEtBQUssY0FBYyxNQUFNLEtBQUssZUFBZSxDQUFDLENBQUM7QUFBQSxJQUN2RTtBQUNBLFNBQUs7QUFBQSxNQUFRLENBQUMsU0FDWixLQUNHLFNBQVMsY0FBSSxFQUNiLFFBQVEsVUFBVSxFQUNsQixRQUFRLE1BQU0sS0FBSyxtQkFBbUIsQ0FBQztBQUFBLElBQzVDO0FBQ0EsU0FBSztBQUFBLE1BQVEsQ0FBQyxTQUNaLEtBQ0csU0FBUyxpQkFBTyxLQUFLLFNBQVMsT0FBTyxFQUFFLEVBQ3ZDLFFBQVEsTUFBTSxFQUNkLFFBQVEsTUFBTSxLQUFLLGdCQUFnQixDQUFDO0FBQUEsSUFDekM7QUFDQSxTQUFLLGlCQUFpQixHQUFHO0FBQUEsRUFDM0I7QUFBQSxFQUVBLDJCQUEyQixNQUFZLE1BQWE7QUFDbEQsVUFBTSxVQUFVLEtBQUssdUJBQXVCLElBQUk7QUFFaEQsU0FBSyxhQUFhO0FBQ2xCLFNBQUs7QUFBQSxNQUFRLENBQUMsU0FDWixLQUNHLFNBQVMsUUFBUSxTQUFTLEVBQzFCLFFBQVEsY0FBYyxFQUN0QixZQUFZLENBQUMsUUFBUSxPQUFPLEVBQzVCLFFBQVEsTUFBTSxLQUFLLEtBQUssY0FBYyxNQUFNLEtBQUssaUJBQWlCLFFBQVEsSUFBSSxDQUFDLENBQUM7QUFBQSxJQUNyRjtBQUNBLFNBQUs7QUFBQSxNQUFRLENBQUMsU0FDWixLQUNHLFNBQVMscUJBQVcsRUFDcEIsUUFBUSxlQUFlLEVBQ3ZCLFlBQVksQ0FBQyxRQUFRLGFBQWEsRUFDbEMsUUFBUSxNQUFNLEtBQUssS0FBSyxjQUFjLE1BQU0sS0FBSyxxQkFBcUIsUUFBUSxJQUFJLENBQUMsQ0FBQztBQUFBLElBQ3pGO0FBQ0EsU0FBSztBQUFBLE1BQVEsQ0FBQyxTQUNaLEtBQ0csU0FBUyxjQUFJLEVBQ2IsUUFBUSxZQUFZLEVBQ3BCLFFBQVEsTUFBTSxLQUFLLGdCQUFnQixRQUFRLElBQUksQ0FBQztBQUFBLElBQ3JEO0FBQ0EsU0FBSztBQUFBLE1BQVEsQ0FBQyxTQUNaLEtBQ0csU0FBUyxzQ0FBUSxFQUNqQixRQUFRLGFBQWEsRUFDckIsWUFBWSxDQUFDLFFBQVEsbUJBQW1CLEVBQ3hDLFFBQVEsTUFBTSxLQUFLLEtBQUssY0FBYyxNQUFNLEtBQUssMEJBQTBCLFFBQVEsSUFBSSxDQUFDLENBQUM7QUFBQSxJQUM5RjtBQUNBLFNBQUssYUFBYTtBQUNsQixTQUFLO0FBQUEsTUFBUSxDQUFDLFNBQ1osS0FDRyxTQUFTLFFBQVEsTUFBTSxXQUFXLFlBQVksbUNBQVUsc0NBQVEsRUFDaEUsUUFBUSxXQUFXLEVBQ25CLFdBQVcsSUFBSSxFQUNmLFlBQVksQ0FBQyxRQUFRLGVBQWUsRUFDcEMsUUFBUSxNQUFNLEtBQUssS0FBSyxjQUFjLE1BQU0sS0FBSyxpQkFBaUIsUUFBUSxJQUFJLENBQUMsQ0FBQztBQUFBLElBQ3JGO0FBQUEsRUFDRjtBQUFBLEVBRUEsZ0JBQWdCLE1BQXFCO0FBQ25DLFFBQUkscUJBQXFCLEtBQUssS0FBSyxNQUFNLFFBQVEsS0FBSyxlQUFlLENBQUMsRUFBRSxLQUFLO0FBQUEsRUFDL0U7QUFBQSxFQUVBLHFCQUFxQjtBQUNuQixVQUFNLGNBQWMsS0FBSztBQU96QixRQUFJLENBQUMsWUFBWSxTQUFTO0FBQ3hCLFVBQUksdUJBQU8sa0dBQWtCO0FBQzdCO0FBQUEsSUFDRjtBQUVBLGdCQUFZLFFBQVEsS0FBSztBQUN6QixnQkFBWSxRQUFRLGNBQWMsS0FBSyxTQUFTLEVBQUU7QUFBQSxFQUNwRDtBQUFBLEVBRUEsa0JBQWtCO0FBQ2hCLFFBQUksbUJBQW1CLEtBQUssS0FBSyxJQUFJLEVBQUUsS0FBSztBQUFBLEVBQzlDO0FBQUEsRUFFQSxNQUFNLGNBQWMsUUFBNkI7QUFDL0MsUUFBSTtBQUNGLFlBQU0sT0FBTztBQUFBLElBQ2YsU0FBUyxPQUFPO0FBQ2QsWUFBTSxVQUFVLGlCQUFpQixRQUFRLE1BQU0sVUFBVTtBQUN6RCxVQUFJLHVCQUFPLE9BQU87QUFBQSxJQUNwQjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLGtCQUFrQixNQUFjLFFBQXFEO0FBQ25GLFVBQU0sTUFBTSxJQUFJLElBQUkseUJBQXlCLElBQUksRUFBRTtBQUVuRCxXQUFPLFFBQVEsVUFBVSxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQyxLQUFLLEtBQUssTUFBTTtBQUNyRCxVQUFJLE9BQU87QUFDVCxZQUFJLGFBQWEsSUFBSSxLQUFLLEtBQUs7QUFBQSxNQUNqQztBQUFBLElBQ0YsQ0FBQztBQUVELFdBQU8sSUFBSSxTQUFTO0FBQUEsRUFDdEI7QUFBQSxFQUVBLG9CQUFvQixZQUE0QjtBQUM5QyxVQUFNLGFBQWEsS0FBSyxjQUFjO0FBQ3RDLFdBQU8sVUFBVSxtQkFBbUIsV0FBVyxLQUFLLENBQUMsSUFBSSxtQkFBbUIsV0FBVyxJQUFJLENBQUMsYUFBYSxpQkFBaUIsVUFBVSxDQUFDO0FBQUEsRUFDdkk7QUFBQSxFQUVBLG1CQUEyQjtBQUN6QixVQUFNLGFBQWEsS0FBSyxjQUFjO0FBQ3RDLFdBQU8sVUFBVSxtQkFBbUIsV0FBVyxLQUFLLENBQUMsSUFBSSxtQkFBbUIsV0FBVyxJQUFJLENBQUM7QUFBQSxFQUM5RjtBQUFBLEVBRUEscUJBQTZCO0FBQzNCLFdBQU8sR0FBRyxLQUFLLGlCQUFpQixDQUFDLGFBQWEsbUJBQW1CLEtBQUssU0FBUyxPQUFPLEtBQUssQ0FBQyxDQUFDO0FBQUEsRUFDL0Y7QUFBQSxFQUVBLG1CQUFtQixZQUE0QjtBQUM3QyxVQUFNLGFBQWEsS0FBSyxjQUFjO0FBQ3RDLFdBQU8sc0JBQXNCLFdBQVcsS0FBSyxJQUFJLFdBQVcsSUFBSSxTQUFTLG1CQUFtQixLQUFLLFNBQVMsT0FBTyxLQUFLLENBQUMsQ0FBQyxJQUFJLGlCQUFpQixVQUFVLENBQUM7QUFBQSxFQUMxSjtBQUFBLEVBRUEsTUFBTSxjQUNKLFFBQ0EsTUFDQSxTQUNBLFFBQ29CO0FBQ3BCLFVBQU0sV0FBVyxVQUFNLDRCQUFXO0FBQUEsTUFDaEMsS0FBSyxLQUFLLGtCQUFrQixNQUFNLE1BQU07QUFBQSxNQUN4QztBQUFBLE1BQ0EsU0FBUztBQUFBLFFBQ1AsUUFBUTtBQUFBLFFBQ1IsZUFBZSxVQUFVLEtBQUssU0FBUyxZQUFZLEtBQUssQ0FBQztBQUFBLFFBQ3pELGdCQUFnQjtBQUFBLFFBQ2hCLHdCQUF3QjtBQUFBLE1BQzFCO0FBQUEsTUFDQSxNQUFNLFVBQVUsS0FBSyxVQUFVLE9BQU8sSUFBSTtBQUFBLElBQzVDLENBQUM7QUFFRCxRQUFJLFNBQVMsVUFBVSxLQUFLO0FBQzFCLFVBQUksZUFBZSxTQUFTO0FBRTVCLFVBQUk7QUFDRixjQUFNLFNBQVMsS0FBSyxNQUFNLFNBQVMsSUFBSTtBQUN2QyxZQUFJLE9BQU8sU0FBUztBQUNsQix5QkFBZSxPQUFPO0FBQUEsUUFDeEI7QUFBQSxNQUNGLFFBQVE7QUFBQSxNQUVSO0FBRUEsWUFBTSxJQUFJLG1CQUFtQixTQUFTLFFBQVEsZ0JBQWdCLGVBQWUsU0FBUyxNQUFNLEVBQUU7QUFBQSxJQUNoRztBQUVBLFdBQU8sU0FBUztBQUFBLEVBQ2xCO0FBQUEsRUFFQSxNQUFNLGlCQUFpQixZQUEyRDtBQUNoRixRQUFJLENBQUMsa0JBQWtCLFVBQVUsR0FBRztBQUNsQyxZQUFNLElBQUksTUFBTSwrRkFBeUI7QUFBQSxJQUMzQztBQUVBLFFBQUk7QUFDRixZQUFNLFNBQVMsTUFBTSxLQUFLO0FBQUEsUUFDeEI7QUFBQSxRQUNBLEtBQUssb0JBQW9CLFVBQVU7QUFBQSxRQUNuQztBQUFBLFFBQ0EsRUFBRSxLQUFLLEtBQUssU0FBUyxPQUFPLEtBQUssRUFBRTtBQUFBLE1BQ3JDO0FBRUEsVUFBSSxNQUFNLFFBQVEsTUFBTSxHQUFHO0FBQ3pCLGNBQU0sSUFBSSxNQUFNLDBIQUFzQjtBQUFBLE1BQ3hDO0FBRUEsVUFBSSxPQUFPLFNBQVMsUUFBUTtBQUMxQixjQUFNLElBQUksTUFBTSxzSUFBd0I7QUFBQSxNQUMxQztBQUVBLGFBQU87QUFBQSxJQUNULFNBQVMsT0FBTztBQUNkLFVBQUksaUJBQWlCLHNCQUFzQixNQUFNLFdBQVcsS0FBSztBQUMvRCxlQUFPO0FBQUEsTUFDVDtBQUVBLFlBQU07QUFBQSxJQUNSO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxjQUFjLE1BQXNDO0FBQ3hELFFBQUksQ0FBQyxLQUFLLGFBQWEsSUFBSSxHQUFHO0FBQzVCLGFBQU8sRUFBRSxRQUFRLFFBQVE7QUFBQSxJQUMzQjtBQUVBLFNBQUssZUFBZTtBQUVwQixVQUFNLGFBQWEsS0FBSyxXQUFXLElBQUk7QUFDdkMsVUFBTSxVQUFVLEtBQUssU0FBUyxJQUFJO0FBQ2xDLFVBQU0sU0FBUyxNQUFNLEtBQUssaUJBQWlCLFVBQVU7QUFFckQsUUFBSSxDQUFDLFFBQVE7QUFDWCxZQUFNQSxhQUE0QixRQUFRLE1BQ3RDO0FBQUEsUUFDRSxHQUFHO0FBQUEsUUFDSDtBQUFBLFFBQ0EsS0FBSztBQUFBLFFBQ0wsU0FBUztBQUFBLFFBQ1QsUUFBUTtBQUFBLE1BQ1YsSUFDQSxFQUFFLFlBQVksUUFBUSxRQUFRO0FBRWxDLFdBQUssS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJQTtBQUM3QixZQUFNLEtBQUssWUFBWTtBQUN2QixhQUFPQTtBQUFBLElBQ1Q7QUFFQSxVQUFNLFlBQTRCO0FBQUEsTUFDaEMsR0FBRztBQUFBLE1BQ0g7QUFBQSxNQUNBLEtBQUssT0FBTztBQUFBLE1BQ1osU0FBUyxPQUFPLFlBQVksS0FBSyxtQkFBbUIsVUFBVTtBQUFBLE1BQzlELFFBQVE7QUFBQSxJQUNWO0FBRUEsUUFBSSxRQUFRLFFBQVEsT0FBTyxLQUFLO0FBQzlCLGdCQUFVLGlCQUFpQjtBQUFBLElBQzdCO0FBRUEsU0FBSyxLQUFLLE1BQU0sS0FBSyxJQUFJLElBQUk7QUFDN0IsVUFBTSxLQUFLLFlBQVk7QUFDdkIsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVBLE1BQU0saUJBQWlCO0FBQ3JCLFNBQUssZUFBZTtBQUNwQixVQUFNLGFBQWEsS0FBSyxjQUFjO0FBQ3RDLFVBQU0sT0FBTyxNQUFNLEtBQUssY0FBa0MsT0FBTyxPQUFPO0FBRXhFLFVBQU0sS0FBSyxjQUF1QixPQUFPLEtBQUssaUJBQWlCLENBQUM7QUFDaEUsVUFBTSxLQUFLLGNBQXVCLE9BQU8sS0FBSyxtQkFBbUIsQ0FBQztBQUVsRSxRQUFJLEtBQUssTUFBTSxZQUFZLE1BQU0sS0FBSyxTQUFTLGVBQWUsS0FBSyxFQUFFLFlBQVksR0FBRztBQUNsRixZQUFNLElBQUksTUFBTSw0QkFBYSxLQUFLLEtBQUsseUVBQTRCO0FBQUEsSUFDckU7QUFFQSxRQUFJLHVCQUFPLGlDQUFRLFdBQVcsS0FBSyxJQUFJLFdBQVcsSUFBSSxJQUFJLEtBQUssU0FBUyxPQUFPLEtBQUssQ0FBQyxFQUFFO0FBQUEsRUFDekY7QUFBQSxFQUVBLE1BQU0saUJBQWlCLE1BQWE7QUFDbEMsU0FBSyxlQUFlO0FBRXBCLFFBQUksQ0FBQyxLQUFLLGFBQWEsSUFBSSxHQUFHO0FBQzVCLFlBQU0sSUFBSSxNQUFNLG1FQUEyQjtBQUFBLElBQzdDO0FBRUEsVUFBTSxVQUFVLE1BQU0sS0FBSyxJQUFJLE1BQU0sS0FBSyxJQUFJO0FBQzlDLFVBQU0sY0FBYyxZQUFZLE9BQU87QUFDdkMsVUFBTSxhQUFhLEtBQUssV0FBVyxJQUFJO0FBRXZDLFFBQUk7QUFDRixZQUFNLFNBQVMsTUFBTSxLQUFLLGlCQUFpQixVQUFVO0FBQ3JELFlBQU0sU0FBUyxNQUFNLEtBQUssY0FBaUMsT0FBTyxLQUFLLG9CQUFvQixVQUFVLEdBQUc7QUFBQSxRQUN0RyxTQUFTLEdBQUcsU0FBUyxpQkFBaUIsV0FBVyxJQUFJLFVBQVU7QUFBQSxRQUMvRCxTQUFTLGFBQWEsT0FBTztBQUFBLFFBQzdCLFFBQVEsS0FBSyxTQUFTLE9BQU8sS0FBSztBQUFBLFFBQ2xDLEtBQUssUUFBUTtBQUFBLE1BQ2YsQ0FBQztBQUNELFlBQU0sVUFBVSxPQUFPLFNBQVMsT0FBTyxRQUFRO0FBQy9DLFlBQU0sVUFBVSxPQUFPLFNBQVMsWUFBWSxLQUFLLG1CQUFtQixVQUFVO0FBRTlFLFlBQU0sS0FBSyxTQUFTLE1BQU07QUFBQSxRQUN4QjtBQUFBLFFBQ0EsS0FBSztBQUFBLFFBQ0wsUUFBUTtBQUFBLFFBQ1IsY0FBYyxlQUFlLG9CQUFJLEtBQUssQ0FBQztBQUFBLFFBQ3ZDLGdCQUFnQjtBQUFBLFFBQ2hCO0FBQUEsTUFDRixDQUFDO0FBRUQsVUFBSSx1QkFBTyxpQ0FBUSxVQUFVLEVBQUU7QUFBQSxJQUNqQyxTQUFTLE9BQU87QUFDZCxZQUFNLEtBQUssU0FBUyxNQUFNLEVBQUUsWUFBWSxRQUFRLFNBQVMsQ0FBQztBQUMxRCxZQUFNO0FBQUEsSUFDUjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sa0JBQWtCO0FBQ3RCLFVBQU0sT0FBTyxLQUFLLGVBQWU7QUFFakMsUUFBSSxDQUFDLE1BQU07QUFDVCxZQUFNLElBQUksTUFBTSx3RUFBc0I7QUFBQSxJQUN4QztBQUVBLFVBQU0sS0FBSyxpQkFBaUIsSUFBSTtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxNQUFNLGlCQUFpQixNQUFhO0FBQ2xDLFNBQUssZUFBZTtBQUVwQixRQUFJLENBQUMsS0FBSyxhQUFhLElBQUksR0FBRztBQUM1QixZQUFNLElBQUksTUFBTSxtRUFBMkI7QUFBQSxJQUM3QztBQUVBLFVBQU0sYUFBYSxLQUFLLFdBQVcsSUFBSTtBQUN2QyxVQUFNLFNBQVMsTUFBTSxLQUFLLGlCQUFpQixVQUFVO0FBRXJELFFBQUksQ0FBQyxRQUFRO0FBQ1gsWUFBTSxLQUFLLFNBQVMsTUFBTTtBQUFBLFFBQ3hCO0FBQUEsUUFDQSxLQUFLO0FBQUEsUUFDTCxTQUFTO0FBQUEsUUFDVCxRQUFRO0FBQUEsTUFDVixDQUFDO0FBQ0QsVUFBSSx1QkFBTyxrREFBVTtBQUNyQjtBQUFBLElBQ0Y7QUFFQSxVQUFNLEtBQUssY0FBb0MsVUFBVSxLQUFLLG9CQUFvQixVQUFVLEdBQUc7QUFBQSxNQUM3RixTQUFTLGdCQUFnQixVQUFVO0FBQUEsTUFDbkMsS0FBSyxPQUFPO0FBQUEsTUFDWixRQUFRLEtBQUssU0FBUyxPQUFPLEtBQUs7QUFBQSxJQUNwQyxDQUFDO0FBRUQsVUFBTSxLQUFLLFNBQVMsTUFBTTtBQUFBLE1BQ3hCO0FBQUEsTUFDQSxLQUFLO0FBQUEsTUFDTCxTQUFTO0FBQUEsTUFDVCxRQUFRO0FBQUEsSUFDVixDQUFDO0FBQ0QsUUFBSSx1QkFBTyxrREFBVTtBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxNQUFNLDBCQUEwQjtBQUM5QixVQUFNLE9BQU8sS0FBSyxlQUFlO0FBRWpDLFFBQUksQ0FBQyxNQUFNO0FBQ1QsWUFBTSxJQUFJLE1BQU0sd0VBQXNCO0FBQUEsSUFDeEM7QUFFQSxVQUFNLEtBQUssaUJBQWlCLElBQUk7QUFBQSxFQUNsQztBQUFBLEVBRUEsTUFBTSxxQkFBcUIsTUFBYTtBQUN0QyxVQUFNLFFBQVEsTUFBTSxLQUFLLGtCQUFrQixJQUFJO0FBQy9DLFVBQU0sYUFBYSxNQUFNLGNBQWMsS0FBSyxXQUFXLElBQUk7QUFFM0QsUUFBSSxNQUFNLFdBQVcsV0FBVztBQUM5QixVQUFJLHVCQUFPLHdEQUFXO0FBQ3RCO0FBQUEsSUFDRjtBQUVBLFdBQU8sS0FBSyxNQUFNLFdBQVcsS0FBSyxtQkFBbUIsVUFBVSxHQUFHLFFBQVE7QUFBQSxFQUM1RTtBQUFBLEVBRUEsTUFBTSxnQkFBZ0I7QUFDcEIsVUFBTSxPQUFPLEtBQUssZUFBZTtBQUNqQyxRQUFJLENBQUMsTUFBTTtBQUNULFVBQUksdUJBQU8sd0RBQVc7QUFDdEI7QUFBQSxJQUNGO0FBRUEsVUFBTSxLQUFLLHFCQUFxQixJQUFJO0FBQUEsRUFDdEM7QUFDRjtBQUVBLElBQU0sdUJBQU4sY0FBbUMsc0JBQU07QUFBQSxFQUl2QyxZQUFZLEtBQVUsUUFBaUMsWUFBMkI7QUFDaEYsVUFBTSxHQUFHO0FBQ1QsU0FBSyxTQUFTO0FBQ2QsU0FBSyxhQUFhLGNBQWM7QUFBQSxFQUNsQztBQUFBLEVBRUEsU0FBUztBQUNQLFNBQUssS0FBSyxPQUFPO0FBQUEsRUFDbkI7QUFBQSxFQUVBLE1BQU0sU0FBUztBQUNiLFVBQU0sRUFBRSxVQUFVLElBQUk7QUFDdEIsY0FBVSxNQUFNO0FBQ2hCLGNBQVUsU0FBUyw2QkFBNkI7QUFFaEQsVUFBTSxPQUFPLEtBQUssY0FBYyxLQUFLLE9BQU8sZUFBZTtBQUMzRCxVQUFNLFNBQVMsVUFBVSxTQUFTLE1BQU0sRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3ZFLFdBQU8sTUFBTSxlQUFlO0FBRTVCLFFBQUksQ0FBQyxNQUFNO0FBQ1QsZ0JBQVUsU0FBUyxLQUFLLEVBQUUsTUFBTSx5RUFBdUIsQ0FBQztBQUN4RDtBQUFBLElBQ0Y7QUFFQSxVQUFNLFFBQVEsTUFBTSxLQUFLLE9BQU8sa0JBQWtCLElBQUk7QUFDdEQsVUFBTSxTQUFTLEtBQUssT0FBTyxhQUFhLElBQUk7QUFDNUMsVUFBTSxVQUFVLE1BQU0sS0FBSyxPQUFPLElBQUksTUFBTSxLQUFLLElBQUk7QUFDckQsVUFBTSxjQUFjLGlCQUFpQixPQUFPLEVBQUU7QUFDOUMsVUFBTSxpQkFBaUIsT0FBTyxLQUFLLFdBQVcsRUFBRSxTQUFTO0FBQ3pELFVBQU0sVUFBVSxVQUFVLE1BQU0sV0FBVztBQUMzQyxVQUFNLGtCQUFrQixRQUFRLE1BQU0sR0FBRyxLQUFLLE1BQU0sV0FBVztBQUMvRCxVQUFNLGdCQUFnQixRQUFRLE1BQU0sV0FBVyxNQUFNLFVBQVUsS0FBSyxNQUFNLFdBQVc7QUFDckYsVUFBTSxpQkFDSixNQUFNLFdBQVcsYUFDYiw2QkFDQSxNQUFNLFdBQVcsWUFDZiw2QkFDQSxNQUFNLFdBQVcsV0FDZiw2QkFDQSxNQUFNLFdBQVcsV0FDZix1QkFDQTtBQUNaLFVBQU0sa0JBQ0osQ0FBQyxTQUNHLHNFQUNBLE1BQU0sV0FBVyxXQUNmLHlGQUNBLHdFQUFzQixtQkFBbUI7QUFDakQsVUFBTSxRQUFRLFVBQVUsVUFBVTtBQUFBLE1BQ2hDLEtBQUssb0NBQW9DLGNBQWMsTUFBTSxNQUFNLENBQUM7QUFBQSxJQUN0RSxDQUFDO0FBQ0QsVUFBTSxRQUFRLGNBQWMsTUFBTSxNQUFNLENBQUM7QUFFekMsY0FBVSxTQUFTLEtBQUssRUFBRSxNQUFNLGlDQUFRLEtBQUssSUFBSSxHQUFHLENBQUM7QUFDckQsY0FBVSxTQUFTLEtBQUs7QUFBQSxNQUN0QixNQUFNLGlDQUFRLE1BQU0sZUFBZSxTQUFTLEtBQUssT0FBTyxXQUFXLElBQUksSUFBSSxHQUFHLG1CQUFtQixPQUFPO0FBQUEsTUFDeEcsS0FBSztBQUFBLElBQ1AsQ0FBQztBQUNELGNBQVUsU0FBUyxLQUFLO0FBQUEsTUFDdEIsTUFBTSxxQkFBTSxjQUFjLE1BQU0sTUFBTSxDQUFDLEdBQUcsTUFBTSxlQUFlLGtDQUFXLE1BQU0sWUFBWSxLQUFLLEVBQUU7QUFBQSxNQUNuRyxLQUFLO0FBQUEsSUFDUCxDQUFDO0FBQ0QsY0FBVSxTQUFTLEtBQUs7QUFBQSxNQUN0QixNQUFNLFNBQ0YsMkVBQWUsS0FBSyxPQUFPLFNBQVMsYUFBYSxLQUNqRCwyRUFBZSxLQUFLLE9BQU8sU0FBUyxhQUFhO0FBQUEsTUFDckQsS0FBSztBQUFBLElBQ1AsQ0FBQztBQUVELFFBQUksd0JBQVEsU0FBUyxFQUNsQixRQUFRLHNDQUFRLEVBQ2hCLFFBQVEsaUJBQWlCLG1GQUFrQiw4RkFBd0IsRUFDbkU7QUFBQSxNQUFVLENBQUMsV0FDVixPQUNHLGNBQWMsaUJBQWlCLHVCQUFRLGNBQUksRUFDM0MsWUFBWSxDQUFDLFVBQVUsY0FBYyxFQUNyQyxRQUFRLFlBQVk7QUFDbkIsY0FBTSxLQUFLLFVBQVUsTUFBTSxLQUFLLE9BQU8sMEJBQTBCLElBQUksQ0FBQztBQUN0RSxjQUFNLEtBQUssT0FBTztBQUFBLE1BQ3BCLENBQUM7QUFBQSxJQUNMO0FBRUYsUUFBSSx3QkFBUSxTQUFTLEVBQ2xCLFFBQVEsc0NBQVEsRUFDaEIsUUFBUSxlQUFlLEVBQ3ZCLFVBQVUsQ0FBQyxXQUFXO0FBQ3JCLGFBQU8sY0FBYyxjQUFjLEVBQUUsWUFBWSxDQUFDLE9BQU87QUFFekQsVUFBSSxTQUFTO0FBQ1gsZUFBTyxPQUFPO0FBQUEsTUFDaEI7QUFFQSxhQUFPLFFBQVEsWUFBWTtBQUN6QixjQUFNLEtBQUssVUFBVSxNQUFNLEtBQUssT0FBTyxpQkFBaUIsSUFBSSxDQUFDO0FBQzdELGNBQU0sS0FBSyxPQUFPO0FBQUEsTUFDcEIsQ0FBQztBQUFBLElBQ0gsQ0FBQztBQUVILFFBQUksd0JBQVEsU0FBUyxFQUNsQixRQUFRLHNDQUFRLEVBQ2hCLFFBQVEsbUhBQW1DLEVBQzNDLFVBQVUsQ0FBQyxXQUFXO0FBQ3JCLGFBQU8sY0FBYyxjQUFJLEVBQUUsWUFBWSxDQUFDLGVBQWU7QUFFdkQsVUFBSSxpQkFBaUI7QUFDbkIsZUFBTyxXQUFXO0FBQUEsTUFDcEI7QUFFQSxhQUFPLFFBQVEsWUFBWTtBQUN6QixjQUFNLEtBQUssVUFBVSxNQUFNLEtBQUssT0FBTyxpQkFBaUIsSUFBSSxDQUFDO0FBQzdELGNBQU0sS0FBSyxPQUFPO0FBQUEsTUFDcEIsQ0FBQztBQUFBLElBQ0gsQ0FBQztBQUVILFFBQUksd0JBQVEsU0FBUyxFQUNsQixRQUFRLGtDQUFjLEVBQ3RCLFFBQVEsZ0JBQWdCLG1IQUE4Qiw0RkFBaUIsRUFDdkU7QUFBQSxNQUFVLENBQUMsV0FDVixPQUNHLGNBQWMsY0FBSSxFQUNsQixZQUFZLENBQUMsYUFBYSxFQUMxQixRQUFRLE1BQU0sS0FBSyxLQUFLLE9BQU8scUJBQXFCLElBQUksQ0FBQztBQUFBLElBQzlEO0FBQUEsRUFDSjtBQUFBLEVBRUEsTUFBTSxVQUFVLFFBQTZCO0FBQzNDLFFBQUk7QUFDRixZQUFNLE9BQU87QUFBQSxJQUNmLFNBQVMsT0FBTztBQUNkLFlBQU0sVUFBVSxpQkFBaUIsUUFBUSxNQUFNLFVBQVU7QUFDekQsVUFBSSx1QkFBTyxPQUFPO0FBQUEsSUFDcEI7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFNLHFCQUFOLGNBQWlDLHNCQUFNO0FBQUEsRUFHckMsWUFBWSxLQUFVLFFBQWlDO0FBQ3JELFVBQU0sR0FBRztBQUNULFNBQUssU0FBUztBQUFBLEVBQ2hCO0FBQUEsRUFFQSxTQUFTO0FBQ1AsVUFBTSxFQUFFLFVBQVUsSUFBSTtBQUN0QixjQUFVLE1BQU07QUFDaEIsY0FBVSxTQUFTLE1BQU0sRUFBRSxNQUFNLHVDQUFTLENBQUM7QUFDM0MsY0FBVSxTQUFTLEtBQUssRUFBRSxNQUFNLHFCQUFNLEtBQUssT0FBTyxTQUFTLElBQUksR0FBRyxDQUFDO0FBQ25FLGNBQVUsU0FBUyxLQUFLLEVBQUUsTUFBTSxxQkFBTSxLQUFLLE9BQU8sU0FBUyxPQUFPLEdBQUcsQ0FBQztBQUN0RSxjQUFVLFNBQVMsS0FBSyxFQUFFLE1BQU0sd0JBQVMsS0FBSyxPQUFPLFNBQVMsRUFBRSxHQUFHLENBQUM7QUFDcEUsY0FBVSxTQUFTLEtBQUssRUFBRSxNQUFNLDJDQUFrQixLQUFLLE9BQU8sU0FBUyxhQUFhLEdBQUcsQ0FBQztBQUFBLEVBQzFGO0FBQ0Y7QUFFQSxJQUFNLHNCQUFOLGNBQWtDLGlDQUFpQjtBQUFBLEVBUWpELFlBQVksS0FBVSxRQUFpQztBQUNyRCxVQUFNLEtBQUssTUFBTTtBQVBuQix5QkFBbUU7QUFDbkUsdUJBQWM7QUFDZCxrQkFBNkI7QUFDN0IsaUJBQTRCO0FBQzVCLG1CQUE4QjtBQUk1QixTQUFLLFNBQVM7QUFBQSxFQUNoQjtBQUFBLEVBRUEsY0FBYztBQUNaLFdBQU87QUFBQSxNQUNMO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxhQUFhO0FBQUEsTUFDZjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLGFBQWE7QUFBQSxNQUNmO0FBQUEsTUFDQTtBQUFBLFFBQ0UsSUFBSTtBQUFBLFFBQ0osT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsYUFBYTtBQUFBLE1BQ2Y7QUFBQSxNQUNBO0FBQUEsUUFDRSxJQUFJO0FBQUEsUUFDSixPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxhQUFhO0FBQUEsTUFDZjtBQUFBLE1BQ0E7QUFBQSxRQUNFLElBQUk7QUFBQSxRQUNKLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLGFBQWE7QUFBQSxNQUNmO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLGlCQUFpQixPQUFrQztBQUNqRCxXQUFPLE1BQ0osT0FBTyxDQUFDLFNBQXlCLFFBQVEsSUFBSSxDQUFDLEVBQzlDLEtBQUssR0FBRyxFQUNSLFlBQVk7QUFBQSxFQUNqQjtBQUFBLEVBRUEsd0JBQXdCLGdCQUE2QixPQUFrQztBQUNyRixVQUFNLFVBQVUsSUFBSSx3QkFBUSxXQUFXO0FBQ3ZDLFlBQVEsVUFBVSxRQUFRLGFBQWEsS0FBSyxjQUFjLEdBQUcsS0FBSztBQUNsRSxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBRUEsZ0JBQWdCLGFBQTBCO0FBQ3hDLFVBQU0sZ0JBQWdCLElBQUksd0JBQVEsV0FBVyxFQUFFLFNBQVMseUNBQXlDO0FBQ2pHLGtCQUFjLE9BQU8sT0FBTztBQUM1QixrQkFBYztBQUFBLE1BQVUsQ0FBQyxXQUN2QixPQUFPLGVBQWUseUNBQVcsRUFBRSxTQUFTLEtBQUssV0FBVyxFQUFFLFNBQVMsQ0FBQyxVQUFVO0FBQ2hGLGFBQUssY0FBYztBQUNuQixjQUFNLFVBQVUsS0FBSyxZQUFZLGNBQTJCLHFDQUFxQztBQUNqRyxZQUFJLFNBQVM7QUFDWCxlQUFLLGtCQUFrQixPQUFPO0FBQUEsUUFDaEM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDRjtBQUFBLEVBRUEsa0JBQWtCLGFBQTBCO0FBQzFDLFVBQU0sUUFBUSxZQUFZLFVBQVUsRUFBRSxLQUFLLG1DQUFtQyxDQUFDO0FBQy9FLFNBQUssUUFBUTtBQUViLFNBQUssWUFBWSxFQUFFLFFBQVEsQ0FBQyxZQUFZO0FBQ3RDLFlBQU0sU0FBUyxNQUFNLFNBQVMsVUFBVTtBQUFBLFFBQ3RDLEtBQUssd0NBQXdDLEtBQUssa0JBQWtCLFFBQVEsS0FBSyxlQUFlLEVBQUU7QUFBQSxRQUNsRyxNQUFNLFFBQVE7QUFBQSxNQUNoQixDQUFDO0FBQ0QsYUFBTyxPQUFPO0FBQ2QsYUFBTyxpQkFBaUIsU0FBUyxNQUFNO0FBQ3JDLFlBQUksS0FBSyxrQkFBa0IsUUFBUSxJQUFJO0FBQ3JDO0FBQUEsUUFDRjtBQUVBLGFBQUssZ0JBQWdCLFFBQVE7QUFDN0IsYUFBSyxhQUFhO0FBQ2xCLFlBQUksS0FBSyxTQUFTO0FBQ2hCLGVBQUssWUFBWSxLQUFLLE9BQU87QUFBQSxRQUMvQjtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0gsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLGVBQWU7QUFDYixRQUFJLENBQUMsS0FBSyxPQUFPO0FBQ2Y7QUFBQSxJQUNGO0FBRUEsVUFBTSxRQUFRLE1BQU0sS0FBSyxLQUFLLE1BQU0saUJBQThCLHdDQUF3QyxDQUFDO0FBQzNHLFVBQU0sUUFBUSxDQUFDLE1BQU0sVUFBVTtBQUM3QixZQUFNLFVBQVUsS0FBSyxZQUFZLEVBQUUsS0FBSztBQUN4QyxXQUFLLFVBQVUsT0FBTyxhQUFhLFNBQVMsT0FBTyxLQUFLLGFBQWE7QUFBQSxJQUN2RSxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEseUJBQXlCLGFBQTBCLE9BQWUsYUFBcUIsUUFBUSxzQkFBTztBQUNwRyxTQUFLLHdCQUF3QixhQUFhLE9BQU8sYUFBYSxLQUFLLEVBQ2hFLFFBQVEsS0FBSyxFQUNiLFFBQVEsR0FBRyxXQUFXLFNBQUksS0FBSyxRQUFHO0FBQUEsRUFDdkM7QUFBQSxFQUVBLHdCQUF3QixhQUEwQixNQUFjO0FBQzlELFFBQUksd0JBQVEsV0FBVyxFQUFFLFFBQVEsSUFBSSxFQUFFLFdBQVc7QUFBQSxFQUNwRDtBQUFBLEVBRUEsc0JBQXNCLGFBQTBCO0FBQzlDLFVBQU0sdUJBQXVCLEtBQUssT0FBTyxrQkFBa0IsS0FBSyxPQUFPLFNBQVMsYUFBYSxJQUN6Riw2Q0FBVSxLQUFLLE9BQU8sU0FBUyxhQUFhLEtBQzVDO0FBRUosU0FBSyx3QkFBd0IsYUFBYSxtQkFBbUIsc0JBQXNCLEtBQUssT0FBTyxTQUFTLGFBQWEsRUFDbEgsUUFBUSxpQkFBaUIsRUFDekIsUUFBUSxvQkFBb0IsRUFDNUI7QUFBQSxNQUFRLENBQUMsU0FDUixLQUFLLFNBQVMsS0FBSyxPQUFPLFNBQVMsYUFBYSxFQUFFLFNBQVMsT0FBTyxVQUFVO0FBQzFFLGFBQUssT0FBTyxTQUFTLG9CQUFnQiwrQkFBYyxNQUFNLEtBQUssQ0FBQztBQUMvRCxjQUFNLEtBQUssT0FBTyxhQUFhO0FBQy9CLGFBQUssUUFBUTtBQUFBLE1BQ2YsQ0FBQztBQUFBLElBQ0gsRUFDQztBQUFBLE1BQVUsQ0FBQyxXQUNWLE9BQU8sY0FBYywwQkFBTSxFQUFFLFFBQVEsTUFBTTtBQUN6QyxZQUFJLGtCQUFrQixLQUFLLEtBQUssS0FBSyxRQUFRLE9BQU8sV0FBVztBQUM3RCxjQUFJO0FBQ0Ysa0JBQU0sS0FBSyxPQUFPLGlCQUFpQixPQUFPLElBQUk7QUFDOUMsZ0JBQUksdUJBQU8sMkNBQXVCLE9BQU8sSUFBSSxFQUFFO0FBQy9DLGlCQUFLLFFBQVE7QUFBQSxVQUNmLFNBQVMsT0FBTztBQUNkLGtCQUFNLFVBQVUsaUJBQWlCLFFBQVEsTUFBTSxVQUFVO0FBQ3pELGdCQUFJLHVCQUFPLE9BQU87QUFBQSxVQUNwQjtBQUFBLFFBQ0YsQ0FBQyxFQUFFLEtBQUs7QUFBQSxNQUNWLENBQUM7QUFBQSxJQUNIO0FBRUYsU0FBSyx3QkFBd0IsYUFBYSw0QkFBUSwyRUFBOEIsbUJBQW1CLEVBQ2hHLFFBQVEsMEJBQU0sRUFDZCxRQUFRLDRMQUFnRDtBQUUzRCxTQUFLLHdCQUF3QixhQUFhLGdDQUFPO0FBRWpELFNBQUssd0JBQXdCLGFBQWEsNEJBQVEsa0hBQXdCLEVBQ3ZFLFFBQVEsMEJBQU0sRUFDZCxRQUFRLGtIQUF3QixFQUNoQztBQUFBLE1BQVUsQ0FBQyxXQUNWLE9BQU8sY0FBYyxjQUFJLEVBQUUsUUFBUSxNQUFNO0FBQ3ZDLFlBQUksbUJBQW1CLEtBQUssS0FBSyxLQUFLLE1BQU0sRUFBRSxLQUFLO0FBQUEsTUFDckQsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNKO0FBQUEsRUFFQSxxQkFBcUIsYUFBMEI7QUFDN0MsU0FBSztBQUFBLE1BQ0g7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsS0FBSyxPQUFPLFNBQVM7QUFBQSxJQUN2QixFQUNHLFFBQVEsZ0JBQWdCLEVBQ3hCLFFBQVEsc0dBQTBDLEVBQ2xEO0FBQUEsTUFBUSxDQUFDLFNBQ1IsS0FDRyxlQUFlLG1DQUFtQyxFQUNsRCxTQUFTLEtBQUssT0FBTyxTQUFTLGFBQWEsRUFDM0MsU0FBUyxPQUFPLFVBQVU7QUFDekIsYUFBSyxPQUFPLFNBQVMsZ0JBQWdCLE1BQU0sS0FBSztBQUNoRCxjQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsTUFDakMsQ0FBQztBQUFBLElBQ0w7QUFFRixTQUFLLHdCQUF3QixhQUFhLG1CQUFtQixxRkFBOEIsS0FBSyxPQUFPLFNBQVMsY0FBYyxFQUMzSCxRQUFRLGlCQUFpQixFQUN6QixRQUFRLG1GQUE0QixFQUNwQztBQUFBLE1BQVEsQ0FBQyxTQUNSLEtBQ0csZUFBZSxTQUFTLEVBQ3hCLFNBQVMsS0FBSyxPQUFPLFNBQVMsY0FBYyxFQUM1QyxTQUFTLE9BQU8sVUFBVTtBQUN6QixhQUFLLE9BQU8sU0FBUyxpQkFBaUIsTUFBTSxLQUFLO0FBQ2pELGNBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxNQUNqQyxDQUFDO0FBQUEsSUFDTDtBQUVGLFNBQUssd0JBQXdCLGFBQWEsZ0JBQWdCLHFGQUF3QyxFQUMvRixRQUFRLGNBQWMsRUFDdEIsUUFBUSxxSUFBZ0QsRUFDeEQsUUFBUSxDQUFDLFNBQVM7QUFDakIsV0FBSyxRQUFRLE9BQU87QUFDcEIsV0FDRyxlQUFlLGdCQUFnQixFQUMvQixTQUFTLEtBQUssT0FBTyxTQUFTLFdBQVcsRUFDekMsU0FBUyxPQUFPLFVBQVU7QUFDekIsYUFBSyxPQUFPLFNBQVMsY0FBYyxNQUFNLEtBQUs7QUFDOUMsY0FBTSxLQUFLLE9BQU8sYUFBYTtBQUFBLE1BQ2pDLENBQUM7QUFBQSxJQUNMLENBQUM7QUFFSCxTQUFLLHdCQUF3QixhQUFhLFVBQVUscUJBQVcsS0FBSyxPQUFPLFNBQVMsTUFBTSxFQUN2RixRQUFRLFFBQVEsRUFDaEIsUUFBUSw4REFBWSxFQUNwQjtBQUFBLE1BQVEsQ0FBQyxTQUNSLEtBQ0csZUFBZSxNQUFNLEVBQ3JCLFNBQVMsS0FBSyxPQUFPLFNBQVMsTUFBTSxFQUNwQyxTQUFTLE9BQU8sVUFBVTtBQUN6QixhQUFLLE9BQU8sU0FBUyxTQUFTLE1BQU0sS0FBSztBQUN6QyxjQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsTUFDakMsQ0FBQztBQUFBLElBQ0w7QUFFRixTQUFLLHdCQUF3QixhQUFhLDRCQUFRLG9IQUEwQixFQUN6RSxRQUFRLDBCQUFNLEVBQ2QsUUFBUSxvSEFBMEIsRUFDbEM7QUFBQSxNQUFVLENBQUMsV0FDVixPQUFPLGNBQWMsMEJBQU0sRUFBRSxRQUFRLFlBQVk7QUFDL0MsWUFBSTtBQUNGLGdCQUFNLEtBQUssT0FBTyxlQUFlO0FBQUEsUUFDbkMsU0FBUyxPQUFPO0FBQ2QsZ0JBQU0sVUFBVSxpQkFBaUIsUUFBUSxNQUFNLFVBQVU7QUFDekQsY0FBSSx1QkFBTyxPQUFPO0FBQUEsUUFDcEI7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDSjtBQUFBLEVBRUEsbUJBQW1CLGFBQTBCO0FBQzNDLFNBQUssd0JBQXdCLGFBQWEsZ0JBQWdCLDhCQUFlLG1CQUFtQixFQUN6RixRQUFRLGNBQWMsRUFDdEIsUUFBUSw2R0FBNkI7QUFFeEMsU0FBSyx3QkFBd0IsYUFBYSw0QkFBUSxnSEFBc0IsY0FBSSxFQUN6RSxRQUFRLDBCQUFNLEVBQ2QsUUFBUSwwUUFBOEM7QUFFekQsU0FBSyx3QkFBd0IsYUFBYSx3Q0FBVSxnSEFBMkIsRUFDNUUsUUFBUSxzQ0FBUSxFQUNoQixRQUFRLGdIQUEyQixFQUNuQztBQUFBLE1BQVUsQ0FBQyxXQUNWLE9BQU8sY0FBYyxjQUFJLEVBQUUsV0FBVyxFQUFFLFFBQVEsWUFBWTtBQUMxRCxhQUFLLE9BQU8sS0FBSyxRQUFRLENBQUM7QUFDMUIsY0FBTSxLQUFLLE9BQU8sWUFBWTtBQUM5QixjQUFNLEtBQUssT0FBTyxpQkFBaUI7QUFDbkMsWUFBSSx1QkFBTyxrREFBVTtBQUFBLE1BQ3ZCLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDSjtBQUFBLEVBRUEsb0JBQW9CLGFBQTBCO0FBQzVDLFNBQUs7QUFBQSxNQUNIO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBRUEsb0JBQW9CLGFBQTBCO0FBQzVDLFNBQUs7QUFBQSxNQUNIO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNGO0FBRUEsU0FBSyx3QkFBd0IsYUFBYSx3Q0FBVSxnR0FBcUIsRUFDdEUsUUFBUSxzQ0FBUSxFQUNoQixRQUFRLGdHQUFxQixFQUM3QjtBQUFBLE1BQVUsQ0FBQyxXQUNWLE9BQU8sY0FBYyxjQUFJLEVBQUUsUUFBUSxNQUFNO0FBQ3ZDLFlBQUksbUJBQW1CLEtBQUssS0FBSyxLQUFLLE1BQU0sRUFBRSxLQUFLO0FBQUEsTUFDckQsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNKO0FBQUEsRUFFQSxrQkFBa0IsU0FBc0I7QUFDdEMsVUFBTSxRQUFRLEtBQUssWUFBWSxLQUFLLEVBQUUsWUFBWTtBQUNsRCxVQUFNLFFBQVEsTUFBTSxLQUFLLFFBQVEsaUJBQThCLGlDQUFpQyxDQUFDO0FBQ2pHLFFBQUksZUFBZTtBQUVuQixVQUFNLFFBQVEsQ0FBQyxXQUFXO0FBQ3hCLFlBQU0sVUFBVSxDQUFDLFVBQVUsT0FBTyxRQUFRLGNBQWMsSUFBSSxTQUFTLEtBQUs7QUFDMUUsYUFBTyxVQUFVLE9BQU8sYUFBYSxDQUFDLE9BQU87QUFDN0MsVUFBSSxTQUFTO0FBQ1gsd0JBQWdCO0FBQUEsTUFDbEI7QUFBQSxJQUNGLENBQUM7QUFFRCxVQUFNLGVBQWUsUUFBUSxjQUEyQixxQ0FBcUM7QUFDN0YsUUFBSSxjQUFjO0FBQ2hCLG1CQUFhLFVBQVUsT0FBTyxhQUFhLGVBQWUsQ0FBQztBQUFBLElBQzdEO0FBQUEsRUFDRjtBQUFBLEVBRUEsb0JBQW9CLGFBQTBCO0FBQzVDLFlBQVEsS0FBSyxlQUFlO0FBQUEsTUFDMUIsS0FBSztBQUNILGFBQUssc0JBQXNCLFdBQVc7QUFDdEM7QUFBQSxNQUNGLEtBQUs7QUFDSCxhQUFLLHFCQUFxQixXQUFXO0FBQ3JDO0FBQUEsTUFDRixLQUFLO0FBQ0gsYUFBSyxtQkFBbUIsV0FBVztBQUNuQztBQUFBLE1BQ0YsS0FBSztBQUNILGFBQUssb0JBQW9CLFdBQVc7QUFDcEM7QUFBQSxNQUNGLEtBQUs7QUFDSCxhQUFLLG9CQUFvQixXQUFXO0FBQ3BDO0FBQUEsTUFDRjtBQUNFO0FBQUEsSUFDSjtBQUFBLEVBQ0Y7QUFBQSxFQUVBLFlBQVksU0FBc0I7QUFDaEMsWUFBUSxNQUFNO0FBQ2QsU0FBSyxvQkFBb0IsT0FBTztBQUNoQyxZQUFRLFVBQVU7QUFBQSxNQUNoQixLQUFLO0FBQUEsTUFDTCxNQUFNO0FBQUEsSUFDUixDQUFDO0FBQ0QsU0FBSyxrQkFBa0IsT0FBTztBQUFBLEVBQ2hDO0FBQUEsRUFFQSxVQUFnQjtBQUNkLFVBQU0sRUFBRSxZQUFZLElBQUk7QUFDeEIsZ0JBQVksaUJBQWlCLG9DQUFvQyxFQUFFLFFBQVEsQ0FBQyxZQUFZLFFBQVEsT0FBTyxDQUFDO0FBQ3hHLFNBQUssU0FBUyxZQUFZLFVBQVUsRUFBRSxLQUFLLG9DQUFvQyxDQUFDO0FBQ2hGLFNBQUssUUFBUTtBQUNiLFNBQUssVUFBVTtBQUVmLFNBQUssZ0JBQWdCLEtBQUssTUFBTTtBQUNoQyxTQUFLLGtCQUFrQixLQUFLLE1BQU07QUFFbEMsVUFBTSxZQUFZLEtBQUssT0FBTyxVQUFVLEVBQUUsS0FBSyxxQ0FBcUMsQ0FBQztBQUNyRixTQUFLLFVBQVU7QUFDZixTQUFLLFlBQVksU0FBUztBQUFBLEVBQzVCO0FBQ0Y7QUFFQSxJQUFNLG9CQUFOLGNBQWdDLGtDQUEyQjtBQUFBLEVBSXpELFlBQ0UsS0FDQSxRQUNBLGdCQUNBO0FBQ0EsVUFBTSxHQUFHO0FBQ1QsU0FBSyxTQUFTO0FBQ2QsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxlQUFlLDJDQUF1QjtBQUFBLEVBQzdDO0FBQUEsRUFFQSxXQUFzQjtBQUNwQixXQUFPLEtBQUssT0FBTyxtQkFBbUI7QUFBQSxFQUN4QztBQUFBLEVBRUEsWUFBWSxRQUF5QjtBQUNuQyxXQUFPLE9BQU87QUFBQSxFQUNoQjtBQUFBLEVBRUEsTUFBTSxhQUFhLFFBQWdDO0FBQ2pELFVBQU0sS0FBSyxlQUFlLE1BQU07QUFBQSxFQUNsQztBQUNGOyIsCiAgIm5hbWVzIjogWyJuZXh0U3RhdGUiXQp9Cg==
