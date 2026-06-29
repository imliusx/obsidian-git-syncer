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
  connection?: ConnectionState;
}

interface ConnectionState {
  status: "unknown" | "success" | "failed" | "stale";
  message: string;
  checkedAt?: string;
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
  content?: string;
  encoding?: string;
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

interface GitHubRepoResponse {
  full_name: string;
  permissions?: {
    admin?: boolean;
    maintain?: boolean;
    push?: boolean;
    triage?: boolean;
    pull?: boolean;
  };
}

interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree" | string;
  sha: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeItem[];
  truncated: boolean;
}

interface RemoteSyncFile {
  remotePath: string;
  sha: string;
  htmlUrl: string;
}

type SyncCenterStatus = "unpublished" | "modified" | "published" | "localDeleted";
type SyncCenterOperation = "sync" | "pull" | "delete";

interface SyncCenterItem {
  id: string;
  name: string;
  status: SyncCenterStatus;
  localPath?: string;
  remotePath: string;
  folderPath: string;
  file?: TFile;
  remote?: RemoteSyncFile;
  state?: LocalFileState;
}

interface SyncTreeNode {
  name: string;
  path: string;
  children: Map<string, SyncTreeNode>;
  items: SyncCenterItem[];
}

const REMOTE_CONTENT_ROOT = "content";
const VAULT_ROOT_PATH = "/";

const DEFAULT_SETTINGS: GitHubSyncSettings = {
  repositoryUrl: "",
  githubUsername: "",
  githubToken: "",
  branch: "main",
  localRootPath: "content"
};

const DEFAULT_DATA: PersistedData = {
  files: {},
  connection: {
    status: "unknown",
    message: "尚未测试连接。"
  }
};

class GitHubRequestError extends Error {
  status: number;
  method: string;
  path: string;

  constructor(status: number, message: string, method: string, path: string) {
    super(message);
    this.status = status;
    this.method = method;
    this.path = path;
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
  const slug = resolvedTitle
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return [
    "---",
    `title: ${escapeYaml(resolvedTitle)}`,
    `slug: ${slug || file.basename}`,
    `date: ${today}`,
    "category: 开发",
    "tags:",
    "  - Java",
    "  - NextJS",
    "description: 文章摘要",
    "cover:",
    "published: true",
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
  return encodeBytesBase64(bytes);
}

function encodeBytesBase64(bytes: Uint8Array): string {
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

function textBytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function decodeBase64Bytes(input: string): Uint8Array {
  const binary = atob(input.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeBase64(input: string): string {
  return new TextDecoder().decode(decodeBase64Bytes(input));
}

function hashBytes(input: ArrayBuffer): string {
  const bytes = new Uint8Array(input);
  let hash = 0;

  for (const byte of bytes) {
    hash = (hash * 31 + byte) | 0;
  }

  return `h${Math.abs(hash)}`;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function gitBlobSha(input: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(input);
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const payload = new Uint8Array(header.byteLength + bytes.byteLength);
  payload.set(header, 0);
  payload.set(bytes, header.byteLength);
  const digest = await crypto.subtle.digest("SHA-1", payload);
  return toHex(new Uint8Array(digest));
}

function isSyncableFile(file: TFile): boolean {
  const name = file.name.toLowerCase();
  if (isHiddenPath(file.path) || name.startsWith(".") || name === ".ds_store" || name === "thumbs.db") {
    return false;
  }

  return true;
}

function isHiddenPath(path: string): boolean {
  const normalized = normalizePath(path).replace(/^\/+/, "");
  if (!normalized) {
    return false;
  }

  return normalized.split("/").some((segment) => segment.startsWith("."));
}

function normalizeLocalRootPath(path: string): string {
  const normalized = normalizePath(path.trim());
  if (!normalized || normalized === VAULT_ROOT_PATH || normalized === ".") {
    return VAULT_ROOT_PATH;
  }

  return normalized.replace(/^\/+/, "").replace(/\/+$/, "") || VAULT_ROOT_PATH;
}

function displayLocalRootPath(path: string): string {
  return normalizeLocalRootPath(path);
}

function isImagePath(path: string): boolean {
  return /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(path);
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

function toSyncCenterStatusLabel(status: SyncCenterStatus): string {
  switch (status) {
    case "unpublished":
      return "本地未发布";
    case "modified":
      return "已修改";
    case "published":
      return "已发布";
    case "localDeleted":
      return "本地已删除";
    default:
      return status;
  }
}

function toSyncCenterSummaryLabel(status: SyncCenterStatus): string {
  switch (status) {
    case "unpublished":
      return "未发布";
    case "modified":
      return "已修改";
    case "published":
      return "已发布";
    case "localDeleted":
      return "已删除";
    default:
      return status;
  }
}

function toSyncCenterStatusClass(status: SyncCenterStatus): string {
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

function toSyncCenterStatusIcon(status: SyncCenterStatus): string {
  switch (status) {
    case "unpublished":
      return "cloud-upload";
    case "modified":
      return "pencil";
    case "published":
      return "cloud-check";
    case "localDeleted":
      return "cloud-off";
    default:
      return "circle";
  }
}

export default class ObsidianGitSyncerPlugin extends Plugin {
  settings: GitHubSyncSettings = DEFAULT_SETTINGS;
  data: PersistedData = DEFAULT_DATA;

  async onload() {
    await this.loadSettings();

    this.addRibbonIcon("git-branch", "Obsidian Git Syncer", (evt) => {
      this.showRibbonMenu(evt);
    });
    this.addCommand({
      id: "open-sync-center",
      name: "打开同步中心",
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

  async markConnectionStale() {
    this.data.connection = {
      status: "stale",
      message: "配置已变更，请重新测试连接。"
    };
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
    const normalized = normalizeLocalRootPath(path);
    if (normalized === VAULT_ROOT_PATH) {
      return this.app.vault.getRoot();
    }

    const target = this.app.vault.getAbstractFileByPath(normalized);
    return target instanceof TFolder ? target : null;
  }

  getAllVaultFolders(): TFolder[] {
    const folders = new Map<string, TFolder>();
    folders.set(VAULT_ROOT_PATH, this.app.vault.getRoot());

    this.app.vault.getAllLoadedFiles().forEach((entry) => {
      if (entry instanceof TFolder && !isHiddenPath(entry.path)) {
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

  async setLocalRootPath(path: string) {
    const normalized = normalizeLocalRootPath(path);

    const folder = this.getExistingFolder(normalized);
    if (!folder) {
      throw new Error("该目录不存在，请从 Vault 中选择已有目录。");
    }

    this.settings.localRootPath = normalized === VAULT_ROOT_PATH ? VAULT_ROOT_PATH : folder.path;
    await this.saveSettings();
  }

  getCurrentFile(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    return file instanceof TFile && file.extension === "md" ? file : null;
  }

  isInsideRoot(file: TFile): boolean {
    const root = normalizeLocalRootPath(this.settings.localRootPath);
    if (root === VAULT_ROOT_PATH) {
      return true;
    }

    return file.path === root || file.path.startsWith(`${root}/`);
  }

  relativePath(file: TFile): string {
    const root = normalizeLocalRootPath(this.settings.localRootPath);
    const fullPath = normalizePath(file.path);

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

  remotePath(file: TFile): string {
    const relative = normalizePath(this.relativePath(file)).replace(/^\/+/, "");
    const path = normalizePath(`${REMOTE_CONTENT_ROOT}/${relative}`).replace(/^\/+/, "");

    if (!relative || !isSafeContentPath(path)) {
      throw new Error("远端路径必须位于仓库 content 目录内。");
    }

    return path;
  }

  localPathFromRemotePath(remotePath: string): string {
    const normalizedRemotePath = normalizePath(remotePath).replace(/^\/+/, "");

    if (!isSafeContentPath(normalizedRemotePath)) {
      throw new Error("远端路径必须位于仓库 content 目录内。");
    }

    const relative = normalizedRemotePath.slice(REMOTE_CONTENT_ROOT.length + 1);
    const localRoot = normalizeLocalRootPath(this.settings.localRootPath);
    if (localRoot === VAULT_ROOT_PATH) {
      return normalizePath(relative);
    }

    return normalizePath(`${localRoot}/${relative}`);
  }

  async ensureFolderPath(folderPath: string) {
    const normalized = normalizePath(folderPath).replace(/\/$/, "");

    if (!normalized) {
      return;
    }

    const parts = normalized.split("/");
    let current = "";

    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const entry = this.app.vault.getAbstractFileByPath(current);

      if (entry instanceof TFolder) {
        continue;
      }

      if (entry) {
        throw new Error(`无法创建目录，路径已被文件占用：${current}`);
      }

      await this.app.vault.createFolder(current);
    }
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

  async refreshStatusBar() {
    return;
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
            void this.runWithNotice(async () => {
              await this.syncFileToGitHub(context.file);
            });
          }
        })
    );
    menu.addItem((item) =>
      item
        .setTitle("同步中心")
        .setIcon("list-tree")
        .onClick(() => this.openSyncCenter())
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
        .onClick(() =>
          void this.runWithNotice(async () => {
            await this.testConnection();
          })
        )
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
        .onClick(() =>
          void this.runWithNotice(async () => {
            await this.syncFileToGitHub(context.file);
          })
        )
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

  openSyncCenter() {
    new SyncCenterModal(this.app, this).open();
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

  buildGitTreeApiPath(): string {
    const repository = this.getRepository();
    return `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/git/trees/${encodeURIComponent(this.settings.branch.trim())}`;
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

      throw new GitHubRequestError(response.status, errorMessage || `GitHub HTTP ${response.status}`, method, path);
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

  async getRemoteFileBytes(remotePath: string): Promise<{ content: Uint8Array; remote: GitHubContentResponse }> {
    const remote = await this.getRemoteContent(remotePath);

    if (!remote) {
      throw new Error(`远端文件不存在：${remotePath}`);
    }

    if (remote.encoding !== "base64" || !remote.content) {
      throw new Error(`远端文件内容编码不受支持：${remotePath}`);
    }

    return {
      content: decodeBase64Bytes(remote.content),
      remote
    };
  }

  async pullRemoteFile(remotePath: string) {
    this.validateConfig();

    const { content, remote } = await this.getRemoteFileBytes(remotePath);
    const localPath = this.localPathFromRemotePath(remotePath);
    const parentPath = localPath.includes("/") ? localPath.slice(0, localPath.lastIndexOf("/")) : "";
    await this.ensureFolderPath(parentPath);

    const existing = this.app.vault.getAbstractFileByPath(localPath);
    const isMarkdown = localPath.toLowerCase().endsWith(".md");
    const textContent = isMarkdown ? new TextDecoder().decode(content) : "";
    let file: TFile;

    if (existing instanceof TFile) {
      if (isMarkdown) {
        await this.app.vault.modify(existing, textContent);
      } else {
        await this.app.vault.modifyBinary(existing, content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength));
      }
      file = existing;
    } else if (existing) {
      throw new Error(`无法拉取远端文件，本地路径已被目录占用：${localPath}`);
    } else if (isMarkdown) {
      file = await this.app.vault.create(localPath, textContent);
    } else {
      file = await this.app.vault.createBinary(localPath, content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength));
    }

    this.data.files[file.path] = {
      remotePath,
      sha: remote.sha,
      status: "synced",
      lastSyncedAt: formatDateTime(new Date()),
      lastSyncedHash: isMarkdown ? hashContent(textContent) : hashBytes(content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)),
      htmlUrl: remote.html_url ?? this.buildGitHubBlobUrl(remotePath)
    };
    await this.saveAllData();
    await this.refreshStatusBar();
  }

  collectSyncableFiles(folder: TFolder, files: TFile[] = []): TFile[] {
    folder.children.forEach((entry) => {
      if (entry instanceof TFile && isSyncableFile(entry)) {
        files.push(entry);
      } else if (entry instanceof TFolder && !isHiddenPath(entry.path)) {
        this.collectSyncableFiles(entry, files);
      }
    });

    return files;
  }

  getLocalSyncableFiles(): TFile[] {
    const root = this.getExistingFolder(this.settings.localRootPath);
    if (!root) {
      return [];
    }

    return this.collectSyncableFiles(root)
      .filter((file) => this.isInsideRoot(file))
      .sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  }

  async getRemoteSyncableFiles(): Promise<Map<string, RemoteSyncFile>> {
    this.validateConfig();

    const tree = await this.githubRequest<GitHubTreeResponse>("GET", this.buildGitTreeApiPath(), undefined, {
      recursive: "1"
    });

    if (tree.truncated) {
      new Notice("GitHub 返回的远端目录树被截断，列表可能不完整。");
    }

    const remoteFiles = new Map<string, RemoteSyncFile>();

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

  async buildSyncCenterItems(): Promise<SyncCenterItem[]> {
    this.validateConfig();

    const [remoteFiles, localFiles] = await Promise.all([
      this.getRemoteSyncableFiles(),
      Promise.resolve(this.getLocalSyncableFiles())
    ]);
    const items: SyncCenterItem[] = [];
    const seenRemotePaths = new Set<string>();

    for (const file of localFiles) {
      const remotePath = this.remotePath(file);
      const remote = remoteFiles.get(remotePath);
      const state = this.getState(file);
      const textContent = file.extension === "md" ? await this.app.vault.read(file) : "";
      const binaryContent = file.extension === "md" ? textBytes(textContent).buffer : await this.app.vault.readBinary(file);
      const currentHash = file.extension === "md" ? hashContent(textContent) : hashBytes(binaryContent);
      const currentBlobSha = await gitBlobSha(binaryContent);
      let status: SyncCenterStatus;

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
      const statusOrder: Record<SyncCenterStatus, number> = {
        unpublished: 0,
        modified: 1,
        published: 2,
        localDeleted: 3
      };

      return statusOrder[a.status] - statusOrder[b.status] || a.remotePath.localeCompare(b.remotePath, "zh-CN");
    });
  }

  async deleteRemotePath(remotePath: string) {
    this.validateConfig();

    if (!isSafeContentPath(remotePath)) {
      throw new Error("远端路径必须位于仓库 content 目录内。");
    }

    const remote = await this.getRemoteContent(remotePath);
    if (!remote) {
      new Notice(`远端文件不存在：${remotePath}`);
      return;
    }

    await this.githubRequest<GitHubDeleteResponse>("DELETE", this.buildContentApiPath(remotePath), {
      message: `sync: delete ${remotePath}`,
      sha: remote.sha,
      branch: this.settings.branch.trim()
    });

    Object.entries(this.data.files).forEach(([localPath, state]) => {
      if (state.remotePath === remotePath) {
        this.data.files[localPath] = {
          ...state,
          sha: undefined,
          htmlUrl: undefined,
          status: "deleted"
        };
      }
    });
    await this.saveAllData();
  }

  async syncFileState(file: TFile): Promise<LocalFileState> {
    if (!this.isInsideRoot(file) || !isSyncableFile(file)) {
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

  async testConnection(): Promise<ConnectionState> {
    try {
      this.validateConfig();
      const repository = this.getRepository();
      const user = await this.githubRequest<GitHubUserResponse>("GET", "/user");

      const repo = await this.githubRequest<GitHubRepoResponse>("GET", this.buildRepoApiPath());
      await this.githubRequest<unknown>("GET", this.buildBranchApiPath());

      if (user.login.toLowerCase() !== this.settings.githubUsername.trim().toLowerCase()) {
        throw new Error(`Token 用户为 ${user.login}，与配置的 GitHub Username 不一致。`);
      }

      if (!repo.permissions?.admin && !repo.permissions?.maintain && !repo.permissions?.push) {
        throw new Error(
          `Token 对 ${repo.full_name} 没有写权限。请确认 Fine-grained token 已授权该仓库，并将 Contents 设置为 Read and write。`
        );
      }

      const state: ConnectionState = {
        status: "success",
        message: `连接成功：${repository.owner}/${repository.repo}@${this.settings.branch.trim()}`,
        checkedAt: formatDateTime(new Date())
      };
      this.data.connection = state;
      await this.saveAllData();
      new Notice(state.message);
      return state;
    } catch (error) {
      const message = error instanceof Error ? error.message : "连接失败";
      const state: ConnectionState = {
        status: "failed",
        message,
        checkedAt: formatDateTime(new Date())
      };
      this.data.connection = state;
      await this.saveAllData();
      throw error;
    }
  }

  async syncFileToGitHub(file: TFile): Promise<LocalFileState> {
    this.validateConfig();

    if (!this.isInsideRoot(file)) {
      throw new Error("当前文章不在 Local Root Path 内。");
    }

    if (!isSyncableFile(file)) {
      throw new Error("隐藏文件或系统文件不允许同步。");
    }

    const isMarkdown = file.extension === "md";
    const content = isMarkdown ? await this.app.vault.read(file) : "";
    const binaryContent = isMarkdown ? textBytes(content).buffer : await this.app.vault.readBinary(file);
    const currentHash = isMarkdown ? hashContent(content) : hashBytes(binaryContent);
    const currentBlobSha = await gitBlobSha(binaryContent);
    const remotePath = this.remotePath(file);

    try {
      const currentState = this.getState(file);
      const cachedSha = currentState.remotePath === remotePath ? currentState.sha : undefined;
      let resolvedRemote: GitHubContentResponse | null = null;

      const putContent = (sha?: string) =>
        this.githubRequest<GitHubPutResponse>("PUT", this.buildContentApiPath(remotePath), {
          message: `${sha ? "sync: update" : "sync: add"} ${remotePath}`,
          content: isMarkdown ? encodeBase64(content) : encodeBytesBase64(new Uint8Array(binaryContent)),
          branch: this.settings.branch.trim(),
          ...(sha ? { sha } : {})
        });

      let result: GitHubPutResponse;

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

      const nextState: LocalFileState = {
        remotePath,
        sha: nextSha,
        status: "synced",
        lastSyncedAt: formatDateTime(new Date()),
        lastSyncedHash: currentHash,
        htmlUrl
      };

      await this.setState(file, nextState);

      new Notice(`同步成功：${remotePath}`);
      return nextState;
    } catch (error) {
      await this.setState(file, { remotePath, status: "failed" });
      if (error instanceof GitHubRequestError && error.status === 404) {
        throw new Error(
          `GitHub 写入返回 404：${remotePath}。通常是 Token 没有授权当前仓库、Repository URL 不是目标博客仓库，或分支 ${this.settings.branch.trim()} 不可写。请确认 token 的 Repository access 包含该仓库，且 Contents 为 Read and write。`
        );
      }
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

class SyncCenterModal extends Modal {
  plugin: ObsidianGitSyncerPlugin;
  items: SyncCenterItem[] = [];
  selectedIds = new Set<string>();
  collapsedPaths = new Set<string>();
  deletedRemotePaths = new Set<string>();
  activeOperation: SyncCenterOperation | null = null;
  loading = false;
  errorMessage = "";

  constructor(app: App, plugin: ObsidianGitSyncerPlugin) {
    super(app);
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
      this.errorMessage = error instanceof Error ? error.message : "同步中心加载失败。";
    } finally {
      this.loading = false;
      this.render();
    }
  }

  applyDeletedRemoteOverrides(items: SyncCenterItem[]): SyncCenterItem[] {
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
          remote: undefined
        }
      ];
    });
  }

  getSelectedItems(): SyncCenterItem[] {
    return this.items.filter((item) => this.selectedIds.has(item.id));
  }

  getSelectedLocalItems(): SyncCenterItem[] {
    return this.getSelectedItems().filter(
      (item) => item.file && this.plugin.isInsideRoot(item.file) && item.status !== "published" && item.status !== "localDeleted"
    );
  }

  getSelectedRemoteOnlyItems(): SyncCenterItem[] {
    return this.getSelectedItems().filter((item) => item.status === "localDeleted");
  }

  getSelectedRemoteItems(): SyncCenterItem[] {
    return this.getSelectedItems().filter((item) => item.remote);
  }

  setItemsSelected(items: SyncCenterItem[], selected: boolean) {
    items.forEach((item) => {
      if (selected) {
        this.selectedIds.add(item.id);
      } else {
        this.selectedIds.delete(item.id);
      }
    });
  }

  renderPreservingScroll() {
    const bodyEl = this.contentEl.querySelector<HTMLElement>(".obsidian-git-syncer-sync-center-body");
    const modalContentEl = this.contentEl.parentElement;
    const bodyScrollTop = bodyEl?.scrollTop ?? 0;
    const modalScrollTop = modalContentEl?.scrollTop ?? 0;

    this.render();
    requestAnimationFrame(() => {
      const nextBodyEl = this.contentEl.querySelector<HTMLElement>(".obsidian-git-syncer-sync-center-body");
      if (nextBodyEl) {
        nextBodyEl.scrollTop = bodyScrollTop;
      }
      if (modalContentEl) {
        modalContentEl.scrollTop = modalScrollTop;
      }
    });
  }

  toggleDirectory(path: string) {
    if (this.collapsedPaths.has(path)) {
      this.collapsedPaths.delete(path);
    } else {
      this.collapsedPaths.add(path);
    }
    this.renderPreservingScroll();
  }

  buildTree(items: SyncCenterItem[]): SyncTreeNode {
    const root: SyncTreeNode = {
      name: REMOTE_CONTENT_ROOT,
      path: REMOTE_CONTENT_ROOT,
      children: new Map(),
      items: []
    };

    items.forEach((item) => {
      const relative = item.remotePath.startsWith(`${REMOTE_CONTENT_ROOT}/`)
        ? item.remotePath.slice(REMOTE_CONTENT_ROOT.length + 1)
        : item.remotePath;
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
            children: new Map(),
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

  getNodeItems(node: SyncTreeNode): SyncCenterItem[] {
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
      contentEl.createDiv({ cls: "obsidian-git-syncer-sync-center-empty", text: "正在加载本地与远端内容..." });
      return;
    }

    if (this.errorMessage) {
      contentEl.createDiv({ cls: "obsidian-git-syncer-sync-center-error", text: this.errorMessage });
      return;
    }

    this.renderSummary(contentEl);
    this.renderToolbar(contentEl);

    const bodyEl = contentEl.createDiv({ cls: "obsidian-git-syncer-sync-center-body" });
    const statuses: SyncCenterStatus[] = ["unpublished", "modified", "published", "localDeleted"];
    statuses.forEach((status) => this.renderStatusSection(bodyEl, status));
  }

  renderHeader(containerEl: HTMLElement) {
    const headerEl = containerEl.createDiv({ cls: "obsidian-git-syncer-sync-center-header" });
    const titleGroupEl = headerEl.createDiv();
    const titleRowEl = titleGroupEl.createDiv({ cls: "obsidian-git-syncer-sync-center-title-row" });
    titleRowEl.createEl("h2", { text: "同步中心" });
    const refreshButton = titleRowEl.createEl("button", { cls: "obsidian-git-syncer-icon-button" });
    refreshButton.type = "button";
    refreshButton.setAttribute("aria-label", "刷新同步中心");
    refreshButton.setAttribute("title", "刷新");
    setIcon(refreshButton, "refresh-cw");
    refreshButton.addEventListener("click", () => void this.refresh());
    titleGroupEl.createDiv({
      cls: "obsidian-git-syncer-muted",
      text: `${this.plugin.settings.repositoryUrl || "未配置仓库"} · ${this.plugin.settings.branch || "未配置分支"}`
    });
  }

  renderSummary(containerEl: HTMLElement) {
    const summaryEl = containerEl.createDiv({ cls: "obsidian-git-syncer-sync-summary" });
    const statuses: SyncCenterStatus[] = ["unpublished", "modified", "published", "localDeleted"];

    statuses.forEach((status) => {
      const count = this.items.filter((item) => item.status === status).length;
      const badgeEl = summaryEl.createDiv({
        cls: `obsidian-git-syncer-sync-summary-item ${toSyncCenterStatusClass(status)}`
      });
      const iconEl = badgeEl.createSpan({ cls: "obsidian-git-syncer-sync-summary-icon" });
      setIcon(iconEl, toSyncCenterStatusIcon(status));
      badgeEl.createSpan({ cls: "obsidian-git-syncer-sync-summary-label", text: toSyncCenterSummaryLabel(status) });
      badgeEl.createSpan({ text: String(count), cls: "obsidian-git-syncer-sync-summary-count" });
    });
  }

  renderToolbar(containerEl: HTMLElement) {
    const toolbarEl = containerEl.createDiv({ cls: "obsidian-git-syncer-sync-toolbar" });
    const selectedLocalCount = this.getSelectedLocalItems().length;
    const selectedRemoteOnlyCount = this.getSelectedRemoteOnlyItems().length;
    const selectedRemoteCount = this.getSelectedRemoteItems().length;
    const isBusy = this.loading || this.activeOperation !== null;

    toolbarEl.createDiv({
      cls: "obsidian-git-syncer-muted",
      text: `已选择 ${this.selectedIds.size} 项`
    });

    const createToolbarButton = (label: string, icon: string, operation: SyncCenterOperation) => {
      const isRunning = this.activeOperation === operation;
      const buttonEl = toolbarEl.createEl("button");
      buttonEl.type = "button";
      buttonEl.toggleClass("is-running", isRunning);
      buttonEl.setAttribute("aria-busy", isRunning ? "true" : "false");

      const iconEl = buttonEl.createSpan({ cls: "obsidian-git-syncer-button-icon" });
      setIcon(iconEl, isRunning ? "loader-circle" : icon);
      buttonEl.createSpan({ cls: "obsidian-git-syncer-button-label", text: isRunning ? this.getOperationButtonLabel(operation) : label });

      return buttonEl;
    };

    const deleteButton = createToolbarButton(`删除远端 (${selectedRemoteCount})`, "cloud-off", "delete");
    deleteButton.disabled = isBusy || selectedRemoteCount === 0;
    deleteButton.addClass("mod-warning");
    deleteButton.addEventListener("click", () => void this.deleteSelectedRemoteFiles());

    const pullButton = createToolbarButton(`拉取远端 (${selectedRemoteOnlyCount})`, "cloud-download", "pull");
    pullButton.disabled = isBusy || selectedRemoteOnlyCount === 0;
    pullButton.addEventListener("click", () => void this.pullSelectedRemoteFiles());

    const syncButton = createToolbarButton(`同步本地 (${selectedLocalCount})`, "cloud-upload", "sync");
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

  getOperationButtonLabel(operation: SyncCenterOperation): string {
    switch (operation) {
      case "delete":
        return "删除中...";
      case "pull":
        return "拉取中...";
      case "sync":
      default:
        return "同步中...";
    }
  }

  getOperationStatusText(operation: SyncCenterOperation): string {
    switch (operation) {
      case "delete":
        return "正在删除远端文件，请稍候...";
      case "pull":
        return "正在拉取远端文件，请稍候...";
      case "sync":
      default:
        return "正在同步本地文件，请稍候...";
    }
  }

  getFailureMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }

    return "未知错误";
  }

  formatFailureReason(item: SyncCenterItem, error: unknown): string {
    const path = item.localPath ?? item.remotePath;
    return `${path}：${this.getFailureMessage(error)}`;
  }

  buildCompletionNotice(title: string, successCount: number, failureReasons: string[]): string {
    const summary = `${title}：成功 ${successCount}，失败 ${failureReasons.length}`;
    if (failureReasons.length === 0) {
      return summary;
    }

    const extra = failureReasons.length > 1 ? `；另有 ${failureReasons.length - 1} 个失败` : "";
    return `${summary}\n失败原因：${failureReasons[0]}${extra}`;
  }

  renderStatusSection(containerEl: HTMLElement, status: SyncCenterStatus) {
    const sectionItems = this.items.filter((item) => item.status === status);
    const sectionEl = containerEl.createDiv({ cls: "obsidian-git-syncer-sync-section" });
    const headerEl = sectionEl.createDiv({ cls: "obsidian-git-syncer-sync-section-header" });
    headerEl.createEl("h3", { text: toSyncCenterStatusLabel(status) });
    headerEl.createSpan({
      cls: "obsidian-git-syncer-sync-section-count",
      text: String(sectionItems.length)
    });

    if (sectionItems.length === 0) {
      sectionEl.createDiv({ cls: "obsidian-git-syncer-sync-center-empty", text: "暂无文件。" });
      return;
    }

    const tree = this.buildTree(sectionItems);
    const treeEl = sectionEl.createDiv({ cls: "obsidian-git-syncer-sync-tree" });
    this.renderTreeContents(treeEl, tree, 0);
  }

  renderTreeContents(containerEl: HTMLElement, node: SyncTreeNode, depth: number) {
    Array.from(node.children.values())
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
      .forEach((child) => {
        this.renderDirectoryRow(containerEl, child, depth);
        if (!this.collapsedPaths.has(child.path)) {
          this.renderTreeContents(containerEl, child, depth + 1);
        }
      });

    node.items
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
      .forEach((item) => this.renderFileRow(containerEl, item, depth));
  }

  renderDirectoryRow(containerEl: HTMLElement, node: SyncTreeNode, depth: number) {
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
    setIcon(iconEl, isCollapsed ? "folder-closed" : "folder-open");

    const nameEl = rowEl.createSpan({ cls: "obsidian-git-syncer-sync-tree-name", text: node.name });
    rowEl.createSpan({ cls: "obsidian-git-syncer-sync-tree-meta", text: `${items.length} 项` });
    rowEl.addEventListener("click", () => this.toggleDirectory(node.path));
  }

  renderFileRow(containerEl: HTMLElement, item: SyncCenterItem, depth: number) {
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
    setIcon(iconEl, item.status === "localDeleted" ? "cloud-off" : isImagePath(item.remotePath) ? "image" : "file-text");
    const textEl = rowEl.createSpan({ cls: "obsidian-git-syncer-sync-tree-text" });
    textEl.createSpan({ cls: "obsidian-git-syncer-sync-tree-name", text: item.name });
    textEl.createSpan({
      cls: "obsidian-git-syncer-sync-tree-path",
      text: item.localPath ? item.localPath : item.remotePath
    });
    const statusEl = rowEl.createSpan({
      cls: `obsidian-git-syncer-status-badge obsidian-git-syncer-status-icon-only ${toSyncCenterStatusClass(item.status)}`
    });
    statusEl.setAttribute("aria-label", toSyncCenterStatusLabel(item.status));
    statusEl.setAttribute("title", toSyncCenterStatusLabel(item.status));
    setIcon(statusEl, toSyncCenterStatusIcon(item.status));
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
    const failureReasons: string[] = [];
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
      } catch (error) {
        failureReasons.push(this.formatFailureReason(item, error));
      }
    }

    new Notice(this.buildCompletionNotice("同步完成", successCount, failureReasons), failureReasons.length > 0 ? 12000 : 5000);
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
    const failureReasons: string[] = [];
    this.activeOperation = "pull";
    this.renderPreservingScroll();

    for (const item of items) {
      try {
        await this.plugin.pullRemoteFile(item.remotePath);
        successCount += 1;
        this.selectedIds.delete(item.id);
      } catch (error) {
        failureReasons.push(this.formatFailureReason(item, error));
      }
    }

    new Notice(this.buildCompletionNotice("远端文件拉取完成", successCount, failureReasons), failureReasons.length > 0 ? 12000 : 5000);
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
    const failureReasons: string[] = [];
    this.activeOperation = "delete";
    this.renderPreservingScroll();

    for (const item of items) {
      try {
        await this.plugin.deleteRemotePath(item.remotePath);
        this.deletedRemotePaths.add(item.remotePath);
        if (item.file) {
          await this.plugin.setState(item.file, {
            remotePath: item.remotePath,
            sha: undefined,
            htmlUrl: undefined,
            status: "deleted"
          });
        }
        successCount += 1;
        this.selectedIds.delete(item.id);
      } catch (error) {
        failureReasons.push(this.formatFailureReason(item, error));
      }
    }

    new Notice(this.buildCompletionNotice("远端残留清理完成", successCount, failureReasons), failureReasons.length > 0 ? 12000 : 5000);
    this.activeOperation = null;
    this.items = this.applyDeletedRemoteOverrides(this.items);
    this.renderPreservingScroll();
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

  renderConnectionStatus(containerEl: HTMLElement) {
    const connection = this.plugin.data.connection ?? DEFAULT_DATA.connection;
    const statusEl = containerEl.createDiv({
      cls: `obsidian-git-syncer-connection-status is-${connection?.status ?? "unknown"}`
    });
    const iconEl = statusEl.createSpan({ cls: "obsidian-git-syncer-connection-status-icon" });
    const iconName =
      connection?.status === "success"
        ? "check-circle-2"
        : connection?.status === "failed"
          ? "x-circle"
          : connection?.status === "stale"
            ? "alert-circle"
            : "circle-help";
    setIcon(iconEl, iconName);
    statusEl.createSpan({
      cls: "obsidian-git-syncer-connection-status-text",
      text: `${connection?.message ?? "尚未测试连接。"}${connection?.checkedAt ? ` · ${connection.checkedAt}` : ""}`
    });
  }

  renderGeneralSettings(containerEl: HTMLElement) {
    const localRootPath = displayLocalRootPath(this.plugin.settings.localRootPath);
    const localRootDescription = this.plugin.getExistingFolder(this.plugin.settings.localRootPath)
      ? `当前目录有效：${localRootPath}`
      : "只有该目录内的文件才允许同步。当前值无效时请重新选择目录。";

    this.createSearchableSetting(containerEl, "Local Root Path", localRootDescription, localRootPath)
      .setName("Local Root Path")
      .setDesc(localRootDescription)
      .addText((text) =>
        text.setValue(localRootPath).onChange(async (value) => {
          this.plugin.settings.localRootPath = normalizeLocalRootPath(value);
          await this.plugin.saveSettings();
          this.display();
        })
      )
      .addButton((button) =>
        button.setButtonText("选择目录").onClick(() => {
          new FolderSelectModal(this.app, this.plugin, async (folder) => {
            try {
              await this.plugin.setLocalRootPath(folder.path);
              new Notice(`已设置 Local Root Path：${displayLocalRootPath(this.plugin.settings.localRootPath)}`);
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

    this.createSearchableSetting(containerEl, "插件版本", this.plugin.manifest.version, this.plugin.manifest.id)
      .setName("插件版本")
      .setDesc(`${this.plugin.manifest.name} v${this.plugin.manifest.version} · ${this.plugin.manifest.id}`);
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
            await this.plugin.markConnectionStale();
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
            await this.plugin.markConnectionStale();
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
            await this.plugin.markConnectionStale();
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
            await this.plugin.markConnectionStale();
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
            this.renderPanel(this.panelEl ?? containerEl);
          } catch (error) {
            const message = error instanceof Error ? error.message : "连接失败";
            new Notice(message);
            this.renderPanel(this.panelEl ?? containerEl);
          }
        })
      );

    this.renderConnectionStatus(containerEl);
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
    return folder.path || VAULT_ROOT_PATH;
  }

  async onChooseItem(folder: TFolder): Promise<void> {
    await this.onChooseFolder(folder);
  }
}
