# Roomabouts

Roomabouts 是一个以本地运行为先、面向 Home Assistant 的室内空间地图原型。它把支持 X/Y 坐标的毫米波存在传感器转换为实时空间视图，同时尽量避免持久保存移动坐标。

> **开发状态：** 此分支仍在实现中，请勿安装到主要的 Home Assistant 实例。首次安装必须在已备份的测试实例中完成，并通过存储、权限与 Recorder 检查。

## 首个验证范围

- 一个房间、一个楼层、一个支持 X/Y 的毫米波传感器、一个移动的人；
- 仅使用 Home Assistant 实体状态作为实时输入；
- 硬件到货前使用合成回放进行开发；
- 坐标流仅限管理员，并且只保存在内存中；
- 普通 Home Assistant 状态只公开不含坐标的数量和占用信息；
- 使用 Roomabouts 自有的地图视觉与会话内匿名轨迹。

首个验证不支持直接雷达 WebSocket、RMM 硬件配对、UDP 监听、硬件 MQTT 命令、BLE 身份、UWB、实名追踪、云账户、遥测或远程访问。

## 兼容性

Roomabouts 基于 [Radar Map Manager](https://github.com/Moe8383/radar_map_manager) 的兼容分支构建，并保留其 Git 历史和 MIT 许可证。为了避免在原型验证前引入高风险迁移，内部域名、存储键、服务命名空间、组件目录、自定义卡片元素和发布压缩包名称暂时保持不变；产品名称和用户界面使用 Roomabouts。

完整的范围、隐私边界、开发命令与当前限制请参阅 [英文 README](README.md) 和 [实施计划](docs/plans/active/2026-11-15-rmm-fork-foundation.md)。
