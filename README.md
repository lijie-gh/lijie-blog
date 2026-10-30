# lijie 的博客 — 网站源码

**线上站点：https://lijie.gt.tc**

这是博客网站的源码仓库。主体是网站本身（原生 HTML / CSS / JS + 少量 PHP 接口，部署在 gt.tc 的免费 PHP 主机上）；`games/` 里是网站「AI 游戏」栏目用到的 8 个网页作品，作为附件一起托管，方便直接下载和二次修改。

> ⚠️ 网站本体还在整理中，`site/` 目录暂时只有占位说明，整理完成后会补上完整源码。

## 目录结构

```
.
├── site/          # 博客网站本体（整理中，待上传）
└── games/         # 附件：AI 游戏栏目的 8 个网页作品
    ├── 01-dji-osmo-action6/
    ├── 02-snapdragon-8-elite/
    ├── 03-turbofan-engine/
    ├── 04-v8-engine/
    ├── 05-blackhole-lens/
    ├── 06-rainy-night-store/
    ├── 07-watermelon-jelly/
    └── 08-tokengacha/
```

## 附件作品一览

| # | 目录 | 作品 | 说明 |
|---|------|------|------|
| 01 | `games/01-dji-osmo-action6` | DJI Osmo Action 6 · 交互拆解 | 相机全部件程序化生成，可逐件拆解查看参数 |
| 02 | `games/02-snapdragon-8-elite` | 骁龙 8 至尊版 · 3D 拆解 | 芯片封装分层展示，逐层分离 |
| 03 | `games/03-turbofan-engine` | 高涵道比涡扇发动机 | 三维模型，转速滑杆 + 部件清单 |
| 04 | `games/04-v8-engine` | 90° V 型八缸发动机 | 可运转剖视模型，观察气缸工作循环 |
| 05 | `games/05-blackhole-lens` | 黑洞引力透镜 | 实时引力透镜 / 吸积盘着色器演示 |
| 06 | `games/06-rainy-night-store` | 雨夜便利店 | 微缩模型场景，雨量 / 自动旋转 / 雨声可调 |
| 07 | `games/07-watermelon-jelly` | 西瓜果冻 | 软体物理小游戏，手掌拖动 + 切刀 |
| 08 | `games/08-tokengacha` | TokenGacha | LLM API 中转站抽卡模拟器 |

## 本地运行

游戏作品都是纯前端，直接打开对应目录的 `index.html` 即可；如果浏览器限制 `file://` 读取资源，就在该目录起个静态服务：

```bash
python -m http.server 8000
```

博客本体（`site/` 上传后）：需要 PHP 8.0+，把 `site/` 当站点根目录：

```bash
php -S 127.0.0.1:8000 -t site
```

## 说明

- 站点与作品均由 AI 辅助完成，用于学习与交流；引用 / 转载请注明出处。
- `games/*/vendor/` 内是本地化的 Three.js，遵循其 MIT 许可；相机、芯片、发动机等产品外观仅作技术演示，相关商标与设计归各自权利人。
