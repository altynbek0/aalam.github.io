const SUPABASE_URL      = 'https://pthbyzwtpeivtqgfhnfq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0aGJ5end0cGVpdnRxZ2ZobmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzI3NzUsImV4cCI6MjA4ODc0ODc3NX0.kI6HRCBFh8Wz4Kzni77wpUI3NBBATdpCDiI2lSd2EF8';

const supabaseHeaders = {
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type':  'application/json'
};

async function getTutors() {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/tutors?is_active=eq.true&order=rating.desc.nullslast,id.asc`,
        { headers: supabaseHeaders }
    );
    if (!res.ok) throw new Error('Ошибка загрузки наставников');
    return await res.json();
}

async function getTutorById(id) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/tutors?id=eq.${id}&limit=1`,
        { headers: supabaseHeaders }
    );
    if (!res.ok) throw new Error('Наставник не найден');
    const data = await res.json();
    return data[0] || null;
}

async function getMentors() {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/mentors?is_active=eq.true&order=rating.desc.nullslast,id.asc`,
        { headers: supabaseHeaders }
    );
    if (!res.ok) throw new Error('Ошибка загрузки менторов');
    return await res.json();
}

async function getMentorById(id) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/mentors?id=eq.${id}&limit=1`,
        { headers: supabaseHeaders }
    );
    if (!res.ok) throw new Error('Ментор не найден');
    const data = await res.json();
    return data[0] || null;
}

async function getLanguageTutors() {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/language_tutors?is_active=eq.true&order=rating.desc.nullslast,id.asc`,
        { headers: supabaseHeaders }
    );
    if (!res.ok) throw new Error('Ошибка загрузки преподавателей языков');
    return await res.json();
}

async function getLanguageTutorById(id) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/language_tutors?id=eq.${id}&limit=1`,
        { headers: supabaseHeaders }
    );
    if (!res.ok) throw new Error('Преподаватель не найден');
    const data = await res.json();
    return data[0] || null;
}

function normalizeLanguageTutor(t) {
    return {
        ...t,
        photoUrl:    t.photo_url    ?? '',
        avatarColor: t.avatar_color ?? 'bg-green-200',
        reviewsData: []
    };
}
async function getReviews(personId, personType) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/reviews?person_id=eq.${personId}&person_type=eq.${personType}&order=created_at.desc`,
        { headers: supabaseHeaders }
    );
    if (!res.ok) throw new Error('Ошибка загрузки отзывов');
    return await res.json();
}


function normalizeTutor(t) {
    return {
        ...t,
        photoUrl:    t.photo_url    ?? '',
        avatarColor: t.avatar_color ?? 'bg-blue-200',
        reviewsData: []   
    };
}

function normalizeMentor(m) {
    return {
        ...m,
        photoUrl:    m.photo_url ?? '',
        reviewsData: []
    };
}

async function getMentorsLocations() {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/mentors?select=id,name,uni,lat,lng`,
        { headers: supabaseHeaders }
    );
    if (!res.ok) throw new Error('Ошибка загрузки локаций');
    const data = await res.json();
    return data.filter(m => m.lat !== null && m.lng !== null);
}
