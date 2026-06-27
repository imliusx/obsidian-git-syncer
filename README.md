# Obsidian Git Syncer

Obsidian 插件：将 Vault 中的 Markdown 文章同步到 GitHub 仓库的 `content/` 目录。

## 功能

- 配置 GitHub 仓库地址、用户名、Token、分支和本地同步目录。
- 将当前 Markdown 文件写入远端 `content/<本地相对路径>`。
- 检查远端文件状态，并在状态栏显示未同步、已同步、已修改、远端已删除、同步失败。
- 从 GitHub 仓库 `content/` 目录删除当前文章对应文件。
- 可插入 Quartz 常用 frontmatter。

## Token 权限

建议使用 GitHub Fine-grained personal access token：

- Repository access：选择目标仓库。
- Repository permissions：`Contents` 设置为 `Read and write`。

插件只会通过 GitHub Contents API 读写仓库 `content/` 目录下的文件。

## 开发

```bash
npm install
npm run build
```

构建产物为：

- `main.js`
- `manifest.json`
- `styles.css`
