// renderer.js
const td=document.getElementById("time-display");
const ib=document.getElementById("info-bar");
const di=document.getElementById("date-inline");
const ti=document.getElementById("tz-inline");
const wi=document.getElementById("weekday-inline");
const ai=document.getElementById("alarm-inline");
const cl=document.getElementById("clock");
let cfg={},cts="",cds="",cws="",ed=[],ti2=null,rdt=null,df=null,wf=null,ltk="",ocl=null;
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

function gdf(l){try{return new Intl.DateTimeFormat(l==="zh"?"zh-CN":"en-US",{year:"numeric",month:"2-digit",day:"2-digit"});}catch(e){return new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit"});}}
function fmt(d){if(!df)return"";const p=df.formatToParts(d),m={};p.forEach(x=>m[x.type]=x.value);return cfg.language==="zh"?m.year+"年"+m.month+"月"+m.day+"日":["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m.month,10)-1]+" "+m.day+", "+m.year;}
function gc(){if(!cfg.autoColor)return null;const h=new Date().getHours(),isDay=h>=6&&h<18;var a=0,m=cfg.bgColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);if(m)a=parseFloat(m[4]);return isDay?{fg:"#000000",bg:"rgba(255,255,255,"+a+")"}:{fg:"#ffffff",bg:"rgba(0,0,0,"+a+")"};}
function gz(d,o){const u=d.getUTCHours(),m=d.getUTCMinutes();return String((u+o+24)%24).padStart(2,"0")+":"+String(m).padStart(2,"0");}
function gwf(l){try{return new Intl.DateTimeFormat(l==="zh"?"zh-CN":"en-US",{weekday:"long"});}catch(e){return new Intl.DateTimeFormat("zh-CN",{weekday:"long"});}}
function ri(now){if(cfg.showDate!==false){const s=fmt(now);if(s!==cds){di.textContent=s;cds=s;}di.style.display="";}else di.style.display="none";if(cfg.showWeekday!==false){const wd=wf.format(now);if(wd!==cws){wi.textContent=wd;cws=wd;}wi.style.display="";}else wi.style.display="none";const tz=(cfg.extraTimezones||[]).slice(0,2);if(tz.length){let k="";for(let j=0;j<tz.length;j++)k+=tz[j].label+","+tz[j].offset+","+gz(now,tz[j].offset)+"|";if(k!==ltk){ltk=k;ti.innerHTML="";for(let j=0;j<tz.length;j++){const e=document.createElement("span");e.style.marginLeft="8px";e.textContent=tz[j].label+" "+gz(now,tz[j].offset);ti.appendChild(e);}}ti.style.display="";}else ti.style.display="none";const hasDate=cfg.showDate!==false;const hasWeekday=cfg.showWeekday!==false;const hasTZ=tz.length>0;const hasAlarm=ai.style.display!=="none";ib.style.display=hasDate||hasWeekday||hasTZ||hasAlarm?"":"none";}
function gd(){const n=new Date();const hh=String(n.getHours()).padStart(2,"0");const mm=String(n.getMinutes()).padStart(2,"0");const ss=String(n.getSeconds()).padStart(2,"0");return cfg.showSeconds!==false?{d:(hh+mm+ss).split(""),cc:2}:{d:(hh+mm).split(""),cc:1};}
function bd(dg,cc){td.innerHTML="";let ci=0;for(let i=0;i<dg.length;i++){if(i>0&&i%2===0&&ci<cc){const e=document.createElement("span");e.className="colon";e.textContent=":";td.appendChild(e);ci++;}const g=document.createElement("span");g.className="digit-group";const c=document.createElement("span");c.className="digit-current";c.textContent=dg[i];g.appendChild(c);const n=document.createElement("span");n.className="digit-next";n.textContent=dg[i];g.appendChild(n);td.appendChild(g);}}
function rs(c,n){c.style.transition=n.style.transition="none";c.classList.remove("animate-out");n.classList.remove("animate-in");c.style.transform=c.style.opacity=n.style.transform=n.style.opacity="";void c.offsetHeight;c.style.transition=n.style.transition="";}
function uc(){const{d:nd,cc}=gd();const nts=nd.join("");ri(new Date());const cg=gc();if(cg&&!alarmRingingId){const ck=cg.fg+"|"+cg.bg;if(ck!==ocl){td.style.color=cg.fg;td.style.backgroundColor=cg.bg;ib.style.color=cg.fg;ib.style.backgroundColor=cg.bg;ocl=ck;}}if(!cts||cts.length!==nd.length){bd(nd,cc);ed=nd.slice();cts=nts;return;}const sd=cfg.staggerDelay||0,rtl=cfg.staggerDirection==="rtl";if(cfg.animType==="none"){const gs=td.querySelectorAll(".digit-group");for(let i=0;i<nd.length;i++){if(ed[i]===nd[i])continue;const ce=gs[i]?.querySelector(".digit-current");if(!ce)continue;ed[i]=nd[i];if(sd>0){const _ce=ce,_d=nd[i];setTimeout(()=>{_ce.textContent=_d;},sd*(rtl?nd.length-1-i:i));}else ce.textContent=nd[i];}cts=nts;return;}for(let i=0;i<nd.length;i++){if(ed[i]===nd[i])continue;const g=td.querySelectorAll(".digit-group")[i];if(!g)continue;const ce=g.querySelector(".digit-current"),ne=g.querySelector(".digit-next");if(!ce||!ne)continue;ed[i]=nd[i];if(sd>0){const _ce=ce,_ne=ne,_d=nd[i],_ad=(cfg.animDuration||350);setTimeout(()=>{rs(_ce,_ne);_ne.textContent=_d;_ce.classList.add("animate-out");_ne.classList.add("animate-in");setTimeout(()=>{_ce.textContent=_d;rs(_ce,_ne);},_ad+30);},sd*(rtl?nd.length-1-i:i));}else{rs(ce,ne);ne.textContent=nd[i];ce.classList.add("animate-out");ne.classList.add("animate-in");const _ce=ce,_ne=ne,_d=nd[i];setTimeout(()=>{_ce.textContent=_d;rs(_ce,_ne);},(cfg.animDuration||350)+30);}}cts=nts;}
function sc(){if(ti2)clearInterval(ti2);uc();ti2=setInterval(uc,1000);}function stc(){if(ti2){clearInterval(ti2);ti2=null;}}
function acf(){if(alarmRingingId)return;const cg=gc();const ec=cg?cg.fg:cfg.color;const bc=cg?cg.bg:(cfg.bgColor&&cfg.bgColor.startsWith("rgba")?cfg.bgColor:"transparent");const ad=(cfg.animDuration||350);td.style.color=ec;td.style.backgroundColor=bc;td.style.fontFamily=cfg.fontFamily;td.style.fontSize=(cfg.fontSize||200)+"px";const sz=Math.round((cfg.fontSize||200)*(cfg.infoScale||0.3));ib.style.fontFamily=cfg.fontFamily;ib.style.fontSize=sz+"px";ib.style.color=ec;ib.style.backgroundColor=bc;if(ai)ai.style.color="";alarmOriginalColor=ec;cl.style.setProperty("--anim-duration",ad+"ms");cl.style.setProperty("--blur-duration",(cfg.blurDuration||300)+"ms");cl.style.setProperty("--blur-strength",(cfg.blurStrength||15)+"px");cl.style.setProperty("--scale-factor",(cfg.scaleInFactor||0.3));cl.classList.toggle("date-above",cfg.datePosition==="above");cl.classList.toggle("blur-enabled",!!cfg.blurEnabled);cl.classList.toggle("scale-in",!!cfg.scaleInEnabled);const at=cfg.animType||"slide-up";["anim-none","anim-slide-up","anim-slide-down","anim-fade","anim-shrink","anim-expand","anim-flip-3d"].forEach(c=>cl.classList.toggle(c,"anim-"+at===c));}
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
  if (!state || state.type === 'none') {
    ai.style.display = "none";
    ai.textContent = "";
    ai.className = "";
    if (alarmInlineTimer) { clearInterval(alarmInlineTimer); alarmInlineTimer = null; }
    lastInlineType = "";
    return;
  }
  ai.style.display = "";
  const typeChanged = state.type !== lastInlineType;
  lastInlineType = state.type;

  if (state.type === 'ringing') {
    if (state.text2 && state.text) {
      // Alternating between alarm name and dismiss text
      if (typeChanged) {
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
    }
  } else if (state.type === 'retry') {
    if (state.text2 && state.text) {
      if (typeChanged) {
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
    }
  } else if (state.type === 'scheduled') {
    ai.textContent = state.text || '';
    ai.className = 'alarm-scheduled';
    if (alarmInlineTimer) { clearInterval(alarmInlineTimer); alarmInlineTimer = null; }
  }
  // Update info-bar visibility
  ri(new Date());
  // Resize
  requestAnimationFrame(() => requestAnimationFrame(fw));
}

// ====== Init ======
async function init(){try{cfg=await window.electronAPI.getConfig();}catch(e){cfg={};}if(!cfg.color)cfg.color="#ffffff";if(!cfg.bgColor)cfg.bgColor="rgba(0,0,0,0)";if(!cfg.fontFamily)cfg.fontFamily="Arial";if(!cfg.fontSize)cfg.fontSize=200;if(cfg.showSeconds===undefined)cfg.showSeconds=true;if(cfg.showDate===undefined)cfg.showDate=true;if(cfg.showWeekday===undefined)cfg.showWeekday=true;if(!cfg.datePosition)cfg.datePosition="below";if(!cfg.language)cfg.language="zh";if(cfg.autoColor===undefined)cfg.autoColor=false;if(!cfg.animType)cfg.animType="slide-up";if(cfg.animType==="scale")cfg.animType="shrink";if(cfg.staggerDelay===undefined)cfg.staggerDelay=0;if(!cfg.staggerDirection)cfg.staggerDirection="ltr";if(!cfg.extraTimezones)cfg.extraTimezones=[];df=gdf(cfg.language);wf=gwf(cfg.language);acf();if(cfg.passthrough)sp(true);sc();function ft(){requestAnimationFrame(()=>requestAnimationFrame(fw));}ft();setTimeout(ft,300);

// Listen for alarm state updates (inline display)
window.electronAPI.onAlarmStateUpdate(state => {
  updateAlarmInline(state);
});

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

window.electronAPI.onConfigUpdated(nc=>{const lc=nc.language&&nc.language!==cfg.language;Object.assign(cfg,nc);if(cfg.animType==="scale")cfg.animType="shrink";if(lc){df=gdf(cfg.language);wf=gwf(cfg.language);cds="";cws="";}if(nc.passthrough!==undefined)sp(!!nc.passthrough);acf();cds="";ltk="";if(nc.showSeconds!==undefined||lc||nc.extraTimezones!==undefined)cts="";uc();if(nc.fontSize!==undefined||nc.showSeconds!==undefined||nc.fontFamily!==undefined||nc.showDate!==undefined||nc.showWeekday!==undefined||nc.datePosition!==undefined||lc||nc.autoColor!==undefined||nc.color!==undefined||nc.bgColor!==undefined||nc.extraTimezones!==undefined||nc.language!==undefined){if(rdt)clearTimeout(rdt);rdt=setTimeout(()=>{rdt=null;requestAnimationFrame(()=>requestAnimationFrame(fw));},300);}});window.addEventListener("beforeunload",()=>{stc();stopAlarmSound();stopAlarmFlash();if(alarmInlineTimer)clearInterval(alarmInlineTimer);if(rdt)clearTimeout(rdt);});}init();
