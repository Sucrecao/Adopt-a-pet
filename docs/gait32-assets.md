# 0.4.2 行走素材与生成记录

保留写实毛绒外观，将猫、狗的行走和鹦鹉的飞行从 16 个完整姿态增加到 32 个。素材由内置 `imagegen` 生成；选中的透明 PNG 原样复制进项目，没有重绘、修补像素或局部拉伸。每张图为 1774 × 887、8 × 4 布局，包含 32 只完整角色。

| 伙伴 | 最终保存的 PNG | 完整提示词、原始路径与检查记录 |
| --- | --- | --- |
| 猫 | [cat-whole-v3-gait.png](/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/cat-whole-v3-gait.png) | [猫生成记录](/Users/sucrecao/Downloads/Adopt-a-pet/docs/cat-gait32-asset-prompts.md) |
| 狗 | [dog-whole-v3-gait.png](/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/dog-whole-v3-gait.png) | [狗生成记录](/Users/sucrecao/Downloads/Adopt-a-pet/docs/dog-gait32-asset-prompts.md) |
| 鹦鹉 | [parrot-whole-v3-gait.png](/Users/sucrecao/Downloads/Adopt-a-pet/public/pets/parrot-whole-v3-gait.png) | [鹦鹉生成记录](/Users/sucrecao/Downloads/Adopt-a-pet/docs/parrot-gait32-asset-prompts.md) |

运行时每圈为 1060 毫秒，32 个姿态等距排列，每个相位 33.125 毫秒；实际位移步幅仍为 64。新图注册为第 3 页的 96–127 帧，前两页和既有互动、睡觉、转身、衔接数据保持原样。

根据逐帧测量的眼睛位置，以整只角色的统一缩放、横向对齐和循环垂直位移减少抖动。猫的相邻头部位移最多 0.579 像素，狗为 0.289 像素；鹦鹉固定眼睛位置，让翅膀围绕稳定的身体拍动。所有完整裁切保留至少 3 个透明源像素的边缘。

素材仍有局限：猫和狗的脚掌投影高度有变化，部分前后脚身份和支撑顺序不够清晰，不能认定为严格符合四足生物力学的步态。猫的额外修正候选经过测量后更差，已拒绝替换；保留头部更稳定的选中版本。预览与桌面试用版使用同一套动作控制与配准数据。
