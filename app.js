let currentMode = "tutors";
let comingFromProfile = false;

let cachedTutors         = null;
let cachedMentors        = null;
let cachedLanguageTutors = null;
let sb = null; // Supabase client (Auth + student profile)

document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();

    try {
        const [tutorsRaw, mentorsRaw, langRaw] = await Promise.all([
            getTutors(), getMentors(), getLanguageTutors()
        ]);
        cachedTutors         = tutorsRaw.map(normalizeTutor);
        cachedMentors        = mentorsRaw.map(normalizeMentor);
        cachedLanguageTutors = langRaw.map(normalizeLanguageTutor);
    } catch (e) {
        console.error('Ошибка загрузки данных:', e);
        showLoadError();
        return;
    }

    initStudentAuth();

    const urlParams    = new URLSearchParams(window.location.search);
    const initialView  = urlParams.get('view')  || 'home';
    const initialParam = urlParams.get('param');
    navigateTo(initialView, initialParam, true);
    initMentorsMap(); 
});

window.addEventListener('popstate', (event) => {
    if (event.state?.view) {
        navigateTo(event.state.view, event.state.param, true);
    } else {
        navigateTo('home', null, true);
    }
});

function showLoadError() {
    document.querySelector('main').innerHTML = `
        <div class="flex flex-col items-center justify-center min-h-screen text-center px-4">
            <i data-lucide="wifi-off" class="w-16 h-16 text-gray-300 mb-4"></i>
            <h2 class="text-xl font-bold text-gray-700 mb-2">Не удалось загрузить данные</h2>
            <p class="text-gray-400 mb-6">Проверьте подключение к интернету и обновите страницу</p>
            <button onclick="location.reload()" class="px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700">
                Обновить
            </button>
        </div>`;
    lucide.createIcons();
}

function navigateTo(viewId, param = null, isPopState = false) {
    if (!isPopState) {
        let url = viewId === 'home' ? window.location.pathname : `?view=${viewId}`;
        if (param) url += `&param=${param}`;
        history.pushState({ view: viewId, param }, '', url);
    }

    document.querySelectorAll('.page-section').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });

    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.style.display = 'block';
        setTimeout(() => target.classList.add('active'), 10);
        if (viewId !== 'home') window.scrollTo(0, 0);
    }

    if (viewId === 'catalog') {
        if (!param && !comingFromProfile) resetFilters();
        comingFromProfile = false;
        filterCatalog();
    }

    if (viewId === 'profile'          && param) renderProfile(param);
    if (viewId === 'mentor-profile'   && param) renderMentorProfile(param);
    if (viewId === 'language-profile' && param) renderLanguageProfile(param);
    if (viewId === 'auth') renderAuthView();
    if (viewId === 'student') renderStudentView();

    lucide.createIcons();
}

function scrollToSection(sectionId) {
    setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
}

function toggleMobileMenu() {
    document.getElementById('mobile-menu').classList.toggle('hidden');
}

function initStudentAuth() {
    // OAuth не работает через file:// (нужен http/https origin)
    if (window.location.protocol === 'file:') {
        const btn = document.getElementById('btn-google');
        if (btn) {
            btn.disabled = true;
            btn.classList.add('opacity-60', 'cursor-not-allowed');
        }
        showAuthError('Открой сайт через локальный сервер (http://localhost:...) — OAuth не работает через file://.');
        return;
    }

    try {
        if (!window.supabase || typeof window.supabase.createClient !== 'function') return;
        if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined') return;
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
        console.warn('Supabase init failed', e);
        sb = null;
        return;
    }

    const btn = document.getElementById('btn-google');
    if (btn) {
        btn.addEventListener('click', async () => {
            hideAuthError();
            try {
                const redirectTo = `${window.location.origin}${window.location.pathname}?view=student`;
                const { error } = await sb.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo }
                });
                if (error) throw error;
            } catch (err) {
                showAuthError(err?.message || 'Не удалось войти через Google');
            }
        });
    }

    sb.auth.onAuthStateChange((_event, session) => {
        updateAuthButtons(!!session?.user);
        if (session?.user) {
            const urlParams = new URLSearchParams(window.location.search);
            const view = urlParams.get('view');
            if (view !== 'student') navigateTo('student');
        }
    });

    // Initial state for header/mobile auth buttons
    sb.auth.getSession().then(({ data }) => {
        updateAuthButtons(!!data?.session?.user);
    }).catch(() => {
        updateAuthButtons(false);
    });
}

function showAuthError(message) {
    const errBox = document.getElementById('auth-error');
    if (!errBox) return;
    errBox.textContent = message;
    errBox.classList.remove('hidden');
}

function hideAuthError() {
    const errBox = document.getElementById('auth-error');
    if (!errBox) return;
    errBox.classList.add('hidden');
    errBox.textContent = '';
}

async function renderAuthView() {
    if (!sb) return;
    try {
        const { data } = await sb.auth.getSession();
        const isAuthed = !!data?.session?.user;
        updateAuthButtons(isAuthed);
        if (isAuthed) navigateTo('student');
    } catch {
        // ignore
    }
}

async function renderStudentView() {
    const root = document.getElementById('student-root');
    if (!root) return;

    if (!sb) {
        root.innerHTML = `
            <div class="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-10 text-center">
                <i data-lucide="alert-triangle" class="w-10 h-10 text-amber-500 mx-auto mb-4"></i>
                <h2 class="text-xl font-bold text-gray-900 mb-2">Авторизация недоступна</h2>
                <p class="text-gray-600">Проверь, что Supabase подключён корректно.</p>
                <button onclick="navigateTo('auth')" class="mt-6 px-8 py-3 bg-blue-600 text-white rounded-full font-bold hover:bg-blue-700">
                    Перейти ко входу
                </button>
            </div>`;
        lucide.createIcons();
        return;
    }

    const { data: sessionData } = await sb.auth.getSession();
    const session = sessionData?.session;
    updateAuthButtons(!!session?.user);
    if (!session?.user) {
        navigateTo('auth');
        return;
    }

    root.innerHTML = `
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
                <h1 id="student-greeting-title" class="text-2xl md:text-3xl font-black text-blue-900">Привет! 👋</h1>
                <p id="student-greeting-subtitle" class="text-gray-600">Держим курс на твою мечту.</p>
            </div>
            <div class="flex gap-3">
                <button id="btn-logout" class="px-6 py-2 rounded-full font-medium border-2 border-blue-600 text-blue-600 hover:bg-blue-50 transition-all">
                    Выйти
                </button>
                <button onclick="navigateTo('catalog')" class="px-6 py-2 rounded-full font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-md transition-all">
                    Каталог
                </button>
            </div>
        </div>
        <div id="student-content"></div>
    `;

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        await sb.auth.signOut();
        updateAuthButtons(false);
        navigateTo('home');
    });

    const content = document.getElementById('student-content');
    if (!content) return;

    const user = session.user;
    const profile = await loadStudentProfile(user.id);
    if (!profile) {
        renderOnboarding(content, user);
    } else {
        renderStudentDashboard(content, user, profile);
    }
    lucide.createIcons();
}

async function loadStudentProfile(userId) {
    // Supabase table (preferred)
    try {
        const { data, error } = await sb
            .from('students')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();
        if (!error && data) return data;
    } catch {
        // ignore
    }

    // localStorage fallback
    try {
        const raw = localStorage.getItem(`aalam_student_profile_${userId}`);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

async function saveStudentProfile(userId, patch) {
    const base = (await loadStudentProfile(userId)) || {};
    const next = { ...base, ...patch, user_id: userId, updated_at: new Date().toISOString() };

    try {
        const { error } = await sb.from('students').upsert(next, { onConflict: 'user_id' });
        if (!error) {
            try { localStorage.setItem(`aalam_student_profile_${userId}`, JSON.stringify(next)); } catch {}
            return next;
        }
    } catch {
        // ignore
    }

    try { localStorage.setItem(`aalam_student_profile_${userId}`, JSON.stringify(next)); } catch {}
    return next;
}

function renderOnboarding(container, user) {
    container.innerHTML = `
        <div class="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-10 md:p-12">
            <h2 class="text-2xl font-black text-blue-900">Создадим твой профиль</h2>
            <p class="text-gray-600 mt-2">Пара вопросов — и покажем твой кабинет с фичами как на макете.</p>

            <form id="onboarding-form" class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5">
                <div class="md:col-span-2">
                    <label class="text-sm font-bold text-blue-900">Как тебя зовут?</label>
                    <input name="full_name" required class="mt-2 w-full px-5 py-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
                           placeholder="Например: Асан Байтурсынов"
                           value="${escapeHtml(user.user_metadata?.full_name || user.user_metadata?.name || '')}">
                </div>
                <div>
                    <label class="text-sm font-bold text-blue-900">Цель</label>
                    <select name="goal" required class="mt-2 w-full px-5 py-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-4 focus:ring-blue-100 bg-white">
                        <option value="" selected disabled>Выбери цель</option>
                        <option value="admission">Поступление</option>
                        <option value="exam">Экзамен (SAT/IELTS/ORT)</option>
                    </select>
                </div>
                <div class="md:col-span-2">
                    <label class="text-sm font-bold text-blue-900">Топ-университеты (через запятую)</label>
                    <input name="universities" class="mt-2 w-full px-5 py-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
                           placeholder="Stanford, MIT, UC Berkeley">
                </div>
                <div class="md:col-span-2 flex flex-col sm:flex-row gap-3 items-center justify-between mt-2">
                    <p class="text-xs text-gray-500">Можно изменить позже в профиле.</p>
                    <button class="px-10 py-4 rounded-full font-black bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all">
                        Создать профиль
                    </button>
                </div>
                <div id="onboarding-error" class="md:col-span-2 hidden text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-4"></div>
            </form>
        </div>
    `;

    const form = document.getElementById('onboarding-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errBox = document.getElementById('onboarding-error');
        if (errBox) errBox.classList.add('hidden');

        const fd = new FormData(form);
        const fullName = String(fd.get('full_name') || '').trim();
        const goal = String(fd.get('goal') || '').trim();
        const universities = String(fd.get('universities') || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .slice(0, 10);

        try {
            const saved = await saveStudentProfile(user.id, {
                full_name: fullName,
                goal,
                universities,
                profile_percent: 75,
                plan_percent: 65
            });
            renderStudentDashboard(container, user, saved);
            lucide.createIcons();
        } catch (err) {
            if (errBox) {
                errBox.textContent = err?.message || 'Не удалось сохранить профиль';
                errBox.classList.remove('hidden');
            }
        }
    });
}

function renderStudentDashboard(container, user, profile) {
    const name = profile.full_name || user.user_metadata?.full_name || user.email || 'Ученик';
    const firstName = String(name).split(' ')[0] || 'Ученик';
    const universities = normalizeUniversities(profile.universities);
    const applications = normalizeApplications(profile.applications).length
        ? normalizeApplications(profile.applications)
        : universities.map((u, i) => ({ id: `app-seed-${i}-${Date.now()}`, school: u, status: 'Черновик', deadline: '' }));
    const planSteps = normalizePlanSteps(profile.plan_steps);
    const mentors = normalizeMentorAssignments(profile.mentors);
    const avatarStorageKey = `avatar_${user.id}`;
    let avatarFromStorage = '';
    try {
        avatarFromStorage = String(localStorage.getItem(avatarStorageKey) || '');
    } catch {
        avatarFromStorage = '';
    }
    const avatarUrl = avatarFromStorage || profile.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || '';
    const pct = Number(profile.profile_percent ?? calcProfilePercent(profile));
    const planPct = planStepsToPercent(planSteps);
    const nearestDays = getNearestDeadlineDays(applications);

    const titleEl = document.getElementById('student-greeting-title');
    const subtitleEl = document.getElementById('student-greeting-subtitle');
    if (titleEl) titleEl.textContent = `Привет, ${firstName}! 👋`;
    if (subtitleEl) subtitleEl.textContent = 'Держим курс на твою мечту.';

    container.innerHTML = `
        <div class="student-card bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden mb-6">
            <div class="p-4 sm:p-6 md:p-10 flex flex-col md:flex-row md:items-center gap-6 md:gap-8">
                <div class="flex flex-col items-center text-center gap-4 md:flex-row md:items-center md:text-left md:gap-5">
                    <div class="relative mx-auto md:mx-0">
                        ${avatarUrl
                            ? `<img id="student-avatar-img" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}" class="w-20 h-20 rounded-full object-cover border-2 border-blue-100">`
                            : `<div id="student-avatar-fallback" class="w-20 h-20 rounded-full bg-blue-200 flex items-center justify-center text-2xl font-black text-blue-900">${escapeHtml(firstName.charAt(0))}</div>`}
                        <button id="avatar-upload-btn" class="absolute -right-1 -bottom-1 w-7 h-7 rounded-full bg-white border border-blue-200 text-blue-700 flex items-center justify-center hover:bg-blue-50" title="Добавить фото">
                            <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                        </button>
                        <input id="avatar-file-input" type="file" accept="image/*" class="hidden">
                    </div>
                    <div class="w-full md:w-auto">
                        <h2 class="text-2xl font-black text-blue-900">${escapeHtml(name)}</h2>
                        <p class="text-gray-600 text-sm">${escapeHtml(user.email || '')}</p>
                        <p class="text-gray-500 text-xs mt-1">Ученик Aalam</p>
                        <button id="profile-edit-btn" class="mt-3 text-xs font-bold text-blue-600 hover:underline">Редактировать профиль</button>
                    </div>
                </div>
                <div class="flex-1"></div>
                <div class="w-full md:w-96 bg-blue-50 rounded-2xl p-5 border border-blue-100">
                    <div class="flex justify-between text-sm font-bold text-blue-900">
                        <span>До ближайшего дедлайна</span>
                        <span id="deadline-days-label">${nearestDays === null ? '—' : `${nearestDays} дн.`}</span>
                    </div>
                    <div class="h-2 bg-white rounded-full overflow-hidden mt-3 border border-blue-100">
                        <div id="profile-percent-bar" class="h-full rounded-full"></div>
                    </div>
                    <ul id="deadline-top3" class="mt-4 space-y-1.5 text-xs text-blue-900"></ul>
                </div>
            </div>
            <div id="profile-edit-panel" class="hidden border-t border-gray-100 px-4 sm:px-6 md:px-10 pb-6 md:pb-8">
                <div class="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input id="profile-name-input" type="text" class="rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100" value="${escapeHtml(name)}" placeholder="Имя и фамилия">
                    <select id="profile-goal-input" class="rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-white">
                        <option value="">Цель</option>
                        <option value="admission" ${profile.goal === 'admission' ? 'selected' : ''}>Поступление</option>
                        <option value="exam" ${profile.goal === 'exam' ? 'selected' : ''}>Экзамены</option>
                    </select>
                </div>
                <div class="mt-4 flex gap-2">
                    <button id="profile-save-btn" class="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700">Сохранить</button>
                    <button id="profile-cancel-btn" class="px-5 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-bold hover:bg-gray-50">Отмена</button>
                </div>
            </div>
        </div>

        <div class="dashboard-grid-2col flex flex-col lg:flex-row gap-4 mb-6 items-stretch">
            <div class="w-full lg:w-[35%] student-card bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-4 sm:p-6 md:p-8">
                <div class="flex items-center justify-between">
                    <h3 class="text-lg font-black text-blue-900">Мои менторы</h3>
                    <button id="mentor-manage-btn" class="text-sm font-bold text-blue-600 hover:underline">Назначить</button>
                </div>
                <ul id="mentor-list" class="mt-5 space-y-3"></ul>
                <div id="mentor-empty" class="hidden mt-4">
                    <p class="text-sm text-gray-400">Менторы пока не назначены.</p>
                </div>
            </div>

            <div class="w-full lg:w-[65%] student-card bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-4 sm:p-6 md:p-8">
                <div class="flex items-center justify-between gap-3">
                    <h3 class="text-lg font-black text-blue-900">Трекер поступления</h3>
                    <span class="text-xs font-bold text-gray-400">вуз + приоритет + статус + дедлайн</span>
                </div>
                <div class="mt-5 grid grid-cols-1 gap-2">
                    <input id="tracker-school-input" type="text" class="rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="Название вуза">
                    <div class="tracker-controls grid grid-cols-3 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-2 items-stretch">
                    <select id="tracker-status-input" class="rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white">
                        <option value="Черновик">Черновик</option>
                        <option value="Подготовка документов">Подготовка документов</option>
                        <option value="Подано">Подано</option>
                        <option value="Принят">Принят</option>
                        <option value="Отказ">Отказ</option>
                    </select>
                    <input id="tracker-site-input" type="url" class="hidden md:block rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white" placeholder="Ссылка на сайт вуза">
                    <input id="tracker-deadline-input" type="date" class="rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white">
                    <button id="tracker-add-btn" class="px-4 py-2.5 min-h-[42px] rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 whitespace-nowrap">Добавить</button>
                    </div>
                </div>
                <ul id="tracker-list" class="mt-4 space-y-3"></ul>
                <p id="tracker-empty" class="hidden mt-4 text-sm text-gray-400">Трекер пока пуст.</p>
            </div>
        </div>

        <div class="student-card bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-4 sm:p-6 md:p-10 mb-6">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <div class="flex items-center gap-2">
                        <h3 class="text-lg font-black text-blue-900">Мой план поступления</h3>
                        <span class="inline-flex items-center justify-center w-5 h-5 rounded-full border border-blue-200 text-blue-700 text-xs font-black cursor-help" title="Добавляй и выполняй задачи в блоке «Ближайшие задачи», чтобы видеть прогресс плана.">?</span>
                    </div>
                    <p class="text-sm text-gray-600 mt-1">Общий прогресс</p>
                </div>
            </div>
            <div class="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
                <div class="flex items-center gap-6">
                    <div class="relative w-28 h-28">
                        <svg class="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="42" fill="none" stroke="#e5e7eb" stroke-width="10"/>
                            <circle id="plan-ring" cx="50" cy="50" r="42" fill="none" stroke="#2563eb" stroke-width="10" stroke-linecap="round" stroke-dasharray="263.9" stroke-dashoffset="${(263.9 * (1 - (planPct/100))).toFixed(1)}"/>
                        </svg>
                        <div class="absolute inset-0 flex items-center justify-center">
                            <span id="plan-percent-label" class="text-2xl font-black text-blue-900">${planPct}%</span>
                        </div>
                    </div>
                    <div>
                        <p id="plan-progress-title" class="font-black text-gray-900">${planPct === 0 ? 'Стартуем!' : 'Хороший прогресс!'}</p>
                        <p id="plan-progress-hint" class="text-sm text-gray-500">${planPct === 0 ? 'Выполняй задачи, чтобы увидеть рост прогресса и движение к поступлению.' : 'Продолжай в том же духе.'}</p>
                    </div>
                </div>
                <div class="lg:col-span-2">
                    <div id="plan-category-progress" class="grid grid-cols-2 sm:flex sm:justify-between text-xs sm:text-sm text-gray-600 font-bold gap-2 sm:gap-0"></div>
                    <div class="hidden sm:block h-0.5 bg-gray-100 -mt-6 mx-4 relative -z-10 top-3"></div>
                </div>
            </div>
            <div id="plan-panel" class="hidden mt-8 border-t border-gray-100 pt-6">
                <h4 class="text-sm font-black text-blue-900 mb-3">Шаги плана</h4>
                <ul id="plan-steps-list" class="space-y-2"></ul>
            </div>
        </div>

        <div class="grid grid-cols-1 gap-6 items-stretch">
            <div class="student-card bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-4 sm:p-6 md:p-8 h-full">
                <div class="flex items-center justify-between">
                    <h3 class="text-lg font-black text-blue-900">Ближайшие задачи</h3>
                    <button id="notes-clear-btn" class="text-sm font-bold text-blue-600 hover:underline">Очистить все</button>
                </div>
                <div class="mt-5 w-full grid grid-cols-1 gap-2">
                    <input id="note-input" type="text" maxlength="140" placeholder="Добавь задачу" class="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300">
                    <div class="notes-controls w-full grid grid-cols-2 md:grid-cols-4 gap-2 items-stretch min-w-0">
                        <select id="note-category-input" class="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2.5 min-h-[42px] text-sm bg-white">
                            <option value="Исследование">Исследование</option>
                            <option value="Подготовка">Подготовка</option>
                            <option value="Сбор документов">Сбор документов</option>
                            <option value="Подача">Подача</option>
                        </select>
                        <select id="note-university-input" class="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2.5 min-h-[42px] text-sm bg-white"></select>
                        <input id="note-deadline-input" type="date" class="col-span-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2.5 min-h-[42px] text-sm bg-white">
                        <button id="note-add-btn" class="col-span-1 w-full shrink-0 px-3 py-2.5 min-h-[42px] rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors whitespace-nowrap">Добавить</button>
                    </div>
                </div>
                <ul id="notes-list" class="mt-4 space-y-3"></ul>
                <p id="notes-empty" class="hidden mt-4 text-sm text-gray-400">Заметок пока нет. Добавь первую задачу.</p>
            </div>

            <div class="student-card bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-4 sm:p-6 md:p-8 h-full">
                <h3 class="text-lg font-black text-blue-900">Статистика результатов пробных тестов</h3>
                <div class="results-form mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[auto_1fr_auto_auto] gap-2 items-stretch">
                    <select id="result-exam-input" class="rounded-xl border border-gray-200 px-3 py-2.5 min-h-[42px] text-sm bg-white">
                        <option value="SAT">SAT</option>
                        <option value="IELTS">IELTS</option>
                        <option value="ОРТ">ОРТ</option>
                    </select>
                    <input id="result-score-input" type="number" step="0.1" min="0" class="rounded-xl border border-gray-200 px-4 py-2.5 min-h-[42px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="Балл">
                    <input id="result-date-input" type="date" class="rounded-xl border border-gray-200 px-3 py-2.5 min-h-[42px] text-sm bg-white">
                    <button id="result-add-btn" class="result-add px-4 py-2.5 min-h-[42px] rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 whitespace-nowrap">Добавить</button>
                </div>
                <div id="result-filters" class="mt-4 flex flex-wrap gap-3 text-sm text-gray-700">
                    <label class="inline-flex items-center gap-2"><input type="checkbox" value="SAT" class="result-filter accent-blue-600" checked><span>SAT</span></label>
                    <label class="inline-flex items-center gap-2"><input type="checkbox" value="IELTS" class="result-filter accent-blue-600" checked><span>IELTS</span></label>
                    <label class="inline-flex items-center gap-2"><input type="checkbox" value="ОРТ" class="result-filter accent-blue-600" checked><span>ОРТ</span></label>
                </div>
                <div id="results-charts" class="mt-4 flex flex-col lg:flex-row gap-4"></div>
                <p id="results-empty" class="hidden mt-4 text-sm text-gray-400">Добавь первый результат чтобы увидеть динамику.</p>
            </div>
        </div>
    `;

    const dashboardApi = setupStudentDashboardWidgets(user, {
        ...profile,
        full_name: name,
        profile_percent: pct,
        plan_steps: planSteps,
        universities,
        applications
    });
    setupStudentNotesWidget(user, profile, dashboardApi);
    setupStudentResultsWidget(user);
}

function calcProfilePercent(profile) {
    let score = 30;
    if (profile?.full_name) score += 20;
    if (profile?.goal) score += 15;
    if (profile?.exam) score += 10;
    if (Array.isArray(profile?.universities) && profile.universities.length) {
        score += Math.min(25, profile.universities.length * 8);
    }
    return Math.min(100, score);
}

function defaultPlanSteps() {
    return getPlanCategories().map((c) => ({ title: c.title, done: false }));
}

function getPlanCategories() {
    return [
        { title: 'Исследование' },
        { title: 'Подготовка' },
        { title: 'Сбор документов' },
        { title: 'Подача' }
    ];
}

function buildPlanStepsFromNotes(notes, baseSteps) {
    const categories = getPlanCategories();
    const fallback = normalizePlanSteps(baseSteps);
    return categories.map((c) => {
        const categoryNotes = notes.filter((n) => n.category === c.title);
        const allDone = categoryNotes.length > 0 && categoryNotes.every((n) => n.done);
        return { title: c.title, done: categoryNotes.length ? allDone : false };
    });
}

function normalizePlanSteps(steps) {
    const src = Array.isArray(steps) && steps.length ? steps : defaultPlanSteps();
    return src
        .filter((s) => s && typeof s.title === 'string' && s.title.trim())
        .map((s) => ({ title: s.title.trim().slice(0, 120), done: !!s.done }));
}

function planStepsToPercent(steps) {
    if (!Array.isArray(steps) || !steps.length) return 0;
    const completed = steps.filter((s) => s.done).length;
    return Math.round((completed / steps.length) * 100);
}

function normalizeUniversities(unis) {
    if (!Array.isArray(unis)) return [];
    return unis.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 20);
}

function normalizeApplications(apps) {
    if (!Array.isArray(apps)) return [];
    const allowed = new Set(['Черновик', 'Подготовка документов', 'Подано', 'Принят', 'Отказ']);
    return apps
        .filter((a) => a && typeof a.school === 'string')
        .map((a, i) => ({
            id: a.id || `app-${Date.now()}-${i}`,
            school: a.school.trim().slice(0, 120),
            status: allowed.has(a.status) ? a.status : 'Черновик',
            deadline: a.deadline || '',
            siteUrl: String(a.siteUrl || a.site_url || '').trim().slice(0, 300),
            note: String(a.note || '').trim().slice(0, 180),
            priority: [1, 2, 3].includes(Number(a.priority)) ? Number(a.priority) : 3
        }))
        .filter((a) => a.school);
}

function appStatusClass(status) {
    if (status === 'Принят') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (status === 'Отказ') return 'bg-red-50 text-red-700 border-red-100';
    if (status === 'Подано') return 'bg-blue-50 text-blue-700 border-blue-100';
    if (status === 'Подготовка документов') return 'bg-yellow-50 text-yellow-700 border-yellow-100';
    if (status === 'Черновик') return 'bg-gray-50 text-gray-700 border-gray-200';
    return 'bg-gray-50 text-gray-600 border-gray-100';
}

function appPriorityRowClass(priority) {
    if (Number(priority) === 1) return 'border-l-[3px] border-l-blue-700 bg-blue-50';
    if (Number(priority) === 2) return 'border-l-[3px] border-l-yellow-400 bg-yellow-50';
    return 'border-l-[3px] border-l-gray-400 bg-gray-50';
}

function normalizeMentorAssignments(mentors) {
    if (!Array.isArray(mentors)) return [];
    return mentors
        .filter((m) => m && typeof m.name === 'string')
        .map((m, i) => ({
            id: m.id || `mentor-${i}`,
            name: m.name.trim().slice(0, 80),
            uni: String(m.uni || '').trim().slice(0, 100),
            subject: String(m.subject || m.uni || 'Общий трек').trim().slice(0, 80),
            country: String(m.country || '').trim().slice(0, 80),
            avatar: String(m.avatar || '').trim(),
            source_type: ['mentor', 'tutor', 'language'].includes(String(m.source_type || '')) ? String(m.source_type) : 'mentor'
        }));
}

function normalizeEssayState(essay) {
    const e = essay && typeof essay === 'object' ? essay : {};
    const allowed = new Set(['Черновик', 'Редакция', 'Финал']);
    return {
        status: allowed.has(e.status) ? e.status : 'Черновик',
        version: Number.isFinite(Number(e.version)) ? Math.max(1, Number(e.version)) : 1,
        notes: String(e.notes || '').slice(0, 1000)
    };
}

function getNearestDeadlineDays(applications) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = applications
        .map((a) => a.deadline)
        .filter(Boolean)
        .map((d) => {
            const date = new Date(d);
            date.setHours(0, 0, 0, 0);
            return Math.ceil((date - today) / 86400000);
        })
        .filter((x) => Number.isFinite(x) && x >= 0)
        .sort((a, b) => a - b);
    return days.length ? days[0] : null;
}

function getDeadlineProgressMeta(daysLeft) {
    if (!Number.isFinite(daysLeft)) return { width: 10, barClass: 'bg-gray-300' };
    if (daysLeft <= 1) return { width: 100, barClass: 'bg-red-600' };

    // Piecewise interpolation between anchor points:
    // 30+ days -> 10%, 14 -> 40%, 7 -> 65%, 3 -> 85%, 1 -> 100%.
    const lerp = (x, x1, y1, x2, y2) => y1 + ((x - x1) * (y2 - y1)) / (x2 - x1);
    let width = 10;
    if (daysLeft >= 30) {
        width = 10;
    } else if (daysLeft >= 14) {
        width = lerp(daysLeft, 14, 40, 30, 10);
    } else if (daysLeft >= 7) {
        width = lerp(daysLeft, 7, 65, 14, 40);
    } else if (daysLeft >= 3) {
        width = lerp(daysLeft, 3, 85, 7, 65);
    } else {
        width = lerp(daysLeft, 1, 100, 3, 85);
    }

    let barClass = 'bg-emerald-500';
    if (daysLeft <= 3) {
        barClass = 'bg-red-600';
    } else if (daysLeft <= 14) {
        barClass = 'bg-yellow-500';
    }
    return { width: Math.round(Math.max(10, Math.min(100, width))), barClass };
}

function setupStudentDashboardWidgets(user, baseProfile) {
    const profileStorageKey = `aalam_student_profile_${user.id}`;
    const avatarStorageKey = `avatar_${user.id}`;
    let avatarFromStorage = '';
    try {
        avatarFromStorage = String(localStorage.getItem(avatarStorageKey) || '');
    } catch {
        avatarFromStorage = '';
    }
    let profileFromStorage = {};
    try {
        const raw = localStorage.getItem(profileStorageKey);
        profileFromStorage = raw ? JSON.parse(raw) || {} : {};
    } catch {
        profileFromStorage = {};
    }
    try {
        localStorage.removeItem(`aalam_materials_${user.id}`);
    } catch {
        // ignore
    }
    if (profileFromStorage && typeof profileFromStorage === 'object' && 'materials' in profileFromStorage) {
        delete profileFromStorage.materials;
        try {
            localStorage.setItem(profileStorageKey, JSON.stringify(profileFromStorage));
        } catch {
            // ignore
        }
    }

    let state = {
        full_name: baseProfile.full_name || '',
        goal: baseProfile.goal || '',
        exam: baseProfile.exam || '',
        avatar_url: avatarFromStorage || baseProfile.avatar_url || '',
        profile_percent: Number(baseProfile.profile_percent ?? calcProfilePercent(baseProfile)),
        plan_steps: buildPlanStepsFromNotes(normalizeNotes(baseProfile.quick_notes), baseProfile.plan_steps),
        universities: normalizeUniversities(profileFromStorage.universities),
        applications: normalizeApplications(profileFromStorage.applications),
        mentors: normalizeMentorAssignments(profileFromStorage.mentors),
        essay: normalizeEssayState(baseProfile.essay)
    };
    let universitiesSubscriber = null;
    const syncStateToLocalStorage = () => {
        try {
            const baseStored = localStorage.getItem(profileStorageKey);
            const parsed = baseStored ? JSON.parse(baseStored) : {};
            const next = {
                ...(parsed && typeof parsed === 'object' ? parsed : {}),
                user_id: user.id,
                full_name: state.full_name,
                goal: state.goal,
                exam: state.exam,
                avatar_url: state.avatar_url,
                profile_percent: state.profile_percent,
                plan_steps: state.plan_steps,
                plan_percent: planStepsToPercent(state.plan_steps),
                universities: state.universities,
                applications: state.applications,
                mentors: state.mentors,
                essay: state.essay,
                updated_at: new Date().toISOString()
            };
            delete next.materials;
            localStorage.setItem(profileStorageKey, JSON.stringify(next));
        } catch {
            // ignore
        }
    };

    const persistDashboard = async () => {
        await saveStudentProfile(user.id, {
            full_name: state.full_name,
            goal: state.goal,
            exam: state.exam,
            avatar_url: state.avatar_url,
            profile_percent: state.profile_percent,
            plan_steps: state.plan_steps,
            plan_percent: planStepsToPercent(state.plan_steps),
            universities: state.universities,
            applications: state.applications,
            mentors: state.mentors,
            essay: state.essay
        });
    };

    const updateProfileUI = () => {
        const bar = document.getElementById('profile-percent-bar');
        if (bar) {
            const nearestDays = getNearestDeadlineDays(state.applications);
            const { width, barClass } = getDeadlineProgressMeta(nearestDays);
            bar.style.width = `${width}%`;
            bar.className = `h-full rounded-full ${barClass}`;
        }
        renderTopDeadlines();
    };

    const updatePlanUI = () => {
        const pct = planStepsToPercent(state.plan_steps);
        const ring = document.getElementById('plan-ring');
        const label = document.getElementById('plan-percent-label');
        const progressTitle = document.getElementById('plan-progress-title');
        const progressHint = document.getElementById('plan-progress-hint');
        if (label) label.textContent = `${pct}%`;
        if (progressTitle) progressTitle.textContent = pct === 0 ? 'Стартуем!' : 'Хороший прогресс!';
        if (progressHint) progressHint.textContent = pct === 0
            ? 'Выполняй задачи, чтобы увидеть рост прогресса и движение к поступлению.'
            : 'Продолжай в том же духе.';
        if (ring) ring.style.strokeDashoffset = String((263.9 * (1 - pct / 100)).toFixed(1));
        renderPlanCategoryProgress();
    };

    const renderPlanCategoryProgress = () => {
        const wrap = document.getElementById('plan-category-progress');
        if (!wrap) return;
        wrap.innerHTML = state.plan_steps.map((s, idx) => `
            <div class="text-center flex-1 ${s.done ? 'text-gray-600' : 'text-gray-400'}">
                <div class="w-8 h-8 rounded-full border-2 mx-auto mb-1 flex items-center justify-center font-black ${s.done ? 'border-blue-600 text-blue-700 bg-white' : 'border-gray-200 text-gray-400 bg-gray-50'}">${idx + 1}</div>
                ${escapeHtml(s.title)}
            </div>
        `).join('');
    };

    const renderPlanSteps = () => {
        const list = document.getElementById('plan-steps-list');
        if (!list) return;
        list.innerHTML = state.plan_steps.map((s, idx) => `
            <li class="flex items-center gap-3">
                <input type="checkbox" class="plan-step-checkbox accent-blue-600 w-4 h-4" data-step-idx="${idx}" ${s.done ? 'checked' : ''} disabled>
                <span class="text-sm ${s.done ? 'text-gray-400 line-through' : 'text-gray-700 font-semibold'}">${escapeHtml(s.title)}</span>
            </li>
        `).join('');
    };

    const renderUniversities = () => {
        const list = document.getElementById('uni-list');
        const empty = document.getElementById('uni-empty');
        if (!list || !empty) return;
        if (!state.universities.length) {
            list.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');
        list.innerHTML = state.universities.map((u, idx) => `
            <li class="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50">
                <div class="min-w-0">
                    <p class="font-black text-gray-900 truncate">${escapeHtml(u)}</p>
                    <p class="text-xs text-gray-500">Приоритет ${idx + 1}</p>
                </div>
                <button class="uni-remove-btn text-xs font-bold text-red-600 hover:underline" data-uni-idx="${idx}">Удалить</button>
            </li>
        `).join('');
    };

    const renderMentors = () => {
        const list = document.getElementById('mentor-list');
        const empty = document.getElementById('mentor-empty');
        if (!list || !empty) return;
        if (!state.mentors.length) {
            list.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');
        list.innerHTML = state.mentors.map((m) => `
            <li class="flex flex-col items-center text-center md:flex-row md:items-center md:text-left md:justify-between gap-3 md:gap-4 p-3 rounded-xl border border-gray-100 bg-gray-50">
                <div class="flex flex-col items-center text-center md:flex-row md:items-center md:text-left gap-2 md:gap-3 min-w-0 flex-1">
                    ${m.avatar ? `<img src="${escapeHtml(m.avatar)}" class="w-12 h-12 rounded-full object-cover shrink-0">` : `<div class="w-12 h-12 rounded-full bg-blue-200 flex items-center justify-center font-bold text-blue-900 shrink-0">${escapeHtml(m.name.charAt(0) || 'M')}</div>`}
                    <div class="min-w-0">
                        <button class="mentor-open-btn font-black text-gray-900 text-sm truncate text-center md:text-left hover:underline cursor-pointer" data-mentor-id="${escapeHtml(String(m.id))}" data-mentor-type="${escapeHtml(String(m.source_type || 'mentor'))}">${escapeHtml(m.name)}</button>
                        <p class="text-xs text-gray-500 truncate">${escapeHtml((m.source_type === 'tutor' || m.source_type === 'language') ? (m.subject || '—') : (m.country || '—'))}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 md:ml-3 shrink-0">
                    <button class="mentor-remove-btn text-xs font-bold text-red-600 hover:underline" data-mentor-id="${escapeHtml(String(m.id))}">Убрать</button>
                </div>
            </li>
        `).join('');
        lucide.createIcons();
    };

    const hydrateMentorCountries = async () => {
        if (!state.mentors.length) return;
        const nextMentors = await Promise.all(state.mentors.map(async (m) => {
            if (!m?.id) return m;
            if ((m.source_type || 'mentor') !== 'mentor') return m;
            try {
                const mentorId = String(m.id).includes(':') ? String(m.id).split(':').pop() : String(m.id);
                const fullMentor = normalizeMentor(await getMentorById(mentorId));
                const country = String(fullMentor?.country || fullMentor?.countries || '').trim().slice(0, 80);
                if (!country || country === m.country) return m;
                return { ...m, country };
            } catch {
                return m;
            }
        }));
        const changed = nextMentors.some((m, idx) => m.country !== state.mentors[idx]?.country);
        if (!changed) return;
        state.mentors = nextMentors;
        syncStateToLocalStorage();
        renderMentors();
    };

    const renderTracker = () => {
        const list = document.getElementById('tracker-list');
        const empty = document.getElementById('tracker-empty');
        if (!list || !empty) return;
        if (!state.applications.length) {
            list.innerHTML = '';
            empty.classList.remove('hidden');
            renderTopDeadlines();
            return;
        }
        empty.classList.add('hidden');
        const sortedApps = [...state.applications].sort((a, b) => Number(a.priority || 3) - Number(b.priority || 3));
        list.innerHTML = sortedApps.map((a) => `
            <li class="p-3 rounded-xl border border-gray-100 ${appPriorityRowClass(a.priority)}">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div class="min-w-0 flex-1">
                        <p class="font-black text-gray-900 flex items-center gap-2">
                            <span class="truncate max-w-[280px] sm:max-w-[360px] md:max-w-[420px] whitespace-nowrap overflow-hidden text-ellipsis">${escapeHtml(a.school)}</span>
                            ${a.siteUrl ? `<a href="${escapeHtml(a.siteUrl)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-700" title="Сайт вуза"><i data-lucide="external-link" class="w-3.5 h-3.5"></i></a>` : ''}
                        </p>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 md:flex md:items-center gap-2 md:shrink-0">
                        <select class="tracker-priority-select text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white" data-app-id="${escapeHtml(a.id)}">
                            <option value="1" ${Number(a.priority) === 1 ? 'selected' : ''}>Приоритет 1</option>
                            <option value="2" ${Number(a.priority) === 2 ? 'selected' : ''}>Приоритет 2</option>
                            <option value="3" ${Number(a.priority) === 3 ? 'selected' : ''}>Приоритет 3</option>
                        </select>
                        <select class="tracker-status-select text-xs border rounded-lg px-2 py-1.5 ${appStatusClass(a.status)}" data-app-id="${escapeHtml(a.id)}">
                            <option value="Черновик" ${a.status === 'Черновик' ? 'selected' : ''}>Черновик</option>
                            <option value="Подготовка документов" ${a.status === 'Подготовка документов' ? 'selected' : ''}>Подготовка документов</option>
                            <option value="Подано" ${a.status === 'Подано' ? 'selected' : ''}>Подано</option>
                            <option value="Принят" ${a.status === 'Принят' ? 'selected' : ''}>Принят</option>
                            <option value="Отказ" ${a.status === 'Отказ' ? 'selected' : ''}>Отказ</option>
                        </select>
                        <input type="date" class="tracker-deadline-input text-xs border border-gray-200 rounded-lg px-2 py-1.5" data-app-id="${escapeHtml(a.id)}" value="${escapeHtml(a.deadline || '')}">
                        <button class="tracker-remove-btn text-xs font-bold text-red-600 hover:underline" data-app-id="${escapeHtml(a.id)}">Удалить</button>
                    </div>
                </div>
            </li>
        `).join('');
        lucide.createIcons();
        renderTopDeadlines();
    };

    const renderTopDeadlines = () => {
        const topList = document.getElementById('deadline-top3');
        const label = document.getElementById('deadline-days-label');
        if (!topList || !label) return;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const withDeadlines = state.applications
            .filter((a) => a.deadline)
            .map((a) => {
                const d = new Date(a.deadline);
                d.setHours(0, 0, 0, 0);
                return { ...a, days: Math.ceil((d - today) / 86400000) };
            })
            .filter((a) => Number.isFinite(a.days))
            .sort((a, b) => a.days - b.days);
        const nearest = withDeadlines.find((a) => a.days >= 0);
        label.textContent = nearest ? `${nearest.days} дн.` : '—';
        topList.innerHTML = withDeadlines.slice(0, 3).map((a) => `
            <li class="flex justify-between gap-2">
                <span class="truncate">${escapeHtml(a.school)}</span>
                <span class="shrink-0 ${a.days < 0 ? 'text-red-600' : 'text-blue-700'}">${a.days < 0 ? `${Math.abs(a.days)} дн. проср.` : `${a.days} дн.`}</span>
            </li>
        `).join('') || '<li class="text-gray-500">Добавь дедлайны в трекер поступления</li>';
    };


    const notifyUniversitiesChanged = () => {
        if (typeof universitiesSubscriber === 'function') universitiesSubscriber();
    };

    updateProfileUI();
    updatePlanUI();
    renderPlanSteps();
    renderUniversities();
    renderMentors();
    hydrateMentorCountries();
    renderTracker();

    document.getElementById('mentor-manage-btn')?.addEventListener('click', () => {
        localStorage.setItem(`aalam_assign_mentor_${user.id}`, '1');
        localStorage.setItem('aalam_assign_mentor_current_user', '1');
        navigateTo('catalog');
        setTimeout(() => {
            const mentorRadio = document.querySelector('input[name="mode"][value="mentors"]');
            if (mentorRadio) mentorRadio.checked = true;
            switchMode('mentors');
        }, 40);
    });
    document.getElementById('mentor-list')?.addEventListener('click', async (e) => {
        const openBtn = e.target.closest('.mentor-open-btn');
        if (openBtn) {
            const mentorId = openBtn.getAttribute('data-mentor-id');
            const mentorType = openBtn.getAttribute('data-mentor-type') || 'mentor';
            if (!mentorId) return;
            const profileId = mentorId.includes(':') ? mentorId.split(':').pop() : mentorId;
            if (mentorType === 'tutor') {
                navigateTo('profile', profileId);
            } else if (mentorType === 'language') {
                navigateTo('language-profile', profileId);
            } else {
                navigateTo('mentor-profile', profileId);
            }
            return;
        }
        const btn = e.target.closest('.mentor-remove-btn');
        if (!btn) return;
        if (!confirm('Удалить?')) return;
        const id = btn.getAttribute('data-mentor-id');
        if (!id) return;
        state.mentors = state.mentors.filter((m) => String(m.id) !== id);
        syncStateToLocalStorage();
        renderMentors();
        await persistDashboard();
    });

    const panel = document.getElementById('profile-edit-panel');
    document.getElementById('profile-edit-btn')?.addEventListener('click', () => panel?.classList.toggle('hidden'));
    document.getElementById('profile-cancel-btn')?.addEventListener('click', () => panel?.classList.add('hidden'));
    document.getElementById('profile-save-btn')?.addEventListener('click', async () => {
        state.full_name = String(document.getElementById('profile-name-input')?.value || '').trim() || state.full_name;
        state.goal = String(document.getElementById('profile-goal-input')?.value || '').trim();
        state.profile_percent = calcProfilePercent({
            full_name: state.full_name,
            goal: state.goal,
            exam: state.exam,
            universities: state.universities
        });
        updateProfileUI();
        await persistDashboard();
        panel?.classList.add('hidden');
    });

    const planPanel = document.getElementById('plan-panel');
    const planToggle = document.getElementById('plan-toggle-btn');
    planToggle?.addEventListener('click', () => {
        const hidden = planPanel?.classList.toggle('hidden');
        if (planToggle) planToggle.textContent = hidden ? 'Открыть план' : 'Скрыть план';
    });
    document.getElementById('avatar-upload-btn')?.addEventListener('click', () => {
        document.getElementById('avatar-file-input')?.click();
    });
    const compressAvatarToDataUrl = (sourceDataUrl) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 200;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Canvas context unavailable'));
                return;
            }
            ctx.drawImage(img, 0, 0, 200, 200);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = () => reject(new Error('Failed to load image for compression'));
        img.src = sourceDataUrl;
    });

    document.getElementById('avatar-file-input')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
            if (!dataUrl) return;
            let compressedDataUrl = dataUrl;
            try {
                compressedDataUrl = await compressAvatarToDataUrl(dataUrl);
            } catch {
                // fallback to original image if compression fails
            }
            state.avatar_url = compressedDataUrl;
            try {
                localStorage.setItem(avatarStorageKey, compressedDataUrl);
            } catch {
                // ignore localStorage write errors
            }
            const img = document.getElementById('student-avatar-img');
            const fallback = document.getElementById('student-avatar-fallback');
            if (img) img.src = compressedDataUrl;
            if (fallback) fallback.outerHTML = `<img id="student-avatar-img" src="${escapeHtml(compressedDataUrl)}" class="w-20 h-20 rounded-full object-cover border-2 border-blue-100">`;
            await persistDashboard();
        };
        reader.readAsDataURL(file);
    });

    const uniInput = document.getElementById('uni-input');
    const addUni = async () => {
        const value = String(uniInput?.value || '').trim();
        if (!value) return;
        if (state.universities.some((u) => u.toLowerCase() === value.toLowerCase())) {
            if (uniInput) uniInput.value = '';
            return;
        }
        state.universities.push(value.slice(0, 120));
        notifyUniversitiesChanged();
        if (uniInput) uniInput.value = '';
        state.profile_percent = calcProfilePercent({
            full_name: state.full_name,
            goal: state.goal,
            exam: state.exam,
            universities: state.universities
        });
        updateProfileUI();
        renderUniversities();
        await persistDashboard();
    };
    document.getElementById('uni-add-btn')?.addEventListener('click', addUni);
    uniInput?.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            await addUni();
        }
    });
    document.getElementById('uni-list')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.uni-remove-btn');
        if (!btn) return;
        const idx = Number(btn.getAttribute('data-uni-idx'));
        if (Number.isNaN(idx)) return;
        const [removed] = state.universities.splice(idx, 1);
        notifyUniversitiesChanged();
        if (removed) state.applications = state.applications.filter((a) => a.school.toLowerCase() !== removed.toLowerCase());
        state.profile_percent = calcProfilePercent({
            full_name: state.full_name,
            goal: state.goal,
            exam: state.exam,
            universities: state.universities
        });
        updateProfileUI();
        renderUniversities();
        renderTracker();
        await persistDashboard();
    });

    const appSchool = document.getElementById('tracker-school-input');
    const addApp = async () => {
        const school = String(appSchool?.value || '').trim();
        const status = String(document.getElementById('tracker-status-input')?.value || 'Черновик');
        const siteUrl = String(document.getElementById('tracker-site-input')?.value || '').trim();
        const deadline = String(document.getElementById('tracker-deadline-input')?.value || '');
        if (!school) return;
        if (state.applications.some((a) => a.school.toLowerCase() === school.toLowerCase())) return;
        state.applications.unshift({
            id: `app-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
            school: school.slice(0, 120),
            status,
            deadline,
            siteUrl: siteUrl.slice(0, 300),
            priority: 3
        });
        if (!state.universities.some((u) => u.toLowerCase() === school.toLowerCase())) {
            state.universities.push(school.slice(0, 120));
            notifyUniversitiesChanged();
        }
        if (appSchool) appSchool.value = '';
        const deadlineInput = document.getElementById('tracker-deadline-input');
        const siteInput = document.getElementById('tracker-site-input');
        if (deadlineInput) deadlineInput.value = '';
        if (siteInput) siteInput.value = '';
        state.profile_percent = calcProfilePercent({
            full_name: state.full_name,
            goal: state.goal,
            exam: state.exam,
            universities: state.universities
        });
        updateProfileUI();
        renderTracker();
        await persistDashboard();
    };
    document.getElementById('tracker-add-btn')?.addEventListener('click', addApp);
    appSchool?.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            await addApp();
        }
    });
    document.getElementById('tracker-list')?.addEventListener('change', async (e) => {
        const sel = e.target;
        if (sel instanceof HTMLSelectElement && sel.classList.contains('tracker-priority-select')) {
            const id = sel.getAttribute('data-app-id');
            if (!id) return;
            const priority = [1, 2, 3].includes(Number(sel.value)) ? Number(sel.value) : 3;
            state.applications = state.applications.map((a) => a.id === id ? { ...a, priority } : a);
            renderTracker();
            await persistDashboard();
            return;
        }
        if (sel instanceof HTMLSelectElement && sel.classList.contains('tracker-status-select')) {
            const id = sel.getAttribute('data-app-id');
            if (!id) return;
            state.applications = state.applications.map((a) => a.id === id ? { ...a, status: sel.value } : a);
            updateProfileUI();
            renderTracker();
            await persistDashboard();
            return;
        }
        if (sel instanceof HTMLInputElement && sel.classList.contains('tracker-deadline-input')) {
            const id = sel.getAttribute('data-app-id');
            if (!id) return;
            state.applications = state.applications.map((a) => a.id === id ? { ...a, deadline: sel.value } : a);
            updateProfileUI();
            renderTracker();
            await persistDashboard();
            return;
        }
    });
    document.getElementById('tracker-list')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.tracker-remove-btn');
        if (!btn) return;
        if (!confirm('Удалить?')) return;
        const id = btn.getAttribute('data-app-id');
        if (!id) return;
        const removing = state.applications.find((a) => a.id === id);
        state.applications = state.applications.filter((a) => a.id !== id);
        if (removing) {
            const stillExists = state.applications.some((a) => a.school.toLowerCase() === removing.school.toLowerCase());
            if (!stillExists) {
                state.universities = state.universities.filter((u) => u.toLowerCase() !== removing.school.toLowerCase());
                notifyUniversitiesChanged();
            }
        }
        state.profile_percent = calcProfilePercent({
            full_name: state.full_name,
            goal: state.goal,
            exam: state.exam,
            universities: state.universities
        });
        syncStateToLocalStorage();
        updateProfileUI();
        renderTracker();
        await persistDashboard();
    });

    const syncPlanWithTasks = (notes) => {
        state.plan_steps = buildPlanStepsFromNotes(normalizeNotes(notes), state.plan_steps);
        renderPlanSteps();
        updatePlanUI();
        persistDashboard();
    };

    return {
        syncPlanWithTasks,
        getUniversities: () => [...state.universities],
        setUniversitiesSubscriber: (cb) => {
            universitiesSubscriber = typeof cb === 'function' ? cb : null;
        }
    };
}

async function selectMentorForStudent(mentorId, sourceType = 'mentor') {
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    const user = data?.session?.user;
    if (!user) return;

    const profile = (await loadStudentProfile(user.id)) || {};
    const mentors = normalizeMentorAssignments(profile.mentors);
    const entryId = `${sourceType}:${mentorId}`;
    if (sourceType === 'mentor') {
        let mentor = null;
        try {
            mentor = normalizeMentor(await getMentorById(mentorId));
        } catch {
            mentor = cachedMentors?.find((m) => Number(m.id) === Number(mentorId)) || null;
        }
        if (!mentor) return;
        if (!mentors.some((m) => String(m.id) === String(entryId))) {
            mentors.push({
                id: entryId,
                name: mentor.name,
                uni: mentor.uni || mentor.countries || '',
                subject: mentor.major || mentor.countries || mentor.uni || 'Общий трек',
                country: mentor.country || mentor.countries || '',
                avatar: mentor.photoUrl || '',
                source_type: 'mentor'
            });
        }
    } else if (sourceType === 'tutor') {
        let tutor = null;
        try {
            tutor = normalizeTutor(await getTutorById(mentorId));
        } catch {
            tutor = cachedTutors?.find((t) => Number(t.id) === Number(mentorId)) || null;
        }
        if (!tutor) return;
        if (!mentors.some((m) => String(m.id) === String(entryId))) {
            mentors.push({
                id: entryId,
                name: tutor.name,
                uni: '',
                subject: tutor.role || 'Экзамены',
                country: '',
                avatar: tutor.photoUrl || '',
                source_type: 'tutor'
            });
        }
    } else if (sourceType === 'language') {
        let languageTutor = null;
        try {
            languageTutor = normalizeLanguageTutor(await getLanguageTutorById(mentorId));
        } catch {
            languageTutor = cachedLanguageTutors?.find((t) => Number(t.id) === Number(mentorId)) || null;
        }
        if (!languageTutor) return;
        if (!mentors.some((m) => String(m.id) === String(entryId))) {
            mentors.push({
                id: entryId,
                name: languageTutor.name,
                uni: '',
                subject: languageTutor.language || 'Языки',
                country: '',
                avatar: languageTutor.photoUrl || '',
                source_type: 'language'
            });
        }
    }
    await saveStudentProfile(user.id, { mentors });
    localStorage.removeItem(`aalam_assign_mentor_${user.id}`);
    localStorage.setItem('aalam_assign_mentor_current_user', '0');
    navigateTo('student');
}

function isMentorAssignModeForCurrentUser() {
    try {
        const raw = localStorage.getItem('aalam_assign_mentor_current_user');
        return raw === '1';
    } catch {
        return false;
    }
}

async function syncMentorAssignModeFlag() {
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    const uid = data?.session?.user?.id;
    if (!uid) {
        localStorage.removeItem('aalam_assign_mentor_current_user');
        return;
    }
    const enabled = localStorage.getItem(`aalam_assign_mentor_${uid}`) === '1';
    localStorage.setItem('aalam_assign_mentor_current_user', enabled ? '1' : '0');
}

function formatDeadline(deadline) {
    if (!deadline) return '—';
    const d = new Date(deadline);
    if (Number.isNaN(d.getTime())) return deadline;
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

function formatDateRu(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
}

function getTopDeadlineItems(applications, maxItems = 3) {
    return applications
        .filter((a) => a.deadline)
        .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))
        .slice(0, maxItems)
        .map((a) => ({
            school: a.school,
            dateText: formatDeadline(a.deadline)
        }));
}

async function refreshMentorAssignMode() {
    await syncMentorAssignModeFlag();
}

function escapeHtml(str) {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function updateAuthButtons(isAuthed) {
    const headerBtn = document.getElementById('header-auth-btn');
    const mobileHeaderBtn = document.getElementById('header-auth-btn-mobile');
    const mobileBtn = document.getElementById('mobile-auth-btn');

    if (headerBtn) {
        const label = isAuthed ? 'Профиль' : 'Войти';
        headerBtn.innerHTML = `<i data-lucide="user" class="w-5 h-5"></i>`;
        headerBtn.setAttribute('aria-label', label);
        headerBtn.setAttribute('title', label);
        headerBtn.onclick = () => navigateTo(isAuthed ? 'student' : 'auth');
    }
    if (mobileHeaderBtn) {
        const label = isAuthed ? 'Профиль' : 'Войти';
        mobileHeaderBtn.innerHTML = `<i data-lucide="user" class="w-5 h-5"></i>`;
        mobileHeaderBtn.setAttribute('aria-label', label);
        mobileHeaderBtn.setAttribute('title', label);
        mobileHeaderBtn.onclick = () => navigateTo(isAuthed ? 'student' : 'auth');
    }
    if (mobileBtn) {
        mobileBtn.textContent = isAuthed ? 'Профиль' : 'Войти';
        mobileBtn.onclick = () => {
            navigateTo(isAuthed ? 'student' : 'auth');
            toggleMobileMenu();
        };
    }
    lucide.createIcons();
}

function getDefaultStudentNotes() {
    return [
        { id: `note-${Date.now()}-1`, text: 'Изучить требования 5 университетов', done: false, category: 'Исследование', university: '', deadline: '' },
        { id: `note-${Date.now()}-2`, text: 'Подготовиться к SAT (Math)', done: false, category: 'Подготовка', university: '', deadline: '' },
        { id: `note-${Date.now()}-3`, text: 'Собрать рекомендации', done: false, category: 'Сбор документов', university: '', deadline: '' }
    ];
}

function normalizeNotes(notes) {
    const allowedCategories = new Set(getPlanCategories().map((c) => c.title));
    if (!Array.isArray(notes)) return [];
    return notes
        .filter((n) => n && typeof n.text === 'string' && n.text.trim())
        .map((n, i) => ({
            id: n.id || `note-${Date.now()}-${i}`,
            text: n.text.trim().slice(0, 140),
            done: !!n.done,
            category: allowedCategories.has(n.category) ? n.category : 'Исследование',
            university: String(n.university || '').trim().slice(0, 120),
            deadline: String(n.deadline || '').slice(0, 10)
        }));
}

function renderNotesList(notes, listEl, emptyEl, clearBtn) {
    if (!listEl || !emptyEl || !clearBtn) return;
    if (!notes.length) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        clearBtn.textContent = 'Очистить';
        return;
    }

    emptyEl.classList.add('hidden');
    const completedCount = notes.filter((n) => n.done).length;
    clearBtn.textContent = completedCount > 0 ? `Очистить все (${notes.length})` : 'Очистить все';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    listEl.innerHTML = notes.map((n) => {
        let urgencyClass = 'border-gray-100 bg-gray-50';
        if (!n.done && n.deadline) {
            const d = new Date(n.deadline);
            d.setHours(0, 0, 0, 0);
            const daysLeft = Math.ceil((d - today) / 86400000);
            if (Number.isFinite(daysLeft) && daysLeft < 0) urgencyClass = 'border-red-200 bg-red-50';
            else if (Number.isFinite(daysLeft) && daysLeft <= 2) urgencyClass = 'border-yellow-200 bg-yellow-50';
        }
        if (n.done) urgencyClass = 'border-emerald-100 bg-emerald-50/70';
        return `
        <li class="flex items-start gap-3 p-3 rounded-xl border ${urgencyClass}">
            <button
                class="note-toggle mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${n.done ? 'border-emerald-500 bg-emerald-500' : 'border-blue-500'}"
                data-note-id="${escapeHtml(n.id)}"
                aria-label="Переключить выполнение"
            >
                ${n.done ? '<i data-lucide="check" class="w-3 h-3 text-white"></i>' : ''}
            </button>
            <div class="flex-1 min-w-0">
                <p class="text-sm ${n.done ? 'text-gray-400 line-through' : 'text-gray-800 font-semibold'}">${escapeHtml(n.text)}</p>
                <p class="text-xs mt-1 ${n.done ? 'text-gray-300' : 'text-blue-600 font-semibold'}">${escapeHtml(n.category || 'Исследование')}</p>
                ${n.university ? `<span class="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">${escapeHtml(n.university)}</span>` : ''}
                ${n.deadline ? `<p class="text-xs mt-1 ${n.done ? 'text-gray-300' : 'text-gray-600'}">Дедлайн: ${formatDateRu(n.deadline)}</p>` : ''}
            </div>
        </li>
    `;
    }).join('');
    lucide.createIcons();
}

function setupStudentNotesWidget(user, profile, dashboardApi) {
    const inputEl = document.getElementById('note-input');
    const categoryEl = document.getElementById('note-category-input');
    const universityEl = document.getElementById('note-university-input');
    const deadlineEl = document.getElementById('note-deadline-input');
    const addBtn = document.getElementById('note-add-btn');
    const clearBtn = document.getElementById('notes-clear-btn');
    const listEl = document.getElementById('notes-list');
    const emptyEl = document.getElementById('notes-empty');
    if (!inputEl || !categoryEl || !universityEl || !deadlineEl || !addBtn || !clearBtn || !listEl || !emptyEl) return;

    const storageKey = `tasks_${user.id}`;
    let notes = [];
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw) notes = normalizeNotes(JSON.parse(raw));
    } catch {
        notes = [];
    }
    renderNotesList(notes, listEl, emptyEl, clearBtn);
    if (typeof dashboardApi?.syncPlanWithTasks === 'function') dashboardApi.syncPlanWithTasks(notes);

    const renderUniversityOptions = () => {
        const universities = typeof dashboardApi?.getUniversities === 'function' ? dashboardApi.getUniversities() : [];
        const universityList = Array.isArray(universities) ? universities : [];
        const uniOptions = universityList.length
            ? universityList.map((u) => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('')
            : '';
        universityEl.innerHTML = `<option value="">Без привязки к вузу</option>${uniOptions}`;
        if (universityList.includes(universityEl.value)) return;
        universityEl.value = '';
    };
    renderUniversityOptions();
    if (typeof dashboardApi?.setUniversitiesSubscriber === 'function') {
        dashboardApi.setUniversitiesSubscriber(renderUniversityOptions);
    }

    const persistNotes = async (skipLocal = false) => {
        if (!skipLocal) {
            try {
                localStorage.setItem(storageKey, JSON.stringify(notes));
            } catch {
                // ignore localStorage write errors
            }
        }
        try {
            await saveStudentProfile(user.id, { quick_notes: notes });
        } catch {
            // fail silently, UI still works with current session data
        }
    };

    const addNote = async () => {
        const text = inputEl.value.trim();
        const category = String(categoryEl.value || '').trim();
        if (!text) return;
        notes.unshift({
            id: `note-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
            text: text.slice(0, 140),
            done: false,
            category: category || 'Исследование',
            university: String(universityEl.value || '').trim().slice(0, 120),
            deadline: String(deadlineEl.value || '')
        });
        inputEl.value = '';
        categoryEl.value = categoryEl.value || 'Исследование';
        deadlineEl.value = '';
        renderNotesList(notes, listEl, emptyEl, clearBtn);
        if (typeof dashboardApi?.syncPlanWithTasks === 'function') dashboardApi.syncPlanWithTasks(notes);
        await persistNotes();
    };

    addBtn.addEventListener('click', addNote);
    inputEl.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            await addNote();
        }
    });

    listEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('.note-toggle');
        if (!btn) return;
        const id = btn.getAttribute('data-note-id');
        if (!id) return;
        notes = notes.map((n) => n.id === id ? { ...n, done: !n.done } : n);
        renderNotesList(notes, listEl, emptyEl, clearBtn);
        if (typeof dashboardApi?.syncPlanWithTasks === 'function') dashboardApi.syncPlanWithTasks(notes);
        await persistNotes();
    });

    clearBtn.addEventListener('click', async () => {
        try {
            localStorage.removeItem(storageKey);
        } catch {
            // ignore localStorage remove errors
        }
        notes = [];
        renderNotesList(notes, listEl, emptyEl, clearBtn);
        if (typeof dashboardApi?.syncPlanWithTasks === 'function') dashboardApi.syncPlanWithTasks(notes);
        await persistNotes(true);
    });
}

function setupStudentResultsWidget(user) {
    const examEl = document.getElementById('result-exam-input');
    const scoreEl = document.getElementById('result-score-input');
    const dateEl = document.getElementById('result-date-input');
    const addBtn = document.getElementById('result-add-btn');
    const emptyEl = document.getElementById('results-empty');
    const chartsRootEl = document.getElementById('results-charts');
    const filterEls = Array.from(document.querySelectorAll('.result-filter'));
    if (!examEl || !scoreEl || !dateEl || !addBtn || !emptyEl || !chartsRootEl || !filterEls.length) return;

    const examConfig = {
        SAT: {
            color: '#1D4ED8',
            yMin: 400,
            yMax: 1600,
            title: 'SAT',
            storageKey: `results_sat_${user.id}`,
            canvasId: 'results-chart-sat'
        },
        IELTS: {
            color: '#DC2626',
            yMin: 0,
            yMax: 9,
            title: 'IELTS',
            storageKey: `results_ielts_${user.id}`,
            canvasId: 'results-chart-ielts'
        },
        'ОРТ': {
            color: '#FFD700',
            yMin: 0,
            yMax: 245,
            title: 'ОРТ',
            storageKey: `results_ort_${user.id}`,
            canvasId: 'results-chart-ort'
        }
    };
    const examOrder = Object.keys(examConfig);
    const chartsByExam = {};
    const resultsByExam = {
        SAT: [],
        IELTS: [],
        'ОРТ': []
    };

    const normalizeResults = (src) => {
        if (!Array.isArray(src)) return [];
        return src
            .map((r, i) => ({
                id: String(r?.id || `result-${Date.now()}-${i}`),
                score: Number(r?.score),
                date: String(r?.date || '')
            }))
            .filter((r) => Number.isFinite(r.score) && r.date);
    };

    const loadExamResults = (exam) => {
        try {
            const raw = localStorage.getItem(examConfig[exam].storageKey);
            return raw ? normalizeResults(JSON.parse(raw)) : [];
        } catch {
            return [];
        }
    };

    const persistExamResults = (exam) => {
        try {
            localStorage.setItem(examConfig[exam].storageKey, JSON.stringify(resultsByExam[exam]));
        } catch {
            // ignore localStorage write errors
        }
    };

    const getSelectedExams = () => filterEls.filter((el) => el.checked).map((el) => el.value).filter((v) => examOrder.includes(v));

    const destroyCharts = () => {
        Object.keys(chartsByExam).forEach((exam) => {
            if (chartsByExam[exam]) {
                chartsByExam[exam].destroy();
                delete chartsByExam[exam];
            }
        });
    };

    const renderChartsLayout = (selectedExams) => {
        chartsRootEl.innerHTML = selectedExams.map((exam) => `
            <div class="w-full rounded-2xl border border-gray-100 p-4 bg-gray-50" style="flex: 1 1 ${selectedExams.length === 1 ? '100%' : '0%'};">
                <p class="text-sm font-bold text-blue-900 mb-3">${examConfig[exam].title}</p>
                <div class="h-[320px]">
                    <canvas id="${examConfig[exam].canvasId}"></canvas>
                </div>
                <div id="${examConfig[exam].canvasId}-notice" class="hidden mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700"></div>
            </div>
        `).join('');
    };

    const render = () => {
        const totalResults = examOrder.reduce((sum, exam) => sum + resultsByExam[exam].length, 0);
        const selectedExams = getSelectedExams();
        emptyEl.classList.toggle('hidden', totalResults > 0);
        if (!totalResults) {
            destroyCharts();
            chartsRootEl.innerHTML = '';
            return;
        }
        if (typeof Chart === 'undefined') return;

        destroyCharts();
        renderChartsLayout(selectedExams);

        selectedExams.forEach((exam) => {
            const cfg = examConfig[exam];
            const canvas = document.getElementById(cfg.canvasId);
            const noticeEl = document.getElementById(`${cfg.canvasId}-notice`);
            if (!canvas) return;
            const sorted = [...resultsByExam[exam]].sort((a, b) => new Date(a.date) - new Date(b.date));
            const labels = sorted.map((r) => r.date);
            const data = sorted.map((r) => r.score);

            const hideNotice = () => {
                if (!noticeEl) return;
                noticeEl.classList.add('hidden');
                noticeEl.innerHTML = '';
            };
            const showNoticeForIndex = (pointIndex) => {
                if (!noticeEl || !Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= sorted.length) {
                    hideNotice();
                    return;
                }
                const point = sorted[pointIndex];
                noticeEl.classList.remove('hidden');
                noticeEl.innerHTML = `
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <p class="font-bold text-gray-900">${formatDateRu(point.date)}</p>
                            <p class="text-gray-600">${cfg.title}: ${point.score}</p>
                        </div>
                        <button type="button" class="result-delete-btn text-red-600 font-bold hover:underline" data-result-id="${escapeHtml(point.id)}">Удалить</button>
                    </div>
                `;
                const deleteBtn = noticeEl.querySelector('.result-delete-btn');
                deleteBtn?.addEventListener('click', () => {
                    resultsByExam[exam] = resultsByExam[exam].filter((r) => String(r.id) !== String(point.id));
                    persistExamResults(exam);
                    render();
                });
            };

            chartsByExam[exam] = new Chart(canvas, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: cfg.title,
                        data,
                        borderColor: cfg.color,
                        backgroundColor: cfg.color,
                        tension: 0.25,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        fill: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick(_event, activeElements) {
                        if (!activeElements?.length) return;
                        showNoticeForIndex(activeElements[0].index);
                    },
                    scales: {
                        x: {
                            ticks: {
                                color: '#64748b',
                                callback(value) {
                                    const label = this.getLabelForValue(value);
                                    return label ? formatDateRu(label) : '';
                                }
                            },
                            grid: { color: '#e5e7eb' }
                        },
                        y: {
                            min: cfg.yMin,
                            max: cfg.yMax,
                            title: {
                                display: true,
                                text: cfg.title,
                                color: '#334155',
                                font: { weight: 'bold' }
                            },
                            ticks: { color: '#64748b' },
                            grid: { color: '#e5e7eb' }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title(items) {
                                    const date = items?.[0]?.label;
                                    return date ? formatDateRu(date) : '';
                                },
                                label(ctx) {
                                    return `${cfg.title}: ${ctx.raw ?? ''}`;
                                }
                            }
                        }
                    }
                }
            });
        });
    };

    examOrder.forEach((exam) => {
        resultsByExam[exam] = loadExamResults(exam);
    });

    addBtn.addEventListener('click', () => {
        const exam = String(examEl.value || '');
        const score = Number(scoreEl.value);
        const date = String(dateEl.value || '');
        if (!examConfig[exam] || !Number.isFinite(score) || !date) return;
        resultsByExam[exam].push({
            id: `result-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
            score,
            date
        });
        persistExamResults(exam);
        scoreEl.value = '';
        dateEl.value = '';
        render();
    });

    filterEls.forEach((el) => el.addEventListener('change', render));

    render();
}

function filterCatalog() {
    if (!cachedTutors || !cachedMentors || !cachedLanguageTutors) return;
    const q = document.getElementById('catalog-search').value.toLowerCase();

    if (currentMode === "tutors") {
        const checked = Array.from(
            document.querySelectorAll('#exam-filters input:checked, #olympiad-filters input:checked')
        ).map(i => i.value.toLowerCase());

        const filtered = cachedTutors.filter(t => {
            const matchQ = t.name.toLowerCase().includes(q) || t.role.toLowerCase().includes(q);
            const matchF = checked.length === 0 || checked.some(f => t.role.toLowerCase().includes(f));
            return matchQ && matchF;
        });
        renderCatalog(filtered);

    } else if (currentMode === "mentors") {
        const checked = Array.from(
            document.querySelectorAll('#country-filters input:checked')
        ).map(i => i.value);

        const filtered = cachedMentors.filter(m => {
            const matchQ = m.name.toLowerCase().includes(q);
            const matchF = checked.length === 0 || checked.some(c => m.countries.includes(c));
            return matchQ && matchF;
        });
        renderMentors(filtered);

    } else if (currentMode === "languages") {
        const checked = Array.from(
            document.querySelectorAll('#language-filters input:checked')
        ).map(i => i.value);

        const filtered = cachedLanguageTutors.filter(t => {
            const matchQ = t.name.toLowerCase().includes(q) || t.language.toLowerCase().includes(q);
            const matchF = checked.length === 0 || checked.some(l => t.language.includes(l));
            return matchQ && matchF;
        });
        renderLanguageTutors(filtered);
    }
}

function filterTutorsByTag(tag) {
    switchMode('tutors');
    const radio = document.querySelector('input[name="mode"][value="tutors"]');
    if (radio) radio.checked = true;
    document.querySelectorAll('#exam-filters input, #olympiad-filters input, #country-filters input')
             .forEach(i => i.checked = false);
    const cb = document.querySelector(`#exam-filters input[value="${tag}"], #olympiad-filters input[value="${tag}"]`);
    if (cb) cb.checked = true;
    filterCatalog();
}

function resetFilters() {
    document.getElementById('catalog-search').value = '';
    document.querySelectorAll('#exam-filters input, #olympiad-filters input, #country-filters input, #language-filters input')
            .forEach(i => i.checked = false);
    const radio = document.querySelector('input[name="mode"][value="mentors"]');
    if (radio) radio.checked = true;
    switchMode('mentors');
}

function switchMode(mode) {
    currentMode = mode;
    document.getElementById("country-filters").style.display          = mode === "mentors"   ? "block" : "none";
    document.getElementById("exam-filters-wrapper").style.display     = mode === "tutors"    ? "block" : "none";
    document.getElementById("olympiad-filters-wrapper").style.display = mode === "tutors"    ? "block" : "none";
    document.getElementById("language-filters-wrapper").style.display = mode === "languages" ? "block" : "none";
    filterCatalog();
}

function renderCatalog(list) {
    const grid      = document.getElementById('tutors-grid');
    const noResults = document.getElementById('no-results');
    const isAssignMode = isMentorAssignModeForCurrentUser();

    if (!list.length) {
        grid.style.display = 'none';
        noResults.classList.remove('hidden');
        return;
    }
    noResults.classList.add('hidden');
    grid.style.display = 'grid';
    grid.innerHTML = list.map(t => `
        <div class="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 overflow-hidden flex flex-col">
            <div class="p-6">
                <div class="flex items-start gap-4 mb-4">
                    ${t.photoUrl
                        ? `<img src="${t.photoUrl}" alt="${t.name}" class="w-16 h-16 rounded-full flex-shrink-0 object-cover border border-gray-100">`
                        : `<div class="w-16 h-16 ${t.avatarColor} rounded-full flex-shrink-0 flex items-center justify-center text-xl font-bold text-gray-600">${t.name.charAt(0)}</div>`}
                    <div>
                        <h3 class="font-bold text-blue-900 text-lg">${t.name}</h3>
                        <div class="flex items-center text-yellow-500 text-xs gap-1 mt-1">
                            <span class="text-yellow-400">${'★'.repeat(Math.floor(t.rating))}${'☆'.repeat(5 - Math.floor(t.rating))}</span>
                            <span class="text-gray-400">${t.rating} из 5.0 (${t.reviews} отзывов)</span>
                        </div>
                    </div>
                </div>
                <div class="mb-4">
                    <p class="font-bold text-blue-900 text-sm mb-1">Экзамены: ${t.role}</p>
                    <p class="text-gray-600 text-xs line-clamp-2 mb-2"><span class="font-semibold text-gray-700">О себе:</span> ${t.about}</p>
                    <p class="text-gray-600 text-xs line-clamp-2"><span class="font-semibold text-gray-700">Опыт:</span> ${t.experience}</p>
                </div>
                <div class="flex items-center justify-between mt-auto pt-4 border-t border-gray-50">
                    <div>
                        <p class="text-green-700 font-bold text-sm">Цена за курс: ${t.price}</p>
                        <p class="text-gray-900 font-bold text-sm">Пробный урок: 100 с/30 мин</p>
                    </div>
                    ${isAssignMode
                        ? `<button onclick="selectMentorForStudent(${t.id}, 'tutor')" class="cursor-pointer px-6 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors">Выбрать</button>`
                        : `<button onclick="navigateTo('profile', ${t.id})" class="cursor-pointer px-6 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors">Подробнее</button>`
                    }
                </div>
            </div>
        </div>`).join('');
    lucide.createIcons();
}

function renderMentors(list) {
    const grid      = document.getElementById('tutors-grid');
    const noResults = document.getElementById('no-results');
    const isAssignMode = isMentorAssignModeForCurrentUser();

    if (!list.length) {
        grid.style.display = 'none';
        noResults.classList.remove('hidden');
        return;
    }
    noResults.classList.add('hidden');
    grid.style.display = 'grid';
    grid.innerHTML = list.map(m => `
        <div class="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 overflow-hidden flex flex-col">
            <div class="p-6">
                <div class="flex items-start gap-4 mb-4">
                    ${m.photoUrl
                        ? `<img src="${m.photoUrl}" alt="${m.name}" class="w-16 h-16 rounded-full flex-shrink-0 object-cover border border-gray-100">`
                        : `<div class="w-16 h-16 bg-blue-200 rounded-full flex-shrink-0 flex items-center justify-center text-xl font-bold text-gray-600">${m.name.charAt(0)}</div>`}
                    <div>
                        <h3 class="font-bold text-blue-900 text-lg">${m.name}</h3>
                        <div class="flex items-center text-yellow-500 text-xs gap-1 mt-1">
                            <span class="text-yellow-400">${'★'.repeat(Math.floor(m.rating))}${'☆'.repeat(5 - Math.floor(m.rating))}</span>
                            <span class="text-gray-400">${m.rating} из 5.0 (${m.reviews} отзывов)</span>
                        </div>
                    </div>
                </div>
                <div class="mb-4">
                    <p class="font-bold text-blue-900 text-sm mb-1">Направление: ${m.countries}</p>
                    <p class="text-gray-600 text-xs line-clamp-2 mb-2"><span class="font-semibold text-gray-700">О себе:</span> ${m.about}</p>
                    <p class="text-gray-600 text-xs line-clamp-2"><span class="font-semibold text-gray-700">Опыт:</span> ${m.experience}</p>
                </div>
                <div class="flex items-center justify-between mt-auto pt-4 border-t border-gray-50">
                    <div>
                        <p class="text-green-700 font-bold text-sm">Стоимость: ${m.price}</p>
                        <p class="text-gray-900 font-bold text-sm">Бесплатная консультация!</p>
                    </div>
                    ${isAssignMode
                        ? `<button onclick="selectMentorForStudent(${m.id})" class="px-6 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors">Выбрать</button>`
                        : `<button onclick="navigateTo('mentor-profile', ${m.id})" class="px-6 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors">Подробнее</button>`
                    }
                </div>
            </div>
        </div>`).join('');
    lucide.createIcons();
}

function renderLanguageTutors(list) {
    const grid      = document.getElementById('tutors-grid');
    const noResults = document.getElementById('no-results');
    const isAssignMode = isMentorAssignModeForCurrentUser();

    if (!list.length) {
        grid.style.display = 'none';
        noResults.classList.remove('hidden');
        return;
    }
    noResults.classList.add('hidden');
    grid.style.display = 'grid';
    grid.innerHTML = list.map(t => `
        <div class="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 overflow-hidden flex flex-col">
            <div class="p-6">
                <div class="flex items-start gap-4 mb-4">
                    ${t.photoUrl
                        ? `<img src="${t.photoUrl}" alt="${t.name}" class="w-16 h-16 rounded-full flex-shrink-0 object-cover border border-gray-100">`
                        : `<div class="w-16 h-16 ${t.avatarColor} rounded-full flex-shrink-0 flex items-center justify-center text-xl font-bold text-gray-600">${t.name.charAt(0)}</div>`}
                    <div>
                        <h3 class="font-bold text-blue-900 text-lg">${t.name}</h3>
                        <div class="flex items-center text-yellow-500 text-xs gap-1 mt-1">
                            <span class="text-yellow-400">${'★'.repeat(Math.floor(t.rating))}${'☆'.repeat(5 - Math.floor(t.rating))}</span>
                            <span class="text-gray-400">${t.rating} из 5.0 (${t.reviews} отзывов)</span>
                        </div>
                    </div>
                </div>
                <div class="mb-4">
                    <div class="flex items-center gap-2 mb-2">
                        <p class="font-bold text-blue-900 text-sm">Язык: ${t.language}</p>
                        ${t.level ? `<span class="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">${t.level}</span>` : ''}
                    </div>
                    <p class="text-gray-600 text-xs line-clamp-2 mb-2"><span class="font-semibold text-gray-700">О себе:</span> ${t.about}</p>
                    <p class="text-gray-600 text-xs line-clamp-2"><span class="font-semibold text-gray-700">Опыт:</span> ${t.experience}</p>
                </div>
                <div class="flex items-center justify-between mt-auto pt-4 border-t border-gray-50">
                    <div>
                        <p class="text-green-700 font-bold text-sm">Цена за курс: ${t.price}</p>
                        <p class="text-gray-900 font-bold text-sm">Пробный урок: 100 с/30 мин</p>
                    </div>
                    ${isAssignMode
                        ? `<button onclick="selectMentorForStudent(${t.id}, 'language')" class="px-6 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors">Выбрать</button>`
                        : `<button onclick="navigateTo('language-profile', ${t.id})" class="px-6 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors">Подробнее</button>`
                    }
                </div>
            </div>
        </div>`).join('');
    lucide.createIcons();
}

async function renderLanguageProfile(id) {
    comingFromProfile = true;
    const el = document.getElementById('language-profile-content');
    el.innerHTML = '<div class="flex justify-center py-20"><div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>';

    let tutor;
    try {
        tutor = cachedLanguageTutors?.find(t => t.id === Number(id)) ?? normalizeLanguageTutor(await getLanguageTutorById(id));
        if (!tutor) throw new Error();
        const reviews = await getReviews(tutor.id, 'language_tutor');
        tutor.reviewsData = reviews;
    } catch {
        el.innerHTML = '<p class="text-center text-gray-500 py-20">Преподаватель не найден.</p>';
        return;
    }

    el.innerHTML = `
        <section class="bg-white rounded-[2.5rem] mb-8 shadow-sm border border-slate-100 overflow-hidden">
            <div class="p-8 md:p-14">
                <div class="flex flex-col md:flex-row gap-12 items-start">
                    <div class="w-full md:w-1/3 flex flex-col items-center text-center">
                        <div class="relative">
                            ${tutor.photoUrl
                                ? `<img src="${tutor.photoUrl}" alt="${tutor.name}" class="w-44 h-44 rounded-full object-cover border-4 border-slate-50 shadow-xl">`
                                : `<div class="w-44 h-44 ${tutor.avatarColor} rounded-full flex items-center justify-center text-4xl font-bold text-gray-600 border-4 border-slate-50 shadow-xl">${tutor.name.charAt(0)}</div>`}
                            <div class="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg rotate-12 tracking-widest uppercase">${tutor.language}</div>
                        </div>
                        <h1 class="text-2xl font-black mt-8 text-blue-950">${tutor.name}</h1>
                        ${tutor.level ? `<span class="mt-2 text-xs bg-blue-100 text-blue-700 font-semibold px-3 py-1 rounded-full">${tutor.level}</span>` : ''}
                        <div class="text-amber-400 text-xs mt-2">
                            ${'★'.repeat(Math.floor(tutor.rating))}${'☆'.repeat(5 - Math.floor(tutor.rating))}
                            <span class="text-slate-300 ml-1">${tutor.rating} из 5.0 (${tutor.reviews} отзывов)</span>
                        </div>
                    </div>
                    <div class="w-full md:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div class="border-l-2 border-blue-500 pl-4"><h3 class="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">О себе</h3><p class="text-sm text-slate-500 font-medium">${tutor.about}</p></div>
                        <div class="border-l-2 border-blue-500 pl-4"><h3 class="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">Опыт</h3><p class="text-sm text-slate-500 font-medium">${tutor.experience}</p></div>
                        <div class="border-l-2 border-blue-500 pl-4"><h3 class="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">Язык</h3><p class="text-sm text-slate-500 font-medium">${tutor.language}</p></div>
                        <div class="border-l-2 border-blue-500 pl-4"><h3 class="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">Стоимость</h3><p class="text-sm text-green-500 font-medium">${tutor.price}</p><p class="text-gray-900 text-sm">Пробный урок: 100 с/30 мин</p></div>
                    </div>
                </div>
            </div>
        </section>

        <div class="bg-blue-50 rounded-3xl p-8 md:p-12 shadow-xl mb-8 border border-blue-100">
            <h2 class="text-2xl md:text-3xl font-bold text-slate-800 mb-4">
                ${tutor.name} — <span class="text-blue-700">Преподает ${tutor.language} язык</span>
            </h2>
            <p class="text-slate-700 mb-8">Индивидуальные занятия онлайн в удобное время</p>
            <div class="text-3xl font-bold text-slate-900 mb-6">${tutor.price}</div>
            <ul class="space-y-3 mb-8">
                ${['Индивидуальный подход и программа под ваши цели','Разговорная практика и грамматика','Домашние задания и контроль прогресса','Советы от носителя языка или эксперта'].map(item => `
                <li class="flex items-center gap-3 text-slate-700">
                    <svg class="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    ${item}
                </li>`).join('')}
            </ul>
            <div class="flex flex-wrap gap-4">
                <a href="https://t.me/aalam_edu" target="_blank" class="bg-blue-600 hover:bg-green-700 text-white font-bold py-3 px-9 rounded-xl transition-all shadow-lg text-lg">Записаться</a>
                <a href="https://t.me/aalam_edu" target="_blank" class="px-7 py-3 rounded-xl font-bold text-lg border-2 border-blue-600 text-blue-600 hover:bg-blue-50 transition-all">Пробный урок</a>
            </div>
        </div>

        ${renderReviewsCarousel(tutor)}
        ${renderContactBlock()}`;
    lucide.createIcons();
}


function renderReviewsCarousel(person) {
    const reviews = person.reviewsData || [];
    if (!reviews.length) {
        return `
            <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-8">
                <h3 class="text-xl font-bold text-blue-900 mb-4">Отзывы студентов</h3>
                <p class="text-gray-500 text-sm">У этого наставника пока нет отзывов. Вы можете стать первым!</p>
            </div>`;
    }
    return `
        <section class="space-y-8 mb-12">
            <div class="flex justify-between items-center px-2">
                <h2 class="text-2xl font-black text-blue-950 uppercase tracking-tighter">Отзывы студентов</h2>
                <div class="text-xs text-gray-400">
                    <span class="text-gray-700 font-semibold">${Number(person.rating).toFixed(1)} из 5.0</span>
                    (${person.reviews} отзывов)
                </div>
            </div>
            <div class="flex gap-6 overflow-x-auto pb-6 hide-scrollbar snap-x snap-mandatory">
                ${reviews.map(r => `
                    <div class="min-w-[260px] max-w-xs bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm snap-center flex-shrink-0">
                        <div class="flex items-center gap-4 mb-6">
                            <div class="text-[13px] font-black text-blue-950">${r.author}</div>
                            <div class="text-yellow-400 text-xs">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
                        </div>
                        <p class="text-[13px] text-slate-500 font-medium italic leading-relaxed">"${r.text}"</p>
                    </div>`).join('')}
            </div>
        </section>`;
}

async function renderProfile(id) {
    comingFromProfile = true;
    const el = document.getElementById('profile-content');
    el.innerHTML = '<div class="flex justify-center py-20"><div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>';

    let tutor;
    try {
        tutor = cachedTutors?.find(t => t.id === Number(id)) ?? normalizeTutor(await getTutorById(id));
        if (!tutor) throw new Error();
        const reviews = await getReviews(tutor.id, 'tutor');
        tutor.reviewsData = reviews;
    } catch {
        el.innerHTML = '<p class="text-center text-gray-500 py-20">Наставник не найден.</p>';
        return;
    }

    el.innerHTML = `
        <section class="bg-white rounded-[2.5rem] mb-8 shadow-sm border border-slate-100 overflow-hidden">
            <div class="p-8 md:p-14">
                <div class="flex flex-col md:flex-row gap-12 items-start">
                    <div class="w-full md:w-1/3 flex flex-col items-center text-center">
                        <div class="relative">
                            ${tutor.photoUrl
                                ? `<img src="${tutor.photoUrl}" alt="${tutor.name}" class="w-44 h-44 rounded-full object-cover border-4 border-slate-50 shadow-xl">`
                                : `<div class="w-44 h-44 ${tutor.avatarColor} rounded-full flex items-center justify-center text-4xl font-bold text-gray-600 border-4 border-slate-50 shadow-xl">${tutor.name.charAt(0)}</div>`}
                            <div class="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg rotate-12 tracking-widest uppercase">${tutor.role}</div>
                        </div>
                        <h1 class="text-2xl font-black mt-8 text-blue-950">${tutor.name}</h1>
                        <div class="text-amber-400 text-xs mt-2">
                            ${'★'.repeat(Math.floor(tutor.rating))}${'☆'.repeat(5 - Math.floor(tutor.rating))}
                            <span class="text-slate-300 ml-1">${tutor.rating} из 5.0 (${tutor.reviews} отзывов)</span>
                        </div>
                    </div>
                    <div class="w-full md:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div class="border-l-2 border-blue-600 pl-4"><h3 class="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">О себе</h3><p class="text-sm text-slate-500 font-medium">${tutor.about}</p></div>
                        <div class="border-l-2 border-blue-600 pl-4"><h3 class="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">Опыт</h3><p class="text-sm text-slate-500 font-medium">${tutor.experience}</p></div>
                        <div class="border-l-2 border-blue-600 pl-4"><h3 class="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">Предметы</h3><p class="text-sm text-slate-500 font-medium">${tutor.role}</p></div>
                        <div class="border-l-2 border-blue-600 pl-4"><h3 class="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">Стоимость</h3><p class="text-sm text-green-500 font-medium">${tutor.price}</p><p class="text-gray-900 text-sm">Пробный урок 100 с/30 мин</p></div>
                    </div>
                </div>
            </div>
        </section>

        <div class="bg-blue-50 rounded-3xl p-8 md:p-12 shadow-xl mb-8">
            <h2 class="text-2xl md:text-3xl font-bold text-slate-800 mb-4">${tutor.name} запускает — <br><span class="text-blue-800">Интенсивный Курс! ${tutor.role}</span></h2>
            <p class="text-slate-700 mb-8">Месяц для полного погружения и твердого результата</p>
            <div class="text-3xl font-bold text-slate-900 mb-6">${tutor.price}</div>
            <ul class="space-y-3 mb-8">
                ${['Разбор "ловушек" экзамена и стратегий победителя','Разбор всех тем, сложных заданий и типичных ошибок','Контроль прогресса и регулярная практика','Практические советы от человека, который уже прошел этот путь'].map(item => `
                <li class="flex items-center gap-3 text-slate-700">
                    <svg class="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    ${item}
                </li>`).join('')}
            </ul>
            <div class="flex flex-wrap gap-4">
                <a href="https://t.me/aalam_edu" target="_blank" class="bg-blue-600 hover:bg-blue-800 text-white font-bold py-3 px-9 rounded-xl transition-all shadow-lg text-lg">Хочу на курс</a>
                <a href="https://t.me/aalam_edu" target="_blank" class="px-7 py-3 rounded-xl font-bold text-lg border-2 border-blue-600 text-blue-600 hover:bg-blue-100 transition-all">Пробный урок</a>
            </div>
        </div>

        ${renderReviewsCarousel(tutor)}
        ${renderContactBlock()}`;
    lucide.createIcons();
}

async function renderMentorProfile(id) {
    comingFromProfile = true;
    const el = document.getElementById('mentor-profile-content');
    el.innerHTML = '<div class="flex justify-center py-20"><div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>';

    let m;
    try {
        m = cachedMentors?.find(x => x.id === Number(id)) ?? normalizeMentor(await getMentorById(id));
        if (!m) throw new Error();
        const reviews = await getReviews(m.id, 'mentor');
        m.reviewsData = reviews;
    } catch {
        el.innerHTML = '<p class="text-center text-gray-500 py-20">Ментор не найден.</p>';
        return;
    }

    el.innerHTML = `
        <section class="bg-white rounded-[2.5rem] mb-8 shadow-sm border border-slate-100 overflow-hidden">
            <div class="p-8 md:p-14">
                <div class="flex flex-col md:flex-row gap-12 items-start">
                    <div class="w-full md:w-1/3 flex flex-col items-center text-center">
                        <div class="relative">
                            <img src="${m.photoUrl}" alt="${m.name}" class="w-44 h-44 rounded-full object-cover border-4 border-slate-50 shadow-xl">
                            <div class="absolute -top-1 -right-4 bg-blue-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg rotate-12 tracking-widest uppercase">${m.uni}</div>
                        </div>
                        <h1 class="text-2xl font-black mt-8 text-blue-950">${m.name}</h1>
                        <div class="text-amber-400 text-xs mt-2">
                            ${'★'.repeat(Math.floor(m.rating))}${'☆'.repeat(5 - Math.floor(m.rating))}
                            <span class="text-slate-300 ml-1">${m.rating} из 5.0 (${m.reviews} отзывов)</span>
                        </div>
                    </div>
                    <div class="w-full md:w-2/3 space-y-8">
                        <div class="grid grid-cols-1 gap-6">
                            <div class="border-l-2 border-blue-600 pl-4"><h3 class="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">О себе</h3><p class="text-sm text-slate-500 font-medium">${m.about}</p></div>
                            <div class="border-l-2 border-blue-600 pl-4"><h3 class="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">Опыт</h3><p class="text-sm text-slate-500 font-medium">${m.experience}</p></div>
                            <div class="border-l-2 border-blue-600 pl-4"><h3 class="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">Стоимость</h3><p class="text-sm text-slate-500 font-medium">${m.price}</p></div>
                        </div>
                        <div class="flex flex-wrap gap-3">
                            ${[['blue-600','Страна',m.countries],['green-600','Университет',m.uni],['blue-600','Факультет',m.major],['green-600','Грант',m.grant]].map(([color,label,val]) => `
                            <div class="px-5 py-3 bg-white border border-slate-200 rounded-full shadow-sm flex items-center gap-3">
                                <div class="w-2 h-2 bg-${color} rounded-full"></div>
                                <span class="text-xs font-bold text-slate-400 uppercase">${label}</span>
                                <span class="text-sm font-black text-slate-900">${val}</span>
                            </div>`).join('')}
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section class="mb-12">
            <div class="bg-white rounded-[2.5rem] p-8 md:p-14 border border-slate-100 shadow-2xl">
                <h2 class="text-4xl font-black text-blue-950 mb-4 tracking-tighter">60 Дней Сопровождения</h2>
                <p class="mb-3 text-blue-600 font-bold uppercase text-xs tracking-[0.2em]">Твой путь в университет мечты начинается здесь</p>
                <p class="text-sm text-slate-500 leading-snug mb-12">За 2 месяца ментор полностью подготовит тебя к международному поступлению.</p>
                <div class="grid sm:grid-cols-2 gap-8 mb-12">
                    ${[['🎓','Country Guide','Разбираем специфику и требования вузов.'],['💡','Confidence','Вместо хаоса появится понятная стратегия.'],['✍️','Essay Workshop','Сильное мотивационное письмо на основе успешных кейсов.'],['💼','Case Study','Уникальный профиль и портфолио достижений.'],['🔧','Tech Support','Полностью объясняем процесс подачи.'],['📍','Adaptation','Твой план жизни и учебы в новой стране.']].map(([emoji,title,desc]) => `
                    <div class="flex gap-4"><span class="text-2xl">${emoji}</span><div><h4 class="font-black text-blue-900 mb-1">${title}</h4><p class="text-sm text-slate-500">${desc}</p></div></div>`).join('')}
                </div>
                <div class="flex flex-col sm:flex-row items-center justify-between p-8 bg-slate-50 rounded-3xl border border-slate-100">
                    <div>
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Полный пакет (2 месяца)</p>
                        <div class="text-3xl font-black text-blue-950">${m.price}</div>
                    </div>
                    <a href="https://t.me/aalam_edu" target="_blank" class="mt-6 sm:mt-0 bg-blue-600 text-white px-10 py-4 rounded-2xl font-black hover:bg-blue-700 transition shadow-lg shadow-blue-200">Начать поступление</a>
                </div>
            </div>
        </section>

        ${renderReviewsCarousel(m)}
        ${renderContactBlock('Хотите записаться на консультацию?', 'Свяжитесь с менеджером для бронирования времени.')}`;
    lucide.createIcons();
}

function renderContactBlock(
    title = 'Нужна помощь в подборе наставника?',
    subtitle = 'Свяжитесь с менеджером для консультации перед бронированием.'
) {
    return `
        <div class="bg-blue-50 p-8 rounded-2xl border border-blue-100 text-center shadow-sm">
            <h3 class="text-xl font-bold text-blue-900 mb-4">${title}</h3>
            <p class="text-gray-600 mb-6">${subtitle}</p>
            <div class="flex justify-center items-center gap-4">
                <a href="https://t.me/aalam_edu"    target="_blank" class="rounded px-2 py-2 bg-[#229ED9] hover:bg-[#1e8dbf] text-white"                                                         title="Telegram"><i data-lucide="send"      class="w-6 h-6 relative -left-0.5"></i></a>
                <a href="https://wa.me/996704500520" target="_blank" class="rounded px-2 py-2 bg-[#25D366] hover:bg-[#20bd5a] text-white"                                                         title="WhatsApp"><i data-lucide="phone"     class="w-6 h-6"></i></a>
                <a href="https://www.instagram.com/aalamedu" target="_blank" class="rounded px-2 py-2 bg-gradient-to-tr from-[#FD1D1D] via-[#E1306C] to-[#C13584] hover:opacity-90 text-white" title="Instagram">
                    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                </a>
            </div>
        </div>`;

}

async function initMentorsMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    const map = L.map('map', {
        center: [30, 20],
        zoom: 2,
        scrollWheelZoom: false,
        maxBounds: [[-90, -180], [90, 180]],
        maxBoundsViscosity: 1.0
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    try {
        const locations = await getMentorsLocations();

        // Группируем по координатам
        const grouped = {};
        locations.forEach(m => {
            const key = `${m.lat},${m.lng}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(m);
        });

        // Рисуем маркеры
        Object.entries(grouped).forEach(([key, mentors]) => {
            const [lat, lng] = key.split(',').map(Number);
            const count = mentors.length;

            const color = count === 1 ? '#5686f6'
                        : count === 2 ? '#466cf4'
                        : '#1E3A8A';

            const radius = count === 1 ? 6
                         : count === 2 ? 8
                         : 11;

            const marker = L.circleMarker([lat, lng], {
                radius,
                fillColor: color,
                color: '#FFFFFF',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9
            }).addTo(map);

            const content = mentors.map(m => `
                <div style="margin-bottom:8px;">
                    <strong>${m.name}</strong><br>
                    <span style="color:#6B7280;font-size:12px;">${m.uni}</span>
                </div>
            `).join('<hr style="margin:4px 0">');

            marker.bindPopup(content);
            marker.on('mouseover', function() { this.openPopup(); });
            marker.on('mouseout',  function() { this.closePopup(); });
            marker.on('click', function() { this.openPopup(); });
        });

    } catch (e) {
        console.error("Ошибка при отрисовке карты:", e);
    }
}

