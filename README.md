# PawPal · 屏边小伙伴

Mac / Windows 的桌面宠物程序：领养写实可爱的猫、狗或鹦鹉，在屏幕中央自由活动或沿边缘漫步。宠物住在透明的小窗口里，可拖动、抚摸、喂食、追逐玩具和休息。

## 启动

需要 Node.js 22.12+（建议 22 LTS）与 npm。

```sh
npm install
npm run dev
```

这会启动真实 Electron 桌面程序。选择宠物、取名字并领养后，透明宠物窗口出现。领养面板关闭后程序留在托盘/菜单栏，点击爪印重新打开；托盘菜单可显示/隐藏宠物、暂停或退出。

仅查看网页互动预览：

```sh
npm run dev:web
```

访问 `http://127.0.0.1:5173`。浏览器会显示“浏览器预览”，宠物只在页面里的模拟桌面活动。网页不能生成真正的系统桌面透明窗口。

## 互动

- 在面板点击抚摸、喂食、玩耍、休息；预览里移动玩具让宠物追逐。
- 桌面宠物悬停显示快捷工具栏，拖拽宠物可移动位置，双击可抚摸。玩耍期间移动鼠标，宠物会追过来。
- 猫喜欢逗猫棒，狗喜欢追球，鹦鹉喜欢飞行。写实图集包含坐姿、两帧步态、睡觉、玩耍和被抚摸；辅以呼吸、跳跃与飞行动画。首版为 2.5D 图集动画。
- 饱腹、精力、心情和亲密度随互动改变；互动有短冷却。离线衰减有上限，暂停后停止衰减。
- 设置可以调整大小、自由/贴边活动、暂停、声音和置顶。

## 构建

```sh
npm run build         # renderer production bundle
npm run pack          # 当前系统的可运行应用目录，输出 release/
npm run dist:mac      # 在 Mac 构建 arm64/x64 DMG
npm run dist:win      # 在 Windows 构建 x64 安装程序
npm run dist:win:zip  # Windows x64 便携 ZIP；可在 Mac 上构建
```

Mac 和 Windows 的安装包由 `.github/workflows/build.yml` 分别在对应系统构建（手动触发或推送 v 开头标签）。不自动发布。默认构建未提供开发者签名，分发时可配置 electron-builder 的证书与 notarization。

Windows 便携版解压后运行 `PawPal.exe`；保留同目录的其他文件。便携版跳过 Windows 可执行文件资源编辑与签名，可在 Mac 构建；正式 NSIS 安装包仍建议 Windows CI。

## 验证

```sh
npm test
npx playwright install chromium
npm run test:ui
npm run test:desktop
```

测试包含状态校验、互动冷却、衰减、负坐标/多屏范围、IPC 白名单与用户完整流程。真实桌面测试会用独立临时存储打开 Electron，检查透明窗口、领养、互动和设置。

Windows 透明效果、DPI、多屏拔插与全屏行为需要 Windows 实机确认。第三方全屏应用没有自动隐藏检测；可通过托盘隐藏宠物。Mac 的跨 Space 显示通过 Electron 原生窗口 API 实现。

## 项目结构

- `src/core/`：纯状态转换、宠物资料与显示器范围逻辑。
- `src/`：React 控制面板、互动预览与宠物渲染。
- `electron/`：透明窗口、鼠标穿透、拖拽、活动、托盘、持久化和隔离的 IPC。
- `public/pets/`：三种宠物的透明 PNG 动作图集；完整提示词在 `docs/asset-prompts.md`。

桌面状态保存在 Electron `userData` 目录的 `companion.json`（Mac 通常为 `~/Library/Application Support/pawpal-desktop/`；Windows 通常为 `%APPDATA%/pawpal-desktop/`），网页预览使用浏览器 localStorage。无需账号或服务器。
