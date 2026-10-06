/* anim-ease.test.js — [v1.0.5.7] 数字动画「节奏」（--anim-ease）的静态验收
 *
 * 跑法：
 *   NODE_PATH=$HOME/.workbuddy/binaries/node/workspace/node_modules node docs/tests/anim-ease.test.js
 *   （本文件其实不需要 jsdom，直接 node 跑也行）
 *
 * 为什么单开一个：节奏只用一个 CSS 变量 + 各条 transition 的 var() 兜底，没有可断言的行为，
 * 但这套机制里有几个「坏掉也不报错」的点，正是它值得被钉住的原因：
 *   ① 默认档（弹性）必须走 var() 的 fallback —— 一旦有人在 :root / .clock 上写死一个
 *      --anim-ease，「弹性」就变成写死某条曲线，而页面看上去一切正常；
 *   ② 「弹性」档必须 removeProperty，**绝不能** setProperty('--anim-ease','')：
 *      空值会让 var() 取到空 → 整条 transition 声明失效 → 数字直接跳变、完全没有动画；
 *   ③ 3D 旋转（出场 ease-in / 入场 ease-out）与模糊的 filter 曲线属于「附加效果自身的节奏」，
 *      不能被这个变量带着跑（用户明确要求：只改主数字，附加效果不动）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf-8');

const css = read('styles.css');
const page = read('lan-mirror-page.html');
const renderer = read('renderer.js');
const main = read('main.js');
const settings = read('settings.js');
const lan = read('lan-mirror.js');
const settingsHtml = read('settings.html');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('[PASS] ' + name); }
  else { fail++; failures.push(name + (extra === undefined ? '' : ' → ' + extra)); console.log('[FAIL] ' + name + (extra === undefined ? '' : ' → ' + extra)); }
}

const RB = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
// ⚠️ 必须先剥注释：源码注释里正大光明地写着反例（「setProperty('--anim-ease','') 会让
//    transition 失效」），不剥掉的话「禁止写空串」这条断言会被自己的注释判失败。
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const cssPlain = stripComments(css);
const rendererPlain = stripComments(renderer);
const pagePlain = stripComments(page);

// ---------- ① 桌面 styles.css ----------
console.log('--- 桌面 styles.css ---');
ok('主数字的出场过渡读 --anim-ease（兜底是原来的回弹曲线）',
  new RegExp('transition:\\s*transform var\\(--anim-duration, 350ms\\) var\\(--anim-ease, ' + RB.replace(/[.()]/g, '\\$&') + '\\)').test(css));
ok('主数字的入场过渡同样读 --anim-ease', (css.match(/var\(--anim-ease, cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)\)/g) || []).length >= 4,
  String((css.match(/var\(--anim-ease,/g) || []).length) + ' 处');
ok('淡入淡出家族的兜底曲线仍是 ease（不是回弹）',
  /transition:\s*opacity var\(--anim-duration, 350ms\) var\(--anim-ease, ease\);/.test(css));

// 3D 旋转：出场 ease-in / 入场 ease-out，且这两条规则**不读**该变量
// （按规则块精确取，别按「从某处切到某处」——中间夹着的注释也会被切进来）
const rule3dOut = cssPlain.match(/\.anim-flip-3d \.digit-current\.animate-out \{[^}]*\}/);
const rule3dIn = cssPlain.match(/\.anim-flip-3d \.digit-next\.animate-in \{[^}]*\}/);
ok('3D 旋转的出场曲线仍是 ease-in（附加效果不动）',
  !!rule3dOut && /ease-in/.test(rule3dOut[0]) && rule3dOut[0].indexOf('--anim-ease') < 0,
  rule3dOut && rule3dOut[0].replace(/\s+/g, ' '));
ok('3D 旋转的入场曲线仍是 ease-out', !!rule3dIn && /ease-out/.test(rule3dIn[0]) && rule3dIn[0].indexOf('--anim-ease') < 0,
  rule3dIn && rule3dIn[0].replace(/\s+/g, ' '));

// 模糊：filter 的曲线固定 ease-out；transform / opacity 走变量（否则勾了模糊节奏就失效）
const blurBlock = css.slice(css.indexOf('.blur-enabled.anim-flip .digit-current.animate-out'));
const blurRule = blurBlock.slice(0, blurBlock.indexOf('}'));
ok('模糊规则里的 transform / opacity 读 --anim-ease', (blurRule.match(/var\(--anim-ease,/g) || []).length === 2);
ok('模糊自身的 filter 曲线固定 ease-out（不跟随节奏）',
  /filter var\(--blur-duration, 300ms\) ease-out;/.test(blurRule) && !/filter[^;]*--anim-ease/.test(blurRule));

// ② 变量只准由 JS 写：样式表里不许出现赋值（注释除外）
ok('★ styles.css 里没有任何 --anim-ease 的赋值（一旦写死，「弹性」档就废了）',
  cssPlain.indexOf('--anim-ease:') < 0);

// ---------- ② renderer.js：弹性档必须 removeProperty ----------
console.log('--- renderer.js ---');
ok('renderer.js 映射了四档节奏 → CSS 关键字',
  /ANIM_EASE_CSS=\{"linear":"linear","ease-in":"ease-in","ease-out":"ease-out","ease-in-out":"ease-in-out"\}/.test(renderer));
ok('★ 非弹性档用 setProperty 写变量', /node\.style\.setProperty\("--anim-ease",c\)/.test(renderer));
ok('★ 弹性档用 removeProperty（不是写空串）', /node\.style\.removeProperty\("--anim-ease"\)/.test(renderer));
ok('★ 没有任何地方把 --anim-ease 写成空串（写空串 = 整条 transition 失效 = 数字跳变）',
  !/setProperty\(\s*["']--anim-ease["']\s*,\s*["']["']/.test(rendererPlain));
ok('配置变化时会重新应用（acf 里调用）', /applyAnimEase\(cl,cfg\.animEase\)/.test(renderer));

// ---------- ③ 主进程配置 ----------
console.log('--- main.js / settings.js ---');
ok('DEFAULT_CONFIG 里有 animEase 且默认 default', /animEase: 'default',/.test(main));
ok('ANIM_EASES 是这五档',
  /const ANIM_EASES = \['default', 'linear', 'ease-in', 'ease-out', 'ease-in-out'\];/.test(main));
ok('主进程会归一化非法 animEase（老配置 / 手改配置都兜住）',
  /ANIM_EASES\.indexOf\(cfg\.animEase\) < 0\) cfg\.animEase = 'default'/.test(main));
ok('设置窗口同样归一化', /ANIM_EASES\.indexOf\(c\.animEase\) < 0\) c\.animEase = 'default'/.test(settings));
ok('设置窗口有节奏下拉（radio/select 都在动画面板里）', /id="anim-ease"/.test(settingsHtml));
ok('节奏下拉在动画面板里（与动画效果同一个 panel）',
  /data-panel="animation"[\s\S]*?id="anim-ease"[\s\S]*?<\/section>/.test(settingsHtml));
ok('节奏选项 = 弹性/匀速/慢起/慢停/两头慢',
  ['default', 'linear', 'ease-in', 'ease-out', 'ease-in-out']
    .every(v => new RegExp('<option value="' + v + '"').test(settingsHtml)));
ok('「无动画」时节奏跟着置灰', /els\.anim_ease\.disabled = at === 'none'/.test(settings));

// ---------- ④ 手机端镜像 ----------
console.log('--- 手机端 lan-mirror-page.html / lan-mirror.js ---');
ok('快照白名单里带 animEase（否则手机端拿不到电脑端的节奏）',
  /animEase: \['default', 'linear', 'ease-in', 'ease-out', 'ease-in-out'\]/.test(lan));
ok('手机页主数字过渡读 --anim-ease', (page.match(/var\(--anim-ease, /g) || []).length >= 5,
  String((page.match(/var\(--anim-ease,/g) || []).length) + ' 处');
ok('手机页 3D 旋转仍保持 ease-in / ease-out',
  /\.anim-flip-3d \.digit-current\.animate-out \{[\s\S]*?ease-in/.test(page)
  && /\.anim-flip-3d \.digit-next\.animate-in \{[\s\S]*?ease-out/.test(page));
ok('★ 手机页里也没有任何 --anim-ease 的赋值',
  pagePlain.indexOf('--anim-ease:') < 0);
ok('手机端存在本机偏好键 dc.animEase', /var LS_ANIM_EASE = 'dc\.animEase';/.test(page));
ok('手机端节奏有「跟随电脑」档', /ANIM_EASE_ALL = \['auto', 'default', 'linear', 'ease-in', 'ease-out', 'ease-in-out'\]/.test(page));
ok('手机端有节奏 chips 容器', /id="ui-ease-chips"/.test(page));
ok('★ 弹性档在手机端同样是 removeProperty（不是写空串）',
  /node\.style\.removeProperty\('--anim-ease'\)/.test(pagePlain)
  && !/setProperty\(\s*'--anim-ease'\s*,\s*''/.test(pagePlain));
ok('时钟与全屏大字共用同一个「写变量」入口（applyAnimVars）',
  (page.match(/applyAnimVars\(/g) || []).length >= 4);
ok('「恢复默认」会清掉节奏键', /lsDel\(LS_ANIM_EASE\);/.test(page));

console.log('\nanim-ease 自测：pass=' + pass + ' fail=' + fail);
if (failures.length) { console.log('\n失败项：'); failures.forEach(f => console.log('  ✗ ' + f)); }
process.exit(fail ? 1 : 0);
