# PawPal · 屏边小伙伴

Mac / Windows 的桌面宠物程序：领养写实可爱的猫、狗或鹦鹉，在屏幕中央自由活动或沿边缘漫步。宠物住在透明的小窗口里，可拖动、抚摸、喂食、追逐玩具和休息。

## 启动

已经打包的试用版在 `release/`：

- Apple 芯片 Mac：解压 `PawPal-0.3.0-mac-arm64.zip`，打开 `PawPal.app`。
- Intel 芯片 Mac：解压 `PawPal-0.3.0-mac-x64.zip`，打开 `PawPal.app`。
- Windows x64：解压 `PawPal-0.3.0-win.zip`，运行 `PawPal.exe`，保留同目录其他文件。

当前包未签名。Apple 芯片 Mac 包已实测；Intel Mac 和 Windows 包已构建，尚待对应系统实测。

从源码运行：

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

- 在面板点击抚摸、喂食、玩耍、休息、伸懒腰或小把戏；预览里移动玩具让宠物追逐。
- 桌面宠物悬停显示快捷工具栏，拖拽宠物可移动位置，双击可抚摸。玩耍期间移动鼠标，宠物会追过来。
- 猫喜欢逗猫棒，狗喜欢追球，鹦鹉喜欢飞行。v0.3.0 使用新生成的独立身体、腿、脚掌、尾巴与翅膀素材，以关节动画连续组装动作。四足宠物的步态按实际位移推进；支撑脚保持落地，摆动腿完成抬脚、前摆与落脚，脚掌保持水平。
- 猫狗在当前位置的落脚高度行走，可拖到屏幕中央或其他高度；追玩具时沿水平方向移动。鹦鹉可以沿二维路径飞行，并在闲置时收翅站立。支持梳理、伸展、短跳及落地缓冲；跳跃实际腾空约480毫秒。
- 猫狗掉头时先停下，用约800毫秒依次抬脚转身，再恢复行走；头部通过侧面、斜面和正面素材连续过渡。抚摸时闭眼回应，喂食时张嘴咀嚼，鹦鹉梳理时会转头靠近翅膀。这是二维关节动画，转身的身体轮廓会有轻微融合效果。
- 暂停、拖动与系统减少动态效果会冻结动作和自动移动，恢复时不补播累计时间。旧图集和光流渲染保留为缺失素材时的回退；领养卡片保持静止，睡觉保留原始睡姿。
- v0.2.1 的桌面移动以实际时间计算，约每 16 毫秒更新一次，保留浮点位置并逐步加速、减速；面板预览使用屏幕刷新帧驱动。暂停和系统减少动态效果设置会停用自动小动作。
- v0.2.1 修复了多屏负坐标跨过零点时的窗口参数转换异常，也统一处理拖拽、缩放和手动定位传给 Electron 的整数坐标。
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

测试包含状态校验、互动冷却、衰减、负坐标/多屏范围、IPC 白名单与用户完整流程。动画测试覆盖位移驱动的完整步态、转身时固定支撑脚、转身途中跳跃及腿部可达范围、独立落脚周期、互动的实际画面差异、暂停恢复、素材回退、物种切换后的渲染恢复和最大尺寸下的预览边界。真实桌面测试使用独立临时存储检查透明窗口与关节画布，测量支撑脚在屏幕上的位置与落脚高度，同时检查互动播放、暂停、拖拽、跨零点的原生整数坐标、设置和退出后的数据保存。

Windows 透明效果、DPI、多屏拔插与全屏行为需要 Windows 实机确认。第三方全屏应用没有自动隐藏检测；可通过托盘隐藏宠物。Mac 的跨 Space 显示通过 Electron 原生窗口 API 实现。

## 项目结构

- `src/core/`：纯状态转换、宠物资料与显示器范围逻辑。
- `src/`：React 控制面板、互动预览与宠物渲染。
- `electron/`：透明窗口、鼠标穿透、拖拽、活动、托盘、持久化和隔离的 IPC。
- `public/pets/`：三种宠物的透明 PNG 动作图集与本地姿态光流数据；原始图集提示词在 `docs/asset-prompts.md`，新关节素材提示词在 `docs/rig-asset-prompts.md`。
- `src/rendering/`：Canvas 2D 关节动画，以及旧图集的 WebGL/Canvas 回退。

桌面状态保存在 Electron `userData` 目录的 `companion.json`（Mac 通常为 `~/Library/Application Support/pawpal-desktop/`；Windows 通常为 `%APPDATA%/pawpal-desktop/`），网页预览使用浏览器 localStorage。无需账号或服务器。
