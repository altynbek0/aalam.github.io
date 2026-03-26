let currentMode = "tutors";
let comingFromProfile = false;

let cachedTutors         = null;
let cachedMentors        = null;
let cachedLanguageTutors = null;

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

    const urlParams    = new URLSearchParams(window.location.search);
    const initialView  = urlParams.get('view')  || 'home';
    const initialParam = urlParams.get('param');
    navigateTo(initialView, initialParam, true);
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
                    <button onclick="navigateTo('profile', ${t.id})" class="px-6 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors">
                        Подробнее
                    </button>
                </div>
            </div>
        </div>`).join('');
    lucide.createIcons();
}

function renderMentors(list) {
    const grid      = document.getElementById('tutors-grid');
    const noResults = document.getElementById('no-results');

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
                    <p class="text-green-700 font-bold text-sm">Стоимость: ${m.price}</p>
                    <button onclick="navigateTo('mentor-profile', ${m.id})" class="px-6 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors">
                        Подробнее
                    </button>
                </div>
            </div>
        </div>`).join('');
    lucide.createIcons();
}

function renderLanguageTutors(list) {
    const grid      = document.getElementById('tutors-grid');
    const noResults = document.getElementById('no-results');

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
                    <button onclick="navigateTo('language-profile', ${t.id})" class="px-6 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors">
                        Подробнее
                    </button>
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
                <a href="https://t.me/aalam_edu" target="_blank" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-9 rounded-xl transition-all shadow-lg text-lg">Записаться</a>
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
                            <div class="text-blue-600 text-xs">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
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
                            ${[['blue-600','Страна',m.countries],['green-500','Университет',m.uni],['blue-500','Факультет',m.major],['green-500','Грант',m.award]].map(([color,label,val]) => `
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

