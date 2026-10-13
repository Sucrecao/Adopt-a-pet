# 完整宠物原画与播放：本地检查

2026-10-13。本轮保留写实毛绒风格和每个姿态一张完整原画的要求。
当前动画仍没有通过自然、丝滑的视觉验收。以下检查证明的是各自有限范围，
不能合并成“每一帧已完美”的结论。

## 已确认的原画问题

已查看猫、狗、鹦鹉各128张原画，共384张；包括九种动作、当前32张移动原画、
循环接缝及桥接姿态。原始图集和v7 metadata保持不变。

| 宠物 | 明确需要重做的连续动作 |
| --- | --- |
| 猫 | 步行119→120脚部最低轮廓上移约9.57canonical像素；起步、停步及睡眠衔接跳变。 |
| 狗 | 步行96→97下半身轮廓变化明显；前脚恢复重复、支撑脚与根移动关系不可靠；睡醒端口缺中间姿态。 |
| 鹦鹉 | 飞行102→103、119→120翼角跳变；转身只有主要三组朝向；起飞95→94→96及落地127→94→95缺连续展合翼和身体升降。 |

猫狗的四图完整原画试验、随后单张完整下一帧试验均已实际测量并拒绝。
猫单张试验的近前脚实际推进12.856、抬高6.737像素，超过3/128小相位合同的
0.171/0.759；远前支撑脚世界漂移5.621像素。狗也出现支撑脚向前滑动，且毛发
锐度改变。完整动物和相机相近，不等于真实连续下一帧。这些候选没有进入生产。

源报告：`.artifacts/whole-temporal-audit-2026-10-13/findings-and-authoring.md`、
`.artifacts/whole-temporal-parrot-audit-2026-10-13/findings-and-authoring.md`及
`.artifacts/whole-smooth-cat-single-next-v1-qa/review.md`、
`.artifacts/whole-smooth-dog-pilot-single-v2/pilot-verdict.md`。

## 已完成的运行时修复

v7只在实际frame或整幅facing变化时重新画完整照片；相同成功姿态直接保留。
失败绘制会失效缓存，新的实例使用新缓存。重复dispose现在幂等，旧实例不再
二次清空新实例图片。Pet只写真正变化的DOM值，但继续采样控制器、发布真实
时间/位移/相位和readiness，保留单一rAF与原生同步paint。

相关91项浏览器回归通过，包含真实RED后修复的失败恢复和旧实例重复释放。
本轮另运行149项控制器及原生移动unit检查，均通过；最终本地build通过。

有限正常GPU测量：优化前18,001个刷新回调区间中，没有超过1.5倍中位cadence
或25ms的间隔。优化后120Hz重新提交减少68–75%，60Hz减少51–57%，属性写入
减少82–88%；重复图片提交和接受位移遥测不一致均为0。after120Hz有少量
13.5/14.4ms间隔；曾与CPU重载测试重叠的一次208ms间隔完整保留，不当作
正常负载通过数据。rAF正常不证明操作系统每个合成帧都已展示，更不证明脚位正确。

来源：`.artifacts/whole-pacing-report.md`、`whole-pacing-optimization-report.md`
和`whole-pacing-self-review.md`。GPU计时没有混入每帧截图或RGBA回读。

## 原生截图比对调查

最终build原生复验中，猫通过；狗启动段先后两次严格RGBA比对失败，中间一次
fresh诊断通过。失败数据与原图均保留。

独立可见透明Electron窗口、不加载Pet/App/移动控制器，使用同一生产renderer
和完整狗94照片复现了同一像素对：probe实际和reference分别与真实失败PNG的
全部RGBA逐字节一致。缓存只持有一次成功完整绘图，reference反复重绘/读回。
软件与GPU采样的位图差异不会被“sourceExact”名称解释成真实选错照片。
失败画面和第94张完整照片的形状一致；不透明区域RGB平均差约0.55/255。

该结果排除了这次失败是旧frame、朝向错位或App双通道选择错误。原测试包含
大量RGBA回读，不能兼作正常FPS测试。后续精确像素检查采用明确的可重现软件
2D诊断条件，仍保持字节相等断言；正常GPU播放性能与原画连贯性单独验收。
最终明确启用`--disable-accelerated-2d-canvas`，确认运行条件并保留严格RGBA
字节相等断言。猫、狗、鹦鹉三组原生检查全部通过，共476个同步移动包；包括
95/94准备姿态、按实际接受位移选择完整图、转身、五种care、暂停/拖动/减少
动态的精确冻结。猫准备188ms、狗1000ms（含800ms转身）、鹦鹉169ms。
报告保存在`.artifacts/whole-smooth-local-native-final-{cat,dog,parrot}-report.json`。
这证明受控软件2D条件下的有限原生来源选择与冻结；不替代正常GPU播放计时，
也不批准原画动作。

## 连续源与账户状态

Runway认证成功，但连接的Free方案没有可用视频模型。已展示真实开通入口，
用户选择先继续本地检查。没有提交Runway生成、购买或套餐修改。
逐张照片工具尚未提供通过足端/身份连续性的步态；加大帧数或改变播放时长
不能替代缺失的完整运动原画。

已确认端点插值的本地设计保留在`.artifacts/whole-confirmed-travel-design.md`。
简单float residual会使用未接受位移；原生窗口与CSS补偿是否同次屏幕呈现
尚未证明。没有把该实验偷偷变成生产“修复”。

精确视频解码工具`scripts/extract-whole-video-frames.py`完成9项验证，包括
原始PTS、透明RGBA、重复源帧保留、B帧包/图重排、缺失原PTS拒绝及并发
输出保护。FFmpeg的`-n`不会保护编号image2输出；工具改为私有同级暂存目录
完成后rename，目标被其它写入者占用时原字节保持不变。有限无动物fixture和
原日志保留在`.artifacts/whole-video-extraction-example-v2`。它只提取实际视频
画面，不制造中间照片或自动批准动作。

## 新的离线完整角色小样

隔离的原生ARM bpy4.5.14已实际输出四张独立透明球体PNG；运行需正常原生
进程审批，默认沙箱的Metal检测崩溃已留存。正在尝试一个持久完整三维银灰
幼猫离线渲染来源。先独立检查neutral是否保留原猫的写实短绒、头身比例、
面部和连续皮肤；外观通过才进入有限步行小样。模型和骨骼只用于离线作者
流程，应用仍选择每张完整PNG，不以旧照片身体/腿作为纹理。

128相位纯数学接触fixture已通过；常规斜视镜头会造成支撑脚纵漂，候选
相机basis使+X只投影到屏幕X，约−6.845° sensor roll的外观取舍待实际整图
检查。数学正确、渲染成功及文件数都不代表动物外观或运动已通过。

实际neutral v1–v4已经完整渲染并由作者/root分别查看；四版均拒绝。v3/v4改善
了外露白眼球与脸色，但耳内、幼猫脸与圆趾身份仍不足，整体偏简化毛绒toy，
没有保住原猫的写实外观；v1还有硬白脸色块。实际PNG、
冻结model代码、作者场景及source provenance全保留，未扩成128个动物姿态。
实际saved scene检查还确认v1只有一个skin对象、却有17个连接分量，不能按
作者最初的描述称为连续皮肤；v2–v4才是单一连接分量。全部场景没有文件图片
纹理，源照片只用于外观对照。v1 render seed实际为默认0，后续为731901；
这些补充事实记录在作者独立验证里，不修改旧PNG或provenance原文。

对已保存整数native travel作新128相位的有限数学回放，120Hz/.65尺寸只选择
33/128相位，最多跨6相位；60Hz/默认尺寸覆盖128相位，最多跨10相位。最大
source toe jump约11.95/17.15canonical像素。这是旧接受位移轨迹下的数学
候选，不是新动物原画实际paint或显示cadence丢帧。提高数量不能独自解决呈现。

新固定native-origin小实验只移动一个完整sphere PNG，在720×640DIP透明
临时窗口里实际测到0.250089/0.249911DIP步幅，最大stationary alpha centroid
误差0.000150DIP；43个bounds样本均不变，暂停两张native surface RGBA完全
相同。有限9次capture和2个surface callback不能证明正常FPS或WindowServer
每帧scanout，也未实现整屏命中/拖动/多屏或完整宠物的新visual-origin clock。
报告与原数据保留在`.artifacts/whole-fixed-window-presentation-pilot`。

独立无render骨/mesh代理检查同时发现并复现离线模型的父子pose缓存、body
pivot与混合sole权重错误。fresh phase0保持rest不能说明后续pose正确；原
非零pose最大bone误差超过1H。显式desired-parent basis的对照恢复到浮点
误差量级；100%对应paw的proxy接触才随真实toe/heel。报告保留在
`.artifacts/whole-local-3d-cat-pilot/model-v1-math-static-review.md`。
这些检查没有生成或批准walk原画，真实sole皮肤与每张动作图片仍需另验。

新离线`pose-matrices.py` helper已实作并fresh验证132个无动物render姿态，root
独立复跑退出0：max骨目标误差8.54e−7H，骨长误差2.33e−7H，body/hip映射
误差1.91e−7H；phase1去root接缝1.60e−7H、回phase0差0（容限3e−6H）。
原失败RED、独立controls和GREEN全部保留。helper只修正离线骨矩阵，没有
改变生产renderer/控制器，也没有替代实际sole或原猫外观验收。

本轮未更换生产原画、未修改已安装应用/原有配置、未提交Git或发布新版本。
原0.4.5 ZIP仍是此前的整图恢复发布；工作区的新播放优化尚未被当作自然动作
完成版打包。
