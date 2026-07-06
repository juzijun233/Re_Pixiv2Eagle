# Re_Pixiv2Eagle

[English](./README.en.md) · [中文](./README.md)

基于上游 [Pixiv2Eagle](https://github.com/nekoday/Pixiv2Eagle) 的重构分支。本仓库使用 **esbuild** 将 `src/` 下的 ES 模块打包为单文件用户脚本 `dist/RePixiv2Eagle.js`，可直接导入 Tampermonkey。当前版本：**3.5.1**（见 [`src/header.txt`](src/header.txt)）。

> ✨ **新增：** 支持将 Pixiv 动图（ugoira）转换为 GIF 并保存到 Eagle。
>
> **转换可能需要一些时间，请耐心等待。**

一个用于将 Pixiv 插画、漫画、小说保存到 [Eagle](https://eagle.cool/) 图片管理软件的 Tampermonkey（油猴）脚本。

## 快速开始

### 安装要求

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 安装 [Eagle](https://eagle.cool/) 并确保客户端正在运行（监听 `http://localhost:41595`）

### 安装脚本

**推荐：** 从 [GitHub Releases](https://github.com/juzijun233/Re_Pixiv2Eagle/releases) 下载 `RePixiv2Eagle.js`，在 Tampermonkey 中新建脚本并粘贴全部内容，或以本地文件方式导入。

> 若尚无 Release，请使用下方「开发者 build」方式自行构建；Releases 页面会在后续版本发布时提供预构建脚本。

**开发者备选：**

```bash
git clone https://github.com/juzijun233/Re_Pixiv2Eagle.git
cd Re_Pixiv2Eagle
npm install
npm run build
```

将生成的 `dist/RePixiv2Eagle.js` 导入 Tampermonkey。

### 首次配置

1. 在 Eagle 中创建用于存放 Pixiv 作品的文件夹，右键选择「复制链接」
2. 打开任意 Pixiv 页面，点击右下角 **⚙️** 浮动按钮，或在 Tampermonkey 菜单选择 **「⚙️ 打开控制面板」**
3. 在 **Eagle 与文件夹** 分区粘贴文件夹链接（如 `http://localhost:41595/folder?id=XXXXXX`）或仅输入 ID（`XXXXXX` 部分），点击「应用」

## 功能特点

### 插画 / 动图

- 作品详情页一键保存到 Eagle，保留标题、标签与元数据
- 支持多页插画批量下载
- 动图（ugoira）自动转换为 GIF 后保存

### 漫画

- 漫画系列文件夹自动创建与识别
- 系列页面已保存标记
- 系列页「更新序号」按钮，按 Pixiv 章节顺序整理 Eagle 内文件名

### 小说

- 小说详情页（`/novel/show.php`）一键保存
- 支持 TXT、Markdown、EPUB 三种格式
- 小说系列页面已保存标记

### Eagle 组织

- 自动创建画师专属文件夹（可自定义名称模板）
- 可选按插画 / 漫画 / 小说分类型子文件夹
- 漫画系列文件夹、作品子文件夹层级管理
- 可配置 Pixiv 根文件夹 ID

### 已保存感知

- 详情页自动检测是否已保存（可选）
- 推荐区、作者列表、系列页等多处已保存标记
- 标记状态跨页面联动更新

### 体验

- 网页内控制面板（FAB ⚙️），集中管理全部设置
- 保存进度 toast 提示
- 浅色 / 深色 / 跟随系统主题
- 配置导入 / 导出（Base64）

### 高级

- 可选使用 Pixiv 投稿时间作为 Eagle 添加日期
- 可选将作品描述写入 Eagle 条目
- 画师文件夹名称模板（`$uid` / `$name`）
- Eagle 落盘等待超时、调试模式

## 使用方法（按内容类型）

| 页面 | 功能 |
| ------ | ------ |
| `/artworks/{id}` | 「保存到 Eagle」按钮；推荐区已保存标记 |
| `/users/{id}/series/{id}` 等漫画系列页 | 系列已保存标记；「更新序号」整理章节文件名 |
| `/novel/show.php?id={id}` | 小说保存按钮 |
| `/novel/series/{id}` | 小说系列已保存标记 |
| `/users/{id}`、`/user/{id}` 及作品列表页 | 作者列表已保存标记 |

日常使用：确保 Eagle 已启动 → 访问对应 Pixiv 页面 → 点击保存按钮或查看已保存标记。

## 控制面板

Pixiv 页面右下角 **⚙️** 或 Tampermonkey 菜单 **「⚙️ 打开控制面板」** 打开。分区如下：

| 分区 | 主要设置 |
| ------ | ---------- |
| **Eagle 与文件夹** | Pixiv 根文件夹 ID |
| **插画 / 漫画保存** | 投稿时间、保存描述、按类型保存、自动检测已保存、多页子文件夹（关闭 / 仅多页 / 始终） |
| **小说** | 保存路径、格式（TXT / MD / EPUB） |
| **推荐区** | 同作者过滤、已保存条目显示方式（标记 / 模糊 / 隐藏） |
| **外观** | 界面主题（浅色 / 深色 / 跟随系统） |
| **高级** | 画师文件夹名称模板、Eagle 落盘等待超时 |
| **配置备份** | Base64 导出 / 导入全部可导出设置 |
| **快捷操作** | 保存当前作品、强制更新 Eagle 索引 |

Tampermonkey 菜单仅保留三项：**打开控制面板**、**强制更新 Eagle 索引**、**切换：调试模式**。其余设置均在控制面板中完成。

## 画师文件夹

- 每个画师在配置的 Pixiv 文件夹（或 Eagle 根目录）下拥有专属文件夹
- 文件夹描述含 `pid = 画师ID`，用于识别与匹配
- 实现逻辑：
  1. 在 Pixiv 主文件夹下查找是否已有该画师文件夹
  2. 通过描述中的 `pid = 画师ID` 识别
  3. 不存在则自动创建，并写入画师名称与 ID 描述
  4. 作品保存在对应画师文件夹（及可选的类型 / 系列子文件夹）中

### 文件夹 ID 规则

- **已设置 ID：** 在指定 Pixiv 文件夹下查找或创建画师文件夹；找不到指定文件夹时报错
- **清空 ID：** 在 Eagle 根目录下查找或创建画师文件夹

### 画师文件夹名称模板

- `$uid` 表示画师 ID，`$name` 表示画师名称
- 默认模板为 `$name`；示例：`$uid_$name`
- 在控制面板 **高级** 分区设置

## 作品子文件夹

- **系列文件夹：** 漫画系列在画师目录下创建系列文件夹，描述写入 Pixiv 系列 URL（如 `https://www.pixiv.net/user/{画师ID}/series/{系列ID}`），便于反查来源
- **作品子文件夹：** 以作品标题命名，描述写入 **作品 ID**，用于已保存检测与定位
- 漫画或属于 Pixiv 系列的作品会经系列文件夹再进入作品子文件夹
- 其它插画可在控制面板 **插画 / 漫画保存** 中设置子文件夹模式：**关闭 → 仅多页 → 始终**
  - **关闭：** 直接保存到画师 / 系列文件夹
  - **仅多页：** `pageCount > 1` 时创建子文件夹
  - **始终：** 所有插画、漫画、动图均创建子文件夹

## 与 Pixiv2Eagle 的差异

本仓库为 [nekoday/Pixiv2Eagle](https://github.com/nekoday/Pixiv2Eagle) 的重构 fork，esbuild 模块化源码，并扩展了多项功能。

**本 fork 新增（上游无或未同等实现）：**

- 网页控制面板与 FAB 入口，配置导入 / 导出
- 动图 ugoira → GIF
- 小说保存（TXT / MD / EPUB）与小说系列标记
- 漫画系列标记、章节序号更新
- 推荐区 / 作者列表已保存标记与过滤
- 按类型分文件夹、保存进度 toast、界面主题
- 已保存状态跨页面联动（BroadcastChannel + GM 存储）

**未继承上游的两项：**

- **直接保存** — 本 fork 未实现
- **严格排序** — 本 fork 未实现

## 注意事项

1. 使用前请确保 Eagle 软件已启动
2. 需要正确配置 Pixiv 文件夹 ID（或在根目录保存）
3. 保存大文件、多页作品或 ugoira 转 GIF 可能需要较长时间，请耐心等待；速度取决于网络与 Pixiv 服务器
4. 自动检测已保存状态时，作品数量较多可能影响页面性能
5. 请遵守 Pixiv 的使用条款和版权规定

## 常见问题

### Q: 为什么保存按钮没有出现？

请确保 Eagle 已启动、脚本已正确安装、页面已完全加载。可在控制面板 **快捷操作** 中尝试「保存当前作品」。

### Q: 如何获取文件夹 ID？

在 Eagle 中右键目标文件夹 →「复制链接」，从链接中提取 ID（格式：`http://localhost:41595/folder?id=XXXXXX`）。在控制面板 **Eagle 与文件夹** 分区粘贴并应用。

### Q: 设置在哪里改？

绝大部分设置在 Pixiv 页面控制面板（FAB ⚙️）中。Tampermonkey 菜单仅提供：打开控制面板、强制更新索引、调试模式。

### Q: 保存失败怎么办？

请检查 Eagle 是否运行、网络是否正常、文件夹 ID 是否正确；在控制面板或菜单开启调试模式，并查看浏览器控制台报错。

若仍无法解决，欢迎在 [GitHub Issues](https://github.com/juzijun233/Re_Pixiv2Eagle/issues) 提交 issue。

## 免责声明

**本软件按原样提供，不提供任何明示或暗示的保证。作者不对使用本软件造成的任何损失或损害负责。使用本软件即表示您同意承担所有相关风险。**

本工具仅用于方便收藏和管理您喜欢的作品。在使用过程中，请务必尊重画师的劳动成果，别忘了给您喜欢的作品点赞和收藏，这是对创作者最好的支持和鼓励！

## 开发

```bash
npm install
npm run dev     # 开发模式（esbuild --watch）
npm run build   # 生产构建 → dist/RePixiv2Eagle.js
npm run release # 构建并复制到 Releases/{version}/
```

源码为 `src/` 下的 ES 模块树，esbuild 以 `src/index.js` 为入口打包为单文件 IIFE；`src/header.txt` 为用户脚本元数据头，构建时作为 banner 注入产物。各版本 CHANGELOG 位于 `Releases/{version}/CHANGELOG.md`（发行目录被 git 忽略，由 `npm run release` 本地生成）。

### 目录结构

```text
src/
├── index.js          # bootstrap 入口
├── header.txt        # 用户脚本元数据
├── tampermonkey/     # GM 封装、设置、菜单、日志
├── config/           # 常量、选择器、页面监控
├── routing/          # URL 路由与页面处理
├── ui/               # 控制面板、toast、主题、按钮
├── eagle/            # Eagle API、文件夹、索引
├── artwork/          # 插画与动图（ugoira）
├── manga/            # 漫画系列
├── novel/            # 小说
├── artist-list/      # 作者列表标记
└── shared/           # 跨域共享工具
scripts/
├── build.js          # esbuild 构建
└── release.js        # 发行打包
dist/
└── RePixiv2Eagle.js  # 构建产物（git 忽略）
```

## 许可证

本项目采用 MIT 许可证。详细内容请查看 [LICENSE](LICENSE) 文件。

- 当前版本使用 MIT License
- 作者保留在后续版本中更改许可证类型的权利
- 已发布的版本将保持其原始许可证不变
