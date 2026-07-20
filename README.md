# 现场图片工具

施工现场照片**水印** + **现场图片报告**（前后对比排版）+ **导出 Word**。

| 形态 | 说明 |
|------|------|
| **桌面 App** | Mac / Windows 独立运行，**无需后端**，无需登录 |
| **网页版** | [sy.lxpyll.top](https://sy.lxpyll.top) 仅水印功能，需 Cloudflare 登录授权 |

仓库：https://github.com/Lxp1986/shuiying-xiangji

---

## 桌面版下载

在 [Releases](https://github.com/Lxp1986/shuiying-xiangji/releases) 下载最新安装包：

| 平台 | 文件 |
|------|------|
| **macOS**（Apple Silicon） | `现场图片工具-x.x.x-arm64.dmg` |
| **Windows**（64 位） | `现场图片工具-x.x.x-win-x64.exe` |

> Mac 未签名：若提示无法打开，可在「系统设置 → 隐私与安全性」中允许，或右键 → 打开。

### 本地重新打包

```bash
npm install
npm run dist:mac    # → release/*.dmg
npm run dist:win    # → release/*-win-x64.exe
```

开发运行：

```bash
npm start           # 打开桌面版（office.html）
```

---

## 功能概览

### 现场图片报告（默认）
- Word 风格多页文档：标题、施工前/后图片
- **+ 下一页** 连续编辑多组现场图
- 选中图片块 → 右侧直接编辑**水印**（内容/样式/时间/定位/天气）
- 续页：其它文字继承上页；**日期、天气、经纬度留空**
- 导出 `.docx`（可用 Word / WPS 打开）
- 工程文件 `.xctp`：打开 / 保存 / 另存为
- 默认保存路径 + **自动保存**间隔（设置里配置）

### 水印工具
- 工程记录风格水印（蓝条 + 黄条 + 字段）
- 点选时间、地图选点、GPS / **网络模糊定位**
- 历史天气（Open-Meteo，免 Key）
- 导出带水印 JPEG

### 网页版（仅水印）
- 地址：https://sy.lxpyll.top 或 https://shuiying-xiangji.pages.dev
- 登录后使用；注册需管理员授权码

---

## 项目结构

```
office.html          # 桌面 App 入口（报告 + 水印）
index.html           # 网页版入口（仅水印 + 登录）
app.js               # 水印引擎、地图、天气
report.js / report.css   # 报告排版、Word、工程文件
auth.js              # 网页登录（桌面不加载）
desktop/             # Electron 主进程 / preload
functions/           # Cloudflare Pages 登录 API
icons/               # 应用图标
scripts/prepare-web.sh   # 打包网页静态资源
```

---

## 网页部署（Cloudflare）

```bash
npm run deploy:cf    # 仅部署水印站，不含报告模块
```

需已 `wrangler login`，并配置 D1（见 `wrangler.toml`、`schema.sql`）。

管理员密钥（网页）：

```bash
printf '%s' '密码' | npx wrangler pages secret put ADMIN_PASSWORD --project-name=shuiying-xiangji
```

---

## 使用提示

1. **定位**：有 GPS 用精确定位；无 GPS 时自动 **IP 城市级模糊定位**，可在地图上再微调。  
2. **报告**：先写「文件名」→ 文档里改「标题」→ 图片块选图并编水印 → 导出 Word。  
3. **续页**：继承施工内容等文字；时间/天气/经纬度需重新填写。  
4. **工程文件**：`.xctp` 含图片与水印配置，建议设好默认保存路径并开启自动保存。

---

## 技术说明

- 水印与排版在**本地**完成（Canvas），不上传原图到服务器  
- Word 导出使用 [docx](https://www.npmjs.com/package/docx)（桌面经 CDN ESM 加载）  
- 桌面地图/天气需联网；断网仍可编辑已有内容并导出  
- Electron + electron-builder 打包  

---

## License

MIT
