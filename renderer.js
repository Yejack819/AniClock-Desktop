// renderer.js
const td=document.getElementById("time-display");
const ib=document.getElementById("info-bar");
const di=document.getElementById("date-inline");
const ti=document.getElementById("tz-inline");
const wi=document.getElementById("weekday-inline");
const ai=document.getElementById("alarm-inline");
const ci=document.getElementById("countdown-inline");
const cl=document.getElementById("clock");
let cfg={},cts="",cds="",cws="",ed=[],ti2=null,rdt=null,df=null,wf=null,ltk="",ocl=null;
// [v1.0.5.7] 倒计时状态：主进程**只在列表变更时**推（不每秒推），剩余时间在这里本地倒扣。
// 因为 nextTrigger/endAt 是真实系统时刻，手动校准偏移（cnow）不该影响它 —— 一律用 Date.now()。
let cdState={items:[],showInInfoBar:true,ringingId:null};
// Alarm state
let alarmRingingId=null;
let alarmFlashTimer=null;
let alarmOriginalColor="";
let alarmWasAutoColor=false;
let alarmAudioCtx=null;
let alarmOscillators=[];
let alarmInlineTimer=null; // 3-second alternating timer
let alarmInlineUseText1=true;
let lastInlineType="";
let lastInlineState=""; // [v1.0.5.7] 去重：主进程每秒广播一次状态，内容没变就不动 DOM/重排窗口
let lastInlinePair="";  // [v1.0.5.7] 交替文案对：文案变了要重启交替定时器（旧闭包会一直显示过期文案）
// [v1.0.5.7] 每位数字的待执行动画定时器。错峰延迟大 / 动画时长长时，上一次变化还没落定
// 下一次就来了：旧定时器会中途把数字写回旧值（短暂回显）或与新一轮动画互相打架 —— 每位
// 在排新定时器前必须先撤掉自己上一次的。
let digitPending=[];
function clearDigitPending(i){const p=digitPending[i];if(p){if(p.o)clearTimeout(p.o);if(p.n)clearTimeout(p.n);digitPending[i]=null;}}

function gdf(l){try{return new Intl.DateTimeFormat(l==="zh"?"zh-CN":"en-US",{year:"numeric",month:"2-digit",day:"2-digit"});}catch(e){return new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit"});}}
function fmt(d){if(!df)return"";const p=df.formatToParts(d),m={};p.forEach(x=>m[x.type]=x.value);return cfg.language==="zh"?m.year+"年"+m.month+"月"+m.day+"日":["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m.month,10)-1]+" "+m.day+", "+m.year;}
// [v1.0.5.4] ====== 时间校准 ======
// 手动校准（cfg.timeOffsetMs：正=显示比系统快）+ 定时自动校准的累积量；所有"当前时间"都走 cnow()
function manualOffsetMs(){const v=Number(cfg.timeOffsetMs);return Number.isFinite(v)?v:0;}
const AUTO_MIN_INTERVAL_SEC=5,AUTO_MAX_ABS_MS=3600000; // 最小间隔 5s；累积量上限 ±1 小时，避免异常配置把时间拉离谱
function numOr(v,d){const n=Number(v);return Number.isFinite(n)?n:d;}
function clampAuto(v){return Math.max(-AUTO_MAX_ABS_MS,Math.min(AUTO_MAX_ABS_MS,v));}
// 阶梯累积 = base + floor(已过间隔数) * 每次量；确定性计算，重启/关窗都不丢，时钟回拨或未锚定按 0 步处理
function autoDeltaMs(nowMs){
  if(!cfg.autoAdjustEnabled)return 0;
  const interval=Math.max(AUTO_MIN_INTERVAL_SEC,numOr(cfg.autoAdjustIntervalSec,AUTO_MIN_INTERVAL_SEC))*1000;
  const amount=numOr(cfg.autoAdjustAmountMs,0);
  const base=numOr(cfg.autoAdjustBaseMs,0);
  if(!amount)return clampAuto(base);
  const anchor=numOr(cfg.autoAdjustAnchor,0)||nowMs;
  const steps=Math.floor(Math.max(0,nowMs-anchor)/interval);
  return clampAuto(base+steps*amount);
}
function cnow(){const t=Date.now();return new Date(t+manualOffsetMs()+autoDeltaMs(t));}
// 当前总偏移（手动 + 自动累积），供秒边界对齐使用
function calMs(){const t=Date.now();return manualOffsetMs()+autoDeltaMs(t);}
function gc(){if(!cfg.autoColor)return null;const h=cnow().getHours(),isDay=h>=6&&h<18;var a=0,m=cfg.bgColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);if(m)a=parseFloat(m[4]);return isDay?{fg:"#000000",bg:"rgba(255,255,255,"+a+")"}:{fg:"#ffffff",bg:"rgba(0,0,0,"+a+")"};}
// [v1.0.5.3] ====== 12 小时制 / AM·PM 角标 ======
// 数据层永远是 24 小时，这里只做显示换算；12h 保留两位（07 而非 7）以维持数字位数恒定
let ampmEl=null,lastAmpmText="";
function use12h(){const f=cfg.hourFormat||"24";if(f==="12")return true;if(f==="24")return false;try{const o=new Intl.DateTimeFormat(undefined,{hour:"numeric"}).resolvedOptions();if(o.hourCycle)return o.hourCycle==="h11"||o.hourCycle==="h12";}catch(e){}return false;}
function ampmLabel(h24){const pm=h24>=12;return cfg.language==="zh"?(pm?"下午":"上午"):(pm?"PM":"AM");}
function ensureAmpmEl(){if(ampmEl&&ampmEl.isConnected)return ampmEl;ampmEl=document.createElement("span");ampmEl.id="ampm-inline";td.appendChild(ampmEl);return ampmEl;}
// 把角标钉在时间显示区四角之一；同时把它的实际尺寸换算成 td 的内边距，
// 这样角标永远压在留白里，既不会盖住数字，也不会被窗口边界裁掉（fw() 量的是 td 尺寸）
function applyAmpm(text){
  const el=ensureAmpmEl();
  const corner=cfg.ampmCorner||"top-right";
  el.style.fontFamily=cfg.fontFamily;
  // 0.24 倍主字号（下限 11px）：随「字号」滑块一起放大，又不会喧宾夺主
  el.style.fontSize=Math.max(11,Math.round((cfg.fontSize||200)*0.24))+"px";
  td.style.paddingTop=td.style.paddingBottom=td.style.paddingLeft=td.style.paddingRight="";
  if(!text){el.textContent="";el.className="ampm-inline hidden";return;}
  el.textContent=text;
  el.className="ampm-inline "+corner;
  const w=el.offsetWidth,h=el.offsetHeight;
  const isTop=corner.indexOf("top")===0,isLeft=corner.indexOf("left")>0,gap=6;
  td.style.paddingTop=(10+(isTop?h+gap:0))+"px";
  td.style.paddingBottom=(10+(isTop?0:h+gap))+"px";
  td.style.paddingLeft=(20+(isLeft?w+gap:0))+"px";
  td.style.paddingRight=(20+(isLeft?0:w+gap))+"px";
}
function syncAmpmNow(){const t=use12h()?ampmLabel(cnow().getHours()):"";lastAmpmText=t;applyAmpm(t);}
function gz(d,o){const u=d.getUTCHours(),m=d.getUTCMinutes();const h24=(u+o+24)%24;const mm=String(m).padStart(2,"0");if(!use12h())return String(h24).padStart(2,"0")+":"+mm;return String(h24%12||12).padStart(2,"0")+":"+mm+" "+ampmLabel(h24);}
function gwf(l){try{return new Intl.DateTimeFormat(l==="zh"?"zh-CN":"en-US",{weekday:"long"});}catch(e){return new Intl.DateTimeFormat("zh-CN",{weekday:"long"});}}
function ri(now){if(cfg.showDate!==false){const s=fmt(now);if(s!==cds){di.textContent=s;cds=s;}di.style.display="";}else di.style.display="none";if(cfg.showWeekday!==false){const wd=wf.format(now);if(wd!==cws){wi.textContent=wd;cws=wd;}wi.style.display="";}else wi.style.display="none";const tz=(cfg.extraTimezones||[]).slice(0,2);if(tz.length){let k="";for(let j=0;j<tz.length;j++)k+=tz[j].label+","+tz[j].offset+","+gz(now,tz[j].offset)+"|";if(k!==ltk){ltk=k;ti.innerHTML="";for(let j=0;j<tz.length;j++){const e=document.createElement("span");e.style.marginLeft="8px";e.textContent=tz[j].label+" "+gz(now,tz[j].offset);ti.appendChild(e);}}ti.style.display="";}else ti.style.display="none";renderCountdownChip();const hasDate=cfg.showDate!==false;const hasWeekday=cfg.showWeekday!==false;const hasTZ=tz.length>0;const hasAlarm=ai.style.display!=="none";const hasCd=!!ci&&ci.style.display!=="none";const hasPlugin=!!ib.querySelector(".plugin-info-slot");ib.style.display=hasDate||hasWeekday||hasTZ||hasAlarm||hasCd||hasPlugin?"":"none";}
function gd(){const n=cnow();const h24=n.getHours();const hh=String(use12h()?(h24%12||12):h24).padStart(2,"0");const mm=String(n.getMinutes()).padStart(2,"0");const ss=String(n.getSeconds()).padStart(2,"0");return cfg.showSeconds!==false?{d:(hh+mm+ss).split(""),cc:2}:{d:(hh+mm).split(""),cc:1};}
function bd(dg,cc){td.innerHTML="";ampmEl=null;digitPending=[];let ci=0;for(let i=0;i<dg.length;i++){if(i>0&&i%2===0&&ci<cc){const e=document.createElement("span");e.className="colon";e.textContent=":";td.appendChild(e);ci++;}const g=document.createElement("span");g.className="digit-group";const c=document.createElement("span");c.className="digit-current";c.textContent=dg[i];g.appendChild(c);const n=document.createElement("span");n.className="digit-next";n.textContent=dg[i];g.appendChild(n);td.appendChild(g);}syncAmpmNow();}
function rs(c,n){c.style.transition=n.style.transition="none";c.classList.remove("animate-out");n.classList.remove("animate-in");c.style.transform=c.style.opacity=n.style.transform=n.style.opacity="";void c.offsetHeight;c.style.transition=n.style.transition="";}
function uc(){const{d:nd,cc}=gd();const nts=nd.join("");const amp=use12h()?ampmLabel(cnow().getHours()):"";if(amp!==lastAmpmText){lastAmpmText=amp;applyAmpm(amp);requestAnimationFrame(()=>requestAnimationFrame(fw));}ri(cnow());const cg=gc();if(cg&&!alarmRingingId){const ck=cg.fg+"|"+cg.bg;if(ck!==ocl){td.style.color=cg.fg;td.style.backgroundColor=cg.bg;ib.style.color=cg.fg;ib.style.backgroundColor=cg.bg;ocl=ck;}}if(!cts||cts.length!==nd.length){bd(nd,cc);ed=nd.slice();cts=nts;return;}const sd=cfg.staggerDelay||0,rtl=cfg.staggerDirection==="rtl";if(cfg.animType==="none"){const gs=td.querySelectorAll(".digit-group");for(let i=0;i<nd.length;i++){if(ed[i]===nd[i])continue;const ce=gs[i]?.querySelector(".digit-current");if(!ce)continue;ed[i]=nd[i];clearDigitPending(i);if(sd>0){const _ce=ce,_d=nd[i],_slot=i;const t=setTimeout(()=>{_ce.textContent=_d;},sd*(rtl?nd.length-1-i:i));digitPending[_slot]={o:t,n:null};}else ce.textContent=nd[i];}cts=nts;return;}for(let i=0;i<nd.length;i++){if(ed[i]===nd[i])continue;const g=td.querySelectorAll(".digit-group")[i];if(!g)continue;const ce=g.querySelector(".digit-current"),ne=g.querySelector(".digit-next");if(!ce||!ne)continue;ed[i]=nd[i];clearDigitPending(i);if(sd>0){const _ce=ce,_ne=ne,_d=nd[i],_ad=(cfg.animDuration||350),_slot=i;const outer=setTimeout(()=>{rs(_ce,_ne);_ne.textContent=_d;_ce.classList.add("animate-out");_ne.classList.add("animate-in");const inner=setTimeout(()=>{_ce.textContent=_d;rs(_ce,_ne);},_ad+30);if(digitPending[_slot])digitPending[_slot].n=inner;},sd*(rtl?nd.length-1-i:i));digitPending[_slot]={o:outer,n:null};}else{rs(ce,ne);ne.textContent=nd[i];ce.classList.add("animate-out");ne.classList.add("animate-in");const _ce=ce,_ne=ne,_d=nd[i],_slot=i;const t=setTimeout(()=>{_ce.textContent=_d;rs(_ce,_ne);},(cfg.animDuration||350)+30);digitPending[_slot]={o:t,n:null};}}cts=nts;}
// [v1.0.5.4] 对齐秒边界的自调度 tick：每次按当前时间重算延迟，让 ms 级校准真正生效且抗漂移
function scheduleTick(){if(ti2)clearTimeout(ti2);ti2=setTimeout(()=>{ti2=null;uc();scheduleTick();},1000-((Date.now()+calMs())%1000)+1);}
function sc(){if(ti2){clearTimeout(ti2);ti2=null;}uc();scheduleTick();}function stc(){if(ti2){clearTimeout(ti2);ti2=null;}}
function acf(){if(alarmRingingId)return;const cg=gc();const ec=cg?cg.fg:cfg.color;const bc=cg?cg.bg:(cfg.bgColor&&cfg.bgColor.startsWith("rgba")?cfg.bgColor:"transparent");const ad=(cfg.animDuration||350);td.style.color=ec;td.style.backgroundColor=bc;td.style.fontFamily=cfg.fontFamily;td.style.fontSize=(cfg.fontSize||200)+"px";const sz=Math.round((cfg.fontSize||200)*(cfg.infoScale||0.3));ib.style.fontFamily=cfg.fontFamily;ib.style.fontSize=sz+"px";ib.style.color=ec;ib.style.backgroundColor=bc;if(ai)ai.style.color="";alarmOriginalColor=ec;cl.style.setProperty("--anim-duration",ad+"ms");cl.style.setProperty("--blur-duration",(cfg.blurDuration||300)+"ms");cl.style.setProperty("--blur-strength",(cfg.blurStrength||15)+"px");cl.style.setProperty("--scale-factor",(cfg.scaleInFactor||0.3));cl.classList.toggle("date-above",cfg.datePosition==="above");const AT=(["flip","scale","fade","flip-3d","none"].indexOf(cfg.animType)>=0)?cfg.animType:"flip";const canExtras=AT==="flip";cl.classList.toggle("blur-enabled",!!(cfg.blurEnabled&&canExtras));cl.classList.toggle("scale-in",!!(cfg.scaleInEnabled&&canExtras));["anim-none","anim-flip","anim-scale","anim-fade","anim-flip-3d"].forEach(c=>cl.classList.toggle(c,"anim-"+AT===c));const DIR=AT==="flip"?(cfg.animFlipDir==="down"?"down":"up"):(AT==="scale"?(cfg.animScaleDir==="grow"?"grow":"shrink"):"");["dir-up","dir-down","dir-shrink","dir-grow"].forEach(c=>cl.classList.toggle(c,!!DIR&&c==="dir-"+DIR));syncAmpmNow();}
function sp(v){window.electronAPI.setPassthrough(!!v);}
function fw(){const r=td.getBoundingClientRect();const b=ib.getBoundingClientRect();let w=r.width,h=r.height;if(b.width>w)w=b.width;if(ib.style.display!=="none"&&b.height>0)h+=b.height+4;if(w>0&&h>0)window.electronAPI.resizeWindow({width:w,height:h});}

// ====== Alarm Sound (Web Audio API) ======
function playAlarmSound(soundType) {
  stopAlarmSound();
  if (soundType === 'none') return;
  try {
    alarmAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = alarmAudioCtx;
    const now = ctx.currentTime;

    if (soundType === 'beep') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
      alarmOscillators.push(osc);
      // Loop
      alarmOscillators.push(setInterval(() => {
        if (!alarmRingingId) return;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.3, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.4);
      }, 800));
    } else if (soundType === 'chime') {
      [660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = now + i * 0.15;
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.4);
        alarmOscillators.push(osc);
      });
      // Loop
      alarmOscillators.push(setInterval(() => {
        if (!alarmRingingId) return;
        const t = ctx.currentTime;
        [660, 880].forEach((freq, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = freq;
          const st = t + i * 0.15;
          g.gain.setValueAtTime(0.25, st);
          g.gain.exponentialRampToValueAtTime(0.01, st + 0.35);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(st);
          o.stop(st + 0.35);
        });
      }, 1200));
    } else if (soundType === 'alarm') {
      // Aggressive alternating tones
      function playAlarmPulse() {
        if (!alarmRingingId) return;
        const t = ctx.currentTime;
        [0, 0.1].forEach(offset => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'square';
          o.frequency.value = 780 + offset * 200;
          g.gain.setValueAtTime(0.2, t + offset);
          g.gain.exponentialRampToValueAtTime(0.01, t + offset + 0.12);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t + offset);
          o.stop(t + offset + 0.12);
        });
      }
      playAlarmPulse();
      const interval = setInterval(() => {
        if (!alarmRingingId) { clearInterval(interval); return; }
        playAlarmPulse();
      }, 300);
      alarmOscillators.push(interval);
    }
  } catch(e) { console.error('Audio error:', e); }
}

function stopAlarmSound() {
  if (alarmAudioCtx) {
    try { alarmAudioCtx.close(); } catch(e) {}
    alarmAudioCtx = null;
  }
  alarmOscillators.forEach(o => {
    if (typeof o === 'number' || typeof o === 'object') {
      try { clearInterval(o); } catch(e) {}
    }
  });
  alarmOscillators = [];
}

// ====== Alarm Flash ======
function startAlarmFlash(autoColorWasOn) {
  alarmWasAutoColor = autoColorWasOn;
  if (alarmFlashTimer) clearInterval(alarmFlashTimer);

  // Determine flashing colors
  const origColor = alarmOriginalColor || cfg.color || '#000000';
  const isRed = origColor.toLowerCase() === '#ff0000' || origColor.toLowerCase() === 'red';
  const isDay = new Date().getHours() >= 6 && new Date().getHours() < 18;

  let colorA, colorB;
  if (alarmWasAutoColor) {
    // autoColor was on: red ↔ black (day) / white (night)
    colorA = '#ff0000';
    colorB = isDay ? '#000000' : '#ffffff';
  } else if (isRed) {
    colorA = '#ff0000';
    colorB = '#ffffff';
  } else {
    colorA = '#ff0000';
    colorB = origColor;
  }

  let useColorA = true;
  alarmFlashTimer = setInterval(() => {
    const c = useColorA ? colorA : colorB;
    td.style.color = c;
    ib.style.color = c;
    if (ai) ai.style.color = c;
    useColorA = !useColorA;
  }, 500);
}

function stopAlarmFlash() {
  if (alarmFlashTimer) { clearInterval(alarmFlashTimer); alarmFlashTimer = null; }
  // Clear flash inline colors so elements inherit from acf()
  td.style.color = "";
  ib.style.color = "";
  if (ai) ai.style.color = "";
  // Re-apply proper colors now that alarm is stopped
  if (typeof acf === "function") acf();
}

// ====== Alarm Dismiss ======
function dismissAlarm() {
  if (!alarmRingingId) return;
  const id = alarmRingingId;
  alarmRingingId = null;
  stopAlarmSound();
  stopAlarmFlash();
  if (alarmInlineTimer) { clearInterval(alarmInlineTimer); alarmInlineTimer = null; }
  if (ai) { ai.style.display = "none"; ai.textContent = ""; ai.className = ""; }
  cl.style.pointerEvents = "";
  cl.style.cursor = "";
  cl.style.removeProperty("-webkit-app-region");
  document.body.style.cursor = "";
  window.electronAPI.dismissAlarm(id);
}

// ====== Alarm Display Update ======
function updateAlarmInline(state) {
  if (!ai) return;
  // [v1.0.5.7] 相同状态直接跳过：原来每秒一次的广播都会走一遍 ri() + 双 rAF fw()
  // → 每秒一次 resize-window IPC，白白烧 CPU
  const sig = JSON.stringify(state);
  if (sig === lastInlineState) return;
  lastInlineState = sig;
  if (!state || state.type === 'none') {
    ai.style.display = "none";
    ai.textContent = "";
    ai.className = "";
    if (alarmInlineTimer) { clearInterval(alarmInlineTimer); alarmInlineTimer = null; }
    lastInlineType = "";
    lastInlinePair = "";
    return;
  }
  ai.style.display = "";
  const typeChanged = state.type !== lastInlineType;
  lastInlineType = state.type;
  const pair = String(state.text || '') + '|' + String(state.text2 || '');

  if (state.type === 'ringing') {
    if (state.text2 && state.text) {
      // Alternating between alarm name and dismiss text
      // [v1.0.5.7] 文案本身变了（比如换了一个正在响的闹钟）也要重启定时器，
      // 否则旧闭包永远显示上一条文案
      if (typeChanged || pair !== lastInlinePair) {
        lastInlinePair = pair;
        if (alarmInlineTimer) clearInterval(alarmInlineTimer);
        alarmInlineUseText1 = true;
        ai.textContent = state.text; // start with alarm name
        ai.className = 'alarm-ringing';
        alarmInlineTimer = setInterval(() => {
          alarmInlineUseText1 = !alarmInlineUseText1;
          ai.textContent = alarmInlineUseText1 ? state.text : state.text2;
        }, 3000);
      }
      // else: timer already running, don't reset
    } else {
      ai.textContent = state.text2 || state.text || (cfg.language === 'zh' ? '单击关闭闹钟' : 'Click to dismiss');
      ai.className = 'alarm-ringing';
      lastInlinePair = pair;
    }
  } else if (state.type === 'retry') {
    if (state.text2 && state.text) {
      if (typeChanged || pair !== lastInlinePair) {
        lastInlinePair = pair;
        if (alarmInlineTimer) clearInterval(alarmInlineTimer);
        alarmInlineUseText1 = true;
        ai.textContent = state.text;
        ai.className = 'alarm-retry';
        alarmInlineTimer = setInterval(() => {
          alarmInlineUseText1 = !alarmInlineUseText1;
          ai.textContent = alarmInlineUseText1 ? state.text : state.text2;
        }, 3000);
      }
    } else {
      ai.textContent = state.text || '';
      ai.className = 'alarm-retry';
      lastInlinePair = pair;
    }
  } else if (state.type === 'scheduled') {
    ai.textContent = state.text || '';
    ai.className = 'alarm-scheduled';
    if (alarmInlineTimer) { clearInterval(alarmInlineTimer); alarmInlineTimer = null; }
    lastInlinePair = "";
  }
  // Update info-bar visibility
  ri(cnow());
  // Resize
  requestAnimationFrame(() => requestAnimationFrame(fw));
}

// ====== Init ======
async function init(){try{cfg=await window.electronAPI.getConfig();}catch(e){cfg={};}if(!cfg.color)cfg.color="#ffffff";if(!cfg.bgColor)cfg.bgColor="rgba(0,0,0,0)";if(!cfg.fontFamily)cfg.fontFamily="Arial";if(!cfg.fontSize)cfg.fontSize=200;if(cfg.showSeconds===undefined)cfg.showSeconds=true;if(cfg.showDate===undefined)cfg.showDate=true;if(cfg.showWeekday===undefined)cfg.showWeekday=true;if(!cfg.datePosition)cfg.datePosition="below";if(!cfg.language)cfg.language="zh";if(cfg.autoColor===undefined)cfg.autoColor=false;if(!cfg.animType)cfg.animType="flip";if(["flip","scale","fade","flip-3d","none"].indexOf(cfg.animType)<0)cfg.animType="flip";if(cfg.staggerDelay===undefined)cfg.staggerDelay=0;if(!cfg.staggerDirection)cfg.staggerDirection="ltr";if(!cfg.extraTimezones)cfg.extraTimezones=[];df=gdf(cfg.language);wf=gwf(cfg.language);acf();if(cfg.passthrough)sp(true);sc();function ft(){requestAnimationFrame(()=>requestAnimationFrame(fw));}ft();setTimeout(ft,300);

// Listen for alarm state updates (inline display)
window.electronAPI.onAlarmStateUpdate(state => {
  updateAlarmInline(state);
});

// [v1.0.5.7] 倒计时状态：主进程只在列表变更时推；这里只存下来，
// 具体 chip 文案在每秒的 ri() 里按 Date.now() 本地倒扣算出来。
window.electronAPI.onCountdownState(state => {
  cdState = state || { items: [], showInInfoBar: true, ringingId: null };
  requestAnimationFrame(() => requestAnimationFrame(fw));
});
window.electronAPI.countdownList().then(s => {
  cdState = { items: (s && s.items) || [], showInInfoBar: cfg.countdownShowInInfoBar !== false, ringingId: null };
  ri(cnow());
  requestAnimationFrame(() => requestAnimationFrame(fw));
}).catch(() => {});

// Listen for alarm ringing
window.electronAPI.onAlarmRinging(data => {
  alarmRingingId = data.id;
  // Play sound
  playAlarmSound(data.sound);
  // Start flash (if enabled)
  if (data.alarmFlash !== false) {
    startAlarmFlash(!!data.autoColorWasOn);
  }
  // Enable click to dismiss on clock window
  cl.style.pointerEvents = "auto";
  cl.style.cursor = "pointer";
  cl.style.setProperty("-webkit-app-region", "no-drag");
  // Also add click handler on document body for redundancy
  document.body.style.cursor = "pointer";
});

// Listen for alarm stop
window.electronAPI.onAlarmStop(data => {
  if (alarmRingingId === data.id || !data.id) {
    alarmRingingId = null;
    stopAlarmSound();
    stopAlarmFlash();
    if (alarmInlineTimer) { clearInterval(alarmInlineTimer); alarmInlineTimer = null; }
    if (ai) { ai.style.display = "none"; ai.textContent = ""; ai.className = ""; }
    cl.style.pointerEvents = "";
    cl.style.cursor = "";
    cl.style.removeProperty("-webkit-app-region");
    document.body.style.cursor = "";
  }
});

// Click to dismiss alarm
cl.addEventListener('click', () => {
  if (alarmRingingId) {
    dismissAlarm();
  }
});

window.electronAPI.onConfigUpdated(nc=>{const lc=nc.language&&nc.language!==cfg.language;Object.assign(cfg,nc);if(lc){df=gdf(cfg.language);wf=gwf(cfg.language);cds="";cws="";}
// [v1.0.5.7] 响铃期间不恢复鼠标穿透：响铃入口刚把穿透关掉以便「单击关闭闹钟」，
// 此时设置窗口的任何一次保存都会整份下发 config，把穿透原样打开、点击失效
if(nc.passthrough!==undefined&&!alarmRingingId)sp(!!nc.passthrough);acf();cds="";ltk="";if(nc.showSeconds!==undefined||lc||nc.extraTimezones!==undefined)cts="";if(['timeOffsetMs','autoAdjustEnabled','autoAdjustIntervalSec','autoAdjustAmountMs','autoAdjustBaseMs','autoAdjustAnchor'].some(k=>nc[k]!==undefined))sc();uc();if(nc.fontSize!==undefined||nc.showSeconds!==undefined||nc.fontFamily!==undefined||nc.showDate!==undefined||nc.showWeekday!==undefined||nc.datePosition!==undefined||lc||nc.autoColor!==undefined||nc.color!==undefined||nc.bgColor!==undefined||nc.extraTimezones!==undefined||nc.language!==undefined){if(rdt)clearTimeout(rdt);rdt=setTimeout(()=>{rdt=null;requestAnimationFrame(()=>requestAnimationFrame(fw));},300);}});window.addEventListener("beforeunload",()=>{stc();stopAlarmSound();stopAlarmFlash();if(alarmInlineTimer)clearInterval(alarmInlineTimer);if(rdt)clearTimeout(rdt);});}init();

// [v1.0.5.5] 插件改动（挂载/改文案）后：刷新信息栏可见性并按新宽度自适应窗口
window.addEventListener('dc-plugins-updated', () => {
  try { ri(cnow()); } catch (e) {}
  requestAnimationFrame(() => requestAnimationFrame(fw));
});

// [v1.0.6] 关灯联动：时钟窗口获得焦点时按 ESC 也能退出关灯模式
(function () {
  let lightsOffActive = false;
  let lightsOffLocked = false; // [v1.0.6] 锁定后时钟窗口的 ESC 也不能退出关灯
  window.electronAPI.getConfig().then(cfg => { lightsOffActive = !!(cfg && cfg.lightsOff); }).catch(() => {});
  window.electronAPI.onLightsOffStateChanged && window.electronAPI.onLightsOffStateChanged(enabled => {
    lightsOffActive = !!enabled;
  });
  window.electronAPI.onLightsOffLockChanged && window.electronAPI.onLightsOffLockChanged(locked => {
    lightsOffLocked = !!locked;
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && lightsOffActive && !lightsOffLocked && window.electronAPI.setLightsOff) {
      event.preventDefault();
      window.electronAPI.setLightsOff(false);
    }
  });
})();

// ====== [v1.0.5.7] 倒计时内联显示（信息栏 chip）======
// 只显示「最近到期的那一个」；还有别的（含暂停的）时右侧带 +N。
// 时间一律用 Date.now() 算：nextTrigger/endAt 是真实系统时刻，手动校准（timeOffsetMs）
// 只该影响时钟显示，不该影响倒计时 —— 否则「校准过 3 分钟」的机器上倒计时会提前/延后 3 分钟。
function cdRemain(item, nowMs) {
  if (!item) return 0;
  if (item.state === "paused") return Math.max(0, Number(item.remainingMs) || 0);
  const t = item.endAt ? new Date(item.endAt).getTime() : NaN;
  if (!isFinite(t)) return Math.max(0, Number(item.remainingMs) || 0);
  return Math.max(0, t - nowMs);
}
// 与 countdown.js 的 formatClock 同口径：向上取整到秒 + 补零保持等宽
function cdFmt(ms) {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = n => (n < 10 ? "0" : "") + n;
  return h > 0 ? p(h) + ":" + p(m) + ":" + p(ss) : p(m) + ":" + p(ss);
}
function cdTextHide() {
  if (!ci) return;
  if (ci.textContent !== "") ci.textContent = "";
  if (ci.style.display !== "none") ci.style.display = "none";
  if (ci.className !== "") ci.className = "";
}
function renderCountdownChip() {
  if (!ci) return;
  // 开关的单一事实来源是配置（设置界面能立刻改到；cdState 只是数据通道）
  if (cfg.countdownShowInInfoBar === false) { cdTextHide(); return; }
  const items = (cdState && Array.isArray(cdState.items)) ? cdState.items : [];
  if (!items.length) { cdTextHide(); return; }
  // 正在响的那一刻交给 alarm-inline（名称 ↔ 单击关闭），chip 让位
  if (cdState.ringingId && items.some(x => x && x.id === cdState.ringingId)) { cdTextHide(); return; }
  const nowMs = Date.now();
  let runItem = null, runLeft = Infinity, pauseItem = null, pauseLeft = Infinity;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it) continue;
    const left = cdRemain(it, nowMs);
    if (it.state === "paused") { if (left < pauseLeft) { pauseLeft = left; pauseItem = it; } }
    else if (left < runLeft) { runLeft = left; runItem = it; }
  }
  const chosen = runItem || pauseItem;
  if (!chosen) { cdTextHide(); return; }
  const paused = !runItem;
  const extra = items.length - 1;
  const text = (paused ? "⏸ " : "⏳ ") + cdFmt(paused ? pauseLeft : runLeft) + (extra > 0 ? " +" + extra : "");
  if (ci.textContent !== text) ci.textContent = text;
  const cls = "countdown-chip" + (paused ? " paused" : "");
  if (ci.className !== cls) ci.className = cls;
  if (ci.style.display !== "") ci.style.display = "";
}
