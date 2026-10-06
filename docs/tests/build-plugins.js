/* build-plugins.js — [v1.0.5.7] 把 examples/ 下所有插件打成 .dcplugin（含回读校验）
 *
 * 跑法：node docs/tests/build-plugins.js
 * 说明：条目名一律用正斜杠相对路径、无外层目录（宿主 zip 逐条校验会拒掉 .. 与盘符）；
 *       打完立刻回读，逐条比对字节数与内容，防止 adm-zip 写出损坏包。
 */
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', '..');
const EX = path.join(APP, 'examples');
const OUT = path.join(APP, 'docs', 'plugins');
fs.mkdirSync(OUT, { recursive: true });

const OPTIONAL = ['style.css', 'settings.html', 'README.md'];
let ok = true, made = 0;

for (const name of fs.readdirSync(EX).sort()) {
  const dir = path.join(EX, name);
  if (!fs.statSync(dir).isDirectory()) continue;
  const mf = path.join(dir, 'plugin.json');
  if (!fs.existsSync(mf)) continue;
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));

  const files = ['plugin.json', m.main || 'index.js'];
  if (m.style) files.push(m.style);
  if (m.settingsView) files.push(m.settingsView);
  for (const f of OPTIONAL) if (fs.existsSync(path.join(dir, f)) && files.indexOf(f) < 0) files.push(f);

  const zip = new AdmZip();
  for (const f of files) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) { console.log('✗ ' + name + ' 缺文件: ' + f); ok = false; continue; }
    zip.addFile(f, fs.readFileSync(p));
  }
  const outFile = path.join(OUT, name + '-' + m.version + '.dcplugin');
  fs.writeFileSync(outFile, zip.toBuffer());

  // 回读校验
  const back = new AdmZip(outFile);
  const names = back.getEntries().map(e => e.entryName).sort();
  const want = files.slice().sort();
  let good = names.join(',') === want.join(',');
  for (const f of files) {
    if (Buffer.compare(back.readFile(f), fs.readFileSync(path.join(dir, f))) !== 0) good = false;
  }
  if (!back.getEntry('plugin.json')) good = false;
  const bad = names.some(n => n.includes('\\') || n.includes('..') || /^[A-Za-z]:/.test(n));
  if (bad) good = false;

  if (!good) ok = false;
  made++;
  console.log((good ? '✓ ' : '✗ ') + name + ' → ' + path.basename(outFile) +
    ' (' + fs.statSync(outFile).size + ' bytes, ' + names.length + ' 条目, apiVersion=' + m.apiVersion + ')');
}

console.log('共 ' + made + ' 个插件，' + (ok ? '全部通过校验' : '有失败'));
process.exit(ok ? 0 : 1);
