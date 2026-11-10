(function () {
    'use strict';

    const STORAGE_KEY = 'german-vocab-pro-v1';
    const LEGACY_KEYS = ['german-vocab-v2', 'german_vocab_app_data_v11', 'german-vocab-pro'];
    const AUTOPLAY_KEY = 'german-vocab-autoplay';

    let state = { books: [], activeBookId: null, activeLessonId: null };
    let practice = { active: false, queue: [], index: 0, ratings: {} };
    let quiz = { active: false, questions: [], index: 0, results: [] };
    let storyEditId = null;
    let currentStoryId = null;
    let repeatMode = 0;
    let repeatCounter = 0;
    let currentDetailWord = null;
    let cardSortMode = 'alpha';
    let currentAudio = null;
    let editingBookId = null;
    let pendingBookData = null;

    let autoPlayWord = true;
    try {
        const saved = localStorage.getItem(AUTOPLAY_KEY);
        if (saved !== null) autoPlayWord = saved === 'true';
    } catch (e) { }

    function uid() { return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }
    function toast(msg, type) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.className = 'toast show ' + (type || '');
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.remove('show'), 2800);
    }

    function speak(text, audioUrl) {
        if (currentAudio) {
            try { currentAudio.pause(); currentAudio.currentTime = 0; } catch (e) { }
            currentAudio = null;
        }
        window.speechSynthesis.cancel();

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
            } catch (e) { console.warn(e); }
        }
        speakTTS(text);
    }

    function speakTTS(text) {
        if (!('speechSynthesis' in window)) { toast('مرورگر تلفظ پشتیبانی نمی‌کند', 'error'); return; }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'de-DE';
        u.rate = 0.9;
        window.speechSynthesis.speak(u);
    }

    function articleClass(a) {
        if (['der', 'die', 'das'].includes(a)) return a;
        if (a === 'Verb') return 'verb';
        if (a === 'Adj' || a === 'Adv') return 'adj';
        return '';
    }
    function getWordType(w) {
        const art = w.art || '–';
        if (art === 'der' || art === 'die' || art === 'das') return { type: 'noun', label: 'اسم', icon: '📦' };
        if (art === 'Verb') return { type: 'verb', label: 'فعل', icon: '⚡' };
        if (art === 'Adj') return { type: 'adj', label: 'صفت', icon: '🎨' };
        if (art === 'Adv') return { type: 'adj', label: 'قید', icon: '💫' };
        return { type: 'other', label: 'نامشخص', icon: '❓' };
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
    function fmtTime(sec) {
        if (!isFinite(sec) || sec < 0) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }
    function normalizeStatus(w) {
        if (!w.status) {
            if (w.srs && w.srs.box >= 4) return 'good';
            if (w.srs && w.srs.box >= 2) return 'learning';
            return 'new';
        }
        return w.status;
    }
    function shuffle(a) {
        a = a.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function updateAutoPlayUI() {
        const toggle1 = document.getElementById('autoPlayToggle');
        const toggle2 = document.getElementById('autoPlayToggleSession');
        const label1 = document.getElementById('autoPlayLabel');
        const label2 = document.getElementById('autoPlayLabelSession');
        if (toggle1) toggle1.classList.toggle('on', autoPlayWord);
        if (toggle2) toggle2.classList.toggle('on', autoPlayWord);
        if (label1) label1.textContent = autoPlayWord ? '🔊 پخش خودکار: روشن' : '🔇 پخش خودکار: خاموش';
        if (label2) label2.textContent = autoPlayWord ? '🔊' : '🔇';
    }
    function toggleAutoPlay() {
        autoPlayWord = !autoPlayWord;
        try { localStorage.setItem(AUTOPLAY_KEY, String(autoPlayWord)); } catch (e) { }
        updateAutoPlayUI();
        toast(autoPlayWord ? '🔊 پخش خودکار روشن شد' : '🔇 پخش خودکار خاموش شد', autoPlayWord ? 'success' : 'warning');
    }

    function normalizeWord(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const de = (raw.de || raw.word || raw.german || raw.Wort || raw.Deutsch || '').toString().trim();
        const fa = (raw.fa || raw.mean || raw.persian || raw.translation || raw.Bedeutung || raw.Farsi || '').toString().trim();
        if (!de || !fa) return null;
        return {
            id: raw.id || uid(),
            de,
            art: (raw.art || raw.article || raw.Artikel || '–').toString(),
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
    function normalizeStory(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const title = (raw.title || raw.name || '').toString().trim();
        if (!title) return null;
        let sentences = raw.sentences || raw.lines || [];
        if (typeof sentences === 'string') {
            sentences = sentences.split(/\r?\n/).filter(Boolean).map(line => {
                const sep = line.indexOf('|');
                if (sep < 1) return null;
                return { de: line.slice(0, sep).trim(), fa: line.slice(sep + 1).trim() };
            }).filter(Boolean);
        }
        sentences = (sentences || []).map(s => {
            if (typeof s === 'string') {
                const sep = s.indexOf('|');
                if (sep < 1) return null;
                return { de: s.slice(0, sep).trim(), fa: s.slice(sep + 1).trim() };
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
    function normalizeLesson(raw, fallbackTitle) {
        if (!raw) return null;
        if (Array.isArray(raw)) {
            return { id: uid(), title: fallbackTitle || 'درس', words: raw.map(normalizeWord).filter(Boolean), stories: [] };
        }
        if (typeof raw !== 'object') return null;
        return {
            id: raw.id || uid(),
            title: (raw.title || raw.name || fallbackTitle || 'درس').toString(),
            words: Array.isArray(raw.words) ? raw.words.map(normalizeWord).filter(Boolean) : [],
            stories: Array.isArray(raw.stories) ? raw.stories.map(normalizeStory).filter(Boolean) : []
        };
    }
    function normalizeBook(raw, fallbackName) {
        if (!raw || typeof raw !== 'object') return null;
        return {
            id: raw.id || uid(),
            name: (raw.name || raw.title || fallbackName || 'کتاب').toString(),
            level: (raw.level || 'A1.1').toString(),
            coverImage: (raw.coverImage || raw.cover || raw.image || '').toString(),
            lessons: Array.isArray(raw.lessons) ? raw.lessons.map((l, i) => normalizeLesson(l, 'درس ' + (i + 1))).filter(Boolean) : []
        };
    }

    function defaultData() {
        return {
            books: [{
                id: uid(), name: 'Menschen', level: 'A1.1', coverImage: '',
                lessons: [{
                    id: uid(), title: 'Lektion 1', stories: [],
                    words: [
                        { id: uid(), de: 'Name', art: 'der', plural: 'Namen', fa: 'نام', ex: 'Mein Name ist Ali.', exMean: 'نام من علی است.', status: 'new', notes: [], srs: { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0 } }
                    ]
                }]
            }],
            activeBookId: null,
            activeLessonId: null
        };
    }

    function tryMigrateLegacy() {
        const currentRaw = localStorage.getItem(STORAGE_KEY);
        if (currentRaw) {
            try {
                const d = JSON.parse(currentRaw);
                if (d && Array.isArray(d.books) && d.books.length) return d;
            } catch (e) { }
        }
        for (const key of LEGACY_KEYS) {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            try {
                const data = JSON.parse(raw);
                const migrated = migrateFromLegacy(data);
                if (migrated && migrated.books.length) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
                    return migrated;
                }
            } catch (e) { console.warn('[Migration]', e); }
        }
        return null;
    }
    function migrateFromLegacy(data) {
        if (data.books && Array.isArray(data.books)) {
            const books = data.books.map(b => normalizeBook(b)).filter(Boolean);
            const result = {
                books,
                activeBookId: data.activeBookId || (books[0] && books[0].id),
                activeLessonId: data.activeLessonId || (books[0] && books[0].lessons[0] && books[0].lessons[0].id)
            };
            if (!result.books.find(b => b.id === result.activeBookId)) result.activeBookId = result.books[0]?.id || null;
            const ab = result.books.find(b => b.id === result.activeBookId);
            if (ab && !ab.lessons.find(l => l.id === result.activeLessonId)) result.activeLessonId = ab.lessons[0]?.id || null;
            return result;
        }
        const books = [];
        if (typeof data === 'object' && data !== null) {
            const specialKeys = ['activeBookId', 'activeLessonId', 'books'];
            const realBooks = Object.keys(data).filter(k => !specialKeys.includes(k) && typeof data[k] === 'object');
            realBooks.forEach(bookName => {
                const lessonsData = data[bookName];
                if (!lessonsData || typeof lessonsData !== 'object') return;
                const lessons = [];
                if (Array.isArray(lessonsData.lessons)) {
                    lessonsData.lessons.forEach((l, i) => {
                        const nl = normalizeLesson(l, 'درس ' + (i + 1));
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
        return { books, activeBookId: books[0].id, activeLessonId: books[0].lessons[0]?.id || null };
    }
    function load() {
        const migrated = tryMigrateLegacy();
        if (migrated) return migrated;
        const d = defaultData();
        d.activeBookId = d.books[0].id;
        d.activeLessonId = d.books[0].lessons[0].id;
        return d;
    }
    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
        catch (e) { console.error(e); }
    }

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
    function getWords() { const l = getLesson(); return l ? l.words : []; }
    function getStories() { const l = getLesson(); return l ? l.stories : []; }

    const SRS_INTERVALS = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };
    function ensureSrs(w) {
        if (!w.srs) w.srs = { box: 1, nextReview: Date.now(), correctCount: 0, wrongCount: 0 };
        return w.srs;
    }
    function reviewWord(w, rating) {
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
    function undoReviewWord(w) {
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

    function highlightExample(sentenceDe, wordDe) {
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

    /* ============ BOOK LIBRARY ============ */
    function showBookLibrary() {
        document.getElementById('bookLibraryScreen').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
        document.body.classList.remove('locked');
        renderBookLibrary();
    }
    function showMainApp() {
        document.getElementById('bookLibraryScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        updateAppTitle();
        renderAll();
    }

    function renderBookLibrary() {
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
      <button class="book-card-edit" data-lib-edit="${esc(book.id)}" title="ویرایش کتاب">✏️</button>
      <button class="book-card-delete" data-lib-del="${esc(book.id)}" title="حذف کتاب">🗑</button>
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
                if (e.target.closest('[data-lib-del]') || e.target.closest('[data-lib-edit]')) return;
                openBook(card.dataset.bookId);
            });
        });
        grid.querySelectorAll('[data-lib-edit]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                openEditBookModal(btn.dataset.libEdit);
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
                renderBookLibrary();
                toast(`🗑 «${book.name}» حذف شد`, 'success');
            });
        });
    }

    function updateAppTitle() {
        const book = getBook();
        const titleEl = document.getElementById('appTitle');
        if (!titleEl) return;
        if (book) {
            titleEl.textContent = '📖 ' + book.name + (book.level ? ' — ' + book.level : '');
        } else {
            titleEl.textContent = '🎓 German Vocab Pro';
        }
    }

    function openBook(bookId) {
        const book = state.books.find(b => b.id === bookId);
        if (!book) return;
        state.activeBookId = bookId;
        state.activeLessonId = book.lessons[0]?.id || null;
        save();
        showMainApp();
        updateAppTitle();
        renderAll();
        populateLessonTargets();
    }

    /* ============ IMPORT BOOK POPUP ============ */
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
            b.id = uid();
            b.name = name;
            b.level = level;
            b.coverImage = coverImage;
            newBooks = [b];
        } else {
            pendingBookData.data.forEach((b, idx) => {
                const nb = { ...b };
                nb.id = uid();
                if (idx === 0) { nb.name = name; nb.level = level; nb.coverImage = coverImage; }
                newBooks.push(nb);
            });
        }
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
        sel.innerHTML = state.books.map(b => {
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
        const newLessons = sourceLessons.map(l => ({
            id: uid(),
            title: l.title || 'درس',
            words: (l.words || []).map(w => ({ ...w, id: w.id || uid() })),
            stories: (l.stories || []).map(s => ({ ...s, id: s.id || uid() }))
        }));
        targetBook.lessons = newLessons;
        targetBook.coverImage = sourceCover;
        targetBook.level = sourceLevel;
        state.activeBookId = targetBook.id;
        state.activeLessonId = newLessons[0]?.id || null;
        save();
        document.getElementById('modalReplaceTargetBook').classList.remove('active');
        document.body.classList.remove('locked');
        pendingBookData = null;
        renderAll(); populateLessonTargets();
        toast(`✅ «${targetBook.name}» با ${newLessons.length} درس جایگزین شد`, 'success');
    }

    /* ============ WORD DETAIL MODAL ============ */
    function openWordDetail(wordId) {
        const word = getWords().find(w => w.id === wordId);
        if (!word) { toast('کلمه پیدا نشد', 'error'); return; }
        currentDetailWord = word;
        const modal = document.getElementById('wordDetailModal');
        const content = document.getElementById('wordDetailContent');
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

        let html = `
    <button class="word-detail-close" id="closeWordDetail">✕</button>
    <div class="word-detail-header">
      ${word.art && word.art !== '–' ? `<span class="word-detail-art ${articleClass(word.art)}">${esc(word.art)}</span>` : ''}
      <span class="word-detail-de">${esc(word.de)}</span>
      ${word.plural && word.plural !== '–' ? `<span class="word-detail-plural">جمع: ${esc(word.plural)}</span>` : ''}
      <span class="word-type-badge ${wt.type}" style="margin-right:auto;">${wt.icon} ${wt.label}</span>
    </div>
    <div class="word-detail-fa">${esc(word.fa)}</div>
    <div class="row tight" style="margin-bottom:10px;">
      <button class="btn btn-sm btn-primary" id="detailSpeakBtn">🔊 تلفظ کلمه</button>
      <button class="btn btn-sm" style="background:${st === 'good' ? 'var(--accent)' : st === 'learning' ? 'var(--warning)' : st === 'bad' ? 'var(--danger)' : 'var(--bg-3)'};color:#fff;border-color:transparent;">${statusLabels[st] || st}</button>
      <button class="btn btn-sm" style="background:var(--bg-3);">📦 جعبه ${srs.box}</button>
    </div>
  `;

        html += `
    <div class="word-detail-section">
      <h4>✏️ ${word.ex ? 'ویرایش' : 'اضافه کردن'} جمله مثال</h4>
      <input type="text" class="word-note-input" id="exDeInput" placeholder="Der Apfel ist rot." dir="ltr" value="${esc(word.ex || '')}" style="min-height:auto;margin-bottom:6px;">
      <input type="text" class="word-note-input" id="exFaInput" placeholder="سیب قرمز است." value="${esc(word.exMean || '')}" style="min-height:auto;margin-bottom:6px;">
      <input type="text" class="word-note-input" id="exAudioInput" placeholder="🎵 لینک فایل صوتی جمله (اختیاری)" dir="ltr" value="${esc(word.exAudio || '')}" style="min-height:auto;margin-bottom:6px;">
      <div class="row tight" style="margin-bottom:0;">
        <button class="btn btn-primary btn-sm" id="saveExBtn" style="flex:1;">💾 ذخیره جمله</button>
        ${word.ex ? `<button class="btn btn-sm" style="background:rgba(251,191,36,0.2);color:#fbbf24;border-color:rgba(251,191,36,0.4);" id="playExBtn">🔊 پخش جمله</button>` : ''}
      </div>
    </div>
  `;

        const formsKeys = Object.keys(forms).filter(k => forms[k] && String(forms[k]).trim());
        if (formsKeys.length) {
            html += `<div class="word-detail-section">
      <h4>🔤 صرف فعل (Konjugation)</h4>
      <div class="conjugation-grid">`;
            formsKeys.forEach(key => {
                const val = forms[key];
                html += `<div class="conj-row">
        <span class="conj-label">${esc(formLabels[key] || key)}</span>
        <span class="conj-value">${esc(val)}</span>
      </div>`;
            });
            html += `</div></div>`;
        }

        if (synonyms.length) {
            html += `<div class="word-detail-section">
      <h4>🔗 مترادف‌ها</h4>
      <div class="chips-list">
        ${synonyms.map(s => `<span class="chip synonym">${esc(s)}</span>`).join('')}
      </div>
    </div>`;
        }
        if (related.length) {
            html += `<div class="word-detail-section">
      <h4>📎 کلمات مرتبط</h4>
      <div class="chips-list">
        ${related.map(s => `<span class="chip related">${esc(s)}</span>`).join('')}
      </div>
    </div>`;
        }
        if (extraExamples.length) {
            html += `<div class="word-detail-section">
      <h4>📚 جملات بیشتر</h4>
      <div class="extra-examples-list">
        ${extraExamples.map(ex => {
                const deText = typeof ex === 'string' ? ex : ex.de;
                const faText = typeof ex === 'string' ? '' : ex.fa;
                const audioUrl = typeof ex === 'string' ? '' : (ex.audio || '');
                return `<div class="extra-example-item">
            <div class="extra-example-de">
              <span class="ex-text">${highlightExample(deText, word.de)}</span>
              <button class="ex-speak-btn ${audioUrl ? 'has-audio' : ''}" data-extra-speak="${esc(deText)}" data-extra-audio="${esc(audioUrl)}">${audioUrl ? '🎵' : '🔊'}</button>
            </div>
            ${faText ? `<div class="extra-example-fa">${esc(faText)}</div>` : ''}
          </div>`;
            }).join('')}
      </div>
    </div>`;
        }
        if (word.note) {
            html += `<div class="word-detail-section">
      <h4>📝 یادداشت اصلی</h4>
      <div class="note-content">${esc(word.note)}</div>
    </div>`;
        }
        html += `
    <div class="word-detail-section">
      <h4>💡 نکات و توضیحات اضافه (${notes.length})</h4>
      <div class="word-notes-list" id="wordNotesList">
        ${notes.length ? notes.map((n, i) => `
          <div class="word-note-item">
            <button class="note-delete" data-del-note="${i}" title="حذف">✕</button>
            <div class="note-text">${esc(n)}</div>
          </div>
        `).join('') : '<div class="muted" style="font-size:12px;text-align:center;">هنوز نکته‌ای اضافه نکردی</div>'}
      </div>
    </div>
    <div class="word-detail-section">
      <h4>➕ اضافه کردن نکته جدید</h4>
      <textarea class="word-note-input" id="newNoteInput" placeholder="مثلاً: dieser Apfel ist grün — این سیب سبز است"></textarea>
      <button class="btn btn-primary btn-sm" id="addNoteBtn" style="width:100%;">➕ ذخیره نکته</button>
    </div>
    <div class="word-detail-actions">
      <button class="btn btn-danger" id="detailBadBtn" style="flex:1;">❌ بلد نیستم</button>
      <button class="btn btn-warning" id="detailMediumBtn" style="flex:1;">⚠️ نصفه</button>
      <button class="btn btn-success" id="detailGoodBtn" style="flex:1;">✔️ بلدم</button>
    </div>
  `;

        content.innerHTML = html;
        modal.classList.add('active');
        document.body.classList.add('locked');

        document.getElementById('closeWordDetail').addEventListener('click', closeWordDetail);
        document.getElementById('detailSpeakBtn').addEventListener('click', () => speakTTS(word.de));
        const saveExBtn = document.getElementById('saveExBtn');
        if (saveExBtn) {
            saveExBtn.addEventListener('click', () => {
                word.ex = document.getElementById('exDeInput').value.trim();
                word.exMean = document.getElementById('exFaInput').value.trim();
                word.exAudio = document.getElementById('exAudioInput').value.trim();
                save();
                toast('✅ جمله ذخیره شد', 'success');
                renderAll();
                openWordDetail(word.id);
            });
        }
        const playExBtn = document.getElementById('playExBtn');
        if (playExBtn) playExBtn.addEventListener('click', () => speak(word.ex, word.exAudio));
        content.querySelectorAll('[data-extra-speak]').forEach(btn => {
            btn.addEventListener('click', () => speak(btn.dataset.extraSpeak, btn.dataset.extraAudio));
        });
        content.querySelectorAll('[data-del-note]').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = parseInt(btn.dataset.delNote);
                if (!confirm('حذف این نکته؟')) return;
                word.notes.splice(i, 1);
                save(); renderAll(); openWordDetail(word.id);
            });
        });
        document.getElementById('addNoteBtn').addEventListener('click', () => {
            const input = document.getElementById('newNoteInput');
            const txt = input.value.trim();
            if (!txt) { toast('متن نکته خالیه', 'error'); return; }
            if (!Array.isArray(word.notes)) word.notes = [];
            word.notes.push(txt);
            save(); toast('✅ نکته اضافه شد', 'success');
            renderAll(); openWordDetail(word.id);
        });
        document.getElementById('detailBadBtn').addEventListener('click', () => {
            reviewWord(word, 'bad'); toast('ثبت شد: بلد نیستم ❌', 'warning');
            closeWordDetail(); renderAll();
        });
        document.getElementById('detailMediumBtn').addEventListener('click', () => {
            reviewWord(word, 'medium'); toast('ثبت شد: نصفه ⚠️', 'warning');
            closeWordDetail(); renderAll();
        });
        document.getElementById('detailGoodBtn').addEventListener('click', () => {
            reviewWord(word, 'good'); toast('ثبت شد: بلدم ✔️', 'success');
            closeWordDetail(); renderAll();
        });
    }
    function closeWordDetail() {
        document.getElementById('wordDetailModal').classList.remove('active');
        document.body.classList.remove('locked');
        currentDetailWord = null;
    }

    function populateLessonTargets() {
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
                return `<option value="${l.id}" ${l.id === state.activeLessonId ? 'selected' : ''}>${esc(l.title)} (${info})</option>`;
            }).join('');
            if (currentValue && b.lessons.find(l => l.id === currentValue)) sel.value = currentValue;
        });
    }

    function renderBookSelect() {
        const sel = document.getElementById('bookSelect');
        sel.innerHTML = state.books.map(b =>
            `<option value="${b.id}" ${b.id === state.activeBookId ? 'selected' : ''}>${esc(b.name)} — ${esc(b.level)}</option>`
        ).join('');
        document.getElementById('delBookBtn').disabled = state.books.length === 0;
        updateAppTitle();
    }

    function renderLessonSelect() {
        const b = getBook();
        const sel = document.getElementById('lessonSelect');
        if (!b || !b.lessons.length) {
            sel.innerHTML = '<option value="">— بدون درس —</option>';
            document.getElementById('delLessonBtn').disabled = true;
            updateAppTitle();
            return;
        }
        sel.innerHTML = b.lessons.map(l =>
            `<option value="${l.id}" ${l.id === state.activeLessonId ? 'selected' : ''}>${esc(l.title)} (${l.words.length})</option>`
        ).join('');
        document.getElementById('delLessonBtn').disabled = b.lessons.length <= 1;
        updateAppTitle();
    }
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
        document.getElementById('statsGrid').innerHTML = `
    <div class="stat-box total"><span class="num">${total}</span><span class="lbl">کل</span></div>
    <div class="stat-box new"><span class="num">${counts.new}</span><span class="lbl">جدید</span></div>
    <div class="stat-box learning"><span class="num">${counts.learning}</span><span class="lbl">در یادگیری</span></div>
    <div class="stat-box good"><span class="num">${counts.good}</span><span class="lbl">مسلط</span></div>
    <div class="stat-box bad"><span class="num">${counts.bad}</span><span class="lbl">بلد نیستم</span></div>
    <div class="stat-box due"><span class="num">${counts.due}</span><span class="lbl">مرور امروز</span></div>
  `;
        document.getElementById('lessonProgress').style.width = pct + '%';
        document.getElementById('progressText').textContent = `${pct}٪ تسلط (${counts.good} از ${total})`;
    }

    function renderWordTable() {
        const search = (document.getElementById('searchBox').value || '').toLowerCase();
        const filter = document.getElementById('filterStatus').value;
        let words = getWords().slice();
        if (search) words = words.filter(w =>
            (w.de || '').toLowerCase().includes(search) ||
            (w.fa || '').toLowerCase().includes(search)
        );
        if (filter !== 'all') words = words.filter(w => normalizeStatus(w) === filter);
        const cont = document.getElementById('wordTableContainer');
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
      <td class="action-cell"><button class="icon-btn danger" data-del="${w.id}">🗑</button></td>
    </tr>`;
        }).join('');
        cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>Deutsch</th><th>🔊</th><th>Artikel</th>
      <th>Plural</th><th>فارسی</th><th></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
        cont.querySelectorAll('[data-speak]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                speak(btn.dataset.speak, btn.dataset.audio);
            });
        });
        cont.querySelectorAll('[data-del]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const w = getWords().find(x => x.id === btn.dataset.del);
                if (!w || !confirm(`حذف «${w.de}»؟`)) return;
                const l = getLesson();
                l.words = l.words.filter(x => x.id !== w.id);
                save(); renderAll(); populateLessonTargets(); toast('حذف شد', 'success');
            });
        });
        cont.querySelectorAll('tbody tr').forEach(tr => {
            tr.addEventListener('click', e => {
                if (e.target.closest('button')) return;
                openWordDetail(tr.dataset.id);
            });
        });
    }

    /* ============ CARDS RENDER (با دکمه ⋮) ============ */
    function renderCards() {
        const container = document.getElementById('cardsContainer');
        if (!container) return;
        const search = (document.getElementById('cardSearch').value || '').toLowerCase();
        const filter = document.getElementById('cardFilter').value;
        let words = getWords().slice();
        if (search) {
            words = words.filter(w =>
                (w.de || '').toLowerCase().includes(search) ||
                (w.fa || '').toLowerCase().includes(search) ||
                (w.ex || '').toLowerCase().includes(search)
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
            const hasSynonyms = (w.synonyms || []).length > 0;
            const hasRelated = (w.related || []).length > 0;
            const hasExtraEx = (w.extraExamples || []).length > 0;
            const hasNote = w.note && w.note.trim();
            const hasNotes = (w.notes || []).length > 0;
            const hasAnyExtra = hasForms || hasSynonyms || hasRelated || hasExtraEx || hasNote || hasNotes;
            return `<div class="word-card status-${st}" data-card-id="${w.id}">
      <div class="word-card-header">
        <div class="word-card-title">
          ${art ? `<span class="word-card-art ${artClass}">${esc(art)}</span>` : ''}
          <span class="word-card-de">${esc(w.de)}</span>
          <button class="word-speak-inline" data-card-speak="${esc(w.de)}" title="تلفظ کلمه">🔊</button>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="word-type-badge ${wt.type}">${wt.icon} ${wt.label}</span>
          ${hasAnyExtra ? `<button class="word-more-btn" data-card-more="${w.id}" title="جزئیات بیشتر">⋮</button>` : ''}
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
                openWordDetail(card.dataset.cardId);
            });
        });
        container.querySelectorAll('[data-card-more]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                openWordDetail(btn.dataset.cardMore);
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


    /* ============ FOLDERS ============ */
    function renderFolders() {
        const words = getWords();
        const now = Date.now();
        let c = { new: 0, learning: 0, good: 0, bad: 0, due: 0 };
        words.forEach(w => {
            const st = normalizeStatus(w);
            if (c[st] !== undefined) c[st]++;
            const s = ensureSrs(w);
            if (!s.nextReview || s.nextReview <= now) c.due++;
        });
        document.getElementById('folderGrid').innerHTML = `
    <div class="folder-card new" data-folder="new"><div class="icon">⚪</div><h4>جدید</h4><div class="count">${c.new}</div></div>
    <div class="folder-card medium" data-folder="learning"><div class="icon">🟡</div><h4>در یادگیری</h4><div class="count">${c.learning}</div></div>
    <div class="folder-card good" data-folder="good"><div class="icon">🟢</div><h4>مسلط</h4><div class="count">${c.good}</div></div>
    <div class="folder-card bad" data-folder="bad"><div class="icon">❌</div><h4>بلد نیستم</h4><div class="count">${c.bad}</div></div>
    <div class="folder-card due" data-folder="due"><div class="icon">📅</div><h4>مرور امروز</h4><div class="count">${c.due}</div></div>
    <div class="folder-card" data-folder="all" style="border-color:var(--primary);"><div class="icon">📦</div><h4>همه</h4><div class="count">${words.length}</div></div>
  `;
        document.querySelectorAll('#folderGrid [data-folder]').forEach(card => {
            card.addEventListener('click', () => startPractice(card.dataset.folder));
        });
    }

    /* ============ PRACTICE ============ */
    function startPractice(folderType) {
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
    function showCurrentPracticeCard() {
        if (practice.index >= practice.queue.length) {
            exitPractice();
            toast('🎉 مرور تمام شد!', 'success');
            return;
        }
        const w = practice.queue[practice.index];
        document.getElementById('practiceCounter').textContent = `${practice.index + 1} / ${practice.queue.length}`;
        document.getElementById('practiceProgress').style.width = ((practice.index / practice.queue.length) * 100) + '%';
        document.getElementById('flashcardInner').classList.remove('flipped');
        document.getElementById('fcArt').textContent = w.art && w.art !== '–' ? w.art : '';
        document.getElementById('fcArt').className = 'fc-art art ' + articleClass(w.art);
        document.getElementById('fcWord').textContent = w.de;
        document.getElementById('fcMeaning').textContent = w.fa;
        document.getElementById('fcExample').innerHTML = w.ex ? `📌 ${esc(w.ex)}${w.exMean ? `<br><small>${esc(w.exMean)}</small>` : ''}` : '';
        const prevBtn = document.getElementById('prevPracticeBtn');
        if (prevBtn) prevBtn.disabled = practice.index === 0;
        if (autoPlayWord) setTimeout(() => speakTTS(w.de), 200);
    }
    function rateCurrent(rating) {
        const w = practice.queue[practice.index];
        reviewWord(w, rating);
        practice.ratings[practice.index] = rating;
        practice.index++;
        showCurrentPracticeCard();
        renderStats();
    }
    function exitPractice() {
        practice.active = false;
        practice.ratings = {};
        window.speechSynthesis.cancel();
        if (currentAudio) { try { currentAudio.pause(); } catch (e) { } currentAudio = null; }
        document.getElementById('practiceFolderView').classList.remove('hidden');
        document.getElementById('practiceSession').classList.add('hidden');
        renderAll(); populateLessonTargets();
    }

    /* ============ QUIZ ============ */
    function startQuiz(mode) {
        let words = getWords().slice();
        if (mode === 'bad') words = words.filter(w => normalizeStatus(w) === 'bad');
        if (words.length < 2) { toast('حداقل ۲ کلمه لازمه', 'warning'); return; }
        quiz.active = true;
        quiz.questions = [];
        quiz.results = [];
        quiz.index = 0;
        words.forEach(w => {
            const others = words.filter(x => x.id !== w.id).map(x => x.fa).filter(Boolean);
            if (others.length >= 2 && w.fa) {
                quiz.questions.push({ type: 'mean', word: w, correct: w.fa, options: shuffle([w.fa, ...shuffle(others).slice(0, 3)]) });
            }
            if (w.ex && w.de) {
                const escaped = w.de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const masked = w.ex.replace(new RegExp(escaped, 'gi'), '_____');
                const others2 = words.filter(x => x.id !== w.id).map(x => x.de);
                if (others2.length >= 2) {
                    quiz.questions.push({ type: 'sentence', word: w, correct: w.de, options: shuffle([w.de, ...shuffle(others2).slice(0, 3)]), masked, exMean: w.exMean });
                }
            }
        });
        if (!quiz.questions.length) { toast('سوالی ساخته نشد', 'error'); return; }
        quiz.questions = shuffle(quiz.questions);
        document.getElementById('quizHome').classList.add('hidden');
        document.getElementById('quizSession').classList.remove('hidden');
        document.getElementById('quizReport').classList.add('hidden');
        renderQuizQuestion();
    }
    function renderQuizQuestion() {
        if (quiz.index >= quiz.questions.length) { renderQuizReport(); return; }
        const q = quiz.questions[quiz.index];
        document.getElementById('quizCounter').textContent = `${quiz.index + 1} / ${quiz.questions.length}`;
        document.getElementById('quizProgressFill').style.width = ((quiz.index / quiz.questions.length) * 100) + '%';
        let html = '';
        if (q.type === 'mean') {
            html = `<div class="quiz-prompt">معنی این کلمه کدام است؟</div>
      <div class="quiz-word">${esc(q.word.de)}</div>
      <div class="quiz-options">${q.options.map(o => `<button class="quiz-opt" data-opt="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
        } else {
            html = `<div class="quiz-prompt">کدام کلمه در جای خالی می‌آید؟</div>
      <div class="quiz-sentence">"${esc(q.masked)}"</div>
      <div class="muted center" style="font-size:12px;">${esc(q.exMean || '')}</div>
      <div class="quiz-options">${q.options.map(o => `<button class="quiz-opt" data-opt="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
        }
        document.getElementById('quizContent').innerHTML = html;
        document.querySelectorAll('.quiz-opt').forEach(btn => {
            btn.addEventListener('click', () => answerQuiz(btn.dataset.opt));
        });
    }
    function answerQuiz(selected) {
        const q = quiz.questions[quiz.index];
        const isCorrect = selected === q.correct;
        quiz.results.push({ word: q.word, correct: isCorrect });
        reviewWord(q.word, isCorrect ? 'good' : 'bad');
        document.querySelectorAll('.quiz-opt').forEach(btn => {
            btn.disabled = true;
            if (btn.dataset.opt === q.correct) btn.classList.add('correct');
            else if (btn.dataset.opt === selected) btn.classList.add('wrong');
        });
        const fb = document.createElement('div');
        fb.className = 'quiz-feedback ' + (isCorrect ? 'correct' : 'wrong');
        fb.innerHTML = isCorrect ? '✅ آفرین! درست بود' : `❌ اشتباه — جواب درست: <strong>${esc(q.correct)}</strong>`;
        document.getElementById('quizContent').appendChild(fb);
        const next = document.createElement('button');
        next.className = 'btn btn-primary';
        next.style.marginTop = '12px';
        next.textContent = 'سوال بعدی ➡️';
        next.addEventListener('click', () => { quiz.index++; renderQuizQuestion(); });
        document.getElementById('quizContent').appendChild(next);
    }
    function renderQuizReport() {
        const total = quiz.results.length;
        const correct = quiz.results.filter(r => r.correct).length;
        const pct = total ? Math.round((correct / total) * 100) : 0;
        const failed = [...new Map(quiz.results.filter(r => !r.correct).map(r => [r.word.id, r.word])).values()];
        const color = pct >= 80 ? 'var(--accent)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
        document.getElementById('quizSession').classList.add('hidden');
        document.getElementById('quizReport').classList.remove('hidden');
        document.getElementById('quizReport').innerHTML = `
    <div class="panel center">
      <h3>📋 کارنامه آزمون</h3>
      <div style="font-size:3rem;font-weight:700;color:${color};margin:16px 0;">${pct}%</div>
      <p>${correct} از ${total} پاسخ درست</p>
      ${failed.length ? `
        <div style="background:rgba(239,68,68,0.1);border:1px solid var(--danger);border-radius:8px;padding:12px;margin-top:14px;text-align:right;">
          <strong style="color:var(--danger);">❌ کلمات اشتباه:</strong>
          <ul style="margin:8px 0 0;padding-right:20px;font-size:13px;">
            ${failed.map(w => `<li><strong>${esc(w.de)}</strong> — ${esc(w.fa)}</li>`).join('')}
          </ul>
        </div>` : '<p style="color:var(--accent);font-size:16px;margin-top:12px;">🎉 عالی!</p>'}
      <div class="row tight" style="margin-top:16px;justify-content:center;">
        <button class="btn btn-primary" id="backToQuizHome">بازگشت</button>
        ${failed.length ? `<button class="btn btn-danger" id="retryBad">🔄 آزمون مجدد</button>` : ''}
      </div>
    </div>`;
        document.getElementById('backToQuizHome').addEventListener('click', backToQuizHome);
        const retry = document.getElementById('retryBad');
        if (retry) retry.addEventListener('click', () => startQuiz('bad'));
        renderAll(); populateLessonTargets();
    }
    function backToQuizHome() {
        quiz.active = false;
        document.getElementById('quizHome').classList.remove('hidden');
        document.getElementById('quizSession').classList.add('hidden');
        document.getElementById('quizReport').classList.add('hidden');
    }

    /* ============ STORIES ============ */
    function renderStories() {
        const stories = getStories();
        const grid = document.getElementById('storyGrid');
        if (!stories.length) { grid.innerHTML = '<div class="empty">هنوز داستانی نداری</div>'; return; }
        grid.innerHTML = stories.map(s => {
            const img = safeImageSrc(s.coverImage);
            const color = safeCoverColor(s.coverColor);
            return `<div style="position:relative;">
      <button class="story-card" style="--cover-color:${color};width:100%;" data-story="${s.id}">
        ${img ? `<img src="${esc(img)}" alt="">` : ''}
        <span class="title">${esc(s.title)}</span>
      </button>
      <button class="edit-btn" data-edit="${s.id}" title="ویرایش">✏️</button>
      <button class="del-btn" data-del-story="${s.id}" title="حذف">✕</button>
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

    function highlightStoryWords(sentenceDe) {
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

    function openStory(id) {
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

        let html = `<h2 style="color:var(--primary);margin-bottom:8px;padding-left:44px;padding-right:4px;">${esc(s.title)}</h2>`;

        if (stories.length > 1) {
            html += `<div class="story-quick-nav">`;
            stories.forEach((st, i) => {
                html += `<button class="story-quick-nav-btn ${st.id === id ? 'active' : ''}" data-jump-story="${st.id}">${i + 1}. ${esc(st.title)}</button>`;
            });
            html += `</div>`;
        }

        html += `<div class="story-reader-body-scroll" id="storyScrollBody">`;
        (s.sentences || []).forEach((sent, i) => {
            html += `<div class="story-sentence">
      <div class="story-de">${i + 1}. ${highlightStoryWords(sent.de)}</div>
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
        document.querySelectorAll('[data-jump-story]').forEach(btn => {
            btn.addEventListener('click', () => openStory(btn.dataset.jumpStory));
        });
        document.querySelectorAll('.story-word').forEach(span => {
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                openWordDetail(span.dataset.wordId);
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

    function applyRepeatButtonState(btn) {
        if (!btn) return;
        btn.classList.remove('repeat-1', 'repeat-2', 'auto-next', 'repeat-inf');
        const oldBadge = btn.querySelector('.repeat-badge');
        if (oldBadge) oldBadge.remove();
        btn.textContent = '🔁';
        if (repeatMode === 0) { btn.title = 'حالت تکرار: خاموش'; }
        else if (repeatMode === 1) { btn.classList.add('repeat-1'); btn.title = '۱ بار'; const b = document.createElement('span'); b.className = 'repeat-badge'; b.textContent = '1'; btn.appendChild(b); }
        else if (repeatMode === 2) { btn.classList.add('repeat-2'); btn.title = '۲ بار'; const b = document.createElement('span'); b.className = 'repeat-badge'; b.textContent = '2'; btn.appendChild(b); }
        else if (repeatMode === 3) { btn.classList.add('auto-next'); btn.title = 'اتونکست'; const b = document.createElement('span'); b.className = 'repeat-badge'; b.textContent = 'A'; btn.appendChild(b); }
        else if (repeatMode === 4) { btn.classList.add('repeat-inf'); btn.title = 'بی‌نهایت'; const b = document.createElement('span'); b.className = 'repeat-badge'; b.textContent = '∞'; btn.appendChild(b); }
    }
    function goToAdjacentStory(direction, autoAdvance) {
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
                const maxRepeat = repeatMode;
                if (repeatCounter < maxRepeat) { repeatCounter++; audioEl.currentTime = 0; audioEl.play().catch(() => { }); return; }
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
        function updateVolIcon(v) {
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
    function loadStoryForEdit(id) {
        const s = getStories().find(x => x.id === id);
        if (!s) return;
        storyEditId = id;
        document.getElementById('storyTitleInput').value = s.title || '';
        document.getElementById('storyAudioInput').value = s.audio || '';
        document.getElementById('storyCoverInput').value = s.coverImage || '';
        document.getElementById('storyColorInput').value = safeCoverColor(s.coverColor);
        document.getElementById('storySentencesInput').value = (s.sentences || []).map(x => x.de + ' | ' + x.fa).join('\n');
        switchTab('manage-story');
        setTimeout(() => {
            document.getElementById('storyTargetLesson').value = state.activeLessonId;
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
        if (!Array.isArray(target.stories)) target.stories = [];
        if (storyEditId) {
            const s = target.stories.find(x => x.id === storyEditId);
            if (s) { s.title = title; s.audio = audio; s.coverImage = cover; s.coverColor = color; s.sentences = sentences; }
        } else {
            target.stories.push({ id: uid(), title, audio, coverImage: cover, coverColor: color, sentences });
        }
        save(); resetStoryForm(); renderAll(); populateLessonTargets();
        toast(`✅ به «${target.title}» اضافه شد`, 'success');
    }
    function resetStoryForm() {
        storyEditId = null;
        document.getElementById('storyTitleInput').value = '';
        document.getElementById('storyAudioInput').value = '';
        document.getElementById('storyCoverInput').value = '';
        document.getElementById('storyColorInput').value = '#6366f1';
        document.getElementById('storySentencesInput').value = '';
        const cancelBtn = document.getElementById('cancelStoryEditBtn');
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    /* ============ DELETE BOOK ============ */
    function openDeleteBookModal() {
        const b = getBook();
        if (!b) { toast('کتابی انتخاب نشده', 'error'); return; }
        document.getElementById('delBookName').textContent = b.name;
        document.getElementById('delBookConfirmInput').value = '';
        document.getElementById('confirmDeleteBookBtn').disabled = true;
        document.getElementById('modalDeleteBook').classList.add('active');
        document.body.classList.add('locked');
    }
    function checkDeleteBookConfirm() {
        const b = getBook();
        if (!b) return;
        const input = document.getElementById('delBookConfirmInput');
        const btn = document.getElementById('confirmDeleteBookBtn');
        btn.disabled = input.value.trim() !== b.name;
    }
    function confirmDeleteBook() {
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
        document.getElementById('modalDeleteBook').classList.remove('active');
        document.body.classList.remove('locked');
        if (state.books.length === 0) showBookLibrary();
        else { renderAll(); populateLessonTargets(); }
        toast(`🗑 کتاب «${b.name}» حذف شد`, 'success');
    }

    /* ============ JSON IMPORT ============ */
    function importFullBook(file) {
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
                    rawBooks = [{ name: file.name.replace('.json', ''), level: 'A1.1', lessons: [{ title: 'درس 1', words: data }] }];
                } else {
                    status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ فرمت کتاب شناسایی نشد</div>`;
                    return;
                }
                const newBooks = rawBooks.map(b => normalizeBook(b)).filter(Boolean);
                if (!newBooks.length) { status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ کتاب معتبری نبود</div>`; return; }
                newBooks.forEach(nb => state.books.push(nb));
                state.activeBookId = newBooks[0].id;
                state.activeLessonId = newBooks[0].lessons[0]?.id;
                save(); renderAll(); populateLessonTargets();
                let totalLessons = 0, totalWords = 0;
                newBooks.forEach(nb => { totalLessons += nb.lessons.length; nb.lessons.forEach(l => totalWords += l.words.length); });
                status.innerHTML = `<div style="background:rgba(16,185,129,0.1);border:1px solid var(--accent);border-radius:8px;padding:12px;font-size:13px;">
        ✅ <b>${newBooks.length}</b> کتاب، <b>${totalLessons}</b> درس، <b>${totalWords}</b> کلمه اضافه شد
      </div>`;
                toast(`${newBooks.length} کتاب اضافه شد`, 'success');
            } catch (err) {
                status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ خطا: ${esc(err.message)}</div>`;
            }
        };
        reader.readAsText(file);
    }
    function replaceFullBook(file) {
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
                state.books = newBooks;
                state.activeBookId = newBooks[0].id;
                state.activeLessonId = newBooks[0].lessons[0]?.id;
                save(); renderAll(); populateLessonTargets();
                status.innerHTML = `<div style="color:var(--accent);font-size:13px;">✅ ${newBooks.length} کتاب جایگزین شد</div>`;
                toast('جایگزین شد', 'success');
            } catch (err) {
                status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ خطا: ${esc(err.message)}</div>`;
            }
        };
        reader.readAsText(file);
    }
    function importJsonWords() {
        const raw = document.getElementById('jsonInput').value.trim();
        if (!raw) { toast('JSON خالیه', 'error'); return; }
        let data;
        try { data = JSON.parse(raw); }
        catch (e) { toast('JSON نامعتبر', 'error'); return; }
        const targetId = document.getElementById('jsonTargetLesson').value;
        const target = getLessonById(targetId);
        if (!target) { toast('درس مقصد رو انتخاب کن', 'error'); return; }
        if (!Array.isArray(target.words)) target.words = [];
        let arr = Array.isArray(data) ? data : (data.words && Array.isArray(data.words) ? data.words : null);
        if (!arr) { toast('فرمت نامعتبر', 'warning'); return; }
        let added = 0, dup = 0, skip = 0;
        arr.forEach(item => {
            const w = normalizeWord(item);
            if (!w) { skip++; return; }
            if (target.words.some(x => x.de.toLowerCase() === w.de.toLowerCase())) { dup++; return; }
            target.words.push(w); added++;
        });
        save(); renderAll(); populateLessonTargets();
        toast(`✅ ${added} اضافه، ${dup} تکراری، ${skip} نامعتبر`, added ? 'success' : 'warning');
    }
    function validateJson() {
        const raw = document.getElementById('jsonInput').value.trim();
        const preview = document.getElementById('jsonPreview');
        if (!raw) { preview.innerHTML = ''; return; }
        let data;
        try { data = JSON.parse(raw); }
        catch (e) { preview.innerHTML = `<div style="color:var(--danger);">❌ ${esc(e.message)}</div>`; return; }
        let arr = Array.isArray(data) ? data : (data.words && Array.isArray(data.words) ? data.words : null);
        if (!arr) { preview.innerHTML = `<div style="color:var(--danger);">❌ باید آرایه باشه</div>`; return; }
        const valid = arr.map(normalizeWord).filter(Boolean);
        preview.innerHTML = `<div style="background:var(--bg);padding:10px;border-radius:8px;font-size:13px;">
    <div style="color:var(--accent);">✅ ${valid.length} معتبر</div>
    <div style="color:var(--danger);">❌ ${arr.length - valid.length} نامعتبر</div>
  </div>`;
    }
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
        exportData({ book: b.name, lesson: l.title, words: l.words, stories: l.stories }, `${b.name}-${l.title}.json`);
        toast('دانلود شد', 'success');
    }
    function exportBad() {
        const words = getWords().filter(w => normalizeStatus(w) === 'bad');
        if (!words.length) { toast('کلمه‌ای نداری!', 'warning'); return; }
        exportData(words, `bad-words-${Date.now()}.json`);
        toast('دانلود شد', 'success');
    }

    /* ============ FILE HANDLING ============ */
    function setupFileDropZone() {
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
    function handleFileUpload(file, forceActiveLesson) {
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
            } catch (err) {
                if (status) status.innerHTML = `<div style="color:var(--danger);font-size:13px;">❌ JSON نامعتبر</div>`;
                toast('JSON نامعتبر', 'error');
            }
        };
        reader.readAsText(file);
    }
    function processUploadedData(data, filename, status, forceActiveLesson) {
        const targetId = forceActiveLesson ? state.activeLessonId : document.getElementById('fileTargetLesson').value;
        const target = getLessonById(targetId);
        function show(html) { if (status) status.innerHTML = html; }

        if (Array.isArray(data)) {
            if (!target) { show(`<div style="color:var(--danger);font-size:13px;">❌ درس مقصد انتخاب نشده</div>`); return; }
            let added = 0, dup = 0, skip = 0;
            data.forEach(item => {
                const w = normalizeWord(item);
                if (!w) { skip++; return; }
                if (target.words.some(x => x.de.toLowerCase() === w.de.toLowerCase())) { dup++; return; }
                target.words.push(w); added++;
            });
            save(); renderAll(); populateLessonTargets();
            show(`<div style="color:var(--accent);font-size:13px;">✅ ${added} کلمه اضافه شد</div>`);
            toast(`${added} اضافه شد`, 'success');
            return;
        }

        if (data.lessons && Array.isArray(data.lessons)) {
            const bookData = {
                name: data.name || data.title || filename.replace('.json', ''),
                level: data.level || 'A1.1',
                coverImage: data.coverImage || '',
                lessons: data.lessons.map((l, i) => normalizeLesson(l, 'درس ' + (i + 1))).filter(Boolean)
            };
            if (!bookData.lessons.length) { show(`<div style="color:var(--danger);font-size:13px;">❌ درس معتبری نبود</div>`); return; }
            if (status) status.innerHTML = '';
            openImportBookPopup({ type: 'single', data: bookData });
            return;
        }

        if (data.books && Array.isArray(data.books)) {
            const booksData = data.books.map(b => normalizeBook(b)).filter(Boolean);
            if (!booksData.length) { show(`<div style="color:var(--danger);font-size:13px;">❌ کتاب معتبری نبود</div>`); return; }
            if (status) status.innerHTML = '';
            openImportBookPopup({ type: 'multi', data: booksData });
            return;
        }

        if (data.words && Array.isArray(data.words)) {
            if (!target) { show(`<div style="color:var(--danger);font-size:13px;">❌ درس مقصد انتخاب نشده</div>`); return; }
            let added = 0, dup = 0;
            data.words.forEach(item => {
                const w = normalizeWord(item);
                if (!w) return;
                if (target.words.some(x => x.de.toLowerCase() === w.de.toLowerCase())) { dup++; return; }
                target.words.push(w); added++;
            });
            save(); renderAll(); populateLessonTargets();
            show(`<div style="color:var(--accent);font-size:13px;">✅ ${added} کلمه اضافه شد</div>`);
            toast(`${added} اضافه شد`, 'success');
            return;
        }

        show(`<div style="color:var(--danger);font-size:13px;">❌ فرمت شناسایی نشد</div>`);
        toast('فرمت نامعتبر', 'error');
    }

    /* ============ TABS ============ */
    function switchTab(name) {
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        const el = document.getElementById('tab-' + name);
        if (el) el.classList.remove('hidden');
        if (name === 'practice') renderFolders();
        if (name === 'stories') renderStories();
        if (name === 'list') renderWordTable();
        if (name === 'cards') renderCards();
        if (name === 'json' || name === 'manage' || name === 'manage-story') populateLessonTargets();
    }
    function renderAll() {
        renderBookSelect();
        renderLessonSelect();
        renderStats();
        renderWordTable();
        renderFolders();
        renderStories();
        renderCards();
        populateLessonTargets();
    }

    /* ============ MODALS ============ */
    function openBookModal() {
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
    function openEditBookModal(bookId) {
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
    function openLessonModal() {
        document.getElementById('lessonTitleInput').value = '';
        document.getElementById('modalLesson').classList.add('active');
        document.body.classList.add('locked');
    }

    /* ============ EVENTS ============ */
    function bindEvents() {
        document.querySelectorAll('.tab').forEach(t => {
            t.addEventListener('click', () => switchTab(t.dataset.tab));
        });
        document.getElementById('bookSelect').addEventListener('change', e => {
            state.activeBookId = e.target.value;
            const b = getBook();
            if (b && b.lessons.length) state.activeLessonId = b.lessons[0].id;
            save();
            updateAppTitle();
            renderAll();
        });
        document.getElementById('lessonSelect').addEventListener('change', e => {
            state.activeLessonId = e.target.value;
            save(); renderAll();
        });
        document.getElementById('addBookBtn').addEventListener('click', openBookModal);
        document.getElementById('addLessonBtn').addEventListener('click', openLessonModal);
        document.getElementById('delBookBtn').addEventListener('click', openDeleteBookModal);
        document.getElementById('delLessonBtn').addEventListener('click', () => {
            const l = getLesson(), b = getBook();
            if (!l || !b || b.lessons.length <= 1) { toast('نمی‌شه حذف کرد', 'warning'); return; }
            if (!confirm(`حذف «${l.title}»؟`)) return;
            b.lessons = b.lessons.filter(x => x.id !== l.id);
            state.activeLessonId = b.lessons[0].id;
            save(); renderAll(); toast('حذف شد', 'success');
        });
        document.getElementById('searchBox').addEventListener('input', renderWordTable);
        document.getElementById('filterStatus').addEventListener('change', renderWordTable);

        document.getElementById('cardSearch').addEventListener('input', renderCards);
        document.getElementById('cardFilter').addEventListener('change', renderCards);
        document.getElementById('cardSortAlpha').addEventListener('click', () => { cardSortMode = 'alpha'; renderCards(); });
        document.getElementById('cardSortRandom').addEventListener('click', () => { cardSortMode = 'random'; renderCards(); });
        document.getElementById('cardSortStatus').addEventListener('click', () => { cardSortMode = 'status'; renderCards(); });

        document.getElementById('startSrsBtn').addEventListener('click', () => startPractice('due'));
        document.getElementById('exitPractice').addEventListener('click', exitPractice);
        document.getElementById('flashcardStage').addEventListener('click', () => {
            document.getElementById('flashcardInner').classList.toggle('flipped');
        });
        document.getElementById('fcSpeakBtn').addEventListener('click', () => {
            const w = practice.queue[practice.index];
            if (w) speak(w.de, w.exAudio);
        });
        document.querySelectorAll('[data-rate]').forEach(btn => {
            btn.addEventListener('click', () => rateCurrent(btn.dataset.rate));
        });
        document.getElementById('prevPracticeBtn').addEventListener('click', () => {
            if (!practice.active || practice.index === 0) return;
            practice.index--;
            const w = practice.queue[practice.index];
            const hadRating = practice.ratings && practice.ratings[practice.index];
            if (hadRating && w) { undoReviewWord(w); delete practice.ratings[practice.index]; }
            showCurrentPracticeCard(); renderStats();
            if (hadRating) toast('🔄 برگشت', 'warning');
        });
        document.getElementById('autoPlayToggle').addEventListener('click', toggleAutoPlay);
        document.getElementById('autoPlayToggleSession').addEventListener('click', toggleAutoPlay);
        document.getElementById('startQuizAll').addEventListener('click', () => startQuiz('all'));
        document.getElementById('startQuizBad').addEventListener('click', () => startQuiz('bad'));
        document.getElementById('exitQuiz').addEventListener('click', backToQuizHome);
        document.getElementById('addStoryBtn').addEventListener('click', () => {
            switchTab('manage-story');
            resetStoryForm();
            setTimeout(() => document.getElementById('storyTitleInput').scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        });
        document.getElementById('saveStoryBtn').addEventListener('click', saveStory);
        const cancelStoryBtn = document.getElementById('cancelStoryEditBtn');
        if (cancelStoryBtn) cancelStoryBtn.addEventListener('click', () => { resetStoryForm(); });
        document.getElementById('closeStoryReader').addEventListener('click', () => {
            document.getElementById('storyReaderModal').classList.remove('active');
            document.body.classList.remove('locked');
        });
        document.getElementById('saveWordBtn').addEventListener('click', () => {
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
            ['wDe', 'wPlural', 'wFa', 'wEx', 'wExMean', 'wExAudio', 'wNote'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            document.getElementById('wDe').focus();
            renderAll(); populateLessonTargets();
            toast(`✅ به «${target.title}» اضافه شد`, 'success');
        });

        document.getElementById('importFullBookBtn').addEventListener('click', () => document.getElementById('fullBookFileInput').click());
        document.getElementById('replaceFullBookBtn').addEventListener('click', () => document.getElementById('replaceBookFileInput').click());
        document.getElementById('fullBookFileInput').addEventListener('change', e => {
            if (e.target.files[0]) importFullBook(e.target.files[0]);
            e.target.value = '';
        });
        document.getElementById('replaceBookFileInput').addEventListener('change', e => {
            if (e.target.files[0]) replaceFullBook(e.target.files[0]);
            e.target.value = '';
        });
        document.getElementById('exportFullBookBtn').addEventListener('click', exportBook);
        document.getElementById('exportAllBooksBtn').addEventListener('click', () => {
            exportData(state, `german-vocab-backup-${new Date().toISOString().slice(0, 10)}.json`);
            toast('دانلود شد', 'success');
        });

        document.getElementById('importJsonBtn').addEventListener('click', importJsonWords);
        document.getElementById('validateJsonBtn').addEventListener('click', validateJson);
        document.getElementById('clearJsonBtn').addEventListener('click', () => {
            document.getElementById('jsonInput').value = '';
            document.getElementById('jsonPreview').innerHTML = '';
        });
        document.getElementById('exportLessonBtn').addEventListener('click', exportLesson);
        document.getElementById('exportBadBtn').addEventListener('click', exportBad);
        document.getElementById('exportAllBtn').addEventListener('click', () => {
            exportData(state, `german-vocab-backup-${new Date().toISOString().slice(0, 10)}.json`);
            toast('دانلود شد', 'success');
        });
        document.getElementById('backupAllBtn').addEventListener('click', () => {
            exportData(state, `german-vocab-backup-${new Date().toISOString().slice(0, 10)}.json`);
            toast('دانلود شد', 'success');
        });
        document.getElementById('resetBtn').addEventListener('click', () => {
            if (!confirm('همه داده‌ها ریست بشن؟')) return;
            localStorage.removeItem(STORAGE_KEY);
            state = load();
            save(); renderAll();
            toast('ریست شد', 'success');
        });

        document.getElementById('cancelDeleteBookBtn').addEventListener('click', () => {
            document.getElementById('modalDeleteBook').classList.remove('active');
            document.body.classList.remove('locked');
        });
        document.getElementById('delBookConfirmInput').addEventListener('input', checkDeleteBookConfirm);
        document.getElementById('confirmDeleteBookBtn').addEventListener('click', confirmDeleteBook);

        document.querySelectorAll('.modal-overlay').forEach(m => {
            m.addEventListener('click', e => {
                if (e.target === m) {
                    m.classList.remove('active');
                    document.body.classList.remove('locked');
                }
            });
        });
        const wdm = document.getElementById('wordDetailModal');
        if (wdm) wdm.addEventListener('click', e => { if (e.target === wdm) closeWordDetail(); });
        document.getElementById('cancelBookBtn').addEventListener('click', () => {
            document.getElementById('modalBook').classList.remove('active');
            document.body.classList.remove('locked');
            editingBookId = null;
        });
        document.getElementById('cancelLessonBtn').addEventListener('click', () => {
            document.getElementById('modalLesson').classList.remove('active');
            document.body.classList.remove('locked');
        });
        document.getElementById('saveBookBtn').addEventListener('click', () => {
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
                const nb = { id: uid(), name, level, coverImage, lessons: [{ id: uid(), title: 'Lektion 1', words: [], stories: [] }] };
                state.books.push(nb);
                state.activeBookId = nb.id;
                state.activeLessonId = nb.lessons[0].id;
                save();
                document.getElementById('modalBook').classList.remove('active');
                document.body.classList.remove('locked');
                if (isLibrary) { renderBookLibrary(); toast(`✅ «${name}» اضافه شد`, 'success'); }
                else { renderAll(); toast('✅ ذخیره شد', 'success'); }
            }
        });
        document.getElementById('saveLessonBtn').addEventListener('click', () => {
            const title = document.getElementById('lessonTitleInput').value.trim();
            if (!title) { toast('عنوان لازمه', 'error'); return; }
            const b = getBook();
            if (!b) { toast('اول کتاب بساز', 'error'); return; }
            const nl = { id: uid(), title, words: [], stories: [] };
            b.lessons.push(nl);
            state.activeLessonId = nl.id;
            save();
            document.getElementById('modalLesson').classList.remove('active');
            document.body.classList.remove('locked');
            renderAll(); toast('درس اضافه شد', 'success');
        });

        document.getElementById('libraryAddBookBtn').addEventListener('click', openBookModal);
        document.getElementById('libraryImportBtn').addEventListener('click', () => {
            if (state.books.length === 0) { toast('اول کتاب بساز', 'warning'); return; }
            openBook(state.books[0].id);
            setTimeout(() => switchTab('json'), 100);
        });
        document.getElementById('backToLibraryBtn').addEventListener('click', showBookLibrary);

        document.getElementById('importAsNewBookBtn').addEventListener('click', chooseImportAsNewBook);
        document.getElementById('importAsReplaceBtn').addEventListener('click', chooseImportAsReplace);
        document.getElementById('cancelImportBookBtn').addEventListener('click', closeImportBookPopup);
        document.getElementById('confirmNewBookBtn').addEventListener('click', confirmNewBookFromImport);
        document.getElementById('cancelNewBookBtn').addEventListener('click', () => {
            document.getElementById('modalNewBookFromImport').classList.remove('active');
            document.body.classList.remove('locked');
            closeImportBookPopup();
        });
        document.getElementById('confirmReplaceBookBtn').addEventListener('click', confirmReplaceBook);
        document.getElementById('cancelReplaceBookBtn').addEventListener('click', () => {
            document.getElementById('modalReplaceTargetBook').classList.remove('active');
            document.body.classList.remove('locked');
            closeImportBookPopup();
        });

        setupFileDropZone();
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
                const sr = document.getElementById('storyReaderModal');
                if (sr.classList.contains('active')) sr.classList.remove('active');
                if (document.getElementById('wordDetailModal').classList.contains('active')) closeWordDetail();
                if (practice.active) exitPractice();
                document.body.classList.remove('locked');
            }
            if (e.key === ' ' && practice.active) {
                e.preventDefault();
                document.getElementById('flashcardInner').classList.toggle('flipped');
            }
        });
    }

    /* ============ INIT ============ */
    function init() {
        state = load();
        if (!state.activeBookId && state.books.length) state.activeBookId = state.books[0].id;
        const b = getBook();
        if (!state.activeLessonId && b && b.lessons.length) state.activeLessonId = b.lessons[0].id;
        state.books.forEach(bk => (bk.lessons || []).forEach(l => {
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
        }));
        save();
        bindEvents();
        renderAll();
        populateLessonTargets();
        updateAutoPlayUI();
        showBookLibrary();
    }

    init();
})();
