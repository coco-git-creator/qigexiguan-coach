# 七个习惯教练 · 网页版

用户自带 DeepSeek API Key，免费使用，不限次数。你不需要承担任何 API 费用。

## 用户怎么用

1. 打开网页 → 看到引导弹窗
2. 花 1 分钟去 platform.deepseek.com 注册，复制 API Key
3. 粘贴 Key → 开始聊

DeepSeek 新用户有免费额度，够聊几百次。

## 部署（任选一种，都免费）

### 方式 1：GitHub Pages（推荐，最简单）

1. 把 `coach-web/` 推到一个 GitHub 仓库
2. Settings → Pages → Source 选 main 分支 → Save
3. 获得链接 `https://用户名.github.io/仓库名/`

### 方式 2：Netlify 拖拽

1. 打开 app.netlify.com
2. 把 `coach-web/` 文件夹拖进去
3. 自动生成链接

### 方式 3：Vercel

```powershell
npm i -g vercel
cd coach-web
vercel
```

## 你的成本

- 部署：免费（GitHub Pages / Netlify / Vercel 均有免费额度）
- API：免费（每个用户用自己的 DeepSeek Key）
- 域名：可选（默认域名已可用）

## 文件结构

```
coach-web/
├── index.html      # 单文件，包含全部逻辑
└── README.md
```
