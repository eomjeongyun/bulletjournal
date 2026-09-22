'use strict';

const DB_NAME = 'bulletjournal';
const DB_VERSION = 1;
const STORE_NAME = 'days';
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const DIGEST_KEY = 'VP1a6hUd9wO62sQPpXSNnwtK';
const DIGEST_LABELS = {
  'poop-calendar': 'Calendar',
  watercheck: 'WaterCheck',
  dreamnote: 'DreamNote',
  bookclip: 'BookClip',
  secret: 'Secret',
  kanbanboard: 'KanbanBoard',
};

const $ = s => document.querySelector(s);
let db;
let records = new Map();
let activeMonth = new Date();
let today = keyOf(new Date());
let saveTimer;
const MIN_DATE = today;

function keyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'date' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode = 'readonly') {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function loadAll() {
  return new Promise((resolve, reject) => {
    const req = tx().getAll();
    req.onsuccess = () => { records = new Map(req.result.map(r => [r.date, r])); resolve(); };
    req.onerror = () => reject(req.error);
  });
}

function saveRecord(record) {
  records.set(record.date, record);
  return new Promise((resolve, reject) => {
    const req = tx('readwrite').put(record);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

function renderToday() {
  const record = records.get(today) || { date: today, diary: '' };
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  $('#today-date').textContent = `${m}월 ${d}일 ${WEEKDAY[date.getDay()]}요일`;
  $('#diaryText').value = record.diary || '';
  renderDigest(today);
}

function queueSave() {
  clearTimeout(saveTimer);
  $('#save-indicator').textContent = '';
  saveTimer = setTimeout(async () => {
    const record = { date: today, diary: $('#diaryText').value, updatedAt: new Date().toISOString() };
    try {
      await saveRecord(record);
      $('#save-indicator').textContent = '저장됨';
      renderCalendar();
    } catch (e) {
      $('#save-indicator').textContent = '저장 실패';
    }
  }, 500);
}

async function fetchDigest(dateKey) {
  try {
    const res = await fetch(`https://appointee-unnoticed-donated.ngrok-free.dev/api/bulletjournal-digest/${dateKey}?key=${DIGEST_KEY}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function renderDigest(dateKey) {
  const list = $('#digestList');
  list.innerHTML = '<p class="digest-empty">불러오는 중...</p>';
  const digest = await fetchDigest(dateKey);
  if (!digest || !Object.keys(digest).length) {
    list.innerHTML = digest === null
      ? '<p class="digest-empty">지금은 연결할 수 없어요 (컴퓨터가 꺼져 있으면 안 보여요).</p>'
      : '<p class="digest-empty">이 날 다른 앱 기록은 없어요.</p>';
    return;
  }
  list.innerHTML = Object.entries(digest).map(([app, line]) =>
    `<div class="digest-item"><b>${DIGEST_LABELS[app] || app}</b>${escapeHtml(line)}</div>`
  ).join('');
}

function escapeHtml(s = '') {
  return String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

function monthLabel(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function renderCalendar() {
  const y = activeMonth.getFullYear(), m = activeMonth.getMonth();
  const first = new Date(y, m, 1).getDay();
  const last = new Date(y, m + 1, 0).getDate();
  $('#month-label').textContent = monthLabel(activeMonth);
  const [minY, minM] = MIN_DATE.split('-').map(Number);
  $('#prev-month').disabled = y === minY && m === minM - 1;
  let html = '';
  for (let i = 0; i < first; i++) html += '<span class="calendar-day blank"></span>';
  for (let d = 1; d <= last; d++) {
    const date = new Date(y, m, d);
    const key = keyOf(date);
    const disabled = key < MIN_DATE;
    const record = records.get(key);
    const hasEntry = Boolean(record && record.diary && record.diary.trim());
    html += `<button class="calendar-day${key === today ? ' today' : ''}${hasEntry ? ' has-entry' : ''}${disabled ? ' disabled' : ''}" data-date="${key}" ${disabled ? 'disabled' : ''} type="button" aria-label="${m + 1}월 ${d}일${hasEntry ? ', 기록 있음' : ''}">${d}</button>`;
  }
  $('#calendar-grid').innerHTML = html;
}

async function showDayDetail(key) {
  const record = records.get(key);
  const detail = $('#day-detail');
  const [y, m, d] = key.split('-').map(Number);
  const diary = record && record.diary && record.diary.trim() ? record.diary : '이 날은 적은 기록이 없어요.';
  detail.innerHTML = `<strong>${y}년 ${m}월 ${d}일</strong>${escapeHtml(diary).replace(/\n/g, '<br>')}<div id="dayDigest" class="digest-list" style="margin-top:12px"></div>`;
  detail.hidden = false;
  const digest = await fetchDigest(key);
  const box = $('#dayDigest');
  if (digest && Object.keys(digest).length) {
    box.innerHTML = Object.entries(digest).map(([app, line]) =>
      `<div class="digest-item"><b>${DIGEST_LABELS[app] || app}</b>${escapeHtml(line)}</div>`
    ).join('');
  }
}

function switchScreen(name) {
  $('#today-screen').hidden = name !== 'today';
  $('#calendar-screen').hidden = name !== 'calendar';
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.screen === name));
  $('#day-detail').hidden = true;
}

function initEvents() {
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchScreen(tab.dataset.screen)));
  $('#diaryText').addEventListener('input', queueSave);
  $('#refreshDigest').addEventListener('click', () => renderDigest(today));
  $('#prev-month').addEventListener('click', () => { activeMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() - 1, 1); renderCalendar(); $('#day-detail').hidden = true; });
  $('#next-month').addEventListener('click', () => { activeMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 1); renderCalendar(); $('#day-detail').hidden = true; });
  $('#calendar-grid').addEventListener('click', e => {
    const button = e.target.closest('[data-date]');
    if (button) showDayDetail(button.dataset.date);
  });
  let sx = 0;
  $('#calendar-grid').addEventListener('touchstart', e => { sx = e.changedTouches[0].clientX; }, { passive: true });
  $('#calendar-grid').addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 55) { (dx < 0 ? $('#next-month') : $('#prev-month')).click(); }
  }, { passive: true });
}

async function dailyBackup() {
  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('bulletjournal-backup-date') === todayKey) return;
    const all = Array.from(records.values());
    const res = await fetch('https://appointee-unnoticed-donated.ngrok-free.dev/api/app-backup/bulletjournal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(all),
    });
    if (res.ok) localStorage.setItem('bulletjournal-backup-date', todayKey);
  } catch (e) {}
}

async function init() {
  initEvents();
  try {
    db = await openDB();
    await loadAll();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {
    $('#save-indicator').textContent = '저장공간을 열지 못했어요';
  }
  renderToday();
  renderCalendar();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(reg => reg.update()).catch(() => {});
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; location.reload(); });
  }
  setTimeout(dailyBackup, 3000);
}

init();
