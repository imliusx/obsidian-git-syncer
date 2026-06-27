import {
  App,
  FuzzySuggestModal,
  Menu,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  setIcon,
  TFile,
  TFolder,
  normalizePath,
  requestUrl
} from "obsidian";

interface GitHubSyncSettings {
  repositoryUrl: string;
  githubUsername: string;
  githubToken: string;
  branch: string;
  localRootPath: string;
}

interface LocalFileState {
  remotePath?: string;
  sha?: string;
  status: "draft" | "synced" | "modified" | "deleted" | "failed";
  lastSyncedAt?: string;
  lastSyncedHash?: string;
  htmlUrl?: string;
}

interface PersistedData {
  files: Record<string, LocalFileState>;
}

interface ArticleActionContext {
  file: TFile;
  inRoot: boolean;
  hasProperties: boolean;
  state: LocalFileState;
  syncTitle: string;
  canSync: boolean;
  canDeleteRemote: boolean;
  canOpenRemote: boolean;
  canInsertProperties: boolean;
}

interface GitHubRepo {
  owner: string;
  repo: string;
}

interface GitHubErrorPayload {
  message?: string;
  documentation_url?: string;
}

interface GitHubContentResponse {
  type: string;
  path: string;
  sha: string;
  html_url?: string;
}

interface GitHubPutResponse {
  content?: GitHubContentResponse | null;
}

interface GitHubDeleteResponse {
  content?: GitHubContentResponse | null;
}

interface GitHubUserResponse {
  login: string;
}

const REMOTE_CONTENT_ROOT = "content";

const DEFAULT_SETTINGS: GitHubSyncSettings = {
  repositoryUrl: "https://github.com/imliusx/obsidian-git-syncer.git",
  githubUsername: "",
  githubToken: "",
  branch: "main",
  localRootPath: "content"
};

const DEFAULT_DATA: PersistedData = {
  files: {}
};

class GitHubRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function escapeYaml(input: string): string {
  return input.replace(/"/g, '\\"');
}

function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  if (!content.startsWith("---\n")) {
    return { data: {}, body: content };
  }

  const end = content.indexOf("\n---\n", 4);
  if (end === -1) {
    return { data: {}, body: content };
  }

  const raw = content.slice(4, end).split("\n");
  const data: Record<string, string> = {};

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

function buildFrontmatter(file: TFile, title?: string): string {
  const today = new Date().toISOString().slice(0, 10);
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

function padDateNumber(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateTime(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input;

  if (Number.isNaN(date.getTime())) {
    return typeof input === "string" ? input : "";
  }

  return [
    `${date.getFullYear()}-${padDateNumber(date.getMonth() + 1)}-${padDateNumber(date.getDate())}`,
    `${padDateNumber(date.getHours())}:${padDateNumber(date.getMinutes())}:${padDateNumber(date.getSeconds())}`
  ].join(" ");
}

function hashContent(input: string): string {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }

  return `h${Math.abs(hash)}`;
}

function encodeBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

function parseRepositoryUrl(input: string): GitHubRepo | null {
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

function encodeGitHubPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function isSafeContentPath(path: string): boolean {
  const normalized = normalizePath(path).replace(/^\/+/, "");
  const segments = normalized.split("/");
  return normalized.startsWith(`${REMOTE_CONTENT_ROOT}/`) && !segments.some((segment) => segment === ".." || segment === "");
}

function toStatusLabel(status: LocalFileState["status"]): string {
  switch (status) {
    case "synced":
      return "已同步";
    case "modified":
      return "已修改";
    case "deleted":
      return "远端已删除";
    case "failed":
      return "同步失败";
    case "draft":
    default:
      return "未同步";
  }
}

function toStatusClass(status: LocalFileState["status"]): string {
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

function toStatusIcon(status: LocalFileState["status"]): string {
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

export default class ObsidianGitSyncerPlugin extends Plugin {
  settings: GitHubSyncSettings = DEFAULT_SETTINGS;
  data: PersistedData = DEFAULT_DATA;
  statusBarEl!: HTMLElement;
  statusBarIconEl!: HTMLElement;
  statusBarTextEl!: HTMLElement;

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
        if (file instanceof TFile && file === this.getCurrentFile()) {
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
    const saved = (await this.loadData()) as { settings?: Partial<GitHubSyncSettings>; data?: PersistedData } | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(saved?.settings ?? {}) };
    this.data = { ...DEFAULT_DATA, ...(saved?.data ?? {}) };
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

  getRepository(): GitHubRepo {
    const repository = parseRepositoryUrl(this.settings.repositoryUrl);
    if (!repository) {
      throw new Error("GitHub 仓库地址格式不正确。支持 https://github.com/owner/repo.git、git@github.com:owner/repo.git 或 owner/repo。");
    }

    return repository;
  }

  validateConfig() {
    this.getRepository();

    if (!this.settings.githubUsername.trim()) {
      throw new Error("请先填写 GitHub Username。");
    }

    if (!this.settings.githubToken.trim()) {
      throw new Error("请先填写 GitHub Token。");
    }

    if (!this.settings.branch.trim()) {
      throw new Error("请先填写目标分支。");
    }
  }

  getExistingFolder(path: string): TFolder | null {
    const normalized = normalizePath(path).replace(/\/$/, "");
    const target = this.app.vault.getAbstractFileByPath(normalized);
    return target instanceof TFolder ? target : null;
  }

  getAllVaultFolders(): TFolder[] {
    const folders: TFolder[] = [];

    this.app.vault.getAllLoadedFiles().forEach((entry) => {
      if (entry instanceof TFolder && entry.path) {
        folders.push(entry);
      }
    });

    return folders.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  }

  async setLocalRootPath(path: string) {
    const normalized = normalizePath(path.trim()).replace(/\/$/, "");

    if (!normalized) {
      throw new Error("Local Root Path 不能为空。");
    }

    const folder = this.getExistingFolder(normalized);
    if (!folder) {
      throw new Error("该目录不存在，请从 Vault 中选择已有目录。");
    }

    this.settings.localRootPath = folder.path;
    await this.saveSettings();
  }

  getCurrentFile(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    return file instanceof TFile && file.extension === "md" ? file : null;
  }

  isInsideRoot(file: TFile): boolean {
    const root = normalizePath(this.settings.localRootPath).replace(/\/$/, "");
    return file.path === root || file.path.startsWith(`${root}/`);
  }

  relativePath(file: TFile): string {
    const root = normalizePath(this.settings.localRootPath).replace(/\/$/, "");
    const fullPath = normalizePath(file.path);

    if (fullPath === root) {
      return "";
    }

    if (fullPath.startsWith(`${root}/`)) {
      return fullPath.slice(root.length + 1);
    }

    return fullPath;
  }

  remotePath(file: TFile): string {
    const relative = normalizePath(this.relativePath(file)).replace(/^\/+/, "");
    const path = normalizePath(`${REMOTE_CONTENT_ROOT}/${relative}`).replace(/^\/+/, "");

    if (!relative || !isSafeContentPath(path)) {
      throw new Error("远端路径必须位于仓库 content 目录内。");
    }

    return path;
  }

  getState(file: TFile): LocalFileState {
    return this.data.files[file.path] ?? { status: "draft" };
  }

  async cacheEffectiveState(file: TFile, state: LocalFileState) {
    const current = this.data.files[file.path];

    if (
      current?.remotePath === state.remotePath &&
      current?.sha === state.sha &&
      current?.status === state.status &&
      current?.lastSyncedAt === state.lastSyncedAt &&
      current?.lastSyncedHash === state.lastSyncedHash &&
      current?.htmlUrl === state.htmlUrl
    ) {
      return;
    }

    this.data.files[file.path] = state;
    await this.saveAllData();
  }

  async getEffectiveState(file: TFile): Promise<LocalFileState> {
    let state = this.getState(file);

    try {
      state = await this.syncFileState(file);
    } catch {
      // Keep the last local state when GitHub is temporarily unavailable.
    }

    if (state.status !== "synced" || !state.lastSyncedHash) {
      return state;
    }

    const content = await this.app.vault.read(file);
    const currentHash = hashContent(content);

    if (currentHash !== state.lastSyncedHash) {
      const nextState = { ...state, status: "modified" as const };
      await this.cacheEffectiveState(file, nextState);
      return nextState;
    }

    await this.cacheEffectiveState(file, state);
    return state;
  }

  async setState(file: TFile, patch: Partial<LocalFileState>) {
    this.data.files[file.path] = { ...this.getState(file), ...patch };
    await this.saveAllData();
    await this.refreshStatusBar();
  }

  setStatusBarState(statusClass: string | null) {
    this.statusBarEl.removeClass("is-draft", "is-synced", "is-modified", "is-deleted", "is-failed", "is-inactive");

    if (statusClass) {
      this.statusBarEl.addClass(statusClass);
    }
  }

  async refreshStatusBar() {
    const file = this.getCurrentFile();

    if (!file) {
      this.setStatusBarState("is-inactive");
      setIcon(this.statusBarIconEl, "git-branch");
      this.statusBarTextEl.setText("无活动文章");
      return;
    }

    if (!this.isInsideRoot(file)) {
      this.setStatusBarState("is-inactive");
      setIcon(this.statusBarIconEl, "git-branch");
      this.statusBarTextEl.setText("不在同步目录");
      return;
    }

    const state = await this.getEffectiveState(file);
    const label = toStatusLabel(state.status);
    this.setStatusBarState(toStatusClass(state.status));

    setIcon(this.statusBarIconEl, toStatusIcon(state.status));
    this.statusBarTextEl.setText(label);
  }

  async ensureTemplateFrontmatter(file: TFile) {
    if (!this.isInsideRoot(file)) {
      throw new Error("当前文章不在 Local Root Path 内。");
    }

    const content = await this.app.vault.read(file);
    const parsed = parseFrontmatter(content);

    if (Object.keys(parsed.data).length > 0) {
      new Notice("当前文章已经存在文章属性。");
      return;
    }

    const nextContent = `${buildFrontmatter(file)}${content}`;
    await this.app.vault.modify(file, nextContent);
    new Notice("文章属性已插入。");
  }

  getSyncMenuTitle(state: LocalFileState): string {
    switch (state.status) {
      case "modified":
      case "deleted":
        return "重新同步";
      case "failed":
        return "再次同步";
      case "synced":
        return "已同步";
      case "draft":
      default:
        return "同步到 GitHub";
    }
  }

  buildActionContext(file: TFile, state: LocalFileState, hasProperties: boolean): ArticleActionContext {
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

  async getActionContext(file: TFile): Promise<ArticleActionContext> {
    const [state, content] = await Promise.all([this.getEffectiveState(file), this.app.vault.read(file)]);
    const properties = parseFrontmatter(content).data;
    return this.buildActionContext(file, state, Object.keys(properties).length > 0);
  }

  getCachedActionContext(file: TFile): ArticleActionContext {
    const properties = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const state = this.getState(file);
    return this.buildActionContext(file, state, Object.keys(properties).length > 0);
  }

  async showRibbonMenu(evt: MouseEvent) {
    const menu = new Menu();
    const currentFile = this.getCurrentFile();
    const context = currentFile ? await this.getActionContext(currentFile) : null;

    menu.setUseNativeMenu(true);
    menu.addItem((item) =>
      item
        .setTitle(context?.syncTitle ?? "同步到 GitHub")
        .setIcon("cloud-upload")
        .setDisabled(!context?.canSync)
        .onClick(() => {
          if (context) {
            void this.runWithNotice(() => this.syncFileToGitHub(context.file));
          }
        })
    );
    menu.addItem((item) =>
      item
        .setTitle("打开 GitHub")
        .setIcon("external-link")
        .setDisabled(!context?.canOpenRemote)
        .onClick(() => {
          if (context) {
            void this.runWithNotice(() => this.openRemoteUrlForFile(context.file));
          }
        })
    );
    menu.addItem((item) =>
      item
        .setTitle("详情")
        .setIcon("git-branch")
        .setDisabled(!context)
        .onClick(() => this.openActionModal(context?.file))
    );
    menu.addItem((item) =>
      item
        .setTitle("插入文章属性")
        .setIcon("file-plus-2")
        .setDisabled(!context?.canInsertProperties)
        .onClick(() => {
          if (context) {
            void this.runWithNotice(() => this.ensureTemplateFrontmatter(context.file));
          }
        })
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(context?.state.status === "deleted" ? "远端已删除" : "删除远端文件")
        .setIcon("cloud-off")
        .setWarning(true)
        .setDisabled(!context?.canDeleteRemote)
        .onClick(() => {
          if (context) {
            void this.runWithNotice(() => this.deleteRemoteFile(context.file));
          }
        })
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("测试 GitHub 连接")
        .setIcon("globe")
        .onClick(() => void this.runWithNotice(() => this.testConnection()))
    );
    menu.addItem((item) =>
      item
        .setTitle("设置")
        .setIcon("settings")
        .onClick(() => this.openPluginSettings())
    );
    menu.addItem((item) =>
      item
        .setTitle(`版本 v${this.manifest.version}`)
        .setIcon("info")
        .onClick(() => this.openVersionInfo())
    );
    menu.showAtMouseEvent(evt);
  }

  addArticleContextMenuItems(menu: Menu, file: TFile) {
    const context = this.getCachedActionContext(file);

    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(context.syncTitle)
        .setIcon("cloud-upload")
        .setDisabled(!context.canSync)
        .onClick(() => void this.runWithNotice(() => this.syncFileToGitHub(context.file)))
    );
    menu.addItem((item) =>
      item
        .setTitle("打开 GitHub")
        .setIcon("external-link")
        .setDisabled(!context.canOpenRemote)
        .onClick(() => void this.runWithNotice(() => this.openRemoteUrlForFile(context.file)))
    );
    menu.addItem((item) =>
      item
        .setTitle("详情")
        .setIcon("git-branch")
        .onClick(() => this.openActionModal(context.file))
    );
    menu.addItem((item) =>
      item
        .setTitle("插入文章属性")
        .setIcon("file-plus-2")
        .setDisabled(!context.canInsertProperties)
        .onClick(() => void this.runWithNotice(() => this.ensureTemplateFrontmatter(context.file)))
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(context.state.status === "deleted" ? "远端已删除" : "删除远端文件")
        .setIcon("cloud-off")
        .setWarning(true)
        .setDisabled(!context.canDeleteRemote)
        .onClick(() => void this.runWithNotice(() => this.deleteRemoteFile(context.file)))
    );
  }

  openActionModal(file?: TFile | null) {
    new GitSyncerActionModal(this.app, this, file ?? this.getCurrentFile()).open();
  }

  openPluginSettings() {
    const internalApp = this.app as App & {
      setting?: {
        open: () => void;
        openTabById?: (id: string) => void;
      };
    };

    if (!internalApp.setting) {
      new Notice("当前环境不支持直接跳转插件设置。");
      return;
    }

    internalApp.setting.open();
    internalApp.setting.openTabById?.(this.manifest.id);
  }

  openVersionInfo() {
    new PluginVersionModal(this.app, this).open();
  }

  async runWithNotice(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      new Notice(message);
    }
  }

  buildGitHubApiUrl(path: string, params?: Record<string, string | undefined>): string {
    const url = new URL(`https://api.github.com${path}`);

    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });

    return url.toString();
  }

  buildContentApiPath(remotePath: string): string {
    const repository = this.getRepository();
    return `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/contents/${encodeGitHubPath(remotePath)}`;
  }

  buildRepoApiPath(): string {
    const repository = this.getRepository();
    return `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
  }

  buildBranchApiPath(): string {
    return `${this.buildRepoApiPath()}/branches/${encodeURIComponent(this.settings.branch.trim())}`;
  }

  buildGitHubBlobUrl(remotePath: string): string {
    const repository = this.getRepository();
    return `https://github.com/${repository.owner}/${repository.repo}/blob/${encodeURIComponent(this.settings.branch.trim())}/${encodeGitHubPath(remotePath)}`;
  }

  async githubRequest<TResponse>(
    method: "GET" | "PUT" | "DELETE",
    path: string,
    payload?: unknown,
    params?: Record<string, string | undefined>
  ): Promise<TResponse> {
    const response = await requestUrl({
      url: this.buildGitHubApiUrl(path, params),
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.settings.githubToken.trim()}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: payload ? JSON.stringify(payload) : undefined
    });

    if (response.status >= 400) {
      let errorMessage = response.text;

      try {
        const parsed = JSON.parse(response.text) as GitHubErrorPayload;
        if (parsed.message) {
          errorMessage = parsed.message;
        }
      } catch {
        // Keep raw response text when it is not JSON.
      }

      throw new GitHubRequestError(response.status, errorMessage || `GitHub HTTP ${response.status}`);
    }

    return response.json as TResponse;
  }

  async getRemoteContent(remotePath: string): Promise<GitHubContentResponse | null> {
    if (!isSafeContentPath(remotePath)) {
      throw new Error("远端路径必须位于仓库 content 目录内。");
    }

    try {
      const result = await this.githubRequest<GitHubContentResponse | GitHubContentResponse[]>(
        "GET",
        this.buildContentApiPath(remotePath),
        undefined,
        { ref: this.settings.branch.trim() }
      );

      if (Array.isArray(result)) {
        throw new Error("远端路径指向目录，不能作为文章同步目标。");
      }

      if (result.type !== "file") {
        throw new Error("远端路径不是普通文件，不能作为文章同步目标。");
      }

      return result;
    } catch (error) {
      if (error instanceof GitHubRequestError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  async syncFileState(file: TFile): Promise<LocalFileState> {
    if (!this.isInsideRoot(file)) {
      return { status: "draft" };
    }

    this.validateConfig();

    const remotePath = this.remotePath(file);
    const current = this.getState(file);
    const remote = await this.getRemoteContent(remotePath);

    if (!remote) {
      const nextState: LocalFileState = current.sha
        ? {
            ...current,
            remotePath,
            sha: undefined,
            htmlUrl: undefined,
            status: "deleted"
          }
        : { remotePath, status: "draft" };

      this.data.files[file.path] = nextState;
      await this.saveAllData();
      return nextState;
    }

    const nextState: LocalFileState = {
      ...current,
      remotePath,
      sha: remote.sha,
      htmlUrl: remote.html_url ?? this.buildGitHubBlobUrl(remotePath),
      status: "synced"
    };

    if (current.sha !== remote.sha) {
      nextState.lastSyncedHash = undefined;
    }

    this.data.files[file.path] = nextState;
    await this.saveAllData();
    return nextState;
  }

  async testConnection() {
    this.validateConfig();
    const repository = this.getRepository();
    const user = await this.githubRequest<GitHubUserResponse>("GET", "/user");

    await this.githubRequest<unknown>("GET", this.buildRepoApiPath());
    await this.githubRequest<unknown>("GET", this.buildBranchApiPath());

    if (user.login.toLowerCase() !== this.settings.githubUsername.trim().toLowerCase()) {
      throw new Error(`Token 用户为 ${user.login}，与配置的 GitHub Username 不一致。`);
    }

    new Notice(`连接成功：${repository.owner}/${repository.repo}@${this.settings.branch.trim()}`);
  }

  async syncFileToGitHub(file: TFile) {
    this.validateConfig();

    if (!this.isInsideRoot(file)) {
      throw new Error("当前文章不在 Local Root Path 内。");
    }

    const content = await this.app.vault.read(file);
    const currentHash = hashContent(content);
    const remotePath = this.remotePath(file);

    try {
      const remote = await this.getRemoteContent(remotePath);
      const result = await this.githubRequest<GitHubPutResponse>("PUT", this.buildContentApiPath(remotePath), {
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
        lastSyncedAt: formatDateTime(new Date()),
        lastSyncedHash: currentHash,
        htmlUrl
      });

      new Notice(`同步成功：${remotePath}`);
    } catch (error) {
      await this.setState(file, { remotePath, status: "failed" });
      throw error;
    }
  }

  async syncCurrentNote() {
    const file = this.getCurrentFile();

    if (!file) {
      throw new Error("当前没有激活的 Markdown 文件。");
    }

    await this.syncFileToGitHub(file);
  }

  async deleteRemoteFile(file: TFile) {
    this.validateConfig();

    if (!this.isInsideRoot(file)) {
      throw new Error("当前文章不在 Local Root Path 内。");
    }

    const remotePath = this.remotePath(file);
    const remote = await this.getRemoteContent(remotePath);

    if (!remote) {
      await this.setState(file, {
        remotePath,
        sha: undefined,
        htmlUrl: undefined,
        status: "deleted"
      });
      new Notice("远端文件不存在。");
      return;
    }

    await this.githubRequest<GitHubDeleteResponse>("DELETE", this.buildContentApiPath(remotePath), {
      message: `sync: delete ${remotePath}`,
      sha: remote.sha,
      branch: this.settings.branch.trim()
    });

    await this.setState(file, {
      remotePath,
      sha: undefined,
      htmlUrl: undefined,
      status: "deleted"
    });
    new Notice("远端文件已删除。");
  }

  async deleteCurrentRemoteNote() {
    const file = this.getCurrentFile();

    if (!file) {
      throw new Error("当前没有激活的 Markdown 文件。");
    }

    await this.deleteRemoteFile(file);
  }

  async openRemoteUrlForFile(file: TFile) {
    const state = await this.getEffectiveState(file);
    const remotePath = state.remotePath ?? this.remotePath(file);

    if (state.status === "deleted") {
      new Notice("远端文件已经删除。");
      return;
    }

    window.open(state.htmlUrl ?? this.buildGitHubBlobUrl(remotePath), "_blank");
  }

  async openRemoteUrl() {
    const file = this.getCurrentFile();
    if (!file) {
      new Notice("当前没有激活文件。");
      return;
    }

    await this.openRemoteUrlForFile(file);
  }
}

class GitSyncerActionModal extends Modal {
  plugin: ObsidianGitSyncerPlugin;
  targetFile: TFile | null;

  constructor(app: App, plugin: ObsidianGitSyncerPlugin, targetFile?: TFile | null) {
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
      contentEl.createEl("p", { text: "当前没有激活的 Markdown 文件。" });
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
    const syncButtonText =
      state.status === "modified"
        ? "更新同步"
        : state.status === "deleted"
          ? "重新同步"
          : state.status === "failed"
            ? "再次同步"
            : state.status === "synced"
              ? "已同步"
              : "同步";
    const syncDescription =
      !inRoot
        ? "当前文章不在 Local Root Path 内。"
        : state.status === "synced"
          ? "当前远端文件已经是最新状态。"
          : `上传当前笔记到 GitHub 仓库的 ${REMOTE_CONTENT_ROOT} 目录。`;
    const badge = contentEl.createDiv({
      cls: `obsidian-git-syncer-status-badge ${toStatusClass(state.status)}`
    });
    badge.setText(toStatusLabel(state.status));

    contentEl.createEl("p", { text: `当前文件：${file.path}` });
    contentEl.createEl("p", {
      text: `远端路径：${state.remotePath ?? (inRoot ? this.plugin.remotePath(file) : `${REMOTE_CONTENT_ROOT}/...`)}`,
      cls: "obsidian-git-syncer-muted"
    });
    contentEl.createEl("p", {
      text: `状态：${toStatusLabel(state.status)}${state.lastSyncedAt ? ` · 最近同步 ${state.lastSyncedAt}` : ""}`,
      cls: "obsidian-git-syncer-muted"
    });
    contentEl.createEl("p", {
      text: inRoot
        ? `当前文件位于同步目录内：${this.plugin.settings.localRootPath}`
        : `当前文件不在同步目录内：${this.plugin.settings.localRootPath}`,
      cls: "obsidian-git-syncer-muted"
    });

    new Setting(contentEl)
      .setName("插入文章属性")
      .setDesc(hasFrontmatter ? "当前文章已经存在文章属性。" : "为当前文章插入 Quartz 常用文章属性。")
      .addButton((button) =>
        button
          .setButtonText(hasFrontmatter ? "已存在" : "执行")
          .setDisabled(!inRoot || hasFrontmatter)
          .onClick(async () => {
            await this.runAction(() => this.plugin.ensureTemplateFrontmatter(file));
            await this.render();
          })
      );

    new Setting(contentEl)
      .setName("同步当前文章")
      .setDesc(syncDescription)
      .addButton((button) => {
        button.setButtonText(syncButtonText).setDisabled(!canSync);

        if (canSync) {
          button.setCta();
        }

        button.onClick(async () => {
          await this.runAction(() => this.plugin.syncFileToGitHub(file));
          await this.render();
        });
      });

    new Setting(contentEl)
      .setName("删除远端文件")
      .setDesc("从 GitHub 仓库 content 目录删除当前文章对应文件。")
      .addButton((button) => {
        button.setButtonText("删除").setDisabled(!canDeleteRemote);

        if (canDeleteRemote) {
          button.setWarning();
        }

        button.onClick(async () => {
          await this.runAction(() => this.plugin.deleteRemoteFile(file));
          await this.render();
        });
      });

    new Setting(contentEl)
      .setName("打开 GitHub 文件")
      .setDesc(canOpenRemote ? "在浏览器中打开当前文章的 GitHub 文件页面。" : "当前文章没有可打开的远端文件。")
      .addButton((button) =>
        button
          .setButtonText("打开")
          .setDisabled(!canOpenRemote)
          .onClick(() => void this.plugin.openRemoteUrlForFile(file))
      );
  }

  async runAction(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      new Notice(message);
    }
  }
}

class PluginVersionModal extends Modal {
  plugin: ObsidianGitSyncerPlugin;

  constructor(app: App, plugin: ObsidianGitSyncerPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "插件版本信息" });
    contentEl.createEl("p", { text: `名称：${this.plugin.manifest.name}` });
    contentEl.createEl("p", { text: `版本：${this.plugin.manifest.version}` });
    contentEl.createEl("p", { text: `插件 ID：${this.plugin.manifest.id}` });
    contentEl.createEl("p", { text: `最低 Obsidian 版本：${this.plugin.manifest.minAppVersion}` });
  }
}

class GitSyncerSettingTab extends PluginSettingTab {
  plugin: ObsidianGitSyncerPlugin;
  activeSection: "general" | "remote" | "sync" | "media" | "debug" = "general";
  searchQuery = "";
  rootEl: HTMLElement | null = null;
  navEl: HTMLElement | null = null;
  panelEl: HTMLElement | null = null;

  constructor(app: App, plugin: ObsidianGitSyncerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSections() {
    return [
      {
        id: "general" as const,
        label: "通用设置",
        title: "通用设置",
        description: "管理本地同步目录和插件基础信息。"
      },
      {
        id: "remote" as const,
        label: "GitHub 配置",
        title: "GitHub 配置",
        description: "配置 GitHub 仓库、Token、用户名和目标分支。"
      },
      {
        id: "sync" as const,
        label: "同步控制",
        title: "同步控制",
        description: "查看 content 目录映射、状态缓存和同步策略。"
      },
      {
        id: "media" as const,
        label: "附件处理",
        title: "附件处理",
        description: "后续可扩展图片上传、附件复制和资源引用重写。"
      },
      {
        id: "debug" as const,
        label: "调试",
        title: "调试与日志",
        description: "查看插件版本和诊断入口。"
      }
    ];
  }

  getFilterText(...parts: Array<string | undefined>) {
    return parts
      .filter((part): part is string => Boolean(part))
      .join(" ")
      .toLowerCase();
  }

  createSearchableSetting(containerEl: HTMLElement, ...parts: Array<string | undefined>) {
    const setting = new Setting(containerEl);
    setting.settingEl.dataset.filterText = this.getFilterText(...parts);
    return setting;
  }

  renderSearchBar(containerEl: HTMLElement) {
    const searchSetting = new Setting(containerEl).setClass("obsidian-git-syncer-settings-search-row");
    searchSetting.infoEl.remove();
    searchSetting.addSearch((search) =>
      search.setPlaceholder("搜索面板设置...").setValue(this.searchQuery).onChange((value) => {
        this.searchQuery = value;
        const panelEl = this.containerEl.querySelector<HTMLElement>(".obsidian-git-syncer-settings-panel");
        if (panelEl) {
          this.applySearchFilter(panelEl);
        }
      })
    );
  }

  renderSectionTabs(containerEl: HTMLElement) {
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

    const items = Array.from(this.navEl.querySelectorAll<HTMLElement>(".obsidian-git-syncer-settings-nav-item"));
    items.forEach((item, index) => {
      const section = this.getSections()[index];
      item.classList.toggle("is-active", section?.id === this.activeSection);
    });
  }

  renderPlaceholderSetting(containerEl: HTMLElement, title: string, description: string, badge = "规划中") {
    this.createSearchableSetting(containerEl, title, description, badge)
      .setName(title)
      .setDesc(`${description}（${badge}）`);
  }

  renderSectionSubheading(containerEl: HTMLElement, text: string) {
    new Setting(containerEl).setName(text).setHeading();
  }

  renderGeneralSettings(containerEl: HTMLElement) {
    const localRootDescription = this.plugin.getExistingFolder(this.plugin.settings.localRootPath)
      ? `当前目录有效：${this.plugin.settings.localRootPath}`
      : "只有该目录内的 Markdown 才允许同步。当前值无效时请重新选择目录。";

    this.createSearchableSetting(containerEl, "Local Root Path", localRootDescription, this.plugin.settings.localRootPath)
      .setName("Local Root Path")
      .setDesc(localRootDescription)
      .addText((text) =>
        text.setValue(this.plugin.settings.localRootPath).onChange(async (value) => {
          this.plugin.settings.localRootPath = normalizePath(value.trim());
          await this.plugin.saveSettings();
          this.display();
        })
      )
      .addButton((button) =>
        button.setButtonText("选择目录").onClick(() => {
          new FolderSelectModal(this.app, this.plugin, async (folder) => {
            try {
              await this.plugin.setLocalRootPath(folder.path);
              new Notice(`已设置 Local Root Path：${folder.path}`);
              this.display();
            } catch (error) {
              const message = error instanceof Error ? error.message : "设置失败";
              new Notice(message);
            }
          }).open();
        })
      );

    this.createSearchableSetting(containerEl, "远端目录", "固定写入 GitHub 仓库 content 目录。", REMOTE_CONTENT_ROOT)
      .setName("远端目录")
      .setDesc("插件只读写仓库 content 目录；本地同步目录内的相对路径会映射到 content 下。");

    this.renderSectionSubheading(containerEl, "帮助与支持");

    this.createSearchableSetting(containerEl, "插件版本", "查看当前插件版本、插件 ID 与兼容性信息。")
      .setName("插件版本")
      .setDesc("查看当前插件版本、插件 ID 与兼容性信息。")
      .addButton((button) =>
        button.setButtonText("查看").onClick(() => {
          new PluginVersionModal(this.app, this.plugin).open();
        })
      );
  }

  renderRemoteSettings(containerEl: HTMLElement) {
    this.createSearchableSetting(
      containerEl,
      "Repository URL",
      "例如 https://github.com/imliusx/obsidian-git-syncer.git",
      this.plugin.settings.repositoryUrl
    )
      .setName("Repository URL")
      .setDesc("GitHub 项目仓库地址，支持 HTTPS、SSH 或 owner/repo。")
      .addText((text) =>
        text
          .setPlaceholder("https://github.com/owner/repo.git")
          .setValue(this.plugin.settings.repositoryUrl)
          .onChange(async (value) => {
            this.plugin.settings.repositoryUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    this.createSearchableSetting(containerEl, "GitHub Username", "当前授权 Token 对应的 GitHub 用户名。", this.plugin.settings.githubUsername)
      .setName("GitHub Username")
      .setDesc("当前授权 Token 对应的 GitHub 用户名。")
      .addText((text) =>
        text
          .setPlaceholder("imliusx")
          .setValue(this.plugin.settings.githubUsername)
          .onChange(async (value) => {
            this.plugin.settings.githubUsername = value.trim();
            await this.plugin.saveSettings();
          })
      );

    this.createSearchableSetting(containerEl, "GitHub Token", "Fine-grained Token 需要开启 Contents 读写权限。")
      .setName("GitHub Token")
      .setDesc("Fine-grained Token 需要授权目标仓库，并开启 Contents 读写权限。")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("github_pat_...")
          .setValue(this.plugin.settings.githubToken)
          .onChange(async (value) => {
            this.plugin.settings.githubToken = value.trim();
            await this.plugin.saveSettings();
          });
      });

    this.createSearchableSetting(containerEl, "Branch", "例如 main", this.plugin.settings.branch)
      .setName("Branch")
      .setDesc("同步写入的目标分支。")
      .addText((text) =>
        text
          .setPlaceholder("main")
          .setValue(this.plugin.settings.branch)
          .onChange(async (value) => {
            this.plugin.settings.branch = value.trim();
            await this.plugin.saveSettings();
          })
      );

    this.createSearchableSetting(containerEl, "测试连接", "验证当前仓库、Token 和分支配置是否可访问。")
      .setName("测试连接")
      .setDesc("验证当前仓库、Token 和分支配置是否可访问。")
      .addButton((button) =>
        button.setButtonText("测试连接").onClick(async () => {
          try {
            await this.plugin.testConnection();
          } catch (error) {
            const message = error instanceof Error ? error.message : "连接失败";
            new Notice(message);
          }
        })
      );
  }

  renderSyncSettings(containerEl: HTMLElement) {
    this.createSearchableSetting(containerEl, "Content Root", "固定为 content", REMOTE_CONTENT_ROOT)
      .setName("Content Root")
      .setDesc("远端读写路径固定为 content/<本地相对路径>。");

    this.createSearchableSetting(containerEl, "同步说明", "状态缓存、本地修改检测、远端删除检测", "说明")
      .setName("同步说明")
      .setDesc("插件会缓存最近同步的内容哈希；本地内容变化显示为已修改，远端文件不存在显示为远端已删除。");

    this.createSearchableSetting(containerEl, "清理状态缓存", "清理本地同步状态，不影响 GitHub 仓库文件。")
      .setName("清理状态缓存")
      .setDesc("清理本地同步状态，不影响 GitHub 仓库文件。")
      .addButton((button) =>
        button.setButtonText("清理").setWarning().onClick(async () => {
          this.plugin.data.files = {};
          await this.plugin.saveAllData();
          await this.plugin.refreshStatusBar();
          new Notice("状态缓存已清理。");
        })
      );
  }

  renderMediaSettings(containerEl: HTMLElement) {
    this.renderPlaceholderSetting(
      containerEl,
      "附件与图片",
      "这里将用于配置图片复制策略、附件目录映射、远程资源地址与引用重写规则。"
    );
  }

  renderDebugSettings(containerEl: HTMLElement) {
    this.renderPlaceholderSetting(
      containerEl,
      "调试与日志",
      "这里将用于查看同步日志、请求结果和错误排查信息。"
    );

    this.createSearchableSetting(containerEl, "插件版本信息", "查看版本、插件 ID 和最低兼容版本。")
      .setName("插件版本信息")
      .setDesc("查看版本、插件 ID 和最低兼容版本。")
      .addButton((button) =>
        button.setButtonText("打开").onClick(() => {
          new PluginVersionModal(this.app, this.plugin).open();
        })
      );
  }

  applySearchFilter(panelEl: HTMLElement) {
    const query = this.searchQuery.trim().toLowerCase();
    const items = Array.from(panelEl.querySelectorAll<HTMLElement>(".setting-item[data-filter-text]"));
    let visibleCount = 0;

    items.forEach((itemEl) => {
      const matches = !query || (itemEl.dataset.filterText ?? "").includes(query);
      itemEl.classList.toggle("is-hidden", !matches);
      if (matches) {
        visibleCount += 1;
      }
    });

    const emptyStateEl = panelEl.querySelector<HTMLElement>(".obsidian-git-syncer-settings-empty");
    if (emptyStateEl) {
      emptyStateEl.classList.toggle("is-hidden", visibleCount > 0);
    }
  }

  renderActiveSection(containerEl: HTMLElement) {
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

  renderPanel(panelEl: HTMLElement) {
    panelEl.empty();
    this.renderActiveSection(panelEl);
    panelEl.createDiv({
      cls: "obsidian-git-syncer-settings-empty is-hidden",
      text: "没有匹配到当前筛选条件的设置项。"
    });
    this.applySearchFilter(panelEl);
  }

  display(): void {
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
}

class FolderSelectModal extends FuzzySuggestModal<TFolder> {
  plugin: ObsidianGitSyncerPlugin;
  onChooseFolder: (folder: TFolder) => Promise<void> | void;

  constructor(
    app: App,
    plugin: ObsidianGitSyncerPlugin,
    onChooseFolder: (folder: TFolder) => Promise<void> | void
  ) {
    super(app);
    this.plugin = plugin;
    this.onChooseFolder = onChooseFolder;
    this.setPlaceholder("选择 Local Root Path 目录");
  }

  getItems(): TFolder[] {
    return this.plugin.getAllVaultFolders();
  }

  getItemText(folder: TFolder): string {
    return folder.path;
  }

  async onChooseItem(folder: TFolder): Promise<void> {
    await this.onChooseFolder(folder);
  }
}
