# PawPal0.5.0：简笔画整帧宠物验收

2026-10-13开始，2026-10-14完成。用户授权改用简笔画小狗、小猫并全权完成；完整图片、连贯动作和落脚同步要求保留。

猫、狗现使用统一绘制的整帧图集。每种登记5,776个完整姿态，走路有128张不同画面，并配有128条从对应步态开始的停步轨迹。站立、休息、走路、转身、抚摸、进食、梳理、伸展和跳跃均可用。转身800ms，终点与完整镜像站姿逐像素一致。已经站稳时停步保持同一画面。回程与静止帧会重复使用；实际不同图像为狗5,207张、猫5,171张。

运行时选择完整图片，并在固定透明窗口中以小数坐标移动整张画面。步态与实际提交的位移共用一个时刻。素材按需解码，使用32MiB缓存预算；绘制失败时保留当前完整图片和位置，恢复时接着动作，不补跳停住期间的帧。暂停、拖拽和减少动态效果冻结画面。

## 验证

- 最终单元测试：368通过，0失败。
- 新旧完整帧、加载占位和预览浏览器回归：69通过。
- 独立素材审计：全部11,552个登记图格完整且没有裁切，286页PNG及来源哈希一致，猫狗各128张不同走路图。
- 独立动作检查：每种2,483次实际绘制，包括九类动作、864次完整镜像、128个停步接点、互动打断及60/120Hz共同时间点的一致性。
- 正常与四分之一速度实际播放：36段、1,980个rAF采样；最高单段p95间隔18ms，最长21ms。暂停逐像素保持，逐张检查及328px布局通过。
- 桌面位移与所选整帧脚位结合检查：狗接地量化误差最高0.4193DIP，猫0.3949DIP；提交的画面位移与步态距离一致。
- 开发版与最终安装包使用独立临时配置检查；覆盖小数位置、走路、停步互动、模拟绘制失败、暂停、减少动态效果、拖拽冻结、大小和屏边位置。临时配置测试后清理。
- 包完整性检查54项通过：全部290个新素材文件、382个dist文件、3个electron文件、14个core文件与ASAR一致。版本0.5.0，Electron44.7.0，本地ad-hoc签名通过deep/strict验证。
- 最终已签名安装包的猫、狗GUI检查均通过；各217个走路采样中位移与步态距离一致。捕获像素独立复核0.25DIP移动，猫实测0.2502DIP、狗0.2508DIP。
- 原图源文件及0.4.3、0.4.4、0.4.5安装包哈希保持不变。

具体记录：[独立视觉检查](../.artifacts/line-pets/qa-review.md)、[代码复核](../.artifacts/line-pets/integration-review.md)、[桌面检查](../.artifacts/line-pets/visual-desktop-review.md)、[安装包完整性](../.artifacts/line-pets/release-integrity-report.md)。最终包运行记录在`.artifacts/line-pets/visual-packaged-{cat,dog}/`；预览在`.artifacts/line-pets/index.html`，原预览入口也已连接新画面。

安装包：`release/PawPal-0.5.0-mac-arm64.zip`。压缩包校验通过，SHA256及最终数据见`.artifacts/line-pets/final-release-report.json`。本地构建使用已安装的Electron，命令为`npm run build`，再执行`CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --dir --mac --arm64 --config.electronDist=node_modules/electron/dist --config.mac.identity=- --config.directories.output=.artifacts/line-pets/package`；避免使用个人签名证书或改变系统设置。

这些是指定环境下的有限采样与实际像素检查。没有测量WindowServer扫描输出，也没有证明任意负载下零丢帧。跨显示器拖拽/DPR切换的连续像素、向其他原生应用点击穿透和原生反向转身节奏仍缺少完整实测。本地签名不等于Apple公证。鹦鹉继续使用原来的完整帧资源和移动方式。
