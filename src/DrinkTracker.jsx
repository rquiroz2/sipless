import { useState, useEffect, useCallback, useMemo } from "react";

const DRINK_TYPES = [
  { id: "beer", label: "Beer", icon: "🍺", std: 1 },
  { id: "wine", label: "Wine", icon: "🍷", std: 1.5 },
  { id: "cocktail", label: "Cocktail", icon: "🍸", std: 1.5 },
  { id: "shot", label: "Shot", icon: "🥃", std: 1 },
  { id: "seltzer", label: "Seltzer", icon: "🥤", std: 1 },
  { id: "champagne", label: "Champagne", icon: "🥂", std: 1.5 },
];

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function getWeekNumber(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d - start + (start.getTimezoneOffset() - d.getTimezoneOffset()) * 60000;
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}
function formatDate(d) { return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }

/* ── Color Palettes ─────────────────────────────── */
const LIGHT = {
  bg:        "#fef6f3",
  bgSoft:    "#fdf0ec",
  card:      "rgba(255,255,255,0.75)",
  cardBorder:"rgba(219,160,160,0.18)",
  text:      "#4a3637",
  textSoft:  "#8c6b6d",
  textMuted: "#c4a3a5",
  accent:    "#d4728c",
  accentSoft:"rgba(212,114,140,0.12)",
  accentBorder:"rgba(212,114,140,0.25)",
  good:      "#7cb8a0",
  goodSoft:  "rgba(124,184,160,0.15)",
  warn:      "#e8a85c",
  warnSoft:  "rgba(232,168,92,0.15)",
  bad:       "#d95f5f",
  badSoft:   "rgba(217,95,95,0.15)",
  highlight: "#e8a0b4",
  heat0:     "#6bbf8a",
  heat1:     "#c8e06a",
  heat2:     "#e8d44a",
  heat3:     "#e8943c",
  heat4:     "#d96040",
  heat5:     "#c43030",
};

const DARK = {
  bg:        "#1a1016",
  bgSoft:    "#1e1318",
  card:      "rgba(40,28,32,0.85)",
  cardBorder:"rgba(180,100,120,0.18)",
  text:      "#f0e4e6",
  textSoft:  "#c4a0a8",
  textMuted: "#7a5a60",
  accent:    "#e8849c",
  accentSoft:"rgba(232,132,156,0.15)",
  accentBorder:"rgba(232,132,156,0.30)",
  good:      "#7cb8a0",
  goodSoft:  "rgba(124,184,160,0.20)",
  warn:      "#e8a85c",
  warnSoft:  "rgba(232,168,92,0.20)",
  bad:       "#d95f5f",
  badSoft:   "rgba(217,95,95,0.20)",
  highlight: "#e8a0b4",
  heat0:     "#2d7a50",
  heat1:     "#6a8a20",
  heat2:     "#8a7010",
  heat3:     "#8a5010",
  heat4:     "#7a3020",
  heat5:     "#7a1010",
};

/* ── localStorage helpers ─────────────────────── */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export default function DrinkTracker() {
  const [data, setData] = useState({});
  const [dataLoaded, setDataLoaded] = useState(false);
  const [weeklyGoal, setWeeklyGoal] = useState(() => loadJSON("sipless-goal", 7));
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [view, setView] = useState("dashboard");
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const [showGoalEdit, setShowGoalEdit] = useState(false);
  const [toast, setToast] = useState(null);
  const [darkMode, setDarkMode] = useState(() => loadJSON("sipless-dark", false));

  const C = darkMode ? DARK : LIGHT;
  const S = useMemo(() => makeStyles(C), [darkMode]);

  // Load drink data from local file on mount
  useEffect(() => {
    fetch("/api/data")
      .then(r => r.json())
      .then(d => { setData(d); setDataLoaded(true); })
      .catch(() => setDataLoaded(true));
  }, []);

  // Save drink data to local file whenever it changes (skip until initial load completes)
  useEffect(() => {
    if (!dataLoaded) return;
    fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {});
  }, [data, dataLoaded]);

  useEffect(() => { saveJSON("sipless-goal", weeklyGoal); }, [weeklyGoal]);
  useEffect(() => { saveJSON("sipless-dark", darkMode); }, [darkMode]);
  useEffect(() => { document.body.style.background = darkMode ? DARK.bg : LIGHT.bg; }, [darkMode]);

  const showToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 2000); }, []);

  const addDrink = useCallback((date, typeId) => {
    setData(prev => {
      const entry = prev[date] || {};
      return { ...prev, [date]: { ...entry, [typeId]: (entry[typeId] || 0) + 1 } };
    });
    showToast(`${DRINK_TYPES.find(d => d.id === typeId).icon} +1 ${DRINK_TYPES.find(d => d.id === typeId).label}`);
  }, [showToast]);

  const removeDrink = useCallback((date, typeId) => {
    setData(prev => {
      const entry = { ...(prev[date] || {}) };
      if (entry[typeId] > 1) entry[typeId]--; else delete entry[typeId];
      const next = { ...prev };
      if (Object.keys(entry).length === 0) delete next[date]; else next[date] = entry;
      return next;
    });
  }, []);

  const totalForDay = useCallback((date) => {
    const entry = data[date]; if (!entry) return 0;
    return Object.entries(entry).reduce((sum, [id, count]) => sum + count * (DRINK_TYPES.find(d => d.id === id)?.std || 1), 0);
  }, [data]);

  const rawCountForDay = useCallback((date) => {
    const entry = data[date]; if (!entry) return 0;
    return Object.values(entry).reduce((a, b) => a + b, 0);
  }, [data]);

  const stats = useMemo(() => {
    const today = new Date();
    const todayKey = dateKey(today);
    const dow = today.getDay();
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - dow);
    let weekTotal = 0, weekDays = 0, weekDrinkDays = 0;
    for (let i = 0; i <= dow; i++) { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); const t = totalForDay(dateKey(d)); weekTotal += t; weekDays++; if (t > 0) weekDrinkDays++; }
    let m30Total = 0, m30Days = 0, m30DrinkDays = 0;
    for (let i = 0; i < 30; i++) { const d = new Date(today); d.setDate(today.getDate() - i); const t = totalForDay(dateKey(d)); m30Total += t; m30Days++; if (t > 0) m30DrinkDays++; }
    let dryStreak = 0;
    if (totalForDay(todayKey) > 0) dryStreak = 0;
    else { dryStreak = 1; let cd = new Date(today); cd.setDate(cd.getDate() - 1); while (totalForDay(dateKey(cd)) === 0 && dryStreak < 365) { dryStreak++; cd.setDate(cd.getDate() - 1); } }
    let bestStreak = 0, cur = 0;
    for (let i = 89; i >= 0; i--) { const d = new Date(today); d.setDate(today.getDate() - i); if (totalForDay(dateKey(d)) === 0) { cur++; bestStreak = Math.max(bestStreak, cur); } else cur = 0; }
    const weeks = [];
    for (let w = 7; w >= 0; w--) { const wStart = new Date(today); wStart.setDate(today.getDate() - dow - w * 7); let wTotal = 0; for (let i = 0; i < 7; i++) { const d = new Date(wStart); d.setDate(wStart.getDate() + i); wTotal += totalForDay(dateKey(d)); } weeks.push({ label: `W${getWeekNumber(wStart)}`, total: wTotal }); }
    const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(weekStart.getDate() - 7);
    let prevWeekTotal = 0; for (let i = 0; i < 7; i++) { const d = new Date(prevWeekStart); d.setDate(prevWeekStart.getDate() + i); prevWeekTotal += totalForDay(dateKey(d)); }
    return {
      weekTotal, weekDays, weekDrinkDays,
      m30Total, m30Days, m30DrinkDays,
      avg30: m30Days > 0 ? (m30Total / m30Days).toFixed(1) : 0,
      dryStreak, bestStreak, weeks, prevWeekTotal,
      weekChange: prevWeekTotal > 0 ? ((weekTotal - prevWeekTotal) / prevWeekTotal * 100) : 0,
      soberRate30: m30Days > 0 ? ((m30Days - m30DrinkDays) / m30Days * 100).toFixed(0) : 0,
    };
  }, [data, totalForDay, weeklyGoal]);

  const calendarData = useMemo(() => {
    const { year, month } = calMonth;
    const startDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) { const dt = new Date(year, month, d); const k = dateKey(dt); cells.push({ day: d, key: k, total: totalForDay(k), raw: rawCountForDay(k) }); }
    return cells;
  }, [calMonth, totalForDay, rawCountForDay]);

  const heatColor = (total) => {
    if (total === 0) return C.heat0;
    if (total <= 1) return C.heat1;
    if (total <= 2) return C.heat2;
    if (total <= 3) return C.heat3;
    if (total <= 5) return C.heat4;
    return C.heat5;
  };

  const prevMonth = () => setCalMonth(p => p.month === 0 ? { year: p.year - 1, month: 11 } : { ...p, month: p.month - 1 });
  const nextMonth = () => setCalMonth(p => p.month === 11 ? { year: p.year + 1, month: 0 } : { ...p, month: p.month + 1 });

  const maxWeek = Math.max(...stats.weeks.map(w => w.total), weeklyGoal, 1);
  const selectedEntry = data[selectedDate] || {};
  const selectedTotal = totalForDay(selectedDate);
  const goalPct = Math.min(stats.weekTotal / weeklyGoal * 100, 100);
  const goalRemaining = Math.max(weeklyGoal - stats.weekTotal, 0);

  return (
    <div style={S.app}>
      {toast && <div style={S.toast}>{toast}</div>}

      {/* ── Header ── */}
      <div style={S.header}>
        <div style={S.headerInner}>
          <div>
            <h1 style={S.title}>Sip<span style={S.titleAccent}>Less</span></h1>
            <p style={S.subtitle}>Track · Reflect · Improve</p>
          </div>
          <div style={S.headerRight}>
            <button onClick={() => setDarkMode(d => !d)} style={S.darkToggle} title={darkMode ? "Switch to light mode" : "Switch to dark mode"}>
              {darkMode ? "☀" : "☽"}
            </button>
            <div style={S.headerFlower}>✿</div>
          </div>
        </div>
        <div style={S.navRow}>
          {[["dashboard","◉"],["log","＋"],["calendar","▦"]].map(([v,ic])=>(
            <button key={v} onClick={()=>setView(v)} style={{...S.navBtn,...(view===v?S.navBtnActive:{})}}>
              <span style={S.navIcon}>{ic}</span><span style={S.navLabel}>{v}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Dashboard ── */}
      {view==="dashboard"&&(
        <div style={S.content}>
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={S.cardTitle}>Weekly Goal</span>
              <button onClick={()=>setShowGoalEdit(!showGoalEdit)} style={S.editBtn}>⚙</button>
            </div>
            {showGoalEdit&&(
              <div style={S.goalEdit}>
                <label style={S.goalLabel}>Max standard drinks per week:</label>
                <div style={S.goalControls}>
                  <button onClick={()=>setWeeklyGoal(Math.max(0,weeklyGoal-1))} style={S.goalBtn}>−</button>
                  <span style={S.goalValue}>{weeklyGoal}</span>
                  <button onClick={()=>setWeeklyGoal(weeklyGoal+1)} style={S.goalBtn}>+</button>
                </div>
              </div>
            )}
            <div style={S.ringContainer}>
              <svg viewBox="0 0 120 120" style={S.ringSvg}>
                <circle cx="60" cy="60" r="50" fill="none" stroke={C.cardBorder} strokeWidth="10"/>
                <circle cx="60" cy="60" r="50" fill="none"
                  stroke={goalPct>=100?C.bad:goalPct>=75?C.warn:C.good}
                  strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${goalPct*3.14} 314`}
                  transform="rotate(-90 60 60)"
                  style={{transition:"stroke-dasharray 0.6s ease"}}
                />
                <text x="60" y="54" textAnchor="middle" fill={C.text} fontSize="22" fontWeight="700" fontFamily="'Playfair Display',Georgia,serif">{stats.weekTotal}</text>
                <text x="60" y="72" textAnchor="middle" fill={C.textMuted} fontSize="9" fontFamily="'Nunito',sans-serif">of {weeklyGoal}</text>
              </svg>
              <div style={S.ringMeta}>
                <span style={{...S.ringStatus,color:goalPct>=100?C.bad:goalPct>=75?C.warn:C.good}}>
                  {goalPct>=100?"Over limit":`${goalRemaining} remaining`}
                </span>
                <span style={S.ringSubtext}>{stats.weekDrinkDays} of {stats.weekDays} days with drinks</span>
              </div>
            </div>
          </div>

          <div style={S.statsGrid}>
            {[[stats.dryStreak,"Day Streak","dry days"],[stats.soberRate30+"%","Sober Rate","last 30 days"],[stats.avg30,"Daily Avg","last 30 days"],[stats.bestStreak,"Best Streak","last 90 days"]].map(([v,l,s],i)=>(
              <div key={i} style={S.statCard}>
                <span style={S.statValue}>{v}</span>
                <span style={S.statLabel}>{l}</span>
                <span style={S.statSub}>{s}</span>
              </div>
            ))}
          </div>

          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={S.cardTitle}>Week over Week</span>
              <span style={{...S.changeBadge,background:stats.weekChange<=0?C.goodSoft:C.badSoft,color:stats.weekChange<=0?C.good:C.bad}}>
                {stats.weekChange<=0?"↓":"↑"} {Math.abs(stats.weekChange).toFixed(0)}%
              </span>
            </div>
            <div style={S.compareRow}>
              <div style={S.compareItem}><span style={S.compareLbl}>This week</span><span style={S.compareVal}>{stats.weekTotal}</span></div>
              <div style={{...S.compareItem,textAlign:"right"}}><span style={S.compareLbl}>Last week</span><span style={S.compareVal}>{stats.prevWeekTotal}</span></div>
            </div>
          </div>

          <div style={S.card}>
            <span style={S.cardTitle}>8-Week Trend</span>
            <div style={S.chartContainer}>
              <div style={{...S.goalLine,bottom:`${(weeklyGoal/maxWeek)*100}%`}}><span style={S.goalLineLabel}>goal</span></div>
              <div style={S.barRow}>
                {stats.weeks.map((w,i)=>(
                  <div key={i} style={S.barCol}>
                    <div style={S.barTrack}>
                      <div style={{
                        ...S.bar,
                        height:`${Math.max((w.total/maxWeek)*100,2)}%`,
                        background: w.total>weeklyGoal?`linear-gradient(0deg,${C.bad},${C.heat4})`:
                          w.total>weeklyGoal*0.75?`linear-gradient(0deg,${C.warn},${C.heat2})`:
                          `linear-gradient(0deg,${C.good},${C.heat1})`,
                        opacity:i===stats.weeks.length-1?1:0.7,
                      }}/>
                    </div>
                    <span style={S.barLabel}>{w.label}</span>
                    <span style={S.barValue}>{w.total}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={S.card}>
            <span style={S.cardTitle}>Quick Log — Today</span>
            <div style={S.quickRow}>
              {DRINK_TYPES.map(t=>(
                <button key={t.id} onClick={()=>addDrink(dateKey(new Date()),t.id)} style={S.quickBtn}>
                  <span style={S.quickIcon}>{t.icon}</span>
                  <span style={S.quickLabel}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Log ── */}
      {view==="log"&&(
        <div style={S.content}>
          <div style={S.card}>
            <span style={S.cardTitle}>Log Drinks</span>
            <div style={S.datePickerRow}>
              <button onClick={()=>{const d=parseDate(selectedDate);d.setDate(d.getDate()-1);setSelectedDate(dateKey(d));}} style={S.dateArrow}>‹</button>
              <div style={S.dateDisplay}>
                <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} style={S.dateInput} max={dateKey(new Date())}/>
                <span style={S.dateNice}>{formatDate(parseDate(selectedDate))}</span>
                {selectedDate===dateKey(new Date())&&<span style={S.todayBadge}>Today</span>}
              </div>
              <button onClick={()=>{const d=parseDate(selectedDate);d.setDate(d.getDate()+1);const next=dateKey(d);if(next<=dateKey(new Date()))setSelectedDate(next);}} style={S.dateArrow}>›</button>
            </div>
          </div>

          <div style={S.drinkGrid}>
            {DRINK_TYPES.map(t=>{
              const count=selectedEntry[t.id]||0;
              return(
                <div key={t.id} style={S.drinkCard}>
                  <span style={S.drinkIcon}>{t.icon}</span>
                  <span style={S.drinkName}>{t.label}</span>
                  <span style={S.drinkStd}>{t.std} std</span>
                  <div style={S.counterRow}>
                    <button onClick={()=>removeDrink(selectedDate,t.id)} style={{...S.counterBtn,opacity:count>0?1:0.3}}>−</button>
                    <span style={S.counterVal}>{count}</span>
                    <button onClick={()=>addDrink(selectedDate,t.id)} style={S.counterBtn}>+</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={S.card}>
            <div style={S.daySummary}>
              <span style={S.summaryLabel}>Day Total</span>
              <span style={{...S.summaryVal,color:selectedTotal===0?C.good:selectedTotal<=2?C.warn:C.bad}}>
                {selectedTotal} <span style={S.summaryUnit}>std drinks</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Calendar ── */}
      {view==="calendar"&&(
        <div style={S.content}>
          <div style={S.card}>
            <div style={S.calNav}>
              <button onClick={prevMonth} style={S.dateArrow}>‹</button>
              <span style={S.calMonthLabel}>{new Date(calMonth.year,calMonth.month).toLocaleDateString("en-US",{month:"long",year:"numeric"})}</span>
              <button onClick={nextMonth} style={S.dateArrow}>›</button>
            </div>
            <div style={S.calDowRow}>
              {["S","M","T","W","T","F","S"].map((d,i)=><span key={i} style={S.calDow}>{d}</span>)}
            </div>
            <div style={S.calGrid}>
              {calendarData.map((cell,i)=>{
                if(!cell)return<div key={`e${i}`} style={S.calEmpty}/>;
                const isToday=cell.key===dateKey(new Date());
                return(
                  <button key={cell.key} onClick={()=>{setSelectedDate(cell.key);setView("log");}}
                    style={{
                      ...S.calCell,
                      background:heatColor(cell.total),
                      border:isToday?`2px solid ${C.accent}`:"2px solid transparent",
                      boxShadow:isToday?`0 0 0 2px ${C.accentSoft}`:"none",
                    }}>
                    <span style={{...S.calDay,color:cell.total>=3?"#fff":C.text}}>{cell.day}</span>
                    {cell.raw>0&&<span style={{...S.calCount,color:cell.total>=3?"rgba(255,255,255,0.9)":C.text}}>{cell.raw}</span>}
                  </button>
                );
              })}
            </div>
            <div style={S.legend}>
              {[{color:C.heat0,label:"Sober"},{color:C.heat1,label:"Light"},{color:C.heat2,label:"Moderate"},{color:C.heat3,label:"Heavy"},{color:C.heat5,label:"Excess"}].map(l=>(
                <div key={l.label} style={S.legendItem}>
                  <div style={{...S.legendSwatch,background:l.color}}/>
                  <span style={S.legendLabel}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={S.card}>
            <span style={S.cardTitle}>Month Summary</span>
            {(()=>{
              const {year,month}=calMonth;
              const dim=new Date(year,month+1,0).getDate();
              let mT=0,mD=0;
              for(let d=1;d<=dim;d++){const t=totalForDay(dateKey(new Date(year,month,d)));mT+=t;if(t>0)mD++;}
              return(
                <div style={S.monthStats}>
                  {[[mT,"total drinks"],[dim-mD,"sober days"],[mD,"drink days"],[dim>0?(mT/dim).toFixed(1):0,"daily avg"]].map(([v,l],i)=>(
                    <div key={i} style={S.monthStat}><span style={S.monthStatVal}>{v}</span><span style={S.monthStatLbl}>{l}</span></div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Styles ─────────────────────────────────────── */
function makeStyles(C) {
  return {
    app: {
      fontFamily:"'Nunito','Helvetica Neue',sans-serif",
      background:`linear-gradient(180deg,${C.bg} 0%,${C.bgSoft} 100%)`,
      minHeight:"100vh", color:C.text, maxWidth:480, margin:"0 auto", paddingBottom:40, position:"relative",
    },
    toast:{
      position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",
      background:C.card,color:C.text,
      padding:"10px 24px",borderRadius:30,fontSize:14,zIndex:999,
      backdropFilter:"blur(12px)",border:`1px solid ${C.cardBorder}`,
      fontWeight:600,animation:"fadeIn 0.2s ease",
      boxShadow:"0 4px 20px rgba(212,114,140,0.12)",
    },
    header:{padding:"28px 20px 16px",borderBottom:`1px solid ${C.cardBorder}`,background:C.card},
    headerInner:{display:"flex",justifyContent:"space-between",alignItems:"flex-start"},
    headerRight:{display:"flex",alignItems:"center",gap:12},
    darkToggle:{
      background:"none",border:`1px solid ${C.cardBorder}`,borderRadius:"50%",
      width:34,height:34,cursor:"pointer",fontSize:16,color:C.textSoft,
      display:"flex",alignItems:"center",justifyContent:"center",
      transition:"all 0.2s",
    },
    headerFlower:{fontSize:28,color:C.accent,opacity:0.5},
    title:{margin:0,fontSize:32,fontFamily:"'Playfair Display',Georgia,serif",fontWeight:700,letterSpacing:"-0.02em",color:C.text},
    titleAccent:{color:C.accent},
    subtitle:{margin:"2px 0 0",fontSize:11,color:C.textMuted,letterSpacing:"0.18em",textTransform:"uppercase"},
    navRow:{display:"flex",gap:6,marginTop:16},
    navBtn:{
      flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,
      padding:"10px 0",borderRadius:14,border:`1px solid ${C.cardBorder}`,
      background:"rgba(128,80,90,0.08)",color:C.textSoft,
      cursor:"pointer",fontSize:11,textTransform:"capitalize",transition:"all 0.2s",
    },
    navBtnActive:{background:C.accentSoft,color:C.accent,border:`1px solid ${C.accentBorder}`,boxShadow:`0 2px 12px rgba(212,114,140,0.1)`},
    navIcon:{fontSize:16},
    navLabel:{fontSize:10,letterSpacing:"0.05em",fontWeight:600},
    content:{padding:"16px 16px 0"},
    card:{
      background:C.card,border:`1px solid ${C.cardBorder}`,
      borderRadius:20,padding:20,marginBottom:14,
      boxShadow:"0 2px 16px rgba(0,0,0,0.08)",backdropFilter:"blur(8px)",
    },
    cardHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16},
    cardTitle:{fontSize:12,fontWeight:700,color:C.textMuted,letterSpacing:"0.08em",textTransform:"uppercase"},
    editBtn:{background:"none",border:"none",color:C.textMuted,cursor:"pointer",fontSize:16},
    goalEdit:{marginBottom:16,padding:"12px 0",borderBottom:`1px solid ${C.cardBorder}`},
    goalLabel:{fontSize:12,color:C.textSoft,display:"block",marginBottom:8},
    goalControls:{display:"flex",alignItems:"center",gap:16,justifyContent:"center"},
    goalBtn:{width:38,height:38,borderRadius:"50%",border:`1px solid ${C.accentBorder}`,background:C.accentSoft,color:C.accent,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700},
    goalValue:{fontSize:28,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif",minWidth:40,textAlign:"center",color:C.accent},
    ringContainer:{display:"flex",alignItems:"center",gap:20},
    ringSvg:{width:120,height:120,flexShrink:0},
    ringMeta:{display:"flex",flexDirection:"column",gap:4},
    ringStatus:{fontSize:16,fontWeight:700},
    ringSubtext:{fontSize:12,color:C.textMuted},
    statsGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14},
    statCard:{background:C.card,border:`1px solid ${C.cardBorder}`,borderRadius:18,padding:"16px 14px",display:"flex",flexDirection:"column",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"},
    statValue:{fontSize:28,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif",color:C.accent,lineHeight:1},
    statLabel:{fontSize:12,fontWeight:700,color:C.textSoft,marginTop:6},
    statSub:{fontSize:10,color:C.textMuted,marginTop:2},
    changeBadge:{fontSize:12,fontWeight:700,padding:"4px 10px",borderRadius:20},
    compareRow:{display:"flex",justifyContent:"space-between"},
    compareItem:{display:"flex",flexDirection:"column"},
    compareLbl:{fontSize:11,color:C.textMuted},
    compareVal:{fontSize:24,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif",color:C.text},
    chartContainer:{position:"relative",marginTop:16,height:160},
    goalLine:{position:"absolute",left:0,right:0,height:1,borderTop:`1px dashed ${C.accent}`,zIndex:1},
    goalLineLabel:{position:"absolute",right:0,top:-16,fontSize:9,color:C.highlight,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:700},
    barRow:{display:"flex",justifyContent:"space-between",alignItems:"flex-end",height:"100%",gap:6,position:"relative",zIndex:2},
    barCol:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",height:"100%"},
    barTrack:{flex:1,width:"100%",display:"flex",alignItems:"flex-end",justifyContent:"center"},
    bar:{width:"65%",borderRadius:"8px 8px 3px 3px",minHeight:3,transition:"height 0.5s ease"},
    barLabel:{fontSize:9,color:C.textMuted,marginTop:6,fontWeight:600},
    barValue:{fontSize:10,color:C.textSoft,fontWeight:700},
    quickRow:{display:"flex",gap:8,marginTop:12,flexWrap:"wrap",justifyContent:"center"},
    quickBtn:{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"12px 14px",borderRadius:16,border:`1px solid ${C.cardBorder}`,background:C.accentSoft,cursor:"pointer",color:C.text,transition:"all 0.15s",minWidth:70},
    quickIcon:{fontSize:24},
    quickLabel:{fontSize:10,color:C.textSoft,fontWeight:600},
    datePickerRow:{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:12},
    dateArrow:{width:40,height:40,borderRadius:"50%",border:`1px solid ${C.cardBorder}`,background:C.accentSoft,color:C.accent,fontSize:22,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700},
    dateDisplay:{display:"flex",flexDirection:"column",alignItems:"center",gap:4,position:"relative"},
    dateInput:{background:"none",border:"none",color:"transparent",position:"absolute",top:0,left:0,right:0,bottom:0,cursor:"pointer",opacity:0},
    dateNice:{fontSize:18,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif",cursor:"pointer",color:C.text},
    todayBadge:{fontSize:9,background:C.accentSoft,color:C.accent,padding:"2px 10px",borderRadius:10,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:700},
    drinkGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14},
    drinkCard:{background:C.card,border:`1px solid ${C.cardBorder}`,borderRadius:18,padding:16,display:"flex",flexDirection:"column",alignItems:"center",gap:4,boxShadow:"0 2px 12px rgba(0,0,0,0.06)"},
    drinkIcon:{fontSize:28},
    drinkName:{fontSize:13,fontWeight:700,color:C.text},
    drinkStd:{fontSize:10,color:C.textMuted},
    counterRow:{display:"flex",alignItems:"center",gap:14,marginTop:6},
    counterBtn:{width:36,height:36,borderRadius:"50%",border:`1px solid ${C.accentBorder}`,background:C.accentSoft,color:C.accent,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",fontWeight:700},
    counterVal:{fontSize:22,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif",minWidth:24,textAlign:"center",color:C.text},
    daySummary:{display:"flex",justifyContent:"space-between",alignItems:"center"},
    summaryLabel:{fontSize:14,color:C.textSoft,fontWeight:600},
    summaryVal:{fontSize:28,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif"},
    summaryUnit:{fontSize:12,fontWeight:400,color:C.textMuted},
    calNav:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16},
    calMonthLabel:{fontSize:20,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif",color:C.text},
    calDowRow:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:6},
    calDow:{textAlign:"center",fontSize:10,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:700},
    calGrid:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5},
    calEmpty:{aspectRatio:"1",borderRadius:10},
    calCell:{aspectRatio:"1",borderRadius:12,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all 0.15s",padding:0,gap:1},
    calDay:{fontSize:12,fontWeight:600,lineHeight:1},
    calCount:{fontSize:9,fontWeight:700,lineHeight:1},
    legend:{display:"flex",justifyContent:"center",gap:12,marginTop:16,flexWrap:"wrap"},
    legendItem:{display:"flex",alignItems:"center",gap:4},
    legendSwatch:{width:12,height:12,borderRadius:4,border:`1px solid ${C.cardBorder}`},
    legendLabel:{fontSize:10,color:C.textSoft,fontWeight:600},
    monthStats:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12},
    monthStat:{display:"flex",flexDirection:"column",alignItems:"center"},
    monthStatVal:{fontSize:24,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif",color:C.accent},
    monthStatLbl:{fontSize:10,color:C.textMuted,marginTop:2,fontWeight:600},
  };
}
