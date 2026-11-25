(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ═══════════════════════════════════════════════════════════════════
  const STORAGE_KEY = 'german-vocab-pro-v5';
  const LEGACY_KEYS = ['german-vocab-pro-v4', 'german-vocab-pro-v3', 'german-vocab-pro-v2', 'german-vocab-pro-v1'];
  const AUTOPLAY_KEY = 'german-vocab-autoplay';
  const AUTOPLAY_QUIZ_KEY = 'german-vocab-autoplay-quiz';
  const THEME_KEY = 'german-vocab-theme';
  const GRAMMAR_SEEN_KEY = 'german-vocab-grammar-seen';
  const FAB_POS_KEY = 'german-vocab-fab-pos';
  const FAB_ORDER_KEY = 'german-vocab-fab-order';
  const FAV_LEVEL_KEY = 'german-vocab-fav-level';
  const FAV_TYPE_KEY = 'german-vocab-fav-type';

  // ═══════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════
  let state = {
    books: [],
    activeBookId: null,
    activeLessonId: null,
    lastLessonByBook: {},
    quizHistory: [],
    articleHistory: [],
    playlists: [],
    videos: [],
    audioCollections: []
  };

  let practice = { active: false, queue: [], index: 0, ratings: {}, _isTransitioning: false };
  let quizState = { mode: null, questions: [], index: 0, correct: 0, wrong: 0, wrongWords: [], answered: false, startedAt: 0 };
  let storyEditId = null;
  let storyEditId_kind = null;
  let currentStoryId = null;
  let repeatMode = 0;
  let repeatCounter = 0;
  let cardSortMode = 'alpha';
  let currentAudio = null;
  let editingBookId = null;
  let pendingBookData = null;
  let practiceDirection = 'de-fa';
  let currentContentType = 'all';

  let lessonsSortMode = 'manual';
  let grammarExpanded = {};
  let grammarSeen = {};
  try {
    const saved = JSON.parse(localStorage.getItem(GRAMMAR_SEEN_KEY) || '{}');
    if (saved && typeof saved === 'object') grammarSeen = saved;
  } catch (e) { }

  let autoPlayWord = true;
  try {
    const saved = localStorage.getItem(AUTOPLAY_KEY);
    if (saved !== null) autoPlayWord = saved === 'true';
  } catch (e) { }

  let autoPlayQuiz = false;
  try {
    const savedQuiz = localStorage.getItem(AUTOPLAY_QUIZ_KEY);
    if (savedQuiz !== null) autoPlayQuiz = savedQuiz === 'true';
  } catch (e) { }

  let currentTheme = 'dark';
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') currentTheme = saved;
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) currentTheme = 'light';
  } catch (e) { }

  // ❤️⭐🔥 — سطح فعال در favorites
  let currentFavLevel = 'heart';
  let currentFavType = 'all';
  try {
    const saved = localStorage.getItem(FAV_LEVEL_KEY);
    if (saved === 'heart' || saved === 'star' || saved === 'fire') currentFavLevel = saved;
    const savedType = localStorage.getItem(FAV_TYPE_KEY);
    if (savedType && ['all', 'words', 'sentences', 'videos', 'audios'].includes(savedType)) currentFavType = savedType;
  } catch (e) { }

  // ویدیو/آدیو — نمای فعلی
  let currentVideoView = 'home';
  let currentVideoCollectionId = null;
  let currentVideoEpisodeId = null;
  let currentAudioView = 'home';
  let currentAudioCollectionId = null;
  let currentAudioEpisodeId = null;
  let currentPlaylistId = null;

  // رسانه در حال ویرایش
  let editingMediaCollection = { type: null, id: null };
  let editingMediaEpisode = { type: null, collectionId: null, id: null };
  let editingMediaDialogue = { type: null, collectionId: null, episodeId: null };
  let editingPlaylistId = null;

  // پلیر شناور
  let stickyPlayerState = {
    active: false,
    queue: [],
    index: 0,
    isPlaying: false,
    currentItem: null,
    source: null
  };

  // FAB
  let fabOpen = false;
  let fabEditMode = false;
  let fabPosition = { x: null, y: null };
  try {
    const savedPos = JSON.parse(localStorage.getItem(FAB_POS_KEY) || 'null');
    if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') fabPosition = savedPos;
  } catch (e) { }

  let fabOrder = null;
  try {
    const savedOrder = JSON.parse(localStorage.getItem(FAB_ORDER_KEY) || 'null');
    if (Array.isArray(savedOrder)) fabOrder = savedOrder;
  } catch (e) { }

  // ═══════════════════════════════════════════════════════════════════
  // THEME
  // ═══════════════════════════════════════════════════════════════════
  function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f5f7fb' : '#0f172a');
    const icon = theme === 'light' ? '☀️' : '🌙';
    const libBtn = document.getElementById('themeToggleLibrary');
    const mainBtn = document.getElementById('themeToggleMain');
    if (libBtn) libBtn.textContent = icon;
    if (mainBtn) {
      const ic = mainBtn.querySelector('.hbtn-icon');
      if (ic) ic.textContent = icon; else mainBtn.textContent = icon;
    }
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { }
  }

  function toggleTheme() {
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    toast(next === 'light' ? '☀️ تم روشن فعال شد' : '🌙 تم تاریک فعال شد', 'success');
  }

  // ═══════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════
  function uid() { return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function toast(msg, type) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show ' + (type || '');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  function normalizeGerman(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[.,!?;:'"«»„“”\-–—]/g, '')
      .replace(/\s+/g, ' ').trim();
  }
  function germanEquals(a, b) { return normalizeGerman(a) === normalizeGerman(b); }

  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function fmtTimestamp(str) {
    if (!str) return '0:00';
    if (typeof str === 'number') return fmtTime(str);
    str = String(str).trim();
    const parts = str.split(':');
    if (parts.length === 2) return str;
    if (parts.length === 3) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const s = parseInt(parts[2], 10);
      return (h * 60 + m) + ':' + (s < 10 ? '0' : '') + s;
    }
    return str;
  }

  function timestampToSeconds(str) {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    str = String(str).trim();
    const parts = str.split(':').map(x => parseInt(x, 10));
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }

  // ═══════════════════════════════════════════════════════════════════
  // AUDIO HELPERS
  // ═══════════════════════════════════════════════════════════════════
  function speak(text, audioUrl) {
    if (currentAudio) {
      try { currentAudio.pause(); currentAudio.currentTime = 0; } catch (e) { }
      currentAudio = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (audioUrl && audioUrl.trim()) {
      try {
        const directUrl = toDirectAudioUrl(audioUrl);
        if (directUrl) {
          currentAudio = new Audio(directUrl);
          currentAudio.play().catch(() => speakTTS(text));
          currentAudio.addEventListener('ended', () => { currentAudio = null; });
          return;
        }
      } catch (e) { }
    }
    speakTTS(text);
  }

  function speakTTS(text) {
    if (!text || !String(text).trim()) return;
    if (!('speechSynthesis' in window)) { toast('مرورگر تلفظ پشتیبانی نمی‌کند', 'error'); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }

  function toDirectAudioUrl(src) {
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

  function safeImageSrc(src) {
    src = String(src || '').trim();
    if (!src) return '';
    if (/^(javascript|data|vbscript):/i.test(src)) return '';
    return src;
  }

  function safeCoverColor(c) {
    c = String(c || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#6366f1';
  }

  // ═══════════════════════════════════════════════════════════════════
  // WORD HELPERS
  // ═══════════════════════════════════════════════════════════════════
  function getFullGermanWord(w) {
    if (!w || !w.de) return '';
    if (['der', 'die', 'das'].includes(w.art)) {
      return w.art + ' ' + w.de;
    }
    return w.de;
  }

  function germanSpeakBtn(text, opts) {
    if (!text || !String(text).trim()) return '';
    opts = opts || {};
    const size = opts.size || 'md';
    const title = opts.title || 'پخش تلفظ آلمانی';
    return `<button type="button" class="de-speak-btn de-speak-${size}" data-de-speak="${esc(text)}" title="${esc(title)}">🔊</button>`;
  }

  function wireGermanSpeakButtons(container) {
    if (!container) return;
    container.querySelectorAll('[data-de-speak]').forEach(btn => {
      if (btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        e.preventDefault();
        speakTTS(btn.dataset.deSpeak);
        btn.classList.add('playing-speak');
        setTimeout(() => btn.classList.remove('playing-speak'), 600);
      });
    });
  }

  function articleClass(a) {
    if (['der', 'die', 'das'].includes(a)) return a;
    if (a === 'Verb') return 'verb';
    if (a === 'Adj' || a === 'Adv') return 'adj';
    return '';
  }

  function getWordType(w) {
    const art = w.art || '–';
    if (['der', 'die', 'das'].includes(art)) return { type: 'noun', label: 'اسم', icon: '📦' };
    if (art === 'Verb') return { type: 'verb', label: 'فعل', icon: '⚡' };
    if (art === 'Adj') return { type: 'adj', label: 'صفت', icon: '🎨' };
    if (art === 'Adv') return { type: 'adj', label: 'قید', icon: '💫' };
    return { type: 'other', label: 'نامشخص', icon: '❓' };
  }

  function normalizeStatus(w) {
    if (!w.status) {
      if (w.srs && w.srs.box >= 4) return 'good';
      if (w.srs && w.srs.box >= 2) return 'learning';
      return 'new';
    }
    return w.status;
  }

  function quizModeLabel(mode) {
    const m = {
      mean: '🔤 معنی', sentence: '📝 جمله', typing: '⌨️ تایپ',
      listening: '🎧 شنیداری', article: '🔤 جنسیت', plural: '📚 جمع',
      grammar: '📘 گرامر'
    };
    return m[mode] || mode;
  }

  function wordMatchesSearch(w, search) {
    if (!search) return true;
    const s = search.toLowerCase().trim();
    if (!s) return true;
    if ((w.de || '').toLowerCase().includes(s)) return true;
    if ((w.fa || '').toLowerCase().includes(s)) return true;
    if ((w.plural || '').toLowerCase().includes(s)) return true;
    if ((w.art || '').toLowerCase().includes(s)) return true;
    if ((w.ex || '').toLowerCase().includes(s)) return true;
    if ((w.exMean || '').toLowerCase().includes(s)) return true;
    if ((w.ipa || '').toLowerCase().includes(s)) return true;
    if ((w.note || '').toLowerCase().includes(s)) return true;
    if (Array.isArray(w.notes) && w.notes.some(n => String(n || '').toLowerCase().includes(s))) return true;
    if (Array.isArray(w.synonyms) && w.synonyms.some(x => String(x || '').toLowerCase().includes(s))) return true;
    if (Array.isArray(w.related) && w.related.some(x => String(x || '').toLowerCase().includes(s))) return true;
    if (Array.isArray(w.tags) && w.tags.some(x => String(x || '').toLowerCase().includes(s))) return true;
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════
  // NORMALIZE: WORD
  // ═══════════════════════════════════════════════════════════════════
  function normalizeWord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const de = (raw.de || raw.word || raw.german || raw.Wort || raw.Deutsch || '').toString().trim();
    const fa = (raw.fa || raw.mean || raw.persian || raw.translation || raw.Bedeutung || raw.Farsi || '').toString().trim();
    if (!de || !fa) return null;
    // ⭐ سازگاری با نسخه قبلی: star → heart, flag → star
    let heart = !!raw.heart;
    let star = !!raw.star;
    let fire = !!raw.fire;
    if (raw.flag === true && !raw.star && !raw.heart) {
      // داده قدیمی: flag بود → star جدید
      star = true;
    }
    if (raw.star === true && raw.heart === undefined && raw.flag === undefined) {
      // داده قدیمی: فقط star داشت → heart جدید
      heart = true;
      star = false;
    }
    return {
      id: raw.id || uid(),
      de, art: (raw.art || raw.article || raw.Artikel || '–').toString(),
      plural: (raw.plural || raw.Plural || '–').toString(),
      fa,
      ipa: (raw.ipa || '').toString(),
      image: (raw.image || '').toString(),
      audioUrl: (raw.audioUrl || '').toString(),
      category: (raw.category || '').toString(),
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      difficulty: (raw.difficulty || '').toString(),
      ex: (raw.ex || raw.example || raw.Beispiel || '').toString(),
      exMean: (raw.exMean || raw.exampleFa || raw.beispielFa || '').toString(),
      exAudio: (raw.exAudio || raw.exampleAudio || '').toString(),
      note: (raw.note || '').toString(),
      notes: Array.isArray(raw.notes) ? raw.notes : [],
      collocations: Array.isArray(raw.collocations) ? raw.collocations : [],
      synonyms: Array.isArray(raw.synonyms) ? raw.synonyms : [],
      related: Array.isArray(raw.related) ? raw.related : [],
      forms: raw.forms || {},
      contextExamples: Array.isArray(raw.contextExamples) ? raw.contextExamples : [],
      extraExamples: Array.isArray(raw.extraExamples) ? raw.extraExamples : [],
      commonMistakes: Array.isArray(raw.commonMistakes) ? raw.commonMistakes : [],
      speak: raw.speak || '',
      status: raw.status || 'new',
      srs: raw.srs || { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0, streak: 0 },
      heart, star, fire,
      videos: Array.isArray(raw.videos) ? raw.videos : [],
      audios: Array.isArray(raw.audios) ? raw.audios : []
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // NORMALIZE: STORY / DIALOGUE / CHAT / LETTER / GRAMMAR
  // ═══════════════════════════════════════════════════════════════════
  function normalizeSentenceObj(s) {
    if (!s) return null;
    if (typeof s === 'string') {
      const sep = s.indexOf('|');
      if (sep < 1) return null;
      return {
        id: uid(),
        de: s.slice(0, sep).trim(),
        fa: s.slice(sep + 1).trim(),
        audio: '',
        speaker: '',
        heart: false,
        star: false,
        fire: false
      };
    }
    return {
      id: s.id || uid(),
      de: (s.de || s.german || '').toString(),
      fa: (s.fa || s.persian || s.translation || '').toString(),
      audio: (s.audio || s.audioUrl || '').toString(),
      speaker: (s.speaker || '').toString(),
      time: (s.time !== undefined && s.time !== null) ? s.time : undefined,
      heart: !!s.heart,
      star: !!s.star,
      fire: !!s.fire,
      wordByWord: Array.isArray(s.wordByWord) ? s.wordByWord : [],
      structure: s.structure || null,
      grammarPoints: Array.isArray(s.grammarPoints) ? s.grammarPoints : [],
      grammarLevel: s.grammarLevel || null,
      lessonIntroduced: s.lessonIntroduced || null
    };
  }

  function normalizeStory(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = (raw.title || raw.name || '').toString().trim();
    if (!title) return null;
    let sentences = raw.sentences || raw.lines || [];
    if (typeof sentences === 'string') {
      sentences = sentences.split(/\r?\n/).filter(Boolean).map(normalizeSentenceObj).filter(Boolean);
    } else {
      sentences = (sentences || []).map(normalizeSentenceObj).filter(s => s && s.de);
    }

    let type = (raw.type || '').toString().toLowerCase();
    if (!type) {
      const t = title.toLowerCase();
      if (t.includes('brief') || t.includes('email')) type = 'letter-informal';
      else if (t.includes('dialog')) type = 'dialogue';
      else type = 'story';
    }
    if (type === 'informal') type = 'letter-informal';
    if (type === 'formal') type = 'letter-formal';
    if (!['story', 'letter-formal', 'letter-informal', 'dialogue'].includes(type)) type = 'story';

    return {
      id: raw.id || uid(),
      title, type,
      audio: (raw.audio || raw.audioUrl || raw.fullAudio || '').toString(),
      coverImage: (raw.coverImage || raw.cover || raw.image || '').toString(),
      coverColor: safeCoverColor(raw.coverColor),
      wordIds: Array.isArray(raw.wordIds) ? raw.wordIds : [],
      grammarIds: Array.isArray(raw.grammarIds) ? raw.grammarIds : [],
      sentences
    };
  }

  function normalizeDialogue(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = (raw.title || raw.name || '').toString().trim();
    if (!title) return null;
    return {
      id: raw.id || uid(),
      title, type: 'dialogue',
      wordIds: Array.isArray(raw.wordIds) ? raw.wordIds : [],
      grammarIds: Array.isArray(raw.grammarIds) ? raw.grammarIds : [],
      lines: Array.isArray(raw.lines) ? raw.lines.map(l => ({
        id: l.id || uid(),
        speaker: (l.speaker || '').toString(),
        de: (l.de || l.german || '').toString(),
        fa: (l.fa || l.persian || l.translation || '').toString(),
        audio: (l.audio || '').toString(),
        heart: !!l.heart,
        star: !!l.star,
        fire: !!l.fire
      })) : [],
      audio: (raw.audio || '').toString(),
      coverImage: (raw.coverImage || '').toString(),
      coverColor: safeCoverColor(raw.coverColor)
    };
  }

  function normalizeChat(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = (raw.title || raw.name || '').toString().trim();
    if (!title) return null;
    return {
      id: raw.id || uid(),
      title,
      type: (raw.type || 'friendly').toString(),
      description: (raw.description || '').toString(),
      coverImage: (raw.coverImage || '').toString(),
      coverColor: safeCoverColor(raw.coverColor),
      lines: Array.isArray(raw.lines) ? raw.lines.map(l => ({
        id: l.id || uid(),
        sender: (l.sender || l.speaker || '').toString(),
        de: (l.de || l.german || '').toString(),
        fa: (l.fa || l.persian || l.translation || '').toString(),
        audio: (l.audio || l.audioUrl || '').toString(),
        heart: !!l.heart,
        star: !!l.star,
        fire: !!l.fire
      })).filter(l => l.de || l.fa) : []
    };
  }

  function normalizeLetter(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = (raw.title || raw.name || '').toString().trim();
    if (!title) return null;
    return {
      id: raw.id || uid(),
      title,
      type: (raw.type === 'formal') ? 'letter-formal' : (raw.type === 'letter-formal' ? 'letter-formal' : 'letter-informal'),
      topic: (raw.topic || '').toString(),
      audio: (raw.audio || '').toString(),
      wordIds: Array.isArray(raw.wordIds) ? raw.wordIds : [],
      grammarIds: Array.isArray(raw.grammarIds) ? raw.grammarIds : [],
      de: (raw.de || '').toString(),
      fa: (raw.fa || '').toString(),
      coverImage: (raw.coverImage || '').toString(),
      coverColor: safeCoverColor(raw.coverColor)
    };
  }

  function normalizeGrammar(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = (raw.title || raw.name || '').toString().trim();
    const explanation = (raw.explanation || raw.description || raw.text || '').toString().trim();
    if (!title && !explanation) return null;
    return {
      id: raw.id || uid(),
      title: title || 'نکته گرامری',
      priority: raw.priority || 1,
      explanation,
      rules: Array.isArray(raw.rules) ? raw.rules : [],
      examples: Array.isArray(raw.examples) ? raw.examples.map(e => ({
        id: e.id || uid(),
        de: (e.de || e.german || '').toString(),
        fa: (e.fa || e.persian || e.translation || '').toString(),
        audio: (e.audio || '').toString(),
        heart: !!e.heart,
        star: !!e.star,
        fire: !!e.fire
      })) : [],
      commonMistakes: Array.isArray(raw.commonMistakes) ? raw.commonMistakes : []
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // NORMALIZE: LESSON / BOOK
  // ═══════════════════════════════════════════════════════════════════
  function normalizeLesson(raw, fallbackTitle) {
    if (!raw) return null;
    if (Array.isArray(raw)) {
      return {
        id: uid(),
        title: fallbackTitle || 'درس',
        words: raw.map(normalizeWord).filter(Boolean),
        stories: [], grammar: [], dialogues: [], letters: [],
        chats: [], exercises: [], quiz: null,
        genderTest: null, conjugationTest: null,
        verbs: [], isSample: false
      };
    }
    if (typeof raw !== 'object') return null;
    return {
      id: raw.id || uid(),
      title: (raw.title || raw.lesson || raw.lessonTitle || raw.name || fallbackTitle || 'درس').toString(),
      isSample: !!raw.isSample,
      metadata: raw.metadata || {},
      grammar: Array.isArray(raw.grammar) ? raw.grammar.map(normalizeGrammar).filter(Boolean) : [],
      words: Array.isArray(raw.words) ? raw.words.map(normalizeWord).filter(Boolean) : [],
      stories: Array.isArray(raw.stories) ? raw.stories.map(normalizeStory).filter(Boolean) : [],
      letters: Array.isArray(raw.letters) ? raw.letters.map(normalizeLetter).filter(Boolean) : [],
      dialogues: Array.isArray(raw.dialogues) ? raw.dialogues.map(normalizeDialogue).filter(Boolean) : [],
      chats: Array.isArray(raw.chats) ? raw.chats.map(normalizeChat).filter(Boolean) : [],
      exercises: Array.isArray(raw.exercises) ? raw.exercises : [],
      quiz: raw.quiz || null,
      genderTest: raw.genderTest || null,
      conjugationTest: raw.conjugationTest || null,
      verbs: Array.isArray(raw.verbs) ? raw.verbs : [],
      // ⭐ رسانه
      videos: Array.isArray(raw.videos) ? raw.videos.map(normalizeVideo).filter(Boolean) : [],
      audioCollections: Array.isArray(raw.audioCollections) ? raw.audioCollections.map(normalizeAudioCollection).filter(Boolean) : []
    };
  }

  function normalizeBook(raw, fallbackName) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      id: raw.id || uid(),
      name: (raw.name || raw.title || raw.book || fallbackName || 'کتاب').toString(),
      level: (raw.level || 'A1.1').toString(),
      coverImage: (raw.coverImage || raw.cover || raw.image || '').toString(),
      lessons: Array.isArray(raw.lessons) ? raw.lessons.map((l, i) => normalizeLesson(l, 'درس ' + (i + 1))).filter(Boolean) : []
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // NORMALIZE: VIDEO / AUDIO / PLAYLIST
  // ═══════════════════════════════════════════════════════════════════
  function normalizeVideoEpisode(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      id: raw.id || uid(),
      title: (raw.title || raw.name || 'قسمت').toString(),
      description: (raw.description || '').toString(),
      type: (raw.type || 'url').toString(), // url | upload | mp4 | youtube | aparat
      url: (raw.url || raw.audioUrl || raw.videoUrl || '').toString(),
      poster: (raw.poster || raw.coverImage || '').toString(),
      duration: (raw.duration || '').toString(),
      heart: !!raw.heart,
      star: !!raw.star,
      fire: !!raw.fire,
      dialogues: Array.isArray(raw.dialogues) ? raw.dialogues.map(normalizeMediaDialogue).filter(Boolean) : []
    };
  }

  function normalizeMediaDialogue(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.de && !raw.fa) return null;
    return {
      id: raw.id || uid(),
      time: raw.time !== undefined ? raw.time : (raw.timestamp !== undefined ? raw.timestamp : 0),
      de: (raw.de || raw.german || '').toString(),
      fa: (raw.fa || raw.persian || raw.translation || '').toString(),
      speaker: (raw.speaker || '').toString(),
      heart: !!raw.heart,
      star: !!raw.star,
      fire: !!raw.fire
    };
  }

  function normalizeVideo(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const isCollection = Array.isArray(raw.episodes);
    if (isCollection) {
      return {
        id: raw.id || uid(),
        isCollection: true,
        title: (raw.title || raw.name || 'مجموعه').toString(),
        description: (raw.description || '').toString(),
        coverImage: (raw.coverImage || raw.poster || '').toString(),
        coverColor: safeCoverColor(raw.coverColor),
        episodes: raw.episodes.map(normalizeVideoEpisode).filter(Boolean)
      };
    }
    return {
      id: raw.id || uid(),
      isCollection: false,
      title: (raw.title || raw.name || 'ویدیو').toString(),
      description: (raw.description || '').toString(),
      type: (raw.type || 'url').toString(),
      url: (raw.url || raw.videoUrl || '').toString(),
      poster: (raw.poster || raw.coverImage || '').toString(),
      duration: (raw.duration || '').toString(),
      heart: !!raw.heart,
      star: !!raw.star,
      fire: !!raw.fire,
      dialogues: Array.isArray(raw.dialogues) ? raw.dialogues.map(normalizeMediaDialogue).filter(Boolean) : []
    };
  }

  function normalizeAudioEpisode(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      id: raw.id || uid(),
      title: (raw.title || raw.name || 'آدیو').toString(),
      description: (raw.description || '').toString(),
      audioUrl: (raw.audioUrl || raw.url || '').toString(),
      coverImage: (raw.coverImage || '').toString(),
      coverColor: safeCoverColor(raw.coverColor),
      duration: (raw.duration || '').toString(),
      heart: !!raw.heart,
      star: !!raw.star,
      fire: !!raw.fire,
      dialogues: Array.isArray(raw.dialogues) ? raw.dialogues.map(normalizeMediaDialogue).filter(Boolean) : []
    };
  }

  function normalizeAudioCollection(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = (raw.title || raw.name || '').toString().trim();
    if (!title) return null;
    return {
      id: raw.id || uid(),
      title,
      description: (raw.description || '').toString(),
      coverImage: (raw.coverImage || '').toString(),
      coverColor: safeCoverColor(raw.coverColor),
      episodes: Array.isArray(raw.episodes) ? raw.episodes.map(normalizeAudioEpisode).filter(Boolean) : []
    };
  }

  function normalizePlaylistItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      id: raw.id || uid(),
      mediaType: (raw.mediaType || 'audio').toString(), // audio | video
      sourceType: (raw.sourceType || 'episode').toString(),
      title: (raw.title || '').toString(),
      audioUrl: (raw.audioUrl || raw.url || '').toString(),
      videoUrl: (raw.videoUrl || '').toString(),
      coverImage: (raw.coverImage || '').toString(),
      duration: (raw.duration || '').toString(),
      collectionId: raw.collectionId || null,
      episodeId: raw.episodeId || null
    };
  }

  function normalizePlaylist(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = (raw.name || raw.title || '').toString().trim();
    if (!name) return null;
    return {
      id: raw.id || uid(),
      name,
      coverImage: (raw.coverImage || '').toString(),
      coverColor: safeCoverColor(raw.coverColor || '#a855f7'),
      items: Array.isArray(raw.items) ? raw.items.map(normalizePlaylistItem).filter(Boolean) : []
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // SAMPLE LESSON / BOOK
  // ═══════════════════════════════════════════════════════════════════
  function makeSampleLesson() {
    return {
      id: 'sample-' + uid(),
      title: 'Lektion — Beispiel (نمونه)',
      isSample: true,
      metadata: {},
      grammar: [],
      words: [
        { id: 'sample-w1-' + uid(), de: 'Familie', art: 'die', plural: 'Familien', fa: 'خانواده', ex: 'Meine Familie ist groß.', exMean: 'خانواده من بزرگ است.', status: 'new', heart: true, star: false, fire: false, srs: { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0, streak: 0 } },
        { id: 'sample-w2-' + uid(), de: 'Vater', art: 'der', plural: 'Väter', fa: 'پدر', ex: 'Mein Vater arbeitet viel.', exMean: 'پدر من زیاد کار می‌کند.', status: 'new', heart: false, star: true, fire: false, srs: { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0, streak: 0 } },
        { id: 'sample-w3-' + uid(), de: 'Mutter', art: 'die', plural: 'Mütter', fa: 'مادر', ex: 'Meine Mutter kocht gut.', exMean: 'مادرم خوب آشپزی می‌کند.', status: 'new', heart: false, star: false, fire: true, srs: { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0, streak: 0 } }
      ],
      stories: [], letters: [], dialogues: [], chats: [],
      exercises: [], quiz: null, genderTest: null, conjugationTest: null,
      verbs: [], videos: [], audioCollections: []
    };
  }

  function ensureSampleLesson(book) {
    if (!book) return;
    if (!Array.isArray(book.lessons)) book.lessons = [];
    book.lessons = book.lessons.filter(l => !l.isSample);
    book.lessons.unshift(makeSampleLesson());
  }

  // ═══════════════════════════════════════════════════════════════════
  // DEFAULT DATA
  // ═══════════════════════════════════════════════════════════════════
  function defaultData() {
    const book = { id: uid(), name: 'Menschen', level: 'A1.1', coverImage: '', lessons: [] };
    ensureSampleLesson(book);
    return {
      books: [book],
      activeBookId: book.id,
      activeLessonId: book.lessons[0].id,
      lastLessonByBook: {},
      quizHistory: [],
      articleHistory: [],
      playlists: [],
      videos: [],
      audioCollections: []
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // LOAD / SAVE
  // ═══════════════════════════════════════════════════════════════════
  function load() {
    const currentRaw = localStorage.getItem(STORAGE_KEY);
    if (currentRaw !== null) {
      try {
        const d = JSON.parse(currentRaw);
        if (d && typeof d === 'object' && Array.isArray(d.books)) {
          if (!d.lastLessonByBook) d.lastLessonByBook = {};
          if (!Array.isArray(d.quizHistory)) d.quizHistory = [];
          if (!Array.isArray(d.articleHistory)) d.articleHistory = [];
          if (!Array.isArray(d.playlists)) d.playlists = [];
          if (!Array.isArray(d.videos)) d.videos = [];
          if (!Array.isArray(d.audioCollections)) d.audioCollections = [];
          return d;
        }
      } catch (e) { }
    }
    for (const key of LEGACY_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.books)) {
          const result = {
            books: data.books.map(b => normalizeBook(b)).filter(Boolean),
            activeBookId: data.activeBookId || (data.books[0] && data.books[0].id),
            activeLessonId: data.activeLessonId || (data.books[0] && data.books[0].lessons[0] && data.books[0].lessons[0].id),
            lastLessonByBook: data.lastLessonByBook || {},
            quizHistory: Array.isArray(data.quizHistory) ? data.quizHistory : [],
            articleHistory: [],
            playlists: [],
            videos: [],
            audioCollections: []
          };
          if (!result.books.find(b => b.id === result.activeBookId)) result.activeBookId = result.books[0]?.id || null;
          return result;
        }
      } catch (e) { }
    }
    return defaultData();
  }

  function save() {
    if (!state.lastLessonByBook) state.lastLessonByBook = {};
    if (!Array.isArray(state.articleHistory)) state.articleHistory = [];
    if (!Array.isArray(state.playlists)) state.playlists = [];
    if (!Array.isArray(state.videos)) state.videos = [];
    if (!Array.isArray(state.audioCollections)) state.audioCollections = [];
    if (state.activeBookId && state.activeLessonId) {
      state.lastLessonByBook[state.activeBookId] = state.activeLessonId;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error(e);
      if (e.name === 'QuotaExceededError') {
        toast('⚠️ حافظه پر شده — فایل‌های آپلود شده رو حذف کن', 'error');
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════
  function getBook(id) { return state.books.find(b => b.id === (id || state.activeBookId)); }
  function getLesson(id) {
    const b = getBook();
    if (!b) return null;
    return b.lessons.find(l => l.id === (id || state.activeLessonId));
  }
  function getLessonById(lessonId) {
    const b = getBook();
    if (!b) return null;
    return b.lessons.find(l => l.id === lessonId) || null;
  }
  function getWords() { const l = getLesson(); return l ? (l.words || []) : []; }
  function getStories() { const l = getLesson(); return l ? (l.stories || []) : []; }
  function getLetters() { const l = getLesson(); return l ? (l.letters || []) : []; }
  function getDialogues() { const l = getLesson(); return l ? (l.dialogues || []) : []; }
  function getGrammar() { const l = getLesson(); return l ? (l.grammar || []) : []; }
  function getChats() { const l = getLesson(); return l ? (l.chats || []) : []; }
  function getExercises() { const l = getLesson(); return l ? (l.exercises || []) : []; }
  function getLessonQuiz() { const l = getLesson(); return l ? (l.quiz || null) : null; }
  function getLessonVideos() { const l = getLesson(); return l ? (l.videos || []) : []; }
  function getLessonAudioCollections() { const l = getLesson(); return l ? (l.audioCollections || []) : []; }
  function getPlaylists() { return state.playlists || []; }
  function getPlaylist(id) { return getPlaylists().find(p => p.id === id); }

  // ═══════════════════════════════════════════════════════════════════
  // TOGGLE ❤️⭐🔥
  // ═══════════════════════════════════════════════════════════════════
  function setWordMark(wordId, level) {
    // level: 'heart' | 'star' | 'fire' | null (حذف)
    const w = getWords().find(x => x.id === wordId);
    if (!w) return;
    w.heart = false;
    w.star = false;
    w.fire = false;
    if (level === 'heart') w.heart = true;
    else if (level === 'star') w.star = true;
    else if (level === 'fire') w.fire = true;
    save();
    if (typeof renderCards === 'function') renderCards();
    if (typeof renderWordTable === 'function') renderWordTable();
    const msg = level === 'heart' ? '❤️ به موردعلاقه‌ها اضافه شد' :
      level === 'star' ? '⭐ به مهم‌ها اضافه شد' :
        level === 'fire' ? '🔥 به خیلی مهم‌ها اضافه شد' :
          'علامت برداشته شد';
    toast(msg, 'success');
  }

  function toggleHeart(wordId) {
    const w = getWords().find(x => x.id === wordId);
    if (!w) return;
    setWordMark(wordId, w.heart ? null : 'heart');
  }
  function toggleStar(wordId) {
    const w = getWords().find(x => x.id === wordId);
    if (!w) return;
    setWordMark(wordId, w.star ? null : 'star');
  }
  function toggleFire(wordId) {
    const w = getWords().find(x => x.id === wordId);
    if (!w) return;
    setWordMark(wordId, w.fire ? null : 'fire');
  }

  function toggleSentenceMark(sentenceObj, level) {
    if (!sentenceObj) return;
    sentenceObj.heart = false;
    sentenceObj.star = false;
    sentenceObj.fire = false;
    if (level === 'heart') sentenceObj.heart = true;
    else if (level === 'star') sentenceObj.star = true;
    else if (level === 'fire') sentenceObj.fire = true;
    save();
  }

  function toggleMediaMark(item, level) {
    if (!item) return;
    item.heart = false;
    item.star = false;
    item.fire = false;
    if (level === 'heart') item.heart = true;
    else if (level === 'star') item.star = true;
    else if (level === 'fire') item.fire = true;
    save();
  }

  // ═══════════════════════════════════════════════════════════════════
  // SRS
  // ═══════════════════════════════════════════════════════════════════
  const SRS_INTERVALS = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };

  function ensureSrs(w) {
    if (!w.srs) w.srs = { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0, streak: 0 };
    if (typeof w.srs.streak !== 'number') w.srs.streak = 0;
    return w.srs;
  }

  function reviewWord(w, rating) {
    const s = ensureSrs(w);
    if (rating === 'good') {
      s.streak = (s.streak || 0) + 1;
      s.correctCount++;
      if (s.streak >= 3 && w.status === 'bad') {
        w.status = 'learning';
        s.box = 2;
        s.streak = 0;
      } else if (w.status !== 'bad') {
        s.box = Math.min(5, s.box + 1);
        w.status = s.box >= 4 ? 'good' : 'learning';
      }
    } else if (rating === 'medium') {
      s.streak = 0;
      s.correctCount++;
      w.status = 'learning';
    } else {
      s.streak = 0;
      s.box = 1;
      s.wrongCount++;
      w.status = 'bad';
    }
    s.nextReview = Date.now() + SRS_INTERVALS[s.box] * 86400000;
    s.lastRating = rating;
    save();
  }

  function undoReviewWord(w) {
    const s = ensureSrs(w);
    const prev = s.lastRating;
    if (!prev) return;
    if (prev === 'good') {
      s.box = Math.max(1, s.box - 1);
      s.correctCount = Math.max(0, s.correctCount - 1);
      s.streak = Math.max(0, (s.streak || 0) - 1);
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

  function getDueWords(book) {
    book = book || getBook();
    if (!book) return [];
    const now = Date.now();
    const due = [];
    (book.lessons || []).forEach(l => {
      (l.words || []).forEach(w => {
        const s = ensureSrs(w);
        if (!s.nextReview || s.nextReview <= now) due.push({ word: w, lessonTitle: l.title, lessonId: l.id });
      });
    });
    return due;
  }

  // ═══════════════════════════════════════════════════════════════════
  // AUTOPLAY / DIRECTION
  // ═══════════════════════════════════════════════════════════════════
  function updateAutoPlayUI() {
    const t1 = document.getElementById('autoPlayToggle');
    const t2 = document.getElementById('autoPlayToggleSession');
    const l1 = document.getElementById('autoPlayLabel');
    const l2 = document.getElementById('autoPlayLabelSession');
    if (t1) t1.classList.toggle('on', autoPlayWord);
    if (t2) t2.classList.toggle('on', autoPlayWord);
    if (l1) l1.textContent = autoPlayWord ? '🔊 پخش خودکار: روشن' : '🔇 پخش خودکار: خاموش';
    if (l2) l2.textContent = autoPlayWord ? '🔊' : '🔇';
  }

  function toggleAutoPlay() {
    autoPlayWord = !autoPlayWord;
    try { localStorage.setItem(AUTOPLAY_KEY, String(autoPlayWord)); } catch (e) { }
    updateAutoPlayUI();
    toast(autoPlayWord ? '🔊 پخش خودکار روشن' : '🔇 پخش خودکار خاموش', autoPlayWord ? 'success' : 'warning');
  }

  function updateAutoPlayQuizUI() {
    const btn = document.getElementById('quizAutoPlayToggle');
    const lbl = document.getElementById('quizAutoPlayLabel');
    if (btn) btn.classList.toggle('on', autoPlayQuiz);
    if (lbl) lbl.textContent = autoPlayQuiz ? '🔊 پخش خودکار لغت: روشن' : '🔇 پخش خودکار لغت: خاموش';
  }

  function toggleAutoPlayQuiz() {
    autoPlayQuiz = !autoPlayQuiz;
    try { localStorage.setItem(AUTOPLAY_QUIZ_KEY, String(autoPlayQuiz)); } catch (e) { }
    updateAutoPlayQuizUI();
    const sessionBtn = document.getElementById('quizAutoPlayToggleSession');
    const sessionLbl = document.getElementById('quizAutoPlayLabelSession');
    if (sessionBtn) sessionBtn.classList.toggle('on', autoPlayQuiz);
    if (sessionLbl) sessionLbl.textContent = autoPlayQuiz ? '🔊 خودکار' : '🔇 خودکار';
    toast(autoPlayQuiz ? '🔊 پخش خودکار آزمون روشن' : '🔇 پخش خودکار آزمون خاموش', autoPlayQuiz ? 'success' : 'warning');
  }

  function updateDirectionLabel() {
    const lbl = document.getElementById('directionLabel');
    if (lbl) lbl.textContent = practiceDirection === 'de-fa' ? 'آلمانی → فارسی' : 'فارسی → آلمانی';
  }

  function togglePracticeDirection() {
    practiceDirection = practiceDirection === 'de-fa' ? 'fa-de' : 'de-fa';
    updateDirectionLabel();
    if (practice.active && typeof showCurrentPracticeCard === 'function') showCurrentPracticeCard();
    toast(practiceDirection === 'de-fa' ? '🔄 جهت: آلمانی → فارسی' : '🔄 جهت: فارسی → آلمانی', 'success');
  }

  // ═══════════════════════════════════════════════════════════════════
  // PLACEHOLDER — بخش‌های بعدی در پیام‌های بعدی
  // ═══════════════════════════════════════════════════════════════════
  // ادامه در بخش ۲ (render ها)
  // ═══════════════════════════════════════════════════════════════════
  // MAIN APP VIEWS
  // ═══════════════════════════════════════════════════════════════════
  function showBookLibrary() {
    document.getElementById('bookLibraryScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    document.body.classList.remove('locked');
    renderBookLibrary();
    closeFABPanel?.();
  }

  function showMainApp() {
    document.getElementById('bookLibraryScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    updateAppTitle();
    renderAll();
    updateReviewBanner();
  }

  function updateAppTitle() {
    const book = getBook();
    const el = document.getElementById('appTitle');
    if (!el) return;
    if (book) el.textContent = '📖 ' + book.name + (book.level ? ' — ' + book.level : '');
    else el.textContent = '🎓 German Vocab Pro';
  }

  function updateReviewBanner() {
    const banner = document.getElementById('reviewBanner');
    if (!banner) return;
    const due = getDueWords();
    if (due.length === 0) { banner.classList.add('hidden'); return; }
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
    document.getElementById('startDailyReviewBtn')?.addEventListener('click', startDailyReview);
  }

  function startDailyReview() {
    const due = getDueWords();
    if (!due.length) { toast('کلمه‌ای برای مرور نیست!', 'warning'); return; }
    practice.active = true;
    practice.queue = shuffle(due.map(d => d.word));
    practice.index = 0;
    practice.ratings = {};
    practice._isTransitioning = false;
    switchTab('practice');
    document.getElementById('practiceFolderView').classList.add('hidden');
    document.getElementById('practiceSession').classList.remove('hidden');
    showCurrentPracticeCard();
  }

  // ═══════════════════════════════════════════════════════════════════
  // BOOK LIBRARY
  // ═══════════════════════════════════════════════════════════════════
  function renderBookLibrary() {
    const grid = document.getElementById('bookCardsGrid');
    if (!grid) return;
    if (!state.books.length) {
      grid.innerHTML = `<div class="empty-library"><div class="empty-icon">📚</div><div>هنوز کتابی نداری</div></div>`;
      return;
    }
    grid.innerHTML = state.books.map(book => {
      const coverImage = safeImageSrc(book.coverImage);
      const level = book.level || 'A1.1';
      const totalLessons = (book.lessons || []).length;
      const totalWords = (book.lessons || []).reduce((s, l) => s + ((l.words || []).length), 0);
      const totalStories = (book.lessons || []).reduce((s, l) =>
        s + ((l.stories || []).length) + ((l.letters || []).length) + ((l.dialogues || []).length) + ((l.chats || []).length), 0);
      const totalGrammar = (book.lessons || []).reduce((s, l) => s + ((l.grammar || []).length), 0);
      const totalVideos = (book.lessons || []).reduce((s, l) => s + ((l.videos || []).length), 0);
      let mastered = 0;
      (book.lessons || []).forEach(l => {
        (l.words || []).forEach(w => { if (normalizeStatus(w) === 'good') mastered++; });
      });
      const pct = totalWords ? Math.round((mastered / totalWords) * 100) : 0;
      return `<div class="book-card-library" data-book-id="${esc(book.id)}">
      <button class="book-card-edit" data-lib-edit="${esc(book.id)}" title="ویرایش">✏️</button>
      <button class="book-card-download" data-lib-download="${esc(book.id)}" title="دانلود">⬇️</button>
      <button class="book-card-delete" data-lib-del="${esc(book.id)}" title="حذف">🗑</button>
      <div class="book-cover-wrap">
        ${coverImage
          ? `<img src="${esc(coverImage)}" alt="${esc(book.name)}">`
          : `<div class="book-cover-placeholder"><div class="book-icon">📖</div><div class="book-name">${esc(book.name)}</div></div>`}
        <span class="book-level-badge">${esc(level)}</span>
      </div>
      <div class="book-card-body">
        <h3 class="book-card-title">${esc(book.name)}</h3>
        <div class="book-card-stats">
          <span class="book-stat"><span class="stat-icon">📝</span> ${totalWords}</span>
          <span class="book-stat"><span class="stat-icon">📚</span> ${totalLessons}</span>
          ${totalStories ? `<span class="book-stat"><span class="stat-icon">📖</span> ${totalStories}</span>` : ''}
          ${totalVideos ? `<span class="book-stat"><span class="stat-icon">🎬</span> ${totalVideos}</span>` : ''}
          ${totalGrammar ? `<span class="book-stat"><span class="stat-icon">📘</span> ${totalGrammar}</span>` : ''}
        </div>
        <div class="book-card-progress">
          <div class="book-progress-label"><span>تسلط</span><span>${pct}٪</span></div>
          <div class="book-progress-bar"><div class="book-progress-fill" style="width:${pct}%"></div></div>
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
      btn.addEventListener('click', e => { e.stopPropagation(); openEditBookModal(btn.dataset.libEdit); });
    });
    grid.querySelectorAll('[data-lib-download]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const book = state.books.find(b => b.id === btn.dataset.libDownload);
        if (!book) return;
        exportData(book, `${book.name}-${book.level}.json`);
        toast(`⬇️ دانلود شد`, 'success');
      });
    });
    grid.querySelectorAll('[data-lib-del]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const book = state.books.find(b => b.id === btn.dataset.libDel);
        if (!book) return;
        const totalWords = (book.lessons || []).reduce((s, l) => s + ((l.words || []).length), 0);
        if (!confirm(`⚠️ حذف «${book.name}»؟\n\n${(book.lessons || []).length} درس و ${totalWords} کلمه حذف می‌شوند.`)) return;
        state.books = state.books.filter(b => b.id !== btn.dataset.libDel);
        if (state.activeBookId === btn.dataset.libDel) {
          state.activeBookId = state.books[0]?.id || null;
          state.activeLessonId = getBook()?.lessons[0]?.id || null;
        }
        save(); renderBookLibrary();
        toast('حذف شد', 'success');
      });
    });
  }

  function openBook(bookId) {
    const book = state.books.find(b => b.id === bookId);
    if (!book) return;
    if (practice.active) exitPractice();
    state.activeBookId = bookId;
    const savedLessonId = state.lastLessonByBook && state.lastLessonByBook[bookId];
    if (savedLessonId && book.lessons.find(l => l.id === savedLessonId)) state.activeLessonId = savedLessonId;
    else state.activeLessonId = book.lessons[0]?.id || null;
    save();
    showMainApp();
    renderAll();
    populateLessonTargets();
  }

  // ═══════════════════════════════════════════════════════════════════
  // BOOK PICKER
  // ═══════════════════════════════════════════════════════════════════
  function openBookPicker() {
    const modal = document.getElementById('modalBookPicker');
    if (!modal) return;
    renderBookPickerGrid();
    modal.classList.add('active');
    document.body.classList.add('locked');
  }
  function closeBookPicker() {
    document.getElementById('modalBookPicker')?.classList.remove('active');
    document.body.classList.remove('locked');
  }
  function renderBookPickerGrid() {
    const grid = document.getElementById('bookPickerGrid');
    if (!grid) return;
    if (!state.books.length) {
      grid.innerHTML = `<div class="empty-library" style="grid-column:1/-1;">هنوز کتابی نداری</div>`;
      return;
    }
    grid.innerHTML = state.books.map(book => {
      const coverImage = safeImageSrc(book.coverImage);
      const isActive = book.id === state.activeBookId;
      const totalWords = (book.lessons || []).reduce((s, l) => s + ((l.words || []).length), 0);
      const totalLessons = (book.lessons || []).length;
      return `<div class="book-card-library" data-picker-book-id="${esc(book.id)}" style="${isActive ? 'border-color:var(--accent);' : ''}">
      ${isActive ? `<div style="position:absolute;top:10px;left:10px;background:var(--accent);color:#000;padding:3px 8px;border-radius:10px;font-size:10px;font-weight:800;z-index:6;">✓ فعال</div>` : ''}
      <div class="book-cover-wrap">
        ${coverImage
          ? `<img src="${esc(coverImage)}" alt="${esc(book.name)}">`
          : `<div class="book-cover-placeholder"><div class="book-icon">📖</div><div class="book-name">${esc(book.name)}</div></div>`}
        <span class="book-level-badge">${esc(book.level || 'A1.1')}</span>
      </div>
      <div class="book-card-body">
        <h3 class="book-card-title">${esc(book.name)}</h3>
        <div class="book-card-stats">
          <span class="book-stat">📝 ${totalWords}</span>
          <span class="book-stat">📚 ${totalLessons}</span>
        </div>
      </div>
    </div>`;
    }).join('');
    grid.querySelectorAll('[data-picker-book-id]').forEach(card => {
      card.addEventListener('click', () => {
        closeBookPicker();
        openBook(card.dataset.pickerBookId);
        toast('📖 کتاب باز شد', 'success');
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // GLOBAL SEARCH
  // ═══════════════════════════════════════════════════════════════════
  function openGlobalSearch() {
    const book = getBook();
    if (!book) { toast('اول یک کتاب انتخاب کن', 'warning'); return; }
    const modal = document.getElementById('modalGlobalSearch');
    document.getElementById('globalSearchBookName').textContent = book.name;
    document.getElementById('globalSearchInput').value = '';
    document.getElementById('globalSearchResults').innerHTML = `<div class="global-search-empty">شروع به تایپ کن...</div>`;
    modal.classList.add('active');
    document.body.classList.add('locked');
    setTimeout(() => document.getElementById('globalSearchInput').focus(), 100);
  }
  function closeGlobalSearch() {
    document.getElementById('modalGlobalSearch')?.classList.remove('active');
    document.body.classList.remove('locked');
  }
  function searchAllWords(query) {
    const results = document.getElementById('globalSearchResults');
    if (!results) return;
    const book = getBook();
    if (!book) return;
    const q = (query || '').trim();
    if (!q) { results.innerHTML = `<div class="global-search-empty">شروع به تایپ کن...</div>`; return; }
    const matches = [];
    (book.lessons || []).forEach(lesson => {
      (lesson.words || []).forEach(word => {
        if (wordMatchesSearch(word, q)) {
          matches.push({ word, lesson });
        }
      });
    });
    if (!matches.length) {
      results.innerHTML = `<div class="global-search-empty">❌ هیچ کلمه‌ای پیدا نشد</div>`;
      return;
    }
    results.innerHTML = `
    <div class="global-search-stats">✅ ${matches.length} نتیجه در ${new Set(matches.map(m => m.lesson.id)).size} درس</div>
    ${matches.slice(0, 100).map(m => {
      const w = m.word;
      const wordFull = getFullGermanWord(w);
      return `<div class="global-search-item" data-go-word="${esc(w.id)}" data-go-lesson="${esc(m.lesson.id)}">
        <div class="gs-word">
          ${w.art && w.art !== '–' ? `<span class="gs-art ${articleClass(w.art)}">${esc(w.art)}</span>` : ''}
          <span>${esc(w.de)}</span>
          ${germanSpeakBtn(wordFull, { size: 'sm', title: 'پخش تلفظ آلمانی' })}
        </div>
        <div class="gs-meaning">${esc(w.fa)}</div>
        <div class="gs-location">📚 ${esc(m.lesson.title)}</div>
      </div>`;
    }).join('')}
  `;
    wireGermanSpeakButtons(results);
    results.querySelectorAll('[data-go-word]').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.closest('[data-de-speak]')) return;
        const wordId = item.dataset.goWord;
        const lessonId = item.dataset.goLesson;
        closeGlobalSearch();
        if (state.activeLessonId !== lessonId) {
          if (practice.active) exitPractice();
          state.activeLessonId = lessonId;
          save();
          renderAll();
        }
        setTimeout(() => openWordView(wordId), 200);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // POPULATE LESSON TARGETS
  // ═══════════════════════════════════════════════════════════════════
  function populateLessonTargets() {
    const selectors = ['wordTargetLesson', 'storyTargetLesson', 'jsonTargetLesson', 'fileTargetLesson'];
    const b = getBook();
    selectors.forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      if (!b || !b.lessons.length) { sel.innerHTML = '<option value="">— درسی وجود ندارد —</option>'; return; }
      const currentValue = sel.value;
      sel.innerHTML = b.lessons.map(l => {
        const wordCount = (l.words || []).length;
        const storyCount = (l.stories || []).length + (l.letters || []).length + (l.dialogues || []).length + (l.chats || []).length;
        const info = id === 'storyTargetLesson' ? `${storyCount} محتوا` : `${wordCount} کلمه`;
        const sampleBadge = l.isSample ? ' 🔒' : '';
        return `<option value="${l.id}">${esc(l.title)}${sampleBadge} (${info})</option>`;
      }).join('');
      if (currentValue && b.lessons.find(l => l.id === currentValue)) sel.value = currentValue;
      else if (state.activeLessonId && b.lessons.find(l => l.id === state.activeLessonId)) sel.value = state.activeLessonId;
    });
    // FAB select هم پر کن
    const fabSel = document.getElementById('fabLessonSelect');
    if (fabSel && b) {
      fabSel.innerHTML = b.lessons.map(l =>
        `<option value="${l.id}" ${l.id === state.activeLessonId ? 'selected' : ''}>${l.isSample ? '🔒 ' : ''}${esc(l.title)} (${(l.words || []).length})</option>`
      ).join('');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // LESSON SELECT
  // ═══════════════════════════════════════════════════════════════════
  function renderLessonSelect() {
    const b = getBook();
    const sel = document.getElementById('lessonSelect');
    if (!sel) return;
    if (!b || !b.lessons.length) { sel.innerHTML = '<option value="">— بدون درس —</option>'; return; }
    let lessons = b.lessons.slice();
    if (lessonsSortMode === 'alpha') {
      lessons.sort((a, c) => a.title.localeCompare(c.title, 'de'));
    } else if (lessonsSortMode === 'alphaDesc') {
      lessons.sort((a, c) => c.title.localeCompare(a.title, 'de'));
    }
    sel.innerHTML = lessons.map(l =>
      `<option value="${l.id}" ${l.id === state.activeLessonId ? 'selected' : ''}>${l.isSample ? '🔒 ' : ''}${esc(l.title)} (${(l.words || []).length})</option>`
    ).join('');
    updateAppTitle();
  }

  // ═══════════════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════════════
  function renderStats() {
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
    const pct = total ? Math.round((counts.good / total) * 100) : 0;
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

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE QUICK FILTERS
  // ═══════════════════════════════════════════════════════════════════
  function renderArticleQuickFilters() {
    const cont = document.getElementById('articleQuickFilters');
    if (!cont) return;
    const words = getWords();
    const artCounts = { der: 0, die: 0, das: 0, Verb: 0, Adj: 0, Adv: 0, none: 0 };
    words.forEach(w => {
      if (['der', 'die', 'das', 'Verb', 'Adj', 'Adv'].includes(w.art)) artCounts[w.art]++;
      else if (!w.art || w.art === '–') artCounts.none++;
    });
    cont.innerHTML = `
    <button class="article-quick-btn der" data-quick-art="der">der <span class="aqb-count">${artCounts.der}</span></button>
    <button class="article-quick-btn die" data-quick-art="die">die <span class="aqb-count">${artCounts.die}</span></button>
    <button class="article-quick-btn das" data-quick-art="das">das <span class="aqb-count">${artCounts.das}</span></button>
    <button class="article-quick-btn verb" data-quick-art="Verb">Verb <span class="aqb-count">${artCounts.Verb}</span></button>
    <button class="article-quick-btn adj" data-quick-art="Adj">Adj <span class="aqb-count">${artCounts.Adj}</span></button>
  `;
    cont.querySelectorAll('[data-quick-art]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('filterArticle').value = btn.dataset.quickArt;
        renderWordTable();
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // WORD TABLE
  // ═══════════════════════════════════════════════════════════════════
  function renderWordTable() {
    const search = (document.getElementById('searchBox')?.value || '').trim();
    const filter = document.getElementById('filterStatus')?.value || 'all';
    const artFilter = document.getElementById('filterArticle')?.value || 'all';
    const specialFilter = document.getElementById('filterSpecial')?.value || 'all';

    const allWords = getWords();
    const heartCount = allWords.filter(w => w.heart).length;
    const starCount = allWords.filter(w => w.star).length;
    const fireCount = allWords.filter(w => w.fire).length;

    const elAll = document.getElementById('qfAllCount');
    const elHeart = document.getElementById('qfHeartCount');
    const elStar = document.getElementById('qfStarCount');
    const elFire = document.getElementById('qfFireCount');
    if (elAll) elAll.textContent = allWords.length;
    if (elHeart) elHeart.textContent = heartCount;
    if (elStar) elStar.textContent = starCount;
    if (elFire) elFire.textContent = fireCount;

    document.querySelectorAll('.quick-filter-btn[data-qf]').forEach(b => {
      b.classList.toggle('active', b.dataset.qf === specialFilter);
    });

    let words = allWords.slice();
    if (search) words = words.filter(w => wordMatchesSearch(w, search));
    if (filter !== 'all') words = words.filter(w => normalizeStatus(w) === filter);
    if (artFilter !== 'all') {
      if (artFilter === 'noun') words = words.filter(w => ['der', 'die', 'das'].includes(w.art));
      else if (artFilter === 'non-noun') words = words.filter(w => !['der', 'die', 'das'].includes(w.art));
      else if (artFilter === 'none') words = words.filter(w => !w.art || w.art === '–');
      else words = words.filter(w => w.art === artFilter);
    }
    if (specialFilter === 'heart') words = words.filter(w => w.heart);
    else if (specialFilter === 'star') words = words.filter(w => w.star);
    else if (specialFilter === 'fire') words = words.filter(w => w.fire);

    const cont = document.getElementById('wordTableContainer');
    if (!cont) return;
    if (!words.length) {
      cont.innerHTML = `<div class="empty">${allWords.length ? 'نتیجه‌ای پیدا نشد' : 'هنوز کلمه‌ای نداری.'}</div>`;
      return;
    }

    const rows = words.map(w => {
      const wordFull = getFullGermanWord(w);
      const wordSpeak = `<button class="speak-btn" data-word-speak="${esc(wordFull)}" title="تلفظ کلمه آلمانی">🔊</button>`;
      const rowClasses = (w.heart ? 'is-heart ' : '') + (w.star ? 'is-star ' : '') + (w.fire ? 'is-fire' : '');
      return `<tr data-id="${w.id}" class="${rowClasses}">
      <td class="word-mark-cell">
        <button class="word-mark-btn ${w.heart ? 'active-heart' : ''}" data-mark-heart="${w.id}" title="موردعلاقه">${w.heart ? '❤️' : '🤍'}</button>
        <button class="word-mark-btn ${w.star ? 'active-star' : ''}" data-mark-star="${w.id}" title="مهم">${w.star ? '⭐' : '☆'}</button>
        <button class="word-mark-btn ${w.fire ? 'active-fire' : ''}" data-mark-fire="${w.id}" title="خیلی مهم">🔥</button>
      </td>
      <td class="de">${esc(w.de)}</td>
      <td class="sound-cell">${wordSpeak}</td>
      <td class="art ${articleClass(w.art)}">${esc(w.art || '–')}</td>
      <td class="plural-cell">${esc(w.plural || '–')}</td>
      <td class="fa">${esc(w.fa)}</td>
    </tr>`;
    }).join('');

    cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>❤️⭐🔥</th><th>Deutsch</th><th>🔊</th><th>Artikel</th><th>Plural</th><th>فارسی</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;

    cont.querySelectorAll('[data-word-speak]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); speakTTS(btn.dataset.wordSpeak); });
    });
    cont.querySelectorAll('tbody tr').forEach(tr => {
      tr.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        openWordView(tr.dataset.id);
      });
    });
    cont.querySelectorAll('[data-mark-heart]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); toggleHeart(btn.dataset.markHeart); });
    });
    cont.querySelectorAll('[data-mark-star]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); toggleStar(btn.dataset.markStar); });
    });
    cont.querySelectorAll('[data-mark-fire]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); toggleFire(btn.dataset.markFire); });
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // CARDS
  // ═══════════════════════════════════════════════════════════════════
  function renderCards() {
    const container = document.getElementById('cardsContainer');
    if (!container) return;
    const search = (document.getElementById('cardSearch')?.value || '').trim();
    const filter = document.getElementById('cardFilter')?.value || 'all';
    const artFilter = document.getElementById('cardArticleFilter')?.value || 'all';
    const specialFilter = document.getElementById('cardSpecialFilter')?.value || 'all';
    let words = getWords().slice();
    if (search) words = words.filter(w => wordMatchesSearch(w, search));
    if (filter === 'has-example') words = words.filter(w => w.ex);
    else if (filter === 'no-example') words = words.filter(w => !w.ex);
    else if (filter !== 'all') words = words.filter(w => normalizeStatus(w) === filter);
    if (artFilter !== 'all') {
      if (artFilter === 'noun') words = words.filter(w => ['der', 'die', 'das'].includes(w.art));
      else if (artFilter === 'non-noun') words = words.filter(w => !['der', 'die', 'das'].includes(w.art));
      else words = words.filter(w => w.art === artFilter);
    }
    if (specialFilter === 'heart') words = words.filter(w => w.heart);
    else if (specialFilter === 'star') words = words.filter(w => w.star);
    else if (specialFilter === 'fire') words = words.filter(w => w.fire);
    if (cardSortMode === 'alpha') words.sort((a, b) => a.de.localeCompare(b.de, 'de'));
    else if (cardSortMode === 'random') words = shuffle(words);
    else if (cardSortMode === 'status') {
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
      const wt = getWordType(w);
      const wordFull = getFullGermanWord(w);
      const allExamples = buildExamplesForCard(w);
      const displayExamples = allExamples.slice(0, 2);
      const totalExamples = allExamples.length;
      const examplesHtml = displayExamples.map(ex => {
        const sourceBadge = ex.source === 'auto'
          ? `<span class="ex-source-badge auto">🤖 خودکار</span>`
          : ex.source === 'context'
            ? `<span class="ex-source-badge context">🎯 بافت</span>`
            : '';
        return `<div class="word-card-example">
        ${sourceBadge}
        ${renderSentenceWithAudio(ex.de, ex.fa, ex.audio, { className: 'card-example' })}
      </div>`;
      }).join('');
      const moreExamplesBadge = totalExamples > 2
        ? `<button class="word-card-more-examples" data-card-more="${w.id}">+${totalExamples - 2} جمله دیگر ⋮</button>`
        : '';
      const synonyms = w.synonyms || [];
      const related = w.related || [];
      const chipsHtml = (synonyms.length || related.length) ? `
      <div class="word-card-chips-section">
        ${synonyms.length ? `<div class="word-card-chips-row">
          <span class="word-card-chips-label">🔗 مترادف:</span>
          <div class="word-card-chips-list">${synonyms.map(s => `<span class="word-card-chip synonym" data-chip="${esc(s)}">${esc(s)}</span>`).join('')}</div>
        </div>` : ''}
        ${related.length ? `<div class="word-card-chips-row">
          <span class="word-card-chips-label">📎 مرتبط:</span>
          <div class="word-card-chips-list">${related.map(s => `<span class="word-card-chip related" data-chip="${esc(s)}">${esc(s)}</span>`).join('')}</div>
        </div>` : ''}
      </div>` : '';

      let artBg = 'rgba(148,163,184,0.18)';
      let artColor = 'var(--muted)';
      if (art === 'der') { artBg = 'rgba(96,165,250,0.22)'; artColor = '#60a5fa'; }
      else if (art === 'die') { artBg = 'rgba(248,113,113,0.22)'; artColor = '#f87171'; }
      else if (art === 'das') { artBg = 'rgba(52,211,153,0.22)'; artColor = '#34d399'; }
      else if (art === 'Verb') { artBg = 'rgba(192,132,252,0.22)'; artColor = '#c084fc'; }
      else if (art === 'Adj' || art === 'Adv') { artBg = 'rgba(251,191,36,0.22)'; artColor = '#fbbf24'; }

      const hasForms = w.forms && Object.keys(w.forms).some(k => w.forms[k] && String(w.forms[k]).trim());
      const hasAnyExtra = hasForms || synonyms.length || related.length || totalExamples > 2 || (w.note && w.note.trim()) || (w.notes || []).length > 0 || (w.collocations || []).length > 0;
      const hasVideos = (w.videos || []).length > 0;
      const hasAudios = (w.audios || []).length > 0;

      const extraClasses = [
        `status-${st}`,
        w.heart ? 'is-heart' : '',
        w.star ? 'is-star' : '',
        w.fire ? 'is-fire' : ''
      ].filter(Boolean).join(' ');

      const cornerBadges = (w.heart || w.star || w.fire) ? `
        <div class="corner-badges">
          ${w.heart ? '<span>❤️</span>' : ''}
          ${w.star ? '<span>⭐</span>' : ''}
          ${w.fire ? '<span>🔥</span>' : ''}
        </div>` : '';

      const fireParticles = w.fire ? `
        <div class="fire-particles">
          <div class="particle"></div>
          <div class="particle"></div>
          <div class="particle"></div>
          <div class="particle"></div>
          <div class="particle"></div>
        </div>` : '';

      const fireFlamesBottom = w.fire ? `
        <div class="fire-flames">
          <div class="flame"></div>
          <div class="flame"></div>
          <div class="flame"></div>
          <div class="flame"></div>
          <div class="flame"></div>
        </div>` : '';

      return `<div class="word-card ${extraClasses}" data-card-id="${w.id}">
      ${cornerBadges}
      ${fireParticles}
      <div class="word-card-header">
        <div class="word-card-title">
          ${art ? `<span class="word-card-art ${artClass}" style="font-size:15px;font-weight:900;padding:4px 10px;background:${artBg};color:${artColor};border-radius:8px;display:inline-block;margin-right:4px;line-height:1.3;">${esc(art)}</span>` : ''}
          <span class="word-card-de">${esc(w.de)}</span>
          ${germanSpeakBtn(wordFull, { size: 'sm', title: 'پخش تلفظ آلمانی' })}
        </div>
        <div class="word-card-actions">
          <button class="word-mark-btn-lg ${w.heart ? 'active-heart' : ''}" data-mark-heart="${w.id}" title="موردعلاقه">
            ${w.heart ? '❤️' : '🤍'}
          </button>
          <button class="word-mark-btn-lg ${w.star ? 'active-star' : ''}" data-mark-star="${w.id}" title="مهم">
            ${w.star ? '⭐' : '☆'}
          </button>
          <button class="word-mark-btn-lg ${w.fire ? 'active-fire' : ''}" data-mark-fire="${w.id}" title="خیلی مهم">
            🔥
          </button>
          ${hasAnyExtra ? `<button class="word-more-btn" data-card-more="${w.id}" title="نمایش کامل">⋮</button>` : ''}
        </div>
      </div>
      ${w.plural && w.plural !== '–' ? `<div class="word-card-plural-line"><span>📚 جمع:</span> <span class="pl-value">${esc(w.plural)}</span>${germanSpeakBtn(w.plural, { size: 'sm', title: 'پخش جمع' })}</div>` : ''}
      <div class="word-card-fa">${esc(w.fa)}</div>
      ${chipsHtml}
      <div class="word-card-examples-list">
        ${examplesHtml}
        ${moreExamplesBadge}
      </div>
      ${(hasVideos || hasAudios) ? `
      <div class="word-card-media-row">
        ${hasVideos ? `<button class="btn btn-sm media-btn" data-word-media="video" data-word-id="${w.id}">🎬 ویدیو (${w.videos.length})</button>` : ''}
        ${hasAudios ? `<button class="btn btn-sm media-btn" data-word-media="audio" data-word-id="${w.id}">🎙 آدیو (${w.audios.length})</button>` : ''}
      </div>` : `
      <div class="word-card-media-row">
        <button class="btn btn-sm media-btn" data-word-media="video" data-word-id="${w.id}">🎬 + ویدیو</button>
        <button class="btn btn-sm media-btn" data-word-media="audio" data-word-id="${w.id}">🎙 + آدیو</button>
      </div>`}
      <div class="word-card-footer">
        <div class="status-actions">
          <button class="status-btn bad ${st === 'bad' ? 'active' : ''}" data-card-rate="bad" data-card-id="${w.id}">❌ بلد نیستم</button>
          <button class="status-btn medium ${st === 'learning' ? 'active' : ''}" data-card-rate="medium" data-card-id="${w.id}">⚠️ نصفه</button>
          <button class="status-btn good ${st === 'good' ? 'active' : ''}" data-card-rate="good" data-card-id="${w.id}">✔️ بلدم</button>
        </div>
        <span class="word-type-badge ${wt.type}">${wt.icon} ${wt.label}</span>
      </div>
    </div>`;
    }).join('');
    container.innerHTML = `<div class="cards-grid">${cardsHtml}</div>`;

    // کلیک روی کارت → باز کردن (فقط اگه روی دکمه نبود)
    container.querySelectorAll('.word-card').forEach(card => {
      // دابل کلیک → ❤️
      let lastClickTime = 0;
      let clickTimer = null;
      card.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        if (e.target.closest('.clickable-word')) return;
        if (e.target.closest('.word-card-chip')) return;

        const now = Date.now();
        if (now - lastClickTime < 350) {
          // دابل کلیک → ❤️
          if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
          e.stopPropagation();
          const wordId = card.dataset.cardId;
          const w = getWords().find(x => x.id === wordId);
          if (w) toggleHeart(wordId);
        } else {
          lastClickTime = now;
          clickTimer = setTimeout(() => {
            // کلیک معمولی → باز کردن
            openWordView(card.dataset.cardId);
            clickTimer = null;
          }, 350);
        }
      });
    });

    container.querySelectorAll('[data-card-more]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openWordView(btn.dataset.cardMore); });
    });
    container.querySelectorAll('.word-card-chip').forEach(chip => {
      chip.addEventListener('click', e => {
        e.stopPropagation();
        const word = chip.dataset.chip;
        const found = findWordAnywhere(word);
        if (found) openWordView(found.word.id);
        else toast(`«${word}» در کتاب پیدا نشد`, 'warning');
      });
    });
    container.querySelectorAll('[data-card-rate]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const w = getWords().find(x => x.id === btn.dataset.cardId);
        if (!w) return;
        reviewWord(w, btn.dataset.cardRate);
        renderCards(); renderStats();
        toast('ثبت شد', 'success');
      });
    });
    container.querySelectorAll('[data-mark-heart]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); toggleHeart(btn.dataset.markHeart); });
    });
    container.querySelectorAll('[data-mark-star]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); toggleStar(btn.dataset.markStar); });
    });
    container.querySelectorAll('[data-mark-fire]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); toggleFire(btn.dataset.markFire); });
    });
    container.querySelectorAll('[data-word-media]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (typeof openWordMediaModal === 'function') {
          openWordMediaModal(btn.dataset.wordId, btn.dataset.wordMedia);
        }
      });
    });
    wireClickableWords(container);
    wireSentenceAudio(container);
    wireGermanSpeakButtons(container);
  }

  // ═══════════════════════════════════════════════════════════════════
  // FOLDERS (تمرین)
  // ═══════════════════════════════════════════════════════════════════
  function renderFolders() {
    const words = getWords();
    const now = Date.now();
    let c = { new: 0, learning: 0, good: 0, bad: 0, due: 0, heart: 0, star: 0, fire: 0 };
    words.forEach(w => {
      const st = normalizeStatus(w);
      if (c[st] !== undefined) c[st]++;
      const s = ensureSrs(w);
      if (!s.nextReview || s.nextReview <= now) c.due++;
      if (w.heart) c.heart++;
      if (w.star) c.star++;
      if (w.fire) c.fire++;
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
    <div class="folder-card" data-folder="heart" style="border-color:var(--heart-color);"><div class="icon">❤️</div><h4>موردعلاقه‌ها</h4><div class="count">${c.heart}</div></div>
    <div class="folder-card" data-folder="star" style="border-color:var(--warning);"><div class="icon">⭐</div><h4>مهم‌ها</h4><div class="count">${c.star}</div></div>
    <div class="folder-card" data-folder="fire" style="border-color:var(--fire-color);"><div class="icon">🔥</div><h4>خیلی مهم</h4><div class="count">${c.fire}</div></div>
  `;
    fg.querySelectorAll('[data-folder]').forEach(card => {
      card.addEventListener('click', () => startPractice(card.dataset.folder));
    });
    renderArticlePracticeGrid();
  }

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE PRACTICE GRID
  // ═══════════════════════════════════════════════════════════════════
  function getArticleStats() {
    const words = getWords();
    const nouns = words.filter(w => ['der', 'die', 'das'].includes(w.art));
    const stats = {
      der: { total: 0, bad: 0, learning: 0, good: 0, new: 0, badWords: [] },
      die: { total: 0, bad: 0, learning: 0, good: 0, new: 0, badWords: [] },
      das: { total: 0, bad: 0, learning: 0, good: 0, new: 0, badWords: [] }
    };
    nouns.forEach(w => {
      const st = normalizeStatus(w);
      const b = stats[w.art];
      if (!b) return;
      b.total++;
      if (st === 'bad') { b.bad++; b.badWords.push(w); }
      else if (st === 'learning') b.learning++;
      else if (st === 'good') b.good++;
      else b.new++;
    });
    return stats;
  }

  function renderArticlePracticeGrid() {
    const grid = document.getElementById('articlePracticeGrid');
    if (!grid) return;
    const stats = getArticleStats();
    const totalNouns = stats.der.total + stats.die.total + stats.das.total;
    if (totalNouns < 2) {
      grid.innerHTML = `<div class="empty">حداقل ۲ اسم با آرتیکل لازمه</div>`;
      return;
    }
    function pctFor(s) {
      if (s.total === 0) return 0;
      return Math.round((s.good / s.total) * 100);
    }
    function buildRow(art, s, color) {
      const pct = pctFor(s);
      return `
      <div class="article-simple-row" style="border-right-color:${color}">
        <div class="article-simple-header">
          <span class="article-simple-name" style="color:${color}">${art}</span>
          <span class="article-simple-pct">${pct}٪</span>
          <span class="article-simple-bad">❌ ${s.bad}</span>
        </div>
        <div class="article-simple-bar">
          <div class="article-simple-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <button class="btn btn-primary btn-sm article-simple-btn" data-practice-art="${art}">
          🎯 تمرین ${art} (${s.total})
        </button>
      </div>
    `;
    }
    const allBad = stats.der.bad + stats.die.bad + stats.das.bad;
    grid.innerHTML = `
    ${buildRow('der', stats.der, '#60a5fa')}
    ${buildRow('die', stats.die, '#f87171')}
    ${buildRow('das', stats.das, '#34d399')}
    <div style="grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
      ${allBad > 0 ? `<button class="btn btn-warning btn-sm" id="practiceAllBadArticleBtn" style="flex:1;">🔥 همه ضعیف‌ها (${allBad})</button>` : ''}
      <button class="btn btn-primary btn-sm" id="practiceAllArticleBtn" style="flex:1;">🔀 همه با هم (${totalNouns})</button>
    </div>
  `;
    grid.querySelectorAll('[data-practice-art]').forEach(btn => {
      btn.addEventListener('click', () => {
        const art = btn.dataset.practiceArt;
        const words = getWords().filter(w => w.art === art);
        if (words.length < 2) { toast('حداقل ۲ کلمه لازمه', 'warning'); return; }
        startArticleQuizForWords(words, `آرتیکل ${art}`);
      });
    });
    document.getElementById('practiceAllBadArticleBtn')?.addEventListener('click', () => {
      const words = getWords().filter(w =>
        ['der', 'die', 'das'].includes(w.art) && normalizeStatus(w) === 'bad'
      );
      if (words.length < 2) { toast('حداقل ۲ کلمه ضعیف لازمه', 'warning'); return; }
      startArticleQuizForWords(words, 'همه ضعیف‌ها');
    });
    document.getElementById('practiceAllArticleBtn')?.addEventListener('click', () => {
      const words = getWords().filter(w => ['der', 'die', 'das'].includes(w.art));
      if (words.length < 2) { toast('حداقل ۲ کلمه لازمه', 'warning'); return; }
      startArticleQuizForWords(words, 'همه با هم');
    });
  }

// ═══════════════════════════════════════════════════════════════════
// PLACEHOLDER — بخش‌های بعدی
// ═══════════════════════════════════════════════════════════════════
// ادامه در بخش ۳ (تمرین + آزمون + گرامر + افعال)
  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE QUIZ
  // ═══════════════════════════════════════════════════════════════════
  function startArticleQuizForWords(words, label) {
    quizState.mode = 'article';
    quizState.questions = shuffle(words).slice(0, 20).map(w => ({
      type: 'article', word: w, correct: w.art, options: ['der', 'die', 'das']
    }));
    quizState.index = 0;
    quizState.correct = 0;
    quizState.wrong = 0;
    quizState.wrongWords = [];
    quizState.answered = false;
    quizState.startedAt = Date.now();
    switchTab('quiz');
    document.getElementById('quizHome').classList.add('hidden');
    document.getElementById('quizSession').classList.remove('hidden');
    document.getElementById('quizReport').classList.add('hidden');
    document.getElementById('quizSession').classList.add('quiz-question-fullscreen');
    renderQuizQuestionNew();
    toast(`🎯 ${label} — ${quizState.questions.length} کلمه`, 'success');
  }

  // ═══════════════════════════════════════════════════════════════════
  // FOLDER MENU
  // ═══════════════════════════════════════════════════════════════════
  function buildFolderMenu() {
    const words = getWords();
    const now = Date.now();
    let c = { new: 0, learning: 0, good: 0, bad: 0, due: 0, heart: 0, star: 0, fire: 0 };
    words.forEach(w => {
      const st = normalizeStatus(w);
      if (c[st] !== undefined) c[st]++;
      const s = ensureSrs(w);
      if (!s.nextReview || s.nextReview <= now) c.due++;
      if (w.heart) c.heart++;
      if (w.star) c.star++;
      if (w.fire) c.fire++;
    });
    const list = document.getElementById('practiceFolderMenuList');
    if (!list) return;
    const items = [
      { key: 'new', icon: '⚪', label: 'جدید', count: c.new },
      { key: 'learning', icon: '🟡', label: 'در یادگیری', count: c.learning },
      { key: 'good', icon: '🟢', label: 'مسلط', count: c.good },
      { key: 'bad', icon: '❌', label: 'بلد نیستم', count: c.bad },
      { key: 'due', icon: '📅', label: 'مرور امروز', count: c.due },
      { key: 'heart', icon: '❤️', label: 'موردعلاقه‌ها', count: c.heart },
      { key: 'star', icon: '⭐', label: 'مهم‌ها', count: c.star },
      { key: 'fire', icon: '🔥', label: 'خیلی مهم‌ها', count: c.fire },
      { key: 'all', icon: '📦', label: 'همه', count: words.length },
    ];
    list.innerHTML = items.map(i =>
      `<div class="practice-folder-menu-item" data-menu-folder="${i.key}">
      <span>${i.icon} ${i.label}</span>
      <span class="count">${i.count}</span>
    </div>`
    ).join('');
    list.querySelectorAll('[data-menu-folder]').forEach(el => {
      el.addEventListener('click', () => {
        document.getElementById('practiceFolderMenu')?.classList.add('hidden');
        startPractice(el.dataset.menuFolder);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // THEATER MODE
  // ═══════════════════════════════════════════════════════════════════
  function enterTheaterMode() {
    document.body.classList.add('practice-theater');
    const btn = document.getElementById('practiceFullscreenBtn');
    if (btn) btn.textContent = '✕ خروج';
  }
  function exitTheaterMode() {
    document.body.classList.remove('practice-theater');
    const btn = document.getElementById('practiceFullscreenBtn');
    if (btn) btn.textContent = '⛶ بزرگ';
  }
  function toggleTheaterMode() {
    if (document.body.classList.contains('practice-theater')) exitTheaterMode();
    else enterTheaterMode();
  }

  function resetPracticeSettings() {
    if (!confirm('تنظیمات تمرین به حالت اولیه برگرده؟')) return;
    autoPlayWord = true;
    try { localStorage.setItem(AUTOPLAY_KEY, 'true'); } catch (e) { }
    updateAutoPlayUI();
    practiceDirection = 'de-fa';
    updateDirectionLabel();
    cardSortMode = 'alpha';
    if (practice.active) exitPractice();
    exitTheaterMode();
    document.getElementById('practiceFolderMenu')?.classList.add('hidden');
    renderFolders(); renderCards();
    toast('♻️ تنظیمات ریست شد', 'success');
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRACTICE
  // ═══════════════════════════════════════════════════════════════════
  function startPractice(folderType) {
    let words = getWords().slice();
    const now = Date.now();
    if (folderType === 'new') words = words.filter(w => normalizeStatus(w) === 'new');
    else if (folderType === 'learning') words = words.filter(w => normalizeStatus(w) === 'learning');
    else if (folderType === 'good') words = words.filter(w => normalizeStatus(w) === 'good');
    else if (folderType === 'bad') words = words.filter(w => normalizeStatus(w) === 'bad');
    else if (folderType === 'due') words = words.filter(w => { const s = ensureSrs(w); return !s.nextReview || s.nextReview <= now; });
    else if (folderType === 'heart') words = words.filter(w => w.heart);
    else if (folderType === 'star') words = words.filter(w => w.star);
    else if (folderType === 'fire') words = words.filter(w => w.fire);
    if (!words.length) { toast('این پوشه خالیه!', 'warning'); return; }
    practice.active = true;
    practice.queue = shuffle(words);
    practice.index = 0;
    practice.ratings = {};
    practice._isTransitioning = false;
    document.getElementById('practiceFolderView').classList.add('hidden');
    document.getElementById('practiceSession').classList.remove('hidden');
    showCurrentPracticeCard();
  }

  function showCurrentPracticeCard() {
    if (practice.index >= practice.queue.length) {
      exitPractice();
      toast('🎉 مرور تمام شد!', 'success');
      return;
    }
    const w = practice.queue[practice.index];
    const wordFull = getFullGermanWord(w);
    const counter = document.getElementById('practiceCounter');
    if (counter) counter.textContent = `${practice.index + 1} / ${practice.queue.length}`;
    const progressEl = document.getElementById('practiceProgress');
    if (progressEl) progressEl.style.width = ((practice.index / practice.queue.length) * 100) + '%';

    if (practiceDirection === 'de-fa') {
      const fcArt = document.getElementById('fcArt');
      if (fcArt) {
        fcArt.textContent = w.art && w.art !== '–' ? w.art : '';
        fcArt.className = 'fc-art art ' + articleClass(w.art);
      }
      const fcWord = document.getElementById('fcWord');
      if (fcWord) fcWord.textContent = w.de;
      const fcMeaning = document.getElementById('fcMeaning');
      if (fcMeaning) fcMeaning.textContent = w.fa;
      const fcExample = document.getElementById('fcExample');
      if (fcExample) {
        fcExample.innerHTML = w.ex
          ? `<div class="fc-example-line">${germanSpeakBtn(w.ex, { size: 'sm', title: 'پخش جمله آلمانی' })}<span dir="ltr">${esc(w.ex)}</span></div>${w.exMean ? `<small>${esc(w.exMean)}</small>` : ''}`
          : '';
      }
    } else {
      const fcArt = document.getElementById('fcArt');
      if (fcArt) {
        fcArt.textContent = '';
        fcArt.className = 'fc-art';
      }
      const fcWord = document.getElementById('fcWord');
      if (fcWord) fcWord.textContent = w.fa;
      const meaningDe = getFullGermanWord(w);
      const fcMeaning = document.getElementById('fcMeaning');
      if (fcMeaning) {
        fcMeaning.innerHTML = `<div class="fc-meaning-with-speak">${germanSpeakBtn(meaningDe, { size: 'md', title: 'پخش تلفظ آلمانی' })}<span>${esc(meaningDe)}</span></div>`;
      }
      const fcExample = document.getElementById('fcExample');
      if (fcExample) {
        fcExample.innerHTML = w.ex
          ? `<div class="fc-example-line">${germanSpeakBtn(w.ex, { size: 'sm', title: 'پخش جمله آلمانی' })}<span dir="ltr">${esc(w.ex)}</span></div>${w.exMean ? `<small>${esc(w.exMean)}</small>` : ''}`
          : (w.exMean ? `<small>${esc(w.exMean)}</small>` : '');
      }
    }

    const speakBtn = document.getElementById('fcSpeakBtn');
    if (speakBtn) speakBtn.style.display = practiceDirection === 'fa-de' ? 'none' : '';
    const prevBtn = document.getElementById('prevPracticeBtn');
    if (prevBtn) prevBtn.disabled = practice.index === 0;
    const inner = document.getElementById('flashcardInner');
    if (inner && inner.classList.contains('flipped')) inner.classList.remove('flipped');
    if (inner) wireGermanSpeakButtons(inner);
    if (autoPlayWord && practiceDirection === 'de-fa') {
      setTimeout(() => {
        const innerEl = document.getElementById('flashcardInner');
        if (innerEl && !innerEl.classList.contains('flipped')) speakTTS(w.de);
      }, 350);
    }
  }

  function rateCurrent(rating) {
    if (practice._isTransitioning) return;
    practice._isTransitioning = true;
    const w = practice.queue[practice.index];
    reviewWord(w, rating);
    practice.ratings[practice.index] = rating;
    const inner = document.getElementById('flashcardInner');
    const wasFlipped = inner && inner.classList.contains('flipped');
    if (wasFlipped) inner.classList.remove('flipped');
    const delay = wasFlipped ? 400 : 150;
    setTimeout(() => {
      practice.index++;
      showCurrentPracticeCard();
      renderStats();
      practice._isTransitioning = false;
    }, delay);
  }

  function exitPractice() {
    exitTheaterMode();
    document.getElementById('practiceFolderMenu')?.classList.add('hidden');
    practice.active = false;
    practice.ratings = {};
    practice._isTransitioning = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (currentAudio) { try { currentAudio.pause(); } catch (e) { } currentAudio = null; }
    document.getElementById('practiceFolderView')?.classList.remove('hidden');
    document.getElementById('practiceSession')?.classList.add('hidden');
    renderAll(); populateLessonTargets();
    updateReviewBanner();
  }

  // ═══════════════════════════════════════════════════════════════════
  // QUIZ MODE STATS
  // ═══════════════════════════════════════════════════════════════════
  function getQuizModeStats(mode) {
    const history = (state.quizHistory || []).filter(h =>
      h.lessonId === state.activeLessonId && h.mode === mode
    );
    if (!history.length) return { attempts: 0, bestPct: 0, lastPct: 0 };
    let bestPct = 0;
    history.forEach(h => { if (h.pct > bestPct) bestPct = h.pct; });
    const last = history[history.length - 1];
    return { attempts: history.length, bestPct, lastPct: last.pct };
  }

  function renderModeStatsBadge(mode) {
    const s = getQuizModeStats(mode);
    if (s.attempts === 0) return `<div class="quiz-mode-stats none">🆕 هنوز کار نکردی</div>`;
    return `<div class="quiz-mode-stats done">
    <span class="qms-attempts">🔁 ${s.attempts} بار</span>
    <span class="qms-best">🏆 ${s.bestPct}%</span>
  </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // ADAPTIVE PICKER
  // ═══════════════════════════════════════════════════════════════════
  function pickAdaptiveWords(words, count) {
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

  // ═══════════════════════════════════════════════════════════════════
  // QUIZ HOME
  // ═══════════════════════════════════════════════════════════════════
  function renderQuizHome() {
    const container = document.getElementById('quizHome');
    if (!container) return;
    const words = getWords();
    const badCount = words.filter(w => normalizeStatus(w) === 'bad').length;
    const exampleCount = words.filter(w => w.ex && w.ex.trim()).length;
    const nounCount = words.filter(w => ['der', 'die', 'das'].includes(w.art)).length;
    const pluralCount = words.filter(w => w.plural && w.plural !== '–').length;
    const grammarCount = getGrammar().length;
    const due = getDueWords();
    const lessonHistory = (state.quizHistory || [])
      .filter(h => h.lessonId === state.activeLessonId)
      .slice(-10).reverse();
    container.innerHTML = `
    <div class="panel">
      <h3 style="text-align:center;font-size:20px;margin-bottom:8px;">🎯 آزمون هوشمند</h3>
      <p class="muted" style="text-align:center;font-size:13px;margin-bottom:12px;">
        ${due.length ? `<span style="color:var(--warning);">📅 ${due.length} کلمه برای مرور آماده‌ست</span>` : 'یکی از حالت‌های آزمون رو انتخاب کن'}
      </p>
      <div class="row" style="margin-bottom:16px;justify-content:center;flex-wrap:wrap;gap:8px;">
        <button class="auto-play-toggle ${autoPlayQuiz ? 'on' : ''}" id="quizAutoPlayToggle" type="button">
          <span class="toggle-indicator"></span>
          <span id="quizAutoPlayLabel">${autoPlayQuiz ? '🔊 پخش خودکار لغت: روشن' : '🔇 پخش خودکار لغت: خاموش'}</span>
        </button>
      </div>
      ${due.length ? `
        <div style="margin-bottom:16px;">
          <button class="btn btn-warning btn-lg" id="quizDailyReviewBtn" style="width:100%;color:#000;">
            📅 شروع مرور روزانه (${due.length} کلمه)
          </button>
        </div>` : ''}
      <div class="quiz-mode-grid">
        <div class="quiz-mode-card mode-mean" data-quiz-mode="mean">
          <span class="mode-icon">🔤</span>
          <div class="mode-title">معنی کلمه</div>
          <div class="mode-desc">${words.length} کلمه</div>
          ${renderModeStatsBadge('mean')}
        </div>
        <div class="quiz-mode-card mode-sentence" data-quiz-mode="sentence">
          <span class="mode-icon">📝</span>
          <div class="mode-title">جای خالی</div>
          <div class="mode-desc">${exampleCount} جمله</div>
          ${renderModeStatsBadge('sentence')}
        </div>
        <div class="quiz-mode-card mode-typing" data-quiz-mode="typing">
          <span class="mode-icon">⌨️</span>
          <div class="mode-title">تایپ کردن</div>
          <div class="mode-desc">${words.length} کلمه</div>
          ${renderModeStatsBadge('typing')}
        </div>
        <div class="quiz-mode-card mode-listening" data-quiz-mode="listening">
          <span class="mode-icon">🎧</span>
          <div class="mode-title">شنیداری</div>
          <div class="mode-desc">${words.length} کلمه</div>
          ${renderModeStatsBadge('listening')}
        </div>
        ${nounCount >= 2 ? `
          <div class="quiz-mode-card mode-article" data-quiz-mode="article">
            <span class="mode-icon">🔤</span>
            <div class="mode-title">جنسیت اسم</div>
            <div class="mode-desc">${nounCount} اسم</div>
            ${renderModeStatsBadge('article')}
          </div>` : ''}
        ${pluralCount >= 2 ? `
          <div class="quiz-mode-card mode-plural" data-quiz-mode="plural">
            <span class="mode-icon">📚</span>
            <div class="mode-title">جمع اسم</div>
            <div class="mode-desc">${pluralCount} اسم</div>
            ${renderModeStatsBadge('plural')}
          </div>` : ''}
        ${grammarCount >= 1 ? `
          <div class="quiz-mode-card mode-grammar" data-quiz-mode="grammar">
            <span class="mode-icon">📘</span>
            <div class="mode-title">گرامر</div>
            <div class="mode-desc">${grammarCount} نکته</div>
            ${renderModeStatsBadge('grammar')}
          </div>` : ''}
      </div>
      ${badCount > 0 ? `
        <div style="text-align:center;margin-top:16px;">
          <button class="btn btn-danger btn-lg" id="quizBadBtn" style="width:100%;">
            ❌ آزمون فقط «بلد نیستم»ها (${badCount})
          </button>
        </div>` : ''}
    </div>
    ${lessonHistory.length ? `
      <div class="panel" style="margin-top:16px;">
        <h3>📊 تاریخچه آزمون‌های این درس</h3>
        <div class="quiz-history-list">
          ${lessonHistory.map(h => {
            const d = new Date(h.date);
            let dateStr = '';
            try { dateStr = d.toLocaleDateString('fa-IR'); } catch (e) { dateStr = d.toLocaleDateString(); }
            return `<div class="quiz-history-item">
              <span class="qh-mode">${quizModeLabel(h.mode)}</span>
              <span class="qh-score" style="color:${h.pct >= 70 ? 'var(--accent)' : h.pct >= 50 ? 'var(--warning)' : 'var(--danger)'}">${h.pct}%</span>
              <span class="qh-detail">${h.correct}/${h.total}</span>
              <span class="qh-date">${dateStr}</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}
  `;
    container.querySelectorAll('[data-quiz-mode]').forEach(card => {
      card.addEventListener('click', () => startQuizMode(card.dataset.quizMode));
    });
    document.getElementById('quizBadBtn')?.addEventListener('click', () => startQuizMode('mean', true));
    document.getElementById('quizDailyReviewBtn')?.addEventListener('click', startDailyReview);
    document.getElementById('quizAutoPlayToggle')?.addEventListener('click', toggleAutoPlayQuiz);
  }

  // ═══════════════════════════════════════════════════════════════════
  // START QUIZ MODE
  // ═══════════════════════════════════════════════════════════════════
  function startQuizMode(mode, onlyBad) {
    if (mode === 'grammar') {
      startGrammarQuiz();
      return;
    }
    let words = getWords().slice();
    if (onlyBad) words = words.filter(w => normalizeStatus(w) === 'bad');
    if (mode === 'sentence') words = words.filter(w => w.ex && w.ex.trim());
    if (mode === 'article') words = words.filter(w => ['der', 'die', 'das'].includes(w.art));
    if (mode === 'plural') words = words.filter(w => w.plural && w.plural !== '–');
    if (words.length < 2) { toast('حداقل ۲ کلمه لازمه', 'warning'); return; }
    quizState.mode = mode;
    quizState.questions = [];
    quizState.index = 0;
    quizState.correct = 0;
    quizState.wrong = 0;
    quizState.wrongWords = [];
    quizState.answered = false;
    quizState.startedAt = Date.now();
    const picked = pickAdaptiveWords(words, Math.min(20, words.length));
    if (mode === 'mean') {
      picked.forEach(w => {
        if (practiceDirection === 'de-fa') {
          const others = words.filter(x => x.id !== w.id).map(x => x.fa).filter(Boolean);
          if (others.length < 2) return;
          quizState.questions.push({ type: 'mean', word: w, correct: w.fa, options: shuffle([w.fa, ...shuffle(others).slice(0, 3)]), dir: 'de-fa' });
        } else {
          const others = words.filter(x => x.id !== w.id).map(x => x.de).filter(Boolean);
          if (others.length < 2) return;
          quizState.questions.push({ type: 'mean', word: w, correct: w.de, options: shuffle([w.de, ...shuffle(others).slice(0, 3)]), dir: 'fa-de' });
        }
      });
    } else if (mode === 'sentence') {
      picked.forEach(w => {
        const others = words.filter(x => x.id !== w.id).map(x => x.de);
        if (others.length < 2) return;
        const escaped = w.de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const masked = w.ex.replace(new RegExp(escaped, 'gi'), '_____');
        quizState.questions.push({ type: 'sentence', word: w, correct: w.de, options: shuffle([w.de, ...shuffle(others).slice(0, 3)]), masked, exMean: w.exMean });
      });
    } else if (mode === 'typing' || mode === 'listening') {
      picked.forEach(w => {
        quizState.questions.push({ type: 'typing', word: w, correct: w.de, mode: mode });
      });
    } else if (mode === 'article') {
      picked.forEach(w => {
        quizState.questions.push({ type: 'article', word: w, correct: w.art, options: ['der', 'die', 'das'] });
      });
    } else if (mode === 'plural') {
      picked.forEach(w => {
        const others = words.filter(x => x.id !== w.id && x.plural && x.plural !== '–').map(x => x.plural);
        if (others.length < 2) return;
        quizState.questions.push({ type: 'plural', word: w, correct: w.plural, options: shuffle([w.plural, ...shuffle(others).slice(0, 3)]) });
      });
    }
    if (!quizState.questions.length) { toast('سوالی ساخته نشد', 'error'); return; }
    quizState.questions = shuffle(quizState.questions).slice(0, 20);
    document.getElementById('quizHome').classList.add('hidden');
    document.getElementById('quizSession').classList.remove('hidden');
    document.getElementById('quizReport').classList.add('hidden');
    document.getElementById('quizSession').classList.add('quiz-question-fullscreen');
    renderQuizQuestionNew();
  }

  // ═══════════════════════════════════════════════════════════════════
  // GRAMMAR QUIZ
  // ═══════════════════════════════════════════════════════════════════
  function startGrammarQuiz() {
    const grammar = getGrammar();
    if (!grammar.length) { toast('گرامری برای این درس نیست', 'warning'); return; }
    quizState.mode = 'grammar';
    quizState.questions = [];
    quizState.index = 0;
    quizState.correct = 0;
    quizState.wrong = 0;
    quizState.wrongWords = [];
    quizState.answered = false;
    quizState.startedAt = Date.now();

    grammar.forEach(g => {
      if (g.rules && g.rules.length >= 2) {
        const correctRule = g.rules[Math.floor(Math.random() * g.rules.length)];
        const otherGrammar = grammar.filter(x => x.id !== g.id);
        if (otherGrammar.length >= 1) {
          const otherRules = [];
          otherGrammar.forEach(og => {
            (og.rules || []).forEach(r => otherRules.push(r));
          });
          if (otherRules.length >= 2) {
            const opts = shuffle([correctRule, ...shuffle(otherRules).slice(0, 3)]);
            quizState.questions.push({
              type: 'grammar-rule',
              grammar: g,
              question: `کدام قاعده مربوط به «${g.title}» است؟`,
              correct: correctRule,
              options: opts
            });
          }
        }
      }
      if (g.examples && g.examples.length >= 1) {
        const correctEx = g.examples[0];
        const otherGrammar = grammar.filter(x => x.id !== g.id);
        const otherExamples = [];
        otherGrammar.forEach(og => {
          (og.examples || []).forEach(ex => otherExamples.push(ex));
        });
        if (otherExamples.length >= 2) {
          const opts = shuffle([correctEx.de, ...shuffle(otherExamples).slice(0, 3).map(e => e.de)]);
          quizState.questions.push({
            type: 'grammar-example',
            grammar: g,
            question: `کدام مثال مربوط به «${g.title}» است؟`,
            correct: correctEx.de,
            options: opts
          });
        }
      }
    });

    if (!quizState.questions.length) { toast('گرامر کافی برای آزمون نیست', 'warning'); return; }
    quizState.questions = shuffle(quizState.questions).slice(0, 20);
    document.getElementById('quizHome').classList.add('hidden');
    document.getElementById('quizSession').classList.remove('hidden');
    document.getElementById('quizReport').classList.add('hidden');
    document.getElementById('quizSession').classList.add('quiz-question-fullscreen');
    renderGrammarQuizQuestion();
  }

  function renderGrammarQuizQuestion() {
    if (quizState.index >= quizState.questions.length) { renderQuizReportNew(); return; }
    const q = quizState.questions[quizState.index];
    const total = quizState.questions.length;
    const progress = (quizState.index / total * 100);
    quizState.answered = false;
    const session = document.getElementById('quizSession');
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
      <div class="quiz-question-box">
        <div class="grammar-quiz-title">${esc(q.grammar.title)}</div>
        <div class="quiz-word" style="font-size:18px;margin:16px 0;color:var(--info);">${esc(q.question)}</div>
      </div>
      <div class="quiz-options">
        ${q.options.map(o => `<button class="quiz-opt" data-qopt="${esc(o)}">${esc(o)}</button>`).join('')}
      </div>
    </div>`;
    document.getElementById('quizExitBtn').addEventListener('click', backToQuizHome);
    session.querySelectorAll('[data-qopt]').forEach(btn => {
      btn.addEventListener('click', () => answerGrammarChoice(q, btn.dataset.qopt));
    });
  }

  function answerGrammarChoice(q, selected) {
    if (quizState.answered) return;
    quizState.answered = true;
    const isCorrect = selected === q.correct;
    if (isCorrect) quizState.correct++;
    else { quizState.wrong++; }
    document.querySelectorAll('[data-qopt]').forEach(btn => {
      btn.disabled = true;
      if (btn.dataset.qopt === q.correct) btn.classList.add('correct');
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
    next.addEventListener('click', () => {
      quizState.index++;
      if (quizState.mode === 'grammar') renderGrammarQuizQuestion();
      else renderQuizQuestionNew();
    });
    document.getElementById('quizSession').appendChild(next);
    setTimeout(() => next.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  }

  // ═══════════════════════════════════════════════════════════════════
  // QUIZ QUESTION RENDER
  // ═══════════════════════════════════════════════════════════════════
  function renderQuizQuestionNew() {
    if (quizState.index >= quizState.questions.length) { renderQuizReportNew(); return; }
    const q = quizState.questions[quizState.index];
    const total = quizState.questions.length;
    const progress = (quizState.index / total * 100);
    quizState.answered = false;
    const session = document.getElementById('quizSession');
    const wordFull = getFullGermanWord(q.word);
    let questionHtml = '';
    if (q.type === 'mean') {
      const showDe = (q.dir || 'de-fa') === 'de-fa';
      questionHtml = `
      <div class="quiz-question-box">
        <div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:8px;">
          ${showDe ? 'معنی این کلمه چیه؟' : 'معادل آلمانی این کلمه چیه؟'}
        </div>
        <div class="quiz-word-with-speak">
          ${showDe ? germanSpeakBtn(wordFull, { size: 'lg', title: 'پخش تلفظ آلمانی' }) : ''}
          <div class="quiz-word" style="font-size:clamp(28px,7vw,42px);margin:0;">${esc(showDe ? q.word.de : q.word.fa)}</div>
        </div>
      </div>
      <div class="quiz-options">
        ${q.options.map(o => `<button class="quiz-opt" data-qopt="${esc(o)}">${esc(o)}</button>`).join('')}
      </div>`;
    } else if (q.type === 'sentence') {
      questionHtml = `
      <div class="quiz-question-box">
        <div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:8px;">کدوم کلمه توی جای خالی میاد؟</div>
        <div class="quiz-sentence-with-speak">
          ${germanSpeakBtn(q.word.ex || q.word.de, { size: 'md', title: 'پخش جمله کامل آلمانی' })}
          <div class="quiz-sentence" style="margin:0;">"${esc(q.masked)}"</div>
        </div>
      </div>
      <div class="quiz-options">
        ${q.options.map(o => `<button class="quiz-opt" data-qopt="${esc(o)}">${esc(o)}</button>`).join('')}
      </div>`;
    } else if (q.type === 'typing') {
      const isListening = q.mode === 'listening';
      questionHtml = `
      <div class="quiz-question-box">
        <div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:8px;">
          ${isListening ? 'گوش کن و بنویس' : 'ترجمه فارسی → تایپ آلمانی'}
        </div>
        ${isListening ? `
          <button class="quiz-listen-btn" id="quizListenBtn">🔊</button>
        ` : `<div class="quiz-word" style="color:var(--accent);">${esc(q.word.fa)}</div>`}
        <input type="text" class="quiz-typing-input" id="quizTypingInput" placeholder="آلمانی رو تایپ کن..." dir="ltr" autocomplete="off">
        <button class="btn btn-primary" id="quizCheckBtn" style="width:100%;margin-top:12px;padding:12px;">✅ بررسی جواب</button>
      </div>`;
    } else if (q.type === 'article') {
      questionHtml = `
      <div class="quiz-question-box">
        <div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:8px;">آرتیکل درست چیه؟</div>
        <div class="quiz-word-with-speak">
          ${germanSpeakBtn(q.word.de, { size: 'lg', title: 'پخش تلفظ آلمانی (بدون آرتیکل)' })}
          <div class="quiz-word" style="font-size:clamp(28px,7vw,42px);margin:0;">${esc(q.word.de)}</div>
        </div>
        <div style="text-align:center;color:var(--muted);font-size:13px;margin-top:6px;">${esc(q.word.fa)}</div>
      </div>
      <div class="quiz-options">
        ${q.options.map(o => `<button class="quiz-opt article-opt-${o}" data-qopt="${esc(o)}">${esc(o)}</button>`).join('')}
      </div>`;
    } else if (q.type === 'plural') {
      questionHtml = `
      <div class="quiz-question-box">
        <div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:8px;">جمع این اسم چیه؟</div>
        <div class="quiz-word-with-speak">
          ${germanSpeakBtn(q.word.de, { size: 'lg', title: 'پخش تلفظ آلمانی (مفرد)' })}
          <div class="quiz-word" style="font-size:clamp(28px,7vw,42px);margin:0;">
            ${q.word.art && q.word.art !== '–' ? `<span style="opacity:0.7;font-size:0.6em;">${esc(q.word.art)}</span> ` : ''}${esc(q.word.de)}
          </div>
        </div>
        <div style="text-align:center;color:var(--muted);font-size:13px;margin-top:6px;">${esc(q.word.fa)}</div>
      </div>
      <div class="quiz-options">
        ${q.options.map(o => `<button class="quiz-opt" data-qopt="${esc(o)}">${esc(o)}</button>`).join('')}
      </div>`;
    }
    session.innerHTML = `
    <div class="panel">
      <div class="quiz-session-header">
        <div class="quiz-progress-info">
          <span class="q-num">${quizState.index + 1} / ${total}</span>
          <span style="color:var(--muted);">${Math.round(progress)}٪</span>
        </div>
        <div class="quiz-score">
          <button class="auto-play-toggle ${autoPlayQuiz ? 'on' : ''}" id="quizAutoPlayToggleSession" type="button" style="padding:4px 10px;font-size:11px;">
            <span class="toggle-indicator" style="width:26px;height:14px;"></span>
            <span id="quizAutoPlayLabelSession">${autoPlayQuiz ? '🔊 خودکار' : '🔇 خودکار'}</span>
          </button>
          <span class="correct-count">✅ ${quizState.correct}</span>
          <span class="wrong-count">❌ ${quizState.wrong}</span>
          <button class="btn btn-sm" id="quizExitBtn">⬅️ خروج</button>
        </div>
      </div>
      <div class="quiz-progress" style="margin-bottom:20px;">
        <div class="quiz-progress-fill" style="width:${progress}%"></div>
      </div>
      ${questionHtml}
    </div>`;
    document.getElementById('quizExitBtn').addEventListener('click', backToQuizHome);
    document.getElementById('quizAutoPlayToggleSession')?.addEventListener('click', toggleAutoPlayQuiz);
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
      }
      setTimeout(() => input.focus(), 100);
      checkBtn.addEventListener('click', () => checkTypingAnswer(q, input));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkTypingAnswer(q, input); });
    } else {
      session.querySelectorAll('[data-qopt]').forEach(btn => {
        btn.addEventListener('click', () => answerChoice(q, btn.dataset.qopt));
      });
    }
    wireGermanSpeakButtons(session);
    if (autoPlayQuiz) {
      setTimeout(() => {
        if (q.type === 'mean') {
          const showDe = (q.dir || 'de-fa') === 'de-fa';
          if (showDe) speakTTS(wordFull);
        } else if (q.type === 'article' || q.type === 'plural') {
          speakTTS(q.word.de);
        } else if (q.type === 'sentence') {
          speakTTS(q.word.ex || q.word.de);
        } else if (q.type === 'typing' && q.mode === 'listening') {
          speakTTS(q.word.de);
        }
      }, 400);
    }
  }

  function answerChoice(q, selected) {
    if (quizState.answered) return;
    quizState.answered = true;
    const isCorrect = germanEquals(selected, q.correct);
    if (isCorrect) { quizState.correct++; reviewWord(q.word, 'good'); }
    else { quizState.wrong++; quizState.wrongWords.push(q.word); reviewWord(q.word, 'bad'); }
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

  function checkTypingAnswer(q, input) {
    if (quizState.answered) return;
    const userAnswer = (input.value || '').trim();
    const isCorrect = germanEquals(userAnswer, q.correct);
    quizState.answered = true;
    input.disabled = true;
    if (isCorrect) { quizState.correct++; reviewWord(q.word, 'good'); input.classList.add('correct'); }
    else { quizState.wrong++; quizState.wrongWords.push(q.word); reviewWord(q.word, 'bad'); input.classList.add('wrong'); }
    const fb = document.createElement('div');
    fb.className = 'quiz-feedback ' + (isCorrect ? 'correct' : 'wrong');
    fb.innerHTML = isCorrect
      ? `✅ آفرین! — <strong style="direction:ltr;">${esc(q.correct)}</strong>`
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
  }

  // ═══════════════════════════════════════════════════════════════════
  // QUIZ REPORT
  // ═══════════════════════════════════════════════════════════════════
  function renderQuizReportNew() {
    const total = quizState.correct + quizState.wrong;
    const pct = total ? Math.round((quizState.correct / total) * 100) : 0;
    let badge, badgeText;
    if (pct >= 90) { badge = 'excellent'; badgeText = '🏆 فوق‌العاده!'; }
    else if (pct >= 70) { badge = 'good'; badgeText = '👍 خیلی خوب!'; }
    else if (pct >= 50) { badge = 'average'; badgeText = '📚 خوب، ولی بیشتر تمرین کن'; }
    else { badge = 'weak'; badgeText = '💪 نیاز به تمرین بیشتر'; }
    if (!state.quizHistory) state.quizHistory = [];
    state.quizHistory.push({
      id: uid(), date: Date.now(),
      bookId: state.activeBookId, lessonId: state.activeLessonId,
      mode: quizState.mode, correct: quizState.correct, wrong: quizState.wrong,
      total, pct
    });
    if (state.quizHistory.length > 100) state.quizHistory = state.quizHistory.slice(-100);
    if (quizState.mode === 'article') {
      if (!Array.isArray(state.articleHistory)) state.articleHistory = [];
      state.articleHistory.push({
        id: uid(), date: Date.now(), lessonId: state.activeLessonId,
        correct: quizState.correct, total, pct
      });
      if (state.articleHistory.length > 50) state.articleHistory = state.articleHistory.slice(-50);
    }
    save();
    document.getElementById('quizSession').classList.add('hidden');
    document.getElementById('quizSession').classList.remove('quiz-question-fullscreen');
    const report = document.getElementById('quizReport');
    report.classList.remove('hidden');
    report.innerHTML = `
    <div class="quiz-report-hero">
      <div class="quiz-report-badge ${badge}">${badgeText}</div>
      <div class="quiz-report-score">${pct}%</div>
      <div style="font-size:14px;color:var(--muted);">${quizState.correct} از ${total} پاسخ درست</div>
    </div>
    <div class="quiz-report-stats">
      <div class="quiz-report-stat correct-stat"><span class="stat-num">${quizState.correct}</span><span class="stat-lbl">✅ درست</span></div>
      <div class="quiz-report-stat wrong-stat"><span class="stat-num">${quizState.wrong}</span><span class="stat-lbl">❌ اشتباه</span></div>
      <div class="quiz-report-stat total-stat"><span class="stat-num">${total}</span><span class="stat-lbl">📊 کل سوال</span></div>
    </div>
    ${quizState.wrongWords.length ? `
      <div class="quiz-failed-section">
        <h4>⚠️ کلمات اشتباه (${quizState.wrongWords.length})</h4>
        <div class="quiz-failed-list">
          ${quizState.wrongWords.map(w => {
            const full = getFullGermanWord(w);
            return `
            <div class="quiz-failed-item">
              <span class="de">${esc(full)}${germanSpeakBtn(full, { size: 'sm', title: 'پخش تلفظ آلمانی' })}</span>
              <span class="fa">${esc(w.fa)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : `
      <div style="text-align:center;padding:20px;color:var(--accent);font-size:16px;font-weight:700;">🎉 عالی!</div>
    `}
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:20px;">
      <button class="btn btn-primary btn-lg" id="quizBackBtn" style="width:100%;">🏠 بازگشت به منوی آزمون</button>
      ${quizState.wrongWords.length ? `<button class="btn btn-danger btn-lg" id="quizRetryWrongBtn" style="width:100%;">🔄 آزمون مجدد کلمات اشتباه</button>` : ''}
    </div>`;
    wireGermanSpeakButtons(report);
    document.getElementById('quizBackBtn').addEventListener('click', backToQuizHome);
    const retryBtn = document.getElementById('quizRetryWrongBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        const wrongWords = quizState.wrongWords;
        if (wrongWords.length < 2) { toast('برای آزمون مجدد حداقل ۲ کلمه لازمه', 'warning'); return; }
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
        document.getElementById('quizSession').classList.add('quiz-question-fullscreen');
        renderQuizQuestionNew();
      });
    }
    renderAll(); populateLessonTargets(); updateReviewBanner();
  }

  function backToQuizHome() {
    quizState.mode = null;
    quizState.questions = [];
    quizState.index = 0;
    quizState.correct = 0;
    quizState.wrong = 0;
    quizState.wrongWords = [];
    document.getElementById('quizReport').classList.add('hidden');
    document.getElementById('quizSession').classList.add('hidden');
    document.getElementById('quizSession').classList.remove('quiz-question-fullscreen');
    document.getElementById('quizHome').classList.remove('hidden');
    renderQuizHome();
  }

  // ═══════════════════════════════════════════════════════════════════
  // GRAMMAR (آکاردئون)
  // ═══════════════════════════════════════════════════════════════════
  function renderGrammar() {
    const cont = document.getElementById('grammarList');
    if (!cont) return;
    const grammar = getGrammar();
    if (!grammar.length) {
      cont.innerHTML = `<div class="empty">هنوز گرامری برای این درس ثبت نشده</div>`;
      return;
    }
    const lesson = getLesson();
    const lessonId = lesson ? lesson.id : 'default';
    const seenCount = grammar.filter(g => grammarSeen[lessonId + '_' + g.id]).length;
    const progressPct = grammar.length ? Math.round((seenCount / grammar.length) * 100) : 0;

    let html = `<div class="grammar-progress-wrap">
      <div class="grammar-progress-label">
        <span>📘 پیشرفت مطالعه گرامر</span>
        <span>${seenCount} / ${grammar.length} (${progressPct}%)</span>
      </div>
      <div class="grammar-progress-bar"><div class="grammar-progress-fill" style="width:${progressPct}%"></div></div>
    </div>`;

    html += `<div class="grammar-accordion">`;
    grammar.forEach(g => {
      const isExpanded = grammarExpanded[lessonId + '_' + g.id] === true;
      const isSeen = grammarSeen[lessonId + '_' + g.id] === true;
      html += `<div class="grammar-accordion-item ${isExpanded ? 'expanded' : ''}" data-grammar-id="${g.id}">
        <div class="grammar-accordion-header" data-toggle-grammar="${g.id}">
          <span class="grammar-priority-badge">${g.priority || 1}</span>
          <h4 class="grammar-accordion-title">${esc(g.title)}</h4>
          ${isSeen ? '<span class="grammar-seen-badge">✅</span>' : ''}
          <span class="grammar-accordion-arrow">${isExpanded ? '▲' : '▼'}</span>
        </div>
        <div class="grammar-accordion-body">
          <div class="grammar-explanation">${esc(g.explanation || '')}</div>
          ${(g.rules && g.rules.length) ? `
            <div class="grammar-section">
              <div class="grammar-section-title">📌 قوانین</div>
              <ul class="grammar-rules">${g.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
            </div>` : ''}
          ${(g.examples && g.examples.length) ? `
            <div class="grammar-section">
              <div class="grammar-section-title">💬 مثال‌ها</div>
              <div class="grammar-examples">
                ${g.examples.map(ex => `
                  <div class="grammar-example">
                    ${renderSentenceWithAudio(ex.de, ex.fa, ex.audio || '', { className: 'grammar-ex' })}
                  </div>`).join('')}
              </div>
            </div>` : ''}
          ${(g.commonMistakes && g.commonMistakes.length) ? `
            <div class="grammar-section">
              <div class="grammar-section-title">⚠️ اشتباهات رایج</div>
              <ul class="grammar-mistakes">${g.commonMistakes.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
            </div>` : ''}
          <button class="btn btn-sm btn-success grammar-mark-seen" data-mark-seen="${g.id}">${isSeen ? '✅ دیده شد' : '👁 علامت‌گذاری به‌عنوان دیده‌شده'}</button>
        </div>
      </div>`;
    });
    html += `</div>`;
    cont.innerHTML = html;

    cont.querySelectorAll('[data-toggle-grammar]').forEach(el => {
      el.addEventListener('click', () => {
        const gid = el.dataset.toggleGrammar;
        const key = lessonId + '_' + gid;
        grammarExpanded[key] = !grammarExpanded[key];
        renderGrammar();
      });
    });
    cont.querySelectorAll('[data-mark-seen]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const gid = btn.dataset.markSeen;
        const key = lessonId + '_' + gid;
        grammarSeen[key] = true;
        try { localStorage.setItem(GRAMMAR_SEEN_KEY, JSON.stringify(grammarSeen)); } catch (e) { }
        renderGrammar();
        toast('✅ گرامر به‌عنوان دیده‌شده علامت‌گذاری شد', 'success');
      });
    });
    wireGermanSpeakButtons(cont);
    wireSentenceAudio(cont);
    wireClickableWords(cont);
  }

  // ═══════════════════════════════════════════════════════════════════
  // VERBS
  // ═══════════════════════════════════════════════════════════════════
  function renderVerbsTab() {
    const cont = document.getElementById('verbsList');
    if (!cont) return;
    const words = getWords();
    const verbWords = words.filter(w => w.art === 'Verb' || w.category === 'verb');
    const lesson = getLesson();
    const extraVerbs = (lesson && Array.isArray(lesson.verbs)) ? lesson.verbs : [];

    if (!verbWords.length && !extraVerbs.length) {
      cont.innerHTML = `<div class="empty">هنوز فعلی برای این درس ثبت نشده</div>`;
      return;
    }

    const formsOrder = [
      { key: 'ich', label: 'ich' },
      { key: 'du', label: 'du' },
      { key: 'er/sie/es', label: 'er / sie / es' },
      { key: 'wir', label: 'wir' },
      { key: 'ihr', label: 'ihr' },
      { key: 'sie/Sie', label: 'sie / Sie' }
    ];

    let html = '';

    verbWords.forEach(w => {
      const forms = w.forms || {};
      const hasForms = formsOrder.some(f => forms[f.key] && String(forms[f.key]).trim());
      html += `<div class="verb-card">
        <div class="verb-card-header">
          <span class="verb-word">${esc(w.de)}</span>
          ${germanSpeakBtn(w.de, { size: 'sm', title: 'پخش مصدر' })}
          <span class="verb-meaning">${esc(w.fa)}</span>
        </div>`;
      if (hasForms) {
        html += `<div class="verb-conj-grid">`;
        formsOrder.forEach(f => {
          const val = forms[f.key];
          if (val && String(val).trim()) {
            html += `<div class="verb-conj-cell">
              <span class="verb-pronoun">${esc(f.label)}</span>
              <span class="verb-form">${esc(val)}</span>
              ${germanSpeakBtn(val, { size: 'xs', title: 'پخش' })}
            </div>`;
          }
        });
        html += `</div>`;
      } else {
        html += `<div class="verb-no-conj">⚠️ صرف برای این فعل ثبت نشده است</div>`;
      }
      if (w.ex) {
        html += `<div class="verb-example">${renderSentenceWithAudio(w.ex, w.exMean || '', w.exAudio || '', { className: 'verb-example' })}</div>`;
      }
      html += `</div>`;
    });

    extraVerbs.forEach(v => {
      if (!v || !v.verb) return;
      const conj = v.conjugation || {};
      const hasConj = formsOrder.some(f => conj[f.key] && String(conj[f.key]).trim());
      html += `<div class="verb-card">
        <div class="verb-card-header">
          <span class="verb-word">${esc(v.verb)}</span>
          ${germanSpeakBtn(v.verb, { size: 'sm', title: 'پخش مصدر' })}
          <span class="verb-meaning">${esc(v.fa || '')}</span>
        </div>`;
      if (hasConj) {
        html += `<div class="verb-conj-grid">`;
        formsOrder.forEach(f => {
          const val = conj[f.key];
          if (val && String(val).trim()) {
            html += `<div class="verb-conj-cell">
              <span class="verb-pronoun">${esc(f.label)}</span>
              <span class="verb-form">${esc(val)}</span>
              ${germanSpeakBtn(val, { size: 'xs', title: 'پخش' })}
            </div>`;
          }
        });
        html += `</div>`;
      }
      if (v.example) {
        html += `<div class="verb-example">${renderSentenceWithAudio(v.example, '', '', { className: 'verb-example' })}</div>`;
      }
      html += `</div>`;
    });

    cont.innerHTML = html;
    wireGermanSpeakButtons(cont);
    wireSentenceAudio(cont);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PLACEHOLDER — بخش‌های بعدی
  // ═══════════════════════════════════════════════════════════════════
  // ادامه در بخش ۴ (content, wordView, tooltip, sentence grammar)
    // ═══════════════════════════════════════════════════════════════════
  // SENTENCE WITH AUDIO (همراه با 📖 گرامر + ❤️⭐🔥)
  // ═══════════════════════════════════════════════════════════════════
  function renderSentenceWithAudio(sentenceDe, sentenceFa, audioUrl, options) {
    options = options || {};
    const showAudio = options.showAudio !== false;
    const showGrammar = options.showGrammar !== false;
    const showMarks = options.showMarks !== false;
    const sentenceObj = options.sentenceObj || null;
    const extraClass = options.className || '';
    const highlighted = highlightClickableWords(sentenceDe);

    let actionBtns = '';
    if (showAudio && sentenceDe && String(sentenceDe).trim()) {
      const hasAudio = audioUrl && audioUrl.trim();
      actionBtns += `<button class="sentence-action-btn sentence-speak-btn ${hasAudio ? 'has-audio' : ''}" 
        data-sentence-speak="${esc(sentenceDe)}" 
        data-sentence-audio="${esc(audioUrl || '')}" 
        title="${hasAudio ? 'پخش فایل صوتی' : 'تلفظ آلمانی'}">
        ${hasAudio ? '🎵' : '🔊'}
      </button>`;
    }
    if (showGrammar && sentenceDe && String(sentenceDe).trim()) {
      actionBtns += `<button class="sentence-action-btn sentence-grammar-btn" 
        data-sentence-grammar="${esc(sentenceDe)}" 
        data-sentence-fa="${esc(sentenceFa || '')}"
        title="📖 ساختار و گرامر جمله">📖</button>`;
    }
    if (showMarks && sentenceObj) {
      actionBtns += `<button class="sentence-action-btn sentence-mark-btn ${sentenceObj.heart ? 'active-heart' : ''}" 
        data-sentence-mark-heart="${esc(sentenceObj.id || '')}" 
        title="موردعلاقه">${sentenceObj.heart ? '❤️' : '🤍'}</button>`;
      actionBtns += `<button class="sentence-action-btn sentence-mark-btn ${sentenceObj.star ? 'active-star' : ''}" 
        data-sentence-mark-star="${esc(sentenceObj.id || '')}" 
        title="مهم">${sentenceObj.star ? '⭐' : '☆'}</button>`;
      actionBtns += `<button class="sentence-action-btn sentence-mark-btn ${sentenceObj.fire ? 'active-fire' : ''}" 
        data-sentence-mark-fire="${esc(sentenceObj.id || '')}" 
        title="خیلی مهم">🔥</button>`;
    }

    return `<div class="sentence-with-audio ${extraClass}" data-sentence-id="${sentenceObj ? esc(sentenceObj.id) : ''}">
    <div class="sentence-de-row">
      <span class="sentence-de-text">${highlighted}</span>
      <div class="sentence-actions">${actionBtns}</div>
    </div>
    ${sentenceFa ? `<div class="sentence-fa">${esc(sentenceFa)}</div>` : ''}
  </div>`;
  }

  function wireSentenceAudio(container) {
    if (!container) return;
    container.querySelectorAll('[data-sentence-speak]').forEach(btn => {
      if (btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        e.preventDefault();
        speak(btn.dataset.sentenceSpeak, btn.dataset.sentenceAudio);
      });
    });
    container.querySelectorAll('[data-sentence-grammar]').forEach(btn => {
      if (btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        e.preventDefault();
        openGrammarExplainModal(btn.dataset.sentenceGrammar, btn.dataset.sentenceFa);
      });
    });
    container.querySelectorAll('[data-sentence-mark-heart]').forEach(btn => {
      if (btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        e.preventDefault();
        handleSentenceMark(btn.dataset.sentenceMarkHeart, 'heart', btn);
      });
    });
    container.querySelectorAll('[data-sentence-mark-star]').forEach(btn => {
      if (btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        e.preventDefault();
        handleSentenceMark(btn.dataset.sentenceMarkStar, 'star', btn);
      });
    });
    container.querySelectorAll('[data-sentence-mark-fire]').forEach(btn => {
      if (btn._wired) return;
      btn._wired = true;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        e.preventDefault();
        handleSentenceMark(btn.dataset.sentenceMarkFire, 'fire', btn);
      });
    });
  }

  function handleSentenceMark(sentenceId, level, btn) {
    if (!sentenceId) return;
    const result = findSentenceById(sentenceId);
    if (!result) { toast('جمله پیدا نشد', 'warning'); return; }
    const sent = result.sentence;
    const wasActive = sent[level];
    // فقط یکی از ۳ سطح
    sent.heart = false;
    sent.star = false;
    sent.fire = false;
    if (!wasActive) sent[level] = true;
    save();
    // آپدیت UI
    const allBtns = btn.parentElement.querySelectorAll('.sentence-mark-btn');
    allBtns.forEach(b => {
      b.classList.remove('active-heart', 'active-star', 'active-fire');
    });
    if (sent.heart) {
      const hb = btn.parentElement.querySelector('[data-sentence-mark-heart]');
      if (hb) { hb.classList.add('active-heart'); hb.textContent = '❤️'; }
    } else {
      const hb = btn.parentElement.querySelector('[data-sentence-mark-heart]');
      if (hb) { hb.classList.remove('active-heart'); hb.textContent = '🤍'; }
    }
    if (sent.star) {
      const sb = btn.parentElement.querySelector('[data-sentence-mark-star]');
      if (sb) { sb.classList.add('active-star'); sb.textContent = '⭐'; }
    } else {
      const sb = btn.parentElement.querySelector('[data-sentence-mark-star]');
      if (sb) { sb.classList.remove('active-star'); sb.textContent = '☆'; }
    }
    if (sent.fire) {
      const fb = btn.parentElement.querySelector('[data-sentence-mark-fire]');
      if (fb) fb.classList.add('active-fire');
    } else {
      const fb = btn.parentElement.querySelector('[data-sentence-mark-fire]');
      if (fb) fb.classList.remove('active-fire');
    }
    const msg = sent.heart ? '❤️ به موردعلاقه‌ها اضافه شد' :
                sent.star ? '⭐ به مهم‌ها اضافه شد' :
                sent.fire ? '🔥 به خیلی مهم‌ها اضافه شد' :
                'علامت برداشته شد';
    toast(msg, 'success');
  }

  // ═══════════════════════════════════════════════════════════════════
  // FIND SENTENCE BY ID (جستجو در تمام جملات درس + state)
  // ═══════════════════════════════════════════════════════════════════
  function findSentenceById(sentenceId) {
    if (!sentenceId) return null;
    const lesson = getLesson();
    if (!lesson) return null;
    // story
    for (const s of (lesson.stories || [])) {
      for (const sent of (s.sentences || [])) {
        if (sent.id === sentenceId) return { sentence: sent, source: 'story', story: s };
      }
    }
    // letter
    for (const l of (lesson.letters || [])) {
      if (l.sentences) {
        for (const sent of l.sentences) {
          if (sent.id === sentenceId) return { sentence: sent, source: 'letter', letter: l };
        }
      }
    }
    // dialogue
    for (const d of (lesson.dialogues || [])) {
      for (const line of (d.lines || [])) {
        if (line.id === sentenceId) return { sentence: line, source: 'dialogue', dialogue: d };
      }
    }
    // chat
    for (const c of (lesson.chats || [])) {
      for (const line of (c.lines || [])) {
        if (line.id === sentenceId) return { sentence: line, source: 'chat', chat: c };
      }
    }
    // grammar examples
    for (const g of (lesson.grammar || [])) {
      for (const ex of (g.examples || [])) {
        if (ex.id === sentenceId) return { sentence: ex, source: 'grammar', grammar: g };
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // GRAMMAR EXPLAIN MODAL — 📖 گرامر جمله
  // ═══════════════════════════════════════════════════════════════════
  function openGrammarExplainModal(sentenceDe, sentenceFa) {
    const modal = document.getElementById('modalGrammarExplain');
    const content = document.getElementById('grammarExplainContent');
    if (!modal || !content) return;

    // پیدا کردن جمله در JSON (اگه wordByWord داشت)
    let sentenceObj = null;
    const lesson = getLesson();
    if (lesson) {
      const all = [];
      (lesson.stories || []).forEach(s => (s.sentences || []).forEach(x => all.push(x)));
      (lesson.dialogues || []).forEach(d => (d.lines || []).forEach(x => all.push(x)));
      (lesson.chats || []).forEach(c => (c.lines || []).forEach(x => all.push(x)));
      (lesson.grammar || []).forEach(g => (g.examples || []).forEach(x => all.push(x)));
      sentenceObj = all.find(x => x.de === sentenceDe);
    }

    let html = '';

    // جمله
    html += `<div class="gx-sentence-box">
      <div class="gx-sentence-de">${germanSpeakBtn(sentenceDe, { size: 'md', title: 'پخش تلفظ' })} ${esc(sentenceDe)}</div>
      ${sentenceFa ? `<div class="gx-sentence-fa">${esc(sentenceFa)}</div>` : ''}
    </div>`;

    // ترجمه کلمه‌به‌کلمه
    html += `<div class="gx-section">
      <div class="gx-section-title">🔤 ترجمه کلمه‌به‌کلمه</div>`;

    let wordByWord = [];
    if (sentenceObj && Array.isArray(sentenceObj.wordByWord) && sentenceObj.wordByWord.length) {
      // از JSON
      wordByWord = sentenceObj.wordByWord;
    } else {
      // خودکار از دیکشنری
      const words = sentenceDe.split(/\s+/).filter(w => w);
      const allWords = getWords();
      wordByWord = words.map(w => {
        const clean = w.replace(/[.,!?;:()"'«»„“”–—]/g, '');
        if (!clean) return { word: w, fa: '', type: 'punct' };
        const found = allWords.find(x => x.de.toLowerCase() === clean.toLowerCase());
        if (found) {
          return {
            word: w,
            fa: found.fa,
            type: found.art === 'Verb' ? 'verb' : ['der', 'die', 'das'].includes(found.art) ? 'noun' : 'other',
            article: found.art !== '–' ? found.art : null
          };
        }
        // تطبیق ریشه (برای صرف‌شده‌ها)
        const partial = allWords.find(x => {
          const xd = x.de.toLowerCase();
          const cd = clean.toLowerCase();
          return xd.length >= 3 && (cd.startsWith(xd.slice(0, 4)) || xd.startsWith(cd.slice(0, 4)));
        });
        if (partial) {
          return { word: w, fa: partial.fa + ' (احتمالاً)', type: 'other' };
        }
        return { word: w, fa: '—', type: 'unknown' };
      });
    }

    html += `<div class="gx-word-list">`;
    wordByWord.forEach(item => {
      const typeClass = item.type === 'verb' ? 'gx-verb' :
                        item.type === 'noun' ? 'gx-noun' :
                        item.type === 'pronoun' ? 'gx-pronoun' :
                        item.type === 'article' ? 'gx-article' :
                        item.type === 'adj' ? 'gx-adj' : 'gx-other';
      html += `<div class="gx-word-item ${typeClass}">
        <div class="gx-word-de">${esc(item.word)}${item.article ? ` <span class="gx-article-badge">${esc(item.article)}</span>` : ''}</div>
        <div class="gx-word-fa">${esc(item.fa || '—')}</div>
        ${item.case ? `<div class="gx-word-case">${esc(item.case)}</div>` : ''}
        ${item.form ? `<div class="gx-word-form">${esc(item.form)}</div>` : ''}
      </div>`;
    });
    html += `</div></div>`;

    // ساختار گرامری
    if (sentenceObj && sentenceObj.structure) {
      const st = sentenceObj.structure;
      html += `<div class="gx-section">
        <div class="gx-section-title">📘 ساختار گرامری</div>
        <div class="gx-structure-box">`;
      if (st.type) html += `<div class="gx-structure-row"><span class="gx-structure-label">نوع جمله:</span><span>${esc(st.type)}</span></div>`;
      if (st.subject) html += `<div class="gx-structure-row"><span class="gx-structure-label">فاعل:</span><span>${esc(st.subject)}</span></div>`;
      if (st.verb) html += `<div class="gx-structure-row"><span class="gx-structure-label">فعل:</span><span>${esc(st.verb)}</span></div>`;
      if (st.object) html += `<div class="gx-structure-row"><span class="gx-structure-label">مفعول:</span><span>${esc(st.object)}</span></div>`;
      if (st.wordOrder) html += `<div class="gx-structure-row"><span class="gx-structure-label">ترتیب:</span><span>${esc(st.wordOrder)}</span></div>`;
      html += `</div></div>`;
    }

    // نکات گرامری
    if (sentenceObj && Array.isArray(sentenceObj.grammarPoints) && sentenceObj.grammarPoints.length) {
      html += `<div class="gx-section">
        <div class="gx-section-title">💡 نکات گرامری</div>
        <ul class="gx-points-list">
          ${sentenceObj.grammarPoints.map(p => `<li>${esc(p)}</li>`).join('')}
        </ul>
      </div>`;
    }

    // سطح گرامری
    if (sentenceObj && sentenceObj.grammarLevel) {
      const gl = sentenceObj.grammarLevel;
      html += `<div class="gx-section">
        <div class="gx-section-title">🎯 سطح گرامری</div>
        <div class="gx-level-row">
          <span class="gx-level-badge ${gl.nominativ ? 'on' : 'off'}">Nominativ</span>
          <span class="gx-level-badge ${gl.akkusativ ? 'on' : 'off'}">Akkusativ</span>
          <span class="gx-level-badge ${gl.dativ ? 'on' : 'off'}">Dativ</span>
          <span class="gx-level-badge ${gl.genitiv ? 'on' : 'off'}">Genitiv</span>
        </div>
      </div>`;
    }

    // درس معرفی
    if (sentenceObj && sentenceObj.lessonIntroduced) {
      html += `<div class="gx-lesson-note">📚 این ساختار در <strong>${esc(sentenceObj.lessonIntroduced)}</strong> معرفی شده</div>`;
    }

    // اگه هیچ اطلاعات گرامری نداشت
    if (!sentenceObj || (!sentenceObj.structure && !sentenceObj.grammarPoints)) {
      html += `<div class="gx-empty-note">💡 برای توضیح کامل ساختار گرامری این جمله، می‌تونی در JSON فیلدهای <code>wordByWord</code>، <code>structure</code>، <code>grammarPoints</code> رو اضافه کنی.</div>`;
    }

    content.innerHTML = html;
    wireGermanSpeakButtons(content);
    modal.classList.add('active');
    document.body.classList.add('locked');
  }

  // ═══════════════════════════════════════════════════════════════════
  // CLICKABLE WORDS
  // ═══════════════════════════════════════════════════════════════════
  function findWordAnywhere(wordText) {
    if (!wordText) return null;
    const book = getBook();
    if (!book) return null;
    const clean = wordText.toLowerCase().replace(/[.,!?;:()"'«»„“”–—\-]/g, '').trim();
    if (!clean) return null;
    const activeLesson = getLesson();
    if (activeLesson) {
      const found = (activeLesson.words || []).find(w => {
        const wClean = w.de.toLowerCase().replace(/[.,!?;:()"'«»„“”–—\-]/g, '');
        return wClean === clean || w.de.toLowerCase() === clean;
      });
      if (found) return { word: found, lesson: activeLesson, isActiveLesson: true };
    }
    for (const lesson of book.lessons) {
      if (activeLesson && lesson.id === activeLesson.id) continue;
      const found = (lesson.words || []).find(w => {
        const wClean = w.de.toLowerCase().replace(/[.,!?;:()"'«»„“”–—\-]/g, '');
        return wClean === clean || w.de.toLowerCase() === clean;
      });
      if (found) return { word: found, lesson, isActiveLesson: false };
    }
    return null;
  }

  function highlightClickableWords(sentenceDe) {
    if (!sentenceDe) return '';
    const parts = sentenceDe.split(/(\s+|[.,!?;:()"'«»„“”\[\]{}–—\-]+)/);
    return parts.map(part => {
      if (!part) return '';
      if (/^\s+$/.test(part)) return part;
      if (/^[.,!?;:()"'«»„“”\[\]{}–—\-]+$/.test(part)) return esc(part);
      const result = findWordAnywhere(part);
      if (result) {
        const w = result.word;
        const lessonLabel = result.isActiveLesson ? '📖 این درس' : `📚 ${esc(result.lesson.title)}`;
        return `<span class="clickable-word" data-click-word="${esc(w.de)}" data-word-id="${esc(w.id)}" data-lesson-id="${esc(result.lesson.id)}" data-is-active="${result.isActiveLesson}" title="${esc(w.fa)} — ${lessonLabel}">${esc(part)}</span>`;
      }
      return esc(part);
    }).join('');
  }

  function wireClickableWords(container) {
    container.querySelectorAll('.clickable-word').forEach(el => {
      if (el._wired) return;
      el._wired = true;
      el.addEventListener('click', e => {
        e.stopPropagation();
        e.preventDefault();
        showWordTooltip(el.dataset.clickWord, el.dataset.lessonId, el.dataset.isActive === 'true');
      });
    });
  }

  function showWordTooltip(wordText, lessonId, isActive) {
    const result = findWordAnywhere(wordText);
    if (!result) { toast('این کلمه در کتاب پیدا نشد', 'warning'); return; }
    const w = result.word;
    const modal = document.getElementById('wordTooltipModal');
    const content = document.getElementById('wordTooltipContent');
    const lesson = result.lesson;
    const locationLabel = result.isActiveLesson ? '📖 این درس' : `📚 ${esc(lesson.title)}`;
    const hasEx = w.ex && w.ex.trim();
    const wordFull = getFullGermanWord(w);
    content.innerHTML = `
    <button class="wt-close" id="wtClose">✕</button>
    <div class="wt-header">
      ${w.art && w.art !== '–' ? `<span class="wt-art ${articleClass(w.art)}">${esc(w.art)}</span>` : ''}
      <span class="wt-word">${esc(w.de)}</span>
      ${germanSpeakBtn(wordFull, { size: 'md', title: 'پخش تلفظ آلمانی' })}
      ${w.plural && w.plural !== '–' ? `<span class="wt-plural">جمع: ${esc(w.plural)}${germanSpeakBtn(w.plural, { size: 'sm', title: 'پخش جمع' })}</span>` : ''}
    </div>
    <div class="wt-fa">${esc(w.fa)}</div>
    <div class="wt-location">${locationLabel}</div>
    ${hasEx ? `<div class="wt-example">
      ${renderSentenceWithAudio(w.ex, w.exMean || '', w.exAudio || '', { className: 'tooltip-example', showMarks: false })}
    </div>` : ''}
    <div class="wt-actions">
      <button class="btn btn-sm btn-primary" id="wtSpeak">🔊 تلفظ</button>
      <button class="btn btn-sm ${w.heart ? 'btn-heart' : ''}" id="wtHeart" style="${w.heart ? 'background:var(--heart-color);color:#fff;' : ''}">${w.heart ? '❤️' : '🤍'} موردعلاقه</button>
      <button class="btn btn-sm ${w.star ? 'btn-star' : ''}" id="wtStar" style="${w.star ? 'background:var(--warning);color:#000;' : ''}">${w.star ? '⭐' : '☆'} مهم</button>
      <button class="btn btn-sm ${w.fire ? 'btn-fire' : ''}" id="wtFire" style="${w.fire ? 'background:var(--fire-color);color:#fff;' : ''}">🔥 خیلی مهم</button>
      <button class="btn btn-sm" id="wtOpenFull" style="background:var(--info);color:#fff;">📖 مشاهده کامل</button>
    </div>
  `;
    modal.classList.add('active');
    document.body.classList.add('locked');
    document.getElementById('wtClose').addEventListener('click', () => {
      modal.classList.remove('active');
      document.body.classList.remove('locked');
    });
    document.getElementById('wtSpeak').addEventListener('click', () => speakTTS(wordFull));
    document.getElementById('wtHeart').addEventListener('click', () => {
      toggleHeart(w.id);
      modal.classList.remove('active');
      document.body.classList.remove('locked');
    });
    document.getElementById('wtStar').addEventListener('click', () => {
      toggleStar(w.id);
      modal.classList.remove('active');
      document.body.classList.remove('locked');
    });
    document.getElementById('wtFire').addEventListener('click', () => {
      toggleFire(w.id);
      modal.classList.remove('active');
      document.body.classList.remove('locked');
    });
    document.getElementById('wtOpenFull').addEventListener('click', () => {
      modal.classList.remove('active');
      document.body.classList.remove('locked');
      if (!result.isActiveLesson) {
        if (practice.active) exitPractice();
        state.activeLessonId = lesson.id;
        save();
        renderAll();
        populateLessonTargets();
      }
      setTimeout(() => openWordView(w.id), 200);
    });
    wireSentenceAudio(content);
    wireClickableWords(content);
    wireGermanSpeakButtons(content);
    modal.addEventListener('click', e => {
      if (e.target === modal) { modal.classList.remove('active'); document.body.classList.remove('locked'); }
    }, { once: true });
  }

  // ═══════════════════════════════════════════════════════════════════
  // BUILD EXAMPLES FOR CARD
  // ═══════════════════════════════════════════════════════════════════
  function buildExamplesForCard(w) {
    const examples = [];
    if (w.ex && w.ex.trim()) {
      examples.push({ de: w.ex, fa: w.exMean || '', audio: w.exAudio || '', source: 'main' });
    }
    (w.contextExamples || []).forEach(cx => {
      if (cx && cx.de) {
        examples.push({ de: cx.de, fa: cx.fa || '', audio: cx.audio || cx.audioUrl || '', source: 'context', type: cx.type || '' });
      }
    });
    (w.extraExamples || []).forEach(ex => {
      if (typeof ex === 'string') {
        examples.push({ de: ex, fa: '', audio: '', source: 'extra' });
      } else if (ex && ex.de) {
        examples.push({ de: ex.de, fa: ex.fa || '', audio: ex.audio || ex.audioUrl || '', source: 'extra' });
      }
    });
    if (examples.length < 2 && w.de) {
      const autoExamples = generateAutoExamples(w);
      autoExamples.forEach(ae => {
        if (!examples.some(e => e.de.toLowerCase() === ae.de.toLowerCase())) {
          examples.push(ae);
        }
      });
    }
    return examples;
  }

  function generateAutoExamples(w) {
    const out = [];
    const de = w.de;
    const art = w.art || '';
    const fa = w.fa || '';
    const plural = w.plural && w.plural !== '–' ? w.plural : '';
    if (['der', 'die', 'das'].includes(art)) {
      out.push({ de: `Das ist ${art} ${de}.`, fa: `این ${fa} است.`, audio: '', source: 'auto' });
      if (plural) {
        out.push({ de: `Die ${plural} sind hier.`, fa: `${fa}ها اینجا هستند.`, audio: '', source: 'auto' });
      } else {
        out.push({ de: `Ich sehe ${art} ${de}.`, fa: `من ${fa} را می‌بینم.`, audio: '', source: 'auto' });
      }
    } else if (art === 'Verb') {
      out.push({ de: `Ich kann ${de}.`, fa: `من می‌توانم ${fa}.`, audio: '', source: 'auto' });
      out.push({ de: `Er will ${de}.`, fa: `او می‌خواهد ${fa}.`, audio: '', source: 'auto' });
    } else if (art === 'Adj') {
      out.push({ de: `Das ist sehr ${de}.`, fa: `این خیلی ${fa} است.`, audio: '', source: 'auto' });
      out.push({ de: `Ich finde es ${de}.`, fa: `من آن را ${fa} می‌دانم.`, audio: '', source: 'auto' });
    } else if (art === 'Adv') {
      out.push({ de: `Er macht das ${de}.`, fa: `او آن را ${fa} انجام می‌دهد.`, audio: '', source: 'auto' });
      out.push({ de: `Sie sagt das ${de}.`, fa: `او آن را ${fa} می‌گوید.`, audio: '', source: 'auto' });
    } else {
      out.push({ de: `${de}`, fa: fa, audio: '', source: 'auto' });
      out.push({ de: `Ich kenne ${de}.`, fa: `من ${fa} را می‌شناسم.`, audio: '', source: 'auto' });
    }
    return out;
  }

  // ═══════════════════════════════════════════════════════════════════
  // OPEN WORD VIEW
  // ═══════════════════════════════════════════════════════════════════
  function openWordView(wordId) {
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
    const collocations = word.collocations || [];
    const commonMistakes = word.commonMistakes || [];
    const contextExamples = word.contextExamples || [];
    const formLabels = { present: 'حال', past: 'گذشته', perfect: 'ماضی نقلی', future: 'آینده', imperative: 'امری', participle: 'اسم مفعول' };
    const allExamples = buildExamplesForCard(word);
    const wordFull = getFullGermanWord(word);

    let html = `
    <button class="word-view-close" id="wvClose">✕</button>
    <button class="word-view-edit-btn" id="wvEdit">✏️ ادیت</button>
    <button class="word-view-delete-btn" id="wvDelete">🗑 حذف</button>
    <div class="word-view-header">
      ${word.art && word.art !== '–' ? `<span class="word-view-art ${articleClass(word.art)}">${esc(word.art)}</span>` : ''}
      <span class="word-view-de">${esc(word.de)}</span>
      ${germanSpeakBtn(wordFull, { size: 'md', title: 'پخش تلفظ آلمانی' })}
      ${word.plural && word.plural !== '–' ? `<span class="word-view-plural">جمع: ${esc(word.plural)}${germanSpeakBtn(word.plural, { size: 'sm', title: 'پخش جمع' })}</span>` : ''}
    </div>
    ${word.ipa ? `<div class="word-view-ipa">🔊 ${esc(word.ipa)}</div>` : ''}
    <div class="word-view-fa">${esc(word.fa)}</div>
    <div class="word-view-actions-row">
      <span class="word-type-badge ${wt.type}">${wt.icon} ${wt.label}</span>
      <button class="btn btn-sm btn-primary" id="wvSpeak">🔊 تلفظ</button>
      <button class="btn btn-sm ${word.heart ? 'btn-heart' : ''}" id="wvHeart" style="${word.heart ? 'background:var(--heart-color);color:#fff;' : ''}">${word.heart ? '❤️' : '🤍'} موردعلاقه</button>
      <button class="btn btn-sm ${word.star ? 'btn-star' : ''}" id="wvStar" style="${word.star ? 'background:var(--warning);color:#000;' : ''}">${word.star ? '⭐' : '☆'} مهم</button>
      <button class="btn btn-sm ${word.fire ? 'btn-fire' : ''}" id="wvFire" style="${word.fire ? 'background:var(--fire-color);color:#fff;' : ''}">🔥 خیلی مهم</button>
      <span class="btn btn-sm" style="background:${st === 'good' ? 'var(--accent)' : st === 'learning' ? 'var(--warning)' : st === 'bad' ? 'var(--danger)' : 'var(--bg-3)'};color:#fff;cursor:default;">${statusLabels[st] || st}</span>
      <span class="btn btn-sm" style="background:var(--bg-3);cursor:default;">📦 جعبه ${srs.box}</span>
    </div>
    <div class="word-view-media-row">
      <button class="btn btn-sm" id="wvAddVideo" style="background:var(--info);color:#fff;">🎬 ویدیو (${(word.videos || []).length})</button>
      <button class="btn btn-sm" id="wvAddAudio" style="background:var(--purple);color:#fff;">🎙 آدیو (${(word.audios || []).length})</button>
    </div>
  `;
    if (allExamples.length) {
      html += `<div class="word-view-section" style="border-right-color:var(--warning);">
      <h4>📚 جملات نمونه (${allExamples.length})</h4>
      <div class="extra-examples-list">
        ${allExamples.map(ex => {
          const sourceBadge = ex.source === 'auto'
            ? `<span class="ex-source-badge auto">🤖 خودکار</span>`
            : ex.source === 'context'
              ? `<span class="ex-source-badge context">🎯 بافت</span>`
              : '';
          return `<div class="extra-example-item ${ex.source === 'main' ? 'main-example' : ''}">
            ${sourceBadge}
            ${renderSentenceWithAudio(ex.de, ex.fa, ex.audio, { className: 'wv-example', showMarks: false })}
          </div>`;
        }).join('')}
      </div>
    </div>`;
    }
    const formsKeys = Object.keys(forms).filter(k => forms[k] && String(forms[k]).trim());
    if (formsKeys.length) {
      html += `<div class="word-view-section"><h4>🔤 صرف فعل</h4><div class="conjugation-grid">`;
      formsKeys.forEach(key => {
        html += `<div class="conj-row"><span class="conj-label">${esc(formLabels[key] || key)}</span><span class="conj-value">${esc(forms[key])}${germanSpeakBtn(forms[key], { size: 'sm', title: 'پخش' })}</span></div>`;
      });
      html += `</div></div>`;
    }
    if (collocations.length) {
      html += `<div class="word-view-section" style="border-right-color:var(--info);">
      <h4>🔗 ترکیب‌های رایج</h4>
      <div class="chips-list">${collocations.map(c => {
        const de = c.de || c;
        return `<span class="chip collocation">${esc(de)}${c.fa ? ' — ' + esc(c.fa) : ''}${germanSpeakBtn(de, { size: 'xs', title: 'پخش' })}</span>`;
      }).join('')}</div>
    </div>`;
    }
    if (synonyms.length) {
      html += `<div class="word-view-section" style="border-right-color:var(--accent);">
      <h4>🔗 مترادف‌ها</h4>
      <div class="chips-list">${synonyms.map(s => `<span class="chip synonym">${esc(s)}${germanSpeakBtn(s, { size: 'xs', title: 'پخش' })}</span>`).join('')}</div>
    </div>`;
    }
    if (related.length) {
      html += `<div class="word-view-section" style="border-right-color:var(--purple);">
      <h4>📎 کلمات مرتبط</h4>
      <div class="chips-list">${related.map(s => `<span class="chip related">${esc(s)}${germanSpeakBtn(s, { size: 'xs', title: 'پخش' })}</span>`).join('')}</div>
    </div>`;
    }
    if (contextExamples.length) {
      html += `<div class="word-view-section" style="border-right-color:var(--info);">
      <h4>🎯 جملات در بافت (${contextExamples.length})</h4>
      <div class="extra-examples-list">
        ${contextExamples.map(ex => {
          const typeLabel = ex.type === 'question' ? '❓ سؤالی' : ex.type === 'negative' ? '🚫 منفی' : ex.type === 'past' ? '⏪ گذشته' : '';
          return `<div class="extra-example-item">
            ${typeLabel ? `<div class="context-type">${typeLabel}</div>` : ''}
            ${renderSentenceWithAudio(ex.de || '', ex.fa || '', ex.audio || '', { className: 'wv-example', showMarks: false })}
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
    if (commonMistakes.length) {
      html += `<div class="word-view-section" style="border-right-color:var(--danger);">
      <h4>⚠️ اشتباهات رایج</h4>
      <div class="notes-inline-list">${commonMistakes.map(m => `<div class="note-inline-item" style="border-right-color:var(--danger);">${esc(m)}</div>`).join('')}</div>
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
      toast('حذف شد', 'success');
    });
    document.getElementById('wvSpeak').addEventListener('click', () => speakTTS(wordFull));
    document.getElementById('wvHeart').addEventListener('click', () => {
      toggleHeart(word.id);
      modal.classList.remove('active');
      document.body.classList.remove('locked');
    });
    document.getElementById('wvStar').addEventListener('click', () => {
      toggleStar(word.id);
      modal.classList.remove('active');
      document.body.classList.remove('locked');
    });
    document.getElementById('wvFire').addEventListener('click', () => {
      toggleFire(word.id);
      modal.classList.remove('active');
      document.body.classList.remove('locked');
    });
    document.getElementById('wvAddVideo')?.addEventListener('click', () => {
      modal.classList.remove('active');
      document.body.classList.remove('locked');
      if (typeof openWordMediaModal === 'function') openWordMediaModal(word.id, 'video');
    });
    document.getElementById('wvAddAudio')?.addEventListener('click', () => {
      modal.classList.remove('active');
      document.body.classList.remove('locked');
      if (typeof openWordMediaModal === 'function') openWordMediaModal(word.id, 'audio');
    });
    wireClickableWords(content);
    wireSentenceAudio(content);
    wireGermanSpeakButtons(content);
    modal.addEventListener('click', e => {
      if (e.target === modal) { modal.classList.remove('active'); document.body.classList.remove('locked'); }
    }, { once: true });
    if (autoPlayWord) setTimeout(() => speakTTS(wordFull), 200);
  }

  // ═══════════════════════════════════════════════════════════════════
  // OPEN WORD EDIT
  // ═══════════════════════════════════════════════════════════════════
  function openWordEdit(wordId) {
    const word = getWords().find(w => w.id === wordId);
    if (!word) { toast('کلمه پیدا نشد', 'error'); return; }
    const modal = document.getElementById('wordEditModal');
    const content = document.getElementById('wordEditContent');
    const forms = word.forms || {};
    const formLabels = { present: 'حال', past: 'گذشته', perfect: 'ماضی نقلی', future: 'آینده', imperative: 'امری', participle: 'اسم مفعول' };
    const synonyms = (word.synonyms || []).join(', ');
    const related = (word.related || []).join(', ');
    const notes = (word.notes || []).join('\n');
    const collocations = (word.collocations || []).map(c => (c.de || c) + (c.fa ? ' | ' + c.fa : '')).join('\n');
    const extraExamples = (word.extraExamples || []).map(ex => {
      const de = typeof ex === 'string' ? ex : ex.de;
      const fa = typeof ex === 'string' ? '' : ex.fa;
      return de + ' | ' + fa;
    }).join('\n');
    let html = `
    <div class="word-edit-header"><h3>✏️ ویرایش کامل لغت</h3><button class="word-edit-close" id="weClose">✕</button></div>
    <div class="word-edit-form-group">
      <h4>📝 اطلاعات اصلی</h4>
      <div class="word-edit-row">
        <div class="word-edit-field"><label>کلمه آلمانی *</label><input id="weDe" value="${esc(word.de || '')}" dir="ltr"></div>
        <div class="word-edit-field"><label>نوع کلمه</label>
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
        <div class="word-edit-field"><label>جمع</label><input id="wePlural" value="${esc(word.plural || '')}" dir="ltr"></div>
        <div class="word-edit-field"><label>ترجمه فارسی *</label><input id="weFa" value="${esc(word.fa || '')}"></div>
      </div>
      <div class="word-edit-row">
        <div class="word-edit-field"><label>IPA</label><input id="weIpa" value="${esc(word.ipa || '')}" dir="ltr"></div>
        <div class="word-edit-field"><label>سطح</label><input id="weDifficulty" value="${esc(word.difficulty || '')}" dir="ltr"></div>
      </div>
    </div>
    <div class="word-edit-form-group">
      <h4>📌 جمله مثال</h4>
      <div class="word-edit-field"><label>جمله آلمانی</label><input id="weEx" value="${esc(word.ex || '')}" dir="ltr"></div>
      <div class="word-edit-field"><label>ترجمه جمله</label><input id="weExMean" value="${esc(word.exMean || '')}"></div>
      <div class="word-edit-field"><label>🎵 لینک صوتی جمله</label><input id="weExAudio" value="${esc(word.exAudio || '')}" dir="ltr"></div>
    </div>
    <div class="word-edit-form-group">
      <h4>🔤 صرف فعل</h4>
      ${Object.keys(formLabels).map(key => `<div class="word-edit-field"><label>${formLabels[key]}</label><input id="weForm_${key}" value="${esc(forms[key] || '')}" dir="ltr"></div>`).join('')}
    </div>
    <div class="word-edit-form-group"><h4>🔗 مترادف‌ها (با کاما)</h4><div class="word-edit-field"><input id="weSynonyms" value="${esc(synonyms)}" dir="ltr"></div></div>
    <div class="word-edit-form-group"><h4>📎 کلمات مرتبط (با کاما)</h4><div class="word-edit-field"><input id="weRelated" value="${esc(related)}" dir="ltr"></div></div>
    <div class="word-edit-form-group"><h4>🎯 ترکیب‌های رایج (هر خط: آلمانی | فارسی)</h4><div class="word-edit-field"><textarea id="weCollocations" dir="ltr">${esc(collocations)}</textarea></div></div>
    <div class="word-edit-form-group"><h4>📚 جملات بیشتر (هر خط: آلمانی | فارسی)</h4><div class="word-edit-field"><textarea id="weExtraExamples" dir="ltr">${esc(extraExamples)}</textarea></div></div>
    <div class="word-edit-form-group"><h4>📝 یادداشت</h4><div class="word-edit-field"><textarea id="weNote">${esc(word.note || '')}</textarea></div></div>
    <div class="word-edit-form-group"><h4>💡 نکات (هر خط یک نکته)</h4><div class="word-edit-field"><textarea id="weNotes">${esc(notes)}</textarea></div></div>
    <div class="word-edit-actions">
      <button class="btn btn-primary" id="weSave">💾 ذخیره</button>
      <button class="btn" id="weCancel">لغو</button>
    </div>
  `;
    content.innerHTML = html;
    modal.classList.add('active');
    document.body.classList.add('locked');
    const close = () => { modal.classList.remove('active'); document.body.classList.remove('locked'); };
    document.getElementById('weClose').addEventListener('click', close);
    document.getElementById('weCancel').addEventListener('click', close);
    document.getElementById('weSave').addEventListener('click', () => {
      const de = document.getElementById('weDe').value.trim();
      const fa = document.getElementById('weFa').value.trim();
      if (!de || !fa) { toast('کلمه و ترجمه لازمه', 'error'); return; }
      word.de = de;
      word.art = document.getElementById('weArt').value;
      word.plural = document.getElementById('wePlural').value.trim() || '–';
      word.fa = fa;
      word.ipa = document.getElementById('weIpa').value.trim();
      word.difficulty = document.getElementById('weDifficulty').value.trim();
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
      const collocLines = document.getElementById('weCollocations').value.split(/\r?\n/);
      const collocs = [];
      collocLines.forEach(line => {
        if (!line.trim()) return;
        const sep = line.indexOf('|');
        if (sep < 1) { collocs.push({ de: line.trim(), fa: '' }); return; }
        collocs.push({ de: line.slice(0, sep).trim(), fa: line.slice(sep + 1).trim() });
      });
      word.collocations = collocs;
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
      close();
      renderAll(); populateLessonTargets();
      toast('✅ تغییرات ذخیره شد', 'success');
    });
    modal.addEventListener('click', e => { if (e.target === modal) close(); }, { once: true });
  }

  // ═══════════════════════════════════════════════════════════════════
  // CONTENT (STORIES / LETTERS / DIALOGUES / CHATS)
  // ═══════════════════════════════════════════════════════════════════
  function renderContentTabs() {
    const cont = document.getElementById('contentTabs');
    if (!cont) return;
    const stories = getStories();
    const letters = getLetters();
    const dialogues = getDialogues();
    const chats = getChats();
    const counts = {
      all: stories.length + letters.length + dialogues.length + chats.length,
      story: stories.length,
      'letter-formal': letters.filter(l => l.type === 'letter-formal').length,
      'letter-informal': letters.filter(l => l.type === 'letter-informal').length,
      dialogue: dialogues.length,
      chat: chats.length
    };
    const tabs = [
      { key: 'all', label: '📚 همه' },
      { key: 'story', label: '📖 داستان' },
      { key: 'letter-formal', label: '📧 نامه رسمی' },
      { key: 'letter-informal', label: '💌 نامه غیررسمی' },
      { key: 'dialogue', label: '💬 دیالوگ' },
      { key: 'chat', label: '📱 چت' }
    ];
    cont.innerHTML = tabs.filter(t => t.key === 'all' || counts[t.key] > 0).map(t => `
    <button class="content-tab-btn ${currentContentType === t.key ? 'active' : ''}" data-content-type="${t.key}">
      ${t.label} <span class="content-tab-count">${counts[t.key]}</span>
    </button>
  `).join('');
    cont.querySelectorAll('[data-content-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentContentType = btn.dataset.contentType;
        renderContentTabs();
        renderContentGrid();
      });
    });
  }

  function renderContentGrid() {
    const grid = document.getElementById('contentGrid');
    if (!grid) return;
    const stories = getStories();
    const letters = getLetters();
    const dialogues = getDialogues();
    const chats = getChats();
    let items = [];
    const typeFilter = currentContentType;
    if (typeFilter === 'all' || typeFilter === 'story') {
      stories.forEach(s => items.push({ ...s, _kind: 'story' }));
    }
    if (typeFilter === 'all' || typeFilter === 'letter-formal' || typeFilter === 'letter-informal') {
      letters.forEach(l => {
        if (typeFilter === 'all' || l.type === typeFilter) items.push({ ...l, _kind: 'letter' });
      });
    }
    if (typeFilter === 'all' || typeFilter === 'dialogue') {
      dialogues.forEach(d => items.push({ ...d, _kind: 'dialogue' }));
    }
    if (typeFilter === 'all' || typeFilter === 'chat') {
      chats.forEach(c => items.push({ ...c, _kind: 'chat' }));
    }
    if (!items.length) {
      grid.innerHTML = `<div class="empty">محتوایی در این دسته وجود ندارد</div>`;
      return;
    }
    grid.innerHTML = items.map(item => {
      const img = safeImageSrc(item.coverImage);
      const color = safeCoverColor(item.coverColor);
      let typeLabel = '';
      let typeClass = '';
      if (item._kind === 'story') { typeLabel = '📖 داستان'; typeClass = 'story'; }
      else if (item._kind === 'letter' && item.type === 'letter-formal') { typeLabel = '📧 رسمی'; typeClass = 'formal'; }
      else if (item._kind === 'letter') { typeLabel = '💌 غیررسمی'; typeClass = 'informal'; }
      else if (item._kind === 'dialogue') { typeLabel = '💬 دیالوگ'; typeClass = 'dialogue'; }
      else if (item._kind === 'chat') { typeLabel = item.type === 'formal' ? '📱 چت رسمی' : '📱 چت دوستانه'; typeClass = 'dialogue'; }
      return `<div class="story-card-wrapper">
      <button class="story-card type-${typeClass}" style="--cover-color:${color};width:100%;" data-content-id="${item.id}" data-content-kind="${item._kind}">
        ${img ? `<img src="${esc(img)}" alt="">` : ''}
        <span class="story-type-badge">${typeLabel}</span>
        <span class="title">${esc(item.title)}</span>
      </button>
      <button class="story-edit-btn" data-edit="${item.id}" data-edit-kind="${item._kind}" title="ویرایش">✏️</button>
      <button class="story-del-btn" data-del-story="${item.id}" data-del-kind="${item._kind}" title="حذف">✕</button>
    </div>`;
    }).join('');
    grid.querySelectorAll('[data-content-id]').forEach(btn => {
      btn.addEventListener('click', () => openContent(btn.dataset.contentId, btn.dataset.contentKind));
    });
    grid.querySelectorAll('[data-del-story]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const kind = btn.dataset.delKind;
        const id = btn.dataset.delStory;
        if (!confirm('حذف این محتوا؟')) return;
        const l = getLesson();
        if (kind === 'story') l.stories = (l.stories || []).filter(x => x.id !== id);
        else if (kind === 'letter') l.letters = (l.letters || []).filter(x => x.id !== id);
        else if (kind === 'dialogue') l.dialogues = (l.dialogues || []).filter(x => x.id !== id);
        else if (kind === 'chat') l.chats = (l.chats || []).filter(x => x.id !== id);
        save(); renderContentTabs(); renderContentGrid(); populateLessonTargets();
        toast('حذف شد', 'success');
      });
    });
    grid.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); loadContentForEdit(btn.dataset.edit, btn.dataset.editKind); });
    });
  }

  function openContent(id, kind) {
    if (kind === 'story') openStory(id);
    else if (kind === 'letter') openLetter(id);
    else if (kind === 'dialogue') openDialogue(id);
    else if (kind === 'chat') openChat(id);
  }

  function openChat(id) {
    const c = getChats().find(x => x.id === id);
    if (!c) return;
    currentStoryId = id;
    repeatCounter = 0;
    renderContentReader({
      title: c.title,
      type: 'chat',
      typeLabel: c.type === 'formal' ? '📱 چت رسمی' : '📱 چت دوستانه',
      audio: '',
      coverImage: c.coverImage,
      coverColor: c.coverColor,
      sentences: c.lines,
      itemId: id,
      isChat: true
    });
  }

  function openStory(id) {
    const s = getStories().find(x => x.id === id);
    if (!s) return;
    currentStoryId = id;
    repeatCounter = 0;
    renderContentReader({
      title: s.title, type: 'story', typeLabel: '📖 داستان',
      audio: s.audio, coverImage: s.coverImage, coverColor: s.coverColor,
      sentences: s.sentences, itemId: id
    });
  }

  function openLetter(id) {
    const l = getLetters().find(x => x.id === id);
    if (!l) return;
    currentStoryId = id;
    repeatCounter = 0;
    const sentences = [];
    if (l.de) {
      const deLines = l.de.split(/\r?\n/);
      const faLines = (l.fa || '').split(/\r?\n/);
      deLines.forEach((line, i) => {
        if (line.trim() || (faLines[i] || '').trim()) {
          sentences.push({ id: uid(), de: line.trim(), fa: (faLines[i] || '').trim(), audio: '', heart: false, star: false, fire: false });
        }
      });
    }
    renderContentReader({
      title: l.title, type: l.type,
      typeLabel: l.type === 'letter-formal' ? '📧 نامه رسمی' : '💌 نامه غیررسمی',
      audio: l.audio, coverImage: l.coverImage, coverColor: l.coverColor,
      sentences, itemId: id, isLetter: true
    });
  }

  function openDialogue(id) {
    const d = getDialogues().find(x => x.id === id);
    if (!d) return;
    currentStoryId = id;
    repeatCounter = 0;
    renderContentReader({
      title: d.title, type: 'dialogue', typeLabel: '💬 دیالوگ',
      audio: d.audio, coverImage: d.coverImage, coverColor: d.coverColor,
      sentences: d.lines, itemId: id, isDialogue: true
    });
  }

  function renderContentReader(data) {
    const modal = document.getElementById('storyReaderModal');
    const body = document.getElementById('storyReaderBody');
    modal.classList.add('active');
    document.body.classList.add('locked');
    const audio = toDirectAudioUrl(data.audio);
    const coverImage = safeImageSrc(data.coverImage);
    const coverColor = safeCoverColor(data.coverColor);
    let playerClass = 'audio-player';
    let playerStyle = '';
    if (coverImage) {
      playerClass += ' has-bg-image';
      playerStyle = ` style="--player-cover-image:url('${esc(coverImage)}')"`;
    } else {
      playerClass += ' has-bg-color';
      playerStyle = ` style="--player-cover-color:${coverColor}"`;
    }

    let navItems = [];
    let navKind = 'story';
    if (data.type === 'story') { navItems = getStories(); navKind = 'story'; }
    else if (data.type === 'letter-formal' || data.type === 'letter-informal') { navItems = getLetters(); navKind = 'letter'; }
    else if (data.type === 'dialogue') { navItems = getDialogues(); navKind = 'dialogue'; }
    else if (data.type === 'chat') { navItems = getChats(); navKind = 'chat'; }

    const currentIdx = navItems.findIndex(x => x.id === data.itemId);
    const hasPrev = currentIdx > 0;
    const hasNext = currentIdx < navItems.length - 1;

    let html = `<div class="story-reader-header-row">
      <div class="content-reader-type-badge type-${data.type}">${data.typeLabel}</div>
      <h2 class="story-reader-title">${esc(data.title)}</h2>
    </div>`;

    if (navItems.length > 1) {
      html += `<div class="story-quick-nav">`;
      navItems.forEach((st, i) => {
        html += `<button class="story-quick-nav-btn ${st.id === data.itemId ? 'active' : ''}" data-jump-story="${st.id}" data-jump-kind="${navKind}">${i + 1}. ${esc(st.title)}</button>`;
      });
      html += `</div>`;
    }

    html += `<div class="story-reader-body-scroll" id="storyScrollBody">`;
    if (data.isLetter) {
      data.sentences.forEach(sent => {
        if (!sent.de && !sent.fa) {
          html += `<div class="letter-paragraph-break"></div>`;
          return;
        }
        html += `<div class="story-sentence letter-line">`;
        html += renderSentenceWithAudio(sent.de, sent.fa, sent.audio || '', { className: 'reader-sentence', sentenceObj: sent });
        html += `</div>`;
      });
    } else if (data.isDialogue) {
      data.sentences.forEach(sent => {
        const speakerClass = sent.speaker === 'A' ? 'speaker-a' : 'speaker-b';
        html += `<div class="dialogue-line ${speakerClass}">`;
        if (sent.speaker) html += `<span class="dialogue-speaker">${esc(sent.speaker)}</span>`;
        html += renderSentenceWithAudio(sent.de, sent.fa, sent.audio || '', { className: 'dialogue-sentence', sentenceObj: sent });
        html += `</div>`;
      });
    } else if (data.isChat) {
      html += `<div class="chat-container">`;
      data.sentences.forEach((sent, i) => {
        const side = i % 2 === 0 ? 'from-a' : 'from-b';
        html += `<div class="chat-bubble ${side}" data-chat-sentence-id="${esc(sent.id)}">`;
        if (sent.sender) html += `<div class="chat-sender">${esc(sent.sender)}</div>`;
        html += `<div class="chat-de">${highlightClickableWords(sent.de)}</div>`;
        if (sent.fa) html += `<div class="chat-fa">${esc(sent.fa)}</div>`;
        html += `<div class="chat-actions">
          ${germanSpeakBtn(sent.de, { size: 'xs', title: 'پخش' })}
          <button class="sentence-action-btn sentence-grammar-btn" data-sentence-grammar="${esc(sent.de)}" data-sentence-fa="${esc(sent.fa || '')}" title="📖 گرامر">📖</button>
          <button class="sentence-action-btn sentence-mark-btn ${sent.heart ? 'active-heart' : ''}" data-sentence-mark-heart="${esc(sent.id)}" title="موردعلاقه">${sent.heart ? '❤️' : '🤍'}</button>
          <button class="sentence-action-btn sentence-mark-btn ${sent.star ? 'active-star' : ''}" data-sentence-mark-star="${esc(sent.id)}" title="مهم">${sent.star ? '⭐' : '☆'}</button>
          <button class="sentence-action-btn sentence-mark-btn ${sent.fire ? 'active-fire' : ''}" data-sentence-mark-fire="${esc(sent.id)}" title="خیلی مهم">🔥</button>
        </div>`;
        html += `</div>`;
      });
      html += `</div>`;
    } else {
      data.sentences.forEach((sent, i) => {
        html += `<div class="story-sentence">`;
        html += `<div style="font-size:11px;color:var(--muted);margin-bottom:4px;">${i + 1}</div>`;
        html += renderSentenceWithAudio(sent.de, sent.fa, sent.audio || '', { className: 'reader-sentence', sentenceObj: sent });
        html += `</div>`;
      });
    }
    html += `</div>`;

    html += `<div class="story-toolbar">
    <button class="btn btn-sm" id="toggleFa">👁 نمایش/پنهان ترجمه</button>
  </div>`;

    if (audio) {
      const downloadName = (data.title || 'audio').replace(/[\\/:*?"<>|]/g, '_') + '.mp3';
      html += `<div class="${playerClass}" data-audio-player${playerStyle}>
      <div class="audio-player-label">🎧 ${esc(data.title)}</div>
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

    body.innerHTML = html;

    body.querySelectorAll('[data-jump-story]').forEach(btn => {
      btn.addEventListener('click', () => openContent(btn.dataset.jumpStory, btn.dataset.jumpKind));
    });
    const activeNav = body.querySelector('.story-quick-nav-btn.active');
    if (activeNav) {
      try { activeNav.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); } catch (e) { }
    }

    wireClickableWords(body);
    wireSentenceAudio(body);
    wireGermanSpeakButtons(body);

    const toggleBtn = document.getElementById('toggleFa');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        document.querySelectorAll('.sentence-fa').forEach(el => el.classList.toggle('hidden'));
      });
    }

    if (audio) {
      const playerEl = document.querySelector('[data-audio-player]');
      if (playerEl) {
        if (coverImage) {
          const styleId = 'style_' + (data.itemId || 'x').replace(/[^a-zA-Z0-9]/g, '');
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

  // ═══════════════════════════════════════════════════════════════════
  // CUSTOM AUDIO PLAYER
  // ═══════════════════════════════════════════════════════════════════
  function setupCustomAudioPlayer(root) {
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

    function updatePlayState() {
      if (audioEl.paused) { playBtn.textContent = '▶'; playBtn.classList.remove('playing'); }
      else { playBtn.textContent = '❚❚'; playBtn.classList.add('playing'); }
    }
    playBtn.addEventListener('click', () => {
      if (audioEl.paused) audioEl.play().catch(() => { });
      else audioEl.pause();
    });
    audioEl.addEventListener('play', updatePlayState);
    audioEl.addEventListener('pause', updatePlayState);
    audioEl.addEventListener('ended', () => {
      updatePlayState();
      if (repeatMode === 0) return;
      if (repeatMode === 4) { audioEl.currentTime = 0; audioEl.play().catch(() => { }); return; }
      if (repeatMode === 1 || repeatMode === 2) {
        if (repeatCounter < repeatMode) {
          repeatCounter++;
          audioEl.currentTime = 0;
          audioEl.play().catch(() => { });
          return;
        } else {
          repeatCounter = 0;
          goToAdjacentStory(1, true);
          return;
        }
      }
      if (repeatMode === 3) { goToAdjacentStory(1, true); return; }
    });
    audioEl.addEventListener('loadedmetadata', () => {
      durationEl.textContent = fmtTime(audioEl.duration);
      progress.max = audioEl.duration || 0;
    });
    audioEl.addEventListener('timeupdate', () => {
      if (!isSeeking) progress.value = audioEl.currentTime || 0;
      currentEl.textContent = fmtTime(audioEl.currentTime);
    });
    progress.addEventListener('input', () => { isSeeking = true; currentEl.textContent = fmtTime(parseFloat(progress.value) || 0); });
    progress.addEventListener('change', () => { audioEl.currentTime = parseFloat(progress.value) || 0; isSeeking = false; });
    if (volume) {
      volume.addEventListener('input', () => {
        const v = parseInt(volume.value, 10) / 100;
        audioEl.volume = v;
        if (volIcon) {
          if (v === 0) volIcon.textContent = '🔇';
          else if (v < 0.5) volIcon.textContent = '🔉';
          else volIcon.textContent = '🔊';
        }
      });
    }
    if (volIcon) {
      volIcon.addEventListener('click', () => {
        if (audioEl.volume > 0) {
          audioEl.dataset.prevVol = audioEl.volume;
          audioEl.volume = 0;
          if (volume) volume.value = 0;
        } else {
          const prev = parseFloat(audioEl.dataset.prevVol) || 1;
          audioEl.volume = prev;
          if (volume) volume.value = Math.round(prev * 100);
        }
        if (volIcon) {
          if (audioEl.volume === 0) volIcon.textContent = '🔇';
          else if (audioEl.volume < 0.5) volIcon.textContent = '🔉';
          else volIcon.textContent = '🔊';
        }
      });
    }
    if (speedBtn) {
      speedBtn.addEventListener('click', () => {
        speedIdx = (speedIdx + 1) % speeds.length;
        const s = speeds[speedIdx];
        audioEl.playbackRate = s;
        speedBtn.textContent = s + '×';
      });
    }
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

  function applyRepeatButtonState(btn) {
    if (!btn) return;
    btn.classList.remove('repeat-1', 'repeat-2', 'auto-next', 'repeat-inf');
    const oldBadge = btn.querySelector('.repeat-badge');
    if (oldBadge) oldBadge.remove();
    btn.textContent = '🔁';
    if (repeatMode === 0) { btn.title = 'حالت تکرار: خاموش'; }
    else if (repeatMode === 1) { btn.classList.add('repeat-1'); const b = document.createElement('span'); b.className = 'repeat-badge'; b.textContent = '1'; btn.appendChild(b); btn.title = 'تکرار ۱ بار'; }
    else if (repeatMode === 2) { btn.classList.add('repeat-2'); const b = document.createElement('span'); b.className = 'repeat-badge'; b.textContent = '2'; btn.appendChild(b); btn.title = 'تکرار ۲ بار'; }
    else if (repeatMode === 3) { btn.classList.add('auto-next'); const b = document.createElement('span'); b.className = 'repeat-badge'; b.textContent = 'A'; btn.appendChild(b); btn.title = 'خودکار بعدی'; }
    else if (repeatMode === 4) { btn.classList.add('repeat-inf'); const b = document.createElement('span'); b.className = 'repeat-badge'; b.textContent = '∞'; btn.appendChild(b); btn.title = 'تکرار بی‌نهایت'; }
  }

  function goToAdjacentStory(direction, autoAdvance) {
    const stories = getStories();
    const letters = getLetters();
    const dialogues = getDialogues();
    const chats = getChats();
    let list = [];
    if (stories.find(s => s.id === currentStoryId)) list = stories;
    else if (letters.find(l => l.id === currentStoryId)) list = letters;
    else if (dialogues.find(d => d.id === currentStoryId)) list = dialogues;
    else if (chats.find(c => c.id === currentStoryId)) list = chats;
    if (!list.length) return false;
    let idx = list.findIndex(s => s.id === currentStoryId);
    if (idx === -1) return false;
    let nextIdx = idx + direction;
    if (nextIdx >= list.length) {
      if (!autoAdvance) return false;
      nextIdx = 0;
    }
    if (nextIdx < 0) {
      if (!autoAdvance) return false;
      nextIdx = list.length - 1;
    }
    currentStoryId = list[nextIdx].id;
    if (autoAdvance) repeatCounter = 0;
    if (stories.find(s => s.id === currentStoryId)) openStory(currentStoryId);
    else if (letters.find(l => l.id === currentStoryId)) openLetter(currentStoryId);
    else if (dialogues.find(d => d.id === currentStoryId)) openDialogue(currentStoryId);
    else if (chats.find(c => c.id === currentStoryId)) openChat(currentStoryId);
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════
  // LOAD CONTENT FOR EDIT
  // ═══════════════════════════════════════════════════════════════════
  function loadContentForEdit(id, kind) {
    const book = getBook();
    if (!book) return;
    let found = null;
    let foundLesson = null;
    for (const l of book.lessons) {
      if (kind === 'story') {
        const s = (l.stories || []).find(x => x.id === id);
        if (s) { found = s; foundLesson = l; break; }
      } else if (kind === 'letter') {
        const s = (l.letters || []).find(x => x.id === id);
        if (s) { found = s; foundLesson = l; break; }
      } else if (kind === 'dialogue') {
        const s = (l.dialogues || []).find(x => x.id === id);
        if (s) { found = s; foundLesson = l; break; }
      } else if (kind === 'chat') {
        const s = (l.chats || []).find(x => x.id === id);
        if (s) { found = s; foundLesson = l; break; }
      }
    }
    if (!found) { toast('محتوا پیدا نشد', 'error'); return; }
    storyEditId = id;
    storyEditId_kind = kind;
    if (foundLesson && state.activeLessonId !== foundLesson.id) {
      state.activeLessonId = foundLesson.id;
      save();
      renderAll();
    }
    const typeSel = document.getElementById('contentTypeSelect');
    if (kind === 'story') typeSel.value = 'story';
    else if (kind === 'letter') typeSel.value = found.type === 'letter-formal' ? 'letter-formal' : 'letter-informal';
    else if (kind === 'dialogue') typeSel.value = 'dialogue';
    else if (kind === 'chat') typeSel.value = found.type === 'formal' ? 'chat-formal' : 'chat-friendly';
    document.getElementById('storyTitleInput').value = found.title || '';
    document.getElementById('storyAudioInput').value = found.audio || '';
    document.getElementById('storyCoverInput').value = found.coverImage || '';
    document.getElementById('storyColorInput').value = safeCoverColor(found.coverColor);
    if (kind === 'letter') {
      const deLines = (found.de || '').split(/\r?\n/);
      const faLines = (found.fa || '').split(/\r?\n/);
      const lines = [];
      const max = Math.max(deLines.length, faLines.length);
      for (let i = 0; i < max; i++) {
        const de = (deLines[i] || '').trim();
        const fa = (faLines[i] || '').trim();
        if (de || fa) lines.push(de + ' | ' + fa);
      }
      document.getElementById('storySentencesInput').value = lines.join('\n');
    } else if (kind === 'dialogue') {
      document.getElementById('storySentencesInput').value = (found.lines || []).map(l => l.de + ' | ' + l.fa).join('\n');
    } else if (kind === 'chat') {
      document.getElementById('storySentencesInput').value = (found.lines || []).map(l => l.de + ' | ' + l.fa).join('\n');
    } else {
      document.getElementById('storySentencesInput').value = (found.sentences || []).map(x => x.de + ' | ' + x.fa).join('\n');
    }
    switchTab('manage-story');
    setTimeout(() => {
      const tsel = document.getElementById('storyTargetLesson');
      if (tsel) tsel.value = foundLesson.id;
      document.getElementById('cancelStoryEditBtn').style.display = 'inline-block';
      document.getElementById('storyTitleInput').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  function saveStory() {
    const title = document.getElementById('storyTitleInput').value.trim();
    if (!title) { toast('عنوان لازمه', 'error'); return; }
    const targetId = document.getElementById('storyTargetLesson').value;
    const target = getLessonById(targetId);
    if (!target) { toast('درس مقصد رو انتخاب کن', 'error'); return; }
    const contentType = document.getElementById('contentTypeSelect').value;
    const audio = document.getElementById('storyAudioInput').value.trim();
    const cover = document.getElementById('storyCoverInput').value.trim();
    const color = safeCoverColor(document.getElementById('storyColorInput').value);
    const lines = document.getElementById('storySentencesInput').value.split(/\r?\n/);
    let isEdit = false;
    let found = null;
    let foundLesson = null;
    if (storyEditId) {
      const book = getBook();
      if (book) {
        for (const l of book.lessons) {
          if (storyEditId_kind === 'story') {
            const s = (l.stories || []).find(x => x.id === storyEditId);
            if (s) { found = s; foundLesson = l; break; }
          } else if (storyEditId_kind === 'letter') {
            const s = (l.letters || []).find(x => x.id === storyEditId);
            if (s) { found = s; foundLesson = l; break; }
          } else if (storyEditId_kind === 'dialogue') {
            const s = (l.dialogues || []).find(x => x.id === storyEditId);
            if (s) { found = s; foundLesson = l; break; }
          } else if (storyEditId_kind === 'chat') {
            const s = (l.chats || []).find(x => x.id === storyEditId);
            if (s) { found = s; foundLesson = l; break; }
          }
        }
      }
      if (found) isEdit = true;
    }
    if (contentType === 'story') {
      const sentences = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        const sep = line.indexOf('|');
        if (sep < 1) { toast('فرمت: «آلمانی | فارسی»', 'error'); return; }
        const de = line.slice(0, sep).trim();
        const fa = line.slice(sep + 1).trim();
        if (!de) continue;
        sentences.push({ id: uid(), de, fa, audio: '', heart: false, star: false, fire: false });
      }
      if (!sentences.length) { toast('حداقل یک جمله لازمه', 'error'); return; }
      if (isEdit && foundLesson) {
        found.title = title; found.type = 'story';
        found.audio = audio; found.coverImage = cover; found.coverColor = color;
        found.sentences = sentences;
      } else {
        if (!Array.isArray(target.stories)) target.stories = [];
        target.stories.push({ id: uid(), title, type: 'story', audio, coverImage: cover, coverColor: color, sentences });
      }
    } else if (contentType === 'letter-formal' || contentType === 'letter-informal') {
      const deLines = [];
      const faLines = [];
      for (const line of lines) {
        const sep = line.indexOf('|');
        if (sep < 1) { deLines.push(line); faLines.push(''); }
        else { deLines.push(line.slice(0, sep).trim()); faLines.push(line.slice(sep + 1).trim()); }
      }
      if (!deLines.length) { toast('حداقل یک خط لازمه', 'error'); return; }
      if (isEdit && foundLesson) {
        found.title = title; found.type = contentType;
        found.audio = audio; found.coverImage = cover; found.coverColor = color;
        found.de = deLines.join('\n'); found.fa = faLines.join('\n');
      } else {
        if (!Array.isArray(target.letters)) target.letters = [];
        target.letters.push({ id: uid(), title, type: contentType, audio, coverImage: cover, coverColor: color, de: deLines.join('\n'), fa: faLines.join('\n') });
      }
    } else if (contentType === 'dialogue') {
      const dialogueLines = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        const sep = line.indexOf('|');
        if (sep < 1) { toast('فرمت: «آلمانی | فارسی»', 'error'); return; }
        const de = line.slice(0, sep).trim();
        const fa = line.slice(sep + 1).trim();
        if (!de) continue;
        dialogueLines.push({ id: uid(), speaker: '', de, fa, audio: '', heart: false, star: false, fire: false });
      }
      if (!dialogueLines.length) { toast('حداقل یک خط لازمه', 'error'); return; }
      if (isEdit && foundLesson) {
        found.title = title;
        found.audio = audio; found.coverImage = cover; found.coverColor = color;
        found.lines = dialogueLines;
      } else {
        if (!Array.isArray(target.dialogues)) target.dialogues = [];
        target.dialogues.push({ id: uid(), title, type: 'dialogue', audio, coverImage: cover, coverColor: color, lines: dialogueLines });
      }
    } else if (contentType === 'chat-friendly' || contentType === 'chat-formal') {
      const chatLines = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        const sep = line.indexOf('|');
        if (sep < 1) { toast('فرمت: «آلمانی | فارسی»', 'error'); return; }
        const de = line.slice(0, sep).trim();
        const fa = line.slice(sep + 1).trim();
        if (!de) continue;
        chatLines.push({ id: uid(), sender: '', de, fa, audio: '', heart: false, star: false, fire: false });
      }
      if (!chatLines.length) { toast('حداقل یک خط لازمه', 'error'); return; }
      const chatType = contentType === 'chat-formal' ? 'formal' : 'friendly';
      if (isEdit && foundLesson) {
        found.title = title;
        found.type = chatType;
        found.coverImage = cover; found.coverColor = color;
        found.lines = chatLines;
      } else {
        if (!Array.isArray(target.chats)) target.chats = [];
        target.chats.push({ id: uid(), title, type: chatType, coverImage: cover, coverColor: color, lines: chatLines });
      }
    }
    save();
    resetStoryForm();
    renderAll(); populateLessonTargets();
    toast(isEdit ? `✅ ویرایش شد` : `✅ اضافه شد`, 'success');
  }

  function resetStoryForm() {
    storyEditId = null;
    storyEditId_kind = null;
    document.getElementById('storyTitleInput').value = '';
    document.getElementById('storyAudioInput').value = '';
    document.getElementById('storyCoverInput').value = '';
    document.getElementById('storyColorInput').value = '#6366f1';
    document.getElementById('storySentencesInput').value = '';
    document.getElementById('cancelStoryEditBtn').style.display = 'none';
  }

  // ═══════════════════════════════════════════════════════════════════
  // PLACEHOLDER — بخش‌های بعدی
  // ═══════════════════════════════════════════════════════════════════
  // ادامه در بخش ۵ (ویدیو + آدیو + پلی‌لیست + FAB + پنل مدیریت)
    // ═══════════════════════════════════════════════════════════════════
  // VIDEOS
  // ═══════════════════════════════════════════════════════════════════
  function renderVideosHome() {
    const home = document.getElementById('videosHome');
    const collectionView = document.getElementById('videoCollectionView');
    const playerView = document.getElementById('videoPlayerView');
    if (!home) return;
    home.classList.remove('hidden');
    collectionView?.classList.add('hidden');
    playerView?.classList.add('hidden');
    currentVideoView = 'home';

    const videos = getLessonVideos();
    const collections = videos.filter(v => v.isCollection);
    const singles = videos.filter(v => !v.isCollection);
    const colGrid = document.getElementById('videoCollectionsGrid');
    const singleGrid = document.getElementById('singleVideosGrid');

    if (colGrid) {
      if (!collections.length) {
        colGrid.innerHTML = `<div class="empty">هنوز مجموعه ویدیویی نساختی</div>`;
      } else {
        colGrid.innerHTML = collections.map(c => {
          const cover = safeImageSrc(c.coverImage);
          const color = safeCoverColor(c.coverColor);
          return `<div class="media-collection-card" data-video-collection="${esc(c.id)}" style="--cover-color:${color};">
            <div class="media-collection-cover">
              ${cover ? `<img src="${esc(cover)}" alt="">` : `<div class="media-cover-placeholder">🎬</div>`}
              <div class="media-collection-badge">📹 ${c.episodes.length} قسمت</div>
            </div>
            <div class="media-collection-body">
              <h4>${esc(c.title)}</h4>
              ${c.description ? `<p>${esc(c.description)}</p>` : ''}
            </div>
          </div>`;
        }).join('');
        colGrid.querySelectorAll('[data-video-collection]').forEach(card => {
          card.addEventListener('click', () => openVideoCollection(card.dataset.videoCollection));
        });
      }
    }

    if (singleGrid) {
      if (!singles.length) {
        singleGrid.innerHTML = `<div class="empty muted" style="font-size:12px;">ویدیو تکی نداری</div>`;
      } else {
        singleGrid.innerHTML = `<div class="media-singles-row">` + singles.map(v => {
          const poster = safeImageSrc(v.poster);
          const marked = v.fire ? 'is-fire' : v.star ? 'is-star' : v.heart ? 'is-heart' : '';
          return `<div class="media-single-card ${marked}" data-video-single="${esc(v.id)}">
            <div class="media-single-poster">${poster ? `<img src="${esc(poster)}" alt="">` : '<div class="media-cover-placeholder">🎬</div>'}</div>
            <div class="media-single-body">
              <div class="media-single-title">${esc(v.title)}</div>
              ${v.duration ? `<div class="media-single-duration">⏱ ${esc(v.duration)}</div>` : ''}
            </div>
          </div>`;
        }).join('') + `</div>`;
        singleGrid.querySelectorAll('[data-video-single]').forEach(card => {
          card.addEventListener('click', () => playVideoEpisode(card.dataset.videoSingle, null));
        });
      }
    }
  }

  function openVideoCollection(collectionId) {
    const videos = getLessonVideos();
    const col = videos.find(v => v.isCollection && v.id === collectionId);
    if (!col) return;
    const home = document.getElementById('videosHome');
    const collectionView = document.getElementById('videoCollectionView');
    const playerView = document.getElementById('videoPlayerView');
    home?.classList.add('hidden');
    playerView?.classList.add('hidden');
    if (!collectionView) return;
    collectionView.classList.remove('hidden');
    currentVideoView = 'collection';
    currentVideoCollectionId = collectionId;

    const cover = safeImageSrc(col.coverImage);
    const color = safeCoverColor(col.coverColor);
    collectionView.innerHTML = `
    <div class="panel">
      <button class="btn btn-sm" id="videoBackToHome">← برگشت</button>
      <div class="media-collection-header" style="margin-top:12px;">
        <div class="media-collection-header-cover" style="--cover-color:${color};">
          ${cover ? `<img src="${esc(cover)}" alt="">` : `<div class="media-cover-placeholder">🎬</div>`}
        </div>
        <div class="media-collection-header-info">
          <h3>${esc(col.title)}</h3>
          ${col.description ? `<p class="muted">${esc(col.description)}</p>` : ''}
          <div class="media-collection-meta">📹 ${col.episodes.length} قسمت</div>
        </div>
      </div>
      <div class="media-episodes-list" style="margin-top:16px;">
        ${col.episodes.length === 0 ? '<div class="empty">قسمتی ندارد</div>' : col.episodes.map((ep, idx) => {
          const marked = ep.fire ? 'is-fire' : ep.star ? 'is-star' : ep.heart ? 'is-heart' : '';
          return `<div class="media-episode-row ${marked}" data-video-episode="${esc(ep.id)}">
            <div class="media-episode-num">${idx + 1}</div>
            <div class="media-episode-info">
              <div class="media-episode-title">${esc(ep.title)}</div>
              ${ep.description ? `<div class="media-episode-desc">${esc(ep.description)}</div>` : ''}
              <div class="media-episode-meta">
                ${ep.duration ? `<span>⏱ ${esc(ep.duration)}</span>` : ''}
                ${ep.dialogues && ep.dialogues.length ? `<span>💬 ${ep.dialogues.length} دیالوگ</span>` : ''}
              </div>
            </div>
            <button class="btn btn-sm btn-primary">▶ پخش</button>
          </div>`;
        }).join('')}
      </div>
    </div>`;
    document.getElementById('videoBackToHome').addEventListener('click', renderVideosHome);
    collectionView.querySelectorAll('[data-video-episode]').forEach(row => {
      row.addEventListener('click', () => playVideoEpisode(row.dataset.videoEpisode, collectionId));
    });
  }

  function playVideoEpisode(episodeId, collectionId) {
    let episode = null;
    if (collectionId) {
      const col = getLessonVideos().find(v => v.isCollection && v.id === collectionId);
      if (col) episode = col.episodes.find(e => e.id === episodeId);
    } else {
      episode = getLessonVideos().find(v => !v.isCollection && v.id === episodeId);
    }
    if (!episode) { toast('ویدیو پیدا نشد', 'error'); return; }

    const home = document.getElementById('videosHome');
    const collectionView = document.getElementById('videoCollectionView');
    const playerView = document.getElementById('videoPlayerView');
    home?.classList.add('hidden');
    collectionView?.classList.add('hidden');
    if (!playerView) return;
    playerView.classList.remove('hidden');
    currentVideoView = 'player';
    currentVideoEpisodeId = episodeId;

    let embedUrl = '';
    let isEmbed = false;
    let directUrl = episode.url || '';
    const url = directUrl.toLowerCase();
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const m = directUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/);
      if (m) { embedUrl = 'https://www.youtube.com/embed/' + m[1]; isEmbed = true; }
    } else if (url.includes('aparat.com')) {
      const m = directUrl.match(/aparat\.com\/v\/([^&?/]+)/);
      if (m) { embedUrl = 'https://www.aparat.com/video/video/embed/videohash/' + m[1] + '/vt/frame'; isEmbed = true; }
    } else if (url.includes('vimeo.com')) {
      const m = directUrl.match(/vimeo\.com\/(\d+)/);
      if (m) { embedUrl = 'https://player.vimeo.com/video/' + m[1]; isEmbed = true; }
    }

    playerView.innerHTML = `
    <div class="panel">
      <button class="btn btn-sm" id="videoPlayerBack">← برگشت</button>
      <div class="video-player-wrap" style="margin-top:12px;">
        ${isEmbed
          ? `<iframe src="${esc(embedUrl)}" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>`
          : `<video id="mainVideoEl" src="${esc(directUrl)}" controls preload="metadata" playsinline></video>`
        }
      </div>
      <div class="media-player-info" style="margin-top:14px;">
        <h3>${esc(episode.title)}</h3>
        ${episode.description ? `<p class="muted">${esc(episode.description)}</p>` : ''}
        <div class="row tight" style="margin-top:8px;flex-wrap:wrap;">
          <button class="btn btn-sm ${episode.heart ? 'btn-heart' : ''}" id="epHeart">${episode.heart ? '❤️' : '🤍'} موردعلاقه</button>
          <button class="btn btn-sm ${episode.star ? 'btn-star' : ''}" id="epStar">${episode.star ? '⭐' : '☆'} مهم</button>
          <button class="btn btn-sm ${episode.fire ? 'btn-fire' : ''}" id="epFire">🔥 خیلی مهم</button>
          <button class="btn btn-sm" id="epAddToPlaylist" style="background:var(--purple);color:#fff;">➕ پلی‌لیست</button>
          ${!isEmbed ? `<a class="btn btn-sm" href="${esc(directUrl)}" download style="background:var(--accent);color:#fff;">⬇ دانلود</a>` : ''}
        </div>
      </div>
      ${episode.dialogues && episode.dialogues.length ? `
      <div class="media-dialogues-section" style="margin-top:16px;">
        <h4>📝 دیالوگ‌ها (${episode.dialogues.length})</h4>
        <div class="media-dialogues-list">
          ${episode.dialogues.map(d => `
            <div class="media-dialogue-row" data-dialogue-time="${d.time || 0}">
              <div class="media-dialogue-time">${fmtTimestamp(d.time)}</div>
              <div class="media-dialogue-content">
                <div class="media-dialogue-de">${highlightClickableWords(d.de)}</div>
                ${d.fa ? `<div class="media-dialogue-fa">${esc(d.fa)}</div>` : ''}
              </div>
              <div class="media-dialogue-actions">
                ${germanSpeakBtn(d.de, { size: 'sm', title: 'پخش' })}
                <button class="sentence-action-btn" data-dialogue-jump="${d.time || 0}" title="پرش به این زمان">⏱</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>` : ''}
    </div>`;

    document.getElementById('videoPlayerBack').addEventListener('click', () => {
      if (collectionId) openVideoCollection(collectionId);
      else renderVideosHome();
    });
    document.getElementById('epHeart').addEventListener('click', () => {
      toggleMediaMark(episode, episode.heart ? null : 'heart');
      playVideoEpisode(episodeId, collectionId);
    });
    document.getElementById('epStar').addEventListener('click', () => {
      toggleMediaMark(episode, episode.star ? null : 'star');
      playVideoEpisode(episodeId, collectionId);
    });
    document.getElementById('epFire').addEventListener('click', () => {
      toggleMediaMark(episode, episode.fire ? null : 'fire');
      playVideoEpisode(episodeId, collectionId);
    });
    document.getElementById('epAddToPlaylist').addEventListener('click', () => {
      openAddToPlaylistModal({
        mediaType: 'video',
        title: episode.title,
        videoUrl: episode.url,
        coverImage: episode.poster || '',
        duration: episode.duration || '',
        collectionId: collectionId || null,
        episodeId: episodeId
      });
    });

    const videoEl = document.getElementById('mainVideoEl');
    playerView.querySelectorAll('[data-dialogue-jump]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (videoEl) {
          videoEl.currentTime = parseFloat(btn.dataset.dialogueJump) || 0;
          videoEl.play().catch(() => { });
        }
      });
    });

    wireClickableWords(playerView);
    wireGermanSpeakButtons(playerView);
  }

  // ═══════════════════════════════════════════════════════════════════
  // AUDIOS
  // ═══════════════════════════════════════════════════════════════════
  function getAllFireAudios() {
    const lesson = getLesson();
    if (!lesson) return [];
    const result = [];
    (lesson.audioCollections || []).forEach(col => {
      (col.episodes || []).forEach(ep => {
        if (ep.fire) result.push({ ...ep, _collectionId: col.id, _collectionTitle: col.title });
      });
    });
    return result;
  }

  function renderAudiosHome() {
    const home = document.getElementById('audiosHome');
    const collectionView = document.getElementById('audioCollectionView');
    const playerView = document.getElementById('audioPlayerView');
    if (!home) return;
    home.classList.remove('hidden');
    collectionView?.classList.add('hidden');
    playerView?.classList.add('hidden');
    currentAudioView = 'home';

    // اسلایدر 🔥
    const fireAudios = getAllFireAudios();
    const sliderSection = document.getElementById('fireAudiosSliderSection');
    if (sliderSection) {
      if (!fireAudios.length) {
        sliderSection.classList.add('hidden');
      } else {
        sliderSection.classList.remove('hidden');
        const slider = document.getElementById('fireAudiosSlider');
        const dots = document.getElementById('fireAudiosDots');
        if (slider) {
          slider.innerHTML = fireAudios.map((a, i) => {
            const cover = safeImageSrc(a.coverImage);
            const color = safeCoverColor(a.coverColor);
            return `<div class="fire-slider-card is-fire" data-fire-audio-id="${esc(a.id)}" data-collection-id="${esc(a._collectionId)}" style="--cover-color:${color};">
              <div class="fire-slider-card-cover">
                ${cover ? `<img src="${esc(cover)}" alt="">` : `<div class="media-cover-placeholder">🔥</div>`}
              </div>
              <div class="fire-slider-card-body">
                <div class="fire-slider-card-title">${esc(a.title)}</div>
                <div class="fire-slider-card-sub">${esc(a._collectionTitle)}</div>
                ${a.duration ? `<div class="fire-slider-card-dur">⏱ ${esc(a.duration)}</div>` : ''}
              </div>
              <div class="fire-slider-card-play">▶</div>
            </div>`;
          }).join('');
          slider.querySelectorAll('[data-fire-audio-id]').forEach(card => {
            card.addEventListener('click', () => {
              playAudioEpisode(card.dataset.fireAudioId, card.dataset.collectionId);
            });
          });
          // dots
          if (dots) {
            dots.innerHTML = fireAudios.map((_, i) => `<span class="fire-slider-dot ${i === 0 ? 'active' : ''}" data-dot-idx="${i}"></span>`).join('');
            dots.querySelectorAll('[data-dot-idx]').forEach(dot => {
              dot.addEventListener('click', () => {
                const idx = parseInt(dot.dataset.dotIdx, 10);
                if (slider.children[idx]) {
                  slider.children[idx].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }
              });
            });
          }
        }
      }
    }

    const cols = getLessonAudioCollections();
    const colGrid = document.getElementById('audioCollectionsGrid');
    const singleGrid = document.getElementById('singleAudiosGrid');
    if (colGrid) {
      if (!cols.length) {
        colGrid.innerHTML = `<div class="empty">هنوز مجموعه آدیویی نساختی</div>`;
      } else {
        colGrid.innerHTML = cols.map(c => {
          const cover = safeImageSrc(c.coverImage);
          const color = safeCoverColor(c.coverColor);
          return `<div class="media-collection-card" data-audio-collection="${esc(c.id)}" style="--cover-color:${color};">
            <div class="media-collection-cover">
              ${cover ? `<img src="${esc(cover)}" alt="">` : `<div class="media-cover-placeholder">🎙</div>`}
              <div class="media-collection-badge">🎙 ${c.episodes.length} آدیو</div>
            </div>
            <div class="media-collection-body">
              <h4>${esc(c.title)}</h4>
              ${c.description ? `<p>${esc(c.description)}</p>` : ''}
            </div>
          </div>`;
        }).join('');
        colGrid.querySelectorAll('[data-audio-collection]').forEach(card => {
          card.addEventListener('click', () => openAudioCollection(card.dataset.audioCollection));
        });
      }
    }
    if (singleGrid) {
      singleGrid.innerHTML = '';
    }
  }

  function openAudioCollection(collectionId) {
    const cols = getLessonAudioCollections();
    const col = cols.find(c => c.id === collectionId);
    if (!col) return;
    const home = document.getElementById('audiosHome');
    const collectionView = document.getElementById('audioCollectionView');
    const playerView = document.getElementById('audioPlayerView');
    home?.classList.add('hidden');
    playerView?.classList.add('hidden');
    if (!collectionView) return;
    collectionView.classList.remove('hidden');
    currentAudioView = 'collection';
    currentAudioCollectionId = collectionId;

    const cover = safeImageSrc(col.coverImage);
    const color = safeCoverColor(col.coverColor);
    collectionView.innerHTML = `
    <div class="panel">
      <button class="btn btn-sm" id="audioBackToHome">← برگشت</button>
      <div class="media-collection-header" style="margin-top:12px;">
        <div class="media-collection-header-cover" style="--cover-color:${color};">
          ${cover ? `<img src="${esc(cover)}" alt="">` : `<div class="media-cover-placeholder">🎙</div>`}
        </div>
        <div class="media-collection-header-info">
          <h3>${esc(col.title)}</h3>
          ${col.description ? `<p class="muted">${esc(col.description)}</p>` : ''}
          <div class="media-collection-meta">🎙 ${col.episodes.length} آدیو</div>
        </div>
      </div>
      <div class="media-episodes-list" style="margin-top:16px;">
        ${col.episodes.length === 0 ? '<div class="empty">آدیویی ندارد</div>' : col.episodes.map((ep, idx) => {
          const marked = ep.fire ? 'is-fire' : ep.star ? 'is-star' : ep.heart ? 'is-heart' : '';
          return `<div class="media-episode-row ${marked}" data-audio-episode="${esc(ep.id)}">
            <div class="media-episode-num">${idx + 1}</div>
            <div class="media-episode-info">
              <div class="media-episode-title">${esc(ep.title)}</div>
              ${ep.description ? `<div class="media-episode-desc">${esc(ep.description)}</div>` : ''}
              <div class="media-episode-meta">
                ${ep.duration ? `<span>⏱ ${esc(ep.duration)}</span>` : ''}
                ${ep.dialogues && ep.dialogues.length ? `<span>💬 ${ep.dialogues.length} دیالوگ</span>` : ''}
              </div>
            </div>
            <button class="btn btn-sm btn-primary">▶ پخش</button>
          </div>`;
        }).join('')}
      </div>
    </div>`;
    document.getElementById('audioBackToHome').addEventListener('click', renderAudiosHome);
    collectionView.querySelectorAll('[data-audio-episode]').forEach(row => {
      row.addEventListener('click', () => playAudioEpisode(row.dataset.audioEpisode, collectionId));
    });
  }

  function playAudioEpisode(episodeId, collectionId) {
    const cols = getLessonAudioCollections();
    let col = cols.find(c => c.id === collectionId);
    if (!col) return;
    const ep = col.episodes.find(e => e.id === episodeId);
    if (!ep) return;

    // استفاده از پلیر شناور
    const queue = col.episodes.map(e => ({
      id: e.id,
      title: e.title,
      subtitle: col.title,
      audioUrl: e.audioUrl,
      coverImage: e.coverImage || col.coverImage,
      coverColor: e.coverColor || col.coverColor,
      duration: e.duration
    }));
    const startIdx = queue.findIndex(x => x.id === episodeId);
    openStickyPlayer(queue, startIdx, 'audioCollection');

    // اگه view player می‌خوای نشون بدی، می‌تونی اینجا به playerView بری
    // برای سادگی، همین‌جا پلیر شناور رو باز می‌کنیم
    toast(`▶ پخش: ${ep.title}`, 'success');
  }

  // ═══════════════════════════════════════════════════════════════════
  // STICKY PLAYER
  // ═══════════════════════════════════════════════════════════════════
  function openStickyPlayer(queue, startIndex, source) {
    if (!queue || !queue.length) return;
    stickyPlayerState.active = true;
    stickyPlayerState.queue = queue;
    stickyPlayerState.index = startIndex >= 0 ? startIndex : 0;
    stickyPlayerState.source = source || 'audio';
    const sp = document.getElementById('stickyPlayer');
    if (sp) sp.classList.remove('hidden');
    playStickyItem();
  }

  function playStickyItem() {
    if (!stickyPlayerState.active) return;
    const item = stickyPlayerState.queue[stickyPlayerState.index];
    if (!item) { closeStickyPlayer(); return; }
    stickyPlayerState.currentItem = item;

    const audioEl = document.getElementById('stickyAudioEl');
    if (!audioEl) return;
    const url = toDirectAudioUrl(item.audioUrl);
    if (url) {
      audioEl.src = url;
      audioEl.play().catch(() => { toast('خطا در پخش', 'error'); });
    } else {
      toast('آدرس صوتی معتبر نیست', 'error');
    }

    const titleEl = document.getElementById('stickyPlayerTitle');
    const subEl = document.getElementById('stickyPlayerSubtitle');
    const coverEl = document.getElementById('stickyPlayerCover');
    const coverFallback = document.getElementById('stickyPlayerCoverFallback');

    if (titleEl) titleEl.textContent = item.title || '—';
    if (subEl) subEl.textContent = item.subtitle || '';
    if (coverEl) {
      const cover = safeImageSrc(item.coverImage);
      if (cover) {
        coverEl.style.backgroundImage = `url('${cover}')`;
        if (coverFallback) coverFallback.style.display = 'none';
      } else {
        coverEl.style.backgroundImage = '';
        coverEl.style.background = safeCoverColor(item.coverColor);
        if (coverFallback) coverFallback.style.display = 'flex';
      }
    }

    const prevBtn = document.getElementById('stickyPrevBtn');
    const nextBtn = document.getElementById('stickyNextBtn');
    if (prevBtn) prevBtn.disabled = stickyPlayerState.index === 0;
    if (nextBtn) nextBtn.disabled = stickyPlayerState.index >= stickyPlayerState.queue.length - 1;

    const downloadBtn = document.getElementById('stickyDownloadBtn');
    if (downloadBtn) {
      if (item.audioUrl) {
        downloadBtn.onclick = () => {
          const a = document.createElement('a');
          a.href = url;
          a.download = (item.title || 'audio') + '.mp3';
          a.click();
        };
      } else {
        downloadBtn.style.display = 'none';
      }
    }
  }

  function closeStickyPlayer() {
    stickyPlayerState.active = false;
    stickyPlayerState.isPlaying = false;
    const audioEl = document.getElementById('stickyAudioEl');
    if (audioEl) { audioEl.pause(); audioEl.src = ''; }
    const sp = document.getElementById('stickyPlayer');
    if (sp) sp.classList.add('hidden');
  }

  function setupStickyPlayerEvents() {
    const audioEl = document.getElementById('stickyAudioEl');
    const playBtn = document.getElementById('stickyPlayBtn');
    const prevBtn = document.getElementById('stickyPrevBtn');
    const nextBtn = document.getElementById('stickyNextBtn');
    const closeBtn = document.getElementById('stickyCloseBtn');
    const progress = document.getElementById('stickyProgress');
    const currentEl = document.getElementById('stickyCurrent');
    const durationEl = document.getElementById('stickyDuration');
    if (!audioEl || !playBtn) return;

    playBtn.addEventListener('click', () => {
      if (audioEl.paused) audioEl.play().catch(() => { });
      else audioEl.pause();
    });
    audioEl.addEventListener('play', () => {
      playBtn.textContent = '❚❚';
      stickyPlayerState.isPlaying = true;
    });
    audioEl.addEventListener('pause', () => {
      playBtn.textContent = '▶';
      stickyPlayerState.isPlaying = false;
    });
    audioEl.addEventListener('ended', () => {
      // آهنگ بعدی
      if (stickyPlayerState.index < stickyPlayerState.queue.length - 1) {
        stickyPlayerState.index++;
        playStickyItem();
      } else {
        playBtn.textContent = '▶';
        stickyPlayerState.isPlaying = false;
      }
    });
    audioEl.addEventListener('loadedmetadata', () => {
      if (durationEl) durationEl.textContent = fmtTime(audioEl.duration);
      if (progress) progress.max = audioEl.duration || 0;
    });
    audioEl.addEventListener('timeupdate', () => {
      if (progress) progress.value = audioEl.currentTime || 0;
      if (currentEl) currentEl.textContent = fmtTime(audioEl.currentTime);
    });
    if (progress) {
      progress.addEventListener('input', () => {
        audioEl.currentTime = parseFloat(progress.value) || 0;
      });
    }
    if (prevBtn) prevBtn.addEventListener('click', () => {
      if (stickyPlayerState.index > 0) {
        stickyPlayerState.index--;
        playStickyItem();
      }
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
      if (stickyPlayerState.index < stickyPlayerState.queue.length - 1) {
        stickyPlayerState.index++;
        playStickyItem();
      }
    });
    if (closeBtn) closeBtn.addEventListener('click', closeStickyPlayer);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PLAYLISTS
  // ═══════════════════════════════════════════════════════════════════
  function renderPlaylistsHome() {
    const home = document.getElementById('playlistsHome');
    const detail = document.getElementById('playlistDetailView');
    if (!home) return;
    home.classList.remove('hidden');
    detail?.classList.add('hidden');
    const grid = document.getElementById('playlistsGrid');
    if (!grid) return;
    const playlists = getPlaylists();
    if (!playlists.length) {
      grid.innerHTML = `<div class="empty">هنوز پلی‌لیستی نساختی</div>`;
      return;
    }
    grid.innerHTML = playlists.map(p => {
      const cover = safeImageSrc(p.coverImage);
      const color = safeCoverColor(p.coverColor);
      return `<div class="playlist-card" data-playlist-id="${esc(p.id)}" style="--cover-color:${color};">
        <div class="playlist-cover">
          ${cover ? `<img src="${esc(cover)}" alt="">` : `<div class="media-cover-placeholder">🎵</div>`}
        </div>
        <div class="playlist-body">
          <h4>${esc(p.name)}</h4>
          <div class="playlist-meta">${p.items.length} آیتم</div>
        </div>
        <button class="playlist-play-btn">▶</button>
      </div>`;
    }).join('');
    grid.querySelectorAll('[data-playlist-id]').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.playlist-play-btn')) {
          e.stopPropagation();
          const p = getPlaylist(card.dataset.playlistId);
          if (p && p.items.length) {
            const queue = p.items.map(it => ({
              id: it.id, title: it.title, subtitle: p.name,
              audioUrl: it.audioUrl, videoUrl: it.videoUrl,
              coverImage: it.coverImage, duration: it.duration
            }));
            openStickyPlayer(queue, 0, 'playlist');
          }
        } else {
          openPlaylistDetail(card.dataset.playlistId);
        }
      });
    });
  }

  function openPlaylistDetail(playlistId) {
    const p = getPlaylist(playlistId);
    if (!p) return;
    const home = document.getElementById('playlistsHome');
    const detail = document.getElementById('playlistDetailView');
    home?.classList.add('hidden');
    if (!detail) return;
    detail.classList.remove('hidden');
    currentPlaylistId = playlistId;
    detail.innerHTML = `
    <div class="panel">
      <button class="btn btn-sm" id="playlistBackBtn">← برگشت</button>
      <div class="row" style="margin-top:12px;flex-wrap:wrap;gap:8px;">
        <button class="btn btn-primary" id="playlistPlayAllBtn">▶ پخش همه</button>
        <button class="btn" id="playlistEditBtn">✏️ ویرایش نام</button>
        <button class="btn btn-danger" id="playlistDeleteBtn">🗑 حذف</button>
      </div>
      <h3 style="margin-top:16px;">${esc(p.name)} (${p.items.length})</h3>
      <div class="playlist-items-list">
        ${p.items.length === 0 ? '<div class="empty">آیتمی ندارد</div>' : p.items.map((it, idx) => `
          <div class="playlist-item-row">
            <div class="playlist-item-num">${idx + 1}</div>
            <div class="playlist-item-info">
              <div class="playlist-item-title">${esc(it.title)}</div>
              ${it.duration ? `<div class="playlist-item-meta">⏱ ${esc(it.duration)}</div>` : ''}
            </div>
            <button class="btn btn-sm" data-play-item="${esc(it.id)}">▶</button>
            <button class="btn btn-sm btn-danger" data-remove-item="${esc(it.id)}">🗑</button>
          </div>
        `).join('')}
      </div>
    </div>`;
    document.getElementById('playlistBackBtn').addEventListener('click', renderPlaylistsHome);
    document.getElementById('playlistPlayAllBtn').addEventListener('click', () => {
      if (!p.items.length) { toast('پلی‌لیست خالیه', 'warning'); return; }
      const queue = p.items.map(it => ({
        id: it.id, title: it.title, subtitle: p.name,
        audioUrl: it.audioUrl, coverImage: it.coverImage, duration: it.duration
      }));
      openStickyPlayer(queue, 0, 'playlist');
    });
    document.getElementById('playlistEditBtn').addEventListener('click', () => openPlaylistModal(playlistId));
    document.getElementById('playlistDeleteBtn').addEventListener('click', () => {
      if (!confirm('حذف پلی‌لیست؟')) return;
      state.playlists = state.playlists.filter(x => x.id !== playlistId);
      save(); renderPlaylistsHome();
      toast('حذف شد', 'success');
    });
    detail.querySelectorAll('[data-play-item]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = p.items.findIndex(x => x.id === btn.dataset.playItem);
        if (idx === -1) return;
        const queue = p.items.map(it => ({
          id: it.id, title: it.title, subtitle: p.name,
          audioUrl: it.audioUrl, coverImage: it.coverImage, duration: it.duration
        }));
        openStickyPlayer(queue, idx, 'playlist');
      });
    });
    detail.querySelectorAll('[data-remove-item]').forEach(btn => {
      btn.addEventListener('click', () => {
        p.items = p.items.filter(x => x.id !== btn.dataset.removeItem);
        save();
        openPlaylistDetail(playlistId);
        toast('حذف شد', 'success');
      });
    });
  }

  function openAddToPlaylistModal(item) {
    const modal = document.getElementById('modalAddToPlaylist');
    const nameEl = document.getElementById('addToPlaylistItemName');
    const box = document.getElementById('playlistCheckboxesBox');
    if (!modal || !box) return;
    if (nameEl) nameEl.textContent = item.title || '—';
    const playlists = getPlaylists();
    if (!playlists.length) {
      box.innerHTML = `<div class="empty" style="font-size:12px;">هنوز پلی‌لیستی نساختی — یکی بساز</div>`;
    } else {
      box.innerHTML = playlists.map(p => `<label class="playlist-checkbox-row">
        <input type="checkbox" value="${esc(p.id)}" class="playlist-check">
        <span>${esc(p.name)} (${p.items.length})</span>
      </label>`).join('');
    }
    modal.dataset.pendingItem = JSON.stringify(item);
    modal.classList.add('active');
    document.body.classList.add('locked');
  }

  // ═══════════════════════════════════════════════════════════════════
  // FAB (دکمه شناور)
  // ═══════════════════════════════════════════════════════════════════
  function setupFAB() {
    const fabBtn = document.getElementById('fabBtn');
    const fabPanel = document.getElementById('fabPanel');
    const fabCloseBtn = document.getElementById('fabClosePanelBtn');
    const fabEditBtn = document.getElementById('fabEditMenuBtn');
    const fabDoneBtn = document.getElementById('fabDoneEditBtn');
    const fabSel = document.getElementById('fabLessonSelect');
    if (!fabBtn) return;

    // موقعیت اولیه
    if (fabPosition.x !== null && fabPosition.y !== null) {
      const c = document.getElementById('fabContainer');
      if (c) {
        c.style.bottom = 'auto';
        c.style.right = 'auto';
        c.style.left = fabPosition.x + 'px';
        c.style.top = fabPosition.y + 'px';
      }
    }

    // drag
    setupFABDrag();

    fabBtn.addEventListener('click', () => {
      if (fabEditMode) return;
      toggleFABPanel();
    });

    fabCloseBtn?.addEventListener('click', () => closeFABPanel());

    fabEditBtn?.addEventListener('click', () => {
      fabEditMode = true;
      renderFABEditMode();
    });

    fabDoneBtn?.addEventListener('click', () => {
      fabEditMode = false;
      renderFABMenuItems();
      document.getElementById('fabEditMode')?.classList.add('hidden');
      document.querySelector('.fab-menu-section')?.classList.remove('hidden');
      document.querySelector('.fab-actions')?.classList.remove('hidden');
    });

    fabSel?.addEventListener('change', e => {
      if (practice.active) exitPractice();
      state.activeLessonId = e.target.value;
      currentContentType = 'all';
      save();
      renderAll();
      toast('📖 درس تغییر کرد', 'success');
    });

    // آیتم‌های منو
    renderFABMenuItems();
    // بستن با کلیک بیرون
    document.addEventListener('click', e => {
      const container = document.getElementById('fabContainer');
      if (fabOpen && container && !container.contains(e.target)) closeFABPanel();
    });
  }

  function toggleFABPanel() {
    if (fabOpen) closeFABPanel();
    else openFABPanel();
  }
  function openFABPanel() {
    fabOpen = true;
    const panel = document.getElementById('fabPanel');
    if (panel) panel.classList.remove('hidden');
    const icon = document.getElementById('fabIcon');
    if (icon) icon.textContent = '✕';
    renderFABMenuItems();
  }
  function closeFABPanel() {
    fabOpen = false;
    fabEditMode = false;
    const panel = document.getElementById('fabPanel');
    if (panel) panel.classList.add('hidden');
    const icon = document.getElementById('fabIcon');
    if (icon) icon.textContent = '🎯';
    document.getElementById('fabEditMode')?.classList.add('hidden');
    document.querySelector('.fab-menu-section')?.classList.remove('hidden');
    document.querySelector('.fab-actions')?.classList.remove('hidden');
  }

  const FAB_DEFAULT_ITEMS = [
    { key: 'list', icon: '📋', label: 'لغات' },
    { key: 'cards', icon: '📇', label: 'کارت‌ها' },
    { key: 'practice', icon: '🃏', label: 'تمرین' },
    { key: 'quiz', icon: '✅', label: 'آزمون' },
    { key: 'grammar', icon: '📘', label: 'گرامر' },
    { key: 'verbs', icon: '⚡', label: 'افعال' },
    { key: 'stories', icon: '📖', label: 'داستان‌ها' },
    { key: 'favorites', icon: '❤️', label: 'علاقه‌مندی' },
    { key: 'videos', icon: '🎬', label: 'ویدیوها' },
    { key: 'audios', icon: '🎙', label: 'آدیوها' },
    { key: 'playlists', icon: '🎵', label: 'پلی‌لیست' }
  ];

  function getFABOrder() {
    if (!fabOrder || !Array.isArray(fabOrder) || !fabOrder.length) return FAB_DEFAULT_ITEMS.slice();
    // merge with any missing
    const result = [];
    fabOrder.forEach(k => {
      const item = FAB_DEFAULT_ITEMS.find(x => x.key === k);
      if (item) result.push(item);
    });
    FAB_DEFAULT_ITEMS.forEach(item => {
      if (!result.find(x => x.key === item.key)) result.push(item);
    });
    return result;
  }

  function renderFABMenuItems() {
    const cont = document.getElementById('fabMenuItems');
    if (!cont) return;
    const items = getFABOrder();
    cont.innerHTML = items.map(item => `
      <button class="fab-menu-item" data-fab-item="${item.key}" title="${item.label}">
        <span class="fab-menu-item-icon">${item.icon}</span>
        <span class="fab-menu-item-label">${item.label}</span>
      </button>
    `).join('');
    cont.querySelectorAll('[data-fab-item]').forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.fabItem);
        closeFABPanel();
      });
    });
  }

  function renderFABEditMode() {
    const cont = document.getElementById('fabEditList');
    const editBox = document.getElementById('fabEditMode');
    if (!cont) return;
    editBox?.classList.remove('hidden');
    document.querySelector('.fab-menu-section')?.classList.add('hidden');
    document.querySelector('.fab-actions')?.classList.add('hidden');
    const items = getFABOrder();
    cont.innerHTML = items.map(item => `
      <li class="fab-edit-item" draggable="true" data-fab-order-key="${item.key}">
        <span class="fab-edit-drag">⠿</span>
        <span class="fab-edit-icon">${item.icon}</span>
        <span class="fab-edit-label">${item.label}</span>
      </li>
    `).join('');
    let draggedKey = null;
    cont.querySelectorAll('.fab-edit-item').forEach(li => {
      li.addEventListener('dragstart', e => {
        draggedKey = li.dataset.fabOrderKey;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        cont.querySelectorAll('.fab-edit-item').forEach(x => x.classList.remove('drag-over'));
      });
      li.addEventListener('dragover', e => {
        e.preventDefault();
        if (li.dataset.fabOrderKey !== draggedKey) li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
      li.addEventListener('drop', e => {
        e.preventDefault();
        li.classList.remove('drag-over');
        if (!draggedKey || draggedKey === li.dataset.fabOrderKey) return;
        const current = getFABOrder().map(x => x.key);
        const fromIdx = current.indexOf(draggedKey);
        const toIdx = current.indexOf(li.dataset.fabOrderKey);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = current.splice(fromIdx, 1);
        current.splice(toIdx, 0, moved);
        fabOrder = current;
        saveFABOrder();
        renderFABEditMode();
      });
      // touch drag
      li.addEventListener('touchstart', e => {
        if (!e.target.closest('.fab-edit-drag')) return;
        draggedKey = li.dataset.fabOrderKey;
        li.classList.add('dragging');
      }, { passive: true });
      li.addEventListener('touchend', () => {
        if (!draggedKey) return;
        li.classList.remove('dragging');
        const keys = Array.from(cont.children).map(x => x.dataset.fabOrderKey);
        fabOrder = keys;
        saveFABOrder();
        draggedKey = null;
        renderFABEditMode();
      });
    });
  }

  function saveFABOrder() {
    try { localStorage.setItem(FAB_ORDER_KEY, JSON.stringify(fabOrder)); } catch (e) { }
  }

  function setupFABDrag() {
    const fab = document.getElementById('fabBtn');
    const container = document.getElementById('fabContainer');
    if (!fab || !container) return;
    let isDragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    function getCurrentPos() {
      const rect = container.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    }

    function onStart(e) {
      if (fabEditMode) return;
      const touch = e.touches ? e.touches[0] : e;
      const rect = container.getBoundingClientRect();
      startX = touch.clientX;
      startY = touch.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      isDragging = true;
      container.style.transition = 'none';
      container.style.bottom = 'auto';
      container.style.right = 'auto';
      container.style.left = startLeft + 'px';
      container.style.top = startTop + 'px';
    }
    function onMove(e) {
      if (!isDragging) return;
      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const newLeft = Math.max(0, Math.min(window.innerWidth - container.offsetWidth, startLeft + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - container.offsetHeight, startTop + dy));
      container.style.left = newLeft + 'px';
      container.style.top = newTop + 'px';
    }
    function onEnd() {
      if (!isDragging) return;
      isDragging = false;
      container.style.transition = '';
      const rect = container.getBoundingClientRect();
      // snap به لبه نزدیک
      const snapLeft = (rect.left + rect.width / 2) < window.innerWidth / 2
        ? 16
        : window.innerWidth - rect.width - 16;
      container.style.left = snapLeft + 'px';
      fabPosition = { x: snapLeft, y: rect.top };
      try { localStorage.setItem(FAB_POS_KEY, JSON.stringify(fabPosition)); } catch (e) { }
    }

    fab.addEventListener('mousedown', e => {
      if (fabEditMode) return;
      e.preventDefault();
      onStart(e);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', () => {
        document.removeEventListener('mousemove', onMove);
        onEnd();
      }, { once: true });
    });
    fab.addEventListener('touchstart', e => {
      if (fabEditMode) return;
      // فقط اگه حرکت داشت درگ می‌کنیم
      onStart(e);
      let moved = false;
      const onMoveHandler = ev => {
        moved = true;
        onMove(ev);
      };
      const onEndHandler = ev => {
        document.removeEventListener('touchmove', onMoveHandler);
        if (moved) {
          ev.preventDefault();
          onEnd();
        } else {
          isDragging = false;
        }
      };
      document.addEventListener('touchmove', onMoveHandler, { passive: false });
      document.addEventListener('touchend', onEndHandler, { once: true });
    }, { passive: true });
  }

  // ═══════════════════════════════════════════════════════════════════
  // ADMIN — media modals
  // ═══════════════════════════════════════════════════════════════════
  function openMediaCollectionModal(type, id) {
    editingMediaCollection = { type, id: id || null };
    const modal = document.getElementById('modalMediaCollection');
    const titleEl = document.getElementById('mediaCollectionTitle');
    const titleInput = document.getElementById('mediaCollectionTitleInput');
    const descInput = document.getElementById('mediaCollectionDescInput');
    const coverInput = document.getElementById('mediaCollectionCoverInput');
    const colorInput = document.getElementById('mediaCollectionColorInput');
    if (!modal) return;
    if (id) {
      let item = null;
      if (type === 'video') {
        item = getLessonVideos().find(v => v.isCollection && v.id === id);
      } else {
        item = getLessonAudioCollections().find(c => c.id === id);
      }
      if (item) {
        if (titleEl) titleEl.textContent = '✏️ ویرایش مجموعه';
        if (titleInput) titleInput.value = item.title || '';
        if (descInput) descInput.value = item.description || '';
        if (coverInput) coverInput.value = item.coverImage || '';
        if (colorInput) colorInput.value = safeCoverColor(item.coverColor);
      }
    } else {
      if (titleEl) titleEl.textContent = type === 'video' ? '➕ مجموعه ویدیو جدید' : '➕ مجموعه آدیو جدید';
      if (titleInput) titleInput.value = '';
      if (descInput) descInput.value = '';
      if (coverInput) coverInput.value = '';
      if (colorInput) colorInput.value = type === 'video' ? '#6366f1' : '#a855f7';
    }
    modal.classList.add('active');
    document.body.classList.add('locked');
  }

  function saveMediaCollection() {
    const type = editingMediaCollection.type;
    const id = editingMediaCollection.id;
    const title = document.getElementById('mediaCollectionTitleInput').value.trim();
    if (!title) { toast('عنوان لازمه', 'error'); return; }
    const description = document.getElementById('mediaCollectionDescInput').value.trim();
    const coverImage = document.getElementById('mediaCollectionCoverInput').value.trim();
    const coverColor = safeCoverColor(document.getElementById('mediaCollectionColorInput').value);
    const lesson = getLesson();
    if (!lesson) return;
    if (type === 'video') {
      if (!Array.isArray(lesson.videos)) lesson.videos = [];
      if (id) {
        const item = lesson.videos.find(v => v.isCollection && v.id === id);
        if (item) {
          item.title = title; item.description = description; item.coverImage = coverImage; item.coverColor = coverColor;
        }
      } else {
        lesson.videos.push({ id: uid(), isCollection: true, title, description, coverImage, coverColor, episodes: [] });
      }
    } else {
      if (!Array.isArray(lesson.audioCollections)) lesson.audioCollections = [];
      if (id) {
        const item = lesson.audioCollections.find(c => c.id === id);
        if (item) {
          item.title = title; item.description = description; item.coverImage = coverImage; item.coverColor = coverColor;
        }
      } else {
        lesson.audioCollections.push({ id: uid(), title, description, coverImage, coverColor, episodes: [] });
      }
    }
    save();
    document.getElementById('modalMediaCollection').classList.remove('active');
    document.body.classList.remove('locked');
    renderAll();
    toast('✅ ذخیره شد', 'success');
  }

  function openMediaEpisodeModal(type, collectionId, episodeId) {
    editingMediaEpisode = { type, collectionId, id: episodeId || null };
    const modal = document.getElementById('modalMediaEpisode');
    const titleEl = document.getElementById('mediaEpisodeTitle');
    if (!modal) return;

    let ep = null;
    if (episodeId) {
      if (type === 'video') {
        const col = getLessonVideos().find(v => v.isCollection && v.id === collectionId);
        if (col) ep = col.episodes.find(e => e.id === episodeId);
      } else {
        const col = getLessonAudioCollections().find(c => c.id === collectionId);
        if (col) ep = col.episodes.find(e => e.id === episodeId);
      }
    }
    if (titleEl) titleEl.textContent = episodeId ? '✏️ ویرایش قسمت' : '➕ قسمت جدید';
    document.getElementById('mediaEpisodeTitleInput').value = ep ? ep.title : '';
    document.getElementById('mediaEpisodeDescInput').value = ep ? (ep.description || '') : '';
    document.getElementById('mediaEpisodeUrlInput').value = ep ? (ep.url || ep.audioUrl || '') : '';
    document.getElementById('mediaEpisodeCoverInput').value = ep ? (ep.poster || ep.coverImage || '') : '';
    document.getElementById('mediaEpisodeDurationInput').value = ep ? (ep.duration || '') : '';
    // علامت
    const mark = ep ? (ep.fire ? 'fire' : ep.star ? 'star' : ep.heart ? 'heart' : 'none') : 'none';
    document.querySelectorAll('input[name="mediaEpisodeMark"]').forEach(r => { r.checked = r.value === mark; });
    // نوع منبع
    document.querySelectorAll('input[name="mediaSourceType"]').forEach(r => { r.checked = r.value === 'url'; });
    document.getElementById('mediaUrlBox').classList.remove('hidden');
    document.getElementById('mediaUploadBox').classList.add('hidden');
    document.getElementById('mediaUploadStatus').textContent = '';

    modal.classList.add('active');
    document.body.classList.add('locked');
  }

  function saveMediaEpisode() {
    const { type, collectionId, id } = editingMediaEpisode;
    const title = document.getElementById('mediaEpisodeTitleInput').value.trim();
    if (!title) { toast('عنوان لازمه', 'error'); return; }
    const description = document.getElementById('mediaEpisodeDescInput').value.trim();
    const url = document.getElementById('mediaEpisodeUrlInput').value.trim();
    const cover = document.getElementById('mediaEpisodeCoverInput').value.trim();
    const duration = document.getElementById('mediaEpisodeDurationInput').value.trim();
    const markEl = document.querySelector('input[name="mediaEpisodeMark"]:checked');
    const mark = markEl ? markEl.value : 'none';
    const lesson = getLesson();
    if (!lesson) return;

    let collection = null;
    if (type === 'video') {
      collection = getLessonVideos().find(v => v.isCollection && v.id === collectionId);
    } else {
      collection = getLessonAudioCollections().find(c => c.id === collectionId);
    }
    if (!collection) { toast('مجموعه پیدا نشد', 'error'); return; }
    if (!Array.isArray(collection.episodes)) collection.episodes = [];

    const data = {
      id: id || uid(),
      title, description, duration,
      heart: mark === 'heart',
      star: mark === 'star',
      fire: mark === 'fire',
      dialogues: id ? (collection.episodes.find(e => e.id === id)?.dialogues || []) : []
    };
    if (type === 'video') {
      data.type = 'url';
      data.url = url;
      data.poster = cover;
    } else {
      data.audioUrl = url;
      data.coverImage = cover;
    }

    if (id) {
      const idx = collection.episodes.findIndex(e => e.id === id);
      if (idx !== -1) collection.episodes[idx] = { ...collection.episodes[idx], ...data };
    } else {
      collection.episodes.push(data);
    }
    save();
    document.getElementById('modalMediaEpisode').classList.remove('active');
    document.body.classList.remove('locked');
    renderAll();
    toast('✅ ذخیره شد', 'success');
  }

  function openDialogueModal(type, collectionId, episodeId) {
    editingMediaDialogue = { type, collectionId, episodeId };
    const modal = document.getElementById('modalDialogue');
    if (!modal) return;
    renderDialogueListBox();
    document.getElementById('dialogueTimeInput').value = '';
    document.getElementById('dialogueSpeakerInput').value = '';
    document.getElementById('dialogueDeInput').value = '';
    document.getElementById('dialogueFaInput').value = '';
    modal.classList.add('active');
    document.body.classList.add('locked');
  }

  function renderDialogueListBox() {
    const box = document.getElementById('dialogueListBox');
    if (!box) return;
    const { type, collectionId, episodeId } = editingMediaDialogue;
    let ep = null;
    if (type === 'video') {
      const col = getLessonVideos().find(v => v.isCollection && v.id === collectionId);
      if (col) ep = col.episodes.find(e => e.id === episodeId);
    } else {
      const col = getLessonAudioCollections().find(c => c.id === collectionId);
      if (col) ep = col.episodes.find(e => e.id === episodeId);
    }
    const dialogues = (ep && ep.dialogues) ? ep.dialogues : [];
    if (!dialogues.length) {
      box.innerHTML = `<div class="empty" style="font-size:12px;">هنوز دیالوگی نداری</div>`;
      return;
    }
    box.innerHTML = dialogues.map((d, idx) => `
      <div class="dialogue-edit-row">
        <span class="dialogue-edit-time">${fmtTimestamp(d.time)}</span>
        <span class="dialogue-edit-de">${esc(d.de)}</span>
        <span class="dialogue-edit-fa">${esc(d.fa)}</span>
        <button class="btn btn-sm btn-danger" data-del-dialogue="${idx}">🗑</button>
      </div>
    `).join('');
    box.querySelectorAll('[data-del-dialogue]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.delDialogue, 10);
        ep.dialogues.splice(idx, 1);
        save();
        renderDialogueListBox();
      });
    });
  }

  function addDialogueLine() {
    const { type, collectionId, episodeId } = editingMediaDialogue;
    const timeStr = document.getElementById('dialogueTimeInput').value.trim();
    const speaker = document.getElementById('dialogueSpeakerInput').value.trim();
    const de = document.getElementById('dialogueDeInput').value.trim();
    const fa = document.getElementById('dialogueFaInput').value.trim();
    if (!de) { toast('متن آلمانی لازمه', 'error'); return; }
    let ep = null;
    if (type === 'video') {
      const col = getLessonVideos().find(v => v.isCollection && v.id === collectionId);
      if (col) ep = col.episodes.find(e => e.id === episodeId);
    } else {
      const col = getLessonAudioCollections().find(c => c.id === collectionId);
      if (col) ep = col.episodes.find(e => e.id === episodeId);
    }
    if (!ep) return;
    if (!Array.isArray(ep.dialogues)) ep.dialogues = [];
    ep.dialogues.push({
      id: uid(), time: timestampToSeconds(timeStr), speaker, de, fa,
      heart: false, star: false, fire: false
    });
    save();
    renderDialogueListBox();
    document.getElementById('dialogueTimeInput').value = '';
    document.getElementById('dialogueSpeakerInput').value = '';
    document.getElementById('dialogueDeInput').value = '';
    document.getElementById('dialogueFaInput').value = '';
    toast('✅ دیالوگ اضافه شد', 'success');
  }

  function openPlaylistModal(id) {
    editingPlaylistId = id || null;
    const modal = document.getElementById('modalPlaylist');
    const titleEl = document.getElementById('playlistModalTitle');
    if (!modal) return;
    if (id) {
      const p = getPlaylist(id);
      if (p) {
        if (titleEl) titleEl.textContent = '✏️ ویرایش پلی‌لیست';
        document.getElementById('playlistNameInput').value = p.name;
        document.getElementById('playlistCoverInput').value = p.coverImage || '';
        document.getElementById('playlistColorInput').value = safeCoverColor(p.coverColor);
      }
    } else {
      if (titleEl) titleEl.textContent = '➕ پلی‌لیست جدید';
      document.getElementById('playlistNameInput').value = '';
      document.getElementById('playlistCoverInput').value = '';
      document.getElementById('playlistColorInput').value = '#a855f7';
    }
    modal.classList.add('active');
    document.body.classList.add('locked');
  }

  function savePlaylist() {
    const name = document.getElementById('playlistNameInput').value.trim();
    if (!name) { toast('نام لازمه', 'error'); return; }
    const coverImage = document.getElementById('playlistCoverInput').value.trim();
    const coverColor = safeCoverColor(document.getElementById('playlistColorInput').value);
    if (!Array.isArray(state.playlists)) state.playlists = [];
    if (editingPlaylistId) {
      const p = getPlaylist(editingPlaylistId);
      if (p) { p.name = name; p.coverImage = coverImage; p.coverColor = coverColor; }
    } else {
      state.playlists.push({ id: uid(), name, coverImage, coverColor, items: [] });
    }
    save();
    document.getElementById('modalPlaylist').classList.remove('active');
    document.body.classList.remove('locked');
    renderPlaylistsHome();
    toast('✅ ذخیره شد', 'success');
  }

  function openWordMediaModal(wordId, mediaType) {
    // ساده — فایل یا URL
    const word = getWords().find(w => w.id === wordId);
    if (!word) return;
    const list = mediaType === 'video' ? (word.videos || []) : (word.audios || []);
    let html = `<div style="padding:10px;">`;
    html += `<h3>${mediaType === 'video' ? '🎬 ویدیوهای' : '🎙 آدیوهای'} «${esc(word.de)}»</h3>`;
    if (list.length) {
      html += list.map((it, idx) => `<div style="padding:8px;border-bottom:1px solid var(--border);">
        <div>${esc(it.title || 'بدون عنوان')}</div>
        <div style="font-size:11px;color:var(--muted);direction:ltr;">${esc(it.url || '')}</div>
        <button class="btn btn-sm btn-danger" data-del-word-media="${idx}">🗑</button>
      </div>`).join('');
    } else {
      html += `<div class="empty">هنوز چیزی اضافه نکردی</div>`;
    }
    html += `<div style="margin-top:12px;">
      <input id="wmmTitle" placeholder="عنوان" style="width:100%;margin-bottom:6px;">
      <input id="wmmUrl" placeholder="https://..." dir="ltr" style="width:100%;margin-bottom:6px;">
      <button class="btn btn-primary btn-sm" id="wmmAddBtn">➕ افزودن</button>
      <button class="btn btn-sm" id="wmmCloseBtn">بستن</button>
    </div>`;
    html += `</div>`;
    const existing = document.getElementById('wordMediaTempModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'wordMediaTempModal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `<div class="modal-box">${html}</div>`;
    document.body.appendChild(modal);
    document.body.classList.add('locked');

    document.getElementById('wmmAddBtn').addEventListener('click', () => {
      const title = document.getElementById('wmmTitle').value.trim();
      const url = document.getElementById('wmmUrl').value.trim();
      if (!url) { toast('آدرس لازمه', 'error'); return; }
      if (mediaType === 'video') {
        if (!Array.isArray(word.videos)) word.videos = [];
        word.videos.push({ id: uid(), title: title || 'ویدیو', url, type: 'url', heart: false, star: false, fire: false });
      } else {
        if (!Array.isArray(word.audios)) word.audios = [];
        word.audios.push({ id: uid(), title: title || 'آدیو', audioUrl: url, heart: false, star: false, fire: false });
      }
      save();
      modal.remove();
      document.body.classList.remove('locked');
      toast('✅ اضافه شد', 'success');
    });
    document.getElementById('wmmCloseBtn').addEventListener('click', () => {
      modal.remove();
      document.body.classList.remove('locked');
    });
    modal.querySelectorAll('[data-del-word-media]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.delWordMedia, 10);
        if (mediaType === 'video') word.videos.splice(idx, 1);
        else word.audios.splice(idx, 1);
        save();
        modal.remove();
        document.body.classList.remove('locked');
        openWordMediaModal(wordId, mediaType);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // PLACEHOLDER — بخش ۶
  // ═══════════════════════════════════════════════════════════════════
  // ادامه در بخش ۶ (import/export + bindEvents + init)
    // ═══════════════════════════════════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════════════════════════════════
  function exportData(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function exportBook() {
    const b = getBook(); if (!b) return;
    exportData(b, `${b.name}-${b.level}.json`);
    toast('دانلود شد', 'success');
  }

  function exportLesson() {
    const l = getLesson(), b = getBook();
    if (!l) return;
    exportData(l, `${b ? b.name : 'book'}-${l.title}.json`);
    toast('درس دانلود شد', 'success');
  }

  function exportBad() {
    const words = getWords().filter(w => normalizeStatus(w) === 'bad');
    if (!words.length) { toast('کلمه‌ای نداری!', 'warning'); return; }
    exportData(words, `bad-words-${Date.now()}.json`);
    toast('دانلود شد', 'success');
  }

  function exportHeart() {
    const words = getWords().filter(w => w.heart);
    if (!words.length) { toast('موردعلاقه‌ای نداری!', 'warning'); return; }
    exportData(words, `heart-words-${Date.now()}.json`);
    toast(`❤️ ${words.length} موردعلاقه دانلود شد`, 'success');
  }

  function exportStar() {
    const words = getWords().filter(w => w.star);
    if (!words.length) { toast('مهمی نداری!', 'warning'); return; }
    exportData(words, `star-words-${Date.now()}.json`);
    toast(`⭐ ${words.length} مهم دانلود شد`, 'success');
  }

  function exportFire() {
    const words = getWords().filter(w => w.fire);
    if (!words.length) { toast('خیلی مهمی نداری!', 'warning'); return; }
    exportData(words, `fire-words-${Date.now()}.json`);
    toast(`🔥 ${words.length} خیلی مهم دانلود شد`, 'success');
  }

  // ═══════════════════════════════════════════════════════════════════
  // IMPORT — FULL BOOK
  // ═══════════════════════════════════════════════════════════════════
  function processLibraryImportData(data, fileName) {
    let rawBooks = [];
    if (data.books && Array.isArray(data.books)) rawBooks = data.books;
    else if (data.lessons && Array.isArray(data.lessons)) rawBooks = [data];
    else if (Array.isArray(data) && data.length > 0 && data[0].lessons) rawBooks = data;
    else { toast('❌ فرمت کتاب شناسایی نشد', 'error'); return; }
    const newBooks = rawBooks.map(b => normalizeBook(b)).filter(Boolean);
    if (!newBooks.length) { toast('❌ کتاب معتبری نبود', 'error'); return; }
    newBooks.forEach(nb => ensureSampleLesson(nb));
    newBooks.forEach(nb => state.books.push(nb));
    state.activeBookId = newBooks[0].id;
    state.activeLessonId = newBooks[0].lessons[0]?.id;
    save();
    renderBookLibrary();
    closeLibraryImportModal();
    toast(`✅ ${newBooks.length} کتاب اضافه شد`, 'success');
  }

  function openLibraryImportModal() {
    document.getElementById('modalLibraryImport').classList.add('active');
    document.body.classList.add('locked');
    document.getElementById('libImportUrlBox').classList.add('hidden');
    document.getElementById('libImportPasteBox').classList.add('hidden');
    document.getElementById('libImportUrlStatus').innerHTML = '';
    document.getElementById('libImportPasteStatus').innerHTML = '';
    document.getElementById('libImportUrlInput').value = '';
    document.getElementById('libImportPasteInput').value = '';
  }
  function closeLibraryImportModal() {
    document.getElementById('modalLibraryImport')?.classList.remove('active');
    document.body.classList.remove('locked');
  }

  function importFullBook(file) {
    const status = document.getElementById('fullBookStatus');
    if (status) status.innerHTML = `<div style="color:var(--info);font-size:13px;">⏳ در حال خواندن...</div>`;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        let rawBooks = [];
        if (data.books && Array.isArray(data.books)) rawBooks = data.books;
        else if (data.lessons && Array.isArray(data.lessons)) rawBooks = [data];
        else if (Array.isArray(data) && data.length > 0 && data[0].lessons) rawBooks = data;
        else { if (status) status.innerHTML = `<div style="color:var(--danger);">❌ فرمت شناسایی نشد</div>`; return; }
        const newBooks = rawBooks.map(b => normalizeBook(b)).filter(Boolean);
        if (!newBooks.length) { if (status) status.innerHTML = `<div style="color:var(--danger);">❌ کتاب معتبری نبود</div>`; return; }
        newBooks.forEach(nb => ensureSampleLesson(nb));
        newBooks.forEach(nb => state.books.push(nb));
        state.activeBookId = newBooks[0].id;
        state.activeLessonId = newBooks[0].lessons[0]?.id;
        save(); renderAll(); populateLessonTargets();
        let totalLessons = 0, totalWords = 0;
        newBooks.forEach(nb => {
          totalLessons += nb.lessons.length;
          nb.lessons.forEach(l => totalWords += l.words.length);
        });
        if (status) status.innerHTML = `<div style="background:rgba(16,185,129,0.1);border:1px solid var(--accent);border-radius:8px;padding:12px;font-size:13px;">✅ <b>${newBooks.length}</b> کتاب، <b>${totalLessons}</b> درس، <b>${totalWords}</b> کلمه اضافه شد</div>`;
        toast('کتاب اضافه شد', 'success');
      } catch (err) {
        if (status) status.innerHTML = `<div style="color:var(--danger);">❌ ${esc(err.message)}</div>`;
      }
    };
    reader.readAsText(file);
  }

  function replaceFullBook(file) {
    if (!confirm('⚠️ همه کتاب‌ها پاک می‌شن. مطمئنی؟')) return;
    const status = document.getElementById('fullBookStatus');
    if (status) status.innerHTML = `<div style="color:var(--info);">⏳...</div>`;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        let rawBooks = [];
        if (data.books && Array.isArray(data.books)) rawBooks = data.books;
        else if (data.lessons && Array.isArray(data.lessons)) rawBooks = [data];
        else if (Array.isArray(data) && data.length > 0 && data[0].lessons) rawBooks = data;
        else { if (status) status.innerHTML = `<div style="color:var(--danger);">❌ فرمت شناسایی نشد</div>`; return; }
        const newBooks = rawBooks.map(b => normalizeBook(b)).filter(Boolean);
        if (!newBooks.length) { if (status) status.innerHTML = `<div style="color:var(--danger);">❌ کتاب معتبری نبود</div>`; return; }
        newBooks.forEach(nb => ensureSampleLesson(nb));
        state.books = newBooks;
        state.activeBookId = newBooks[0].id;
        state.activeLessonId = newBooks[0].lessons[0]?.id;
        save(); renderAll(); populateLessonTargets();
        if (status) status.innerHTML = `<div style="color:var(--accent);">✅ ${newBooks.length} کتاب جایگزین شد</div>`;
        toast('جایگزین شد', 'success');
      } catch (err) {
        if (status) status.innerHTML = `<div style="color:var(--danger);">❌ ${esc(err.message)}</div>`;
      }
    };
    reader.readAsText(file);
  }

  // ═══════════════════════════════════════════════════════════════════
  // IMPORT — WORDS / LESSON
  // ═══════════════════════════════════════════════════════════════════
  function importJsonWords() {
    const raw = document.getElementById('jsonInput').value.trim();
    if (!raw) { toast('JSON خالیه', 'error'); return; }
    let data;
    try { data = JSON.parse(raw); }
    catch (e) { toast('JSON نامعتبر: ' + e.message, 'error'); return; }
    if (!Array.isArray(data) && (data.title || data.lesson || data.words || data.stories || data.grammar || data.chats || data.verbs) && !data.name && !data.lessons) {
      addFullLessonFromJson(data, document.getElementById('jsonInput'), document.getElementById('jsonPreview'));
      return;
    }
    let arr = null;
    if (Array.isArray(data)) arr = data;
    else if (data.words && Array.isArray(data.words)) arr = data.words;
    if (!arr) { toast('فرمت نامعتبر', 'warning'); return; }
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
    save(); renderAll(); populateLessonTargets();
    document.getElementById('jsonInput').value = '';
    document.getElementById('jsonPreview').innerHTML = '';
    toast(`✅ ${added} اضافه${dup ? `، ${dup} تکراری` : ''}${skip ? `، ${skip} نامعتبر` : ''}`, 'success');
  }

  function addFullLessonFromJson(data, textareaEl, statusEl) {
    const book = getBook();
    if (!book) { toast('اول یک کتاب انتخاب کن', 'error'); return; }
    const title = (data.title || data.lesson || data.lessonTitle || data.name || '').toString().trim();
    const words = (data.words || []).map(normalizeWord).filter(Boolean);
    const stories = (data.stories || []).map(normalizeStory).filter(Boolean);
    const grammar = (data.grammar || []).map(normalizeGrammar).filter(Boolean);
    const letters = (data.letters || []).map(normalizeLetter).filter(Boolean);
    const dialogues = (data.dialogues || []).map(normalizeDialogue).filter(Boolean);
    const chats = (data.chats || []).map(normalizeChat).filter(Boolean);
    const verbs = Array.isArray(data.verbs) ? data.verbs : [];
    const videos = (data.videos || []).map(normalizeVideo).filter(Boolean);
    const audioCollections = (data.audioCollections || []).map(normalizeAudioCollection).filter(Boolean);
    const exercises = Array.isArray(data.exercises) ? data.exercises : [];
    const quiz = data.quiz || null;
    const genderTest = data.genderTest || null;
    const conjugationTest = data.conjugationTest || null;

    if (!words.length && !stories.length && !grammar.length && !letters.length && !dialogues.length && !chats.length && !verbs.length && !videos.length && !audioCollections.length) {
      toast('محتوایی برای اضافه کردن نیست', 'warning'); return;
    }
    if (title) {
      const newLesson = {
        id: uid(), title, words, stories, grammar, letters, dialogues,
        chats, verbs, videos, audioCollections, exercises, quiz,
        genderTest, conjugationTest,
        isSample: false
      };
      if (!Array.isArray(book.lessons)) book.lessons = [];
      book.lessons.push(newLesson);
      state.activeLessonId = newLesson.id;
      save(); renderAll(); populateLessonTargets();
      if (textareaEl) textareaEl.value = '';
      if (statusEl) statusEl.innerHTML = `<div style="background:rgba(16,185,129,0.12);border:1px solid var(--accent);border-radius:8px;padding:10px;color:var(--accent);font-size:13px;">
      ✅ درس «${esc(newLesson.title)}» ساخته شد<br>
      📝 ${words.length} لغت • 📖 ${stories.length} داستان • 📘 ${grammar.length} گرامر<br>
      💌 ${letters.length} نامه • 💬 ${dialogues.length} دیالوگ • 📱 ${chats.length} چت<br>
      ⚡ ${verbs.length} فعل • 🎬 ${videos.length} ویدیو • 🎙 ${audioCollections.length} آدیو
    </div>`;
      toast(`✅ درس «${title}» ساخته شد`, 'success');
      return;
    }
    const targetId = document.getElementById('jsonTargetLesson').value;
    const target = getLessonById(targetId);
    if (!target) { toast('درس مقصد رو انتخاب کن', 'error'); return; }
    if (!Array.isArray(target.words)) target.words = [];
    if (!Array.isArray(target.stories)) target.stories = [];
    if (!Array.isArray(target.grammar)) target.grammar = [];
    if (!Array.isArray(target.letters)) target.letters = [];
    if (!Array.isArray(target.dialogues)) target.dialogues = [];
    if (!Array.isArray(target.chats)) target.chats = [];
    if (!Array.isArray(target.verbs)) target.verbs = [];
    if (!Array.isArray(target.videos)) target.videos = [];
    if (!Array.isArray(target.audioCollections)) target.audioCollections = [];
    let addedW = 0, addedS = 0, addedG = 0, addedC = 0, addedV = 0;
    words.forEach(w => {
      if (!target.words.some(x => x.de.toLowerCase() === w.de.toLowerCase())) { target.words.push(w); addedW++; }
    });
    stories.forEach(s => { target.stories.push(s); addedS++; });
    grammar.forEach(g => { target.grammar.push(g); addedG++; });
    letters.forEach(l => target.letters.push(l));
    dialogues.forEach(d => target.dialogues.push(d));
    chats.forEach(c => { target.chats.push(c); addedC++; });
    verbs.forEach(v => { target.verbs.push(v); addedV++; });
    videos.forEach(v => target.videos.push(v));
    audioCollections.forEach(a => target.audioCollections.push(a));
    save(); renderAll(); populateLessonTargets();
    if (textareaEl) textareaEl.value = '';
    if (statusEl) statusEl.innerHTML = `<div style="color:var(--accent);font-size:13px;">✅ ${addedW} لغت، ${addedS} داستان، ${addedG} گرامر، ${addedC} چت، ${addedV} فعل اضافه شد</div>`;
    toast(`✅ محتوا اضافه شد`, 'success');
  }

  function validateJson() {
    const raw = document.getElementById('jsonInput').value.trim();
    const preview = document.getElementById('jsonPreview');
    if (!raw) { preview.innerHTML = ''; return; }
    let data;
    try { data = JSON.parse(raw); }
    catch (e) { preview.innerHTML = `<div style="color:var(--danger);">❌ ${esc(e.message)}</div>`; return; }
    if (!Array.isArray(data) && (data.title || data.lesson || data.words || data.stories || data.grammar || data.chats || data.verbs) && !data.name && !data.lessons) {
      const words = (data.words || []).map(normalizeWord).filter(Boolean);
      const stories = (data.stories || []).map(normalizeStory).filter(Boolean);
      const grammar = (data.grammar || []).map(normalizeGrammar).filter(Boolean);
      const letters = (data.letters || []).map(normalizeLetter).filter(Boolean);
      const dialogues = (data.dialogues || []).map(normalizeDialogue).filter(Boolean);
      const chats = (data.chats || []).map(normalizeChat).filter(Boolean);
      const verbs = Array.isArray(data.verbs) ? data.verbs : [];
      const videos = (data.videos || []).length;
      const audios = (data.audioCollections || []).length;
      preview.innerHTML = `<div style="background:var(--bg-3);padding:10px;border-radius:8px;font-size:13px;">
      <div style="color:var(--accent);">✅ آبجکت درس: «${esc(data.title || data.lesson || 'بدون عنوان')}»</div>
      <div style="color:var(--accent);">📝 ${words.length} لغت</div>
      <div style="color:var(--accent);">📖 ${stories.length} داستان</div>
      <div style="color:var(--accent);">📘 ${grammar.length} گرامر</div>
      <div style="color:var(--accent);">💌 ${letters.length} نامه</div>
      <div style="color:var(--accent);">💬 ${dialogues.length} دیالوگ</div>
      <div style="color:var(--accent);">📱 ${chats.length} چت</div>
      <div style="color:var(--accent);">⚡ ${verbs.length} فعل</div>
      <div style="color:var(--accent);">🎬 ${videos} مجموعه ویدیو</div>
      <div style="color:var(--accent);">🎙 ${audios} مجموعه آدیو</div>
    </div>`;
      return;
    }
    let arr = Array.isArray(data) ? data : (data.words && Array.isArray(data.words) ? data.words : null);
    if (!arr) { preview.innerHTML = `<div style="color:var(--danger);">❌ باید آرایه لغات یا آبجکت درس باشد</div>`; return; }
    const valid = arr.map(normalizeWord).filter(Boolean);
    preview.innerHTML = `<div style="background:var(--bg-3);padding:10px;border-radius:8px;font-size:13px;">
    <div style="color:var(--accent);">✅ ${valid.length} معتبر</div>
    <div style="color:var(--danger);">❌ ${arr.length - valid.length} نامعتبر</div>
  </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // IMPORT BOOK POPUP
  // ═══════════════════════════════════════════════════════════════════
  function openImportBookPopup(pending) {
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
    if (info) info.innerHTML = `
    <div class="import-info-row"><span class="label">📦 تعداد کتاب:</span><span class="value">${booksCount}</span></div>
    <div class="import-info-row"><span class="label">📚 تعداد درس:</span><span class="value">${lessonsCount}</span></div>
    <div class="import-info-row"><span class="label">📝 تعداد کلمات:</span><span class="value">${wordsCount}</span></div>
    ${storiesCount ? `<div class="import-info-row"><span class="label">📖 تعداد داستان:</span><span class="value">${storiesCount}</span></div>` : ''}
    ${firstBookName ? `<div class="import-info-row"><span class="label">🏷 نام:</span><span class="value">${esc(firstBookName)}${booksCount > 1 ? ' و ...' : ''}</span></div>` : ''}
  `;
    document.getElementById('modalImportBook').classList.add('active');
    document.body.classList.add('locked');
  }

  function closeImportBookPopup() {
    document.getElementById('modalImportBook').classList.remove('active');
    document.body.classList.remove('locked');
    pendingBookData = null;
  }

  function chooseImportAsNewBook() {
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

  function confirmNewBookFromImport() {
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
    newBooks.forEach(nb => ensureSampleLesson(nb));
    newBooks.forEach(nb => state.books.push(nb));
    state.activeBookId = newBooks[0].id;
    state.activeLessonId = newBooks[0].lessons[0]?.id;
    save();
    document.getElementById('modalNewBookFromImport').classList.remove('active');
    document.body.classList.remove('locked');
    pendingBookData = null;
    renderAll(); populateLessonTargets();
    showBookLibrary();
    toast(`✅ ${newBooks.length} کتاب اضافه شد`, 'success');
  }

  function chooseImportAsReplace() {
    if (!pendingBookData) return;
    document.getElementById('modalImportBook').classList.remove('active');
    if (!state.books.length) {
      toast('کتابی برای جایگزینی وجود نداره', 'warning');
      closeImportBookPopup();
      return;
    }
    const sel = document.getElementById('replaceTargetSelect');
    if (sel) sel.innerHTML = state.books.map(b => {
      const totalWords = (b.lessons || []).reduce((s, l) => s + ((l.words || []).length), 0);
      return `<option value="${b.id}">${esc(b.name)} — ${esc(b.level)} (${totalWords} کلمه)</option>`;
    }).join('');
    document.getElementById('modalReplaceTargetBook').classList.add('active');
  }

  function confirmReplaceBook() {
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
      .filter(l => !l.isSample)
      .map(l => ({
        ...l,
        id: uid(),
        isSample: false
      }));
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
    toast(`✅ «${targetBook.name}» جایگزین شد`, 'success');
  }

  // ═══════════════════════════════════════════════════════════════════
  // FILE DROP ZONE
  // ═══════════════════════════════════════════════════════════════════
  function setupFileDropZone() {
    const zone = document.getElementById('bigDropZone');
    const input = document.getElementById('jsonFileInput');
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
    document.getElementById('browseFileBtn')?.addEventListener('click', e => { e.stopPropagation(); input.click(); });
    const quickBtn = document.getElementById('quickJsonBtn');
    const quickInput = document.getElementById('quickJsonFile');
    if (quickBtn && quickInput) {
      quickBtn.addEventListener('click', () => quickInput.click());
      quickInput.addEventListener('change', e => {
        if (e.target.files[0]) handleFileUpload(e.target.files[0], true);
        e.target.value = '';
      });
    }
  }

  function handleFileUpload(file, forceActiveLesson) {
    const status = document.getElementById('fileStatus');
    if (status) status.innerHTML = `<div style="color:var(--info);font-size:13px;">⏳ در حال خواندن...</div>`;
    if (!file.name.toLowerCase().endsWith('.json')) {
      if (status) status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ فقط .json</div>`;
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        processUploadedData(data, file.name, status, forceActiveLesson);
      } catch (err) {
        if (status) status.innerHTML = `<div style="color:var(--danger);">❌ JSON نامعتبر</div>`;
      }
    };
    reader.readAsText(file);
  }

  function processUploadedData(data, filename, status, forceActiveLesson) {
    const book = getBook();
    if (!book) { toast('اول یک کتاب انتخاب کن', 'error'); return; }
    function show(html) { if (status) status.innerHTML = html; }
    function extractLessonTitle(obj) {
      if (!obj) return '';
      return (obj.title || obj.lesson || obj.lessonTitle || obj.name || '').toString().trim();
    }
    function addNewLessonFromObject(lessonObj, fallbackTitle) {
      const title = extractLessonTitle(lessonObj) || fallbackTitle || 'درس جدید';
      const nWords = Array.isArray(lessonObj.words) ? lessonObj.words.map(normalizeWord).filter(Boolean) : [];
      const nStories = Array.isArray(lessonObj.stories) ? lessonObj.stories.map(normalizeStory).filter(Boolean) : [];
      const nGrammar = Array.isArray(lessonObj.grammar) ? lessonObj.grammar.map(normalizeGrammar).filter(Boolean) : [];
      const nLetters = Array.isArray(lessonObj.letters) ? lessonObj.letters.map(normalizeLetter).filter(Boolean) : [];
      const nDialogues = Array.isArray(lessonObj.dialogues) ? lessonObj.dialogues.map(normalizeDialogue).filter(Boolean) : [];
      const nChats = Array.isArray(lessonObj.chats) ? lessonObj.chats.map(normalizeChat).filter(Boolean) : [];
      const nVerbs = Array.isArray(lessonObj.verbs) ? lessonObj.verbs : [];
      const nVideos = Array.isArray(lessonObj.videos) ? lessonObj.videos.map(normalizeVideo).filter(Boolean) : [];
      const nAudios = Array.isArray(lessonObj.audioCollections) ? lessonObj.audioCollections.map(normalizeAudioCollection).filter(Boolean) : [];
      if (!nWords.length && !nStories.length && !nGrammar.length && !nLetters.length && !nDialogues.length && !nChats.length && !nVideos.length && !nAudios.length) return null;
      const newLesson = {
        id: uid(), title, words: nWords, stories: nStories, grammar: nGrammar,
        letters: nLetters, dialogues: nDialogues, chats: nChats, verbs: nVerbs,
        videos: nVideos, audioCollections: nAudios,
        exercises: Array.isArray(lessonObj.exercises) ? lessonObj.exercises : [],
        quiz: lessonObj.quiz || null,
        genderTest: lessonObj.genderTest || null,
        conjugationTest: lessonObj.conjugationTest || null,
        isSample: false
      };
      if (!Array.isArray(book.lessons)) book.lessons = [];
      book.lessons.push(newLesson);
      return newLesson;
    }

    if (data && typeof data === 'object' && Array.isArray(data.books)) {
      const booksData = data.books.map(b => normalizeBook(b)).filter(Boolean);
      if (!booksData.length) { show(`<div style="color:var(--danger);">❌ کتاب معتبری نبود</div>`); return; }
      show('');
      openImportBookPopup({ type: 'multi', data: booksData });
      return;
    }

    if (data && typeof data === 'object' && Array.isArray(data.lessons)) {
      const bookData = normalizeBook({
        name: data.name || data.title || data.book || filename.replace('.json', ''),
        level: data.level || 'A1.1',
        coverImage: data.coverImage || '',
        lessons: data.lessons
      });
      if (!bookData || !bookData.lessons.length) { show(`<div style="color:var(--danger);">❌ درس معتبری نبود</div>`); return; }
      show('');
      openImportBookPopup({ type: 'single', data: bookData });
      return;
    }

    if (data && typeof data === 'object' && (Array.isArray(data.words) || Array.isArray(data.stories) || Array.isArray(data.grammar) || Array.isArray(data.chats) || Array.isArray(data.verbs))) {
      const newLesson = addNewLessonFromObject(data, 'درس جدید');
      if (!newLesson) { show(`<div style="color:var(--danger);">❌ داده معتبری نبود</div>`); return; }
      state.activeLessonId = newLesson.id;
      save(); renderAll(); populateLessonTargets();
      show(`<div style="background:rgba(16,185,129,0.12);border:1px solid var(--accent);border-radius:8px;padding:10px;color:var(--accent);font-size:13px;">✅ درس «${esc(newLesson.title)}» ساخته شد<br>📝 ${newLesson.words.length} لغت</div>`);
      toast(`✅ درس «${newLesson.title}» اضافه شد`, 'success');
      return;
    }

    if (Array.isArray(data)) {
      const looksLikeLessons = data.length > 0 && data.every(item =>
        item && typeof item === 'object' &&
        (item.title || item.lesson || item.name) &&
        (Array.isArray(item.words) || Array.isArray(item.stories) || Array.isArray(item.grammar))
      );
      if (looksLikeLessons) {
        let addedLessons = 0, totalWords = 0;
        let lastLesson = null;
        data.forEach(lessonRaw => {
          const nl = addNewLessonFromObject(lessonRaw, 'درس');
          if (!nl) return;
          addedLessons++;
          totalWords += nl.words.length;
          lastLesson = nl;
        });
        if (addedLessons > 0) {
          state.activeLessonId = lastLesson.id;
          save(); renderAll(); populateLessonTargets();
          show(`<div style="color:var(--accent);font-size:13px;">✅ ${addedLessons} درس با ${totalWords} لغت اضافه شد</div>`);
          toast(`✅ ${addedLessons} درس اضافه شد`, 'success');
        } else {
          show(`<div style="color:var(--danger);">❌ هیچ درس معتبری نبود</div>`);
        }
        return;
      }
      const targetId = forceActiveLesson ? state.activeLessonId : (document.getElementById('fileTargetLesson').value || state.activeLessonId);
      const target = getLessonById(targetId);
      if (!target) { show(`<div style="color:var(--danger);">❌ درس مقصد انتخاب نشده</div>`); return; }
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

    show(`<div style="color:var(--danger);">❌ فرمت شناسایی نشد</div>`);
    toast('فرمت نامعتبر', 'error');
  }

  // ═══════════════════════════════════════════════════════════════════
  // LESSON SORT
  // ═══════════════════════════════════════════════════════════════════
  function openLessonSortModal() {
    const b = getBook();
    if (!b) return;
    const modal = document.getElementById('modalLessonSort');
    const list = document.getElementById('lessonSortList');
    if (!modal || !list) return;
    let lessons = b.lessons.slice();
    list.innerHTML = lessons.map((l, idx) => `
      <li class="lesson-sort-item" draggable="true" data-lesson-id="${l.id}">
        <span class="lesson-sort-drag">⠿</span>
        <span class="lesson-sort-title">${l.isSample ? '🔒 ' : ''}${esc(l.title)} <small>(${(l.words || []).length} کلمه)</small></span>
        <span class="lesson-sort-actions">
          <button class="btn btn-sm" data-move-up="${l.id}" ${idx === 0 ? 'disabled' : ''}>⬆️</button>
          <button class="btn btn-sm" data-move-down="${l.id}" ${idx === lessons.length - 1 ? 'disabled' : ''}>⬇️</button>
        </span>
      </li>
    `).join('');
    modal.classList.add('active');
    document.body.classList.add('locked');

    let draggedId = null;
    list.querySelectorAll('.lesson-sort-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        draggedId = item.dataset.lessonId;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedId);
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        list.querySelectorAll('.lesson-sort-item').forEach(el => el.classList.remove('drag-over'));
      });
      item.addEventListener('dragover', e => {
        e.preventDefault();
        if (item.dataset.lessonId !== draggedId) item.classList.add('drag-over');
      });
      item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
      item.addEventListener('drop', e => {
        e.preventDefault();
        item.classList.remove('drag-over');
        const targetId = item.dataset.lessonId;
        if (draggedId && draggedId !== targetId) {
          const bookNow = getBook();
          if (!bookNow) return;
          const fromIdx = bookNow.lessons.findIndex(x => x.id === draggedId);
          const toIdx = bookNow.lessons.findIndex(x => x.id === targetId);
          if (fromIdx === -1 || toIdx === -1) return;
          if (bookNow.lessons[fromIdx].isSample) { toast('🔒 درس نمونه قابل جابه‌جایی نیست', 'warning'); return; }
          const [moved] = bookNow.lessons.splice(fromIdx, 1);
          bookNow.lessons.splice(toIdx, 0, moved);
          save(); renderAll();
          openLessonSortModal();
          toast('✅ ترتیب ذخیره شد', 'success');
        }
      });
    });

    list.querySelectorAll('[data-move-up]').forEach(btn => {
      btn.addEventListener('click', () => { moveLessonUp(btn.dataset.moveUp); openLessonSortModal(); });
    });
    list.querySelectorAll('[data-move-down]').forEach(btn => {
      btn.addEventListener('click', () => { moveLessonDown(btn.dataset.moveDown); openLessonSortModal(); });
    });
  }

  function moveLessonUp(lessonId) {
    const b = getBook();
    if (!b) return;
    const idx = b.lessons.findIndex(x => x.id === lessonId);
    if (idx <= 0) return;
    if (b.lessons[idx].isSample) { toast('🔒 درس نمونه قابل جابه‌جایی نیست', 'warning'); return; }
    [b.lessons[idx - 1], b.lessons[idx]] = [b.lessons[idx], b.lessons[idx - 1]];
    save(); renderAll();
    toast('✅ جابه‌جا شد', 'success');
  }

  function moveLessonDown(lessonId) {
    const b = getBook();
    if (!b) return;
    const idx = b.lessons.findIndex(x => x.id === lessonId);
    if (idx === -1 || idx >= b.lessons.length - 1) return;
    if (b.lessons[idx].isSample) { toast('🔒 درس نمونه قابل جابه‌جایی نیست', 'warning'); return; }
    [b.lessons[idx + 1], b.lessons[idx]] = [b.lessons[idx], b.lessons[idx + 1]];
    save(); renderAll();
    toast('✅ جابه‌جا شد', 'success');
  }

  function closeLessonSortModal() {
    document.getElementById('modalLessonSort')?.classList.remove('active');
    document.body.classList.remove('locked');
  }

  function setupTouchDragForLessons() {
    const modal = document.getElementById('modalLessonSort');
    if (!modal) return;
    const list = document.getElementById('lessonSortList');
    if (!list) return;
    let touchDragId = null;
    let touchGhost = null;

    function onTouchStart(e) {
      const item = e.target.closest('.lesson-sort-item');
      if (!item) return;
      const dragHandle = e.target.closest('.lesson-sort-drag');
      if (!dragHandle) return;
      touchDragId = item.dataset.lessonId;
      item.classList.add('dragging');
      const rect = item.getBoundingClientRect();
      touchGhost = item.cloneNode(true);
      touchGhost.style.position = 'fixed';
      touchGhost.style.left = rect.left + 'px';
      touchGhost.style.top = rect.top + 'px';
      touchGhost.style.width = rect.width + 'px';
      touchGhost.style.pointerEvents = 'none';
      touchGhost.style.opacity = '0.85';
      touchGhost.style.zIndex = '9999';
      touchGhost.style.background = 'var(--bg-3)';
      touchGhost.style.borderRadius = '12px';
      touchGhost.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
      document.body.appendChild(touchGhost);
    }
    function onTouchMove(e) {
      if (!touchDragId || !touchGhost) return;
      e.preventDefault();
      const t = e.touches[0];
      touchGhost.style.left = (t.clientX - touchGhost.offsetWidth / 2) + 'px';
      touchGhost.style.top = (t.clientY - 30) + 'px';
      const elAtPoint = document.elementFromPoint(t.clientX, t.clientY);
      list.querySelectorAll('.lesson-sort-item').forEach(el => el.classList.remove('drag-over'));
      const targetItem = elAtPoint && elAtPoint.closest('.lesson-sort-item');
      if (targetItem && targetItem.dataset.lessonId !== touchDragId) {
        targetItem.classList.add('drag-over');
      }
    }
    function onTouchEnd(e) {
      if (!touchDragId) return;
      const t = e.changedTouches[0];
      const elAtPoint = document.elementFromPoint(t.clientX, t.clientY);
      const targetItem = elAtPoint && elAtPoint.closest('.lesson-sort-item');
      if (targetItem && targetItem.dataset.lessonId !== touchDragId) {
        const bookNow = getBook();
        if (bookNow) {
          const fromIdx = bookNow.lessons.findIndex(x => x.id === touchDragId);
          const toIdx = bookNow.lessons.findIndex(x => x.id === targetItem.dataset.lessonId);
          if (fromIdx !== -1 && toIdx !== -1 && !bookNow.lessons[fromIdx].isSample) {
            const [moved] = bookNow.lessons.splice(fromIdx, 1);
            bookNow.lessons.splice(toIdx, 0, moved);
            save(); renderAll();
            toast('✅ ترتیب ذخیره شد', 'success');
          }
        }
      }
      list.querySelectorAll('.lesson-sort-item').forEach(el => {
        el.classList.remove('dragging');
        el.classList.remove('drag-over');
      });
      if (touchGhost) { touchGhost.remove(); touchGhost = null; }
      touchDragId = null;
      openLessonSortModal();
    }

    list.addEventListener('touchstart', onTouchStart, { passive: true });
    list.addEventListener('touchmove', onTouchMove, { passive: false });
    list.addEventListener('touchend', onTouchEnd);
    list.addEventListener('touchcancel', onTouchEnd);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SWITCH TAB
  // ═══════════════════════════════════════════════════════════════════
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    const el = document.getElementById('tab-' + name);
    if (el) el.classList.remove('hidden');
    if (name === 'practice') renderFolders();
    if (name === 'grammar') renderGrammar();
    if (name === 'verbs') renderVerbsTab();
    if (name === 'stories') { renderContentTabs(); renderContentGrid(); }
    if (name === 'list') { renderWordTable(); renderArticleQuickFilters(); }
    if (name === 'cards') renderCards();
    if (name === 'quiz') { renderQuizHome(); updateAutoPlayQuizUI(); }
    if (name === 'favorites') renderFavoritesTab();
    if (name === 'videos') renderVideosHome();
    if (name === 'audios') renderAudiosHome();
    if (name === 'playlists') renderPlaylistsHome();
    if (name === 'json' || name === 'manage' || name === 'manage-story') populateLessonTargets();
    if (name === 'admin') renderAdminPanel();
  }

  // ═══════════════════════════════════════════════════════════════════
  // FAVORITES TAB
  // ═══════════════════════════════════════════════════════════════════
  function renderFavoritesTab() {
    const allWords = getWords();
    const heartCount = allWords.filter(w => w.heart).length;
    const starCount = allWords.filter(w => w.star).length;
    const fireCount = allWords.filter(w => w.fire).length;
    const elHeart = document.getElementById('favHeartCount');
    const elStar = document.getElementById('favStarCount');
    const elFire = document.getElementById('favFireCount');
    if (elHeart) elHeart.textContent = heartCount;
    if (elStar) elStar.textContent = starCount;
    if (elFire) elFire.textContent = fireCount;

    document.querySelectorAll('[data-fav-level]').forEach(b => {
      b.classList.toggle('active', b.dataset.favLevel === currentFavLevel);
    });
    document.querySelectorAll('[data-fav-type]').forEach(b => {
      b.classList.toggle('active', b.dataset.favType === currentFavType);
    });

    // populate lessons filter
    const lessonFilter = document.getElementById('favLessonFilter');
    if (lessonFilter && getBook()) {
      const book = getBook();
      const curVal = lessonFilter.value;
      lessonFilter.innerHTML = `<option value="all">همه درس‌ها</option>` +
        book.lessons.map(l => `<option value="${l.id}">${esc(l.title)}</option>`).join('');
      if (curVal) lessonFilter.value = curVal;
    }

    const search = (document.getElementById('favSearch')?.value || '').toLowerCase().trim();
    const lessonFilterVal = lessonFilter?.value || 'all';

    const container = document.getElementById('favoritesContainer');
    if (!container) return;

    // جمع‌آوری آیتم‌ها
    const items = [];
    const book = getBook();
    const targetLessons = (!book) ? [] :
      (lessonFilterVal === 'all' ? book.lessons : book.lessons.filter(l => l.id === lessonFilterVal));

    // کلمات
    if (currentFavType === 'all' || currentFavType === 'words') {
      targetLessons.forEach(l => {
        (l.words || []).forEach(w => {
          if (!w[currentFavLevel]) return;
          if (search && !wordMatchesSearch(w, search)) return;
          items.push({ type: 'word', data: w, lesson: l });
        });
      });
    }
    // جملات
    if (currentFavType === 'all' || currentFavType === 'sentences') {
      targetLessons.forEach(l => {
        (l.stories || []).forEach(s => {
          (s.sentences || []).forEach(sent => {
            if (!sent[currentFavLevel]) return;
            if (search && !(sent.de || '').toLowerCase().includes(search) && !(sent.fa || '').toLowerCase().includes(search)) return;
            items.push({ type: 'sentence', data: sent, lesson: l, source: 'داستان: ' + s.title });
          });
        });
        (l.dialogues || []).forEach(d => {
          (d.lines || []).forEach(sent => {
            if (!sent[currentFavLevel]) return;
            if (search && !(sent.de || '').toLowerCase().includes(search) && !(sent.fa || '').toLowerCase().includes(search)) return;
            items.push({ type: 'sentence', data: sent, lesson: l, source: 'دیالوگ: ' + d.title });
          });
        });
        (l.chats || []).forEach(c => {
          (c.lines || []).forEach(sent => {
            if (!sent[currentFavLevel]) return;
            if (search && !(sent.de || '').toLowerCase().includes(search) && !(sent.fa || '').toLowerCase().includes(search)) return;
            items.push({ type: 'sentence', data: sent, lesson: l, source: 'چت: ' + c.title });
          });
        });
        (l.grammar || []).forEach(g => {
          (g.examples || []).forEach(sent => {
            if (!sent[currentFavLevel]) return;
            if (search && !(sent.de || '').toLowerCase().includes(search) && !(sent.fa || '').toLowerCase().includes(search)) return;
            items.push({ type: 'sentence', data: sent, lesson: l, source: 'گرامر: ' + g.title });
          });
        });
      });
    }
    // ویدیوها
    if (currentFavType === 'all' || currentFavType === 'videos') {
      targetLessons.forEach(l => {
        (l.videos || []).forEach(v => {
          if (v.isCollection) {
            (v.episodes || []).forEach(ep => {
              if (!ep[currentFavLevel]) return;
              if (search && !(ep.title || '').toLowerCase().includes(search)) return;
              items.push({ type: 'video', data: ep, lesson: l, collectionId: v.id, collectionTitle: v.title });
            });
          } else {
            if (!v[currentFavLevel]) return;
            if (search && !(v.title || '').toLowerCase().includes(search)) return;
            items.push({ type: 'video', data: v, lesson: l, collectionId: null });
          }
        });
      });
    }
    // آدیوها
    if (currentFavType === 'all' || currentFavType === 'audios') {
      targetLessons.forEach(l => {
        (l.audioCollections || []).forEach(col => {
          (col.episodes || []).forEach(ep => {
            if (!ep[currentFavLevel]) return;
            if (search && !(ep.title || '').toLowerCase().includes(search)) return;
            items.push({ type: 'audio', data: ep, lesson: l, collectionId: col.id, collectionTitle: col.title });
          });
        });
      });
    }

    if (!items.length) {
      container.innerHTML = `<div class="empty">
        ${currentFavLevel === 'heart' ? '❤️' : currentFavLevel === 'star' ? '⭐' : '🔥'}
        هنوز چیزی در این دسته نیست
      </div>`;
      return;
    }

    container.innerHTML = `
    <div class="fav-count-badge">${items.length} آیتم</div>
    <div class="fav-items-grid">
      ${items.map((item, idx) => renderFavItem(item, idx)).join('')}
    </div>`;

    container.querySelectorAll('[data-fav-remove]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const type = btn.dataset.favTypeItem;
        const idx = parseInt(btn.dataset.favRemove, 10);
        const item = items[idx];
        if (!item) return;
        if (type === 'word') toggleHeart(item.data.id);
        else if (type === 'sentence') {
          item.data[currentFavLevel] = false;
          save();
          renderFavoritesTab();
        } else if (type === 'video' || type === 'audio') {
          item.data[currentFavLevel] = false;
          save();
          renderFavoritesTab();
        }
      });
    });
    container.querySelectorAll('[data-fav-open]').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        const idx = parseInt(el.dataset.favOpen, 10);
        const item = items[idx];
        if (!item) return;
        if (item.type === 'word') {
          if (state.activeLessonId !== item.lesson.id) {
            state.activeLessonId = item.lesson.id;
            save();
          }
          openWordView(item.data.id);
        } else if (item.type === 'sentence') {
          toast('📖 ' + (item.data.de || ''), 'info');
        } else if (item.type === 'video') {
          if (state.activeLessonId !== item.lesson.id) { state.activeLessonId = item.lesson.id; save(); }
          switchTab('videos');
          playVideoEpisode(item.data.id, item.collectionId);
        } else if (item.type === 'audio') {
          if (state.activeLessonId !== item.lesson.id) { state.activeLessonId = item.lesson.id; save(); }
          switchTab('audios');
          playAudioEpisode(item.data.id, item.collectionId);
        }
      });
    });
  }

  function renderFavItem(item, idx) {
    const levelIcon = currentFavLevel === 'heart' ? '❤️' : currentFavLevel === 'star' ? '⭐' : '🔥';
    if (item.type === 'word') {
      const w = item.data;
      return `<div class="fav-item fav-word" data-fav-open="${idx}">
        <div class="fav-item-type">📝</div>
        <div class="fav-item-content">
          <div class="fav-item-title">${esc(getFullGermanWord(w))}</div>
          <div class="fav-item-sub">${esc(w.fa)}</div>
          <div class="fav-item-meta">📚 ${esc(item.lesson.title)}</div>
        </div>
        <button class="fav-item-remove" data-fav-remove="${idx}" data-fav-type-item="word" title="حذف">✕</button>
      </div>`;
    }
    if (item.type === 'sentence') {
      const s = item.data;
      return `<div class="fav-item fav-sentence" data-fav-open="${idx}">
        <div class="fav-item-type">💬</div>
        <div class="fav-item-content">
          <div class="fav-item-title sentence-de">${esc(s.de || '')}</div>
          ${s.fa ? `<div class="fav-item-sub">${esc(s.fa)}</div>` : ''}
          <div class="fav-item-meta">${esc(item.source)} • 📚 ${esc(item.lesson.title)}</div>
        </div>
        <button class="fav-item-remove" data-fav-remove="${idx}" data-fav-type-item="sentence" title="حذف">✕</button>
      </div>`;
    }
    if (item.type === 'video') {
      const v = item.data;
      return `<div class="fav-item fav-video" data-fav-open="${idx}">
        <div class="fav-item-type">🎬</div>
        <div class="fav-item-content">
          <div class="fav-item-title">${esc(v.title || '')}</div>
          <div class="fav-item-meta">${item.collectionTitle ? esc(item.collectionTitle) + ' • ' : ''}📚 ${esc(item.lesson.title)}</div>
        </div>
        <button class="fav-item-remove" data-fav-remove="${idx}" data-fav-type-item="video" title="حذف">✕</button>
      </div>`;
    }
    if (item.type === 'audio') {
      const a = item.data;
      return `<div class="fav-item fav-audio" data-fav-open="${idx}">
        <div class="fav-item-type">🎙</div>
        <div class="fav-item-content">
          <div class="fav-item-title">${esc(a.title || '')}</div>
          <div class="fav-item-meta">${esc(item.collectionTitle)} • 📚 ${esc(item.lesson.title)}</div>
        </div>
        <button class="fav-item-remove" data-fav-remove="${idx}" data-fav-type-item="audio" title="حذف">✕</button>
      </div>`;
    }
    return '';
  }

  // ═══════════════════════════════════════════════════════════════════
  // ADMIN PANEL
  // ═══════════════════════════════════════════════════════════════════
  function renderAdminPanel() {
    const videosList = document.getElementById('adminVideoCollectionsList');
    const singlesList = document.getElementById('adminSingleVideosList');
    const audiosList = document.getElementById('adminAudioCollectionsList');
    const playlistsList = document.getElementById('adminPlaylistsList');

    const lesson = getLesson();
    if (!lesson) return;

    if (videosList) {
      const cols = (lesson.videos || []).filter(v => v.isCollection);
      videosList.innerHTML = cols.length ? cols.map(c => `
        <div class="admin-item-row">
          <div class="admin-item-info">
            <strong>${esc(c.title)}</strong>
            <small>📹 ${c.episodes.length} قسمت</small>
          </div>
          <div class="admin-item-actions">
            <button class="btn btn-sm" data-admin-edit-collection="video" data-collection-id="${esc(c.id)}">✏️</button>
            <button class="btn btn-sm" data-admin-add-episode="video" data-collection-id="${esc(c.id)}">➕</button>
            <button class="btn btn-sm btn-danger" data-admin-del-collection="video" data-collection-id="${esc(c.id)}">🗑</button>
          </div>
        </div>
        ${c.episodes.map(ep => `
          <div class="admin-item-row admin-sub-row">
            <div class="admin-item-info">
              <small>└ ${esc(ep.title)}</small>
            </div>
            <div class="admin-item-actions">
              <button class="btn btn-sm" data-admin-edit-episode="video" data-collection-id="${esc(c.id)}" data-episode-id="${esc(ep.id)}">✏️</button>
              <button class="btn btn-sm" data-admin-dialogue="video" data-collection-id="${esc(c.id)}" data-episode-id="${esc(ep.id)}">📝</button>
              <button class="btn btn-sm btn-danger" data-admin-del-episode="video" data-collection-id="${esc(c.id)}" data-episode-id="${esc(ep.id)}">🗑</button>
            </div>
          </div>
        `).join('')}
      `).join('') : '<div class="empty">هیچ مجموعه‌ای نیست</div>';
    }

    if (audiosList) {
      const cols = (lesson.audioCollections || []);
      audiosList.innerHTML = cols.length ? cols.map(c => `
        <div class="admin-item-row">
          <div class="admin-item-info">
            <strong>${esc(c.title)}</strong>
            <small>🎙 ${c.episodes.length} آدیو</small>
          </div>
          <div class="admin-item-actions">
            <button class="btn btn-sm" data-admin-edit-collection="audio" data-collection-id="${esc(c.id)}">✏️</button>
            <button class="btn btn-sm" data-admin-add-episode="audio" data-collection-id="${esc(c.id)}">➕</button>
            <button class="btn btn-sm btn-danger" data-admin-del-collection="audio" data-collection-id="${esc(c.id)}">🗑</button>
          </div>
        </div>
        ${c.episodes.map(ep => `
          <div class="admin-item-row admin-sub-row">
            <div class="admin-item-info">
              <small>└ ${esc(ep.title)}</small>
            </div>
            <div class="admin-item-actions">
              <button class="btn btn-sm" data-admin-edit-episode="audio" data-collection-id="${esc(c.id)}" data-episode-id="${esc(ep.id)}">✏️</button>
              <button class="btn btn-sm" data-admin-dialogue="audio" data-collection-id="${esc(c.id)}" data-episode-id="${esc(ep.id)}">📝</button>
              <button class="btn btn-sm btn-danger" data-admin-del-episode="audio" data-collection-id="${esc(c.id)}" data-episode-id="${esc(ep.id)}">🗑</button>
            </div>
          </div>
        `).join('')}
      `).join('') : '<div class="empty">هیچ آدیویی نیست</div>';
    }

    if (playlistsList) {
      const playlists = getPlaylists();
      playlistsList.innerHTML = playlists.length ? playlists.map(p => `
        <div class="admin-item-row">
          <div class="admin-item-info">
            <strong>${esc(p.name)}</strong>
            <small>🎵 ${p.items.length} آیتم</small>
          </div>
          <div class="admin-item-actions">
            <button class="btn btn-sm" data-admin-edit-playlist="${esc(p.id)}">✏️</button>
            <button class="btn btn-sm btn-danger" data-admin-del-playlist="${esc(p.id)}">🗑</button>
          </div>
        </div>
      `).join('') : '<div class="empty">هیچ پلی‌لیستی نیست</div>';
    }

    // bind
    document.querySelectorAll('[data-admin-edit-collection]').forEach(btn => {
      btn.addEventListener('click', () => openMediaCollectionModal(btn.dataset.adminEditCollection, btn.dataset.collectionId));
    });
    document.querySelectorAll('[data-admin-add-episode]').forEach(btn => {
      btn.addEventListener('click', () => openMediaEpisodeModal(btn.dataset.adminAddEpisode, btn.dataset.collectionId, null));
    });
    document.querySelectorAll('[data-admin-del-collection]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('حذف این مجموعه؟')) return;
        const type = btn.dataset.adminDelCollection;
        const id = btn.dataset.collectionId;
        const l = getLesson();
        if (type === 'video') l.videos = (l.videos || []).filter(v => v.id !== id);
        else l.audioCollections = (l.audioCollections || []).filter(c => c.id !== id);
        save(); renderAdminPanel(); renderAll();
        toast('حذف شد', 'success');
      });
    });
    document.querySelectorAll('[data-admin-edit-episode]').forEach(btn => {
      btn.addEventListener('click', () => openMediaEpisodeModal(btn.dataset.adminEditEpisode, btn.dataset.collectionId, btn.dataset.episodeId));
    });
    document.querySelectorAll('[data-admin-del-episode]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('حذف این قسمت؟')) return;
        const type = btn.dataset.adminDelEpisode;
        const cid = btn.dataset.collectionId;
        const eid = btn.dataset.episodeId;
        const l = getLesson();
        if (type === 'video') {
          const col = (l.videos || []).find(v => v.id === cid);
          if (col) col.episodes = col.episodes.filter(e => e.id !== eid);
        } else {
          const col = (l.audioCollections || []).find(c => c.id === cid);
          if (col) col.episodes = col.episodes.filter(e => e.id !== eid);
        }
        save(); renderAdminPanel(); renderAll();
        toast('حذف شد', 'success');
      });
    });
    document.querySelectorAll('[data-admin-dialogue]').forEach(btn => {
      btn.addEventListener('click', () => openDialogueModal(btn.dataset.adminDialogue, btn.dataset.collectionId, btn.dataset.episodeId));
    });
    document.querySelectorAll('[data-admin-edit-playlist]').forEach(btn => {
      btn.addEventListener('click', () => openPlaylistModal(btn.dataset.adminEditPlaylist));
    });
    document.querySelectorAll('[data-admin-del-playlist]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('حذف این پلی‌لیست؟')) return;
        state.playlists = state.playlists.filter(p => p.id !== btn.dataset.adminDelPlaylist);
        save(); renderAdminPanel();
        toast('حذف شد', 'success');
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER ALL
  // ═══════════════════════════════════════════════════════════════════
  function renderAll() {
    renderLessonSelect();
    renderStats();
    renderWordTable();
    renderArticleQuickFilters();
    renderFolders();
    renderContentTabs();
    renderContentGrid();
    renderCards();
    renderGrammar();
    if (document.getElementById('tab-verbs') && !document.getElementById('tab-verbs').classList.contains('hidden')) {
      renderVerbsTab();
    }
    if (document.getElementById('tab-favorites') && !document.getElementById('tab-favorites').classList.contains('hidden')) {
      renderFavoritesTab();
    }
    if (document.getElementById('tab-videos') && !document.getElementById('tab-videos').classList.contains('hidden')) {
      renderVideosHome();
    }
    if (document.getElementById('tab-audios') && !document.getElementById('tab-audios').classList.contains('hidden')) {
      renderAudiosHome();
    }
    if (document.getElementById('tab-playlists') && !document.getElementById('tab-playlists').classList.contains('hidden')) {
      renderPlaylistsHome();
    }
    if (document.getElementById('tab-admin') && !document.getElementById('tab-admin').classList.contains('hidden')) {
      renderAdminPanel();
    }
    populateLessonTargets();
    updateAppTitle();
    updateReviewBanner();
    updateDirectionLabel();
  }

  // ═══════════════════════════════════════════════════════════════════
  // BOOK / LESSON MODALS
  // ═══════════════════════════════════════════════════════════════════
  function openBookModal() {
    editingBookId = null;
    document.getElementById('bookModalTitle').textContent = '📚 کتاب جدید';
    document.getElementById('bookNameInput').value = '';
    document.getElementById('bookLevelInput').value = 'A1.1';
    document.getElementById('bookCoverInput').value = '';
    document.getElementById('saveBookBtn').textContent = '💾 ذخیره';
    document.getElementById('modalBook').classList.add('active');
    document.body.classList.add('locked');
  }
  function openEditBookModal(bookId) {
    const book = state.books.find(b => b.id === bookId);
    if (!book) return;
    editingBookId = bookId;
    document.getElementById('bookModalTitle').textContent = '✏️ ویرایش کتاب';
    document.getElementById('bookNameInput').value = book.name || '';
    document.getElementById('bookLevelInput').value = book.level || 'A1.1';
    document.getElementById('bookCoverInput').value = book.coverImage || '';
    document.getElementById('saveBookBtn').textContent = '💾 ذخیره تغییرات';
    document.getElementById('modalBook').classList.add('active');
    document.body.classList.add('locked');
  }
  function openLessonModal() {
    const b = getBook();
    if (!b) { toast('اول یه کتاب انتخاب کن', 'error'); return; }
    document.getElementById('lessonTitleInput').value = '';
    document.getElementById('modalLessonTitle').textContent = '➕ درس جدید';
    const saveBtn = document.getElementById('saveLessonBtn');
    saveBtn.textContent = '💾 ذخیره';
    delete saveBtn.dataset.editId;
    document.getElementById('modalLesson').classList.add('active');
    document.body.classList.add('locked');
    setTimeout(() => document.getElementById('lessonTitleInput').focus(), 100);
  }
  function openEditLessonModal() {
    const l = getLesson();
    if (!l) return;
    if (l.isSample) { toast('🔒 درس نمونه قابل ویرایش نیست', 'warning'); return; }
    document.getElementById('lessonTitleInput').value = l.title || '';
    document.getElementById('modalLessonTitle').textContent = '✏️ ویرایش نام درس';
    const saveBtn = document.getElementById('saveLessonBtn');
    saveBtn.textContent = '💾 ذخیره تغییرات';
    saveBtn.dataset.editId = l.id;
    document.getElementById('modalLesson').classList.add('active');
    document.body.classList.add('locked');
    setTimeout(() => { document.getElementById('lessonTitleInput').focus(); document.getElementById('lessonTitleInput').select(); }, 100);
  }

  // ═══════════════════════════════════════════════════════════════════
  // BIND EVENTS
  // ═══════════════════════════════════════════════════════════════════
  function bindEvents() {
    // tabs
    document.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => switchTab(t.dataset.tab));
    });
    document.getElementById('themeToggleLibrary')?.addEventListener('click', toggleTheme);
    document.getElementById('themeToggleMain')?.addEventListener('click', toggleTheme);

    // lesson select
    document.getElementById('lessonSelect')?.addEventListener('change', e => {
      if (practice.active) exitPractice();
      state.activeLessonId = e.target.value;
      currentContentType = 'all';
      save(); renderAll();
    });

    // lesson buttons
    document.getElementById('addLessonBtn')?.addEventListener('click', openLessonModal);
    document.getElementById('editLessonBtn')?.addEventListener('click', openEditLessonModal);
    document.getElementById('delLessonBtn')?.addEventListener('click', () => {
      const l = getLesson(), b = getBook();
      if (!l || !b) return;
      if (l.isSample) { toast('🔒 درس نمونه', 'error'); return; }
      if (b.lessons.length <= 1) {
        if (!confirm('تنها درس این کتابه. حذف بشه و یه درس خالی ساخته بشه؟')) return;
        const empty = { id: uid(), title: 'Lektion 1', words: [], stories: [], grammar: [], letters: [], dialogues: [], chats: [], verbs: [], videos: [], audioCollections: [], isSample: false };
        b.lessons = [empty];
        state.activeLessonId = empty.id;
        save(); renderAll(); populateLessonTargets();
        return;
      }
      if (!confirm(`⚠️ حذف «${l.title}»؟`)) return;
      const idx = b.lessons.findIndex(x => x.id === l.id);
      b.lessons = b.lessons.filter(x => x.id !== l.id);
      state.activeLessonId = b.lessons[Math.min(idx, b.lessons.length - 1)].id;
      save(); renderAll(); populateLessonTargets();
      toast('حذف شد', 'success');
    });
    document.getElementById('sortLessonsBtn')?.addEventListener('click', openLessonSortModal);
    document.getElementById('closeLessonSortBtn')?.addEventListener('click', closeLessonSortModal);

    // filters
    document.getElementById('searchBox')?.addEventListener('input', renderWordTable);
    document.getElementById('filterStatus')?.addEventListener('change', renderWordTable);
    document.getElementById('filterArticle')?.addEventListener('change', renderWordTable);
    document.getElementById('filterSpecial')?.addEventListener('change', renderWordTable);
    document.getElementById('cardSearch')?.addEventListener('input', renderCards);
    document.getElementById('cardFilter')?.addEventListener('change', renderCards);
    document.getElementById('cardArticleFilter')?.addEventListener('change', renderCards);
    document.getElementById('cardSpecialFilter')?.addEventListener('change', renderCards);
    document.getElementById('cardSortAlpha')?.addEventListener('click', () => { cardSortMode = 'alpha'; renderCards(); });
    document.getElementById('cardSortRandom')?.addEventListener('click', () => { cardSortMode = 'random'; renderCards(); });
    document.getElementById('cardSortStatus')?.addEventListener('click', () => { cardSortMode = 'status'; renderCards(); });

    // quick filter buttons
    document.querySelectorAll('.quick-filter-btn[data-qf]').forEach(btn => {
      btn.addEventListener('click', () => {
        const qf = btn.dataset.qf;
        const sel = document.getElementById('filterSpecial');
        if (sel) sel.value = qf;
        renderWordTable();
      });
    });

    // practice
    document.getElementById('startSrsBtn')?.addEventListener('click', () => startPractice('due'));
    document.getElementById('exitPractice')?.addEventListener('click', exitPractice);
    const flashcardStage = document.getElementById('flashcardStage');
    if (flashcardStage) flashcardStage.addEventListener('click', (e) => {
      if (e.target.closest('[data-de-speak]')) return;
      if (e.target.closest('.clickable-word')) return;
      const inner = document.getElementById('flashcardInner');
      inner.classList.toggle('flipped');
      if (inner.classList.contains('flipped')) {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        if (currentAudio) { try { currentAudio.pause(); } catch (e) { } currentAudio = null; }
      }
    });
    document.getElementById('fcSpeakBtn')?.addEventListener('click', () => {
      const w = practice.queue[practice.index];
      if (w) {
        const full = getFullGermanWord(w);
        speak(full, w.exAudio);
      }
    });
    document.querySelectorAll('[data-rate]').forEach(btn => {
      btn.addEventListener('click', () => rateCurrent(btn.dataset.rate));
    });
    document.getElementById('prevPracticeBtn')?.addEventListener('click', () => {
      if (!practice.active || practice.index === 0) return;
      practice.index--;
      const w = practice.queue[practice.index];
      const hadRating = practice.ratings && practice.ratings[practice.index];
      if (hadRating && w) { undoReviewWord(w); delete practice.ratings[practice.index]; }
      showCurrentPracticeCard(); renderStats();
    });
    document.getElementById('autoPlayToggle')?.addEventListener('click', toggleAutoPlay);
    document.getElementById('autoPlayToggleSession')?.addEventListener('click', toggleAutoPlay);
    document.getElementById('muteAudioBtn')?.addEventListener('click', () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (currentAudio) { try { currentAudio.pause(); } catch (e) { } currentAudio = null; }
      autoPlayWord = false;
      try { localStorage.setItem(AUTOPLAY_KEY, 'false'); } catch (e) { }
      updateAutoPlayUI();
      toast('🔇 صدا قطع شد', 'warning');
    });
    document.getElementById('flipDirectionBtn')?.addEventListener('click', togglePracticeDirection);
    document.getElementById('flipDirectionFolderBtn')?.addEventListener('click', togglePracticeDirection);
    document.getElementById('practiceFullscreenBtn')?.addEventListener('click', toggleTheaterMode);
    document.getElementById('practiceTheaterClose')?.addEventListener('click', exitTheaterMode);
    document.getElementById('practiceHamburgerBtn')?.addEventListener('click', () => {
      buildFolderMenu();
      document.getElementById('practiceFolderMenu').classList.remove('hidden');
    });
    document.getElementById('closeFolderMenuBtn')?.addEventListener('click', () => {
      document.getElementById('practiceFolderMenu').classList.add('hidden');
    });
    document.getElementById('resetPracticeSettingsBtn')?.addEventListener('click', resetPracticeSettings);

    // stories
    document.getElementById('addStoryBtn')?.addEventListener('click', () => {
      switchTab('manage-story');
      resetStoryForm();
    });
    document.getElementById('saveStoryBtn')?.addEventListener('click', saveStory);
    document.getElementById('cancelStoryEditBtn')?.addEventListener('click', resetStoryForm);
    document.getElementById('closeStoryReader')?.addEventListener('click', () => {
      document.getElementById('storyReaderModal').classList.remove('active');
      document.body.classList.remove('locked');
    });

    // save word
    document.getElementById('saveWordBtn')?.addEventListener('click', () => {
      const target = getLessonById(document.getElementById('wordTargetLesson').value);
      if (!target) { toast('درس مقصد', 'error'); return; }
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
        notes: [], status: 'new', heart: false, star: false, fire: false,
        srs: { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0, streak: 0 }
      });
      save();
      ['wDe', 'wPlural', 'wFa', 'wEx', 'wExMean', 'wExAudio', 'wNote'].forEach(id => {
        document.getElementById(id).value = '';
      });
      document.getElementById('wDe').focus();
      renderAll(); populateLessonTargets();
      toast(`✅ به «${target.title}» اضافه شد`, 'success');
    });

    // JSON import
    document.getElementById('importFullBookBtn')?.addEventListener('click', () => document.getElementById('fullBookFileInput').click());
    document.getElementById('replaceFullBookBtn')?.addEventListener('click', () => document.getElementById('replaceBookFileInput').click());
    document.getElementById('fullBookFileInput')?.addEventListener('change', e => {
      if (e.target.files[0]) importFullBook(e.target.files[0]);
      e.target.value = '';
    });
    document.getElementById('replaceBookFileInput')?.addEventListener('change', e => {
      if (e.target.files[0]) replaceFullBook(e.target.files[0]);
      e.target.value = '';
    });
    document.getElementById('exportFullBookBtn')?.addEventListener('click', exportBook);
    document.getElementById('exportAllBooksBtn')?.addEventListener('click', () => {
      exportData(state, `german-vocab-backup-${new Date().toISOString().slice(0, 10)}.json`);
      toast('دانلود شد', 'success');
    });
    document.getElementById('importJsonBtn')?.addEventListener('click', importJsonWords);
    document.getElementById('validateJsonBtn')?.addEventListener('click', validateJson);
    document.getElementById('clearJsonBtn')?.addEventListener('click', () => {
      document.getElementById('jsonInput').value = '';
      document.getElementById('jsonPreview').innerHTML = '';
    });
    document.getElementById('exportLessonBtn')?.addEventListener('click', exportLesson);
    document.getElementById('exportBadBtn')?.addEventListener('click', exportBad);
    document.getElementById('exportHeartBtn')?.addEventListener('click', exportHeart);
    document.getElementById('exportStarBtn')?.addEventListener('click', exportStar);
    document.getElementById('exportFireBtn')?.addEventListener('click', exportFire);
    document.getElementById('exportAllBtn')?.addEventListener('click', () => {
      exportData(state, `german-vocab-backup-${new Date().toISOString().slice(0, 10)}.json`);
      toast('دانلود شد', 'success');
    });
    document.getElementById('backupAllBtn')?.addEventListener('click', () => {
      exportData(state, `german-vocab-backup-${new Date().toISOString().slice(0, 10)}.json`);
      toast('دانلود شد', 'success');
    });
    document.getElementById('resetBtn')?.addEventListener('click', () => {
      if (!confirm('همه داده‌ها ریست بشن؟')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { }
      LEGACY_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
      state = defaultData();
      save(); renderAll();
      toast('ریست شد', 'success');
    });

    // delete book
    document.getElementById('cancelDeleteBookBtn')?.addEventListener('click', () => {
      document.getElementById('modalDeleteBook').classList.remove('active');
      document.body.classList.remove('locked');
    });
    document.getElementById('delBookConfirmInput')?.addEventListener('input', () => {
      const b = getBook(); if (!b) return;
      document.getElementById('confirmDeleteBookBtn').disabled = document.getElementById('delBookConfirmInput').value.trim() !== b.name;
    });
    document.getElementById('confirmDeleteBookBtn')?.addEventListener('click', () => {
      const b = getBook(); if (!b) return;
      if (document.getElementById('delBookConfirmInput').value.trim() !== b.name) { toast('نام مطابقت ندارد', 'error'); return; }
      state.books = state.books.filter(x => x.id !== b.id);
      state.activeBookId = state.books[0]?.id || null;
      state.activeLessonId = getBook()?.lessons[0]?.id || null;
      save();
      document.getElementById('modalDeleteBook').classList.remove('active');
      document.body.classList.remove('locked');
      if (!state.books.length) showBookLibrary();
      else { renderAll(); populateLessonTargets(); }
      toast('حذف شد', 'success');
    });

    // close modals
    document.querySelectorAll('.modal-overlay').forEach(m => {
      m.addEventListener('click', e => {
        if (e.target === m) { m.classList.remove('active'); document.body.classList.remove('locked'); }
      });
    });
    document.getElementById('wordViewModal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) { e.currentTarget.classList.remove('active'); document.body.classList.remove('locked'); }
    });
    document.getElementById('wordEditModal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) { e.currentTarget.classList.remove('active'); document.body.classList.remove('locked'); }
    });

    document.getElementById('closeGrammarExplainBtn')?.addEventListener('click', () => {
      document.getElementById('modalGrammarExplain').classList.remove('active');
      document.body.classList.remove('locked');
    });

    // book modal
    document.getElementById('cancelBookBtn')?.addEventListener('click', () => {
      document.getElementById('modalBook').classList.remove('active');
      document.body.classList.remove('locked');
      editingBookId = null;
    });
    document.getElementById('cancelLessonBtn')?.addEventListener('click', () => {
      document.getElementById('modalLesson').classList.remove('active');
      document.body.classList.remove('locked');
      delete document.getElementById('saveLessonBtn').dataset.editId;
    });
    document.getElementById('saveBookBtn')?.addEventListener('click', () => {
      const name = document.getElementById('bookNameInput').value.trim();
      const level = document.getElementById('bookLevelInput').value;
      const coverImage = safeImageSrc(document.getElementById('bookCoverInput').value.trim());
      if (!name) { toast('نام لازمه', 'error'); return; }
      if (editingBookId) {
        const book = state.books.find(b => b.id === editingBookId);
        if (!book) return;
        book.name = name; book.level = level; book.coverImage = coverImage;
        save();
        document.getElementById('modalBook').classList.remove('active');
        document.body.classList.remove('locked');
        editingBookId = null;
        renderBookLibrary();
        toast('✅ ویرایش شد', 'success');
      } else {
        const nb = { id: uid(), name, level, coverImage, lessons: [] };
        ensureSampleLesson(nb);
        state.books.push(nb);
        state.activeBookId = nb.id;
        state.activeLessonId = nb.lessons[0].id;
        save();
        document.getElementById('modalBook').classList.remove('active');
        document.body.classList.remove('locked');
        renderBookLibrary();
        toast('✅ اضافه شد', 'success');
      }
    });

    document.getElementById('saveLessonBtn')?.addEventListener('click', () => {
      const title = document.getElementById('lessonTitleInput').value.trim();
      if (!title) { toast('عنوان لازمه', 'error'); return; }
      const b = getBook(); if (!b) return;
      const saveBtn = document.getElementById('saveLessonBtn');
      const editId = saveBtn.dataset.editId;
      if (editId) {
        const target = b.lessons.find(x => x.id === editId);
        if (!target || target.isSample) return;
        target.title = title;
        save();
        delete saveBtn.dataset.editId;
        document.getElementById('modalLesson').classList.remove('active');
        document.body.classList.remove('locked');
        renderAll(); populateLessonTargets();
        toast('✅ ویرایش شد', 'success');
        return;
      }
      const nl = { id: uid(), title, words: [], stories: [], grammar: [], letters: [], dialogues: [], chats: [], verbs: [], videos: [], audioCollections: [], isSample: false };
      b.lessons.push(nl);
      state.activeLessonId = nl.id;
      save();
      document.getElementById('modalLesson').classList.remove('active');
      document.body.classList.remove('locked');
      renderAll(); populateLessonTargets();
      toast('✅ درس اضافه شد', 'success');
    });
    document.getElementById('lessonTitleInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('saveLessonBtn').click(); }
    });

    // library
    document.getElementById('libraryAddBookBtn')?.addEventListener('click', openBookModal);
    document.getElementById('libraryImportBtn')?.addEventListener('click', openLibraryImportModal);
    document.getElementById('backToLibraryBtn')?.addEventListener('click', showBookLibrary);
    document.getElementById('changeBookBtn')?.addEventListener('click', openBookPicker);
    document.getElementById('globalSearchBtn')?.addEventListener('click', openGlobalSearch);
    document.getElementById('closeGlobalSearchBtn')?.addEventListener('click', closeGlobalSearch);
    document.getElementById('globalSearchInput')?.addEventListener('input', e => searchAllWords(e.target.value));
    document.getElementById('closeBookPickerBtn')?.addEventListener('click', closeBookPicker);
    document.getElementById('bookPickerAddBtn')?.addEventListener('click', () => { closeBookPicker(); openBookModal(); });
    document.getElementById('bookPickerImportBtn')?.addEventListener('click', () => { closeBookPicker(); openLibraryImportModal(); });
    document.getElementById('cancelLibraryImportBtn')?.addEventListener('click', closeLibraryImportModal);

    // lib import
    document.getElementById('libImportFileCard')?.addEventListener('click', () => document.getElementById('libImportFileInput').click());
    document.getElementById('libImportFileInput')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          processLibraryImportData(data, file.name);
        } catch (err) { toast('❌ ' + err.message, 'error'); }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
    document.getElementById('libImportUrlCard')?.addEventListener('click', () => {
      document.getElementById('libImportUrlBox').classList.remove('hidden');
      document.getElementById('libImportPasteBox').classList.add('hidden');
    });
    document.getElementById('libImportUrlFetchBtn')?.addEventListener('click', () => {
      const url = document.getElementById('libImportUrlInput').value.trim();
      const status = document.getElementById('libImportUrlStatus');
      if (!url) { status.innerHTML = `<div style="color:var(--danger);">آدرس لازمه</div>`; return; }
      status.innerHTML = `<div style="color:var(--info);">⏳...</div>`;
      fetch(url).then(r => r.text()).then(text => {
        try {
          const data = JSON.parse(text);
          processLibraryImportData(data, url.split('/').pop() || 'book.json');
        } catch (err) {
          status.innerHTML = `<div style="color:var(--danger);">❌ ${esc(err.message)}</div>`;
        }
      }).catch(err => {
        status.innerHTML = `<div style="color:var(--danger);">❌ ${esc(err.message)}<br><small>ممکنه CORS باشه</small></div>`;
      });
    });
    document.getElementById('libImportUrlCancelBtn')?.addEventListener('click', () => document.getElementById('libImportUrlBox').classList.add('hidden'));
    document.getElementById('libImportPasteCard')?.addEventListener('click', () => {
      document.getElementById('libImportPasteBox').classList.remove('hidden');
      document.getElementById('libImportUrlBox').classList.add('hidden');
    });
    document.getElementById('libImportPasteAddBtn')?.addEventListener('click', () => {
      const raw = document.getElementById('libImportPasteInput').value.trim();
      const status = document.getElementById('libImportPasteStatus');
      if (!raw) { status.innerHTML = `<div style="color:var(--danger);">JSON خالیه</div>`; return; }
      try {
        const data = JSON.parse(raw);
        processLibraryImportData(data, 'pasted.json');
      } catch (e) { status.innerHTML = `<div style="color:var(--danger);">❌ ${esc(e.message)}</div>`; }
    });
    document.getElementById('libImportPasteCancelBtn')?.addEventListener('click', () => document.getElementById('libImportPasteBox').classList.add('hidden'));

    // import book popup
    document.getElementById('importAsNewBookBtn')?.addEventListener('click', chooseImportAsNewBook);
    document.getElementById('importAsReplaceBtn')?.addEventListener('click', chooseImportAsReplace);
    document.getElementById('cancelImportBookBtn')?.addEventListener('click', closeImportBookPopup);
    document.getElementById('confirmNewBookBtn')?.addEventListener('click', confirmNewBookFromImport);
    document.getElementById('cancelNewBookBtn')?.addEventListener('click', () => {
      document.getElementById('modalNewBookFromImport').classList.remove('active');
      document.body.classList.remove('locked');
      closeImportBookPopup();
    });
    document.getElementById('confirmReplaceBookBtn')?.addEventListener('click', confirmReplaceBook);
    document.getElementById('cancelReplaceBookBtn')?.addEventListener('click', () => {
      document.getElementById('modalReplaceTargetBook').classList.remove('active');
      document.body.classList.remove('locked');
      closeImportBookPopup();
    });

    // favorites
    document.querySelectorAll('[data-fav-level]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentFavLevel = btn.dataset.favLevel;
        try { localStorage.setItem(FAV_LEVEL_KEY, currentFavLevel); } catch (e) { }
        renderFavoritesTab();
      });
    });
    document.querySelectorAll('[data-fav-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentFavType = btn.dataset.favType;
        try { localStorage.setItem(FAV_TYPE_KEY, currentFavType); } catch (e) { }
        renderFavoritesTab();
      });
    });
    document.getElementById('favSearch')?.addEventListener('input', () => renderFavoritesTab());
    document.getElementById('favLessonFilter')?.addEventListener('change', () => renderFavoritesTab());
    document.getElementById('favPracticeBtn')?.addEventListener('click', () => {
      if (!practice.active) startPractice(currentFavLevel);
    });
    document.getElementById('favExportBtn')?.addEventListener('click', () => {
      if (currentFavLevel === 'heart') exportHeart();
      else if (currentFavLevel === 'star') exportStar();
      else exportFire();
    });

    // videos / audios
    document.getElementById('addVideoCollectionBtn')?.addEventListener('click', () => openMediaCollectionModal('video', null));
    document.getElementById('addSingleVideoBtn')?.addEventListener('click', () => openMediaEpisodeModal('video', null, null));
    document.getElementById('addAudioCollectionBtn')?.addEventListener('click', () => openMediaCollectionModal('audio', null));
    document.getElementById('addSingleAudioBtn')?.addEventListener('click', () => openMediaEpisodeModal('audio', null, null));
    document.getElementById('videoCollectionSortBtn')?.addEventListener('click', () => toast('مرتب‌سازی — به‌زودی', 'info'));
    document.getElementById('audioCollectionSortBtn')?.addEventListener('click', () => toast('مرتب‌سازی — به‌زودی', 'info'));

    // fire audios list
    document.getElementById('fireAudiosListBtn')?.addEventListener('click', () => {
      const list = document.getElementById('fireAudiosListBox');
      if (!list) return;
      const fireAudios = getAllFireAudios();
      if (!fireAudios.length) {
        list.innerHTML = '<div class="empty">آدیو 🔥 نداری</div>';
      } else {
        list.innerHTML = fireAudios.map(a => `
          <div class="media-episode-row is-fire" data-fire-audio-open="${esc(a.id)}" data-collection-id="${esc(a._collectionId)}">
            <div class="media-episode-info">
              <div class="media-episode-title">${esc(a.title)}</div>
              <div class="media-episode-meta">${esc(a._collectionTitle)}</div>
            </div>
            <button class="btn btn-sm btn-primary">▶</button>
          </div>
        `).join('');
        list.querySelectorAll('[data-fire-audio-open]').forEach(el => {
          el.addEventListener('click', () => {
            document.getElementById('modalFireAudiosList').classList.remove('active');
            document.body.classList.remove('locked');
            playAudioEpisode(el.dataset.fireAudioOpen, el.dataset.collectionId);
          });
        });
      }
      document.getElementById('modalFireAudiosList').classList.add('active');
      document.body.classList.add('locked');
    });
    document.getElementById('closeFireAudiosListBtn')?.addEventListener('click', () => {
      document.getElementById('modalFireAudiosList').classList.remove('active');
      document.body.classList.remove('locked');
    });

    // playlists
    document.getElementById('addPlaylistBtn')?.addEventListener('click', () => openPlaylistModal(null));
    document.getElementById('adminAddPlaylistBtn')?.addEventListener('click', () => openPlaylistModal(null));

    // playlist modal buttons
    document.getElementById('savePlaylistBtn')?.addEventListener('click', savePlaylist);
    document.getElementById('cancelPlaylistBtn')?.addEventListener('click', () => {
      document.getElementById('modalPlaylist').classList.remove('active');
      document.body.classList.remove('locked');
    });

    // add to playlist
    document.getElementById('createPlaylistFromModal')?.addEventListener('click', () => {
      const name = document.getElementById('newPlaylistNameFromModal').value.trim();
      if (!name) { toast('نام لازمه', 'error'); return; }
      if (!Array.isArray(state.playlists)) state.playlists = [];
      state.playlists.push({ id: uid(), name, coverImage: '', coverColor: '#a855f7', items: [] });
      save();
      document.getElementById('newPlaylistNameFromModal').value = '';
      const item = JSON.parse(document.getElementById('modalAddToPlaylist').dataset.pendingItem || '{}');
      openAddToPlaylistModal(item);
      toast('✅ ساخته شد', 'success');
    });
    document.getElementById('confirmAddToPlaylistBtn')?.addEventListener('click', () => {
      const modal = document.getElementById('modalAddToPlaylist');
      const item = JSON.parse(modal.dataset.pendingItem || '{}');
      const checks = document.querySelectorAll('.playlist-check:checked');
      const selectedIds = Array.from(checks).map(c => c.value);
      selectedIds.forEach(pid => {
        const p = getPlaylist(pid);
        if (!p) return;
        p.items.push({
          id: uid(),
          mediaType: item.mediaType || 'audio',
          sourceType: 'episode',
          title: item.title,
          audioUrl: item.audioUrl || '',
          videoUrl: item.videoUrl || '',
          coverImage: item.coverImage || '',
          duration: item.duration || '',
          collectionId: item.collectionId || null,
          episodeId: item.episodeId || null
        });
      });
      save();
      modal.classList.remove('active');
      document.body.classList.remove('locked');
      toast(`✅ به ${selectedIds.length} پلی‌لیست اضافه شد`, 'success');
    });
    document.getElementById('cancelAddToPlaylistBtn')?.addEventListener('click', () => {
      document.getElementById('modalAddToPlaylist').classList.remove('active');
      document.body.classList.remove('locked');
    });

    // media modals
    document.getElementById('saveMediaCollectionBtn')?.addEventListener('click', saveMediaCollection);
    document.getElementById('cancelMediaCollectionBtn')?.addEventListener('click', () => {
      document.getElementById('modalMediaCollection').classList.remove('active');
      document.body.classList.remove('locked');
    });
    document.getElementById('saveMediaEpisodeBtn')?.addEventListener('click', saveMediaEpisode);
    document.getElementById('cancelMediaEpisodeBtn')?.addEventListener('click', () => {
      document.getElementById('modalMediaEpisode').classList.remove('active');
      document.body.classList.remove('locked');
    });
    document.querySelectorAll('input[name="mediaSourceType"]').forEach(r => {
      r.addEventListener('change', () => {
        const urlBox = document.getElementById('mediaUrlBox');
        const uploadBox = document.getElementById('mediaUploadBox');
        if (r.value === 'url' && r.checked) {
          urlBox?.classList.remove('hidden');
          uploadBox?.classList.add('hidden');
        } else if (r.value === 'upload' && r.checked) {
          urlBox?.classList.add('hidden');
          uploadBox?.classList.remove('hidden');
        }
      });
    });
    document.getElementById('addDialogueLineBtn')?.addEventListener('click', addDialogueLine);
    document.getElementById('closeDialogueModalBtn')?.addEventListener('click', () => {
      document.getElementById('modalDialogue').classList.remove('active');
      document.body.classList.remove('locked');
    });

    // admin tabs
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden'));
        const target = btn.dataset.adminTab;
        const panelMap = {
          videos: 'adminVideosPanel',
          audios: 'adminAudiosPanel',
          playlists: 'adminPlaylistsPanel',
          export: 'adminExportPanel'
        };
        const panel = document.getElementById(panelMap[target]);
        if (panel) panel.classList.remove('hidden');
        if (target === 'export') {
          const out = document.getElementById('adminJsonOutput');
          if (out) out.value = JSON.stringify(state, null, 2);
        }
      });
    });
    document.getElementById('adminAddVideoCollectionBtn')?.addEventListener('click', () => openMediaCollectionModal('video', null));
    document.getElementById('adminAddSingleVideoBtn')?.addEventListener('click', () => openMediaEpisodeModal('video', null, null));
    document.getElementById('adminAddAudioCollectionBtn')?.addEventListener('click', () => openMediaCollectionModal('audio', null));
    document.getElementById('adminAddSingleAudioBtn')?.addEventListener('click', () => openMediaEpisodeModal('audio', null, null));
    document.getElementById('adminExportVideosBtn')?.addEventListener('click', () => {
      const l = getLesson();
      if (!l) return;
      exportData(l.videos || [], `videos-${l.title}-${Date.now()}.json`);
    });
    document.getElementById('adminExportAudiosBtn')?.addEventListener('click', () => {
      const l = getLesson();
      if (!l) return;
      exportData(l.audioCollections || [], `audios-${l.title}-${Date.now()}.json`);
    });
    document.getElementById('adminExportPlaylistsBtn')?.addEventListener('click', () => {
      exportData(state.playlists || [], `playlists-${Date.now()}.json`);
    });
    document.getElementById('adminExportAllBtn')?.addEventListener('click', () => {
      exportData(state, `german-vocab-backup-${new Date().toISOString().slice(0, 10)}.json`);
      toast('دانلود شد', 'success');
    });
    document.getElementById('adminExportLessonBtn')?.addEventListener('click', exportLesson);
    document.getElementById('adminExportBookBtn')?.addEventListener('click', exportBook);
    document.getElementById('adminCopyJsonBtn')?.addEventListener('click', () => {
      const out = document.getElementById('adminJsonOutput');
      if (out) {
        out.select();
        document.execCommand('copy');
        toast('📋 کپی شد', 'success');
      }
    });

    // setup
    setupFileDropZone();
    setupTouchDragForLessons();
    setupStickyPlayerEvents();
    setupFAB();

    // keyboard
    document.addEventListener('keydown', e => {
      const target = e.target;
      const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
        document.getElementById('storyReaderModal')?.classList.remove('active');
        document.getElementById('wordViewModal')?.classList.remove('active');
        document.getElementById('wordEditModal')?.classList.remove('active');
        document.getElementById('wordTooltipModal')?.classList.remove('active');
        if (practice.active) exitPractice();
        if (document.body.classList.contains('practice-theater')) exitTheaterMode();
        document.getElementById('practiceFolderMenu')?.classList.add('hidden');
        closeFABPanel();
        document.body.classList.remove('locked');
      }
      if (e.key === ' ' && practice.active && !isTyping) {
        e.preventDefault();
        const inner = document.getElementById('flashcardInner');
        if (!inner) return;
        inner.classList.toggle('flipped');
        if (inner.classList.contains('flipped')) {
          if (window.speechSynthesis) window.speechSynthesis.cancel();
          if (currentAudio) { try { currentAudio.pause(); } catch (e) { } currentAudio = null; }
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════
  function init() {
    applyTheme(currentTheme);
    state = load();
    if (!state.lastLessonByBook) state.lastLessonByBook = {};
    if (!Array.isArray(state.quizHistory)) state.quizHistory = [];
    if (!Array.isArray(state.articleHistory)) state.articleHistory = [];
    if (!Array.isArray(state.playlists)) state.playlists = [];
    if (!Array.isArray(state.videos)) state.videos = [];
    if (!Array.isArray(state.audioCollections)) state.audioCollections = [];

    if (!state.activeBookId && state.books.length) state.activeBookId = state.books[0].id;
    const b = getBook();
    if (b && b.lessons.length) {
      const saved = state.lastLessonByBook[state.activeBookId];
      if (saved && b.lessons.find(l => l.id === saved)) state.activeLessonId = saved;
      else if (!state.activeLessonId || !b.lessons.find(l => l.id === state.activeLessonId)) state.activeLessonId = b.lessons[0].id;
    }

    state.books.forEach(bk => {
      if (!Array.isArray(bk.lessons) || !bk.lessons.length) ensureSampleLesson(bk);
      const samples = bk.lessons.filter(l => l.isSample);
      if (samples.length > 1) {
        const firstSample = samples[0];
        bk.lessons = bk.lessons.filter(l => !l.isSample || l === firstSample);
      }
      bk.lessons.forEach(l => {
        if (!Array.isArray(l.words)) l.words = [];
        if (!Array.isArray(l.stories)) l.stories = [];
        if (!Array.isArray(l.grammar)) l.grammar = [];
        if (!Array.isArray(l.letters)) l.letters = [];
        if (!Array.isArray(l.dialogues)) l.dialogues = [];
        if (!Array.isArray(l.chats)) l.chats = [];
        if (!Array.isArray(l.verbs)) l.verbs = [];
        if (!Array.isArray(l.videos)) l.videos = [];
        if (!Array.isArray(l.audioCollections)) l.audioCollections = [];
        if (!Array.isArray(l.exercises)) l.exercises = [];
        l.words.forEach(w => {
          if (!w.status) w.status = normalizeStatus(w);
          if (!Array.isArray(w.notes)) w.notes = [];
          if (!Array.isArray(w.synonyms)) w.synonyms = [];
          if (!Array.isArray(w.related)) w.related = [];
          if (!Array.isArray(w.extraExamples)) w.extraExamples = [];
          if (!Array.isArray(w.collocations)) w.collocations = [];
          if (!Array.isArray(w.commonMistakes)) w.commonMistakes = [];
          if (!Array.isArray(w.contextExamples)) w.contextExamples = [];
          if (!Array.isArray(w.videos)) w.videos = [];
          if (!Array.isArray(w.audios)) w.audios = [];
          if (!w.forms) w.forms = {};
          if (typeof w.heart !== 'boolean') w.heart = false;
          if (typeof w.star !== 'boolean') w.star = false;
          if (typeof w.fire !== 'boolean') w.fire = false;
          ensureSrs(w);
        });
      });
    });

    save();
    bindEvents();
    renderAll();
    populateLessonTargets();
    updateAutoPlayUI();
    updateAutoPlayQuizUI();
    updateDirectionLabel();

    const activeBook = getBook();
    if (activeBook && state.activeLessonId && activeBook.lessons.find(l => l.id === state.activeLessonId)) {
      showMainApp();
    } else {
      showBookLibrary();
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // SERVICE WORKER
  // ═══════════════════════════════════════════════════════════════════
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js')
        .then(reg => console.log('✅ SW registered:', reg.scope))
        .catch(err => console.warn('❌ SW failed:', err));
    });
  }

  init();
})();