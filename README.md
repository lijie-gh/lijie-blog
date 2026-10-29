# AI 网页作品合集

在线体验：**https://lijie.gt.tc/ai-games.html**

8 个纯前端作品：3D 交互拆解、可视化演示和小游戏。全部是原生 HTML/CSS/JS（部分用 Three.js），**不需要构建、不需要后端**，打开 `index.html` 就能跑。

## 作品列表

| # | 目录 | 作品 | 说明 |
|---|------|------|------|
| 01 | `01-dji-osmo-action6` | DJI Osmo Action 6 · 交互拆解 | 相机全部件程序化生成，可逐件拆解查看参数 |
| 02 | `02-snapdragon-8-elite` | 骁龙 8 至尊版 · 3D 拆解 | 芯片封装分层展示，逐层分离 |
| 03 | `03-turbofan-engine` | 高涵道比涡扇发动机 | 工业级三维模型，转速滑杆 + 部件清单 |
| 04 | `04-v8-engine` | 90° V 型八缸发动机 | 可运转剖视模型，观察气缸工作循环 |
| 05 | `05-blackhole-lens` | 黑洞引力透镜 | 实时引力透镜/吸积盘着色器演示 |
| 06 | `06-rainy-night-store` | 雨夜便利店 | 微缩模型场景，雨量/自动旋转/雨声可调 |
| 07 | `07-watermelon-jelly` | 西瓜果冻 | 软体物理小游戏，手掌拖动 + 切刀 |
| 08 | `08-tokengacha` | TokenGacha | LLM API 中转站抽卡模拟器，抽卡/工作/存档 |

## 目录结构

```
.
├── 01-dji-osmo-action6/     # 每个作品一个目录，入口都是 index.html
│   ├── index.html
│   └── vendor/              # 本地化的 Three.js
├── ...
├── 08-tokengacha/
│   └── index.html
└── site/                    # 预留：博客网站本体（暂未上传）
```

## 本地运行

- 直接双击 `index.html` 即可；
- 如果浏览器因为 `file://` 限制加载不了资源，在该目录下起个静态服务：

```bash
python -m http.server 8000
# 然后打开 http://127.0.0.1:8000/
```

## 说明

- 作品均由 AI 辅助生成，用于学习与交流；引用/转载请注明出处。
- `vendor/` 里的 Three.js 遵循其 MIT 许可；产品外观（相机、芯片、发动机）仅作技术演示，相关商标与设计归各自权利人。
- 博客网站本体（PHP 后台 + 静态页）暂未上传，将来放在 `site/` 目录。
