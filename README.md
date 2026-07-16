# 工程水印相机

给现场照片叠加「工程记录」风格水印。支持浏览器、**PWA 安装到手机/桌面**，以及 **Electron 桌面 App**（macOS / Windows / Linux）。

- 蓝色标题条 + 黄色副标题 + 半透明字段列表
- 点选时间、卫星图选点（WGS-84）、地址
- 小时级天气 / 历史天气（Open-Meteo，约 1940 年起，免 API Key）
- 框体 / 文字透明度分开调节

## 三种使用方式

### 1. 浏览器（最快）

```bash
cd shuiying-xiangji
python3 -m http.server 5173
# 打开 http://localhost:5173
```

也可用 VS Code / 任意静态服务器。定位、PWA 安装建议用 **http(s)**，不要直接双击 `file://`。

### 2. 安装为 App（PWA）

1. 用手机或电脑浏览器打开上述地址（需 https 或 localhost）
2. **iPhone Safari**：分享 →「添加到主屏幕」
3. **Android Chrome**：菜单 →「安装应用」/「添加到主屏幕」
4. **Mac/Windows Chrome/Edge**：地址栏右侧「安装」图标

安装后独立窗口打开，图标在桌面/主屏幕，体验接近原生 App。  
（地图、天气仍需联网。）

### 3. 桌面客户端（Electron）

```bash
# 安装依赖（首次）
npm install

# 开发运行
npm start

# 打包安装包（输出到 release/）
npm run dist:mac    # → .dmg / .zip（macOS）
npm run dist:win    # → 安装包 / 绿色版（Windows）
npm run dist:linux  # → AppImage / deb
```

| 命令 | 说明 |
|------|------|
| `npm start` | 本地打开桌面窗口 |
| `npm run dist:mac` | 生成 macOS 安装包 |
| `npm run pack` | 只生成未打包的应用目录（调试用） |

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
