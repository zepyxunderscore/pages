/**
 * storage.js — Persistent data layer using localStorage
 */

const Storage = (() => {
  const KEYS = {
    USER_PROFILE:    'ct_userProfile',
    NUTRITION_GOALS: 'ct_nutritionGoals',
    DAILY_LOGS:      'ct_dailyLogs',
    API_SETTINGS:    'ct_apiSettings',
    THEME:           'ct_theme',
    STREAK:          'ct_streak',
    WEIGHT_LOG:      'ct_weightLog',
  };

  function get(key) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }
    catch(e) { console.error('Storage.get', key, e); return null; }
  }
  function set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch(e) { console.error('Storage.set', key, e); return false; }
  }

  // ── Profile ────────────────────────────────────────────────────────────────
  function getProfile()        { return get(KEYS.USER_PROFILE); }
  function saveProfile(p)      { return set(KEYS.USER_PROFILE, { ...p, updatedAt: Date.now() }); }

  // ── Goals ──────────────────────────────────────────────────────────────────
  function getGoals()          { return get(KEYS.NUTRITION_GOALS); }
  function saveGoals(g)        { return set(KEYS.NUTRITION_GOALS, g); }

  // ── Daily Logs ─────────────────────────────────────────────────────────────
  function getTodayKey() { return new Date().toISOString().split('T')[0]; }

  function getAllLogs()   { return get(KEYS.DAILY_LOGS) || {}; }

  function getDayLog(dateKey) {
    const logs = getAllLogs();
    return logs[dateKey] || {
      date: dateKey, entries: [],
      totals: { calories:0, protein:0, fat:0, carbs:0 }
    };
  }
  function getTodayLog() { return getDayLog(getTodayKey()); }

  function saveDayLog(dateKey, dayLog) {
    const logs = getAllLogs();
    logs[dateKey] = dayLog;
    return set(KEYS.DAILY_LOGS, logs);
  }

  function recalcTotals(dayLog) {
    dayLog.totals = dayLog.entries.reduce((acc, e) => {
      acc.calories += Number(e.calories) || 0;
      acc.protein  += Number(e.protein)  || 0;
      acc.fat      += Number(e.fat)      || 0;
      acc.carbs    += Number(e.carbs)    || 0;
      return acc;
    }, { calories:0, protein:0, fat:0, carbs:0 });
  }

  function addFoodEntry(entry) {
    const dateKey = getTodayKey();
    const dayLog  = getTodayLog();
    const newEntry = {
      id: `e_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      timestamp: Date.now(),
      ...entry,
    };
    dayLog.entries.push(newEntry);
    recalcTotals(dayLog);
    saveDayLog(dateKey, dayLog);
    updateStreak();
    return newEntry;
  }

  function updateFoodEntry(id, data) {
    const dateKey = getTodayKey();
    const dayLog  = getTodayLog();
    const idx = dayLog.entries.findIndex(e => e.id === id);
    if (idx === -1) return false;
    dayLog.entries[idx] = { ...dayLog.entries[idx], ...data };
    recalcTotals(dayLog);
    return saveDayLog(dateKey, dayLog);
  }

  function deleteFoodEntry(id) {
    const dateKey = getTodayKey();
    const dayLog  = getTodayLog();
    dayLog.entries = dayLog.entries.filter(e => e.id !== id);
    recalcTotals(dayLog);
    return saveDayLog(dateKey, dayLog);
  }

  function resetTodayLog() {
    const dk = getTodayKey();
    return saveDayLog(dk, { date: dk, entries: [], totals: { calories:0, protein:0, fat:0, carbs:0 } });
  }

  // ── Weight Log ─────────────────────────────────────────────────────────────
  function getWeightLog() { return get(KEYS.WEIGHT_LOG) || []; }

  function addWeightEntry(weight) {
    const log     = getWeightLog();
    const dateKey = getTodayKey();
    const filtered = log.filter(e => e.date !== dateKey);
    filtered.push({ date: dateKey, weight: Number(weight), timestamp: Date.now() });
    filtered.sort((a, b) => a.date.localeCompare(b.date));
    set(KEYS.WEIGHT_LOG, filtered);
    const profile = getProfile();
    if (profile) { profile.weight = Number(weight); saveProfile(profile); }
    return filtered;
  }

  // ── Weekly ─────────────────────────────────────────────────────────────────
  function getWeeklyLogs() {
    const logs = getAllLogs();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().split('T')[0];
      return logs[key] || { date: key, entries: [], totals: { calories:0, protein:0, fat:0, carbs:0 } };
    });
  }

  // Returns last N days including today (most recent last)
  function getRecentLogs(n = 30) {
    const logs = getAllLogs();
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (n - 1 - i));
      const key = d.toISOString().split('T')[0];
      return logs[key] || { date: key, entries: [], totals: { calories:0, protein:0, fat:0, carbs:0 } };
    }).filter(l => l.entries.length > 0);
  }

  // ── API Settings ───────────────────────────────────────────────────────────
  function getApiSettings()   { return get(KEYS.API_SETTINGS) || { provider:'openai', apiKey:'', customEndpoint:'', customModel:'openai/gpt-4o' }; }
  function saveApiSettings(s) { return set(KEYS.API_SETTINGS, s); }

  // ── Theme ──────────────────────────────────────────────────────────────────
  function getTheme()      { return get(KEYS.THEME) || { mode:'light', scheme:'green' }; }
  function saveTheme(t)    { return set(KEYS.THEME, t); }

  // ── Streak ─────────────────────────────────────────────────────────────────
  function getStreak() { return get(KEYS.STREAK) || { current:0, longest:0, lastDate:null }; }

  function updateStreak() {
    const streak = getStreak();
    const today  = getTodayKey();
    if (streak.lastDate === today) return streak;
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    const yKey = yest.toISOString().split('T')[0];
    streak.current = streak.lastDate === yKey ? streak.current + 1 : 1;
    streak.longest = Math.max(streak.current, streak.longest);
    streak.lastDate = today;
    set(KEYS.STREAK, streak);
    return streak;
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function resetAll() { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); }

  // ── Setup check ────────────────────────────────────────────────────────────
  function isSetupComplete() {
    const p = getProfile();
    return !!(p && p.name && p.age && p.height && p.weight);
  }

  return {
    getProfile, saveProfile,
    getGoals, saveGoals,
    getTodayLog, getDayLog, getAllLogs, getWeeklyLogs, getRecentLogs,
    addFoodEntry, updateFoodEntry, deleteFoodEntry, resetTodayLog,
    getWeightLog, addWeightEntry,
    getApiSettings, saveApiSettings,
    getTheme, saveTheme,
    getStreak, updateStreak,
    isSetupComplete, resetAll,
    getTodayKey,
  };
})();
