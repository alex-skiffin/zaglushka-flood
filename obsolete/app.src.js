// ═══════════════════════════════════════════════════════
//  AUTH & PAYWALL
// ═══════════════════════════════════════════════════════

let currentUser  = null;
let authTab      = 'login';
let selectedPlan = null;

window.addEventListener('load', async () => {
    await refreshMe();
    await initRegions();   // публичный список регионов — доступен всем, грузим сразу

    const params = new URLSearchParams(location.search);

    if (params.get('register') === '1' && !currentUser) {
        history.replaceState({}, '', '/app');
        switchTab('register');
        showAuth();
        return;
    }
    if (params.get('auth') === 'ok' || params.get('auth') === 'verified' || params.get('payment') === 'ok') {
        history.replaceState({}, '', '/app');
        await refreshMe();
        await initRegions();
        if (params.get('payment') === 'ok') await pollPaymentStatus();
        // Только после верификации email — показываем онбординг
        if (params.get('auth') === 'verified') setTimeout(() => startOnboarding(), 600);
    }
    if (params.get('auth_error')) {
        history.replaceState({}, '', '/app');
        const errCode = params.get('auth_error');
        if (errCode === 'invalid_or_expired_token') {
            showEmailVerificationModal({ expired: true });
        } else {
            showAuth('Ошибка входа: ' + errCode);
        }
    }
});

async function refreshMe() {
    try {
        const res = await fetch('/api/auth/me');
        const d   = await res.json();
        currentUser = d.authenticated ? d : null;
        updateUserBar();
    } catch(e) {}
}

function updateUserBar() {
    const emailEl   = document.getElementById('ub-email');
    const planEl    = document.getElementById('ub-plan');
    const quotaEl   = document.getElementById('ub-quota');
    const quotaWrap = document.getElementById('ub-quota-label');
    const sep1      = document.getElementById('ub-sep1');
    const loginBtn  = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const chatWrap  = document.getElementById('ub-chat-wrap');
    const chatEl    = document.getElementById('ub-chat');
    const chatInEl  = document.getElementById('chat-input');
    const chatBtnEl = document.getElementById('chat-send');

    if (!currentUser) {
        emailEl.textContent     = '';
        planEl.style.display    = 'none';
        if (sep1) sep1.style.display = 'none';
        quotaWrap.style.display = 'none';
        chatWrap.style.display  = 'none';
        loginBtn.style.display  = 'block';
        logoutBtn.style.display = 'none';
        return;
    }

    loginBtn.style.display  = 'none';
    logoutBtn.style.display = 'block';
    emailEl.textContent     = currentUser.email;

    const planLabels = { free: 'Бесплатно', pack: 'Пакет', sub: 'Подписка' };
    planEl.textContent   = planLabels[currentUser.plan] || currentUser.plan;
    planEl.style.display = 'inline-block';
    // paid план — темнее, free — чуть светлее
    planEl.style.background = currentUser.plan !== 'free' ? 'var(--forest)' : 'var(--river)';

    if (sep1) sep1.style.display = 'inline';

    const q = currentUser.quota;
    if (q && !q.unlimited) {
        const left = currentUser.plan === 'free'
            ? (isNaN(q.day_limit - q.day_used) ? q.left : (q.day_limit - q.day_used))
            : q.left;
        quotaEl.textContent   = `${q.left} шт`;
        quotaEl.className     = left <= 1 ? 'warn' : '';
        quotaWrap.style.display = 'inline';
    } else {
        quotaWrap.style.display = 'none';
    }

    if (currentUser.chat_left !== undefined) {
        chatEl.textContent = currentUser.chat_left + ' вопр.';
        chatEl.style.color = currentUser.chat_left <= 1 ? 'var(--mid-col)' : 'var(--muted)';
        if (currentUser.chat_left === 0) {
            chatInEl.disabled     = true;
            chatInEl.placeholder  = currentUser.plan === 'free'
                ? '🔒 1 вопрос к ИИ входит в пакет от 249 ₽'
                : 'Лимит пакета на запросы в чат исчерпан';
            chatBtnEl.disabled    = true;
            chatBtnEl.style.background = 'var(--faint)';
        } else {
            chatInEl.disabled     = false;
            chatInEl.placeholder  = 'Например: стоит ли строить дом?';
            chatBtnEl.disabled    = false;
            chatBtnEl.style.background = '';
        }
        chatWrap.style.display = 'inline';
    } else {
        chatWrap.style.display = 'none';
    }
}

// ── Auth modal ─────────────────────────────────────────
// ── Consent checkboxes (152-ФЗ) ───────────────────────────
// Каждое согласие — отдельный чекбокс в модалке регистрации.
const CONSENTS = [
    { id: 'consent-pdn',   name: 'согласие на обработку ПДн и cookie',            required: true },
    { id: 'consent-terms', name: 'Пользовательское соглашение и публичную оферту', required: true }
];

function missingConsents() {
    return CONSENTS.filter(c => c.required && !document.getElementById(c.id).checked);
}

function resetConsents() {
    CONSENTS.forEach(c => { document.getElementById(c.id).checked = false; });
}

function paintConsents() {
    const isReg = document.getElementById('tab-register').classList.contains('active');
    CONSENTS.forEach(c => {
        const el    = document.getElementById(c.id);
        const label = el.closest('label');
        if (label) label.style.color = (isReg && c.required && !el.checked) ? '#b3261e' : 'var(--muted)';
    });
    if (isReg) document.getElementById('auth-btn').disabled = missingConsents().length > 0;
}

function showAuth(msg) {
    document.getElementById('auth-err').textContent = msg || '';
    document.getElementById('auth-modal').classList.add('visible');
    document.getElementById('auth-email').focus();
}

function closeAuth() {
    document.getElementById('auth-modal').classList.remove('visible');
    document.getElementById('auth-err').textContent = '';
    resetConsents();
}

function switchTab(tab) {
    authTab = tab;
    document.getElementById('tab-login').classList.toggle('active',    tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    document.getElementById('auth-btn').textContent = tab === 'login' ? 'Войти' : 'Зарегистрироваться';
    document.getElementById('auth-btn').disabled    = tab === 'register';
    document.getElementById('auth-invite').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('legal-check').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('auth-err').textContent = '';
    resetConsents();
    paintConsents();
}

async function doAuth() {
    const email  = document.getElementById('auth-email').value.trim();
    const pass   = document.getElementById('auth-pass').value;
    const invite = document.getElementById('auth-invite').value.trim();
    const errEl  = document.getElementById('auth-err');
    const btn    = document.getElementById('auth-btn');

    if (authTab === 'register') {
        const miss = missingConsents();
        if (miss.length) {
            errEl.textContent = 'Необходимо отметить: ' + miss.map(m => m.name).join(', ');
            paintConsents();
            return;
        }
    }

    errEl.textContent = '';
    btn.disabled      = true;
    btn.textContent   = '...';

    try {
        const url  = authTab === 'login' ? '/api/auth/login' : '/api/auth/register';
        const body = authTab === 'login'
            ? { email, password: pass }
            : { email, password: pass, invite_code: invite };

        const res  = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) {
            if (data.error === 'email_not_verified') {
                errEl.innerHTML =
                    (data.message || 'Подтвердите email перед входом.') +
                    ` <button onclick="doResendVerification(this,'${email.replace(/'/g,"\\'")}',true)"
                        style="display:inline;background:none;border:none;color:#1a73e8;
                               cursor:pointer;text-decoration:underline;font-size:13px;padding:0">
                        Отправить письмо повторно
                      </button>`;
            } else if (data.error === 'foreign_email') {
                errEl.innerHTML =
                    'Иностранный email запрещён законом РФ.<br>' +
                    '<span style="font-size:12px;color:#888">Используйте Яндекс / Mail.ru ' +
                    'или <button onclick="document.getElementById(\'ya-btn\').click()" ' +
                    'style="background:none;border:none;color:#1a73e8;cursor:pointer;' +
                    'text-decoration:underline;font-size:12px;padding:0">' +
                    'войдите через Яндекс</button></span>';
            } else {
                errEl.textContent = data.message || data.error || 'Ошибка';
            }
            return;
        }

        if (authTab === 'register') ym(108538996, 'reachGoal', 'registration');

        // Регистрация с верификацией email — показываем уведомление, не логиним сразу
        if (data.pending_verification) {
            closeAuth();
            showEmailVerificationModal({ email, emailSent: data.email_sent !== false });
            return;
        }

        await refreshMe();
        await initRegions();
        closeAuth();

        if (authTab === 'register') setTimeout(() => startOnboarding(), 600);

    } catch(e) {
        errEl.textContent = 'Ошибка соединения';
    } finally {
        btn.disabled    = false;
        btn.textContent = authTab === 'login' ? 'Войти' : 'Зарегистрироваться';
    }
}

async function doLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    updateUserBar();
    closeResultModal(true);
    if (marker)      { map.removeLayer(marker);      marker      = null; }
    if (riverMarker) { map.removeLayer(riverMarker); riverMarker = null; }
    clearCadastrePolygon();
    document.getElementById('map-hint').classList.remove('hidden');
    showAuth();
}

// ── Email-верификация: модалка и повтор отправки ─────────────────────────────

/**
 * showEmailVerificationModal({ email, emailSent, expired })
 *   email     — адрес куда отправили (или куда пытались)
 *   emailSent — true/false (SMTP сработал?)
 *   expired   — true: показываем экран «ссылка устарела»
 */
function showEmailVerificationModal({ email = '', emailSent = true, expired = false } = {}) {
    const modal   = document.getElementById('email-verify-modal');
    const icon    = document.getElementById('ev-icon');
    const title   = document.getElementById('ev-title');
    const desc    = document.getElementById('ev-desc');
    const emailBox= document.getElementById('ev-email-box');
    const hint    = document.getElementById('ev-hint');
    const action  = document.getElementById('ev-action');

    if (expired) {
        icon.textContent  = '⏰';
        title.textContent = 'Ссылка устарела';
        desc.textContent  = 'Ссылка подтверждения истекла или уже была использована. Запросите новую — это займёт секунду.';
        emailBox.style.display = 'none';
        hint.textContent  = '';
        action.innerHTML  = `
            <button onclick="document.getElementById('email-verify-modal').classList.remove('visible');showAuth()"
                    class="f-btn" style="width:auto;padding:10px 24px;font-size:14px">
                Войти / запросить новое письмо
            </button>`;
    } else if (emailSent) {
        icon.textContent       = '📧';
        title.textContent      = 'Проверьте почту';
        desc.textContent       = 'Мы отправили ссылку подтверждения на адрес:';
        emailBox.style.display = 'block';
        emailBox.textContent   = email;
        hint.textContent       = 'После клика по ссылке вы будете автоматически авторизованы и попадёте в приложение.';
        action.innerHTML       = `
            <button onclick="doResendVerification(this,'${email.replace(/'/g,"\\'")}',false)"
                    style="background:none;border:none;color:#1a73e8;cursor:pointer;
                           text-decoration:underline;font-size:13px">
                Не получили письмо? Отправить повторно
            </button>`;
    } else {
        icon.textContent       = '⚠️';
        title.textContent      = 'Не удалось отправить письмо';
        desc.textContent       = 'Аккаунт создан, но письмо не дошло. Попробуйте ещё раз:';
        emailBox.style.display = 'block';
        emailBox.textContent   = email;
        hint.textContent       = '';
        action.innerHTML       = `
            <button onclick="doResendVerification(this,'${email.replace(/'/g,"\\'")}',false)"
                    class="f-btn" style="width:auto;padding:10px 24px;font-size:14px">
                Отправить письмо подтверждения
            </button>`;
    }

    modal.classList.add('visible');
}

async function doResendVerification(btn, email, closeLoginFirst = false) {
    if (closeLoginFirst) closeAuth();

    const origText  = btn.textContent;
    btn.disabled    = true;
    btn.textContent = '...';

    try {
        const res  = await fetch('/api/auth/resend-verification', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email }),
        });
        const data = await res.json();
        if (res.ok) {
            btn.textContent      = '✓ Письмо отправлено';
            btn.style.color      = '#2e7d32';
            btn.style.fontWeight = '600';
            // Если вызвали из loginError — переключаемся на полную модалку
            if (closeLoginFirst) showEmailVerificationModal({ email, emailSent: true });
        } else {
            btn.textContent = data.message || 'Ошибка, попробуйте позже';
            btn.disabled    = false;
        }
    } catch (e) {
        btn.textContent = 'Ошибка соединения';
        btn.disabled    = false;
    }
}

// ── Paywall modal ──────────────────────────────────────
function showPaywall(msg) {
    document.getElementById('paywall-desc').textContent = msg || 'Выберите тариф чтобы продолжить';
    document.getElementById('pay-err').textContent      = '';
    document.getElementById('pay-btn').style.display    = 'none';
    selectedPlan = null;
    document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
    // По умолчанию выбираем featured
    const featured = document.querySelector('.plan-card.featured');
    if (featured) selectPlan(featured.dataset.plan, featured);
    document.getElementById('paywall-modal').classList.add('visible');
}

function closePaywall() {
    document.getElementById('paywall-modal').classList.remove('visible');
}

function selectPlan(key, cardEl) {
    selectedPlan = key;
    document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
    if (cardEl) cardEl.classList.add('selected');
    document.getElementById('pay-btn').style.display = 'block';
    document.getElementById('pay-btn').textContent   = 'Оплатить через Т-Банк →';
    // CRO: гарантия появляется только когда кнопка оплаты видна
    const g = document.getElementById('pay-guarantee');
    if (g) g.style.display = 'block';
}

async function doPay() {
    if (!selectedPlan) return;
    const btn = document.getElementById('pay-btn');
    const err = document.getElementById('pay-err');
    btn.disabled    = true;
    btn.textContent = 'Создаём платёж...';
    err.textContent = '';
    try {
        const res  = await authFetch('/api/pay/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_key: selectedPlan }),
        });
        const data = await res.json();
        if (!res.ok || !data.confirmation_url) {
            err.textContent = data.error || 'Ошибка создания платежа';
            return;
        }
        location.href = data.confirmation_url;
    } catch(e) {
        err.textContent = 'Ошибка соединения';
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Оплатить через Т-Банк →';
    }
}

async function pollPaymentStatus(attempts = 0) {
    if (attempts > 15) {
        showToast('⚠️ Не удалось подтвердить оплату. Если деньги списались — напишите на support@gidrorisk.ru', 'warn');
        return;
    }
    try {
        const res  = await fetch('/api/pay/status');
        const data = await res.json();
        if (data.status === 'succeeded') {
            ym(108538996, 'reachGoal', 'purchase');
            await refreshMe();
            await initRegions();
            showToast('✅ Оплата прошла! Доступ открыт.');
            return;
        }
        if (data.status === 'canceled') {
            showToast('❌ Платёж не прошёл. Попробуйте ещё раз.', 'warn');
            return;
        }
        if (data.status === 'pending') {
            setTimeout(() => pollPaymentStatus(attempts + 1), 2000);
        }
    } catch(e) {
        setTimeout(() => pollPaymentStatus(attempts + 1), 3000);
    }
}

// ── Toast-уведомление (вместо alert) ──────────────────
function showToast(text, type = 'ok') {
    const t = document.createElement('div');
    const bg = type === 'warn' ? '#c0392b' : 'var(--forest)';
    t.style.cssText = `
        position:fixed; bottom:28px; left:50%; transform:translateX(-50%);
        background:${bg}; color:white;
        padding:12px 24px; border-radius:12px;
        font-size:14px; font-weight:600; font-family:'Golos Text',sans-serif;
        box-shadow:0 8px 28px rgba(0,0,0,0.18);
        z-index:9999; white-space:nowrap; max-width:90vw;
        animation:ob-fadein .3s ease;
    `;
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => {
        t.style.transition = 'opacity .5s';
        t.style.opacity    = '0';
        setTimeout(() => t.remove(), 500);
    }, 5000);
}

// ── authFetch ──────────────────────────────────────────
async function authFetch(url, options = {}) {
    const res = await fetch(url, options);
    if (res.status === 401) {
        currentUser = null;
        updateUserBar();
        showAuth('Сессия истекла. Войдите снова.');
        throw new Error('auth_required');
    }
    if (res.status === 402) {
        const data = await res.json();
        const left = data.resets_in ? Math.ceil(data.resets_in / 3600) : null;
        const msg  = left
            ? `Лимит ${data.day_limit} запросов/день исчерпан. Сброс через ~${left} ч.`
            : 'Лимит запросов исчерпан.';
        document.getElementById('result-modal').classList.remove('visible');
        showPaywall(msg);
        throw new Error('limit_reached');
    }
    return res;
}

// ═══════════════════════════════════════════════════════
//  КАРТА
// ═══════════════════════════════════════════════════════

let map = L.map('map', {
    attributionControl: false,
    maxBoundsViscosity: 0.8
}).setView([55.9, 37.7], 9);

L.control.attribution({ prefix: '<a href="https://leafletjs.com">Leaflet</a>' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

// #map-area меняет реальную ширину только в одном случае — при пересечении
// брейкпоинта 900px (десктопная колонка панели то появляется, то исчезает
// из layout'а). Больше нигде — панель теперь честный flex-элемент, а не
// оверлей с margin-хаком, так что дёргать invalidateSize на каждый клик
// незачем: контейнер карты и так корректного размера с самого начала.
window.addEventListener('resize', () => { if (map) map.invalidateSize(); });

let currentRegion = null;
let marker        = null;
let riverMarker    = null;
let cadastrePolygon = null;
let cadastreLookupToken = 0;
let isLoading     = false;

function clearCadastrePolygon() {
    cadastreLookupToken++;   // отменяем любой ещё не пришедший фоновый поиск по точке
    if (cadastrePolygon) { map.removeLayer(cadastrePolygon); cadastrePolygon = null; }
    clearCadastreInfo();
}

// Показываем то, что реально пришло из реестра — не выдумываем, не
// показываем пустые строки для отсутствующих полей (у НСПД часто не
// заполнены не все атрибуты).
// Заполняет блок «Участок (ЕГРН)» в панели — тем, что реально пришло,
// без выдумывания. Поля без данных остаются с прочерком (не пустая строка —
// так виднее, что это поле, а не что-то отвалилось).
function renderCadastreInfo(data) {
    const dash = '—';
    document.getElementById('cad-num').textContent    = data.cad_num || dash;
    document.getElementById('cad-address').textContent = data.address || dash;
    document.getElementById('cad-area').textContent =
        data.area_sqm ? `${Math.round(data.area_sqm).toLocaleString('ru-RU')} м²` : dash;
    document.getElementById('cad-category').textContent = data.category || dash;
    document.getElementById('cad-permitted-use').textContent = data.permitted_use || dash;
}

function clearCadastreInfo() {
    renderCadastreInfo({});
}

function drawCadastrePolygon(data) {
    cadastrePolygon = L.geoJSON(data.geometry, {
        style: {
            color: '#2d5a27', weight: 2.5,
            fillColor: '#2d5a27', fillOpacity: 0.12,
        },
    }).addTo(map);
    renderCadastreInfo(data);
    return cadastrePolygon;
}

// Маркер участка — зелёный, стилизованный
const siteIcon = L.divIcon({
    html: `<div style="
        width:16px;height:16px;
        background:var(--warn-col,#c0392b);
        border-radius:50%;
        border:2.5px solid white;
        box-shadow:0 0 0 5px rgba(192,57,43,0.22), 0 2px 8px rgba(0,0,0,0.2);
    "></div>`,
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
});

const colorClass = {
    red: 'badge-red', orange: 'badge-orange',
    yellow: 'badge-yellow', green: 'badge-green'
};
const riskLabel = {
    'ВЫСОКИЙ':  'Высокий риск',
    'СРЕДНИЙ':  'Средний риск',
    'УМЕРЕННЫЙ':'Умеренный риск',
    'НИЗКИЙ':   'Минимальный риск',
};

// true — только когда мы ТОЧНО знаем, что квота исчерпана (пользователь
// залогинен и currentUser.quota.ok === false). Если пользователь не
// залогинен или квота ещё не известна — не блокируем здесь: пусть решает
// обычный поток авторизации (401 у authFetch), у нас нет оснований для
// "квота кончилась" в UI, когда правильный ответ — "войдите".
function isQuotaExhausted() {
    return !!(currentUser && currentUser.quota && currentUser.quota.ok === false);
}

// Загрузка регионов при старте
authFetch('/api/regions')
    .then(r => r.json())
    .then(regions => buildRegionSelect(regions))
    .catch(() => {});

function buildRegionSelect(regions) {
    const sel   = document.getElementById('region-select');
    const order = ['moscow','spb','krasnodar','sochi','perm','amur','irkutsk','kazan'];
    Array.from(sel.options).forEach(o => { if (o.value) o.remove(); });
    order.forEach(key => {
        if (!regions[key]) return;
        const cfg = regions[key];
        const opt = document.createElement('option');
        opt.value       = key;
        opt.textContent = cfg.name + (cfg.loaded ? '' : ' (недоступен)');
        opt.disabled    = !cfg.loaded;
        sel.appendChild(opt);
    });
    const defaultKey = order.find(k => regions[k]?.loaded);
    if (defaultKey) {
        sel.value = defaultKey;
        selectRegion(defaultKey, regions[defaultKey]);
    }
}

async function initRegions() {
    try {
        const res     = await fetch('/api/regions');
        const regions = await res.json();
        buildRegionSelect(regions);
    } catch(e) {}
}

function selectRegion(key, cfg) {
    currentRegion = key;
    map.setView(cfg.center, cfg.zoom);
    const b      = cfg.bounds;
    const bounds = L.latLngBounds([b.south, b.west], [b.north, b.east]);
    map.setMaxBounds(bounds);
    map.setMinZoom(cfg.zoom - 1);
    closeResultModal(true);
    if (marker)      { map.removeLayer(marker);      marker      = null; }
    if (riverMarker) { map.removeLayer(riverMarker); riverMarker = null; }
    clearCadastrePolygon();
    document.getElementById('map-hint').classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════
//  ДИСКЛЕЙМЕР
// ═══════════════════════════════════════════════════════

function showDisclaimer(latlng) {
    if (!document.getElementById('disclaimer-modal')) {
        const modal = document.createElement('div');
        modal.id        = 'disclaimer-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-box" style="max-width:400px">
                <h2>Важно перед началом</h2>
                <p style="color:var(--muted);font-size:13px;line-height:1.7;margin-bottom:12px">
                    ГидроРиск предоставляет <b>информационную оценку</b> природной
                    уязвимости участков на основе открытых данных о рельефе, гидрологии и почвах.
                </p>
                <p style="color:var(--muted);font-size:13px;line-height:1.7;margin-bottom:18px">
                    Результаты <b>не являются экспертным заключением</b> и не могут
                    использоваться как основание для юридически значимых решений
                    без дополнительной проверки специалистом.
                </p>
                <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:12px;color:var(--muted);margin-bottom:16px;line-height:1.5">
                    <input type="checkbox" id="disclaimer-check" style="margin-top:2px;flex-shrink:0;cursor:pointer;accent-color:var(--forest)"/>
                    <span>Я понимаю, что сервис носит информационный характер и не заменяет профессиональную экспертизу</span>
                </label>
                <div class="f-err" id="disclaimer-err"></div>
                <button class="f-btn" id="disclaimer-ok">Продолжить</button>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('disclaimer-ok').addEventListener('click', () => {
            if (!document.getElementById('disclaimer-check').checked) {
                document.getElementById('disclaimer-err').textContent = 'Необходимо подтвердить понимание';
                return;
            }
            localStorage.setItem('disclaimer_accepted', '1');
            modal.classList.remove('visible');
            map.fire('click', { latlng });
        });
    }
    document.getElementById('disclaimer-modal').classList.add('visible');
}

// ═══════════════════════════════════════════════════════
//  РЕЗУЛЬТАТЫ МОДАЛКА
// ═══════════════════════════════════════════════════════

// Единая точка переключения состояний панели — 5 взаимоисключающих:
// пусто / загрузка / приглашение войти / лимит исчерпан / контент.
// Через хелпер, а не повторение одного и того же в каждой функции —
// иначе легко забыть спрятать одно из состояний при добавлении нового
// (ровно так уже чуть не вышло с приглашением войти).
const RESULT_PANEL_STATES = ['result-empty', 'result-loading', 'result-login-prompt',
                              'result-quota-exhausted', 'result-content'];

function _setResultPanelState(visibleId) {
    document.getElementById('result-modal').classList.add('visible');
    for (const id of RESULT_PANEL_STATES) {
        document.getElementById(id).style.display = (id === visibleId) ? 'block' : 'none';
    }
    const reportBtn = document.getElementById('report-btn');
    if (reportBtn) reportBtn.style.display = 'none';
}

function openResultModal() {
    _setResultPanelState('result-loading');
    document.getElementById('result-loading').textContent = '⏳ Анализируем участок...';
}

// Не залогинен — вместо запуска платного анализа: карточка с объяснением
// ценности и кнопкой на логин. Ни автоматического попапа логина, ни
// фейкового "Анализируем участок" для того, что заведомо не будет
// проанализировано.
function showLoginPromptPanel() {
    _setResultPanelState('result-login-prompt');
}

// Залогинен, но лимит запросов исчерпан. showPaywall() (модалка с
// тарифами) — основной инструмент продажи, вызывается отдельно рядом.
// Это — то, что остаётся в панели после закрытия модалки, чтобы под
// данными ЕГРН не было пустого места.
function showQuotaExhaustedPanel() {
    _setResultPanelState('result-quota-exhausted');
}

// Десктопная боковая панель видна сразу после выбора региона — с
// прочерками, а не пустым местом. На мобилке ничего не показываем: там
// модалка по-прежнему открывается только по клику, как и раньше.
// Если квота уже исчерпана — сразу показываем напоминание об этом,
// а не нейтральную подсказку "кликните на карте".
function showEmptyResultPanel() {
    if (window.innerWidth < 900) return;
    if (isQuotaExhausted()) {
        showQuotaExhaustedPanel();
        return;
    }
    _setResultPanelState('result-empty');
}

function closeResultModal(force = false) {
    if (!force && isLoading) {
        if (!confirm('Анализ ещё не завершён. Точно закрыть?')) return;
    }

    if (window.innerWidth >= 900) {
        // Десктоп: панель — постоянная часть layout'а, не исчезает целиком,
        // просто возвращается в пустое состояние (прочерки вместо контента).
        showEmptyResultPanel();
    } else {
        document.getElementById('result-modal').classList.remove('visible');
        const reportBtn = document.getElementById('report-btn');
        if (reportBtn) reportBtn.style.display = 'none';
    }
}

function showResultContent(data) {
    document.getElementById('result-loading').style.display = 'none';
    document.getElementById('result-content').style.display = 'block';

    // Единая карточка лока показывается только бесплатным — заменяет
    // старые разрозненные замки (серая плашка + отдельный синий баннер)
    // одним согласованным местом с единственной кнопкой на всю модалку.
    // Toggle между ней и обычным бейджем происходит в showResultContent
    // по data.interpretation_locked, здесь просто прячем на старте загрузки.
    const lockedCard   = document.getElementById('risk-locked-card');
    const unlockedView = document.getElementById('risk-unlocked-view');
    if (lockedCard)   lockedCard.style.display   = 'none';
    if (unlockedView) unlockedView.style.display = 'none';

    // Кнопка PDF — показываем когда пришёл результат.
    // Платным — disabled до ответа ИИ (снимется в loadAiExplain).
    // Бесплатным — сразу и навсегда disabled с точной ценой, потому что
    // для них ИИ-запрос не делается вообще, ждать нечего.
    const reportBtn = document.getElementById('report-btn');
    if (reportBtn) {
        const isPaid = currentUser && currentUser.plan !== 'free';
        reportBtn.style.display = 'flex';
        reportBtn.disabled      = true;
        reportBtn.title         = isPaid
            ? '⏳ Ожидаем ответа ИИ-консультанта...'
            : 'Доступно на платных тарифах — от 99 ₽';
    }

    // Координаты
    document.getElementById('coords').textContent =
        `${data._lat?.toFixed(4)}°N, ${data._lng?.toFixed(4)}°E`;

    // Единая карточка лока для free vs обычный бейдж+балл для платных.
    // Для free сервер не присылает risk/score/color вообще (redact_for_free_tier) —
    // не блюрим реальные данные, а честно показываем что их нет без оплаты,
    // одной согласованной карточкой вместо разрозненных замков.
    if (data.interpretation_locked) {
        document.getElementById('risk-locked-card').style.display   = 'block';
        document.getElementById('risk-unlocked-view').style.display = 'none';
    } else {
        document.getElementById('risk-locked-card').style.display   = 'none';
        document.getElementById('risk-unlocked-view').style.display = 'block';

        const displayLabel = riskLabel[data.risk] || data.risk;
        // Цвет балла зависит от уровня
        const scoreColor = {
            red: 'var(--warn-col)', orange: 'var(--mid-col)',
            yellow: 'var(--mid-col)', green: 'var(--safe-col)'
        }[data.color] || 'var(--mid-col)';

        document.getElementById('badge-wrap').innerHTML =
            `<span class="risk-badge ${colorClass[data.color]}">${displayLabel}</span>`;
        document.getElementById('score').textContent = data.score + ' / 8';
        document.getElementById('score').style.color = scoreColor;
    }

    // Метрики — предупреждение для прибрежной зоны и поймы
    const terrainWarn = ['Прибрежная зона', 'Пойма (уровень реки)', 'Низина (ниже поймы)'];
    const distWarn    = parseInt(data.dist_to_river_m) < 300;
    const elevWarn    = parseFloat(data.abs_elev_above_river_m) < 3;

    document.getElementById('basin').textContent      = data.basin_area_km2 + ' км²';
    const terrainEl = document.getElementById('terrain');
    terrainEl.textContent = data.terrain_label;
    terrainEl.className   = terrainWarn.includes(data.terrain_label) ? 'val-warn' : '';

    const distEl = document.getElementById('dist');
    distEl.textContent = data.dist_to_river_m + ' м';
    distEl.className   = distWarn ? 'val-warn' : '';

    const elevEl = document.getElementById('elev-above');
    elevEl.textContent = data.abs_elev_above_river_m + ' м';
    elevEl.className   = elevWarn ? 'val-warn' : '';

    // Уклон — процент виден всем (сырой факт), интерпретация/рекомендация
    // режется для free той же логикой, что и рекомендация по фундаменту.
    const slopeBlock = document.getElementById('slope-block');
    if (data.slope) {
        document.getElementById('slope-percent').textContent = data.slope.slope_percent + '%';
        if (data.slope.label) {
            slopeBlock.style.display = 'block';
            document.getElementById('slope-label').textContent = data.slope.label;
            document.getElementById('slope-note').textContent  = data.slope.note;
        } else if (data.interpretation_locked) {
            slopeBlock.style.display = 'block';
            document.getElementById('slope-label').innerHTML = '';
            document.getElementById('slope-note').innerHTML =
                '<span style="display:flex;align-items:center;gap:6px;color:var(--muted)">' +
                '<span>🔒</span><span>Оценка уклона — на платных тарифах</span></span>';
        } else {
            slopeBlock.style.display = 'none';
        }
    } else {
        document.getElementById('slope-percent').textContent = '—';
        slopeBlock.style.display = 'none';
    }

    // ЗОУИТ энергетики/связи/транспорта — целиком платная функция (не
    // сырой факт вроде расстояния до реки, а юридическая проверка).
    // Для free сервер вообще не присылает поле energy_zouit — отличаем
    // "free, замок" (interpretation_locked=true) от "paid, но проверка
    // не удалась/недоступна" (energy_zouit===null) — во втором случае
    // молча прячем блок, а не показываем "войдите" платному юзеру.
    const zouitBlock = document.getElementById('zouit-block');
    if (data.energy_zouit) {
        zouitBlock.style.display = 'block';
        const label = document.getElementById('zouit-label');
        const note  = document.getElementById('zouit-note');
        if (data.energy_zouit.in_zone) {
            zouitBlock.style.background = '#fdf1e8';
            label.textContent = '⚠️ Участок попадает в охранную зону';
            label.style.color = 'var(--warn-col,#c0392b)';
            note.textContent  = 'Реестровый номер границы: ' + (data.energy_zouit.reg_numb || '—') +
                '. Возможны ограничения на капитальное строительство — уточните вид объекта ' +
                '(ЛЭП, связь, транспорт) по выписке ЕГРН.';
        } else {
            zouitBlock.style.background = 'var(--bg)';
            label.textContent = '✅ Вне зарегистрированных охранных зон';
            label.style.color = 'var(--text)';
            note.textContent  = 'По слою энергетики, связи и транспорта ЕГРН зарегистрированных ограничений не найдено.';
        }
    } else if (data.interpretation_locked) {
        zouitBlock.style.display    = 'block';
        zouitBlock.style.background = 'var(--bg)';
        document.getElementById('zouit-label').innerHTML = '';
        document.getElementById('zouit-note').innerHTML =
            '<span style="display:flex;align-items:center;gap:6px;color:var(--muted)">' +
            '<span>🔒</span><span>Проверка охранных зон — на платных тарифах</span></span>';
    } else {
        zouitBlock.style.display = 'none';
    }

    // Почва — тип/пучинистость/дренаж остаются фактами и видны всем.
    // Рекомендация по фундаменту — интерпретация, для free сервер её
    // не присылает (redact_for_free_tier), показываем честный замок.
    if (data.soil) {
        document.getElementById('soil-type').textContent     = data.soil.soil_type;
        document.getElementById('soil-heave').textContent    = data.soil.heave_risk;
        document.getElementById('soil-drainage').textContent = data.soil.drainage_label;

        if (data.interpretation_locked) {
            document.getElementById('soil-foundation').innerHTML = '';
            document.getElementById('soil-foundation-detail').innerHTML =
                '<span style="display:flex;align-items:center;gap:6px;color:var(--muted)">' +
                '<span>🔒</span><span>Рекомендация по фундаменту — на платных тарифах</span></span>';
        } else {
            document.getElementById('soil-foundation').textContent        = data.soil.foundation;
            document.getElementById('soil-foundation-detail').textContent = data.soil.foundation_detail;
        }
        document.getElementById('soil-block').style.display = 'block';
        document.getElementById('soil-empty').style.display = 'none';
    } else {
        document.getElementById('soil-block').style.display = 'none';
        document.getElementById('soil-empty').style.display = 'block';
    }

    // История паводков
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';
    if (data.flood_history && data.flood_history.length > 0) {
        data.flood_history.forEach(event => {
            // Цвет карточки паводка через border-left — используем CSS-переменные
            const borderColor = {
                catastrophic: 'var(--warn-col)',
                major:        'var(--mid-col)',
                moderate:     'var(--mid-bdr)',
            }[event.severity] || 'var(--faint)';
            const bgColor = {
                catastrophic: 'var(--warn-bg)',
                major:        'var(--mid-bg)',
                moderate:     'var(--mid-bg)',
            }[event.severity] || 'var(--bg)';
            const label = {
                catastrophic: 'Катастрофическое',
                major:        'Крупное',
                moderate:     'Умеренное',
            }[event.severity] || event.severity;

            const card = document.createElement('div');
            card.className = 'flood-card';
            card.style.borderLeftColor = borderColor;
            card.style.background      = bgColor;

            const title = document.createElement('div');
            title.className   = 'flood-card-title';
            title.textContent = `${event.year} — ${label}`;

            const desc = document.createElement('div');
            desc.className   = 'flood-card-desc';
            desc.textContent = event.description;

            const src = document.createElement('div');
            src.className   = 'flood-card-src';
            src.textContent = `Источник: ${event.source}`;

            card.appendChild(title);
            card.appendChild(desc);
            card.appendChild(src);
            historyList.appendChild(card);
        });
    } else {
        const empty = document.createElement('div');
        empty.style.cssText = 'font-size:13px;color:var(--faint);padding:10px 0';
        empty.textContent   = 'Затоплений в базе не зафиксировано';
        historyList.appendChild(empty);
    }
}

// ── Вкладки результатов ────────────────────────────────
function switchResultTab(tabName) {
    document.querySelectorAll('.result-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });
    document.querySelectorAll('.result-tab-content').forEach(c => {
        c.classList.toggle('active', c.id === 'tab-' + tabName);
    });
}

// ═══════════════════════════════════════════════════════
//  АНАЛИЗ ТОЧКИ (клик по карте ИЛИ найденный кадастровый участок)
// ═══════════════════════════════════════════════════════

// Полигон участка под точкой клика — необязательное обогащение, не должно
// мешать основному расчёту риска и не должно дёргать UI логина/оплаты на
// фоновой ошибке (поэтому обычный fetch, а не authFetch: тот на 401/402
// сам открывает модалки, а /api/risk этим же кликом их и так откроет,
// если действительно нужно — дублировать не хотим).
async function lookupCadastreAtPoint(lon, lat) {
    const token = ++cadastreLookupToken;
    try {
        const res = await fetch('/api/cadastre/point', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lon, lat }),
        });

        if (!res.ok) {
            // Тихо для пользователя (не нашли участок / НСПД недоступен —
            // норма), но не тихо для консоли. Исключение — 429: это
            // единственный случай, где молчать не стоит, иначе человек не
            // поймёт, почему клики вдруг перестали что-то давать.
            const body = await res.json().catch(() => null);
            console.log(`[cadastre/point] ${res.status}`, body ?? '(не JSON-ответ)');
            if (res.status === 429 && body?.message) {
                showToast(body.message, 'warn');
            }
            return;
        }
        if (token !== cadastreLookupToken) {
            console.log('[cadastre/point] ответ устарел, кликнули в другое место — игнорирую');
            return;
        }

        const data = await res.json();
        console.log('[cadastre/point] найден участок', data);
        if (data.geometry) {
            drawCadastrePolygon(data);
        }
    } catch(e) {
        console.log('[cadastre/point] сетевая ошибка', e);
    }
}

async function analyzePoint(lat, lng, opts = {}) {
    if (!currentRegion) return;

    if (marker)      { map.removeLayer(marker);      }
    if (riverMarker) { map.removeLayer(riverMarker); }
    marker = L.marker([lat, lng], { icon: siteIcon }).addTo(map);

    document.getElementById('map-hint').classList.add('hidden');

    // Панель показываем сразу — и на мобилке тоже. Иначе она открылась бы
    // только через openResultModal()/showLoginPromptPanel() ниже, а до них
    // можно не дойти, но блок данных ЕГРН (renderCadastreInfo, см.
    // lookupCadastreAtPoint) ни от квоты, ни от логина не зависит и должен
    // быть виден в любом случае — иначе поля заполнятся в невидимом блоке.
    document.getElementById('result-modal').classList.add('visible');

    // Кадастровые данные — публичная информация ЕГРН, бесплатна и без
    // логина. Ищем контур участка в фоне независимо от квоты/авторизации,
    // не блокируя её платным расчётом риска ниже.
    // skipCadastreLookup — когда сюда пришли из явного поиска по номеру:
    // полигон уже нарисован из его ответа, второй раз то же самое не ищем.
    if (!opts.skipCadastreLookup) {
        clearCadastrePolygon();
        lookupCadastreAtPoint(lng, lat);
    }

    // Не залогинен — платный анализ вообще не запускаем: ни фейкового
    // "Анализируем участок" для того, что не будет проанализировано, ни
    // автоматического попапа логина. Вместо этого — приглашение с кнопкой,
    // войти пользователь решает сам явным кликом, а не по факту 401.
    if (!currentUser) {
        showLoginPromptPanel();
        return;
    }

    // Залогинен, но квота исчерпана — это уже осознанное действие
    // (пользователь кликнул сам), тут честный пейволл уместен. Модалка —
    // основной инструмент продажи; showQuotaExhaustedPanel() — то, что
    // останется в панели, если её закроют кнопкой "Не сейчас".
    if (isQuotaExhausted()) {
        showQuotaExhaustedPanel();
        showPaywall('Лимит запросов исчерпан.');
        return;
    }

    isLoading = true;
    openResultModal();
    switchResultTab('soil');

    try {
        const res  = await authFetch('/api/risk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lon: lng, lat, region: currentRegion }),
        });
        const data = await res.json();

        await refreshMe();
        isLoading = false;

        if (data.error) {
            document.getElementById('result-loading').textContent = '⚠️ ' + data.error;
            return;
        }

        data._lat = lat;
        data._lng = lng;

        showResultContent(data);

        // Маркер русла — синий кружок (цвет --river из палитры,
        // зашит как hex: Leaflet рисует SVG-атрибуты, var() там ненадёжен)
        riverMarker = L.circleMarker([data.river_lat, data.river_lon], {
            radius: 5,
            color: '#2a6496', fillColor: '#2a6496', fillOpacity: 0.85,
            weight: 2,
        }).addTo(map).bindTooltip('Ближайшее русло');

        // ИИ-заключение и чат — платная функция. Для free не просто прячем
        // на фронте, а вообще не вызываем /api/explain и не инициализируем
        // чат — эндпоинт всё равно вернул бы 402 без похода к LLM, но лучше
        // не делать сетевой запрос которому заведомо суждено быть отклонён.
        const isPaidUser = currentUser && currentUser.plan !== 'free';
        if (isPaidUser) {
            setAiTabLocked(false);
            loadAiExplain(data);
            initChat(data);
        } else {
            setAiTabLocked(true);
        }

    } catch(e) {
        isLoading = false;
        if (e.message === 'auth_required' || e.message === 'limit_reached') return;
        document.getElementById('result-loading').textContent = '⚠️ Ошибка соединения';
    }
}

// ═══════════════════════════════════════════════════════
//  КЛИК ПО КАРТЕ
// ═══════════════════════════════════════════════════════

map.on('click', async (e) => {
    if (!currentRegion) return;

    // if (!localStorage.getItem('disclaimer_accepted')) {
    //     showDisclaimer(e.latlng);
    //     return;
    // }

    await analyzePoint(e.latlng.lat, e.latlng.lng);
});

// ═══════════════════════════════════════════════════════
//  ПОИСК ПО КАДАСТРОВОМУ НОМЕРУ
// ═══════════════════════════════════════════════════════

let cadastreErrTimer = null;

function showCadastreError(msg) {
    const el = document.getElementById('cadastre-err');
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(cadastreErrTimer);
    cadastreErrTimer = setTimeout(() => el.classList.remove('visible'), 4000);
}

async function searchCadastre() {
    const input  = document.getElementById('cadastre-input');
    const btn    = document.getElementById('cadastre-btn');
    const number = input.value.trim();

    if (!number) return;

    btn.disabled    = true;
    btn.textContent = '⏳';

    try {
        const res  = await authFetch('/api/cadastre', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ number }),
        });
        const data = await res.json();

        if (data.error) {
            showCadastreError(data.message || 'Не удалось найти участок');
            return;
        }

        // Найденный регион может отличаться от выбранного сейчас —
        // переключаем регион на тот, к которому реально относится участок.
        // Явно ждём переключения (а не dispatchEvent), иначе рисование
        // полигона ниже гоняется с асинхронным change-обработчиком
        // региона, который сбрасывает вид карты и чистит именно этот слой.
        if (data.region_key && data.region_key !== currentRegion) {
            const regionsRes = await fetch('/api/regions');
            const regions    = await regionsRes.json();
            if (regions[data.region_key]?.loaded) {
                document.getElementById('region-select').value = data.region_key;
                selectRegion(data.region_key, regions[data.region_key]);
            }
        }

        clearCadastrePolygon();
        if (data.geometry) {
            drawCadastrePolygon(data);
            map.fitBounds(cadastrePolygon.getBounds(), { maxZoom: 17, padding: [40, 40] });
        } else {
            map.setView([data.lat, data.lon], 17);
        }

        input.value = '';
        await analyzePoint(data.lat, data.lon, { skipCadastreLookup: true });

    } catch(e) {
        if (e.message === 'auth_required' || e.message === 'limit_reached') return;
        showCadastreError('Ошибка соединения с сервером');
    } finally {
        btn.disabled    = false;
        btn.textContent = '🔍';
    }
}

document.getElementById('cadastre-btn').addEventListener('click', searchCadastre);
document.getElementById('cadastre-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchCadastre();
});

// Тот же паттерн для вкладки «ИИ»: заключение и чат — платная функция.
// Здесь скрывается сразу два блока (текст объяснения и чат), потому что оба завязаны на один и тот же тарифный барьер.
// и чат), потому что оба завязаны на один и тот же тарифный барьер.
function setAiTabLocked(locked) {
    const tabBtn  = document.querySelector('.result-tab[data-tab="ai"]');
    const loading = document.getElementById('ai-loading');
    const text    = document.getElementById('ai-text');
    const chat    = document.getElementById('chat-block');
    const upsell  = document.getElementById('ai-upsell');

    if (locked) {
        loading.style.display = 'none';
        text.style.display    = 'none';
        chat.style.display    = 'none';
        upsell.style.display  = 'block';
        if (tabBtn && !tabBtn.querySelector('.lock-ico')) {
            tabBtn.insertAdjacentHTML('beforeend', '<span class="lock-ico">🔒</span>');
        }
    } else {
        upsell.style.display = 'none';
        const lockIco = tabBtn?.querySelector('.lock-ico');
        if (lockIco) lockIco.remove();
    }
}

// ═══════════════════════════════════════════════════════
//  ИИ-ОБЪЯСНЕНИЕ
// ═══════════════════════════════════════════════════════

async function loadAiExplain(data) {
    const loadingEl = document.getElementById('ai-loading');
    const textEl    = document.getElementById('ai-text');
    loadingEl.style.display = 'block';
    textEl.style.display    = 'none';

    try {
        // Передаём только request_id — сервер берёт все данные из БД
        const params = data.request_id
            ? `?request_id=${encodeURIComponent(data.request_id)}`
            : `?risk=${data.risk}&region=${currentRegion}`
              + `&basin=${data.basin_area_km2}`
              + `&terrain=${encodeURIComponent(data.terrain_label || '')}`
              + `&dist=${data.dist_to_river_m}&score=${data.score}`
              + `&elev_above=${data.abs_elev_above_river_m}`;

        const res = await authFetch('/api/explain' + params);
        const ai  = await res.json();
        loadingEl.style.display = 'none';
        if (ai.explanation) {
            textEl.textContent   = ai.explanation;
            textEl.style.display = 'block';
        }

        // Активируем кнопку PDF только сейчас — ИИ-текст готов и будет в отчёте
        const reportBtn = document.getElementById('report-btn');
        if (reportBtn && currentUser && currentUser.plan !== 'free') {
            reportBtn.disabled = false;
            reportBtn.title    = 'Скачать PDF-отчёт';
        }
    } catch(e) {
        loadingEl.style.display = 'none';
        // ИИ не ответил — всё равно разблокируем кнопку,
        // отчёт сформируется без заключения консультанта
        const reportBtn = document.getElementById('report-btn');
        if (reportBtn && currentUser && currentUser.plan !== 'free') {
            reportBtn.disabled = false;
            reportBtn.title    = 'Скачать PDF-отчёт (без заключения ИИ)';
        }
    }
}

// ═══════════════════════════════════════════════════════
//  ЧАТ
// ═══════════════════════════════════════════════════════

let chatHistory         = [];
let currentPointContext = null;

function initChat(data) {
    chatHistory         = [];
    currentPointContext = data;
    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-block').style.display = 'block';
    document.getElementById('chat-input').value = '';
    const sugg = document.getElementById('chat-suggestions');
    if (sugg) sugg.style.display = 'flex';
}

function useSuggestion(btn) {
    const input = document.getElementById('chat-input');
    input.value = btn.textContent;
    const sugg  = document.getElementById('chat-suggestions');
    if (sugg) sugg.style.display = 'none';
    sendChatMessage();
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg   = input.value.trim();
    if (!msg || !currentPointContext) return;
    input.value = '';

    const messages = document.getElementById('chat-messages');

    const userDiv = document.createElement('div');
    userDiv.className   = 'msg-user';
    userDiv.textContent = msg;
    messages.appendChild(userDiv);

    const loadingDiv = document.createElement('div');
    loadingDiv.className   = 'msg-loading';
    loadingDiv.textContent = '⏳ думаю...';
    messages.appendChild(loadingDiv);
    messages.scrollTop = messages.scrollHeight;

    try {
        // Передаём request_id — сервер берёт контекст и историю из БД
        const body = currentPointContext.request_id
            ? { message: msg, request_id: currentPointContext.request_id }
            : { message: msg, history: chatHistory,
                context: currentPointContext, region: currentRegion };

        const res  = await authFetch('/api/chat', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
        });
        const data = await res.json();
        loadingDiv.remove();

        if (data.reply) {
            // Локальную историю тоже обновляем — для fallback без request_id
            chatHistory.push({ role: 'user',      content: msg        });
            chatHistory.push({ role: 'assistant', content: data.reply });

            const aiDiv = document.createElement('div');
            aiDiv.className   = 'msg-ai';
            aiDiv.textContent = data.reply;
            messages.appendChild(aiDiv);
            messages.scrollTop = messages.scrollHeight;

            if (currentUser && data.chat_left !== undefined) {
                currentUser.chat_left = data.chat_left;
                updateUserBar();
            }
        }
    } catch(e) {
        loadingDiv.remove();
        const errDiv = document.createElement('div');
        errDiv.className   = 'msg-loading';
        errDiv.textContent = '⚠️ Ошибка соединения';
        messages.appendChild(errDiv);
    }
}

// ═══════════════════════════════════════════════════════
//  PDF-ОТЧЁТ
// ═══════════════════════════════════════════════════════

async function generateReport() {
    if (!currentPointContext) return;
    if (!currentUser || currentUser.plan === 'free') {
        showPaywall('Отчёт доступен на платных тарифах');
        return;
    }

    const d = currentPointContext;

    if (!d.request_id || !d.report_token) {
        showToast('⚠ Кликните на участок повторно чтобы сформировать отчёт', 'warn');
        return;
    }

    const btn      = document.getElementById('report-btn');
    const origHTML = btn.innerHTML;
    btn.classList.add('loading');
    btn.innerHTML = '⏳';
    btn.disabled  = true;

    try {
        // Только request_id и токен — никаких данных в URL
        const params = new URLSearchParams({
            request_id:   d.request_id,
            report_token: d.report_token,
        });

        const res = await authFetch('/api/report?' + params.toString());

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (res.status === 403) {
                if (err.error === 'token_invalid') {
                    showToast('⏱ Токен истёк. Кликните на участок повторно.', 'warn');
                } else {
                    showPaywall(err.message || 'Отчёт доступен на платных тарифах');
                }
            } else {
                showToast('⚠ Не удалось сформировать отчёт', 'warn');
            }
            return;
        }

        const html = await res.text();
        const win  = window.open('', '_blank', 'width=860,height=700');
        if (!win) {
            showToast('⚠ Браузер заблокировал всплывающее окно. Разрешите его для gidrorisk.ru.', 'warn');
            return;
        }
        win.document.open();
        win.document.write(html);
        win.document.close();
        // print() вызывается самим отчётом после загрузки тайлов карты

    } catch(e) {
        if (e.message !== 'auth_required' && e.message !== 'limit_reached') {
            showToast('⚠ Ошибка при формировании отчёта', 'warn');
        }
    } finally {
        btn.classList.remove('loading');
        btn.innerHTML = origHTML;
        btn.disabled  = !currentUser || currentUser.plan === 'free';
    }
}

// ═══════════════════════════════════════════════════════
//  ОБРАБОТЧИКИ
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

    // User bar
    document.getElementById('login-btn').addEventListener('click',  () => showAuth());
    document.getElementById('logout-btn').addEventListener('click', doLogout);

    // Auth modal
    document.getElementById('tab-login').addEventListener('click',    () => switchTab('login'));
    document.getElementById('tab-register').addEventListener('click', () => switchTab('register'));
    document.getElementById('auth-btn').addEventListener('click', doAuth);
    document.getElementById('ya-btn').addEventListener('click', () => { location.href = '/api/auth/yandex'; });
    document.getElementById('auth-email').addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });
    document.getElementById('auth-pass').addEventListener('keydown',  e => { if (e.key === 'Enter') doAuth(); });
    CONSENTS.forEach(c => {
        document.getElementById(c.id).addEventListener('change', () => paintConsents());
    });

    // Paywall
    document.getElementById('paywall-modal').addEventListener('click', e => {
        const card = e.target.closest('[data-plan]');
        if (card) selectPlan(card.dataset.plan, card);
    });
    document.getElementById('pay-btn').addEventListener('click', doPay);
    document.getElementById('close-paywall-btn').addEventListener('click', closePaywall);

    // Результаты — закрытие
    document.getElementById('result-close').addEventListener('click', () => closeResultModal(false));
    document.getElementById('result-login-btn').addEventListener('click', () => showAuth());
    document.getElementById('result-quota-btn').addEventListener('click', () => showPaywall('Лимит запросов исчерпан.'));
    document.getElementById('result-modal').addEventListener('click', e => {
        if (e.target === document.getElementById('result-modal')) closeResultModal(false);
    });

    // PDF-отчёт
    document.getElementById('report-btn').addEventListener('click', generateReport);

    // Апсейл-кнопки — через addEventListener вместо inline onclick
    // (inline onclick ненадёжен если JS ещё не загружен к моменту клика)
    // Единственная кнопка «купить» на всю модалку — единый лок наверху
    const riskLockedBtn = document.getElementById('risk-locked-btn');
    if (riskLockedBtn) {
        riskLockedBtn.addEventListener('click', () => {
            showPaywall('Откройте оценку риска, фундамент и заключение ИИ для этого участка');
        });
    }
    const aiUpsellBtn = document.getElementById('ai-upsell-btn');
    if (aiUpsellBtn) {
        aiUpsellBtn.addEventListener('click', () => {
            closeResultModal(true);
            showPaywall('Откройте заключение ИИ и чат — доступно с любого платного тарифа');
        });
    }

    // Чипы-подсказки в чате — делегирование вместо inline onclick
    // (тот же класс бага что уже ловили: inline-обработчик может
    // выполниться раньше чем скрипт полностью загрузится)
    document.querySelectorAll('.chat-suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => useSuggestion(chip));
    });

    const evCloseBtn = document.getElementById('ev-close-btn');
    if (evCloseBtn) {
        evCloseBtn.addEventListener('click', () => {
            document.getElementById('email-verify-modal').classList.remove('visible');
        });
    }

    // Вкладки результатов
    document.querySelectorAll('.result-tab').forEach(tab => {
        tab.addEventListener('click', () => switchResultTab(tab.dataset.tab));
    });

    // Регион
    document.getElementById('region-select').addEventListener('change', function() {
        fetch('/api/regions')
            .then(r => r.json())
            .then(regions => {
                const key = this.value;
                if (key && regions[key]?.loaded) selectRegion(key, regions[key]);
            });
    });

    // Чат
    document.getElementById('chat-send').addEventListener('click', sendChatMessage);
    document.getElementById('chat-input').addEventListener('keypress', e => {
        if (e.key === 'Enter') sendChatMessage();
    });
});

// ═══════════════════════════════════════════════════════
//  ОНБОРДИНГ
// ═══════════════════════════════════════════════════════

const ONBOARDING_STEPS = [
    {
        targetId: 'region-select',
        text: '📍 <b>Выберите регион</b> для анализа — Москва, Краснодар, Пермь и другие. От выбора зависит, какие участки доступны на карте.',
        arrow: 'down', position: 'below'
    },
    {
        targetId: 'ub-quota-label',
        text: '📊 <b>Счётчик запросов</b> — здесь видно, сколько анализов участков и вопросов к ИИ у вас ещё осталось.',
        arrow: 'up', position: 'below'
    },
    {
        targetId: 'map',
        text: '🖱️ <b>Кликните по любой точке на карте</b> — сервис мгновенно оценит риск паводка, состав почвы, историю затоплений и даст рекомендации ИИ.',
        arrow: 'up', position: 'center', isLast: true
    }
];

let obStep = 0;

function startOnboarding() {
    obStep = 0;
    showObStep(obStep);
}

function showObStep(idx) {
    const step    = ONBOARDING_STEPS[idx];
    const total   = ONBOARDING_STEPS.length;
    let   target  = document.getElementById(step.targetId);
    const overlay = document.getElementById('onboarding-overlay');
    const blocker = document.getElementById('onboarding-blocker');
    const tooltip = document.getElementById('onboarding-tooltip');
    const stepEl  = document.getElementById('ob-step');
    const textEl  = document.getElementById('ob-text');
    const nextBtn = document.getElementById('ob-next');
    const skipBtn = document.getElementById('ob-skip');
    const arrowEl = document.getElementById('ob-arrow');

    if (!target || target.offsetParent === null) {
        target = document.getElementById('user-bar') || target;
    }
    if (!target) { finishOnboarding(); return; }

    stepEl.textContent  = `Шаг ${idx + 1} из ${total}`;
    textEl.innerHTML    = step.text;
    nextBtn.textContent = step.isLast ? 'Начать работу ✓' : 'Далее →';

    overlay.classList.add('active');
    blocker.classList.add('active');

    document.querySelectorAll('.onboarding-highlight')
            .forEach(el => el.classList.remove('onboarding-highlight'));
    target.classList.add('onboarding-highlight');

    positionSpotlight(target, step);
    positionTooltip(target, step, tooltip, arrowEl);
    tooltip.classList.add('active');

    nextBtn.onclick = () => advanceOnboarding();
    skipBtn.onclick = () => finishOnboarding();
}

function positionSpotlight(target, step) {
    const rect    = target.getBoundingClientRect();
    const pad     = step.targetId === 'map' ? 0 : 6;
    const holeEl  = document.getElementById('ob-mask-hole');
    const dimEl   = document.getElementById('ob-dim');
    const svgEl   = document.getElementById('onboarding-overlay');
    const fullEl  = document.getElementById('ob-mask-full');

    svgEl.setAttribute('width',  window.innerWidth);
    svgEl.setAttribute('height', window.innerHeight);
    dimEl.setAttribute('width',  window.innerWidth);
    dimEl.setAttribute('height', window.innerHeight);
    fullEl.setAttribute('width',  window.innerWidth);
    fullEl.setAttribute('height', window.innerHeight);

    holeEl.setAttribute('x',      rect.left   - pad);
    holeEl.setAttribute('y',      rect.top    - pad);
    holeEl.setAttribute('width',  rect.width  + pad * 2);
    holeEl.setAttribute('height', rect.height + pad * 2);
}

function positionTooltip(target, step, tooltip, arrowEl) {
    tooltip.style.top    = '';
    tooltip.style.left   = '';
    tooltip.style.right  = '';
    tooltip.style.bottom = '';
    tooltip.style.transform = '';
    arrowEl.className = 'ob-arrow';

    const rect   = target.getBoundingClientRect();
    const tW     = 280;
    const tH     = 160;
    const margin = 16;

    let top, left;

    if (step.position === 'center') {
        top  = Math.max(margin, rect.top + rect.height / 2 - tH / 2);
        left = Math.max(margin, Math.min(window.innerWidth - tW - margin,
                                         window.innerWidth / 2 - tW / 2));
        arrowEl.classList.add('up');
        arrowEl.style.left = (tW / 2 - 8) + 'px';
    } else if (step.position === 'below') {
        top  = rect.bottom + margin;
        left = Math.max(margin, Math.min(window.innerWidth - tW - margin, rect.left));
        arrowEl.classList.add('up');
        arrowEl.style.left = Math.max(12, rect.left - left + 12) + 'px';
    } else {
        top  = rect.top - tH - margin;
        left = Math.max(margin, Math.min(window.innerWidth - tW - margin, rect.left));
        arrowEl.classList.add('down');
        arrowEl.style.left = Math.max(12, rect.left - left + 12) + 'px';
    }

    if (top + tH > window.innerHeight - margin) {
        top = rect.top - tH - margin;
        arrowEl.className   = 'ob-arrow down';
    }

    tooltip.style.top  = Math.max(margin, top) + 'px';
    tooltip.style.left = left + 'px';
}

function advanceOnboarding() {
    obStep++;
    if (obStep >= ONBOARDING_STEPS.length) finishOnboarding();
    else showObStep(obStep);
}

function finishOnboarding() {
    document.getElementById('onboarding-overlay').classList.remove('active');
    document.getElementById('onboarding-blocker').classList.remove('active');
    document.getElementById('onboarding-tooltip').classList.remove('active');
    document.querySelectorAll('.onboarding-highlight')
            .forEach(el => el.classList.remove('onboarding-highlight'));
}

window.addEventListener('resize', () => {
    if (document.getElementById('onboarding-overlay').classList.contains('active')) {
        showObStep(obStep);
    }
});
