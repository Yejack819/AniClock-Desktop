// countdown.js — [v1.0.5.7] 倒计时纯逻辑
//
// 只放**不依赖 Electron / 文件系统 / 定时器**的纯函数，便于用 node 直接跑单测：
//   node docs/tests/countdown.test.js
//
// 设计要点（与闹钟刻意分开，见 main.js 的倒计时引擎）：
//   · 倒计时是「一次性」的：到点响完就结束，绝不重算到明天；
//   · 同一时刻只允许一个东西在响（响铃槽），倒计时到点若槽被占用就排队等下一拍，
//     绝不参与闹钟那套「7 分钟窗口自动跳过」——否则计时器会被静默吞掉；
//   · 时间基准同时用 nextTrigger（绝对时刻）与 remainingMs（剩余量）：
//     运行时以 nextTrigger 为准（休眠/切后台都不丢步），暂停时才用 remainingMs 冻结。

'use strict';

// 时长下限 1 秒、上限 24 小时。超范围一律**拒绝**而不是悄悄夹取 ——
// 夹取会让手机端填 999 小时却只得到 24 小时，用户以为设上了。
const MIN_DURATION_MS = 1000;
const MAX_DURATION_MS = 24 * 3600 * 1000;

const MAX_NAME_LEN = 40;
// 同时存在的倒计时上限：手机端可写，必须有硬上限，否则可以无限堆列表把 countdowns.json 写爆
const MAX_ITEMS = 50;

const SOUNDS = ['beep', 'chime', 'alarm', 'none'];
const STATES = ['running', 'paused'];

// id 形状由主进程生成：'cd_' + 时间戳 + '_' + 6 位 36 进制随机
// 手机端可以传 id 过来（改/删/暂停），所以这里必须能把它当不可信输入校验
const ID_RE = /^cd_[0-9]{6,20}_[a-z0-9]{1,12}$/;

function p2(n) { return (n < 10 ? '0' : '') + n; }

// ========== 时长 ==========

// 合法则返回整数毫秒，非法返回 null
function clampDuration(ms) {
  const n = Math.round(Number(ms));
  if (!Number.isFinite(n)) return null;
  if (n < MIN_DURATION_MS || n > MAX_DURATION_MS) return null;
  return n;
}

function isDuration(ms) { return clampDuration(ms) !== null; }

// 秒 → 'MM:SS'（不足 1 小时）或 'HH:MM:SS'。小时补零保持等宽，避免显示宽度抖动。
function formatClock(sec) {
  const n = Number(sec);
  const s = Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? p2(h) + ':' + p2(m) + ':' + p2(ss) : p2(m) + ':' + p2(ss);
}

// 时长（毫秒，精确值）→ 'MM:SS' / 'HH:MM:SS'
function formatDuration(ms) {
  const n = Number(ms);
  return formatClock((Number.isFinite(n) ? n : 0) / 1000);
}

// 剩余时间（毫秒）→ 'MM:SS' / 'HH:MM:SS'
// 用 ceil：剩余 4:59.2 应显示 05:00 而不是 04:59，否则刚设好 5:00 会立刻跳成 04:59
function formatRemaining(ms) {
  const n = Number(ms);
  return formatClock(Math.ceil(Math.max(0, Number.isFinite(n) ? n : 0) / 1000));
}

// 解析用户手输的时长：支持 '90'（分钟）、'2h30m'、'1:30'（分:秒）、'1:02:03'（时:分:秒）、
// '2h30m10s'。返回毫秒或 null。手机端与桌面编辑器共用。
function parseDurationText(text) {
  if (text === undefined || text === null) return null;
  const raw = String(text).trim().toLowerCase();
  if (!raw) return null;

  // 纯数字 = 分钟（最常见的手输语义）
  if (/^\d+$/.test(raw)) {
    const mins = parseInt(raw, 10);
    return Number.isFinite(mins) && mins > 0 ? clampDuration(mins * 60000) : null;
  }

  // 冒号分隔：两段 = 分:秒；三段 = 时:分:秒
  if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(raw)) {
    const parts = raw.split(':').map(x => parseInt(x, 10));
    let total = 0;
    if (parts.length === 2) total = parts[0] * 60 + parts[1];
    else total = parts[0] * 3600 + parts[1] * 60 + parts[2];
    return clampDuration(total * 1000);
  }

  // 带单位：h / m / s（可任意组合、必须按 h→m→s 顺序）
  const m = raw.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/);
  if (m && (m[1] || m[2] || m[3])) {
    const sec = (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
    return sec > 0 ? clampDuration(sec * 1000) : null;
  }
  return null;
}

// ========== 名称 ==========

// 剔控制字符（含换行/制表）、折叠空白、去首尾、截断到 40 字。
// 手机端可写 → 名称是唯一会进 DOM 的自由文本，必须在这里收口（渲染侧再 escapeHtml 一次）。
function normalizeName(raw) {
  const s = String(raw === undefined || raw === null ? '' : raw)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.slice(0, MAX_NAME_LEN);
}

// ========== id ==========

function isValidId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

// 可注入 now/rand 便于测试
function newId(nowMs, rand) {
  const t = Number.isFinite(Number(nowMs)) ? Math.round(Number(nowMs)) : Date.now();
  const r = rand === undefined ? Math.random().toString(36).slice(2, 8) : String(rand);
  return 'cd_' + t + '_' + r;
}

// ========== 记录校验 / 归一 ==========

// 落盘/导入/手机端传来的记录 → 干净记录；不可信则返回 null（调用方直接丢弃）
function normalizeRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (!isValidId(input.id)) return null;
  const durationMs = clampDuration(input.durationMs);
  if (!durationMs) return null;
  const state = STATES.indexOf(input.state) >= 0 ? input.state : 'running';
  if (state === 'running' && !input.nextTrigger) return null;

  const out = {
    id: input.id,
    name: normalizeName(input.name),
    durationMs,
    state,
    sound: SOUNDS.indexOf(input.sound) >= 0 ? input.sound : 'beep',
    snoozeEnabled: input.snoozeEnabled !== false,
    snoozeHours: clampInt(input.snoozeHours, 0, 23, 0),
    snoozeMinutes: clampInt(input.snoozeMinutes, 0, 59, 5),
    snoozeSeconds: clampInt(input.snoozeSeconds, 0, 59, 0),
    snoozeCount: clampInt(input.snoozeCount, 0, 999, 0),
    createdAt: Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : Date.now(),
    nextTrigger: null,
    remainingMs: clampInt(input.remainingMs, 0, MAX_DURATION_MS, durationMs),
  };
  if (state === 'paused') {
    // 暂停态必须有一个**正**剩余量；0/负数/缺失都视为不可信（内部路径不会产生），退回整段时长
    const left = Math.round(Number(input.remainingMs));
    out.remainingMs = (Number.isFinite(left) && left > 0)
      ? Math.min(left, MAX_DURATION_MS)
      : durationMs;
    out.nextTrigger = null;
  } else {
    const t = new Date(input.nextTrigger).getTime();
    if (!Number.isFinite(t)) return null;
    out.nextTrigger = new Date(t).toISOString();
    out.remainingMs = Math.max(0, t - Date.now());
  }
  return out;
}

function clampInt(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

// ========== 构造 / 状态迁移（均返回新对象，不改入参） ==========

function makeCountdown(fields, nowMs) {
  const f = fields || {};
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const durationMs = clampDuration(f.durationMs) || MIN_DURATION_MS;
  return {
    id: isValidId(f.id) ? f.id : newId(now, f.rand),
    name: normalizeName(f.name),
    durationMs,
    remainingMs: durationMs,
    state: 'running',
    sound: SOUNDS.indexOf(f.sound) >= 0 ? f.sound : 'beep',
    snoozeEnabled: f.snoozeEnabled !== false,
    snoozeHours: clampInt(f.snoozeHours, 0, 23, 0),
    snoozeMinutes: clampInt(f.snoozeMinutes, 0, 59, 5),
    snoozeSeconds: clampInt(f.snoozeSeconds, 0, 59, 0),
    snoozeCount: clampInt(f.snoozeCount, 0, 999, 0),
    createdAt: now,
    nextTrigger: new Date(now + durationMs).toISOString(),
  };
}

// 当前剩余量：运行中按绝对时刻算（休眠/切后台不丢步），暂停时取冻结值
function effectiveRemaining(cd, nowMs) {
  if (!cd || typeof cd !== 'object') return 0;
  if (cd.state === 'paused') return Math.max(0, Number(cd.remainingMs) || 0);
  const t = cd.nextTrigger ? new Date(cd.nextTrigger).getTime() : NaN;
  if (!Number.isFinite(t)) return Math.max(0, Number(cd.remainingMs) || 0);
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  return Math.max(0, t - now);
}

// 暂停：把绝对时刻换成冻结的剩余量
function pauseCountdown(cd, nowMs) {
  const left = effectiveRemaining(cd, nowMs);
  return { ...cd, state: 'paused', remainingMs: Math.max(1, left), nextTrigger: null };
}

// 继续：从冻结的剩余量重新起算
function resumeCountdown(cd, nowMs) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const left = clampInt(cd && cd.remainingMs, 1, MAX_DURATION_MS, MIN_DURATION_MS);
  return { ...cd, state: 'running', remainingMs: left, nextTrigger: new Date(now + left).toISOString() };
}

// 改时长：用新的整段时长重新计时（编辑语义 —— 不改时长时应当重设，符合用户预期）
function retimeCountdown(cd, durationMs, nowMs) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const d = clampDuration(durationMs) || (cd && cd.durationMs) || MIN_DURATION_MS;
  return { ...cd, durationMs: d, remainingMs: d, state: 'running', nextTrigger: new Date(now + d).toISOString() };
}

// 再来一次
function restartCountdown(cd, nowMs) {
  return retimeCountdown(cd, cd && cd.durationMs, nowMs);
}

// ========== 每拍判定 ==========

// 'wait'   还没到点（或记录不可用）
// 'ring'   到点了，应该在 graceMs 内补响
// 'expire' 错过太久（应用关闭/休眠过久）→ 直接丢弃，绝不"补到明天"
function tickDecision(cd, nowMs, graceMs) {
  if (!cd || cd.state !== 'running') return 'wait';
  const t = cd.nextTrigger ? new Date(cd.nextTrigger).getTime() : NaN;
  if (!Number.isFinite(t)) return 'wait';
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const delta = now - t;
  if (delta < 0) return 'wait';
  const grace = Number(graceMs);
  return delta <= (Number.isFinite(grace) ? grace : 0) ? 'ring' : 'expire';
}

// ========== 视图 ==========

// 对外（IPC / 手机端）暴露的字段：只给显示与倒扣计算所需的，
// 不带 snooze* / createdAt 这类内部状态
function toPublic(cd, nowMs) {
  if (!cd || typeof cd !== 'object') return null;
  return {
    id: String(cd.id || ''),
    name: String(cd.name || ''),
    durationMs: Math.max(0, Number(cd.durationMs) || 0),
    remainingMs: effectiveRemaining(cd, nowMs),
    state: cd.state === 'paused' ? 'paused' : 'running',
    endAt: cd.state === 'paused' ? null : (cd.nextTrigger || null),
  };
}

// 列表摘要：count/running/paused + 最近到期的一个（信息栏 chip 用）
// 优先运行中的最小剩余；没有运行中的就退回暂停里剩余最小的那个
function summarize(list, nowMs) {
  const arr = Array.isArray(list) ? list.filter(x => x && typeof x === 'object') : [];
  let running = 0, paused = 0, nearest = null, nearestLeft = Infinity;
  let pausedNearest = null, pausedLeft = Infinity;
  arr.forEach(cd => {
    const left = effectiveRemaining(cd, nowMs);
    if (cd.state === 'paused') {
      paused++;
      if (left < pausedLeft) { pausedLeft = left; pausedNearest = cd; }
      return;
    }
    running++;
    if (left < nearestLeft) { nearestLeft = left; nearest = cd; }
  });
  const pick = nearest || pausedNearest;
  return {
    count: arr.length,
    running,
    paused,
    nearest: pick ? {
      id: pick.id,
      name: pick.name,
      state: pick.state === 'paused' ? 'paused' : 'running',
      remainingMs: effectiveRemaining(pick, nowMs),
      text: formatRemaining(effectiveRemaining(pick, nowMs)),
    } : null,
  };
}

// 贪睡间隔（毫秒），与闹钟同一套 h/m/s 语义
function snoozeMs(cd) {
  const h = clampInt(cd && cd.snoozeHours, 0, 23, 0);
  const m = clampInt(cd && cd.snoozeMinutes, 0, 59, 5);
  const s = clampInt(cd && cd.snoozeSeconds, 0, 59, 0);
  return Math.max(1000, h * 3600000 + m * 60000 + s * 1000);
}

// ========== 创建校验（桌面编辑器与手机端共用同一入口） ==========

// payload：不可信输入。opts.defaultName：名称为空时的兜底（由主进程按语言给）
function validateCreate(payload, nowMs, opts) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const durationMs = clampDuration(p.durationMs);
  if (!durationMs) return { ok: false, error: 'bad-duration' };
  const o = opts || {};
  const fields = {
    name: normalizeName(p.name) || normalizeName(o.defaultName) || 'Countdown',
    durationMs,
    sound: p.sound,
    snoozeEnabled: p.snoozeEnabled,
    snoozeHours: p.snoozeHours,
    snoozeMinutes: p.snoozeMinutes,
    snoozeSeconds: p.snoozeSeconds,
    snoozeCount: p.snoozeCount,
  };
  return { ok: true, value: makeCountdown(fields, nowMs) };
}

// 编辑校验：只允许改名称/时长/声音/贪睡
function validateUpdate(payload) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const out = {};
  if (p.name !== undefined) out.name = normalizeName(p.name);
  if (p.durationMs !== undefined) {
    const d = clampDuration(p.durationMs);
    if (!d) return { ok: false, error: 'bad-duration' };
    out.durationMs = d;
  }
  if (p.sound !== undefined) out.sound = SOUNDS.indexOf(p.sound) >= 0 ? p.sound : 'beep';
  if (p.snoozeEnabled !== undefined) out.snoozeEnabled = p.snoozeEnabled !== false;
  if (p.snoozeHours !== undefined) out.snoozeHours = clampInt(p.snoozeHours, 0, 23, 0);
  if (p.snoozeMinutes !== undefined) out.snoozeMinutes = clampInt(p.snoozeMinutes, 0, 59, 5);
  if (p.snoozeSeconds !== undefined) out.snoozeSeconds = clampInt(p.snoozeSeconds, 0, 59, 0);
  if (p.snoozeCount !== undefined) out.snoozeCount = clampInt(p.snoozeCount, 0, 999, 0);
  if (Object.keys(out).length === 0) return { ok: false, error: 'empty-update' };
  return { ok: true, value: out };
}

const api = {
  MIN_DURATION_MS,
  MAX_DURATION_MS,
  MAX_NAME_LEN,
  MAX_ITEMS,
  SOUNDS,
  STATES,
  ID_RE,
  isValidId,
  newId,
  clampDuration,
  isDuration,
  formatClock,
  formatDuration,
  formatRemaining,
  parseDurationText,
  normalizeName,
  normalizeRecord,
  clampInt,
  makeCountdown,
  effectiveRemaining,
  pauseCountdown,
  resumeCountdown,
  retimeCountdown,
  restartCountdown,
  tickDecision,
  toPublic,
  summarize,
  snoozeMs,
  validateCreate,
  validateUpdate,
};

// Node（主进程 / 单测）走 CommonJS；被经典 <script> 加载时（倒计时编辑窗）自动降级成全局，
// 这样「时长解析 / 格式化」只有一份实现，编辑器不会和主进程跑出两套口径。
if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
