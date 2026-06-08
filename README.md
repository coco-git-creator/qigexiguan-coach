# 七个习惯教练 · 网页版

基于《高效能人士的七个习惯》的 AI 自我教练对话工具。独立粉丝作品。

## 使用方式

1. 打开网页 → 输入 DeepSeek API Key
2. 开始对话 → AI 教练帮你照见认知盲区
3. 所有数据存在浏览器本地，不上传

## 获取 API Key

1. 打开 [platform.deepseek.com](https://platform.deepseek.com) → 手机号注册
2. 进入「API Keys」→ 新建 Key → 复制
3. 粘贴到网页中即可使用（首次注册有免费额度）

## 部署

推送到 GitHub Pages：

```powershell
git add index.html && git commit -m "..." && git push origin gh-pages
```

## 文件结构

```
├── index.html          # 单文件前端（全功能）
├── DATA_FORMAT.md      # 跨端数据格式规范
└── README.md
```

## 功能

- AI 教练对话（DeepSeek API）
- 反思卡片保存 / 搜索 / 导出
- 七维度雷达图进度追踪
- 浏览器每日提醒
- PDF 周报导出

## 版权声明

独立粉丝作品，与 FranklinCovey 无关。
