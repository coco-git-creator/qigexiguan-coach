# 习惯镜子 · 网页版

AI 自我教练对话工具。照见行为模式，看清认知盲区。

## 用户怎么用

1. 打开网页 → 看到欢迎引导
2. 直接开始对话，无需注册/自带 Key
3. 免费试用 5 次，之后购买激活码续杯

## 架构

```
用户浏览器 → GitHub Pages (index.html)
               ↓ fetch
            Cloudflare Worker (API 代理)
               ↓ 转发
            DeepSeek API
               ↓ 存储
            Cloudflare KV (用量/历史/进度/激活码)
```

## 部署

### 前端

```powershell
cd coach-web
git add index.html && git commit -m "..." && git push origin gh-pages
```

### Worker

```powershell
cd coach-web/worker
wrangler deploy
```

## 文件结构

```
coach-web/
├── index.html          # 单文件前端
├── worker/
│   ├── index.js        # Worker API 代理
│   └── wrangler.toml   # Worker 配置
├── DATA_FORMAT.md      # 跨端数据格式规范
└── README.md
```

## 版权声明

习惯镜子是独立个人作品，灵感来源于史蒂芬·柯维的著作，与其无关，不隶属于 FranklinCovey 或其关联机构。
