# 工程水印相机

给现场照片叠加「工程记录」风格水印。支持浏览器、**PWA 安装到手机/桌面**，以及 **Electron 桌面 App**（macOS / Windows / Linux）。

- 蓝色标题条 + 黄色副标题 + 半透明字段列表
- 点选时间、卫星图选点（WGS-84）、地址
- 小时级天气 / 历史天气（Open-Meteo，约 1940 年起，免 API Key）
- 框体 / 文字透明度分开调节

## 在线地址（Cloudflare Pages）

- **正式站**：https://shuiying-xiangji.pages.dev/
- **自定义域名**：https://sy.lxpyll.top/（DNS 需 CNAME 到 `shuiying-xiangji.pages.dev`）
- 重新部署：`npm run deploy:cf`

### 登录与授权注册

| 角色 | 说明 |
|------|------|
| 管理员 | 首次部署用密钥 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 自动创建 |
| 普通用户 | **必须**持有管理员发放的一次性**授权码**才能注册 |

流程：管理员登录 →「授权管理」→ 生成授权码 → 发给对方 → 对方注册时填写授权码 → 自动生效。

```bash
# 设置/轮换管理员密码（生产密钥，不进代码库）
printf '%s' '你的密码' | npx wrangler pages secret put ADMIN_PASSWORD --project-name=shuiying-xiangji
printf '%s' 'yclxp' | npx wrangler pages secret put ADMIN_USERNAME --project-name=shuiying-xiangji
```

### 绑定域名 sy.lxpyll.top

1. Cloudflare Dashboard → 域名 `lxpyll.top` → DNS
2. 添加记录：
   - **类型** CNAME  
   - **名称** `sy`  
   - **目标** `shuiying-xiangji.pages.dev`  
   - **代理状态** 已代理（橙色云）
3. Pages → shuiying-xiangji → Custom domains 中已添加 `sy.lxpyll.top`，等证书 Active 即可

## 本地怎么启动

### 1. 浏览器（最快）

```bash
cd shuiying-xiangji
npm run web
# 或：python3 -m http.server 5173
# 打开 http://localhost:5173
```

定位、PWA 安装建议用 **http(s)**，不要直接双击 `file://`。

### 2. 安装为 App（PWA）

1. 打开正式站或本地 `http://localhost:5173`（需 https 或 localhost）
2. **iPhone Safari**：分享 →「添加到主屏幕」
3. **Android Chrome**：菜单 →「安装应用」/「添加到主屏幕」
4. **Mac/Windows Chrome/Edge**：地址栏右侧「安装」图标

地图、天气仍需联网。

### 3. 桌面客户端（Electron）

```bash
npm install   # 首次
npm start     # 打开桌面窗口

npm run dist:mac    # 打包 .dmg
npm run dist:win
npm run dist:linux
```

| 命令 | 说明 |
|------|------|
| `npm run web` | 本地网页服务 :5173 |
| `npm start` | Electron 桌面窗口 |
| `npm run deploy:cf` | 部署到 Cloudflare Pages |
| `npm run dist:mac` | 生成 macOS 安装包 |
## 功能一览

| 功能 | 说明 |
|------|------|
| 选图 / 拍照 | 相册、摄像头、拖放 |
| 点选时间 | 日期 + 时间分开选，支持快捷整点 |
| 点选位置 | 高清卫星图、触控板手势、搜索/GPS |
| 地址 | 逆地理写入 |
| 天气 | 按选定时间对齐最近整点；历史可回溯约 1940 年 |
| 类型模板 | 工程记录 / 安全巡查 / 进度汇报，可自定义 |
| 样式 | 大小、字号、框体/文字透明度、位置、颜色 |
| 导出 | JPEG 带水印 |

数据保存在本地 `localStorage`。

## 项目结构

```
├── index.html              # 页面
├── styles.css
├── app.js                  # 业务逻辑
├── manifest.webmanifest    # PWA
├── sw.js                   # 离线缓存壳
├── icons/                  # 应用图标
├── desktop/main.js         # Electron 桌面壳
└── package.json            # Electron 打包
```

## GitHub

https://github.com/Lxp1986/shuiying-xiangji
