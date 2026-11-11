(function(){
'use strict';

/* ============================================================
   CONSTANTS & STATE
   ============================================================ */
const STORAGE_KEY = 'german-vocab-pro-v1';
const LEGACY_KEYS = ['german-vocab-v2', 'german_vocab_app_data_v11', 'german-vocab-pro'];
const AUTOPLAY_KEY = 'german-vocab-autoplay';

let state = { books: [], activeBookId: null, activeLessonId: null, lastLessonByBook: {}, quizHistory: [] };
let practice = { active: false, queue: [], index: 0, ratings: {} };
let quizState = { mode: null, questions: [], index: 0, correct: 0, wrong: 0, wrongWords: [], answered: false, startedAt: 0 };
let storyEditId = null;
let currentStoryId = null;
let repeatMode = 0;
let repeatCounter = 0;
let cardSortMode = 'alpha';
let currentAudio = null;
let editingBookId = null;
let pendingBookData = null;
let practiceDirection = 'de-fa';

let autoPlayWord = true;
try {
  const saved = localStorage.getItem(AUTOPLAY_KEY);
  if (saved !== null) autoPlayWord = saved === 'true';
} catch(e){}

/* ============================================================
   UTILITIES
   ============================================================ */
function uid(){ return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}
function toast(msg, type){
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + (type || '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

function normalizeGerman(str){
  return String(str || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[.,!?;:'"«»„“”\-–—]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function germanEquals(a, b){
  return normalizeGerman(a) === normalizeGerman(b);
}

function speak(text, audioUrl){
  if (currentAudio) {
    try { currentAudio.pause(); currentAudio.currentTime = 0; } catch(e){}
    currentAudio = null;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();

  if (audioUrl && audioUrl.trim()) {
    try {
      const directUrl = toDirectAudioUrl(audioUrl);
      if (directUrl) {
        currentAudio = new Audio(directUrl);
        currentAudio.play().catch(err => {
          console.warn('خطا در پخش فایل صوتی، استفاده از TTS:', err);
          speakTTS(text);
        });
        currentAudio.addEventListener('ended', () => { currentAudio = null; });
        return;
      }
    } catch(e) { console.warn(e); }
  }
  speakTTS(text);
}

function speakTTS(text){
  if (!('speechSynthesis' in window)) { toast('مرورگر تلفظ پشتیبانی نمی‌کند', 'error'); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

function articleClass(a){
  if (['der','die','das'].includes(a)) return a;
  if (a === 'Verb') return 'verb';
  if (a === 'Adj' || a === 'Adv') return 'adj';
  return '';
}
function getWordType(w){
  const art = w.art || '–';
  if (art === 'der' || art === 'die' || art === 'das') return { type: 'noun', label: 'اسم', icon: '📦' };
  if (art === 'Verb') return { type: 'verb', label: 'فعل', icon: '⚡' };
  if (art === 'Adj') return { type: 'adj', label: 'صفت', icon: '🎨' };
  if (art === 'Adv') return { type: 'adj', label: 'قید', icon: '💫' };
  return { type: 'other', label: 'نامشخص', icon: '❓' };
}
function toDirectAudioUrl(src){
  src = String(src || '').trim();
  if (!src) return '';
  if (/^(javascript|data|vbscript):/i.test(src)) return '';
  const gd = src.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (gd) return 'https://drive.google.com/uc?export=download&id=' + gd[1];
  const gd2 = src.match(/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([^&#]+)/i);
  if (gd2) return 'https://drive.google.com/uc?export=download&id=' + gd2[1];
  const gd3 = src.match(/docs\.google\.com\/[^/]+\/d\/([^/?#]+)/i);
  if (gd3) return 'https://drive.google.com/uc?export=download&id=' + gd3[1];
  if (/dropbox\.com/i.test(src)) {
    return src.replace(/([?&])dl=0/i, '$1raw=1').replace(/([?&])dl=1/i, '$1raw=1');
  }
  return src;
}
function safeImageSrc(src){
  src = String(src || '').trim();
  if (!src) return '';
  if (/^(javascript|data|vbscript):/i.test(src)) return '';
  return src;
}
function safeCoverColor(c){
  c = String(c || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#6366f1';
}
function fmtTime(sec){
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec/60);
  const s = Math.floor(sec%60);
  return m + ':' + (s<10?'0':'') + s;
}
function normalizeStatus(w){
  if (!w.status) {
    if (w.srs && w.srs.box >= 4) return 'good';
    if (w.srs && w.srs.box >= 2) return 'learning';
    return 'new';
  }
  return w.status;
}
function shuffle(a){
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function quizModeLabel(mode){
  const m = {
    mean:'🔤 معنی', sentence:'📝 جمله', typing:'⌨️ تایپ',
    listening:'🎧 شنیداری', article:'🔤 جنسیت', plural:'📚 جمع'
  };
  return m[mode] || mode;
}

/* ============================================================
   SAMPLE LESSON
   ============================================================ */
function makeSampleLesson(){
  return {
    id: 'sample-' + uid(),
    title: 'Lektion 2 — Familie und Freunde (نمونه)',
    isSample: true,
    stories: [
      {
        id: 'sample-story-' + uid(),
        title: 'Geschichte 1: Meine Familie',
        audio: '', coverImage: '', coverColor: '#536dfe',
        sentences: [
          { de: 'Meine Familie ist nicht sehr groß.', fa: 'خانواده من خیلی بزرگ نیست.' },
          { de: 'Mein Vater arbeitet in einer Firma.', fa: 'پدر من در یک شرکت کار می‌کند.' },
          { de: 'Meine Mutter ist Lehrerin.', fa: 'مادر من معلم است.' },
          { de: 'Ich habe einen Bruder und eine Schwester.', fa: 'من یک برادر و یک خواهر دارم.' },
          { de: 'Wir wohnen zusammen in Teheran.', fa: 'ما با هم در تهران زندگی می‌کنیم.' },
          { de: 'Ich bin sehr glücklich mit meiner Familie.', fa: 'من با خانواده‌ام خیلی خوشحالم.' }
        ]
      },
      {
        id: 'sample-story-' + uid(),
        title: 'Geschichte 2: Ein Tag mit Freunden',
        audio: '', coverImage: '', coverColor: '#536dfe',
        sentences: [
          { de: 'Heute treffe ich meine Freunde.', fa: 'امروز دوستانم را می‌بینم.' },
          { de: 'Wir lernen zusammen Deutsch.', fa: 'ما با هم آلمانی یاد می‌گیریم.' },
          { de: 'Mein Freund Ali wohnt in Berlin.', fa: 'دوست من علی در برلین زندگی می‌کند.' },
          { de: 'Er arbeitet als Arzt.', fa: 'او به عنوان پزشک کار می‌کند.' },
          { de: 'Wir sind alle sehr glücklich.', fa: 'ما همه خیلی خوشحالیم.' }
        ]
      }
    ],
    words: [
      { id: 'sample-w-' + uid(), de: 'Familie', art: 'die', plural: 'Familien', fa: 'خانواده', ex: 'Meine Familie ist groß.', exMean: 'خانواده من بزرگ است.', exAudio: '', note: '', notes: [], synonyms: ['Verwandtschaft'], related: ['Eltern', 'Kinder'], forms: {}, extraExamples: [], status: 'new', srs: { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0 } },
      { id: 'sample-w-' + uid(), de: 'Vater', art: 'der', plural: 'Väter', fa: 'پدر', ex: 'Mein Vater arbeitet viel.', exMean: 'پدر من زیاد کار می‌کند.', exAudio: '', note: '', notes: [], synonyms: ['Papa'], related: ['Mutter'], forms: {}, extraExamples: [], status: 'new', srs: { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0 } },
      { id: 'sample-w-' + uid(), de: 'Mutter', art: 'die', plural: 'Mütter', fa: 'مادر', ex: 'Meine Mutter kocht sehr gut.', exMean: 'مادر من خیلی خوب آشپزی می‌کند.', exAudio: '', note: '', notes: [], synonyms: ['Mama'], related: ['Vater'], forms: {}, extraExamples: [], status: 'new', srs: { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0 } },
      { id: 'sample-w-' + uid(), de: 'Bruder', art: 'der', plural: 'Brüder', fa: 'برادر', ex: 'Mein Bruder ist zehn Jahre alt.', exMean: 'برادر من ده سال دارد.', exAudio: '', note: '', notes: [], synonyms: [], related: ['Schwester'], forms: {}, extraExamples: [], status: 'new', srs: { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0 } },
      { id: 'sample-w-' + uid(), de: 'Schwester', art: 'die', plural: 'Schwestern', fa: 'خواهر', ex: 'Meine Schwester studiert Medizin.', exMean: 'خواهر من پزشکی می‌خواند.', exAudio: '', note: '', notes: [], synonyms: [], related: ['Bruder'], forms: {}, extraExamples: [], status: 'new', srs: { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0 } },
      { id: 'sample-w-' + uid(), de: 'wohnen', art: 'Verb', plural: '–', fa: 'زندگی کردن', ex: 'Ich wohne in Teheran.', exMean: 'من در تهران زندگی می‌کنم.', exAudio: '', note: '', notes: [], synonyms: ['leben'], related: ['Wohnung'], forms: { present: 'wohne / wohnst / wohnt', past: 'wohnte', perfect: 'hat gewohnt' }, extraExamples: [], status: 'new', srs: { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0 } },
      { id: 'sample-w-' + uid(), de: 'arbeiten', art: 'Verb', plural: '–', fa: 'کار کردن', ex: 'Ich arbeite als Lehrer.', exMean: 'من به عنوان معلم کار می‌کنم.', exAudio: '', note: '', notes: [], synonyms: [], related: ['Arbeit'], forms: { present: 'arbeite / arbeitest / arbeitet', past: 'arbeitete', perfect: 'hat gearbeitet' }, extraExamples: [], status: 'new', srs: { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0 } },
      { id: 'sample-w-' + uid(), de: 'glücklich', art: 'Adj', plural: '–', fa: 'خوشحال', ex: 'Ich bin sehr glücklich.', exMean: 'من خیلی خوشحالم.', exAudio: '', note: '', notes: [], synonyms: ['froh'], related: [], forms: {}, extraExamples: [], status: 'new', srs: { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0 } },
      { id: 'sample-w-' + uid(), de: 'zusammen', art: 'Adv', plural: '–', fa: 'با هم', ex: 'Wir lernen zusammen Deutsch.', exMean: 'ما با هم آلمانی یاد می‌گیریم.', exAudio: '', note: '', notes: [], synonyms: ['gemeinsam'], related: [], forms: {}, extraExamples: [], status: 'new', srs: { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0 } },
      { id: 'sample-w-' + uid(), de: 'Wie heißt du?', art: '–', plural: '–', fa: 'اسمت چیه؟', ex: 'Hallo! Wie heißt du?', exMean: 'سلام! اسمت چیه؟', exAudio: '', note: '', notes: [], synonyms: [], related: [], forms: {}, extraExamples: [], status: 'new', srs: { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0 } }
    ]
  };
}

/* ✅ اطمینان از وجود فقط یک درس نمونه در کتاب */
function ensureSingleSampleLesson(book) {
  if (!book) return;
  if (!Array.isArray(book.lessons)) book.lessons = [];
  // همه درس‌های نمونه قبلی رو حذف کن
  book.lessons = book.lessons.filter(l => !l.isSample);
  // فقط یک درس نمونه جدید اضافه کن
  book.lessons.unshift(makeSampleLesson());
}

/* ============================================================
   AUTO PLAY
   ============================================================ */
function updateAutoPlayUI(){
  const t1 = document.getElementById('autoPlayToggle');
  const t2 = document.getElementById('autoPlayToggleSession');
  const l1 = document.getElementById('autoPlayLabel');
  const l2 = document.getElementById('autoPlayLabelSession');
  if (t1) t1.classList.toggle('on', autoPlayWord);
  if (t2) t2.classList.toggle('on', autoPlayWord);
  if (l1) l1.textContent = autoPlayWord ? '🔊 پخش خودکار: روشن' : '🔇 پخش خودکار: خاموش';
  if (l2) l2.textContent = autoPlayWord ? '🔊' : '🔇';
}
function toggleAutoPlay(){
  autoPlayWord = !autoPlayWord;
  try { localStorage.setItem(AUTOPLAY_KEY, String(autoPlayWord)); } catch(e){}
  updateAutoPlayUI();
  toast(autoPlayWord ? '🔊 پخش خودکار روشن شد' : '🔇 پخش خودکار خاموش شد', autoPlayWord ? 'success' : 'warning');
}

/* ============================================================
   PRACTICE DIRECTION
   ============================================================ */
function updateDirectionLabel(){
  const lbl = document.getElementById('directionLabel');
  if (lbl) lbl.textContent = practiceDirection === 'de-fa' ? 'آلمانی → فارسی' : 'فارسی → آلمانی';
}
function togglePracticeDirection(){
  practiceDirection = practiceDirection === 'de-fa' ? 'fa-de' : 'de-fa';
  updateDirectionLabel();
  if (practice.active) showCurrentPracticeCard();
  toast(practiceDirection === 'de-fa' ? '🔄 جهت: آلمانی → فارسی' : '🔄 جهت: فارسی → آلمانی', 'success');
}

/* ============================================================
   NORMALIZERS
   ============================================================ */
function normalizeWord(raw){
  if (!raw || typeof raw !== 'object') return null;
  const de = (raw.de || raw.word || raw.german || raw.Wort || raw.Deutsch || '').toString().trim();
  const fa = (raw.fa || raw.mean || raw.persian || raw.translation || raw.Bedeutung || raw.Farsi || '').toString().trim();
  if (!de || !fa) return null;
  return {
    id: raw.id || uid(),
    de, art: (raw.art || raw.article || raw.Artikel || '–').toString(),
    plural: (raw.plural || raw.Plural || '–').toString(),
    fa,
    ex: (raw.ex || raw.example || raw.Beispiel || '').toString(),
    exMean: (raw.exMean || raw.exampleFa || raw.beispielFa || '').toString(),
    exAudio: (raw.exAudio || raw.exampleAudio || '').toString(),
    note: (raw.note || '').toString(),
    notes: Array.isArray(raw.notes) ? raw.notes : [],
    synonyms: Array.isArray(raw.synonyms) ? raw.synonyms : [],
    related: Array.isArray(raw.related) ? raw.related : [],
    forms: raw.forms || {},
    extraExamples: Array.isArray(raw.extraExamples) ? raw.extraExamples : [],
    speak: raw.speak || '',
    status: raw.status || 'new',
    srs: raw.srs || { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0 }
  };
}
function normalizeStory(raw){
  if (!raw || typeof raw !== 'object') return null;
  const title = (raw.title || raw.name || '').toString().trim();
  if (!title) return null;
  let sentences = raw.sentences || raw.lines || [];
  if (typeof sentences === 'string') {
    sentences = sentences.split(/\r?\n/).filter(Boolean).map(line => {
      const sep = line.indexOf('|');
      if (sep < 1) return null;
      return { de: line.slice(0, sep).trim(), fa: line.slice(sep+1).trim() };
    }).filter(Boolean);
  }
  sentences = (sentences || []).map(s => {
    if (typeof s === 'string') {
      const sep = s.indexOf('|');
      if (sep < 1) return null;
      return { de: s.slice(0, sep).trim(), fa: s.slice(sep+1).trim() };
    }
    return { de: (s.de || s.german || '').toString(), fa: (s.fa || s.persian || s.translation || '').toString() };
  }).filter(s => s && s.de && s.fa);
  return {
    id: raw.id || uid(),
    title,
    audio: (raw.audio || raw.audioUrl || raw.fullAudio || '').toString(),
    coverImage: (raw.coverImage || raw.cover || raw.image || '').toString(),
    coverColor: safeCoverColor(raw.coverColor),
    sentences
  };
}
function normalizeLesson(raw, fallbackTitle){
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return { id: uid(), title: fallbackTitle || 'درس', words: raw.map(normalizeWord).filter(Boolean), stories: [], isSample: false };
  }
  if (typeof raw !== 'object') return null;
  return {
    id: raw.id || uid(),
    title: (raw.title || raw.lesson || raw.lessonTitle || raw.name || fallbackTitle || 'درس').toString(),
    words: Array.isArray(raw.words) ? raw.words.map(normalizeWord).filter(Boolean) : [],
    stories: Array.isArray(raw.stories) ? raw.stories.map(normalizeStory).filter(Boolean) : [],
    isSample: !!raw.isSample
  };
}
function normalizeBook(raw, fallbackName){
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id || uid(),
    name: (raw.name || raw.title || raw.book || fallbackName || 'کتاب').toString(),
    level: (raw.level || 'A1.1').toString(),
    coverImage: (raw.coverImage || raw.cover || raw.image || '').toString(),
    lessons: Array.isArray(raw.lessons) ? raw.lessons.map((l, i) => normalizeLesson(l, 'درس ' + (i+1))).filter(Boolean) : []
  };
}

/* ============================================================
   DEFAULT DATA
   ============================================================ */
function defaultData(){
  const book = {
    id: uid(),
    name: 'Menschen',
    level: 'A1.1',
    coverImage: '',
    lessons: []
  };
  ensureSingleSampleLesson(book);
  return {
    books: [book],
    activeBookId: book.id,
    activeLessonId: book.lessons[0].id,
    lastLessonByBook: {},
    quizHistory: []
  };
}

/* ============================================================
   MIGRATION
   ============================================================ */
function tryMigrateLegacy(){
  const currentRaw = localStorage.getItem(STORAGE_KEY);
  // ✅ اگر STORAGE_KEY وجود داره (حتی اگه books خالی باشه)، legacy رو چک نکن
  if (currentRaw !== null) {
    try {
      const d = JSON.parse(currentRaw);
      if (d && typeof d === 'object' && Array.isArray(d.books)) {
        if (!d.lastLessonByBook) d.lastLessonByBook = {};
        if (!Array.isArray(d.quizHistory)) d.quizHistory = [];
        return d;
      }
    } catch(e){}
    return null;
  }
  for (const key of LEGACY_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      const migrated = migrateFromLegacy(data);
      if (migrated && migrated.books.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        try { localStorage.removeItem(key); } catch(e){}
        return migrated;
      }
    } catch(e) { console.warn('[Migration]', e); }
  }
  return null;
}
function migrateFromLegacy(data){
  if (data.books && Array.isArray(data.books)) {
    const books = data.books.map(b => normalizeBook(b)).filter(Boolean);
    const result = {
      books,
      activeBookId: data.activeBookId || (books[0] && books[0].id),
      activeLessonId: data.activeLessonId || (books[0] && books[0].lessons[0] && books[0].lessons[0].id),
      lastLessonByBook: data.lastLessonByBook || {},
      quizHistory: Array.isArray(data.quizHistory) ? data.quizHistory : []
    };
    if (!result.books.find(b => b.id === result.activeBookId)) result.activeBookId = result.books[0]?.id || null;
    const ab = result.books.find(b => b.id === result.activeBookId);
    if (ab && !ab.lessons.find(l => l.id === result.activeLessonId)) result.activeLessonId = ab.lessons[0]?.id || null;
    return result;
  }
  const books = [];
  if (typeof data === 'object' && data !== null) {
    const specialKeys = ['activeBookId', 'activeLessonId', 'books', 'lastLessonByBook', 'quizHistory'];
    const realBooks = Object.keys(data).filter(k => !specialKeys.includes(k) && typeof data[k] === 'object');
    realBooks.forEach(bookName => {
      const lessonsData = data[bookName];
      if (!lessonsData || typeof lessonsData !== 'object') return;
      const lessons = [];
      if (Array.isArray(lessonsData.lessons)) {
        lessonsData.lessons.forEach((l, i) => {
          const nl = normalizeLesson(l, 'درس ' + (i+1));
          if (nl) lessons.push(nl);
        });
      } else {
        Object.keys(lessonsData).forEach(lessonName => {
          const nl = normalizeLesson(lessonsData[lessonName], lessonName);
          if (nl) { nl.title = lessonName; lessons.push(nl); }
        });
      }
      if (lessons.length) books.push({ id: uid(), name: bookName, level: 'A1.1', coverImage: '', lessons });
    });
  }
  if (!books.length) return null;
  return { books, activeBookId: books[0].id, activeLessonId: books[0].lessons[0]?.id || null, lastLessonByBook: {}, quizHistory: [] };
}
function load(){
  const migrated = tryMigrateLegacy();
  if (migrated) {
    migrated.books.forEach(b => {
      // ✅ فقط اگه کتاب هیچ درسی نداره، درس نمونه اضافه کن
      if (!Array.isArray(b.lessons) || !b.lessons.length) {
        ensureSingleSampleLesson(b);
      }
    });
    return migrated;
  }
  // ✅ اگر STORAGE_KEY وجود داره ولی books خالیه (همه کتاب‌ها حذف شده)، default نساز
  const currentRaw = localStorage.getItem(STORAGE_KEY);
  if (currentRaw !== null) {
    try {
      const d = JSON.parse(currentRaw);
      if (d && typeof d === 'object' && Array.isArray(d.books)) {
        if (!d.lastLessonByBook) d.lastLessonByBook = {};
        if (!Array.isArray(d.quizHistory)) d.quizHistory = [];
        return d;
      }
    } catch(e){}
  }
  // فقط اگه STORAGE_KEY اصلاً وجود نداره (اولین اجرا)، default بساز
  return defaultData();
}
function save(){
  if (!state.lastLessonByBook) state.lastLessonByBook = {};
  if (state.activeBookId && state.activeLessonId) {
    state.lastLessonByBook[state.activeBookId] = state.activeLessonId;
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e){ console.error(e); }
}

/* ============================================================
   HELPERS
   ============================================================ */
function getBook(id){ return state.books.find(b => b.id === (id || state.activeBookId)); }
function getLesson(id){
  const b = getBook();
  if (!b) return null;
  return b.lessons.find(l => l.id === (id || state.activeLessonId));
}
function getLessonById(lessonId){
  const b = getBook();
  if (!b) return null;
  return b.lessons.find(l => l.id === lessonId) || null;
}
function getWords(){ const l = getLesson(); return l ? l.words : []; }
function getStories(){ const l = getLesson(); return l ? l.stories : []; }

function getDueWords(book){
  book = book || getBook();
  if (!book) return [];
  const now = Date.now();
  const due = [];
  (book.lessons || []).forEach(l => {
    (l.words || []).forEach(w => {
      const s = ensureSrs(w);
      if (!s.nextReview || s.nextReview <= now) due.push({ word: w, lessonTitle: l.title });
    });
  });
  return due;
}

/* ============================================================
   SRS
   ============================================================ */
const SRS_INTERVALS = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };
function ensureSrs(w){
  if (!w.srs) w.srs = { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0 };
  return w.srs;
}
function reviewWord(w, rating){
  const s = ensureSrs(w);
  if (rating === 'good') {
    s.box = Math.min(5, s.box + 1);
    s.correctCount++;
    w.status = s.box >= 4 ? 'good' : 'learning';
  } else if (rating === 'medium') {
    s.correctCount++;
    w.status = 'learning';
  } else {
    s.box = 1;
    s.wrongCount++;
    w.status = 'bad';
  }
  s.nextReview = Date.now() + SRS_INTERVALS[s.box] * 86400000;
  s.lastRating = rating;
  save();
}
function undoReviewWord(w){
  const s = ensureSrs(w);
  const prev = s.lastRating;
  if (!prev) return;
  if (prev === 'good') {
    s.box = Math.max(1, s.box - 1);
    s.correctCount = Math.max(0, s.correctCount - 1);
  } else if (prev === 'medium') {
    s.correctCount = Math.max(0, s.correctCount - 1);
  } else if (prev === 'bad') {
    s.wrongCount = Math.max(0, s.wrongCount - 1);
  }
  if (s.box >= 4) w.status = 'good';
  else if (s.box >= 2) w.status = 'learning';
  else if (s.wrongCount > 0) w.status = 'bad';
  else w.status = 'new';
  s.nextReview = Date.now();
  s.lastRating = null;
  save();
}

function highlightExample(sentenceDe, wordDe){
  if (!sentenceDe || !wordDe) return esc(sentenceDe || '');
  const escaped = wordDe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = sentenceDe.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map(part => {
    if (part.toLowerCase() === wordDe.toLowerCase()) {
      return `<span class="ex-highlight">${esc(part)}</span>`;
    }
    return esc(part);
  }).join('');
}

/* ============================================================
   BOOK LIBRARY
   ============================================================ */
function showBookLibrary(){
  document.getElementById('bookLibraryScreen').classList.remove('hidden');
  document.getElementById('mainApp').classList.add('hidden');
  document.body.classList.remove('locked');
  renderBookLibrary();
}
function showMainApp(){
  document.getElementById('bookLibraryScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  updateAppTitle();
  renderAll();
  updateReviewBanner();
}
function updateAppTitle(){
  const book = getBook();
  const el = document.getElementById('appTitle');
  if (!el) return;
  if (book) {
    el.textContent = '📖 ' + book.name + (book.level ? ' — ' + book.level : '');
  } else {
    el.textContent = '🎓 German Vocab Pro';
  }
}

function updateReviewBanner(){
  const banner = document.getElementById('reviewBanner');
  if (!banner) return;
  const due = getDueWords();
  if (due.length === 0) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  banner.innerHTML = `
    <div class="review-banner-inner">
      <div class="review-banner-text">
        <span class="review-icon">📅</span>
        <span><strong>${due.length}</strong> کلمه برای مرور امروز آماده‌ست!</span>
      </div>
      <button class="btn btn-primary btn-sm" id="startDailyReviewBtn">🚀 شروع مرور</button>
    </div>
  `;
  const btn = document.getElementById('startDailyReviewBtn');
  if (btn) btn.addEventListener('click', startDailyReview);
}

function startDailyReview(){
  const due = getDueWords();
  if (!due.length) { toast('کلمه‌ای برای مرور نیست!', 'warning'); return; }
  const words = due.map(d => d.word);
  practice.active = true;
  practice.queue = shuffle(words);
  practice.index = 0;
  practice.ratings = {};
  switchTab('practice');
  document.getElementById('practiceFolderView').classList.add('hidden');
  document.getElementById('practiceSession').classList.remove('hidden');
  showCurrentPracticeCard();
}

function renderBookLibrary(){
  const grid = document.getElementById('bookCardsGrid');
  if (!grid) return;
  if (!state.books.length) {
    grid.innerHTML = `<div class="empty-library">
      <div class="empty-icon">📚</div>
      <div>هنوز کتابی نداری</div>
      <div style="font-size:13px;margin-top:8px;">با دکمه «➕ کتاب جدید» شروع کن</div>
    </div>`;
    return;
  }
  grid.innerHTML = state.books.map(book => {
    const coverImage = safeImageSrc(book.coverImage);
    const level = book.level || 'A1.1';
    const totalLessons = (book.lessons || []).length;
    const totalWords = (book.lessons || []).reduce((s, l) => s + ((l.words || []).length), 0);
    const totalStories = (book.lessons || []).reduce((s, l) => s + ((l.stories || []).length), 0);
    let mastered = 0;
    (book.lessons || []).forEach(l => {
      (l.words || []).forEach(w => { if (normalizeStatus(w) === 'good') mastered++; });
    });
    const pct = totalWords ? Math.round((mastered / totalWords) * 100) : 0;
    return `<div class="book-card-library" data-book-id="${esc(book.id)}">
      <button class="book-card-edit" data-lib-edit="${esc(book.id)}" title="ویرایش">✏️</button>
      <button class="book-card-download" data-lib-download="${esc(book.id)}" title="دانلود کتاب">⬇️</button>
      <button class="book-card-delete" data-lib-del="${esc(book.id)}" title="حذف">🗑</button>
      <div class="book-cover-wrap">
        ${coverImage
          ? `<img src="${esc(coverImage)}" alt="${esc(book.name)}">`
          : `<div class="book-cover-placeholder">
              <div class="book-icon">📖</div>
              <div class="book-name">${esc(book.name)}</div>
            </div>`}
        <span class="book-level-badge">${esc(level)}</span>
      </div>
      <div class="book-card-body">
        <h3 class="book-card-title">${esc(book.name)}</h3>
        <div class="book-card-stats">
          <span class="book-stat"><span class="stat-icon">📝</span> ${totalWords} کلمه</span>
          <span class="book-stat"><span class="stat-icon">📚</span> ${totalLessons} درس</span>
          ${totalStories ? `<span class="book-stat"><span class="stat-icon">📖</span> ${totalStories} داستان</span>` : ''}
        </div>
        <div class="book-card-progress">
          <div class="book-progress-label"><span>تسلط</span><span>${pct}٪</span></div>
          <div class="book-progress-bar">
            <div class="book-progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('[data-book-id]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('[data-lib-del]') || e.target.closest('[data-lib-edit]') || e.target.closest('[data-lib-download]')) return;
      openBook(card.dataset.bookId);
    });
  });
  grid.querySelectorAll('[data-lib-edit]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openEditBookModal(btn.dataset.libEdit);
    });
  });
  grid.querySelectorAll('[data-lib-download]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const bookId = btn.dataset.libDownload;
      const book = state.books.find(b => b.id === bookId);
      if (!book) return;
      exportData(book, `${book.name}-${book.level || 'A1.1'}.json`);
      toast(`⬇️ «${book.name}» دانلود شد`, 'success');
    });
  });
  grid.querySelectorAll('[data-lib-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const bookId = btn.dataset.libDel;
      const book = state.books.find(b => b.id === bookId);
      if (!book) return;
      const totalWords = (book.lessons || []).reduce((s, l) => s + ((l.words || []).length), 0);
      const msg = `⚠️ حذف کتاب «${book.name}»\n\nاین کار شامل:\n• ${(book.lessons || []).length} درس\n• ${totalWords} کلمه\n• همه داستان‌ها و آمار SRS\n\nبرگشت‌پذیر نیست. مطمئنی؟`;
      if (!confirm(msg)) return;
      state.books = state.books.filter(b => b.id !== bookId);
      if (state.activeBookId === bookId) {
        state.activeBookId = state.books[0]?.id || null;
        const nb = getBook();
        state.activeLessonId = nb?.lessons[0]?.id || null;
      }
      save();
      // ✅ legacy رو پاک کن تا کتاب حذف‌شده برنگرده
      LEGACY_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch(e){} });
      renderBookLibrary();
      toast(`🗑 «${book.name}» حذف شد`, 'success');
    });
  });
}

function openBook(bookId){
  const book = state.books.find(b => b.id === bookId);
  if (!book) return;
  // ✅ اگر تمرین فعاله، خارج شو
  if (practice.active) exitPractice();

  state.activeBookId = bookId;
  // ✅ آخرین درس این کتاب رو بازیابی کن
  const savedLessonId = state.lastLessonByBook && state.lastLessonByBook[bookId];
  if (savedLessonId && book.lessons.find(l => l.id === savedLessonId)) {
    state.activeLessonId = savedLessonId;
  } else {
    state.activeLessonId = book.lessons[0]?.id || null;
  }
  save();
  showMainApp();
  renderAll();
  populateLessonTargets();
}

/* ============================================================
   IMPORT BOOK POPUP
   ============================================================ */
function openImportBookPopup(pending){
  pendingBookData = pending;
  let booksCount = 0, lessonsCount = 0, wordsCount = 0, storiesCount = 0, firstBookName = '';
  if (pending.type === 'single') {
    const b = pending.data;
    booksCount = 1;
    lessonsCount = b.lessons.length;
    b.lessons.forEach(l => { wordsCount += l.words.length; storiesCount += l.stories.length; });
    firstBookName = b.name;
  } else if (pending.type === 'multi') {
    booksCount = pending.data.length;
    pending.data.forEach(b => {
      lessonsCount += b.lessons.length;
      b.lessons.forEach(l => { wordsCount += l.words.length; storiesCount += l.stories.length; });
    });
    firstBookName = pending.data[0]?.name || '';
  }
  const info = document.getElementById('importBookInfo');
  info.innerHTML = `
    <div class="import-info-row"><span class="label">📦 تعداد کتاب:</span><span class="value">${booksCount}</span></div>
    <div class="import-info-row"><span class="label">📚 تعداد درس:</span><span class="value">${lessonsCount}</span></div>
    <div class="import-info-row"><span class="label">📝 تعداد کلمات:</span><span class="value">${wordsCount}</span></div>
    ${storiesCount ? `<div class="import-info-row"><span class="label">📖 تعداد داستان:</span><span class="value">${storiesCount}</span></div>` : ''}
    ${firstBookName ? `<div class="import-info-row"><span class="label">🏷 نام:</span><span class="value">${esc(firstBookName)}${booksCount > 1 ? ' و ...' : ''}</span></div>` : ''}
  `;
  document.getElementById('modalImportBook').classList.add('active');
  document.body.classList.add('locked');
}
function closeImportBookPopup(){
  document.getElementById('modalImportBook').classList.remove('active');
  document.body.classList.remove('locked');
  pendingBookData = null;
}
function chooseImportAsNewBook(){
  if (!pendingBookData) return;
  document.getElementById('modalImportBook').classList.remove('active');
  const data = pendingBookData;
  if (data.type === 'single') {
    document.getElementById('newBookNameInput').value = data.data.name || '';
    document.getElementById('newBookLevelInput').value = data.data.level || 'A1.1';
    document.getElementById('newBookCoverInput').value = data.data.coverImage || '';
  } else {
    document.getElementById('newBookNameInput').value = data.data[0]?.name || '';
    document.getElementById('newBookLevelInput').value = data.data[0]?.level || 'A1.1';
    document.getElementById('newBookCoverInput').value = data.data[0]?.coverImage || '';
  }
  let lessonsCount = 0, wordsCount = 0;
  if (data.type === 'single') {
    lessonsCount = data.data.lessons.length;
    data.data.lessons.forEach(l => { wordsCount += l.words.length; });
  } else {
    data.data.forEach(b => {
      lessonsCount += b.lessons.length;
      b.lessons.forEach(l => { wordsCount += l.words.length; });
    });
  }
  document.getElementById('newBookStatsPreview').innerHTML = `
    <div>📚 ${lessonsCount} درس</div>
    <div>📝 ${wordsCount} کلمه</div>
  `;
  document.getElementById('modalNewBookFromImport').classList.add('active');
}
function confirmNewBookFromImport(){
  if (!pendingBookData) return;
  const name = document.getElementById('newBookNameInput').value.trim();
  const level = document.getElementById('newBookLevelInput').value;
  const coverImage = safeImageSrc(document.getElementById('newBookCoverInput').value.trim());
  if (!name) { toast('نام کتاب لازمه', 'error'); return; }
  let newBooks = [];
  if (pendingBookData.type === 'single') {
    const b = { ...pendingBookData.data };
    b.id = uid(); b.name = name; b.level = level; b.coverImage = coverImage;
    newBooks = [b];
  } else {
    pendingBookData.data.forEach((b, idx) => {
      const nb = { ...b };
      nb.id = uid();
      if (idx === 0) { nb.name = name; nb.level = level; nb.coverImage = coverImage; }
      newBooks.push(nb);
    });
  }
  newBooks.forEach(nb => {
    // ✅ فقط یک درس نمونه
    ensureSingleSampleLesson(nb);
  });
  newBooks.forEach(nb => state.books.push(nb));
  state.activeBookId = newBooks[0].id;
  state.activeLessonId = newBooks[0].lessons[0]?.id;
  save();
  document.getElementById('modalNewBookFromImport').classList.remove('active');
  document.body.classList.remove('locked');
  pendingBookData = null;
  renderAll(); populateLessonTargets();
  showBookLibrary();
  toast(`✅ ${newBooks.length} کتاب اضافه شد (با درس نمونه)`, 'success');
}
function chooseImportAsReplace(){
  if (!pendingBookData) return;
  document.getElementById('modalImportBook').classList.remove('active');
  if (!state.books.length) {
    toast('کتابی برای جایگزینی وجود نداره', 'warning');
    closeImportBookPopup();
    return;
  }
  const sel = document.getElementById('replaceTargetSelect');
  sel.innerHTML = state.books.map(b => {
    const totalWords = (b.lessons || []).reduce((s, l) => s + ((l.words || []).length), 0);
    return `<option value="${b.id}">${esc(b.name)} — ${esc(b.level)} (${totalWords} کلمه)</option>`;
  }).join('');
  document.getElementById('modalReplaceTargetBook').classList.add('active');
}
function confirmReplaceBook(){
  if (!pendingBookData) return;
  const targetId = document.getElementById('replaceTargetSelect').value;
  const targetBook = state.books.find(b => b.id === targetId);
  if (!targetBook) { toast('کتاب مقصد پیدا نشد', 'error'); return; }
  let sourceLessons = [];
  let sourceCover = targetBook.coverImage;
  let sourceLevel = targetBook.level;
  if (pendingBookData.type === 'single') {
    sourceLessons = pendingBookData.data.lessons;
    if (pendingBookData.data.coverImage) sourceCover = pendingBookData.data.coverImage;
    if (pendingBookData.data.level) sourceLevel = pendingBookData.data.level;
  } else {
    pendingBookData.data.forEach(b => { sourceLessons = sourceLessons.concat(b.lessons); });
  }
  const newLessons = sourceLessons
    .filter(l => !l.isSample)  // ✅ درس‌های نمونه قدیمی رو حذف کن
    .map(l => ({
      id: uid(),
      title: l.title || 'درس',
      words: (l.words || []).map(w => ({ ...w, id: w.id || uid() })),
      stories: (l.stories || []).map(s => ({ ...s, id: s.id || uid() })),
      isSample: false
    }));
  // ✅ فقط یک درس نمونه
  const sampleLesson = makeSampleLesson();
  targetBook.lessons = [sampleLesson, ...newLessons];
  targetBook.coverImage = sourceCover;
  targetBook.level = sourceLevel;
  state.activeBookId = targetBook.id;
  state.activeLessonId = sampleLesson.id;
  save();
  document.getElementById('modalReplaceTargetBook').classList.remove('active');
  document.body.classList.remove('locked');
  pendingBookData = null;
  renderAll(); populateLessonTargets();
  toast(`✅ «${targetBook.name}» جایگزین شد (درس نمونه حفظ شد)`, 'success');
}

/* ============================================================
   WORD VIEW
   ============================================================ */
function openWordView(wordId){
  const word = getWords().find(w => w.id === wordId);
  if (!word) { toast('کلمه پیدا نشد', 'error'); return; }
  const modal = document.getElementById('wordViewModal');
  const content = document.getElementById('wordViewContent');
  const notes = word.notes || [];
  const st = normalizeStatus(word);
  const srs = ensureSrs(word);
  const statusLabels = { new: 'جدید ⚪', learning: 'در یادگیری 🟡', good: 'مسلط 🟢', bad: 'بلد نیستم ❌' };
  const wt = getWordType(word);
  const forms = word.forms || {};
  const synonyms = word.synonyms || [];
  const related = word.related || [];
  const extraExamples = word.extraExamples || [];
  const formLabels = { present: 'حال', past: 'گذشته', perfect: 'ماضی نقلی', future: 'آینده', imperative: 'امری', participle: 'اسم مفعول' };
  const hasEx = word.ex && word.ex.trim();
  const hasExAudio = word.exAudio && word.exAudio.trim();

  let html = `
    <button class="word-view-close" id="wvClose">✕</button>
    <button class="word-view-edit-btn" id="wvEdit">✏️ ادیت</button>
    <button class="word-view-delete-btn" id="wvDelete">🗑 حذف</button>
    <div class="word-view-header">
      ${word.art && word.art !== '–' ? `<span class="word-view-art ${articleClass(word.art)}">${esc(word.art)}</span>` : ''}
      <span class="word-view-de">${esc(word.de)}</span>
      ${word.plural && word.plural !== '–' ? `<span class="word-view-plural">جمع: ${esc(word.plural)}</span>` : ''}
    </div>
    <div class="word-view-fa">${esc(word.fa)}</div>
    <div class="word-view-actions-row">
      <span class="word-type-badge ${wt.type}">${wt.icon} ${wt.label}</span>
      <button class="btn btn-sm btn-primary" id="wvSpeak">🔊 تلفظ</button>
      <button class="btn btn-sm" id="wvMuteToggle" title="پخش خودکار صدا هنگام باز شدن کارت" style="background:${autoPlayWord ? 'var(--accent)' : 'var(--bg-3)'};color:#fff;border-color:transparent;">${autoPlayWord ? '🔊 خودکار' : '🔇 سایلنت'}</button>
      <span class="btn btn-sm" style="background:${st === 'good' ? 'var(--accent)' : st === 'learning' ? 'var(--warning)' : st === 'bad' ? 'var(--danger)' : 'var(--bg-3)'};color:#fff;border-color:transparent;cursor:default;">${statusLabels[st] || st}</span>
      <span class="btn btn-sm" style="background:var(--bg-3);cursor:default;">📦 جعبه ${srs.box}</span>
    </div>
  `;

  if (hasEx) {
    html += `<div class="word-view-example">
      <div class="word-view-example-de">
        <span class="ex-text">${highlightExample(word.ex, word.de)}</span>
        <button class="ex-speak-btn ${hasExAudio ? 'has-audio' : ''}" data-wv-speak-ex="${esc(word.ex)}" data-wv-audio="${esc(word.exAudio || '')}">${hasExAudio ? '🎵' : '🔊'}</button>
      </div>
      ${word.exMean ? `<div class="word-view-example-fa">${esc(word.exMean)}</div>` : ''}
    </div>`;
  }

  const formsKeys = Object.keys(forms).filter(k => forms[k] && String(forms[k]).trim());
  if (formsKeys.length) {
    html += `<div class="word-view-section">
      <h4>🔤 صرف فعل</h4>
      <div class="conjugation-grid">`;
    formsKeys.forEach(key => {
      html += `<div class="conj-row">
        <span class="conj-label">${esc(formLabels[key] || key)}</span>
        <span class="conj-value">${esc(forms[key])}</span>
      </div>`;
    });
    html += `</div></div>`;
  }

  if (synonyms.length) {
    html += `<div class="word-view-section" style="border-right-color:var(--accent);">
      <h4>🔗 مترادف‌ها</h4>
      <div class="chips-list">${synonyms.map(s => `<span class="chip synonym">${esc(s)}</span>`).join('')}</div>
    </div>`;
  }
  if (related.length) {
    html += `<div class="word-view-section" style="border-right-color:var(--purple);">
      <h4>📎 کلمات مرتبط</h4>
      <div class="chips-list">${related.map(s => `<span class="chip related">${esc(s)}</span>`).join('')}</div>
    </div>`;
  }
  if (extraExamples.length) {
    html += `<div class="word-view-section" style="border-right-color:var(--warning);">
      <h4>📚 جملات بیشتر (${extraExamples.length})</h4>
      <div class="extra-examples-list">
        ${extraExamples.map(ex => {
          const deText = typeof ex === 'string' ? ex : ex.de;
          const faText = typeof ex === 'string' ? '' : ex.fa;
          const audioUrl = typeof ex === 'string' ? '' : (ex.audio || '');
          return `<div class="extra-example-item">
            <div class="extra-example-de">
              <span class="ex-text">${highlightExample(deText, word.de)}</span>
              <button class="ex-speak-btn ${audioUrl ? 'has-audio' : ''}" data-wv-extra="${esc(deText)}" data-wv-extra-audio="${esc(audioUrl)}">${audioUrl ? '🎵' : '🔊'}</button>
            </div>
            ${faText ? `<div class="extra-example-fa">${esc(faText)}</div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }
  if (word.note) {
    html += `<div class="word-view-section" style="border-right-color:var(--info);">
      <h4>📝 یادداشت</h4>
      <div style="font-size:14px;line-height:1.7;color:var(--text);">${esc(word.note)}</div>
    </div>`;
  }
  if (notes.length) {
    html += `<div class="word-view-section" style="border-right-color:var(--warning);">
      <h4>💡 نکات (${notes.length})</h4>
      <div class="notes-inline-list">${notes.map(n => `<div class="note-inline-item">${esc(n)}</div>`).join('')}</div>
    </div>`;
  }

  content.innerHTML = html;
  modal.classList.add('active');
  document.body.classList.add('locked');

  document.getElementById('wvClose').addEventListener('click', () => {
    modal.classList.remove('active');
    document.body.classList.remove('locked');
  });
  document.getElementById('wvEdit').addEventListener('click', () => {
    modal.classList.remove('active');
    document.body.classList.remove('locked');
    openWordEdit(word.id);
  });
  document.getElementById('wvDelete').addEventListener('click', () => {
    if (!confirm(`حذف «${word.de}»؟`)) return;
    const l = getLesson();
    l.words = l.words.filter(x => x.id !== word.id);
    save();
    modal.classList.remove('active');
    document.body.classList.remove('locked');
    renderAll(); populateLessonTargets();
    toast('🗑 حذف شد', 'success');
  });
  document.getElementById('wvSpeak').addEventListener('click', () => speakTTS(word.de));

  const muteBtn = document.getElementById('wvMuteToggle');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      autoPlayWord = !autoPlayWord;
      try { localStorage.setItem(AUTOPLAY_KEY, String(autoPlayWord)); } catch(e){}
      updateAutoPlayUI();
      muteBtn.textContent = autoPlayWord ? '🔊 خودکار' : '🔇 سایلنت';
      muteBtn.style.background = autoPlayWord ? 'var(--accent)' : 'var(--bg-3)';
      toast(autoPlayWord ? '🔊 پخش خودکار روشن شد' : '🔇 پخش خودکار خاموش شد', autoPlayWord ? 'success' : 'warning');
    });
  }

  content.querySelectorAll('[data-wv-speak-ex]').forEach(btn => {
    btn.addEventListener('click', () => speak(btn.dataset.wvSpeakEx, btn.dataset.wvAudio));
  });
  content.querySelectorAll('[data-wv-extra]').forEach(btn => {
    btn.addEventListener('click', () => speak(btn.dataset.wvExtra, btn.dataset.wvExtraAudio));
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) {
      modal.classList.remove('active');
      document.body.classList.remove('locked');
    }
  }, { once: true });

  if (autoPlayWord) {
    setTimeout(() => speakTTS(word.de), 200);
  }
}

/* ============================================================
   WORD EDIT
   ============================================================ */
function openWordEdit(wordId){
  const word = getWords().find(w => w.id === wordId);
  if (!word) { toast('کلمه پیدا نشد', 'error'); return; }
  const modal = document.getElementById('wordEditModal');
  const content = document.getElementById('wordEditContent');
  const forms = word.forms || {};
  const formLabels = { present: 'حال', past: 'گذشته', perfect: 'ماضی نقلی', future: 'آینده', imperative: 'امری', participle: 'اسم مفعول' };
  const synonyms = (word.synonyms || []).join(', ');
  const related = (word.related || []).join(', ');
  const notes = (word.notes || []).join('\n');
  const extraExamples = (word.extraExamples || []).map(ex => {
    const de = typeof ex === 'string' ? ex : ex.de;
    const fa = typeof ex === 'string' ? '' : ex.fa;
    return de + ' | ' + fa;
  }).join('\n');

  let html = `
    <div class="word-edit-header">
      <h3>✏️ ویرایش کامل لغت</h3>
      <button class="word-edit-close" id="weClose">✕</button>
    </div>

    <div class="word-edit-form-group">
      <h4>📝 اطلاعات اصلی</h4>
      <div class="word-edit-row">
        <div class="word-edit-field">
          <label>کلمه آلمانی *</label>
          <input id="weDe" value="${esc(word.de || '')}" dir="ltr">
        </div>
        <div class="word-edit-field">
          <label>نوع کلمه</label>
          <select id="weArt">
            <option value="–" ${word.art === '–' ? 'selected' : ''}>–</option>
            <option value="der" ${word.art === 'der' ? 'selected' : ''}>der</option>
            <option value="die" ${word.art === 'die' ? 'selected' : ''}>die</option>
            <option value="das" ${word.art === 'das' ? 'selected' : ''}>das</option>
            <option value="Verb" ${word.art === 'Verb' ? 'selected' : ''}>Verb</option>
            <option value="Adj" ${word.art === 'Adj' ? 'selected' : ''}>Adj</option>
            <option value="Adv" ${word.art === 'Adv' ? 'selected' : ''}>Adv</option>
          </select>
        </div>
      </div>
      <div class="word-edit-row">
        <div class="word-edit-field">
          <label>جمع</label>
          <input id="wePlural" value="${esc(word.plural || '')}" dir="ltr">
        </div>
        <div class="word-edit-field">
          <label>ترجمه فارسی *</label>
          <input id="weFa" value="${esc(word.fa || '')}">
        </div>
      </div>
    </div>

    <div class="word-edit-form-group">
      <h4>📌 جمله مثال</h4>
      <div class="word-edit-field">
        <label>جمله آلمانی</label>
        <input id="weEx" value="${esc(word.ex || '')}" dir="ltr">
      </div>
      <div class="word-edit-field">
        <label>ترجمه جمله</label>
        <input id="weExMean" value="${esc(word.exMean || '')}">
      </div>
      <div class="word-edit-field">
        <label>🎵 لینک صوتی جمله</label>
        <input id="weExAudio" value="${esc(word.exAudio || '')}" dir="ltr">
      </div>
    </div>

    <div class="word-edit-form-group">
      <h4>🔤 صرف فعل</h4>
      ${Object.keys(formLabels).map(key => `
        <div class="word-edit-field">
          <label>${formLabels[key]}</label>
          <input id="weForm_${key}" value="${esc(forms[key] || '')}" dir="ltr">
        </div>
      `).join('')}
    </div>

    <div class="word-edit-form-group">
      <h4>🔗 مترادف‌ها (با کاما جدا کن)</h4>
      <div class="word-edit-field">
        <input id="weSynonyms" value="${esc(synonyms)}" dir="ltr" placeholder="toll, super, klasse">
      </div>
    </div>

    <div class="word-edit-form-group">
      <h4>📎 کلمات مرتبط (با کاما جدا کن)</h4>
      <div class="word-edit-field">
        <input id="weRelated" value="${esc(related)}" dir="ltr" placeholder="Apfel, Obst">
      </div>
    </div>

    <div class="word-edit-form-group">
      <h4>📚 جملات بیشتر (هر خط: آلمانی | فارسی)</h4>
      <div class="word-edit-field">
        <textarea id="weExtraExamples" dir="ltr" placeholder="Ich esse einen Apfel. | من یک سیب می‌خورم.">${esc(extraExamples)}</textarea>
      </div>
    </div>

    <div class="word-edit-form-group">
      <h4>📝 یادداشت</h4>
      <div class="word-edit-field">
        <textarea id="weNote">${esc(word.note || '')}</textarea>
      </div>
    </div>

    <div class="word-edit-form-group">
      <h4>💡 نکات (هر خط یک نکته)</h4>
      <div class="word-edit-field">
        <textarea id="weNotes">${esc(notes)}</textarea>
      </div>
    </div>

    <div class="word-edit-actions">
      <button class="btn btn-primary" id="weSave">💾 ذخیره تغییرات</button>
      <button class="btn" id="weCancel">لغو</button>
    </div>
  `;

  content.innerHTML = html;
  modal.classList.add('active');
  document.body.classList.add('locked');

  document.getElementById('weClose').addEventListener('click', closeWordEdit);
  document.getElementById('weCancel').addEventListener('click', closeWordEdit);

  document.getElementById('weSave').addEventListener('click', () => {
    const de = document.getElementById('weDe').value.trim();
    const fa = document.getElementById('weFa').value.trim();
    if (!de || !fa) { toast('کلمه و ترجمه لازمه', 'error'); return; }
    word.de = de;
    word.art = document.getElementById('weArt').value;
    word.plural = document.getElementById('wePlural').value.trim() || '–';
    word.fa = fa;
    word.ex = document.getElementById('weEx').value.trim();
    word.exMean = document.getElementById('weExMean').value.trim();
    word.exAudio = document.getElementById('weExAudio').value.trim();
    word.forms = {};
    Object.keys(formLabels).forEach(key => {
      const val = document.getElementById('weForm_' + key).value.trim();
      if (val) word.forms[key] = val;
    });
    word.synonyms = document.getElementById('weSynonyms').value.split(',').map(s => s.trim()).filter(Boolean);
    word.related = document.getElementById('weRelated').value.split(',').map(s => s.trim()).filter(Boolean);
    const extraLines = document.getElementById('weExtraExamples').value.split(/\r?\n/);
    const extra = [];
    extraLines.forEach(line => {
      if (!line.trim()) return;
      const sep = line.indexOf('|');
      if (sep < 1) return;
      extra.push({ de: line.slice(0, sep).trim(), fa: line.slice(sep + 1).trim() });
    });
    word.extraExamples = extra;
    word.note = document.getElementById('weNote').value.trim();
    word.notes = document.getElementById('weNotes').value.split(/\r?\n/).map(n => n.trim()).filter(Boolean);
    save();
    closeWordEdit();
    renderAll(); populateLessonTargets();
    toast('✅ تغییرات ذخیره شد', 'success');
  });

  modal.addEventListener('click', e => {
    if (e.target === modal) closeWordEdit();
  }, { once: true });
}
function closeWordEdit(){
  document.getElementById('wordEditModal').classList.remove('active');
  document.body.classList.remove('locked');
}

/* ============================================================
   POPULATE TARGETS
   ============================================================ */
function populateLessonTargets(){
  const selectors = ['wordTargetLesson', 'storyTargetLesson', 'jsonTargetLesson', 'fileTargetLesson'];
  const b = getBook();
  selectors.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    if (!b || !b.lessons.length) {
      sel.innerHTML = '<option value="">— درسی وجود ندارد —</option>';
      return;
    }
    const currentValue = sel.value;
    sel.innerHTML = b.lessons.map(l => {
      const count = (l.words || []).length;
      const storyCount = (l.stories || []).length;
      const info = id === 'storyTargetLesson' ? `${storyCount} داستان` : `${count} کلمه`;
      const sampleBadge = l.isSample ? ' 🔒' : '';
      return `<option value="${l.id}">${esc(l.title)}${sampleBadge} (${info})</option>`;
    }).join('');
    if (currentValue && b.lessons.find(l => l.id === currentValue)) {
      sel.value = currentValue;
    } else if (state.activeLessonId && b.lessons.find(l => l.id === state.activeLessonId)) {
      sel.value = state.activeLessonId;
    }
  });
}

/* ============================================================
   RENDER: BOOK / LESSON SELECT
   ============================================================ */
function renderBookSelect(){
  const sel = document.getElementById('bookSelect');
  if (!sel) return;
  sel.innerHTML = state.books.map(b =>
    `<option value="${b.id}" ${b.id===state.activeBookId?'selected':''}>${esc(b.name)} — ${esc(b.level)}</option>`
  ).join('');
  const delBtn = document.getElementById('delBookBtn');
  if (delBtn) delBtn.disabled = state.books.length === 0;
  updateAppTitle();
}
function renderLessonSelect(){
  const b = getBook();
  const sel = document.getElementById('lessonSelect');
  if (!sel) return;
  if (!b || !b.lessons.length) {
    sel.innerHTML = '<option value="">— بدون درس —</option>';
    const delBtn = document.getElementById('delLessonBtn');
    if (delBtn) delBtn.disabled = true;
    updateAppTitle();
    return;
  }
  sel.innerHTML = b.lessons.map(l =>
    `<option value="${l.id}" ${l.id===state.activeLessonId?'selected':''}>${l.isSample ? '🔒 ' : ''}${esc(l.title)} (${(l.words||[]).length})</option>`
  ).join('');
  const delBtn = document.getElementById('delLessonBtn');
  if (delBtn) delBtn.disabled = false;
  updateAppTitle();
}

/* ============================================================
   RENDER: STATS
   ============================================================ */
function renderStats(){
  const words = getWords();
  const now = Date.now();
  let counts = { new: 0, learning: 0, good: 0, bad: 0, due: 0 };
  words.forEach(w => {
    const st = normalizeStatus(w);
    if (counts[st] !== undefined) counts[st]++;
    else counts.new++;
    const s = ensureSrs(w);
    if (!s.nextReview || s.nextReview <= now) counts.due++;
  });
  const total = words.length;
  const pct = total ? Math.round((counts.good/total)*100) : 0;
  const sg = document.getElementById('statsGrid');
  if (sg) sg.innerHTML = `
    <div class="stat-box total"><span class="num">${total}</span><span class="lbl">کل</span></div>
    <div class="stat-box new"><span class="num">${counts.new}</span><span class="lbl">جدید</span></div>
    <div class="stat-box learning"><span class="num">${counts.learning}</span><span class="lbl">در یادگیری</span></div>
    <div class="stat-box good"><span class="num">${counts.good}</span><span class="lbl">مسلط</span></div>
    <div class="stat-box bad"><span class="num">${counts.bad}</span><span class="lbl">بلد نیستم</span></div>
    <div class="stat-box due"><span class="num">${counts.due}</span><span class="lbl">مرور امروز</span></div>
  `;
  const lp = document.getElementById('lessonProgress');
  if (lp) lp.style.width = pct + '%';
  const pt = document.getElementById('progressText');
  if (pt) pt.textContent = `${pct}٪ تسلط (${counts.good} از ${total})`;
}

/* ============================================================
   RENDER: WORD TABLE
   ============================================================ */
function renderWordTable(){
  const search = (document.getElementById('searchBox').value || '').toLowerCase();
  const filter = document.getElementById('filterStatus').value;
  let words = getWords().slice();
  if (search) words = words.filter(w =>
    (w.de||'').toLowerCase().includes(search) ||
    (w.fa||'').toLowerCase().includes(search)
  );
  if (filter !== 'all') words = words.filter(w => normalizeStatus(w) === filter);
  const cont = document.getElementById('wordTableContainer');
  if (!cont) return;
  if (!words.length) {
    cont.innerHTML = `<div class="empty">${getWords().length ? 'نتیجه‌ای پیدا نشد' : 'هنوز کلمه‌ای نداری.'}</div>`;
    return;
  }
  const rows = words.map(w => {
    const hasAudio = w.exAudio && w.exAudio.trim();
    return `<tr data-id="${w.id}">
      <td class="de">${esc(w.de)}</td>
      <td class="sound-cell"><button class="speak-btn ${hasAudio ? 'has-audio' : ''}" data-speak="${esc(w.de)}" data-audio="${esc(w.exAudio || '')}">${hasAudio ? '🎵' : '🔊'}</button></td>
      <td class="art ${articleClass(w.art)}">${esc(w.art || '–')}</td>
      <td class="plural-cell">${esc(w.plural || '–')}</td>
      <td class="fa">${esc(w.fa)}</td>
    </tr>`;
  }).join('');
  cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>Deutsch</th><th>🔊</th><th>Artikel</th>
      <th>Plural</th><th>فارسی</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
  cont.querySelectorAll('[data-speak]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      speak(btn.dataset.speak, btn.dataset.audio);
    });
  });
  cont.querySelectorAll('tbody tr').forEach(tr => {
    tr.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      openWordView(tr.dataset.id);
    });
  });
}

/* ============================================================
   RENDER: CARDS
   ============================================================ */
function renderCards(){
  const container = document.getElementById('cardsContainer');
  if (!container) return;
  const search = (document.getElementById('cardSearch').value || '').toLowerCase();
  const filter = document.getElementById('cardFilter').value;
  let words = getWords().slice();
  if (search) {
    words = words.filter(w =>
      (w.de||'').toLowerCase().includes(search) ||
      (w.fa||'').toLowerCase().includes(search) ||
      (w.ex||'').toLowerCase().includes(search)
    );
  }
  if (filter === 'has-example') words = words.filter(w => w.ex);
  else if (filter === 'no-example') words = words.filter(w => !w.ex);
  else if (filter !== 'all') words = words.filter(w => normalizeStatus(w) === filter);
  if (cardSortMode === 'alpha') {
    words.sort((a, b) => a.de.localeCompare(b.de, 'de'));
  } else if (cardSortMode === 'random') {
    words = shuffle(words);
  } else if (cardSortMode === 'status') {
    const order = { bad: 0, new: 1, learning: 2, good: 3 };
    words.sort((a, b) => (order[normalizeStatus(a)] || 0) - (order[normalizeStatus(b)] || 0));
  }
  if (!words.length) {
    container.innerHTML = `<div class="empty">${getWords().length ? 'نتیجه‌ای پیدا نشد' : 'هنوز کلمه‌ای نداری'}</div>`;
    return;
  }
  const cardsHtml = words.map(w => {
    const st = normalizeStatus(w);
    const art = w.art && w.art !== '–' ? w.art : '';
    const artClass = articleClass(w.art);
    const hasEx = w.ex && w.ex.trim();
    const hasPlural = w.plural && w.plural !== '–';
    const wt = getWordType(w);
    const hasExAudio = w.exAudio && w.exAudio.trim();
    const hasForms = w.forms && Object.keys(w.forms).some(k => w.forms[k] && String(w.forms[k]).trim());
    const hasAnyExtra = hasForms || (w.synonyms || []).length > 0 || (w.related || []).length > 0 || (w.extraExamples || []).length > 0 || (w.note && w.note.trim()) || (w.notes || []).length > 0;
    return `<div class="word-card status-${st}" data-card-id="${w.id}">
      <div class="word-card-header">
        <div class="word-card-title">
          ${art ? `<span class="word-card-art ${artClass}">${esc(art)}</span>` : ''}
          <span class="word-card-de">${esc(w.de)}</span>
          <button class="word-speak-inline" data-card-speak="${esc(w.de)}" title="تلفظ">🔊</button>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="word-type-badge ${wt.type}">${wt.icon} ${wt.label}</span>
          ${hasAnyExtra ? `<button class="word-more-btn" data-card-more="${w.id}" title="نمایش کامل">⋮</button>` : ''}
        </div>
      </div>
      ${hasPlural ? `<div class="word-card-plural-line"><span>📚 جمع:</span> <span class="pl-value">${esc(w.plural)}</span></div>` : ''}
      <div class="word-card-fa">${esc(w.fa)}</div>
      ${hasEx
        ? `<div class="word-card-example">
            <div class="ex-de">
              <span class="ex-text">${highlightExample(w.ex, w.de)}</span>
              <button class="ex-speak-btn ${hasExAudio ? 'has-audio' : ''}" data-ex-speak="${esc(w.ex)}" data-ex-audio="${esc(w.exAudio || '')}">${hasExAudio ? '🎵' : '🔊'}</button>
            </div>
            ${w.exMean ? `<div class="ex-fa">${esc(w.exMean)}</div>` : ''}
          </div>`
        : `<div class="word-card-example none">📝 هنوز جمله‌ای نداری — کلیک کن و اضافه کن</div>`
      }
      <div class="word-card-footer">
        <div class="status-actions">
          <button class="status-btn bad ${st === 'bad' ? 'active' : ''}" data-card-rate="bad" data-card-id="${w.id}">❌ بلد نیستم</button>
          <button class="status-btn medium ${st === 'learning' ? 'active' : ''}" data-card-rate="medium" data-card-id="${w.id}">⚠️ نصفه</button>
          <button class="status-btn good ${st === 'good' ? 'active' : ''}" data-card-rate="good" data-card-id="${w.id}">✔️ بلدم</button>
        </div>
        ${(w.notes || []).length ? `<span class="word-card-notes-count">💡 ${(w.notes || []).length}</span>` : ''}
      </div>
    </div>`;
  }).join('');
  container.innerHTML = `<div class="cards-grid">${cardsHtml}</div>`;

  container.querySelectorAll('.word-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      openWordView(card.dataset.cardId);
    });
  });
  container.querySelectorAll('[data-card-more]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openWordView(btn.dataset.cardMore);
    });
  });
  container.querySelectorAll('[data-card-speak]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); speakTTS(btn.dataset.cardSpeak); });
  });
  container.querySelectorAll('[data-ex-speak]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); speak(btn.dataset.exSpeak, btn.dataset.exAudio); });
  });
  container.querySelectorAll('[data-card-rate]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const w = getWords().find(x => x.id === btn.dataset.cardId);
      if (!w) return;
      reviewWord(w, btn.dataset.cardRate);
      renderCards(); renderStats();
      const labels = { good: '✔️ بلدم', medium: '⚠️ نصفه', bad: '❌ بلد نیستم' };
      toast(`${labels[btn.dataset.cardRate]} ثبت شد`, btn.dataset.cardRate === 'good' ? 'success' : 'warning');
    });
  });
}

/* ============================================================
   RENDER: FOLDERS
   ============================================================ */
function renderFolders(){
  const words = getWords();
  const now = Date.now();
  let c = { new: 0, learning: 0, good: 0, bad: 0, due: 0 };
  words.forEach(w => {
    const st = normalizeStatus(w);
    if (c[st] !== undefined) c[st]++;
    const s = ensureSrs(w);
    if (!s.nextReview || s.nextReview <= now) c.due++;
  });
  const fg = document.getElementById('folderGrid');
  if (!fg) return;
  fg.innerHTML = `
    <div class="folder-card new" data-folder="new"><div class="icon">⚪</div><h4>جدید</h4><div class="count">${c.new}</div></div>
    <div class="folder-card medium" data-folder="learning"><div class="icon">🟡</div><h4>در یادگیری</h4><div class="count">${c.learning}</div></div>
    <div class="folder-card good" data-folder="good"><div class="icon">🟢</div><h4>مسلط</h4><div class="count">${c.good}</div></div>
    <div class="folder-card bad" data-folder="bad"><div class="icon">❌</div><h4>بلد نیستم</h4><div class="count">${c.bad}</div></div>
    <div class="folder-card due" data-folder="due"><div class="icon">📅</div><h4>مرور امروز</h4><div class="count">${c.due}</div></div>
    <div class="folder-card" data-folder="all" style="border-color:var(--primary);"><div class="icon">📦</div><h4>همه</h4><div class="count">${words.length}</div></div>
  `;
  fg.querySelectorAll('[data-folder]').forEach(card => {
    card.addEventListener('click', () => startPractice(card.dataset.folder));
  });
}

/* ============================================================
   PRACTICE FOLDER DRAWER
   ============================================================ */
function buildFolderMenu(){
  const words = getWords();
  const now = Date.now();
  let c = { new:0, learning:0, good:0, bad:0, due:0 };
  words.forEach(w => {
    const st = normalizeStatus(w);
    if (c[st] !== undefined) c[st]++;
    const s = ensureSrs(w);
    if (!s.nextReview || s.nextReview <= now) c.due++;
  });
  const list = document.getElementById('practiceFolderMenuList');
  if (!list) return;
  const items = [
    { key:'new', icon:'⚪', label:'جدید', count:c.new },
    { key:'learning', icon:'🟡', label:'در یادگیری', count:c.learning },
    { key:'good', icon:'🟢', label:'مسلط', count:c.good },
    { key:'bad', icon:'❌', label:'بلد نیستم', count:c.bad },
    { key:'due', icon:'📅', label:'مرور امروز', count:c.due },
    { key:'all', icon:'📦', label:'همه', count:words.length },
  ];
  list.innerHTML = items.map(i =>
    `<div class="practice-folder-menu-item" data-menu-folder="${i.key}">
      <span>${i.icon} ${i.label}</span>
      <span class="count">${i.count}</span>
    </div>`
  ).join('');
  list.querySelectorAll('[data-menu-folder]').forEach(el => {
    el.addEventListener('click', () => {
      const menu = document.getElementById('practiceFolderMenu');
      if (menu) menu.classList.add('hidden');
      startPractice(el.dataset.menuFolder);
    });
  });
}

/* ============================================================
   THEATER MODE
   ============================================================ */
function enterTheaterMode(){
  document.body.classList.add('practice-theater');
  const btn = document.getElementById('practiceFullscreenBtn');
  if (btn) {
    btn.textContent = '✕ خروج';
    btn.title = 'بستن حالت بزرگ';
  }
}
function exitTheaterMode(){
  document.body.classList.remove('practice-theater');
  const btn = document.getElementById('practiceFullscreenBtn');
  if (btn) {
    btn.textContent = '⛶ بزرگ';
    btn.title = 'نمایش بزرگ';
  }
}
function toggleTheaterMode(){
  if (document.body.classList.contains('practice-theater')) exitTheaterMode();
  else enterTheaterMode();
}

/* ============================================================
   RESET PRACTICE SETTINGS
   ============================================================ */
function resetPracticeSettings(){
  if (!confirm('تنظیمات تمرین (پخش خودکار، جهت کارت، مرتب‌سازی) به حالت اولیه برگرده؟')) return;
  autoPlayWord = true;
  try { localStorage.setItem(AUTOPLAY_KEY, 'true'); } catch(e){}
  updateAutoPlayUI();
  repeatMode = 0;
  repeatCounter = 0;
  practiceDirection = 'de-fa';
  updateDirectionLabel();
  cardSortMode = 'alpha';
  if (practice.active) exitPractice();
  exitTheaterMode();
  const menu = document.getElementById('practiceFolderMenu');
  if (menu) menu.classList.add('hidden');
  renderFolders();
  renderCards();
  toast('♻️ تنظیمات به حالت اولیه برگشت', 'success');
}

/* ============================================================
   PRACTICE
   ============================================================ */
function startPractice(folderType){
  let words = getWords().slice();
  const now = Date.now();
  if (folderType === 'new') words = words.filter(w => normalizeStatus(w) === 'new');
  else if (folderType === 'learning') words = words.filter(w => normalizeStatus(w) === 'learning');
  else if (folderType === 'good') words = words.filter(w => normalizeStatus(w) === 'good');
  else if (folderType === 'bad') words = words.filter(w => normalizeStatus(w) === 'bad');
  else if (folderType === 'due') words = words.filter(w => { const s = ensureSrs(w); return !s.nextReview || s.nextReview <= now; });
  if (!words.length) { toast('این پوشه خالیه!', 'warning'); return; }
  practice.active = true;
  practice.queue = shuffle(words);
  practice.index = 0;
  practice.ratings = {};
  document.getElementById('practiceFolderView').classList.add('hidden');
  document.getElementById('practiceSession').classList.remove('hidden');
  showCurrentPracticeCard();
}

function showCurrentPracticeCard(){
  if (practice.index >= practice.queue.length) {
    exitPractice();
    toast('🎉 مرور تمام شد!', 'success');
    return;
  }
  const w = practice.queue[practice.index];
  document.getElementById('practiceCounter').textContent = `${practice.index + 1} / ${practice.queue.length}`;
  document.getElementById('practiceProgress').style.width = ((practice.index / practice.queue.length) * 100) + '%';
  document.getElementById('flashcardInner').classList.remove('flipped');

  // ✅ اعمال جهت کارت
  if (practiceDirection === 'de-fa') {
    document.getElementById('fcArt').textContent = w.art && w.art !== '–' ? w.art : '';
    document.getElementById('fcArt').className = 'fc-art art ' + articleClass(w.art);
    document.getElementById('fcWord').textContent = w.de;
    document.getElementById('fcMeaning').textContent = w.fa;
    document.getElementById('fcExample').innerHTML = w.ex ? `📌 ${esc(w.ex)}${w.exMean ? `<br><small>${esc(w.exMean)}</small>` : ''}` : '';
  } else {
    // فارسی → آلمانی
    document.getElementById('fcArt').textContent = '';
    document.getElementById('fcArt').className = 'fc-art';
    document.getElementById('fcWord').textContent = w.fa;
    document.getElementById('fcMeaning').textContent = (w.art && w.art !== '–' ? w.art + ' ' : '') + w.de;
    document.getElementById('fcExample').innerHTML = w.exMean ? `📌 ${esc(w.exMean)}${w.ex ? `<br><small dir="ltr">${esc(w.ex)}</small>` : ''}` : (w.ex ? `📌 <span dir="ltr">${esc(w.ex)}</span>` : '');
  }

  const prevBtn = document.getElementById('prevPracticeBtn');
  if (prevBtn) prevBtn.disabled = practice.index === 0;

  // ✅ صدا فقط در جهت de-fa و فقط اگر کارت نچرخیده
  if (autoPlayWord && practiceDirection === 'de-fa') {
    setTimeout(() => {
      const inner = document.getElementById('flashcardInner');
      if (inner && !inner.classList.contains('flipped')) {
        speakTTS(w.de);
      }
    }, 200);
  }
}

function rateCurrent(rating){
  const w = practice.queue[practice.index];
  reviewWord(w, rating);
  practice.ratings[practice.index] = rating;
  practice.index++;
  showCurrentPracticeCard();
  renderStats();
}

function exitPractice(){
  exitTheaterMode();
  const menu = document.getElementById('practiceFolderMenu');
  if (menu) menu.classList.add('hidden');

  practice.active = false;
  practice.ratings = {};
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (currentAudio) { try { currentAudio.pause(); } catch(e){} currentAudio = null; }
  const folderView = document.getElementById('practiceFolderView');
  const sessionView = document.getElementById('practiceSession');
  if (folderView) folderView.classList.remove('hidden');
  if (sessionView) sessionView.classList.add('hidden');
  renderAll(); populateLessonTargets();
  updateReviewBanner();
}

/* ============================================================
   QUIZ STATS HELPERS
   ============================================================ */
function getQuizModeStats(mode){
  const history = (state.quizHistory || []).filter(h =>
    h.lessonId === state.activeLessonId && h.mode === mode
  );
  if (!history.length) {
    return { attempts: 0, bestPct: 0, lastPct: 0, lastDate: null, totalWordsTested: 0 };
  }
  let bestPct = 0;
  let totalWordsTested = 0;
  let last = history[history.length - 1];
  history.forEach(h => {
    if (h.pct > bestPct) bestPct = h.pct;
    totalWordsTested += h.total || 0;
  });
  return {
    attempts: history.length,
    bestPct,
    lastPct: last.pct,
    lastDate: last.date,
    totalWordsTested
  };
}

function renderModeStatsBadge(mode){
  const s = getQuizModeStats(mode);
  if (s.attempts === 0) {
    return `<div class="quiz-mode-stats none">🆕 هنوز کار نکردی</div>`;
  }
  return `<div class="quiz-mode-stats done">
    <span class="qms-attempts">🔁 ${s.attempts} بار</span>
    <span class="qms-best">🏆 ${s.bestPct}%</span>
  </div>`;
}

/* ============================================================
   QUIZ
   ============================================================ */
function pickAdaptiveWords(words, count){
  const bad = words.filter(w => normalizeStatus(w) === 'bad');
  const learning = words.filter(w => normalizeStatus(w) === 'learning');
  const good = words.filter(w => normalizeStatus(w) === 'good');
  const fresh = words.filter(w => normalizeStatus(w) === 'new');
  
  const nBad = Math.min(bad.length, Math.ceil(count * 0.5));
  const nLearning = Math.min(learning.length, Math.ceil(count * 0.3));
  const nGood = Math.min(good.length, Math.ceil(count * 0.1));
  const nFresh = Math.min(fresh.length, count - nBad - nLearning - nGood);
  
  let picked = [
    ...shuffle(bad).slice(0, nBad),
    ...shuffle(learning).slice(0, nLearning),
    ...shuffle(good).slice(0, nGood),
    ...shuffle(fresh).slice(0, nFresh)
  ];
  
  if (picked.length < count) {
    const remaining = words.filter(w => !picked.find(p => p.id === w.id));
    picked = picked.concat(shuffle(remaining).slice(0, count - picked.length));
  }
  
  return shuffle(picked).slice(0, count);
}

function renderQuizHome(){
  const container = document.getElementById('quizHome');
  if (!container) return;
  const words = getWords();
  const badCount = words.filter(w => normalizeStatus(w) === 'bad').length;
  const exampleCount = words.filter(w => w.ex && w.ex.trim()).length;
  const nounCount = words.filter(w => ['der','die','das'].includes(w.art)).length;
  const pluralCount = words.filter(w => w.plural && w.plural !== '–').length;
  const due = getDueWords();

  const lessonHistory = (state.quizHistory || [])
    .filter(h => h.lessonId === state.activeLessonId)
    .slice(-10)
    .reverse();

  // ✅ بخش وضعیت کلی
  const modes = ['mean', 'sentence', 'typing', 'listening', 'article', 'plural'];
  const tested = modes.filter(m => getQuizModeStats(m).attempts > 0);
  const notTested = modes.filter(m => getQuizModeStats(m).attempts === 0);
  const totalAttempts = modes.reduce((s, m) => s + getQuizModeStats(m).attempts, 0);
  let overviewHtml = '';
  if (totalAttempts === 0) {
    overviewHtml = `
      <div class="quiz-overview new">
        <div class="qo-icon">🆕</div>
        <div class="qo-text">
          <strong>هنوز هیچ آزمونی از این درس کار نکردی!</strong>
          <div class="qo-sub">با انتخاب یکی از حالت‌های زیر شروع کن</div>
        </div>
      </div>
    `;
  } else {
    overviewHtml = `
      <div class="quiz-overview">
        <div class="qo-row">
          <span class="qo-label">📊 کل آزمون‌ها:</span>
          <span class="qo-value">${totalAttempts} بار</span>
        </div>
        <div class="qo-row">
          <span class="qo-label">✅ کار شده:</span>
          <span class="qo-value qo-done">${tested.length} حالت</span>
        </div>
        ${notTested.length ? `
        <div class="qo-row">
          <span class="qo-label">⏳ هنوز کار نشده:</span>
          <span class="qo-value qo-pending">${notTested.length} حالت</span>
        </div>
        <div class="qo-pending-list">
          ${notTested.map(m => `<span class="qo-pending-chip">${quizModeLabel(m)}</span>`).join('')}
        </div>
        ` : `<div class="qo-all-done">🎉 همه حالت‌ها رو کار کردی!</div>`}
      </div>
    `;
  }

  container.innerHTML = `
    <div class="panel">
      <h3 style="text-align:center;font-size:20px;margin-bottom:8px;">🎯 آزمون هوشمند</h3>
      <p class="muted" style="text-align:center;font-size:13px;margin-bottom:20px;">
        ${due.length ? `<span style="color:var(--warning);">📅 ${due.length} کلمه برای مرور آماده‌ست</span>` : 'یکی از حالت‌های آزمون رو انتخاب کن'}
      </p>
      ${due.length ? `
        <div style="margin-bottom:16px;">
          <button class="btn btn-warning btn-lg" id="quizDailyReviewBtn" style="width:100%;color:#000;">
            📅 شروع مرور روزانه (${due.length} کلمه)
          </button>
        </div>
      ` : ''}
      ${overviewHtml}
      <div class="quiz-mode-grid">
        <div class="quiz-mode-card mode-mean" data-quiz-mode="mean">
          <span class="mode-icon">🔤</span>
          <div class="mode-title">معنی کلمه</div>
          <div class="mode-desc">${words.length} کلمه<br>کلمه آلمانی ↔ معنی فارسی</div>
          ${renderModeStatsBadge('mean')}
        </div>
        <div class="quiz-mode-card mode-sentence" data-quiz-mode="sentence">
          <span class="mode-icon">📝</span>
          <div class="mode-title">جای خالی در جمله</div>
          <div class="mode-desc">${exampleCount} جمله<br>کلمه درست رو انتخاب کن</div>
          ${renderModeStatsBadge('sentence')}
        </div>
        <div class="quiz-mode-card mode-typing" data-quiz-mode="typing">
          <span class="mode-icon">⌨️</span>
          <div class="mode-title">تایپ کردن</div>
          <div class="mode-desc">${words.length} کلمه<br>ترجمه فارسی → تایپ آلمانی</div>
          ${renderModeStatsBadge('typing')}
        </div>
        <div class="quiz-mode-card mode-listening" data-quiz-mode="listening">
          <span class="mode-icon">🎧</span>
          <div class="mode-title">شنیداری</div>
          <div class="mode-desc">${words.length} کلمه<br>گوش کن → تایپ کن</div>
          ${renderModeStatsBadge('listening')}
        </div>
        ${nounCount >= 2 ? `
          <div class="quiz-mode-card mode-article" data-quiz-mode="article">
            <span class="mode-icon">🔤</span>
            <div class="mode-title">جنسیت اسم</div>
            <div class="mode-desc">${nounCount} اسم<br>der / die / das</div>
            ${renderModeStatsBadge('article')}
          </div>
        ` : ''}
        ${pluralCount >= 2 ? `
          <div class="quiz-mode-card mode-plural" data-quiz-mode="plural">
            <span class="mode-icon">📚</span>
            <div class="mode-title">جمع اسم</div>
            <div class="mode-desc">${pluralCount} اسم<br>جمع درست رو انتخاب کن</div>
            ${renderModeStatsBadge('plural')}
          </div>
        ` : ''}
      </div>
      ${badCount > 0 ? `
        <div style="text-align:center;margin-top:16px;">
          <button class="btn btn-danger btn-lg" id="quizBadBtn" style="width:100%;">
            ❌ آزمون فقط «بلد نیستم»ها (${badCount} کلمه)
          </button>
        </div>
      ` : ''}
    </div>
    ${lessonHistory.length ? `
      <div class="panel" style="margin-top:16px;">
        <h3>📊 تاریخچه آزمون‌های این درس</h3>
        <div class="quiz-history-list">
          ${lessonHistory.map(h => {
            const d = new Date(h.date);
            let dateStr = '';
            try {
              dateStr = d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', {hour:'2-digit', minute:'2-digit'});
            } catch(e) {
              dateStr = d.toLocaleString();
            }
            return `<div class="quiz-history-item">
              <span class="qh-mode">${quizModeLabel(h.mode)}</span>
              <span class="qh-score" style="color:${h.pct>=70?'var(--accent)':h.pct>=50?'var(--warning)':'var(--danger)'}">${h.pct}%</span>
              <span class="qh-detail">${h.correct}/${h.total}</span>
              <span class="qh-date">${dateStr}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    ` : ''}
  `;

  container.querySelectorAll('[data-quiz-mode]').forEach(card => {
    card.addEventListener('click', () => startQuizMode(card.dataset.quizMode));
  });
  const badBtn = document.getElementById('quizBadBtn');
  if (badBtn) badBtn.addEventListener('click', () => startQuizMode('mean', true));
  const dailyBtn = document.getElementById('quizDailyReviewBtn');
  if (dailyBtn) dailyBtn.addEventListener('click', startDailyReview);
}

function startQuizMode(mode, onlyBad){
  let words = getWords().slice();
  if (onlyBad) words = words.filter(w => normalizeStatus(w) === 'bad');
  if (mode === 'sentence') words = words.filter(w => w.ex && w.ex.trim());
  if (mode === 'article') words = words.filter(w => ['der','die','das'].includes(w.art));
  if (mode === 'plural') words = words.filter(w => w.plural && w.plural !== '–');
  if (words.length < 2) {
    toast('حداقل ۲ کلمه لازمه', 'warning');
    return;
  }

  quizState.mode = mode;
  quizState.questions = [];
  quizState.index = 0;
  quizState.correct = 0;
  quizState.wrong = 0;
  quizState.wrongWords = [];
  quizState.answered = false;
  quizState.startedAt = Date.now();

  const poolSize = Math.min(20, words.length);
  const picked = pickAdaptiveWords(words, poolSize);

  if (mode === 'mean') {
    picked.forEach(w => {
      if (practiceDirection === 'de-fa') {
        const others = words.filter(x => x.id !== w.id).map(x => x.fa).filter(Boolean);
        if (others.length < 2) return;
        const opts = shuffle([w.fa, ...shuffle(others).slice(0, 3)]);
        quizState.questions.push({ type: 'mean', word: w, correct: w.fa, options: opts, dir: 'de-fa' });
      } else {
        const others = words.filter(x => x.id !== w.id).map(x => x.de).filter(Boolean);
        if (others.length < 2) return;
        const opts = shuffle([w.de, ...shuffle(others).slice(0, 3)]);
        quizState.questions.push({ type: 'mean', word: w, correct: w.de, options: opts, dir: 'fa-de' });
      }
    });
  } else if (mode === 'sentence') {
    picked.forEach(w => {
      const others = words.filter(x => x.id !== w.id).map(x => x.de);
      if (others.length < 2) return;
      const escaped = w.de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const masked = w.ex.replace(new RegExp(escaped, 'gi'), '_____');
      const opts = shuffle([w.de, ...shuffle(others).slice(0, 3)]);
      quizState.questions.push({ type: 'sentence', word: w, correct: w.de, options: opts, masked, exMean: w.exMean });
    });
  } else if (mode === 'typing' || mode === 'listening') {
    picked.forEach(w => {
      quizState.questions.push({ type: 'typing', word: w, correct: w.de, mode: mode });
    });
  } else if (mode === 'article') {
    picked.forEach(w => {
      quizState.questions.push({ type: 'article', word: w, correct: w.art, options: ['der','die','das'] });
    });
  } else if (mode === 'plural') {
    picked.forEach(w => {
      const others = words.filter(x => x.id !== w.id && x.plural && x.plural !== '–').map(x => x.plural);
      if (others.length < 2) return;
      const opts = shuffle([w.plural, ...shuffle(others).slice(0, 3)]);
      quizState.questions.push({ type: 'plural', word: w, correct: w.plural, options: opts });
    });
  }

  if (!quizState.questions.length) {
    toast('سوالی ساخته نشد', 'error');
    return;
  }

  quizState.questions = shuffle(quizState.questions).slice(0, 20);
  document.getElementById('quizHome').classList.add('hidden');
  document.getElementById('quizSession').classList.remove('hidden');
  document.getElementById('quizReport').classList.add('hidden');
  renderQuizQuestionNew();
}

function renderQuizQuestionNew(){
  if (quizState.index >= quizState.questions.length) {
    renderQuizReportNew();
    return;
  }
  const q = quizState.questions[quizState.index];
  const total = quizState.questions.length;
  const progress = (quizState.index / total * 100);
  quizState.answered = false;

  const session = document.getElementById('quizSession');
  let questionHtml = '';

  if (q.type === 'mean') {
    const showDe = (q.dir || 'de-fa') === 'de-fa';
    questionHtml = `
      <div class="quiz-question-box">
        <div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">
          ${showDe ? 'معنی این کلمه چیه؟' : 'معادل آلمانی این کلمه چیه؟'}
        </div>
        <div class="quiz-word" style="font-size:clamp(28px,7vw,42px);">${esc(showDe ? q.word.de : q.word.fa)}</div>
        <div style="text-align:center;">
          <button class="quiz-hint-toggle" id="quizFlipDirBtn">🔄 تغییر جهت</button>
        </div>
      </div>
      <div class="quiz-options">
        ${q.options.map(o => `<button class="quiz-opt" data-qopt="${esc(o)}">${esc(o)}</button>`).join('')}
      </div>
    `;
  } else if (q.type === 'sentence') {
    questionHtml = `
      <div class="quiz-question-box">
        <div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">کدوم کلمه توی جای خالی میاد؟</div>
        <div class="quiz-sentence">"${esc(q.masked)}"</div>
        <div style="text-align:center;">
          <button class="quiz-hint-toggle" id="quizHintBtn">💡 نمایش راهنما (ترجمه)</button>
          <div class="quiz-hint-content" id="quizHintContent">${esc(q.exMean || 'ترجمه موجود نیست')}</div>
        </div>
      </div>
      <div class="quiz-options">
        ${q.options.map(o => `<button class="quiz-opt" data-qopt="${esc(o)}">${esc(o)}</button>`).join('')}
      </div>
    `;
  } else if (q.type === 'typing') {
    const isListening = q.mode === 'listening';
    questionHtml = `
      <div class="quiz-question-box">
        <div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">
          ${isListening ? 'گوش کن و بنویس' : 'ترجمه فارسی → تایپ آلمانی'}
        </div>
        ${isListening ? `
          <button class="quiz-listen-btn" id="quizListenBtn">🔊</button>
          <div style="text-align:center;font-size:12px;color:var(--muted);margin-top:8px;">برای پخش دوباره کلیک کن</div>
        ` : `
          <div class="quiz-word" style="color:var(--accent);">${esc(q.word.fa)}</div>
        `}
        <input type="text" class="quiz-typing-input" id="quizTypingInput" placeholder="آلمانی رو تایپ کن..." dir="ltr" autocomplete="off" autocorrect="off">
        <div style="text-align:center;">
          <button class="quiz-hint-toggle" id="quizHintBtn">💡 نمایش راهنما</button>
          <div class="quiz-hint-content" id="quizHintContent">
            ${q.word.ex ? `<div dir="ltr" style="text-align:left;margin-bottom:6px;">📝 ${esc(q.word.ex)}</div>` : ''}
            ${q.word.fa ? `<div>💬 معنی: ${esc(q.word.fa)}</div>` : ''}
            ${q.word.art && q.word.art !== '–' ? `<div>🔤 آرتیکل: ${esc(q.word.art)}</div>` : ''}
          </div>
        </div>
        <button class="btn btn-primary" id="quizCheckBtn" style="width:100%;margin-top:12px;padding:12px;">✅ بررسی جواب</button>
      </div>
    `;
  } else if (q.type === 'article') {
    questionHtml = `
      <div class="quiz-question-box">
        <div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">آرتیکل درست چیه؟</div>
        <div class="quiz-word" style="font-size:clamp(28px,7vw,42px);">${esc(q.word.de)}</div>
        <div style="text-align:center;color:var(--muted);font-size:13px;margin-top:6px;">${esc(q.word.fa)}</div>
      </div>
      <div class="quiz-options">
        ${q.options.map(o => `<button class="quiz-opt article-opt-${o}" data-qopt="${esc(o)}">${esc(o)}</button>`).join('')}
      </div>
    `;
  } else if (q.type === 'plural') {
    questionHtml = `
      <div class="quiz-question-box">
        <div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">جمع این اسم چیه؟</div>
        <div class="quiz-word" style="font-size:clamp(28px,7vw,42px);">
          ${q.word.art && q.word.art !== '–' ? `<span style="opacity:0.7;font-size:0.6em;">${esc(q.word.art)}</span> ` : ''}${esc(q.word.de)}
        </div>
        <div style="text-align:center;color:var(--muted);font-size:13px;margin-top:6px;">${esc(q.word.fa)}</div>
      </div>
      <div class="quiz-options">
        ${q.options.map(o => `<button class="quiz-opt" data-qopt="${esc(o)}">${esc(o)}</button>`).join('')}
      </div>
    `;
  }

  session.innerHTML = `
    <div class="panel">
      <div class="quiz-session-header">
        <div class="quiz-progress-info">
          <span class="q-num">${quizState.index + 1} / ${total}</span>
          <span style="color:var(--muted);">${Math.round(progress)}٪</span>
        </div>
        <div class="quiz-score">
          <span class="correct-count">✅ ${quizState.correct}</span>
          <span class="wrong-count">❌ ${quizState.wrong}</span>
          <button class="btn btn-sm" id="quizExitBtn">⬅️ خروج</button>
        </div>
      </div>
      <div class="quiz-progress" style="margin-bottom:20px;">
        <div class="quiz-progress-fill" style="width:${progress}%"></div>
      </div>
      ${questionHtml}
    </div>
  `;

  document.getElementById('quizExitBtn').addEventListener('click', backToQuizHome);
  const hintBtn = document.getElementById('quizHintBtn');
  const hintContent = document.getElementById('quizHintContent');
  if (hintBtn) {
    hintBtn.addEventListener('click', () => {
      hintContent.classList.toggle('show');
      hintBtn.innerHTML = hintContent.classList.contains('show') ? '🙈 مخفی کردن راهنما' : '💡 نمایش راهنما';
    });
  }

  // ✅ دکمه تغییر جهت در آزمون mean
  const flipDirBtn = document.getElementById('quizFlipDirBtn');
  if (flipDirBtn) {
    flipDirBtn.addEventListener('click', () => {
      practiceDirection = practiceDirection === 'de-fa' ? 'fa-de' : 'de-fa';
      updateDirectionLabel();
      const w = q.word;
      const allWords = getWords();
      if (practiceDirection === 'de-fa') {
        const others = allWords.filter(x => x.id !== w.id).map(x => x.fa).filter(Boolean);
        const opts = shuffle([w.fa, ...shuffle(others).slice(0, 3)]);
        q.correct = w.fa;
        q.options = opts;
        q.dir = 'de-fa';
      } else {
        const others = allWords.filter(x => x.id !== w.id).map(x => x.de).filter(Boolean);
        const opts = shuffle([w.de, ...shuffle(others).slice(0, 3)]);
        q.correct = w.de;
        q.options = opts;
        q.dir = 'fa-de';
      }
      renderQuizQuestionNew();
    });
  }

  if (q.type === 'typing') {
    const input = document.getElementById('quizTypingInput');
    const checkBtn = document.getElementById('quizCheckBtn');
    if (q.mode === 'listening') {
      const listenBtn = document.getElementById('quizListenBtn');
      listenBtn.addEventListener('click', () => {
        speakTTS(q.word.de);
        listenBtn.classList.add('playing');
        setTimeout(() => listenBtn.classList.remove('playing'), 1500);
      });
      setTimeout(() => speakTTS(q.word.de), 300);
    }
    setTimeout(() => input.focus(), 100);
    checkBtn.addEventListener('click', () => checkTypingAnswer(q, input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') checkTypingAnswer(q, input);
    });
  } else {
    session.querySelectorAll('[data-qopt]').forEach(btn => {
      btn.addEventListener('click', () => answerChoice(q, btn.dataset.qopt));
    });
  }
}

function answerChoice(q, selected){
  if (quizState.answered) return;
  quizState.answered = true;
  const isCorrect = germanEquals(selected, q.correct);

  if (isCorrect) {
    quizState.correct++;
    reviewWord(q.word, 'good');
  } else {
    quizState.wrong++;
    quizState.wrongWords.push(q.word);
    reviewWord(q.word, 'bad');
  }

  document.querySelectorAll('[data-qopt]').forEach(btn => {
    btn.disabled = true;
    if (germanEquals(btn.dataset.qopt, q.correct)) btn.classList.add('correct');
    else if (btn.dataset.qopt === selected) btn.classList.add('wrong');
  });

  const fb = document.createElement('div');
  fb.className = 'quiz-feedback ' + (isCorrect ? 'correct' : 'wrong');
  fb.innerHTML = isCorrect ? '✅ آفرین! درست بود' : `❌ اشتباه — جواب درست: <strong>${esc(q.correct)}</strong>`;
  document.getElementById('quizSession').appendChild(fb);

  const next = document.createElement('button');
  next.className = 'btn btn-primary';
  next.style.cssText = 'margin-top:16px;width:100%;padding:12px;';
  next.textContent = 'سوال بعدی ➡️';
  next.addEventListener('click', () => { quizState.index++; renderQuizQuestionNew(); });
  document.getElementById('quizSession').appendChild(next);
  setTimeout(() => next.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
}

function checkTypingAnswer(q, input){
  if (quizState.answered) return;
  const userAnswer = (input.value || '').trim();
  const isCorrect = germanEquals(userAnswer, q.correct);

  quizState.answered = true;
  input.disabled = true;

  if (isCorrect) {
    quizState.correct++;
    reviewWord(q.word, 'good');
    input.classList.add('correct');
  } else {
    quizState.wrong++;
    quizState.wrongWords.push(q.word);
    reviewWord(q.word, 'bad');
    input.classList.add('wrong');
  }

  const fb = document.createElement('div');
  fb.className = 'quiz-feedback ' + (isCorrect ? 'correct' : 'wrong');
  fb.innerHTML = isCorrect
    ? `✅ آفرین! درست بود — <strong style="direction:ltr;">${esc(q.correct)}</strong>`
    : `❌ اشتباه — جواب درست: <strong style="direction:ltr;">${esc(q.correct)}</strong>
       <div style="font-size:12px;opacity:0.8;margin-top:6px;">جواب تو: <span dir="ltr">${esc(userAnswer || '(خالی)')}</span></div>`;
  document.getElementById('quizSession').appendChild(fb);

  document.getElementById('quizCheckBtn').style.display = 'none';

  const next = document.createElement('button');
  next.className = 'btn btn-primary';
  next.style.cssText = 'margin-top:16px;width:100%;padding:12px;';
  next.textContent = 'سوال بعدی ➡️';
  next.addEventListener('click', () => { quizState.index++; renderQuizQuestionNew(); });
  document.getElementById('quizSession').appendChild(next);
  setTimeout(() => next.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
}

function renderQuizReportNew(){
  const total = quizState.correct + quizState.wrong;
  const pct = total ? Math.round((quizState.correct / total) * 100) : 0;
  let badge, badgeText;
  if (pct >= 90) { badge = 'excellent'; badgeText = '🏆 فوق‌العاده!'; }
  else if (pct >= 70) { badge = 'good'; badgeText = '👍 خیلی خوب!'; }
  else if (pct >= 50) { badge = 'average'; badgeText = '📚 خوب، ولی بیشتر تمرین کن'; }
  else { badge = 'weak'; badgeText = '💪 نیاز به تمرین بیشتر'; }

  // ✅ ذخیره تاریخچه
  if (!state.quizHistory) state.quizHistory = [];
  state.quizHistory.push({
    id: uid(),
    date: Date.now(),
    bookId: state.activeBookId,
    lessonId: state.activeLessonId,
    mode: quizState.mode,
    correct: quizState.correct,
    wrong: quizState.wrong,
    total: total,
    pct: pct
  });
  if (state.quizHistory.length > 100) state.quizHistory = state.quizHistory.slice(-100);
  save();

  document.getElementById('quizSession').classList.add('hidden');
  const report = document.getElementById('quizReport');
  report.classList.remove('hidden');

  report.innerHTML = `
    <div class="quiz-report-hero">
      <div class="quiz-report-badge ${badge}">${badgeText}</div>
      <div class="quiz-report-score">${pct}%</div>
      <div style="font-size:14px;color:var(--muted);">${quizState.correct} از ${total} پاسخ درست</div>
    </div>
    <div class="quiz-report-stats">
      <div class="quiz-report-stat correct-stat">
        <span class="stat-num">${quizState.correct}</span>
        <span class="stat-lbl">✅ درست</span>
      </div>
      <div class="quiz-report-stat wrong-stat">
        <span class="stat-num">${quizState.wrong}</span>
        <span class="stat-lbl">❌ اشتباه</span>
      </div>
      <div class="quiz-report-stat total-stat">
        <span class="stat-num">${total}</span>
        <span class="stat-lbl">📊 کل سوال</span>
      </div>
    </div>
    ${quizState.wrongWords.length ? `
      <div class="quiz-failed-section">
        <h4>⚠️ کلمات اشتباه (${quizState.wrongWords.length})</h4>
        <div class="quiz-failed-list">
          ${quizState.wrongWords.map(w => `
            <div class="quiz-failed-item">
              <span class="de">${esc(w.de)}</span>
              <span class="fa">${esc(w.fa)}</span>
            </div>
          `).join('')}
        </div>
        <p style="font-size:12px;color:var(--muted);margin-top:10px;">این کلمات به پوشه «بلد نیستم» منتقل شدن.</p>
      </div>
    ` : `
      <div style="text-align:center;padding:20px;color:var(--accent);font-size:16px;font-weight:700;">🎉 عالی! هیچ غلطی نداشتی</div>
    `}
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:20px;">
      <button class="btn btn-primary btn-lg" id="quizBackBtn" style="width:100%;">🏠 بازگشت به منوی آزمون</button>
      ${quizState.wrongWords.length ? `
        <button class="btn btn-danger btn-lg" id="quizRetryWrongBtn" style="width:100%;">🔄 آزمون مجدد کلمات اشتباه</button>
      ` : ''}
    </div>
  `;

  document.getElementById('quizBackBtn').addEventListener('click', backToQuizHome);
  const retryBtn = document.getElementById('quizRetryWrongBtn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      const wrongWords = quizState.wrongWords;
      if (wrongWords.length < 2) {
        toast('برای آزمون مجدد حداقل ۲ کلمه لازمه', 'warning');
        return;
      }
      quizState.mode = 'mean';
      quizState.questions = [];
      quizState.index = 0;
      quizState.correct = 0;
      quizState.wrong = 0;
      quizState.wrongWords = [];
      quizState.startedAt = Date.now();
      wrongWords.forEach(w => {
        const all = getWords();
        const extra = all.filter(x => x.id !== w.id).map(x => x.fa);
        const opts = shuffle([w.fa, ...shuffle(extra).slice(0, 3)]);
        quizState.questions.push({ type: 'mean', word: w, correct: w.fa, options: opts, dir: 'de-fa' });
      });
      quizState.questions = shuffle(quizState.questions);
      document.getElementById('quizReport').classList.add('hidden');
      document.getElementById('quizSession').classList.remove('hidden');
      renderQuizQuestionNew();
    });
  }

  renderAll(); populateLessonTargets();
  updateReviewBanner();
}

function backToQuizHome(){
  quizState.mode = null;
  quizState.questions = [];
  quizState.index = 0;
  quizState.correct = 0;
  quizState.wrong = 0;
  quizState.wrongWords = [];
  document.getElementById('quizReport').classList.add('hidden');
  document.getElementById('quizSession').classList.add('hidden');
  document.getElementById('quizHome').classList.remove('hidden');
  renderQuizHome();
}

/* ============================================================
   STORIES
   ============================================================ */
function renderStories(){
  const stories = getStories();
  const grid = document.getElementById('storyGrid');
  if (!grid) return;
  if (!stories.length) { grid.innerHTML = '<div class="empty">هنوز داستانی نداری</div>'; return; }
  grid.innerHTML = stories.map(s => {
    const img = safeImageSrc(s.coverImage);
    const color = safeCoverColor(s.coverColor);
    return `<div class="story-card-wrapper">
      <button class="story-card" style="--cover-color:${color};width:100%;" data-story="${s.id}">
        ${img ? `<img src="${esc(img)}" alt="">` : ''}
        <span class="title">${esc(s.title)}</span>
      </button>
      <button class="story-edit-btn" data-edit="${s.id}" title="ویرایش">✏️</button>
      <button class="story-del-btn" data-del-story="${s.id}" title="حذف">✕</button>
    </div>`;
  }).join('');
  grid.querySelectorAll('[data-story]').forEach(btn => {
    btn.addEventListener('click', () => openStory(btn.dataset.story));
  });
  grid.querySelectorAll('[data-del-story]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const s = getStories().find(x => x.id === btn.dataset.delStory);
      if (!s || !confirm(`حذف «${s.title}»؟`)) return;
      const l = getLesson();
      l.stories = l.stories.filter(x => x.id !== s.id);
      save(); renderStories(); populateLessonTargets(); toast('حذف شد', 'success');
    });
  });
  grid.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); loadStoryForEdit(btn.dataset.edit); });
  });
}

function highlightStoryWords(sentenceDe){
  const parts = sentenceDe.split(/(\s+|[.,!?;:()"'\[\]{}–—\-]+)/);
  return parts.map(part => {
    if (!part || /^\s+$/.test(part) || /^[.,!?;:()"'\[\]{}–—\-]+$/.test(part)) {
      return esc(part);
    }
    const clean = part.toLowerCase().replace(/[.,!?;:()"'\[\]{}–—]/g, '');
    const found = getWords().find(w =>
      w.de.toLowerCase() === clean ||
      (w.art && w.de.toLowerCase() === w.art.toLowerCase()) ||
      w.de.toLowerCase().startsWith(clean + ' ')
    );
    if (found) {
      return `<span class="story-word" data-word-id="${found.id}">${esc(part)}</span>`;
    }
    return esc(part);
  }).join('');
}

function openStory(id){
  const s = getStories().find(x => x.id === id);
  if (!s) return;
  currentStoryId = id;
  repeatCounter = 0;
  const audio = toDirectAudioUrl(s.audio);
  const coverImage = safeImageSrc(s.coverImage);
  const coverColor = safeCoverColor(s.coverColor);
  const stories = getStories();
  const idx = stories.findIndex(x => x.id === id);
  const hasPrev = idx > 0;
  const hasNext = idx < stories.length - 1;

  document.getElementById('storyReaderModal').classList.add('active');
  document.body.classList.add('locked');

  let playerClass = 'audio-player';
  let playerStyle = '';
  if (coverImage) {
    playerClass += ' has-bg-image';
    playerStyle = ` style="--player-cover-image:url('${esc(coverImage)}')"`;
  } else {
    playerClass += ' has-bg-color';
    playerStyle = ` style="--player-cover-color:${coverColor}"`;
  }

  let html = `<h2 class="story-reader-title">${esc(s.title)}</h2>`;

  if (stories.length > 1) {
    html += `<div class="story-quick-nav">`;
    stories.forEach((st, i) => {
      html += `<button class="story-quick-nav-btn ${st.id === id ? 'active' : ''}" data-jump-story="${st.id}">${i+1}. ${esc(st.title)}</button>`;
    });
    html += `</div>`;
  }

  html += `<div class="story-reader-body-scroll" id="storyScrollBody">`;
  (s.sentences || []).forEach((sent, i) => {
    html += `<div class="story-sentence">
      <div class="story-de">${i+1}. ${highlightStoryWords(sent.de)}</div>
      <div class="story-fa">${esc(sent.fa)}</div>
    </div>`;
  });
  html += `</div>`;

  html += `<div class="story-toolbar">
    <button class="btn btn-sm" id="toggleFa">👁 نمایش/پنهان ترجمه</button>
  </div>`;

  if (audio) {
    const downloadName = (s.title || 'audio').replace(/[\\/:*?"<>|]/g, '_') + '.mp3';
    html += `<div class="${playerClass}" data-audio-player${playerStyle}>
      <div class="audio-player-label">🎧 ${esc(s.title)}</div>
      <div class="audio-player-row">
        <button type="button" class="audio-nav-btn" data-prev-btn ${hasPrev ? '' : 'disabled'}>⏮</button>
        <button type="button" class="audio-play-btn" data-play-btn>▶</button>
        <button type="button" class="audio-nav-btn" data-next-btn ${hasNext ? '' : 'disabled'}>⏭</button>
        <div class="audio-progress-wrap">
          <div class="audio-time"><span data-current>0:00</span><span data-duration>0:00</span></div>
          <input type="range" class="audio-progress" data-progress min="0" max="100" value="0" step="0.1">
        </div>
      </div>
      <div class="audio-player-row-2">
        <div class="audio-volume-wrap">
          <span class="vol-icon" data-vol-icon>🔊</span>
          <input type="range" class="audio-volume" data-volume min="0" max="100" value="100" step="1">
        </div>
        <div class="audio-right-tools">
          <button type="button" class="audio-speed-btn" data-speed-btn>1×</button>
          <button type="button" class="audio-nav-btn" data-loop-btn>🔁</button>
          <a class="audio-download-btn" href="${esc(audio)}" download="${esc(downloadName)}" target="_blank" rel="noopener">⬇</a>
        </div>
      </div>
      <audio preload="metadata" data-audio src="${esc(audio)}"></audio>
    </div>`;
  }

  document.getElementById('storyReaderBody').innerHTML = html;

  // ✅ اسکرول به بالا + نوار داستان فعال وسط
  const scrollBody = document.getElementById('storyScrollBody');
  if (scrollBody) scrollBody.scrollTop = 0;
  const activeNav = document.querySelector('.story-quick-nav-btn.active');
  if (activeNav) {
    try {
      activeNav.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } catch(e) {}
  }

  document.querySelectorAll('[data-jump-story]').forEach(btn => {
    btn.addEventListener('click', () => openStory(btn.dataset.jumpStory));
  });
  document.querySelectorAll('.story-word').forEach(span => {
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      openWordView(span.dataset.wordId);
    });
  });
  const toggleBtn = document.getElementById('toggleFa');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      document.querySelectorAll('.story-fa').forEach(el => el.classList.toggle('hidden'));
    });
  }
  if (audio) {
    const playerEl = document.querySelector('[data-audio-player]');
    if (playerEl) {
      if (coverImage) {
        const styleId = 'style_' + s.id.replace(/[^a-zA-Z0-9]/g, '');
        const old = document.getElementById(styleId);
        if (old) old.remove();
        const st = document.createElement('style');
        st.id = styleId;
        st.textContent = `[data-audio-player].has-bg-image::after { background-image: url("${coverImage}") !important; }`;
        document.head.appendChild(st);
      }
      setupCustomAudioPlayer(playerEl);
    }
  }
}

function applyRepeatButtonState(btn){
  if (!btn) return;
  btn.classList.remove('repeat-1', 'repeat-2', 'auto-next', 'repeat-inf');
  const oldBadge = btn.querySelector('.repeat-badge');
  if (oldBadge) oldBadge.remove();
  btn.textContent = '🔁';
  if (repeatMode === 0) { btn.title = 'حالت تکرار: خاموش'; }
  else if (repeatMode === 1) { btn.classList.add('repeat-1'); const b = document.createElement('span'); b.className = 'repeat-badge'; b.textContent = '1'; btn.appendChild(b); }
  else if (repeatMode === 2) { btn.classList.add('repeat-2'); const b = document.createElement('span'); b.className = 'repeat-badge'; b.textContent = '2'; btn.appendChild(b); }
  else if (repeatMode === 3) { btn.classList.add('auto-next'); const b = document.createElement('span'); b.className = 'repeat-badge'; b.textContent = 'A'; btn.appendChild(b); }
  else if (repeatMode === 4) { btn.classList.add('repeat-inf'); const b = document.createElement('span'); b.className = 'repeat-badge'; b.textContent = '∞'; btn.appendChild(b); }
}
function goToAdjacentStory(direction, autoAdvance){
  const stories = getStories();
  if (!stories.length) return false;
  let idx = -1;
  for (let i = 0; i < stories.length; i++) {
    if (String(stories[i].id) === String(currentStoryId)) { idx = i; break; }
  }
  if (idx === -1) return false;
  let nextIdx = idx + direction;
  if (nextIdx >= stories.length) {
    if (!autoAdvance) return false;
    nextIdx = 0;
  }
  if (nextIdx < 0) {
    if (!autoAdvance) return false;
    nextIdx = stories.length - 1;
  }
  currentStoryId = stories[nextIdx].id;
  if (autoAdvance) repeatCounter = 0;
  openStory(currentStoryId);
  return true;
}
function setupCustomAudioPlayer(root){
  const audioEl = root.querySelector('[data-audio]');
  const playBtn = root.querySelector('[data-play-btn]');
  const progress = root.querySelector('[data-progress]');
  const currentEl = root.querySelector('[data-current]');
  const durationEl = root.querySelector('[data-duration]');
  const volume = root.querySelector('[data-volume]');
  const volIcon = root.querySelector('[data-vol-icon]');
  const speedBtn = root.querySelector('[data-speed-btn]');
  const prevBtn = root.querySelector('[data-prev-btn]');
  const nextBtn = root.querySelector('[data-next-btn]');
  const loopBtn = root.querySelector('[data-loop-btn]');
  if (!audioEl || !playBtn || !progress) return;
  let isSeeking = false;
  const speeds = [1, 1.25, 1.5, 0.75, 0.5];
  let speedIdx = 0;
  function updatePlayState(){
    if (audioEl.paused) { playBtn.textContent = '▶'; playBtn.classList.remove('playing'); }
    else { playBtn.textContent = '❚❚'; playBtn.classList.add('playing'); }
  }
  playBtn.addEventListener('click', () => {
    if (audioEl.paused) audioEl.play().catch(()=>{});
    else audioEl.pause();
  });
  audioEl.addEventListener('play', updatePlayState);
  audioEl.addEventListener('pause', updatePlayState);
  audioEl.addEventListener('ended', () => {
    updatePlayState();
    if (repeatMode === 0) return;
    if (repeatMode === 4) { audioEl.currentTime = 0; audioEl.play().catch(()=>{}); return; }
    if (repeatMode === 1 || repeatMode === 2) {
      const maxRepeat = repeatMode;
      if (repeatCounter < maxRepeat) { repeatCounter++; audioEl.currentTime = 0; audioEl.play().catch(()=>{}); return; }
      else { repeatCounter = 0; goToAdjacentStory(1, true); return; }
    }
    if (repeatMode === 3) { goToAdjacentStory(1, true); return; }
  });
  audioEl.addEventListener('loadedmetadata', () => { durationEl.textContent = fmtTime(audioEl.duration); progress.max = audioEl.duration || 0; });
  audioEl.addEventListener('timeupdate', () => {
    if (!isSeeking) progress.value = audioEl.currentTime || 0;
    currentEl.textContent = fmtTime(audioEl.currentTime);
  });
  progress.addEventListener('input', () => { isSeeking = true; currentEl.textContent = fmtTime(parseFloat(progress.value) || 0); });
  progress.addEventListener('change', () => { audioEl.currentTime = parseFloat(progress.value) || 0; isSeeking = false; });
  volume.addEventListener('input', () => { const v = parseInt(volume.value, 10) / 100; audioEl.volume = v; updateVolIcon(v); });
  function updateVolIcon(v){
    if (v === 0) volIcon.textContent = '🔇';
    else if (v < 0.5) volIcon.textContent = '🔉';
    else volIcon.textContent = '🔊';
  }
  volIcon.addEventListener('click', () => {
    if (audioEl.volume > 0) { audioEl.dataset.prevVol = audioEl.volume; audioEl.volume = 0; volume.value = 0; }
    else { const prev = parseFloat(audioEl.dataset.prevVol) || 1; audioEl.volume = prev; volume.value = Math.round(prev * 100); }
    updateVolIcon(audioEl.volume);
  });
  speedBtn.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % speeds.length;
    const s = speeds[speedIdx];
    audioEl.playbackRate = s;
    speedBtn.textContent = s + '×';
  });
  if (prevBtn) prevBtn.addEventListener('click', () => goToAdjacentStory(-1, false));
  if (nextBtn) nextBtn.addEventListener('click', () => goToAdjacentStory(1, false));
  if (loopBtn) {
    applyRepeatButtonState(loopBtn);
    loopBtn.addEventListener('click', () => {
      repeatMode = (repeatMode + 1) % 5;
      repeatCounter = 0;
      applyRepeatButtonState(loopBtn);
    });
  }
  audioEl.volume = 1;
}
function loadStoryForEdit(id){
  const book = getBook();
  if (!book) return;
  let foundStory = null;
  let foundLesson = null;
  for (const l of book.lessons) {
    const s = (l.stories || []).find(x => x.id === id);
    if (s) { foundStory = s; foundLesson = l; break; }
  }
  if (!foundStory) { toast('داستان پیدا نشد', 'error'); return; }

  storyEditId = id;

  if (foundLesson && state.activeLessonId !== foundLesson.id) {
    state.activeLessonId = foundLesson.id;
    save();
    renderAll();
  }

  document.getElementById('storyTitleInput').value = foundStory.title || '';
  document.getElementById('storyAudioInput').value = foundStory.audio || '';
  document.getElementById('storyCoverInput').value = foundStory.coverImage || '';
  document.getElementById('storyColorInput').value = safeCoverColor(foundStory.coverColor);
  document.getElementById('storySentencesInput').value = (foundStory.sentences || []).map(x => x.de + ' | ' + x.fa).join('\n');

  switchTab('manage-story');
  setTimeout(() => {
    const tsel = document.getElementById('storyTargetLesson');
    if (tsel) tsel.value = foundLesson.id;
    const cb = document.getElementById('cancelStoryEditBtn');
    if (cb) cb.style.display = 'inline-block';
    document.getElementById('storyTitleInput').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}
function saveStory(){
  const title = document.getElementById('storyTitleInput').value.trim();
  if (!title) { toast('عنوان لازمه', 'error'); return; }

  const targetId = document.getElementById('storyTargetLesson').value;
  const target = getLessonById(targetId);
  if (!target) { toast('درس مقصد رو انتخاب کن', 'error'); return; }

  const audio = document.getElementById('storyAudioInput').value.trim();
  const cover = document.getElementById('storyCoverInput').value.trim();
  const color = safeCoverColor(document.getElementById('storyColorInput').value);
  const lines = document.getElementById('storySentencesInput').value.split(/\r?\n/);
  const sentences = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const sep = line.indexOf('|');
    if (sep < 1) { toast('فرمت: «آلمانی | فارسی»', 'error'); return; }
    const de = line.slice(0, sep).trim();
    const fa = line.slice(sep + 1).trim();
    if (!de || !fa) { toast('فرمت خط اشتباه', 'error'); return; }
    sentences.push({ de, fa });
  }
  if (!sentences.length) { toast('حداقل یک جمله لازمه', 'error'); return; }

  let isEdit = false;
  if (storyEditId) {
    const book = getBook();
    let foundStory = null;
    if (book) {
      for (const l of book.lessons) {
        const s = (l.stories || []).find(x => x.id === storyEditId);
        if (s) { foundStory = s; break; }
      }
    }
    if (foundStory) {
      foundStory.title = title;
      foundStory.audio = audio;
      foundStory.coverImage = cover;
      foundStory.coverColor = color;
      foundStory.sentences = sentences;
      isEdit = true;
    }
  }

  if (!isEdit) {
    if (!Array.isArray(target.stories)) target.stories = [];
    target.stories.push({ id: uid(), title, audio, coverImage: cover, coverColor: color, sentences });
  }

  save();
  resetStoryForm();
  renderAll(); populateLessonTargets();

  document.getElementById('storyTitleInput').value = '';
  document.getElementById('storyAudioInput').value = '';
  document.getElementById('storyCoverInput').value = '';
  document.getElementById('storyColorInput').value = '#6366f1';
  document.getElementById('storySentencesInput').value = '';

  toast(isEdit ? `✅ داستان «${title}» ویرایش شد` : `✅ داستان «${title}» به «${target.title}» اضافه شد`, 'success');
}
function resetStoryForm(){
  storyEditId = null;
  document.getElementById('storyTitleInput').value = '';
  document.getElementById('storyAudioInput').value = '';
  document.getElementById('storyCoverInput').value = '';
  document.getElementById('storyColorInput').value = '#6366f1';
  document.getElementById('storySentencesInput').value = '';
  const cancelBtn = document.getElementById('cancelStoryEditBtn');
  if (cancelBtn) cancelBtn.style.display = 'none';
}

/* ============================================================
   DELETE BOOK
   ============================================================ */
function openDeleteBookModal(){
  const b = getBook();
  if (!b) { toast('کتابی انتخاب نشده', 'error'); return; }
  document.getElementById('delBookName').textContent = b.name;
  document.getElementById('delBookConfirmInput').value = '';
  document.getElementById('confirmDeleteBookBtn').disabled = true;
  document.getElementById('modalDeleteBook').classList.add('active');
  document.body.classList.add('locked');
}
function checkDeleteBookConfirm(){
  const b = getBook();
  if (!b) return;
  const input = document.getElementById('delBookConfirmInput');
  const btn = document.getElementById('confirmDeleteBookBtn');
  btn.disabled = input.value.trim() !== b.name;
}
function confirmDeleteBook(){
  const b = getBook();
  if (!b) return;
  const input = document.getElementById('delBookConfirmInput');
  if (input.value.trim() !== b.name) { toast('نام کتاب مطابقت ندارد', 'error'); return; }
  state.books = state.books.filter(x => x.id !== b.id);
  if (state.books.length) {
    state.activeBookId = state.books[0].id;
    state.activeLessonId = state.books[0].lessons[0]?.id || null;
  } else {
    state.activeBookId = null;
    state.activeLessonId = null;
  }
  save();
  // ✅ legacy پاک بشه
  LEGACY_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch(e){} });
  document.getElementById('modalDeleteBook').classList.remove('active');
  document.body.classList.remove('locked');
  if (state.books.length === 0) showBookLibrary();
  else { renderAll(); populateLessonTargets(); }
  toast(`🗑 کتاب «${b.name}» حذف شد`, 'success');
}

/* ============================================================
   JSON - ADD LESSON
   ============================================================ */
function addFullLessonFromJson(data, textareaEl, statusEl){
  const book = getBook();
  if (!book) { toast('اول یک کتاب انتخاب کن', 'error'); return; }

  const title = (data.title || data.lesson || data.lessonTitle || data.name || '').toString().trim();
  const words = (data.words || []).map(normalizeWord).filter(Boolean);
  const stories = (data.stories || []).map(normalizeStory).filter(Boolean);

  if (!words.length && !stories.length) {
    toast('نه لغتی نه داستانی برای اضافه کردن هست', 'warning');
    return;
  }

  if (title) {
    const newLesson = {
      id: uid(),
      title: title,
      words: words,
      stories: stories,
      isSample: false
    };
    if (!Array.isArray(book.lessons)) book.lessons = [];
    book.lessons.push(newLesson);
    state.activeLessonId = newLesson.id;
    save();
    renderAll(); populateLessonTargets();
    if (textareaEl) textareaEl.value = '';
    if (statusEl) statusEl.innerHTML =
      `<div style="background:rgba(16,185,129,0.12);border:1px solid var(--accent);border-radius:8px;padding:10px;color:var(--accent);font-size:13px;">
        ✅ درس جدید «${esc(newLesson.title)}» ساخته شد<br>
        📝 ${words.length} لغت &nbsp;•&nbsp; 📖 ${stories.length} داستان
      </div>`;
    toast(`✅ درس «${newLesson.title}» اضافه شد`, 'success');
    return;
  }

  const targetId = document.getElementById('jsonTargetLesson').value;
  const target = getLessonById(targetId);
  if (!target) { toast('درس مقصد رو انتخاب کن', 'error'); return; }
  if (!Array.isArray(target.words)) target.words = [];
  if (!Array.isArray(target.stories)) target.stories = [];

  let addedW = 0, dupW = 0, addedS = 0;
  words.forEach(w => {
    if (target.words.some(x => x.de.toLowerCase() === w.de.toLowerCase())) { dupW++; return; }
    target.words.push(w); addedW++;
  });
  stories.forEach(s => {
    target.stories.push(s); addedS++;
  });

  save();
  renderAll(); populateLessonTargets();
  if (textareaEl) textareaEl.value = '';
  if (statusEl) statusEl.innerHTML =
    `<div style="color:var(--accent);font-size:13px;">✅ ${addedW} لغت و ${addedS} داستان به «${esc(target.title)}» اضافه شد${dupW ? ` (${dupW} تکراری رد شد)` : ''}</div>`;
  toast(`✅ ${addedW} لغت + ${addedS} داستان اضافه شد`, 'success');
}

/* ============================================================
   JSON IMPORT / EXPORT
   ============================================================ */
function importFullBook(file){
  const status = document.getElementById('fullBookStatus');
  status.innerHTML = `<div style="color:var(--info);font-size:13px;">⏳ در حال خواندن...</div>`;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      let rawBooks = [];
      if (data.books && Array.isArray(data.books)) rawBooks = data.books;
      else if (data.lessons && Array.isArray(data.lessons)) rawBooks = [data];
      else if (Array.isArray(data) && data.length > 0 && data[0].lessons) rawBooks = data;
      else if (Array.isArray(data) && data.length > 0 && data[0].words) {
        rawBooks = [{ name: file.name.replace('.json',''), level: 'A1.1', lessons: [{ title: 'درس 1', words: data }] }];
      } else {
        status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ فرمت کتاب شناسایی نشد</div>`;
        return;
      }
      const newBooks = rawBooks.map(b => normalizeBook(b)).filter(Boolean);
      if (!newBooks.length) { status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ کتاب معتبری نبود</div>`; return; }
      newBooks.forEach(nb => {
        ensureSingleSampleLesson(nb);
        state.books.push(nb);
      });
      state.activeBookId = newBooks[0].id;
      state.activeLessonId = newBooks[0].lessons[0]?.id;
      save(); renderAll(); populateLessonTargets();
      let totalLessons = 0, totalWords = 0;
      newBooks.forEach(nb => { totalLessons += nb.lessons.length; nb.lessons.forEach(l => totalWords += l.words.length); });
      status.innerHTML = `<div style="background:rgba(16,185,129,0.1);border:1px solid var(--accent);border-radius:8px;padding:12px;font-size:13px;">
        ✅ <b>${newBooks.length}</b> کتاب، <b>${totalLessons}</b> درس، <b>${totalWords}</b> کلمه اضافه شد
        <br><small style="color:var(--muted);">🔒 درس نمونه به هر کتاب اضافه شد</small>
      </div>`;
      toast(`${newBooks.length} کتاب اضافه شد (با درس نمونه)`, 'success');
    } catch(err) {
      status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ خطا: ${esc(err.message)}</div>`;
    }
  };
  reader.readAsText(file);
}
function replaceFullBook(file){
  const status = document.getElementById('fullBookStatus');
  if (!confirm('⚠️ همه کتاب‌ها پاک می‌شن. مطمئنی؟')) return;
  status.innerHTML = `<div style="color:var(--info);font-size:13px;">⏳ در حال خواندن...</div>`;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      let rawBooks = [];
      if (data.books && Array.isArray(data.books)) rawBooks = data.books;
      else if (data.lessons && Array.isArray(data.lessons)) rawBooks = [data];
      else if (Array.isArray(data) && data.length > 0 && data[0].lessons) rawBooks = data;
      else { status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ فرمت شناسایی نشد</div>`; return; }
      const newBooks = rawBooks.map(b => normalizeBook(b)).filter(Boolean);
      if (!newBooks.length) { status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ کتاب معتبری نبود</div>`; return; }
      newBooks.forEach(nb => {
        ensureSingleSampleLesson(nb);
      });
      state.books = newBooks;
      state.activeBookId = newBooks[0].id;
      state.activeLessonId = newBooks[0].lessons[0]?.id;
      save(); renderAll(); populateLessonTargets();
      status.innerHTML = `<div style="color:var(--accent);font-size:13px;">✅ ${newBooks.length} کتاب جایگزین شد (با درس نمونه)</div>`;
      toast('جایگزین شد (با درس نمونه)', 'success');
    } catch(err) {
      status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ خطا: ${esc(err.message)}</div>`;
    }
  };
  reader.readAsText(file);
}
function importJsonWords(){
  const raw = document.getElementById('jsonInput').value.trim();
  if (!raw) { toast('JSON خالیه', 'error'); return; }

  let data;
  try { data = JSON.parse(raw); }
  catch(e){ toast('JSON نامعتبر: ' + e.message, 'error'); return; }

  if (!Array.isArray(data) && (data.title || data.lesson || data.words || data.stories) && !data.name && !data.lessons) {
    addFullLessonFromJson(data, document.getElementById('jsonInput'), document.getElementById('jsonPreview'));
    return;
  }

  let arr = null;
  if (Array.isArray(data)) arr = data;
  else if (data.words && Array.isArray(data.words)) arr = data.words;
  if (!arr) { toast('فرمت نامعتبر — باید آرایه لغات یا آبجکت درس باشد', 'warning'); return; }

  const targetId = document.getElementById('jsonTargetLesson').value;
  const target = getLessonById(targetId);
  if (!target) { toast('درس مقصد رو انتخاب کن', 'error'); return; }
  if (!Array.isArray(target.words)) target.words = [];

  let added = 0, dup = 0, skip = 0;
  arr.forEach(item => {
    const w = normalizeWord(item);
    if (!w) { skip++; return; }
    if (target.words.some(x => x.de.toLowerCase() === w.de.toLowerCase())) { dup++; return; }
    target.words.push(w); added++;
  });

  save();
  renderAll(); populateLessonTargets();

  document.getElementById('jsonInput').value = '';
  document.getElementById('jsonPreview').innerHTML = '';

  const msg = `✅ ${added} اضافه${dup ? `، ${dup} تکراری` : ''}${skip ? `، ${skip} نامعتبر` : ''} به «${target.title}»`;
  toast(msg, added ? 'success' : 'warning');
  document.getElementById('jsonPreview').innerHTML =
    `<div style="color:var(--accent);font-size:13px;">${msg}</div>`;
}
function validateJson(){
  const raw = document.getElementById('jsonInput').value.trim();
  const preview = document.getElementById('jsonPreview');
  if (!raw) { preview.innerHTML = ''; return; }
  let data;
  try { data = JSON.parse(raw); }
  catch(e){ preview.innerHTML = `<div style="color:var(--danger);">❌ ${esc(e.message)}</div>`; return; }

  if (!Array.isArray(data) && (data.title || data.lesson || data.words || data.stories) && !data.name && !data.lessons) {
    const words = (data.words || []).map(normalizeWord).filter(Boolean);
    const stories = (data.stories || []).map(normalizeStory).filter(Boolean);
    const title = data.title || data.lesson || data.name || '';
    preview.innerHTML = `<div style="background:var(--bg);padding:10px;border-radius:8px;font-size:13px;">
      <div style="color:var(--accent);">✅ آبجکت درس: «${esc(title || 'بدون عنوان')}»</div>
      <div style="color:var(--accent);">✅ ${words.length} لغت معتبر</div>
      <div style="color:var(--accent);">✅ ${stories.length} داستان معتبر</div>
      ${title ? '<div style="color:var(--info);margin-top:4px;">با «اضافه» → درس جدید ساخته می‌شه</div>' : '<div style="color:var(--warning);margin-top:4px;">بدون title → به درس انتخاب‌شده اضافه می‌شه</div>'}
    </div>`;
    return;
  }

  let arr = Array.isArray(data) ? data : (data.words && Array.isArray(data.words) ? data.words : null);
  if (!arr) { preview.innerHTML = `<div style="color:var(--danger);">❌ باید آرایه لغات یا آبجکت درس باشد</div>`; return; }
  const valid = arr.map(normalizeWord).filter(Boolean);
  preview.innerHTML = `<div style="background:var(--bg);padding:10px;border-radius:8px;font-size:13px;">
    <div style="color:var(--accent);">✅ ${valid.length} معتبر</div>
    <div style="color:var(--danger);">❌ ${arr.length - valid.length} نامعتبر</div>
  </div>`;
}
function exportData(data, filename){
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function exportBook(){
  const b = getBook(); if (!b) return;
  exportData(b, `${b.name}-${b.level}.json`);
  toast('دانلود شد', 'success');
}
function exportLesson(){
  const l = getLesson(), b = getBook();
  if (!l) { toast('درسی انتخاب نشده', 'error'); return; }
  const out = {
    book: b ? b.name : '',
    lesson: l.title,
    words: l.words || [],
    stories: l.stories || []
  };
  const safeName = (b ? b.name : 'book') + '-' + l.title;
  exportData(out, `${safeName}.json`);
  toast(`📥 درس «${l.title}» دانلود شد`, 'success');
}
function exportBad(){
  const words = getWords().filter(w => normalizeStatus(w) === 'bad');
  if (!words.length) { toast('کلمه‌ای نداری!', 'warning'); return; }
  exportData(words, `bad-words-${Date.now()}.json`);
  toast('دانلود شد', 'success');
}

/* ============================================================
   LIBRARY JSON IMPORT MODAL
   ============================================================ */
function openLibraryImportModal(){
  document.getElementById('modalLibraryImport').classList.add('active');
  document.body.classList.add('locked');
  document.getElementById('libImportUrlBox').classList.add('hidden');
  document.getElementById('libImportPasteBox').classList.add('hidden');
  document.getElementById('libImportUrlStatus').innerHTML = '';
  document.getElementById('libImportPasteStatus').innerHTML = '';
  document.getElementById('libImportUrlInput').value = '';
  document.getElementById('libImportPasteInput').value = '';
}
function closeLibraryImportModal(){
  document.getElementById('modalLibraryImport').classList.remove('active');
  document.body.classList.remove('locked');
}
function processLibraryImportData(data, fileName){
  let rawBooks = [];
  if (data.books && Array.isArray(data.books)) rawBooks = data.books;
  else if (data.lessons && Array.isArray(data.lessons)) rawBooks = [data];
  else if (Array.isArray(data) && data.length > 0 && data[0].lessons) rawBooks = data;
  else if (Array.isArray(data) && data.length > 0 && data[0].words) {
    rawBooks = [{ name: (fileName || 'کتاب جدید').replace('.json',''), level: 'A1.1', lessons: [{ title: 'درس 1', words: data }] }];
  } else {
    toast('❌ فرمت کتاب شناسایی نشد. باید کتاب کامل با lessons باشه.', 'error');
    return;
  }
  const newBooks = rawBooks.map(b => normalizeBook(b)).filter(Boolean);
  if (!newBooks.length) { toast('❌ کتاب معتبری نبود', 'error'); return; }
  newBooks.forEach(nb => {
    ensureSingleSampleLesson(nb);
  });
  newBooks.forEach(nb => state.books.push(nb));
  state.activeBookId = newBooks[0].id;
  state.activeLessonId = newBooks[0].lessons[0]?.id;
  save();
  renderBookLibrary();
  closeLibraryImportModal();
  let totalLessons = 0, totalWords = 0;
  newBooks.forEach(nb => { totalLessons += nb.lessons.length; nb.lessons.forEach(l => totalWords += l.words.length); });
  toast(`✅ ${newBooks.length} کتاب (${totalLessons} درس، ${totalWords} کلمه) اضافه شد`, 'success');
}
function fetchLibraryFromUrl(){
  const urlInput = document.getElementById('libImportUrlInput');
  const status = document.getElementById('libImportUrlStatus');
  const url = urlInput.value.trim();
  if (!url) { status.innerHTML = `<div style="color:var(--danger);font-size:13px;">آدرس لازمه</div>`; return; }
  status.innerHTML = `<div style="color:var(--info);font-size:13px;">⏳ در حال دریافت...</div>`;
  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(text => {
      try {
        const data = JSON.parse(text);
        const fileName = url.split('/').pop() || 'book.json';
        processLibraryImportData(data, fileName);
      } catch(err) {
        status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ JSON نامعتبر: ${esc(err.message)}</div>`;
      }
    })
    .catch(err => {
      status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ خطا در دریافت: ${esc(err.message)}<br><small>ممکنه CORS باشه. از روش فایل یا پیست استفاده کن.</small></div>`;
    });
}
function addLibraryFromPaste(){
  const input = document.getElementById('libImportPasteInput');
  const status = document.getElementById('libImportPasteStatus');
  const raw = input.value.trim();
  if (!raw) { status.innerHTML = `<div style="color:var(--danger);font-size:13px;">JSON خالیه</div>`; return; }
  let data;
  try { data = JSON.parse(raw); }
  catch(e) { status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ JSON نامعتبر: ${esc(e.message)}</div>`; return; }
  processLibraryImportData(data, 'pasted-book.json');
}

/* ============================================================
   FILE UPLOAD (تب JSON)
   ============================================================ */
function setupFileDropZone(){
  const zone = document.getElementById('bigDropZone');
  const input = document.getElementById('jsonFileInput');
  const quickBtn = document.getElementById('quickJsonBtn');
  const quickInput = document.getElementById('quickJsonFile');
  if (!zone || !input) return;
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', e => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('dragover'); });
  zone.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', e => {
    if (e.target.files[0]) handleFileUpload(e.target.files[0]);
    e.target.value = '';
  });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    if (zone && !zone.contains(e.target) && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });
  const browseBtn = document.getElementById('browseFileBtn');
  if (browseBtn) browseBtn.addEventListener('click', e => { e.stopPropagation(); input.click(); });
  if (quickBtn && quickInput) {
    quickBtn.addEventListener('click', () => quickInput.click());
    quickInput.addEventListener('change', e => {
      if (e.target.files[0]) handleFileUpload(e.target.files[0], true);
      e.target.value = '';
    });
  }
}
function handleFileUpload(file, forceActiveLesson){
  const status = document.getElementById('fileStatus');
  if (status) status.innerHTML = `<div style="color:var(--info);font-size:13px;">⏳ در حال خواندن...</div>`;
  if (!file.name.toLowerCase().endsWith('.json')) {
    if (status) status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ فقط .json</div>`;
    toast('فقط .json', 'error'); return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      processUploadedData(data, file.name, status, forceActiveLesson);
    } catch(err) {
      if (status) status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ JSON نامعتبر</div>`;
      toast('JSON نامعتبر', 'error');
    }
  };
  reader.readAsText(file);
}
function processUploadedData(data, filename, status, forceActiveLesson){
  const book = getBook();
  if (!book) { toast('اول یک کتاب انتخاب کن', 'error'); return; }
  function show(html){ if (status) status.innerHTML = html; }

  function extractLessonTitle(obj){
    if (!obj) return '';
    return (obj.title || obj.lesson || obj.lessonTitle || obj.name || '').toString().trim();
  }

  function addNewLessonFromObject(lessonObj, fallbackTitle){
    const title = extractLessonTitle(lessonObj) || fallbackTitle || 'درس جدید';
    const nWords = Array.isArray(lessonObj.words) ? lessonObj.words.map(normalizeWord).filter(Boolean) : [];
    const nStories = Array.isArray(lessonObj.stories) ? lessonObj.stories.map(normalizeStory).filter(Boolean) : [];
    if (!nWords.length && !nStories.length) return null;
    const newLesson = { id: uid(), title: title, words: nWords, stories: nStories, isSample: false };
    if (!Array.isArray(book.lessons)) book.lessons = [];
    book.lessons.push(newLesson);
    return newLesson;
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const hasRootWords = Array.isArray(data.words);
    const hasRootStories = Array.isArray(data.stories);
    const hasLessonsArray = Array.isArray(data.lessons);

    if ((hasRootWords || hasRootStories) && !hasLessonsArray) {
      const newLesson = addNewLessonFromObject(data, 'درس جدید');
      if (!newLesson) {
        show(`<div style="color:var(--danger);font-size:13px;">❌ نه لغت معتبری داشت نه داستان معتبری</div>`);
        toast('داده معتبری نبود', 'error');
        return;
      }
      state.activeLessonId = newLesson.id;
      save();
      renderAll(); populateLessonTargets();
      show(`<div style="background:rgba(16,185,129,0.12);border:1px solid var(--accent);border-radius:8px;padding:10px;color:var(--accent);font-size:13px;">
        ✅ درس جدید «${esc(newLesson.title)}» ساخته شد<br>
        📝 ${newLesson.words.length} لغت &nbsp;•&nbsp; 📖 ${newLesson.stories.length} داستان
      </div>`);
      toast(`✅ درس «${newLesson.title}» اضافه شد`, 'success');
      return;
    }

    if (Array.isArray(data.books)) {
      const booksData = data.books.map(b => normalizeBook(b)).filter(Boolean);
      if (!booksData.length) { show(`<div style="color:var(--danger);font-size:13px;">❌ کتاب معتبری نبود</div>`); return; }
      show('');
      openImportBookPopup({ type: 'multi', data: booksData });
      return;
    }

    if (hasLessonsArray) {
      const bookData = {
        name: data.name || data.title || data.book || filename.replace('.json', ''),
        level: data.level || 'A1.1',
        coverImage: data.coverImage || '',
        lessons: data.lessons.map((l, i) => normalizeLesson(l, 'درس ' + (i+1))).filter(Boolean)
      };
      if (!bookData.lessons.length) { show(`<div style="color:var(--danger);font-size:13px;">❌ درس معتبری نبود</div>`); return; }
      show('');
      openImportBookPopup({ type: 'single', data: bookData });
      return;
    }
  }

  if (Array.isArray(data)) {
    const looksLikeLessons = data.length > 0 && data.every(item =>
      item && typeof item === 'object' &&
      (item.title || item.lesson || item.name) &&
      (Array.isArray(item.words) || Array.isArray(item.stories))
    );

    if (looksLikeLessons) {
      let addedLessons = 0, totalWords = 0, totalStories = 0;
      let lastLesson = null;
      data.forEach(lessonRaw => {
        const nl = addNewLessonFromObject(lessonRaw, 'درس');
        if (!nl) return;
        addedLessons++;
        totalWords += nl.words.length;
        totalStories += nl.stories.length;
        lastLesson = nl;
      });
      if (addedLessons > 0) {
        state.activeLessonId = lastLesson.id;
        save(); renderAll(); populateLessonTargets();
        show(`<div style="color:var(--accent);font-size:13px;">✅ ${addedLessons} درس جدید با ${totalWords} لغت و ${totalStories} داستان اضافه شد</div>`);
        toast(`✅ ${addedLessons} درس اضافه شد`, 'success');
      } else {
        show(`<div style="color:var(--danger);font-size:13px;">❌ هیچ درس معتبری نبود</div>`);
      }
      return;
    }

    const targetId = forceActiveLesson ? state.activeLessonId : (document.getElementById('fileTargetLesson').value || state.activeLessonId);
    const target = getLessonById(targetId);
    if (!target) { show(`<div style="color:var(--danger);font-size:13px;">❌ درس مقصد انتخاب نشده</div>`); return; }
    let added = 0, dup = 0, skip = 0;
    data.forEach(item => {
      const w = normalizeWord(item);
      if (!w) { skip++; return; }
      if (target.words.some(x => x.de.toLowerCase() === w.de.toLowerCase())) { dup++; return; }
      target.words.push(w); added++;
    });
    save(); renderAll(); populateLessonTargets();
    show(`<div style="color:var(--accent);font-size:13px;">✅ ${added} لغت اضافه شد به «${esc(target.title)}»${dup ? `، ${dup} تکراری` : ''}${skip ? `، ${skip} نامعتبر` : ''}</div>`);
    toast(`${added} لغت اضافه شد`, 'success');
    return;
  }

  if (data && typeof data === 'object' && Array.isArray(data.words)) {
    const targetId = forceActiveLesson ? state.activeLessonId : (document.getElementById('fileTargetLesson').value || state.activeLessonId);
    const target = getLessonById(targetId);
    if (!target) { show(`<div style="color:var(--danger);font-size:13px;">❌ درس مقصد انتخاب نشده</div>`); return; }
    let added = 0, dup = 0;
    data.words.forEach(item => {
      const w = normalizeWord(item);
      if (!w) return;
      if (target.words.some(x => x.de.toLowerCase() === w.de.toLowerCase())) { dup++; return; }
      target.words.push(w); added++;
    });
    save(); renderAll(); populateLessonTargets();
    show(`<div style="color:var(--accent);font-size:13px;">✅ ${added} لغت اضافه شد به «${esc(target.title)}»${dup ? `، ${dup} تکراری` : ''}</div>`);
    toast(`${added} لغت اضافه شد`, 'success');
    return;
  }

  show(`<div style="color:var(--danger);font-size:13px;">❌ فرمت شناسایی نشد</div>`);
  toast('فرمت نامعتبر', 'error');
}

/* ============================================================
   TABS
   ============================================================ */
function switchTab(name){
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
  const el = document.getElementById('tab-' + name);
  if (el) el.classList.remove('hidden');
  if (name === 'practice') renderFolders();
  if (name === 'stories') renderStories();
  if (name === 'list') renderWordTable();
  if (name === 'cards') renderCards();
  if (name === 'quiz') renderQuizHome();
  if (name === 'json' || name === 'manage' || name === 'manage-story') populateLessonTargets();
}
function renderAll(){
  renderBookSelect();
  renderLessonSelect();
  renderStats();
  renderWordTable();
  renderFolders();
  renderStories();
  renderCards();
  populateLessonTargets();
  updateAppTitle();
  updateReviewBanner();
  updateDirectionLabel();
}

/* ============================================================
   MODAL HELPERS
   ============================================================ */
function openBookModal(){
  editingBookId = null;
  const titleEl = document.getElementById('bookModalTitle');
  const nameEl = document.getElementById('bookNameInput');
  const levelEl = document.getElementById('bookLevelInput');
  const coverEl = document.getElementById('bookCoverInput');
  const saveBtn = document.getElementById('saveBookBtn');
  if (titleEl) titleEl.textContent = '📚 کتاب جدید';
  nameEl.value = '';
  levelEl.value = 'A1.1';
  if (coverEl) coverEl.value = '';
  if (saveBtn) saveBtn.textContent = '💾 ذخیره';
  document.getElementById('modalBook').classList.add('active');
  document.body.classList.add('locked');
}
function openEditBookModal(bookId){
  const book = state.books.find(b => b.id === bookId);
  if (!book) { toast('کتاب پیدا نشد', 'error'); return; }
  editingBookId = bookId;
  const titleEl = document.getElementById('bookModalTitle');
  const nameEl = document.getElementById('bookNameInput');
  const levelEl = document.getElementById('bookLevelInput');
  const coverEl = document.getElementById('bookCoverInput');
  const saveBtn = document.getElementById('saveBookBtn');
  if (titleEl) titleEl.textContent = '✏️ ویرایش کتاب';
  nameEl.value = book.name || '';
  levelEl.value = book.level || 'A1.1';
  if (coverEl) coverEl.value = book.coverImage || '';
  if (saveBtn) saveBtn.textContent = '💾 ذخیره تغییرات';
  document.getElementById('modalBook').classList.add('active');
  document.body.classList.add('locked');
}
function openLessonModal(){
  const b = getBook();
  if (!b) { toast('اول یه کتاب انتخاب کن یا بساز', 'error'); return; }
  const input = document.getElementById('lessonTitleInput');
  const saveBtn = document.getElementById('saveLessonBtn');
  const titleEl = document.getElementById('modalLessonTitle');
  if (input) input.value = '';
  if (titleEl) titleEl.textContent = '➕ درس جدید';
  if (saveBtn) {
    saveBtn.textContent = '💾 ذخیره';
    delete saveBtn.dataset.editId;
  }
  const modal = document.getElementById('modalLesson');
  if (modal) modal.classList.add('active');
  document.body.classList.add('locked');
  setTimeout(() => { if (input) input.focus(); }, 100);
}
function openEditLessonModal(){
  const l = getLesson();
  if (!l) { toast('درسی انتخاب نشده', 'error'); return; }
  if (l.isSample) {
    toast('🔒 عنوان درس نمونه قابل ویرایش نیست. یه درس جدید بساز.', 'warning');
    return;
  }
  const input = document.getElementById('lessonTitleInput');
  const saveBtn = document.getElementById('saveLessonBtn');
  const titleEl = document.getElementById('modalLessonTitle');
  if (input) input.value = l.title || '';
  if (titleEl) titleEl.textContent = '✏️ ویرایش نام درس';
  if (saveBtn) {
    saveBtn.textContent = '💾 ذخیره تغییرات';
    saveBtn.dataset.editId = l.id;
  }
  document.getElementById('modalLesson').classList.add('active');
  document.body.classList.add('locked');
  setTimeout(() => { if (input) { input.focus(); input.select(); } }, 100);
}

/* ============================================================
   EVENTS
   ============================================================ */
function bindEvents(){
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  const bookSel = document.getElementById('bookSelect');
  if (bookSel) bookSel.addEventListener('change', e => {
    if (practice.active) exitPractice();
    state.activeBookId = e.target.value;
    const b = getBook();
    if (b && b.lessons.length) {
      const saved = state.lastLessonByBook && state.lastLessonByBook[b.id];
      if (saved && b.lessons.find(l => l.id === saved)) {
        state.activeLessonId = saved;
      } else {
        state.activeLessonId = b.lessons[0].id;
      }
    }
    save(); updateAppTitle(); renderAll();
  });
  const lessonSel = document.getElementById('lessonSelect');
  if (lessonSel) lessonSel.addEventListener('change', e => {
    if (practice.active) exitPractice();
    state.activeLessonId = e.target.value;
    save(); renderAll();
  });

  const addBookBtn = document.getElementById('addBookBtn');
  if (addBookBtn) addBookBtn.addEventListener('click', openBookModal);
  const addLessonBtn = document.getElementById('addLessonBtn');
  if (addLessonBtn) addLessonBtn.addEventListener('click', openLessonModal);
  const editLessonBtn = document.getElementById('editLessonBtn');
  if (editLessonBtn) editLessonBtn.addEventListener('click', openEditLessonModal);
  const delBookBtn = document.getElementById('delBookBtn');
  if (delBookBtn) delBookBtn.addEventListener('click', openDeleteBookModal);

  const delLessonBtn = document.getElementById('delLessonBtn');
  if (delLessonBtn) delLessonBtn.addEventListener('click', () => {
    const l = getLesson(), b = getBook();
    if (!l) { toast('درسی انتخاب نشده', 'warning'); return; }
    if (!b) { toast('کتابی انتخاب نشده', 'warning'); return; }

    if (l.isSample) {
      toast('🔒 درس نمونه قابل حذف نیست. می‌تونید ویرایشش کنید یا یه درس جدید بسازید.', 'error');
      return;
    }

    if (b.lessons.length <= 1) {
      if (!confirm(`«${l.title}» تنها درس این کتابه.\nاگه حذفش کنی، یه درس خالی جدید جاش ساخته می‌شه.\n\nادامه بدی؟`)) return;
      const emptyLesson = { id: uid(), title: 'Lektion 1', words: [], stories: [], isSample: false };
      b.lessons = [emptyLesson];
      state.activeLessonId = emptyLesson.id;
      save(); renderAll(); populateLessonTargets();
      toast('🗑 درس حذف و یه درس خالی جدید ساخته شد', 'success');
      return;
    }

    const wordCount = (l.words || []).length;
    const storyCount = (l.stories || []).length;
    const msg = `⚠️ حذف درس «${l.title}»\n\nاین درس شامل:\n• ${wordCount} لغت\n• ${storyCount} داستان\n\nبرگشت‌پذیر نیست. مطمئنی؟`;
    if (!confirm(msg)) return;

    const idx = b.lessons.findIndex(x => x.id === l.id);
    b.lessons = b.lessons.filter(x => x.id !== l.id);
    const nextIdx = Math.min(idx, b.lessons.length - 1);
    state.activeLessonId = b.lessons[nextIdx].id;

    save(); renderAll(); populateLessonTargets();
    toast(`🗑 درس «${l.title}» حذف شد`, 'success');
  });

  const searchBox = document.getElementById('searchBox');
  if (searchBox) searchBox.addEventListener('input', renderWordTable);
  const filterStatus = document.getElementById('filterStatus');
  if (filterStatus) filterStatus.addEventListener('change', renderWordTable);

  const cardSearch = document.getElementById('cardSearch');
  if (cardSearch) cardSearch.addEventListener('input', renderCards);
  const cardFilter = document.getElementById('cardFilter');
  if (cardFilter) cardFilter.addEventListener('change', renderCards);
  const csa = document.getElementById('cardSortAlpha');
  if (csa) csa.addEventListener('click', () => { cardSortMode = 'alpha'; renderCards(); });
  const csr = document.getElementById('cardSortRandom');
  if (csr) csr.addEventListener('click', () => { cardSortMode = 'random'; renderCards(); });
  const css = document.getElementById('cardSortStatus');
  if (css) css.addEventListener('click', () => { cardSortMode = 'status'; renderCards(); });

  const startSrsBtn = document.getElementById('startSrsBtn');
  if (startSrsBtn) startSrsBtn.addEventListener('click', () => startPractice('due'));

  const exitPracticeBtn = document.getElementById('exitPractice');
  if (exitPracticeBtn) exitPracticeBtn.addEventListener('click', exitPractice);

  // ✅ چرخش کارت + قطع صدا هنگام چرخش
  const flashcardStage = document.getElementById('flashcardStage');
  if (flashcardStage) flashcardStage.addEventListener('click', () => {
    const inner = document.getElementById('flashcardInner');
    inner.classList.toggle('flipped');
    // ✅ اگر کارت برگشت، صدا رو قطع کن
    if (inner.classList.contains('flipped')) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (currentAudio) {
        try { currentAudio.pause(); currentAudio.currentTime = 0; } catch(e){}
        currentAudio = null;
      }
    }
  });

  const fcSpeakBtn = document.getElementById('fcSpeakBtn');
  if (fcSpeakBtn) fcSpeakBtn.addEventListener('click', () => {
    const w = practice.queue[practice.index];
    if (w) speak(w.de, w.exAudio);
  });
  document.querySelectorAll('[data-rate]').forEach(btn => {
    btn.addEventListener('click', () => rateCurrent(btn.dataset.rate));
  });
  const prevPracticeBtn = document.getElementById('prevPracticeBtn');
  if (prevPracticeBtn) prevPracticeBtn.addEventListener('click', () => {
    if (!practice.active || practice.index === 0) return;
    practice.index--;
    const w = practice.queue[practice.index];
    const hadRating = practice.ratings && practice.ratings[practice.index];
    if (hadRating && w) { undoReviewWord(w); delete practice.ratings[practice.index]; }
    showCurrentPracticeCard(); renderStats();
    if (hadRating) toast('🔄 برگشت', 'warning');
  });
  const autoPlayToggle = document.getElementById('autoPlayToggle');
  if (autoPlayToggle) autoPlayToggle.addEventListener('click', toggleAutoPlay);
  const autoPlayToggleSession = document.getElementById('autoPlayToggleSession');
  if (autoPlayToggleSession) autoPlayToggleSession.addEventListener('click', toggleAutoPlay);

  // ✅ دکمه قطع صدا
  const muteAudioBtn = document.getElementById('muteAudioBtn');
  if (muteAudioBtn) {
    muteAudioBtn.addEventListener('click', () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (currentAudio) {
        try { currentAudio.pause(); currentAudio.currentTime = 0; } catch(e){}
        currentAudio = null;
      }
      if (autoPlayWord) {
        autoPlayWord = false;
        try { localStorage.setItem(AUTOPLAY_KEY, 'false'); } catch(e){}
        updateAutoPlayUI();
        toast('🔇 صدا قطع و پخش خودکار خاموش شد', 'warning');
      } else {
        toast('🔇 صدا قطع شد', 'warning');
      }
    });
  }

  // ✅ دکمه‌های جهت / تئاتر / منوی پوشه / ریست
  const flipDirBtn = document.getElementById('flipDirectionBtn');
  if (flipDirBtn) flipDirBtn.addEventListener('click', togglePracticeDirection);
  const flipDirFolderBtn = document.getElementById('flipDirectionFolderBtn');
  if (flipDirFolderBtn) flipDirFolderBtn.addEventListener('click', togglePracticeDirection);
  updateDirectionLabel();

  const practiceFullscreenBtn = document.getElementById('practiceFullscreenBtn');
  if (practiceFullscreenBtn) practiceFullscreenBtn.addEventListener('click', toggleTheaterMode);
  const practiceTheaterClose = document.getElementById('practiceTheaterClose');
  if (practiceTheaterClose) practiceTheaterClose.addEventListener('click', exitTheaterMode);

  const hamburgerBtn = document.getElementById('practiceHamburgerBtn');
  if (hamburgerBtn) hamburgerBtn.addEventListener('click', () => {
    buildFolderMenu();
    document.getElementById('practiceFolderMenu').classList.remove('hidden');
  });
  const closeFolderMenuBtn = document.getElementById('closeFolderMenuBtn');
  if (closeFolderMenuBtn) closeFolderMenuBtn.addEventListener('click', () => {
    document.getElementById('practiceFolderMenu').classList.add('hidden');
  });

  const resetPracticeSettingsBtn = document.getElementById('resetPracticeSettingsBtn');
  if (resetPracticeSettingsBtn) resetPracticeSettingsBtn.addEventListener('click', resetPracticeSettings);

  const addStoryBtn = document.getElementById('addStoryBtn');
  if (addStoryBtn) addStoryBtn.addEventListener('click', () => {
    switchTab('manage-story');
    resetStoryForm();
    setTimeout(() => document.getElementById('storyTitleInput').scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  });
  const saveStoryBtn = document.getElementById('saveStoryBtn');
  if (saveStoryBtn) saveStoryBtn.addEventListener('click', saveStory);
  const cancelStoryBtn = document.getElementById('cancelStoryEditBtn');
  if (cancelStoryBtn) cancelStoryBtn.addEventListener('click', () => { resetStoryForm(); });
  const closeStoryReaderBtn = document.getElementById('closeStoryReader');
  if (closeStoryReaderBtn) closeStoryReaderBtn.addEventListener('click', () => {
    document.getElementById('storyReaderModal').classList.remove('active');
    document.body.classList.remove('locked');
  });

  const saveWordBtn = document.getElementById('saveWordBtn');
  if (saveWordBtn) saveWordBtn.addEventListener('click', () => {
    const target = getLessonById(document.getElementById('wordTargetLesson').value);
    if (!target) { toast('درس مقصد رو انتخاب کن', 'error'); return; }
    const de = document.getElementById('wDe').value.trim();
    const fa = document.getElementById('wFa').value.trim();
    if (!de || !fa) { toast('کلمه و ترجمه لازمه', 'error'); return; }
    target.words.push({
      id: uid(), de, art: document.getElementById('wArt').value,
      plural: document.getElementById('wPlural').value.trim() || '–',
      fa,
      ex: document.getElementById('wEx').value.trim(),
      exMean: document.getElementById('wExMean').value.trim(),
      exAudio: document.getElementById('wExAudio').value.trim(),
      note: document.getElementById('wNote').value.trim(),
      notes: [], status: 'new',
      srs: { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0 }
    });
    save();
    ['wDe','wPlural','wFa','wEx','wExMean','wExAudio','wNote'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('wDe').focus();
    renderAll(); populateLessonTargets();
    toast(`✅ به «${target.title}» اضافه شد`, 'success');
  });

  const importFullBookBtn = document.getElementById('importFullBookBtn');
  if (importFullBookBtn) importFullBookBtn.addEventListener('click', () => document.getElementById('fullBookFileInput').click());
  const replaceFullBookBtn = document.getElementById('replaceFullBookBtn');
  if (replaceFullBookBtn) replaceFullBookBtn.addEventListener('click', () => document.getElementById('replaceBookFileInput').click());
  const fullBookFileInput = document.getElementById('fullBookFileInput');
  if (fullBookFileInput) fullBookFileInput.addEventListener('change', e => {
    if (e.target.files[0]) importFullBook(e.target.files[0]);
    e.target.value = '';
  });
  const replaceBookFileInput = document.getElementById('replaceBookFileInput');
  if (replaceBookFileInput) replaceBookFileInput.addEventListener('change', e => {
    if (e.target.files[0]) replaceFullBook(e.target.files[0]);
    e.target.value = '';
  });
  const exportFullBookBtn = document.getElementById('exportFullBookBtn');
  if (exportFullBookBtn) exportFullBookBtn.addEventListener('click', exportBook);
  const exportAllBooksBtn = document.getElementById('exportAllBooksBtn');
  if (exportAllBooksBtn) exportAllBooksBtn.addEventListener('click', () => {
    exportData(state, `german-vocab-backup-${new Date().toISOString().slice(0,10)}.json`);
    toast('دانلود شد', 'success');
  });

  const importJsonBtn = document.getElementById('importJsonBtn');
  if (importJsonBtn) importJsonBtn.addEventListener('click', importJsonWords);
  const validateJsonBtn = document.getElementById('validateJsonBtn');
  if (validateJsonBtn) validateJsonBtn.addEventListener('click', validateJson);
  const clearJsonBtn = document.getElementById('clearJsonBtn');
  if (clearJsonBtn) clearJsonBtn.addEventListener('click', () => {
    document.getElementById('jsonInput').value = '';
    document.getElementById('jsonPreview').innerHTML = '';
  });

  const exportLessonBtn = document.getElementById('exportLessonBtn');
  if (exportLessonBtn) exportLessonBtn.addEventListener('click', exportLesson);
  const exportBadBtn = document.getElementById('exportBadBtn');
  if (exportBadBtn) exportBadBtn.addEventListener('click', exportBad);
  const exportAllBtn = document.getElementById('exportAllBtn');
  if (exportAllBtn) exportAllBtn.addEventListener('click', () => {
    exportData(state, `german-vocab-backup-${new Date().toISOString().slice(0,10)}.json`);
    toast('دانلود شد', 'success');
  });
  const backupAllBtn = document.getElementById('backupAllBtn');
  if (backupAllBtn) backupAllBtn.addEventListener('click', () => {
    exportData(state, `german-vocab-backup-${new Date().toISOString().slice(0,10)}.json`);
    toast('دانلود شد', 'success');
  });
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (!confirm('همه داده‌ها ریست بشن؟')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch(e){}
    LEGACY_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch(e){} });
    state = defaultData();
    save(); renderAll();
    toast('ریست شد — یک کتاب با درس نمونه ساخته شد', 'success');
  });

  const cancelDeleteBookBtn = document.getElementById('cancelDeleteBookBtn');
  if (cancelDeleteBookBtn) cancelDeleteBookBtn.addEventListener('click', () => {
    document.getElementById('modalDeleteBook').classList.remove('active');
    document.body.classList.remove('locked');
  });
  const delBookConfirmInput = document.getElementById('delBookConfirmInput');
  if (delBookConfirmInput) delBookConfirmInput.addEventListener('input', checkDeleteBookConfirm);
  const confirmDeleteBookBtn = document.getElementById('confirmDeleteBookBtn');
  if (confirmDeleteBookBtn) confirmDeleteBookBtn.addEventListener('click', confirmDeleteBook);

  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => {
      if (e.target === m) {
        m.classList.remove('active');
        document.body.classList.remove('locked');
      }
    });
  });
  const wdm = document.getElementById('wordViewModal');
  if (wdm) wdm.addEventListener('click', e => { if (e.target === wdm) { wdm.classList.remove('active'); document.body.classList.remove('locked'); } });
  const wem = document.getElementById('wordEditModal');
  if (wem) wem.addEventListener('click', e => { if (e.target === wem) closeWordEdit(); });

  const cancelBookBtn = document.getElementById('cancelBookBtn');
  if (cancelBookBtn) cancelBookBtn.addEventListener('click', () => {
    document.getElementById('modalBook').classList.remove('active');
    document.body.classList.remove('locked');
    editingBookId = null;
  });
  const cancelLessonBtn = document.getElementById('cancelLessonBtn');
  if (cancelLessonBtn) cancelLessonBtn.addEventListener('click', () => {
    document.getElementById('modalLesson').classList.remove('active');
    document.body.classList.remove('locked');
    const saveBtn = document.getElementById('saveLessonBtn');
    if (saveBtn) delete saveBtn.dataset.editId;
  });
  const saveBookBtn = document.getElementById('saveBookBtn');
  if (saveBookBtn) saveBookBtn.addEventListener('click', () => {
    const name = document.getElementById('bookNameInput').value.trim();
    const level = document.getElementById('bookLevelInput').value;
    const coverInput = document.getElementById('bookCoverInput');
    const coverImage = coverInput ? safeImageSrc(coverInput.value.trim()) : '';
    if (!name) { toast('نام لازمه', 'error'); return; }
    const isLibrary = !document.getElementById('bookLibraryScreen').classList.contains('hidden');
    if (editingBookId) {
      const book = state.books.find(b => b.id === editingBookId);
      if (!book) { toast('کتاب پیدا نشد', 'error'); return; }
      book.name = name; book.level = level; book.coverImage = coverImage;
      save();
      document.getElementById('modalBook').classList.remove('active');
      document.body.classList.remove('locked');
      editingBookId = null;
      if (isLibrary) { renderBookLibrary(); toast(`✅ «${name}» ویرایش شد`, 'success'); }
      else { renderAll(); toast('✅ ویرایش شد', 'success'); }
    } else {
      const nb = {
        id: uid(),
        name,
        level,
        coverImage,
        lessons: []
      };
      ensureSingleSampleLesson(nb);
      state.books.push(nb);
      state.activeBookId = nb.id;
      state.activeLessonId = nb.lessons[0].id;
      save();
      document.getElementById('modalBook').classList.remove('active');
      document.body.classList.remove('locked');
      if (isLibrary) { renderBookLibrary(); toast(`✅ «${name}» اضافه شد (با درس نمونه)`, 'success'); }
      else { renderAll(); toast('✅ ذخیره شد (با درس نمونه)', 'success'); }
    }
  });
  const saveLessonBtn = document.getElementById('saveLessonBtn');
  if (saveLessonBtn) saveLessonBtn.addEventListener('click', () => {
    const titleInput = document.getElementById('lessonTitleInput');
    const title = (titleInput ? titleInput.value : '').trim();
    if (!title) { toast('عنوان درس رو بنویس', 'error'); if (titleInput) titleInput.focus(); return; }
    const b = getBook();
    if (!b) {
      toast('اول یه کتاب انتخاب کن', 'error');
      document.getElementById('modalLesson').classList.remove('active');
      document.body.classList.remove('locked');
      return;
    }

    const editId = saveLessonBtn.dataset.editId;

    if (editId) {
      const target = b.lessons.find(x => x.id === editId);
      if (!target) { toast('درس پیدا نشد', 'error'); return; }
      if (target.isSample) { toast('🔒 درس نمونه قابل ویرایش نیست', 'error'); return; }
      if ((b.lessons || []).some(l => l.id !== editId && l.title.trim().toLowerCase() === title.toLowerCase())) {
        if (!confirm(`درسی با عنوان «${title}» قبلاً هست.\nادامه بدی و نامش رو یکسان کنی؟`)) return;
      }
      target.title = title;
      save();
      delete saveLessonBtn.dataset.editId;
      document.getElementById('modalLesson').classList.remove('active');
      document.body.classList.remove('locked');
      renderAll(); populateLessonTargets();
      toast(`✅ نام درس به «${title}» تغییر کرد`, 'success');
      return;
    }

    if ((b.lessons || []).some(l => l.title.trim().toLowerCase() === title.toLowerCase())) {
      if (!confirm(`درسی با عنوان «${title}» قبلاً هست.\nادامه بدی و یکی دیگه با همین عنوان بسازی؟`)) return;
    }
    const nl = { id: uid(), title, words: [], stories: [], isSample: false };
    if (!Array.isArray(b.lessons)) b.lessons = [];
    b.lessons.push(nl);
    state.activeLessonId = nl.id;
    save();
    document.getElementById('modalLesson').classList.remove('active');
    document.body.classList.remove('locked');
    renderAll(); populateLessonTargets();
    const sel = document.getElementById('lessonSelect');
    if (sel) {
      sel.value = nl.id;
      sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    toast(`✅ درس «${title}» اضافه شد`, 'success');
  });
  const lessonTitleInput = document.getElementById('lessonTitleInput');
  if (lessonTitleInput) {
    lessonTitleInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const btn = document.getElementById('saveLessonBtn');
        if (btn) btn.click();
      }
    });
  }

  // ✅ دکمه‌های کتابخانه
  const libraryAddBookBtn = document.getElementById('libraryAddBookBtn');
  if (libraryAddBookBtn) libraryAddBookBtn.addEventListener('click', openBookModal);
  const libraryImportBtn = document.getElementById('libraryImportBtn');
  if (libraryImportBtn) libraryImportBtn.addEventListener('click', openLibraryImportModal);
  const backToLibraryBtn = document.getElementById('backToLibraryBtn');
  if (backToLibraryBtn) backToLibraryBtn.addEventListener('click', showBookLibrary);

  // ✅ مودال ورودی کتابخانه
  const cancelLibraryImportBtn = document.getElementById('cancelLibraryImportBtn');
  if (cancelLibraryImportBtn) cancelLibraryImportBtn.addEventListener('click', closeLibraryImportModal);

  const libImportFileCard = document.getElementById('libImportFileCard');
  if (libImportFileCard) libImportFileCard.addEventListener('click', () => {
    document.getElementById('libImportFileInput').click();
  });
  const libImportFileInput = document.getElementById('libImportFileInput');
  if (libImportFileInput) libImportFileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) { toast('فقط .json', 'error'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        processLibraryImportData(data, file.name);
      } catch(err) {
        toast('❌ JSON نامعتبر: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  const libImportUrlCard = document.getElementById('libImportUrlCard');
  if (libImportUrlCard) libImportUrlCard.addEventListener('click', () => {
    document.getElementById('libImportUrlBox').classList.remove('hidden');
    document.getElementById('libImportPasteBox').classList.add('hidden');
  });
  const libImportUrlFetchBtn = document.getElementById('libImportUrlFetchBtn');
  if (libImportUrlFetchBtn) libImportUrlFetchBtn.addEventListener('click', fetchLibraryFromUrl);
  const libImportUrlCancelBtn = document.getElementById('libImportUrlCancelBtn');
  if (libImportUrlCancelBtn) libImportUrlCancelBtn.addEventListener('click', () => {
    document.getElementById('libImportUrlBox').classList.add('hidden');
  });

  const libImportPasteCard = document.getElementById('libImportPasteCard');
  if (libImportPasteCard) libImportPasteCard.addEventListener('click', () => {
    document.getElementById('libImportPasteBox').classList.remove('hidden');
    document.getElementById('libImportUrlBox').classList.add('hidden');
  });
  const libImportPasteAddBtn = document.getElementById('libImportPasteAddBtn');
  if (libImportPasteAddBtn) libImportPasteAddBtn.addEventListener('click', addLibraryFromPaste);
  const libImportPasteCancelBtn = document.getElementById('libImportPasteCancelBtn');
  if (libImportPasteCancelBtn) libImportPasteCancelBtn.addEventListener('click', () => {
    document.getElementById('libImportPasteBox').classList.add('hidden');
  });

  const importAsNewBookBtn = document.getElementById('importAsNewBookBtn');
  if (importAsNewBookBtn) importAsNewBookBtn.addEventListener('click', chooseImportAsNewBook);
  const importAsReplaceBtn = document.getElementById('importAsReplaceBtn');
  if (importAsReplaceBtn) importAsReplaceBtn.addEventListener('click', chooseImportAsReplace);
  const cancelImportBookBtn = document.getElementById('cancelImportBookBtn');
  if (cancelImportBookBtn) cancelImportBookBtn.addEventListener('click', closeImportBookPopup);
  const confirmNewBookBtn = document.getElementById('confirmNewBookBtn');
  if (confirmNewBookBtn) confirmNewBookBtn.addEventListener('click', confirmNewBookFromImport);
  const cancelNewBookBtn = document.getElementById('cancelNewBookBtn');
  if (cancelNewBookBtn) cancelNewBookBtn.addEventListener('click', () => {
    document.getElementById('modalNewBookFromImport').classList.remove('active');
    document.body.classList.remove('locked');
    closeImportBookPopup();
  });
  const confirmReplaceBookBtn = document.getElementById('confirmReplaceBookBtn');
  if (confirmReplaceBookBtn) confirmReplaceBookBtn.addEventListener('click', confirmReplaceBook);
  const cancelReplaceBookBtn = document.getElementById('cancelReplaceBookBtn');
  if (cancelReplaceBookBtn) cancelReplaceBookBtn.addEventListener('click', () => {
    document.getElementById('modalReplaceTargetBook').classList.remove('active');
    document.body.classList.remove('locked');
    closeImportBookPopup();
  });

  setupFileDropZone();

  // ✅ Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
      const sr = document.getElementById('storyReaderModal');
      if (sr && sr.classList.contains('active')) { sr.classList.remove('active'); document.body.classList.remove('locked'); }
      const wv = document.getElementById('wordViewModal');
      if (wv && wv.classList.contains('active')) { wv.classList.remove('active'); document.body.classList.remove('locked'); }
      const we = document.getElementById('wordEditModal');
      if (we && we.classList.contains('active')) closeWordEdit();
      const libImp = document.getElementById('modalLibraryImport');
      if (libImp && libImp.classList.contains('active')) closeLibraryImportModal();
      if (practice.active) exitPractice();
      if (document.body.classList.contains('practice-theater')) exitTheaterMode();
      const menu = document.getElementById('practiceFolderMenu');
      if (menu) menu.classList.add('hidden');
      document.body.classList.remove('locked');
    }
    if (e.key === ' ' && practice.active) {
      e.preventDefault();
      const inner = document.getElementById('flashcardInner');
      inner.classList.toggle('flipped');
      if (inner.classList.contains('flipped')) {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        if (currentAudio) { try { currentAudio.pause(); currentAudio.currentTime = 0; } catch(e){} currentAudio = null; }
      }
    }
  });
}

/* ============================================================
   INIT
   ============================================================ */
function init(){
  state = load();
  if (!state.lastLessonByBook) state.lastLessonByBook = {};
  if (!Array.isArray(state.quizHistory)) state.quizHistory = [];

  if (!state.activeBookId && state.books.length) state.activeBookId = state.books[0].id;
  const b = getBook();

  if (b && b.lessons.length) {
    const saved = state.lastLessonByBook[state.activeBookId];
    if (saved && b.lessons.find(l => l.id === saved)) {
      state.activeLessonId = saved;
    } else if (!state.activeLessonId || !b.lessons.find(l => l.id === state.activeLessonId)) {
      state.activeLessonId = b.lessons[0].id;
    }
  }

  // ✅ اطمینان از وجود فقط یک درس نمونه + آماده‌سازی کلمات
  state.books.forEach(bk => {
    if (!Array.isArray(bk.lessons) || !bk.lessons.length) {
      ensureSingleSampleLesson(bk);
    }
    // حذف درس‌های نمونه تکراری
    const samples = bk.lessons.filter(l => l.isSample);
    if (samples.length > 1) {
      const firstSample = samples[0];
      bk.lessons = bk.lessons.filter(l => !l.isSample || l === firstSample);
    }
    // آماده‌سازی کلمات
    bk.lessons.forEach(l => {
      if (!Array.isArray(l.words)) l.words = [];
      if (!Array.isArray(l.stories)) l.stories = [];
      l.words.forEach(w => {
        if (!w.status) w.status = normalizeStatus(w);
        if (!Array.isArray(w.notes)) w.notes = [];
        if (!Array.isArray(w.synonyms)) w.synonyms = [];
        if (!Array.isArray(w.related)) w.related = [];
        if (!Array.isArray(w.extraExamples)) w.extraExamples = [];
        if (!w.forms) w.forms = {};
        ensureSrs(w);
      });
    });
  });

  save();
  bindEvents();
  renderAll();
  populateLessonTargets();
  updateAutoPlayUI();
  updateDirectionLabel();

  // ✅ اگر کتاب فعال و درس معتبره، مستقیم برو به اپ
  const activeBook = getBook();
  if (activeBook && state.activeLessonId && activeBook.lessons.find(l => l.id === state.activeLessonId)) {
    showMainApp();
  } else {
    showBookLibrary();
  }
}

init();
})();