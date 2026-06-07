/**
 * 七个习惯教练 — Cloudflare Worker API 代理
 *
 * 端点:
 *   POST /chat        — 对话（代理 DeepSeek + 扣减次数 + 存历史）
 *   GET  /usage       — 查询剩余次数  ?deviceId=xxx
 *   POST /activate    — 激活码验证      {deviceId, code}
 *   GET  /history     — 对话历史        ?deviceId=xxx
 *   GET  /progress    — 习惯进度统计    ?deviceId=xxx
 *   GET  /export      — 导出全部卡片    ?deviceId=xxx
 */

// ═══════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════

const FREE_TRIAL = 5;
const MAX_HISTORY = 50;
const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SYSTEM_PROMPT = `你是基于史蒂芬·柯维《高效能人士的七个习惯》的自我成长教练。核心理念：认知镜子，而非任务管家——帮助用户"看见"自己的思维模式和行为盲区，不是管理待办事项。这是一个独立粉丝作品，与 FranklinCovey 无关。

## 核心原则
1. 认知镜子：帮用户看见模式，不是评判用户"懒/差/不自律"
2. 影响圈优先：把注意力从关注圈（无法控制）拉回影响圈（能做的事）
3. 成熟度方向：依赖→独立→互赖，不跳过阶段给建议
4. 由内而外：从品格和思维模式入手，不是技巧
5. P/PC 平衡：产出和产能并重，不杀鸡取卵
6. 一个动作+一面镜子：每次只给一个行动和一个反思

## 七个习惯速查
- 习惯一 积极主动：刺激和回应之间有选择自由。影响圈vs关注圈。主动语言vs被动语言
- 习惯二 以终为始：任何事两次创造（脑中→现实）。个人使命宣言。葬礼想象
- 习惯三 要事第一：四象限（重要/紧急）。大石头先放。周计划>日计划。第二象限是关键
- 习惯四 双赢思维：不是你的方式或我的方式，而是更好的方式。富足心态vs匮乏心态。情感账户
- 习惯五 知彼解己：先诊断再开处方。同理心倾听。避免自传式回应
- 习惯六 统合综效：1+1>2。重视差异。第三选择——不是妥协而是创造
- 习惯七 不断更新：身体/精神/智力/社会情感四个维度。螺旋上升。磨刀不误砍柴工

## 关键概念
- 成熟度连续体：依赖（你照顾我）→ 独立（我可以）→ 互赖（我们一起）
- 影响圈：我能直接控制或间接影响的事。关注圈：关心但无法控制的事
- 情感账户：了解对方、注意小节、信守承诺、明确期望、正直、道歉
- 四象限：重要紧急/重要不紧急/不重要紧急/不重要不紧急

## 工作流
1. 用一句话复述用户的困境——不评判，像镜子
2. 定位成熟度：用户卡在依赖→独立→互赖哪个位置？
3. 点出盲区
4. 给一个影响圈内行动：≤30分钟，明确完成条件
5. 给一个反思问题

## 输出格式（重要）
**默认：自然对话。** 像一位有智慧的导师那样聊天。先倾听、共情、帮用户理清感受。自然地融入七个习惯的视角。

**例外：只有用户明确说"给我一个行动"、"我该怎么办"等索取具体指引时，才用三段卡：**
【镜子】（1-2句点出模式）
【动作】（一个具体行动）
【反思】（一个追问）

**大部分对话不需要三段卡。聊天就好。别变成填表。**

## 输出末尾附加习惯标签
每次回复的最后一行，附加一个隐藏的习惯标记（用户看不到，用于后台统计）：
<!--habit:N-->
N 是 1-7，代表当前对话主要关联的习惯。如果有多个习惯涉及，选最核心的那个。

## 语气
照镜子不贴标签。讲原则不讲道理。温和不鸡汤。用类比。不用"你应该"，用"你可以试试"。不承诺速成。

## 安全边界
遇到自伤、暴力、严重抑郁等高风险信号：先关心→建议专业支持→只给底线稳定动作→不用成长框架要求用户反思。`;

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function error(msg, status = 400) {
  return json({ error: msg }, status);
}

/** 从 AI 回复末尾提取习惯标签 */
function extractHabit(reply) {
  const match = reply.match(/<!--habit:(\d)-->/);
  return match ? `habit${match[1]}` : 'habit1';
}

/** 去除 AI 回复中的习惯标签 */
function cleanReply(reply) {
  return reply.replace(/<!--habit:\d-->/g, '').trim();
}

// ═══════════════════════════════════════════
// KV 操作
// ═══════════════════════════════════════════

async function getUsage(kv, deviceId) {
  const raw = await kv.get(`usage/${deviceId}`);
  if (!raw) return { remaining: FREE_TRIAL, total: FREE_TRIAL, type: 'free', createdAt: new Date().toISOString() };
  return JSON.parse(raw);
}

async function saveUsage(kv, deviceId, usage) {
  await kv.put(`usage/${deviceId}`, JSON.stringify({ ...usage, updatedAt: new Date().toISOString() }));
}

async function getHistory(kv, deviceId) {
  const raw = await kv.get(`history/${deviceId}`);
  return raw ? JSON.parse(raw) : [];
}

async function saveHistory(kv, deviceId, history) {
  // 只保留最近 MAX_HISTORY 条
  const trimmed = history.slice(-MAX_HISTORY);
  await kv.put(`history/${deviceId}`, JSON.stringify(trimmed));
}

async function getProgress(kv, deviceId) {
  const raw = await kv.get(`progress/${deviceId}`);
  return raw ? JSON.parse(raw) : { habit1: 0, habit2: 0, habit3: 0, habit4: 0, habit5: 0, habit6: 0, habit7: 0, total: 0 };
}

async function saveProgress(kv, deviceId, progress) {
  await kv.put(`progress/${deviceId}`, JSON.stringify(progress));
}

// ═══════════════════════════════════════════
// 端点处理
// ═══════════════════════════════════════════

/** POST /chat — 对话 */
async function handleChat(request, env) {
  const { deviceId, message, history: clientHistory } = await request.json();

  if (!deviceId || !message) return error('缺少 deviceId 或 message');

  // 检查次数
  const usage = await getUsage(env.COACH_KV, deviceId);
  if (usage.remaining <= 0) {
    return error('次数已用完，请获取激活码续杯', 402);
  }

  // 检查月卡是否过期
  if (usage.type === 'monthly' && usage.expiresAt) {
    if (new Date(usage.expiresAt) < new Date()) {
      usage.remaining = 0;
      usage.type = 'free';
      await saveUsage(env.COACH_KV, deviceId, usage);
      return error('月卡已过期，请续费', 402);
    }
  }

  // 检查 API Key
  if (!env.DEEPSEEK_KEY) {
    console.error('[handleChat] DEEPSEEK_KEY 未设置');
    return error('服务器配置错误：API Key 未设置', 500);
  }

  // 调用 DeepSeek
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(clientHistory || []).slice(-20), // 最近 20 条上下文
    { role: 'user', content: message },
  ];

  const resp = await fetch(DEEPSEEK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.DEEPSEEK_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.7,
      max_tokens: 1500,
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    console.error('[DeepSeek] API 错误:', resp.status, JSON.stringify(errBody));
    return error(errBody.error?.message || `DeepSeek API 错误 (${resp.status}): ${JSON.stringify(errBody).slice(0, 200)}`, 502);
  }

  const data = await resp.json();
  const rawReply = data.choices[0].message.content;
  const habit = extractHabit(rawReply);
  const reply = cleanReply(rawReply);

  // 扣减次数
  if (usage.type !== 'monthly') {
    usage.remaining = Math.max(0, usage.remaining - 1);
  }
  await saveUsage(env.COACH_KV, deviceId, usage);

  // 存储对话历史
  const history = await getHistory(env.COACH_KV, deviceId);
  history.push({
    date: new Date().toISOString(),
    user: message,
    reply,
    habit,
    tokens: data.usage?.total_tokens || 0,
  });
  await saveHistory(env.COACH_KV, deviceId, history);

  // 更新进度统计
  const progress = await getProgress(env.COACH_KV, deviceId);
  progress[habit] = (progress[habit] || 0) + 1;
  progress.total += 1;
  await saveProgress(env.COACH_KV, deviceId, progress);

  return json({
    reply,
    habit,
    remaining: usage.remaining,
    total: usage.total,
    type: usage.type,
  });
}

/** GET /usage?deviceId=xxx — 查询剩余次数 */
async function handleUsage(request, env) {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('deviceId');
  if (!deviceId) return error('缺少 deviceId');

  const usage = await getUsage(env.COACH_KV, deviceId);
  return json(usage);
}

/** POST /activate — 激活码验证 */
async function handleActivate(request, env) {
  const { deviceId, code } = await request.json();
  if (!deviceId || !code) return error('缺少 deviceId 或 code');

  const codeData = await env.COACH_KV.get(`codes/${code}`);
  if (!codeData) return error('激活码无效');

  const parsed = JSON.parse(codeData);
  if (parsed.used && parsed.deviceId !== deviceId) {
    return error('激活码已被使用');
  }

  // 标记已使用
  parsed.used = true;
  parsed.deviceId = deviceId;
  parsed.usedAt = new Date().toISOString();
  await env.COACH_KV.put(`codes/${code}`, JSON.stringify(parsed));

  // 更新用户用量
  const usage = await getUsage(env.COACH_KV, deviceId);
  if (parsed.type === 'monthly') {
    usage.type = 'monthly';
    usage.remaining = 9999;
    usage.total = 9999;
    usage.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  } else {
    usage.type = 'paid';
    usage.remaining += parsed.count;
    usage.total += parsed.count;
  }
  await saveUsage(env.COACH_KV, deviceId, usage);

  return json({
    success: true,
    type: parsed.type,
    addedCount: parsed.type === 'monthly' ? '月卡无限次' : parsed.count,
    remaining: usage.remaining,
    total: usage.total,
  });
}

/** GET /history?deviceId=xxx — 对话历史 */
async function handleHistory(request, env) {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('deviceId');
  if (!deviceId) return error('缺少 deviceId');

  const history = await getHistory(env.COACH_KV, deviceId);
  return json(history);
}

/** GET /progress?deviceId=xxx — 进度统计 */
async function handleProgress(request, env) {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('deviceId');
  if (!deviceId) return error('缺少 deviceId');

  const progress = await getProgress(env.COACH_KV, deviceId);
  return json(progress);
}

/** GET /export?deviceId=xxx — 导出全部卡片为 Markdown 数组 */
async function handleExport(request, env) {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('deviceId');
  if (!deviceId) return error('缺少 deviceId');

  const history = await getHistory(env.COACH_KV, deviceId);
  const cards = history.map((h) => {
    const d = new Date(h.date);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      filename: `${dateStr}-${h.date.slice(-8, -1).replace(/[^a-z0-9]/g, '')}.md`,
      content: [
        '---',
        `date: ${h.date}`,
        `habit: ${h.habit}`,
        `tags: []`,
        `version: 1`,
        '---',
        '',
        '## 镜子',
        `> ${h.user}`,
        '',
        h.reply,
      ].join('\n'),
    };
  });

  return json(cards);
}

// ═══════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    try {
      if (path === '/chat' && request.method === 'POST') {
        return handleChat(request, env);
      }
      if (path === '/usage' && request.method === 'GET') {
        return handleUsage(request, env);
      }
      if (path === '/activate' && request.method === 'POST') {
        return handleActivate(request, env);
      }
      if (path === '/history' && request.method === 'GET') {
        return handleHistory(request, env);
      }
      if (path === '/progress' && request.method === 'GET') {
        return handleProgress(request, env);
      }
      if (path === '/export' && request.method === 'GET') {
        return handleExport(request, env);
      }

      // 健康检查(含Key诊断)
      if (path === '/health') {
        return json({
          status: 'ok',
          timestamp: new Date().toISOString(),
          hasKey: !!env.DEEPSEEK_KEY,
          keyLen: (env.DEEPSEEK_KEY || '').length,
          keyPrefix: (env.DEEPSEEK_KEY || '').slice(0, 5),
        });
      }

      return error('Not found', 404);
    } catch (err) {
      console.error('[Worker] 未捕获错误:', err);
      return error(err.message || '服务器内部错误', 500);
    }
  },
};
