import { useState, useEffect, useCallback, useMemo } from "react";

const DRINK_TYPES = [
  { id: "beer", label: "Beer", icon: "🍺", std: 1 },
  { id: "wine", label: "Wine", icon: "🍷", std: 1.5 },
  { id: "cocktail", label: "Cocktail", icon: "🍸", std: 1.5 },
  { id: "shot", label: "Shot", icon: "🥃", std: 1 },
  { id: "seltzer", label: "Seltzer", icon: "🥤", std: 1 },
  { id: "champagne", label: "Champagne", icon: "🥂", std: 1.5 },
];

const MORNING_SCALE = [
  { score: 1, icon: "😞", label: "Rough" },
  { score: 2, icon: "😐", label: "Off" },
  { score: 3, icon: "🙂", label: "OK" },
  { score: 4, icon: "😊", label: "Good" },
  { score: 5, icon: "🤩", label: "Great" },
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
function isDrinkKey(k) { return !k.startsWith("_"); }

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
  const [dayCap, setDayCap] = useState(() => loadJSON("sipless-day-cap", 3));
  const [afTarget, setAfTarget] = useState(() => loadJSON("sipless-af-target", 4));
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [view, setView] = useState("dashboard");
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const [calMode, setCalMode] = useState("month"); // "month" | "all"
  const [showGoalEdit, setShowGoalEdit] = useState(false);
  const [toast, setToast] = useState(null);
  const [darkMode, setDarkMode] = useState(() => loadJSON("sipless-dark", false));
  const [morningDraft, setMorningDraft] = useState(5.5);

  const C = darkMode ? DARK : LIGHT;
  const S = useMemo(() => makeStyles(C), [darkMode]);

  // Load drink data from local file on mount
  useEffect(() => {
    fetch("/api/data")
      .then(r => r.json())
      .then(d => {
        // Morning Feel scale migration: 1-5 → 1-10 (multiply existing values by 2)
        const scaleVer = loadJSON("sipless-morning-scale-v", null);
        let migrated = d;
        if (scaleVer !== "10") {
          migrated = {};
          for (const [date, entry] of Object.entries(d || {})) {
            if (entry && typeof entry._morning === "number" && entry._morning <= 5) {
              migrated[date] = { ...entry, _morning: entry._morning * 2 };
            } else {
              migrated[date] = entry;
            }
          }
          saveJSON("sipless-morning-scale-v", "10");
        }
        setData(migrated);
        setDataLoaded(true);
      })
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
  useEffect(() => { saveJSON("sipless-day-cap", dayCap); }, [dayCap]);
  useEffect(() => { saveJSON("sipless-af-target", afTarget); }, [afTarget]);
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
    return Object.entries(entry)
      .filter(([id]) => isDrinkKey(id))
      .reduce((sum, [id, count]) => sum + count * (DRINK_TYPES.find(d => d.id === id)?.std || 1), 0);
  }, [data]);

  const rawCountForDay = useCallback((date) => {
    const entry = data[date]; if (!entry) return 0;
    return Object.entries(entry)
      .filter(([id]) => isDrinkKey(id))
      .reduce((a, [, b]) => a + b, 0);
  }, [data]);

  const resistCountForDay = useCallback((date) => data[date]?._resisted || 0, [data]);

  const addResist = useCallback((date) => {
    setData(prev => {
      const entry = prev[date] || {};
      return { ...prev, [date]: { ...entry, _resisted: (entry._resisted || 0) + 1 } };
    });
    showToast(`✦ Urge resisted`);
  }, [showToast]);

  const removeResist = useCallback((date) => {
    setData(prev => {
      const entry = { ...(prev[date] || {}) };
      if (entry._resisted > 1) entry._resisted--; else delete entry._resisted;
      const next = { ...prev };
      if (Object.keys(entry).length === 0) delete next[date]; else next[date] = entry;
      return next;
    });
  }, []);

  const morningForDay = useCallback((date) => data[date]?._morning || null, [data]);

  const setMorning = useCallback((date, score) => {
    setData(prev => {
      const entry = { ...(prev[date] || {}) };
      if (score === null) delete entry._morning;
      else entry._morning = score;
      const next = { ...prev };
      if (Object.keys(entry).length === 0) delete next[date]; else next[date] = entry;
      return next;
    });
  }, []);

  const stats = useMemo(() => {
    const today = new Date();
    const todayKey = dateKey(today);
    const dow = today.getDay();
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - dow);
    let weekTotal = 0, weekDays = 0, weekDrinkDays = 0, weekResisted = 0;
    for (let i = 0; i <= dow; i++) { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); const k = dateKey(d); const t = totalForDay(k); weekTotal += t; weekDays++; if (t > 0) weekDrinkDays++; weekResisted += data[k]?._resisted || 0; }
    // Rolling 7-day window for sober + heavy day counts (more intuitive than calendar-week reset)
    // Heavy day uses raw drink count so the cap matches what users see in the cell label.
    let rolling7AfDays = 0, rolling7HeavyDays = 0;
    for (let i = 0; i < 7; i++) { const d = new Date(today); d.setDate(today.getDate() - i); const k = dateKey(d); const t = totalForDay(k); const r = rawCountForDay(k); if (t === 0) rolling7AfDays++; if (r > dayCap) rolling7HeavyDays++; }
    let m30Total = 0, m30Days = 0, m30DrinkDays = 0;
    for (let i = 0; i < 30; i++) { const d = new Date(today); d.setDate(today.getDate() - i); const t = totalForDay(dateKey(d)); m30Total += t; m30Days++; if (t > 0) m30DrinkDays++; }
    let dryStreak = 0;
    if (totalForDay(todayKey) > 0) dryStreak = 0;
    else { dryStreak = 1; let cd = new Date(today); cd.setDate(cd.getDate() - 1); while (totalForDay(dateKey(cd)) === 0 && dryStreak < 365) { dryStreak++; cd.setDate(cd.getDate() - 1); } }
    let bestStreak = 0, cur = 0;
    const dataKeys = Object.keys(data).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    if (dataKeys.length > 0) {
      const cursor = new Date(parseDate(dataKeys[0]));
      while (cursor <= today) {
        if (totalForDay(dateKey(cursor)) === 0) { cur++; bestStreak = Math.max(bestStreak, cur); }
        else { cur = 0; }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    // Year-to-date monthly totals (Jan → current month of this year)
    const months = [];
    const curYear = today.getFullYear(), curMonth = today.getMonth();
    for (let m = 0; m <= curMonth; m++) {
      const dim = new Date(curYear, m + 1, 0).getDate();
      const lastDay = m === curMonth ? today.getDate() : dim;
      let mTotal = 0;
      for (let d = 1; d <= lastDay; d++) mTotal += totalForDay(dateKey(new Date(curYear, m, d)));
      months.push({
        label: new Date(curYear, m, 1).toLocaleDateString("en-US", { month: "short" }),
        total: Math.round(mTotal * 10) / 10,
        goal: weeklyGoal / 7 * dim, // each month's own goal, scaled to its length
        partial: m === curMonth,
      });
    }
    const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(weekStart.getDate() - 7);
    let prevWeekTotal = 0; for (let i = 0; i < 7; i++) { const d = new Date(prevWeekStart); d.setDate(prevWeekStart.getDate() + i); prevWeekTotal += totalForDay(dateKey(d)); }
    return {
      weekTotal, weekDays, weekDrinkDays, weekResisted,
      rolling7AfDays, rolling7HeavyDays,
      m30Total, m30Days, m30DrinkDays,
      avg30: m30Days > 0 ? (m30Total / m30Days).toFixed(1) : 0,
      dryStreak, bestStreak, months, prevWeekTotal,
      weekChange: prevWeekTotal > 0 ? ((weekTotal - prevWeekTotal) / prevWeekTotal * 100) : 0,
      soberRate30: m30Days > 0 ? ((m30Days - m30DrinkDays) / m30Days * 100).toFixed(0) : 0,
    };
  }, [data, totalForDay, rawCountForDay, weeklyGoal, dayCap]);

  const calendarData = useMemo(() => {
    const { year, month } = calMonth;
    const startDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) { const dt = new Date(year, month, d); const k = dateKey(dt); cells.push({ day: d, key: k, total: totalForDay(k), raw: rawCountForDay(k), resisted: resistCountForDay(k) }); }
    return cells;
  }, [calMonth, totalForDay, rawCountForDay, resistCountForDay]);

  const multiCalendarData = useMemo(() => {
    const today = new Date();
    const todayKey = dateKey(today);
    const keys = Object.keys(data).sort();
    const earliest = keys.length > 0
      ? parseDate(keys[0])
      : new Date(today.getFullYear(), 0, 1);

    const months = [];
    const cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
    const endMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    while (cursor <= endMonth) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const startDow = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < startDow; i++) cells.push({ blank: true });
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(year, month, d);
        const k = dateKey(dt);
        const inRange = dt >= earliest && k <= todayKey;
        cells.push({
          day: d,
          key: k,
          inRange,
          total: inRange ? totalForDay(k) : -1,
          raw: inRange ? rawCountForDay(k) : 0,
          resisted: inRange ? resistCountForDay(k) : 0,
        });
      }
      while (cells.length % 7 !== 0) cells.push({ blank: true });

      let label = new Date(year, month, 1).toLocaleDateString("en-US", { month: "short" });
      if (year !== today.getFullYear()) label += ` '${String(year).slice(2)}`;
      months.push({ year, month, label, cells });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return { months, earliest };
  }, [data, totalForDay, rawCountForDay, resistCountForDay]);

  const allTimeStats = useMemo(() => {
    const today = new Date();
    const keys = Object.keys(data).sort();
    if (keys.length === 0) return { days: 0, total: 0, drinkDays: 0, soberDays: 0, avg: 0, resisted: 0 };
    const earliest = parseDate(keys[0]);
    const days = Math.floor((today - earliest) / 86400000) + 1;
    let total = 0, drinkDays = 0, resisted = 0;
    const cursor = new Date(earliest);
    while (cursor <= today) {
      const k = dateKey(cursor);
      const t = totalForDay(k);
      total += t;
      if (t > 0) drinkDays++;
      resisted += data[k]?._resisted || 0;
      cursor.setDate(cursor.getDate() + 1);
    }
    return {
      days,
      total: Math.round(total * 10) / 10,
      drinkDays,
      soberDays: days - drinkDays,
      avg: days > 0 ? (total / days).toFixed(1) : 0,
      resisted,
    };
  }, [data, totalForDay]);

  const quarterlyStats = useMemo(() => {
    const today = new Date();
    const todayKey = dateKey(today);
    const keys = Object.keys(data).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    if (keys.length === 0) return [];
    const earliest = parseDate(keys[0]);
    const quarters = [];
    // Walk each calendar quarter that overlaps the tracked range [earliest, today]
    let cursor = new Date(earliest.getFullYear(), Math.floor(earliest.getMonth() / 3) * 3, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    while (cursor <= end) {
      const year = cursor.getFullYear();
      const q = Math.floor(cursor.getMonth() / 3); // 0-3
      const qStart = new Date(year, q * 3, 1);
      const qEnd = new Date(year, q * 3 + 3, 0); // last day of quarter
      const from = qStart < earliest ? earliest : qStart;
      const to = qEnd > today ? today : qEnd;
      let days = 0, drinkDays = 0, total = 0;
      const d = new Date(from);
      while (d <= to && dateKey(d) <= todayKey) {
        const t = totalForDay(dateKey(d));
        days++;
        if (t > 0) drinkDays++;
        total += t;
        d.setDate(d.getDate() + 1);
      }
      if (days > 0) {
        quarters.push({
          label: `Q${q + 1} ${year}`,
          year, q,
          days, drinkDays,
          soberDays: days - drinkDays,
          soberRate: Math.round((days - drinkDays) / days * 100),
          total: Math.round(total * 10) / 10,
          partial: to < qEnd, // current quarter still in progress
        });
      }
      cursor = new Date(year, q * 3 + 3, 1); // first day of next quarter
    }
    return quarters;
  }, [data, totalForDay]);

  const morningInsight = useMemo(() => {
    let soberSum = 0, soberN = 0, drinkSum = 0, drinkN = 0;
    Object.entries(data).forEach(([date, entry]) => {
      const score = entry?._morning;
      if (!score) return;
      const d = parseDate(date);
      const prev = new Date(d); prev.setDate(d.getDate() - 1);
      const prevTotal = totalForDay(dateKey(prev));
      if (prevTotal > 0) { drinkSum += score; drinkN++; }
      else { soberSum += score; soberN++; }
    });
    return {
      soberAvg: soberN > 0 ? soberSum / soberN : null,
      soberN,
      drinkAvg: drinkN > 0 ? drinkSum / drinkN : null,
      drinkN,
      ready: soberN >= 3 && drinkN >= 3,
      totalRated: soberN + drinkN,
    };
  }, [data, totalForDay]);

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

  const monthGoal = weeklyGoal / 7 * 30.44; // avg-month goal, for the chart goal line
  const maxMonth = Math.max(...stats.months.map(m => m.total), monthGoal, 1);
  const selectedEntry = data[selectedDate] || {};
  const selectedTotal = totalForDay(selectedDate);
  const goalPct = Math.min(stats.weekTotal / weeklyGoal * 100, 100);
  const goalRemaining = Math.max(weeklyGoal - stats.weekTotal, 0);

  return (
    <div style={S.app}>
      <style>{`
        .sl-slider{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:3px;background:${C.cardBorder};outline:none;cursor:pointer;margin:6px 0;}
        .sl-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;border-radius:50%;background:${C.accent};border:3px solid ${C.card};box-shadow:0 2px 8px rgba(0,0,0,0.18);cursor:pointer;transition:transform 0.1s ease;}
        .sl-slider::-webkit-slider-thumb:active{transform:scale(1.15);}
        .sl-slider::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:${C.accent};border:3px solid ${C.card};box-shadow:0 2px 8px rgba(0,0,0,0.18);cursor:pointer;}
        .sl-slider:focus{outline:none;}
      `}</style>
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
                <div style={S.goalEditRow}>
                  <label style={S.goalLabel}>Max drinks per week</label>
                  <div style={S.goalControls}>
                    <button onClick={()=>setWeeklyGoal(Math.max(0,weeklyGoal-1))} style={S.goalBtnSm}>−</button>
                    <span style={S.goalValueSm}>{weeklyGoal}</span>
                    <button onClick={()=>setWeeklyGoal(weeklyGoal+1)} style={S.goalBtnSm}>+</button>
                  </div>
                </div>
                <div style={S.goalEditRow}>
                  <label style={S.goalLabel}>Max drinks per day</label>
                  <div style={S.goalControls}>
                    <button onClick={()=>setDayCap(Math.max(0,dayCap-1))} style={S.goalBtnSm}>−</button>
                    <span style={S.goalValueSm}>{dayCap}</span>
                    <button onClick={()=>setDayCap(dayCap+1)} style={S.goalBtnSm}>+</button>
                  </div>
                </div>
                <div style={S.goalEditRow}>
                  <label style={S.goalLabel}>Sober days per week</label>
                  <div style={S.goalControls}>
                    <button onClick={()=>setAfTarget(Math.max(0,afTarget-1))} style={S.goalBtnSm}>−</button>
                    <span style={S.goalValueSm}>{afTarget}</span>
                    <button onClick={()=>setAfTarget(Math.min(7,afTarget+1))} style={S.goalBtnSm}>+</button>
                  </div>
                </div>
              </div>
            )}
            <div style={S.ringContainer}>
              <div style={S.ringsRow}>
                <div style={S.ringItem}>
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
                  <span style={S.ringItemLabel}>Weekly · Sun→</span>
                </div>
                <div style={S.ringItem}>
                  {(()=>{
                    const afPct=Math.min(stats.rolling7AfDays/Math.max(afTarget,1)*100,100);
                    const afColor=afPct>=100?C.good:afPct>0?C.accent:C.textMuted;
                    return(
                      <svg viewBox="0 0 120 120" style={S.ringSvgSmall}>
                        <circle cx="60" cy="60" r="50" fill="none" stroke={C.cardBorder} strokeWidth="10"/>
                        <circle cx="60" cy="60" r="50" fill="none"
                          stroke={afColor}
                          strokeWidth="10" strokeLinecap="round"
                          strokeDasharray={`${afPct*3.14} 314`}
                          transform="rotate(-90 60 60)"
                          style={{transition:"stroke-dasharray 0.6s ease"}}
                        />
                        <text x="60" y="54" textAnchor="middle" fill={C.text} fontSize="22" fontWeight="700" fontFamily="'Playfair Display',Georgia,serif">{stats.rolling7AfDays}</text>
                        <text x="60" y="72" textAnchor="middle" fill={C.textMuted} fontSize="9" fontFamily="'Nunito',sans-serif">of {afTarget}</text>
                      </svg>
                    );
                  })()}
                  <span style={S.ringItemLabel}>Sober · 7d</span>
                </div>
              </div>
              <div style={S.ringMetaRow}>
                <span style={{...S.ringMetaItem,color:stats.weekTotal>weeklyGoal?C.bad:stats.weekTotal===weeklyGoal?C.warn:C.good}}>
                  {stats.weekTotal>weeklyGoal
                    ?`${(stats.weekTotal-weeklyGoal).toFixed(stats.weekTotal%1?1:0)} over cap`
                    :stats.weekTotal===weeklyGoal
                    ?`at your cap`
                    :`✓ ${(weeklyGoal-stats.weekTotal).toFixed(stats.weekTotal%1?1:0)} under cap`}
                </span>
                <span style={{...S.ringMetaItem,color:stats.rolling7HeavyDays>0?C.bad:C.textMuted}}>
                  {stats.rolling7HeavyDays>0?`⚠ ${stats.rolling7HeavyDays} heavy in 7d`:"no heavy days · 7d"}
                </span>
              </div>
              <div style={S.ringFootnote}>
                {stats.weekDays-stats.weekDrinkDays} of {stats.weekDays} sober day{stats.weekDays===1?"":"s"} this week
              </div>
            </div>
          </div>

          {morningForDay(dateKey(new Date()))===null&&(
            <div style={S.morningCard}>
              <div style={S.cardHeader}>
                <span style={S.cardTitle}>Morning Feel</span>
                <span style={S.morningHint}>How's this morning?</span>
              </div>
              <div style={S.sliderWrap}>
                <div style={S.sliderValueRow}>
                  <span style={S.sliderValue}>{morningDraft.toFixed(1)}</span>
                  <span style={S.sliderMax}>/ 10</span>
                </div>
                <input type="range" min="1" max="10" step="0.5" value={morningDraft}
                  onChange={e=>setMorningDraft(parseFloat(e.target.value))}
                  className="sl-slider"
                />
                <div style={S.sliderEnds}>
                  <span>1 · Rough</span>
                  <span>10 · Great</span>
                </div>
                <button onClick={()=>{setMorning(dateKey(new Date()),morningDraft);setMorningDraft(5.5);}} style={S.sliderCommit}>Save</button>
              </div>
            </div>
          )}

          <div style={S.statsGrid}>
            <div style={S.resistCard}>
              <div style={S.resistCardLeft}>
                <span style={S.resistIcon}>✦</span>
                <div style={S.resistCardBody}>
                  <span style={S.resistValue}>{stats.weekResisted}</span>
                  <span style={S.resistLabel}>Urges Resisted</span>
                  <span style={S.resistSub}>this week{allTimeStats.resisted>stats.weekResisted?` · ${allTimeStats.resisted} all-time`:""}</span>
                </div>
              </div>
              <button onClick={()=>addResist(dateKey(new Date()))} style={S.resistAddBtn}>
                <span style={S.resistAddIcon}>✦</span>
                <span>+1</span>
              </button>
            </div>
            {[[stats.dryStreak,"Day Streak","sober days in a row"],[stats.soberRate30+"%","Sober Rate","last 30 days"],[stats.avg30,"Daily Avg","last 30 days"],[stats.bestStreak,"Best Streak","all-time"]].map(([v,l,s],i)=>(
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
            <span style={S.cardTitle}>{stats.months.length} Month{stats.months.length===1?"":"s"} · {new Date().getFullYear()} YTD</span>
            <div style={S.chartContainer}>
              <div style={{...S.goalLine,bottom:`${(monthGoal/maxMonth)*100}%`}}><span style={S.goalLineLabel}>goal</span></div>
              <div style={S.barRow}>
                {stats.months.map((m,i)=>(
                  <div key={i} style={S.barCol}>
                    <div style={S.barTrack}>
                      <div style={{
                        ...S.bar,
                        height:`${Math.max((m.total/maxMonth)*100,2)}%`,
                        background: m.total>m.goal?`linear-gradient(0deg,${C.bad},${C.heat4})`:
                          m.total>m.goal*0.75?`linear-gradient(0deg,${C.warn},${C.heat2})`:
                          `linear-gradient(0deg,${C.good},${C.heat1})`,
                        opacity:m.partial?1:0.7,
                      }}/>
                    </div>
                    <span style={S.barLabel}>{m.label}</span>
                    <span style={S.barValue}>{m.total}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {quarterlyStats.length>0&&(
            <div style={S.card}>
              <div style={S.cardHeader}>
                <span style={S.cardTitle}>Sober Rate by Quarter</span>
                {quarterlyStats.length>=2&&(()=>{
                  const first=quarterlyStats[0],last=quarterlyStats[quarterlyStats.length-1];
                  const diff=last.soberRate-first.soberRate;
                  if(diff===0)return null;
                  return(
                    <span style={{...S.changeBadge,background:diff>0?C.goodSoft:C.badSoft,color:diff>0?C.good:C.bad}}>
                      {diff>0?"↑":"↓"} {Math.abs(diff)} pts
                    </span>
                  );
                })()}
              </div>
              <div style={S.quarterList}>
                {quarterlyStats.map(qr=>{
                  const color=qr.soberRate>=60?C.good:qr.soberRate>=35?C.warn:C.bad;
                  return(
                    <div key={qr.label} style={S.quarterRow}>
                      <div style={S.quarterHead}>
                        <span style={S.quarterLabel}>{qr.label}{qr.partial?" ·":""}<span style={S.quarterPartial}>{qr.partial?" so far":""}</span></span>
                        <span style={{...S.quarterRate,color}}>{qr.soberRate}%</span>
                      </div>
                      <div style={S.quarterTrack}>
                        <div style={{...S.quarterFill,width:`${qr.soberRate}%`,background:color}}/>
                      </div>
                      <span style={S.quarterSub}>{qr.soberDays} of {qr.days} days sober · {qr.total} drinks</span>
                    </div>
                  );
                })}
              </div>
              {quarterlyStats.length>=2&&(()=>{
                const first=quarterlyStats[0],last=quarterlyStats[quarterlyStats.length-1];
                const diff=last.soberRate-first.soberRate;
                if(diff<=0)return null;
                return(
                  <div style={S.patternFootnote}>
                    Up {diff} points since {first.label} — the trend is going your way.
                  </div>
                );
              })()}
            </div>
          )}

          {morningInsight.totalRated>0&&(
            <div style={S.card}>
              <div style={S.cardHeader}>
                <span style={S.cardTitle}>Patterns</span>
                <span style={S.patternsHint}>morning feel</span>
              </div>
              {morningInsight.ready?(
                <>
                  <div style={S.patternRow}>
                    <div style={S.patternLeft}>
                      <span style={S.patternBucket}>After sober nights</span>
                      <span style={S.patternN}>n={morningInsight.soberN}</span>
                    </div>
                    <div style={S.patternRight}>
                      <span style={{...S.patternVal,color:C.good}}>{morningInsight.soberAvg.toFixed(1)}</span>
                      <span style={S.patternMax}>/ 10</span>
                    </div>
                  </div>
                  <div style={S.patternRow}>
                    <div style={S.patternLeft}>
                      <span style={S.patternBucket}>After drinking nights</span>
                      <span style={S.patternN}>n={morningInsight.drinkN}</span>
                    </div>
                    <div style={S.patternRight}>
                      <span style={{...S.patternVal,color:morningInsight.drinkAvg<morningInsight.soberAvg?C.bad:C.text}}>{morningInsight.drinkAvg.toFixed(1)}</span>
                      <span style={S.patternMax}>/ 10</span>
                    </div>
                  </div>
                  {(()=>{
                    const diff=morningInsight.soberAvg-morningInsight.drinkAvg;
                    if(Math.abs(diff)<0.3)return null;
                    return(
                      <div style={S.patternFootnote}>
                        Sober mornings score {diff>0?"+":""}{diff.toFixed(1)} {diff>0?"higher":"lower"} on average.
                      </div>
                    );
                  })()}
                </>
              ):(
                <div style={S.patternsPending}>
                  Need at least 3 ratings in each bucket to show insights.
                  <span style={S.patternsPendingSub}>You have {morningInsight.soberN} sober + {morningInsight.drinkN} drinking ratings so far.</span>
                </div>
              )}
            </div>
          )}

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
            {(()=>{
              const rCount=resistCountForDay(selectedDate);
              return(
                <div style={{...S.drinkCard,...S.resistTile}}>
                  <span style={S.resistTileIcon}>✦</span>
                  <span style={S.drinkName}>Resisted</span>
                  <span style={S.resistTileSub}>+1 win</span>
                  <div style={S.counterRow}>
                    <button onClick={()=>removeResist(selectedDate)} style={{...S.counterBtn,...S.resistCounterBtn,opacity:rCount>0?1:0.3}}>−</button>
                    <span style={S.counterVal}>{rCount}</span>
                    <button onClick={()=>addResist(selectedDate)} style={{...S.counterBtn,...S.resistCounterBtn}}>+</button>
                  </div>
                </div>
              );
            })()}
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
            {resistCountForDay(selectedDate)>0&&(
              <div style={S.daySummaryResist}>
                <span style={S.daySummaryResistIcon}>✦</span>
                <span>{resistCountForDay(selectedDate)} urge{resistCountForDay(selectedDate)===1?"":"s"} resisted</span>
              </div>
            )}
            <div style={S.morningInline}>
              <div style={S.morningInlineHead}>
                <span style={S.morningInlineLabel}>Morning Feel</span>
                {morningForDay(selectedDate)!==null&&(
                  <button onClick={()=>setMorning(selectedDate,null)} style={S.morningClear}>clear</button>
                )}
              </div>
              <div style={S.sliderWrap}>
                <div style={S.sliderValueRow}>
                  <span style={{...S.sliderValue,opacity:morningForDay(selectedDate)===null?0.4:1}}>
                    {morningForDay(selectedDate)!==null?morningForDay(selectedDate).toFixed(1):"—"}
                  </span>
                  <span style={S.sliderMax}>/ 10</span>
                </div>
                <input type="range" min="1" max="10" step="0.5"
                  value={morningForDay(selectedDate)??5.5}
                  onChange={e=>setMorning(selectedDate,parseFloat(e.target.value))}
                  className="sl-slider"
                />
                <div style={S.sliderEnds}>
                  <span>1 · Rough</span>
                  <span>10 · Great</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Calendar ── */}
      {view==="calendar"&&(
        <div style={S.content}>
          <div style={S.card}>
            <div style={S.calModeToggle}>
              {[["month","Month"],["all","All Time"]].map(([m,l])=>(
                <button key={m} onClick={()=>setCalMode(m)}
                  style={{...S.calModeBtn,...(calMode===m?S.calModeBtnActive:{})}}>{l}</button>
              ))}
            </div>

            {calMode==="month"?(
              <>
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
                          boxShadow:[
                            cell.raw>dayCap?`inset 0 0 0 2px ${C.bad}`:null,
                            isToday?`0 0 0 2px ${C.accentSoft}`:null,
                          ].filter(Boolean).join(", ")||"none",
                        }}>
                        <span style={{...S.calDay,color:cell.total>=3?"#fff":C.text}}>{cell.day}</span>
                        {cell.raw>0&&<span style={{...S.calCount,color:cell.total>=3?"rgba(255,255,255,0.9)":C.text}}>{cell.raw}</span>}
                        {cell.resisted>0&&<span style={S.calResistMark}>✦{cell.resisted>1?cell.resisted:""}</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            ):(
              <>
                <div style={S.allCalHeader}>
                  <span style={S.calMonthLabel}>All Time</span>
                  <span style={S.allCalSub}>
                    {multiCalendarData.earliest.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} → today · {multiCalendarData.months.length} mo
                  </span>
                </div>
                <div style={S.allCalWrap}>
                  <div style={S.allCalDowRow}>
                    {["S","M","T","W","T","F","S"].map((d,i)=><span key={i} style={S.allCalDow}>{d}</span>)}
                  </div>
                  {multiCalendarData.months.map(m=>(
                    <div key={`${m.year}-${m.month}`} style={S.allCalMonthBlock}>
                      <div style={S.allCalMonthHeader}>
                        <span style={S.allCalMonthLabel}>{m.label}</span>
                        <div style={S.allCalMonthRule}/>
                      </div>
                      <div style={S.allCalMonthGrid}>
                        {m.cells.map((c,ci)=>{
                          if(c.blank)return <div key={`b${ci}`} style={S.allCalBlank}/>;
                          if(!c.inRange)return <div key={c.key} style={S.allCalEmpty}/>;
                          const isToday=c.key===dateKey(new Date());
                          const heavy=c.raw>dayCap;
                          return(
                            <button key={c.key}
                              onClick={()=>{setSelectedDate(c.key);setView("log");}}
                              title={`${c.key} · ${c.raw} drink${c.raw!==1?"s":""} (${c.total} std)${heavy?" · heavy":""}${c.resisted>0?` · ✦ ${c.resisted} resisted`:""}`}
                              style={{
                                ...S.allCalCell,
                                background:heatColor(c.total),
                                outline:isToday?`1.5px solid ${C.accent}`:"none",
                                outlineOffset:isToday?1:0,
                                boxShadow:heavy?`inset 0 0 0 1.5px ${C.bad}`:"none",
                              }}>
                              {c.resisted>0&&<span style={S.allCalResistDot}/>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={S.legend}>
              {[
                {color:C.heat0,label:"Sober"},
                {color:C.heat1,label:"Light"},
                {color:C.heat2,label:"Moderate"},
                {color:C.heat3,label:"Heavy"},
                {color:C.heat5,label:"Excess"},
                {color:C.heat3,label:"Over cap",overCap:true},
              ].map(l=>(
                <div key={l.label} style={S.legendItem}>
                  <div style={{...S.legendSwatch,background:l.color,...(l.overCap?{boxShadow:`inset 0 0 0 1.5px ${C.bad}`}:{})}}/>
                  <span style={S.legendLabel}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {calMode==="month"?(
            <div style={S.card}>
              <span style={S.cardTitle}>Month Summary</span>
              {(()=>{
                const {year,month}=calMonth;
                const dim=new Date(year,month+1,0).getDate();
                let mT=0,mD=0,mR=0;
                for(let d=1;d<=dim;d++){const k=dateKey(new Date(year,month,d));const t=totalForDay(k);mT+=t;if(t>0)mD++;mR+=data[k]?._resisted||0;}
                return(
                  <>
                    <div style={S.monthStats}>
                      {[[mT,"total drinks"],[dim-mD,"sober days"],[mD,"drink days"],[dim>0?(mT/dim).toFixed(1):0,"daily avg"]].map(([v,l],i)=>(
                        <div key={i} style={S.monthStat}><span style={S.monthStatVal}>{v}</span><span style={S.monthStatLbl}>{l}</span></div>
                      ))}
                    </div>
                    {mR>0&&(
                      <div style={S.summaryResistFootnote}>
                        <span style={S.summaryResistIcon}>✦</span>
                        <span>{mR} urge{mR===1?"":"s"} resisted this month</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          ):(
            <div style={S.card}>
              <span style={S.cardTitle}>All-Time Summary</span>
              <div style={S.monthStats}>
                {[
                  [allTimeStats.total,"total drinks"],
                  [allTimeStats.soberDays,"sober days"],
                  [allTimeStats.drinkDays,"drink days"],
                  [allTimeStats.avg,"daily avg"],
                ].map(([v,l],i)=>(
                  <div key={i} style={S.monthStat}><span style={S.monthStatVal}>{v}</span><span style={S.monthStatLbl}>{l}</span></div>
                ))}
              </div>
              <div style={S.allTimeFootnote}>
                {allTimeStats.days} days tracked · {allTimeStats.days>0?Math.round(allTimeStats.soberDays/allTimeStats.days*100):0}% sober
              </div>
              {allTimeStats.resisted>0&&(
                <div style={S.summaryResistFootnote}>
                  <span style={S.summaryResistIcon}>✦</span>
                  <span>{allTimeStats.resisted} urge{allTimeStats.resisted===1?"":"s"} resisted all-time</span>
                </div>
              )}
            </div>
          )}
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
    goalEdit:{marginBottom:16,padding:"4px 0 14px",borderBottom:`1px solid ${C.cardBorder}`,display:"flex",flexDirection:"column",gap:10},
    goalEditRow:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10},
    goalLabel:{fontSize:12,color:C.textSoft,fontWeight:600,flex:1},
    goalControls:{display:"flex",alignItems:"center",gap:10,justifyContent:"center"},
    goalBtn:{width:38,height:38,borderRadius:"50%",border:`1px solid ${C.accentBorder}`,background:C.accentSoft,color:C.accent,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700},
    goalBtnSm:{width:28,height:28,borderRadius:"50%",border:`1px solid ${C.accentBorder}`,background:C.accentSoft,color:C.accent,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,padding:0},
    goalValue:{fontSize:28,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif",minWidth:40,textAlign:"center",color:C.accent},
    goalValueSm:{fontSize:20,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif",minWidth:30,textAlign:"center",color:C.accent},
    ringContainer:{display:"flex",flexDirection:"column",gap:12},
    ringsRow:{display:"flex",alignItems:"center",justifyContent:"center",gap:18},
    ringItem:{display:"flex",flexDirection:"column",alignItems:"center",gap:4},
    ringItemLabel:{fontSize:10,color:C.textMuted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"},
    ringSvg:{width:120,height:120,flexShrink:0},
    ringSvgSmall:{width:90,height:90,flexShrink:0},
    ringMeta:{display:"flex",flexDirection:"column",gap:4},
    ringMetaRow:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,paddingTop:6,borderTop:`1px solid ${C.cardBorder}`},
    ringMetaItem:{fontSize:12,fontWeight:700,letterSpacing:"0.02em"},
    ringFootnote:{fontSize:11,color:C.textMuted,textAlign:"center",marginTop:6,letterSpacing:"0.02em"},
    ringStatus:{fontSize:16,fontWeight:700},
    ringSubtext:{fontSize:12,color:C.textMuted},
    statsGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14},
    resistCard:{
      gridColumn:"1 / -1",
      background:`linear-gradient(135deg, ${C.goodSoft} 0%, rgba(124,184,160,0.05) 100%)`,
      border:`1px solid rgba(124,184,160,0.30)`,
      borderRadius:18,padding:"14px 16px",
      display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,
      boxShadow:"0 2px 12px rgba(124,184,160,0.10)",
    },
    resistCardLeft:{display:"flex",alignItems:"center",gap:14,flex:1,minWidth:0},
    resistIcon:{fontSize:30,color:C.good,lineHeight:1,flexShrink:0},
    resistCardBody:{display:"flex",flexDirection:"column",minWidth:0},
    resistValue:{fontSize:28,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif",color:C.good,lineHeight:1},
    resistLabel:{fontSize:12,fontWeight:700,color:C.text,marginTop:5,letterSpacing:"0.02em"},
    resistSub:{fontSize:10,color:C.textMuted,marginTop:2},
    resistAddBtn:{
      display:"flex",alignItems:"center",gap:5,
      background:C.good,color:"#fff",border:"none",borderRadius:14,
      padding:"10px 14px",fontSize:13,fontWeight:700,cursor:"pointer",
      boxShadow:"0 2px 8px rgba(124,184,160,0.30)",
      transition:"transform 0.1s ease",flexShrink:0,
    },
    resistAddIcon:{fontSize:14,lineHeight:1},
    resistTile:{
      gridColumn:"1 / -1",
      background:`linear-gradient(135deg, ${C.goodSoft} 0%, rgba(124,184,160,0.05) 100%)`,
      border:`1px solid rgba(124,184,160,0.30)`,
    },
    resistTileIcon:{fontSize:28,color:C.good,lineHeight:1},
    resistTileSub:{fontSize:10,color:C.good,fontWeight:700,letterSpacing:"0.05em",textTransform:"uppercase"},
    resistCounterBtn:{
      borderColor:"rgba(124,184,160,0.45)",
      background:"rgba(124,184,160,0.18)",
      color:C.good,
    },
    morningCard:{
      background:`linear-gradient(135deg, rgba(232,160,180,0.10) 0%, ${C.card} 100%)`,
      border:`1px solid ${C.cardBorder}`,
      borderRadius:20,padding:20,marginBottom:14,
      boxShadow:"0 2px 16px rgba(0,0,0,0.06)",backdropFilter:"blur(8px)",
    },
    morningHint:{fontSize:11,color:C.textMuted,letterSpacing:"0.02em"},
    morningPicker:{display:"flex",gap:6,marginTop:10,justifyContent:"space-between"},
    sliderWrap:{display:"flex",flexDirection:"column",gap:4,marginTop:8},
    sliderValueRow:{display:"flex",alignItems:"baseline",justifyContent:"center",gap:6,marginBottom:4},
    sliderValue:{fontSize:36,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif",color:C.accent,lineHeight:1},
    sliderMax:{fontSize:13,color:C.textMuted,fontWeight:600},
    sliderEnds:{display:"flex",justifyContent:"space-between",fontSize:10,color:C.textMuted,fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",marginTop:2},
    sliderCommit:{
      marginTop:12,padding:"10px 18px",
      background:C.accent,color:"#fff",
      border:"none",borderRadius:14,
      fontSize:13,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",
      cursor:"pointer",boxShadow:"0 2px 8px rgba(212,114,140,0.30)",
      alignSelf:"center",
    },
    patternMax:{fontSize:11,color:C.textMuted,fontWeight:600,marginLeft:2},
    morningOpt:{
      flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,
      padding:"10px 4px",borderRadius:14,border:`1px solid ${C.cardBorder}`,
      background:"transparent",cursor:"pointer",transition:"all 0.15s",
    },
    morningOptActive:{
      background:C.accentSoft,border:`1px solid ${C.accentBorder}`,
      boxShadow:`0 2px 10px rgba(212,114,140,0.12)`,
    },
    morningOptIcon:{fontSize:22,lineHeight:1,transition:"all 0.15s"},
    morningOptLabel:{fontSize:9,color:C.textSoft,fontWeight:600,letterSpacing:"0.02em"},
    morningInline:{marginTop:14,paddingTop:14,borderTop:`1px solid ${C.cardBorder}`},
    morningInlineHead:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4},
    morningInlineLabel:{fontSize:12,fontWeight:700,color:C.textMuted,letterSpacing:"0.08em",textTransform:"uppercase"},
    morningClear:{background:"none",border:"none",color:C.textMuted,fontSize:10,cursor:"pointer",letterSpacing:"0.05em",textTransform:"uppercase",fontWeight:600},
    patternsHint:{fontSize:11,color:C.textMuted,letterSpacing:"0.02em"},
    patternRow:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.cardBorder}`},
    patternLeft:{display:"flex",flexDirection:"column"},
    patternBucket:{fontSize:13,color:C.text,fontWeight:600},
    patternN:{fontSize:10,color:C.textMuted,marginTop:2},
    patternRight:{display:"flex",alignItems:"center",gap:8},
    patternIcon:{fontSize:24,lineHeight:1},
    patternVal:{fontSize:20,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif",minWidth:40,textAlign:"right"},
    patternFootnote:{fontSize:12,color:C.textSoft,marginTop:12,fontStyle:"italic",textAlign:"center"},
    patternsPending:{fontSize:12,color:C.textSoft,marginTop:8,display:"flex",flexDirection:"column",gap:4},
    patternsPendingSub:{fontSize:11,color:C.textMuted},
    quarterList:{display:"flex",flexDirection:"column",gap:14},
    quarterRow:{display:"flex",flexDirection:"column",gap:5},
    quarterHead:{display:"flex",justifyContent:"space-between",alignItems:"baseline"},
    quarterLabel:{fontSize:13,fontWeight:700,color:C.text},
    quarterPartial:{fontSize:10,color:C.textMuted,fontWeight:600,fontStyle:"italic"},
    quarterRate:{fontSize:18,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif"},
    quarterTrack:{height:8,borderRadius:5,background:C.cardBorder,overflow:"hidden"},
    quarterFill:{height:"100%",borderRadius:5,transition:"width 0.6s ease"},
    quarterSub:{fontSize:10,color:C.textMuted,fontWeight:600,letterSpacing:"0.02em"},
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
    daySummaryResist:{display:"flex",alignItems:"center",gap:6,marginTop:10,paddingTop:10,borderTop:`1px solid ${C.cardBorder}`,fontSize:13,color:C.good,fontWeight:600},
    daySummaryResistIcon:{fontSize:16,color:C.good,lineHeight:1},
    summaryResistFootnote:{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:12,paddingTop:10,borderTop:`1px solid ${C.cardBorder}`,fontSize:12,color:C.good,fontWeight:600,letterSpacing:"0.02em"},
    summaryResistIcon:{fontSize:14,color:C.good,lineHeight:1},
    summaryLabel:{fontSize:14,color:C.textSoft,fontWeight:600},
    summaryVal:{fontSize:28,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif"},
    summaryUnit:{fontSize:12,fontWeight:400,color:C.textMuted},
    calNav:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16},
    calMonthLabel:{fontSize:20,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif",color:C.text},
    calDowRow:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:6},
    calDow:{textAlign:"center",fontSize:10,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:700},
    calGrid:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5},
    calEmpty:{aspectRatio:"1",borderRadius:10},
    calCell:{aspectRatio:"1",borderRadius:12,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all 0.15s",padding:0,gap:1,position:"relative",overflow:"hidden"},
    calResistMark:{position:"absolute",top:2,right:3,fontSize:9,fontWeight:700,color:"#f5c518",letterSpacing:0,lineHeight:1,textShadow:"0 0 2px rgba(0,0,0,0.45), 0 0 4px rgba(245,197,24,0.5)"},
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
    calModeToggle:{display:"flex",gap:4,marginBottom:16,background:C.accentSoft,padding:3,borderRadius:12,border:`1px solid ${C.cardBorder}`},
    calModeBtn:{flex:1,padding:"7px 10px",borderRadius:9,border:"none",background:"transparent",color:C.textSoft,cursor:"pointer",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",transition:"all 0.15s"},
    calModeBtnActive:{background:C.card,color:C.accent,boxShadow:"0 1px 4px rgba(0,0,0,0.08)"},
    allCalHeader:{display:"flex",flexDirection:"column",alignItems:"flex-start",marginBottom:12},
    allCalSub:{fontSize:11,color:C.textMuted,marginTop:2,letterSpacing:"0.02em"},
    allCalWrap:{maxWidth:240,margin:"0 auto"},
    allCalDowRow:{display:"grid",gridTemplateColumns:"repeat(7, 1fr)",gap:3,marginBottom:6},
    allCalDow:{textAlign:"center",fontSize:9,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:700},
    allCalMonthBlock:{marginBottom:14},
    allCalMonthHeader:{display:"flex",alignItems:"center",gap:8,marginBottom:5},
    allCalMonthLabel:{fontSize:10,color:C.textSoft,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",lineHeight:1,whiteSpace:"nowrap"},
    allCalMonthRule:{flex:1,height:1,background:C.cardBorder},
    allCalMonthGrid:{display:"grid",gridTemplateColumns:"repeat(7, 1fr)",gap:3},
    allCalCell:{aspectRatio:"1",borderRadius:4,cursor:"pointer",padding:0,border:"none",transition:"transform 0.1s",position:"relative",display:"flex",alignItems:"center",justifyContent:"center"},
    allCalResistDot:{width:5,height:5,borderRadius:"50%",background:"#f5c518",boxShadow:"0 0 0 1px rgba(0,0,0,0.35), 0 0 4px rgba(245,197,24,0.7)"},
    allCalEmpty:{aspectRatio:"1",borderRadius:4,opacity:0.2,background:C.heat0},
    allCalBlank:{aspectRatio:"1",background:"transparent"},
    allTimeFootnote:{fontSize:11,color:C.textMuted,textAlign:"center",marginTop:14,paddingTop:12,borderTop:`1px solid ${C.cardBorder}`,letterSpacing:"0.02em"},
  };
}
