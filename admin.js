/* ═══════════════════════════════════════════════════════════
   Boxing Trophy 18 — Admin Panel Logic
   Handles auth, registrations, filtering, matching, export
   ═══════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ── Migration ──────────────────────────────────────────
    function migrateLocalStorage() {
        const migrations = [
            { old: 'fightevent18_registrations', newKey: 'boxingtrophy18_registrations' },
            { old: 'fightevent18_matches', newKey: 'boxingtrophy18_matches' },
            { old: 'fightevent18_matches_timestamp', newKey: 'boxingtrophy18_matches_timestamp' },
            { old: 'fightevent18_unmatched', newKey: 'boxingtrophy18_unmatched' },
            { old: 'fightevent18_lastMatching', newKey: 'boxingtrophy18_lastMatching' }
        ];
        migrations.forEach(m => {
            const oldVal = localStorage.getItem(m.old);
            if (oldVal !== null && localStorage.getItem(m.newKey) === null) {
                localStorage.setItem(m.newKey, oldVal);
            }
        });

        const oldAuth = sessionStorage.getItem('fightevent18_admin_auth');
        if (oldAuth !== null && sessionStorage.getItem('boxingtrophy18_admin_auth') === null) {
            sessionStorage.setItem('boxingtrophy18_admin_auth', oldAuth);
        }
    }
    migrateLocalStorage();

    // ── Constants ──────────────────────────────────────────
    const ADMIN_PASSWORD = (typeof getAdminPasswordFromEnv === 'function' && getAdminPasswordFromEnv())
        || 'boxingtrophy18admin';
    const AUTH_KEY = 'boxingtrophy18_admin_auth';
    const REG_KEY = 'boxingtrophy18_registrations';
    const MATCH_KEY = 'boxingtrophy18_matches';
    const MATCH_TS_KEY = 'boxingtrophy18_matches_timestamp';
    const MATCH_PUBLISHED_KEY = 'matches_published';
    const MATCH_PUBLISHED_AT_KEY = 'matches_published_at';
    const LOCAL_PUBLISHED_KEY = 'boxingtrophy18_matches_published';
    const REG_OPEN_KEY = 'registrations_open';
    const REG_CLOSED_AT_KEY = 'registrations_closed_at';
    const LOCAL_REG_OPEN_KEY = 'boxingtrophy18_registrations_open';

    // ── DOM References ────────────────────────────────────
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    const loginScreen = $('#loginScreen');
    const adminPanel = $('#adminPanel');
    const loginForm = $('#loginForm');
    const loginPassword = $('#loginPassword');
    const loginError = $('#loginError');
    const logoutBtn = $('#logoutBtn');

    // Tabs
    const tabBtns = $$('.tab-btn');
    const tabContents = $$('.tab-content');

    // Dashboard
    const statsGrid = $('#statsGrid');
    const breakdownSexe = $('#breakdownSexe');
    const breakdownNiveau = $('#breakdownNiveau');
    const breakdownPoids = $('#breakdownPoids');

    // Registrations
    const registrationsBody = $('#registrationsBody');
    const noRegistrations = $('#noRegistrations');
    const registrationsTable = $('#registrationsTable');
    const filteredCount = $('#filteredCount');
    const filterSearch = $('#filterSearch');
    const filterSexe = $('#filterSexe');
    const filterNiveau = $('#filterNiveau');
    const filterPoids = $('#filterPoids');
    const exportCsvBtn = $('#exportCsvBtn');

    // Matching
    const generateMatchesBtn = $('#generateMatchesBtn');
    const matchTimestamp = $('#matchTimestamp');
    const matchesContainer = $('#matchesContainer');
    const noMatches = $('#noMatches');

    // Swap Modal
    const swapModal = $('#swapModal');
    const closeSwapModal = $('#closeSwapModal');
    const swapFighterInfo = $('#swapFighterInfo');
    const swapSearch = $('#swapSearch');
    const swapList = $('#swapList');

    // Delete Modal
    const deleteModal = $('#deleteModal');
    const closeDeleteModal = $('#closeDeleteModal');
    const deleteModalText = $('#deleteModalText');
    const cancelDeleteBtn = $('#cancelDeleteBtn');
    const confirmDeleteBtn = $('#confirmDeleteBtn');

    // ── State ─────────────────────────────────────────────
    let registrations = [];
    let matches = [];
    let matchesPublished = false;
    let matchesPublishedAt = null;
    let registrationsOpen = true;
    let registrationsClosedAt = null;
    let pendingDeleteId = null;
    let swapSourceFighterId = null;
    let swapSourceMatchIndex = null;

    function closeAllModals() {
        if (deleteModal) deleteModal.classList.remove('is-open');
        if (swapModal) swapModal.classList.remove('is-open');
        var editM = $('#editModal');
        if (editM) editM.classList.remove('is-open');
        var matchM = $('#matchDetailModal');
        if (matchM) matchM.classList.remove('is-open');
        pendingDeleteId = null;
        swapSourceFighterId = null;
        swapSourceMatchIndex = null;
    }

    // ═══════════════════════════════════════════════════════
    //  AUTH
    // ═══════════════════════════════════════════════════════
    function checkAuth() {
        if (sessionStorage.getItem(AUTH_KEY) === 'true') {
            showAdmin();
        } else {
            showLogin();
        }
    }

    function showLogin() {
        stopDataAutoSync();
        loginScreen.hidden = false;
        adminPanel.hidden = true;
        closeAllModals();
    }

    let isInitialized = false;
    async function showAdmin() {
        loginScreen.hidden = true;
        adminPanel.hidden = false;
        closeAllModals();
        await loadData();
        await loadRegistrationsOpenState();
        enrichMatchesFromRegistrations();
        renderDashboard();
        updateRegistrationsGateUI();
        renderRegistrations();
        await loadMatches();
        renderRecentRegistrations();
        if (!isInitialized) {
            initSorting();
            initCRUDHandlers();
            initAfficheTab();
            initMatchDetailModal();
            await initSettingsTab();
            initWhatsAppTab();
            initRegistrationsGateHandlers();
            isInitialized = true;
        }
        renderAfficheTab();
        startDataAutoSync();
    }

    // ── Sync auto (toutes les 3 min) ───────────────────────
    var dataSyncTimerId = null;
    var DATA_SYNC_MS = 3 * 60 * 1000;
    var lastAutoSyncAt = 0;

    function isModalOpen() {
        return !!document.querySelector('.modal-overlay.is-open');
    }

    function updateAutoSyncStatus() {
        var el = $('#autoSyncStatus');
        if (!el) return;
        if (!lastAutoSyncAt) {
            el.textContent = 'Sync · 3 min';
            return;
        }
        var d = new Date(lastAutoSyncAt);
        el.textContent =
            'Maj ' +
            d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    function mergeQuietFromServer(data) {
        if (!data) return false;
        var newRegs = data.registrations || [];
        var newMatches = data.matches || [];
        var changed =
            JSON.stringify(newRegs) !== JSON.stringify(registrations) ||
            JSON.stringify(newMatches) !== JSON.stringify(matches);
        if (!changed) return false;
        registrations = newRegs;
        matches = newMatches;
        enrichMatchesFromRegistrations();
        if (typeof GalaPoster !== 'undefined') {
            GalaPoster.normalizeMatches(matches);
            GalaPoster.assignMatchMeta(matches);
        }
        return true;
    }

    function refreshAllViews() {
        renderDashboard();
        renderRegistrations();
        renderRecentRegistrations();
        renderMatches();
        renderAfficheTab();
        var activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.tab === 'whatsapp') {
            refreshWhatsAppStatus();
        }
    }

    async function runAutoSync() {
        if (sessionStorage.getItem(AUTH_KEY) !== 'true') return;
        if (isModalOpen()) return;

        try {
            if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                await loadData();
                enrichMatchesFromRegistrations();
                await loadMatches();
            } else {
                var adminPw = sessionStorage.getItem('bt18_admin_pw') || '';
                var res = await fetch('/api/admin/sync', {
                    cache: 'no-store',
                    headers: { 'x-admin-password': adminPw }
                });
                if (res.status === 401) return;
                if (!res.ok) throw new Error('Sync API');
                var data = await res.json();
                mergeQuietFromServer(data);
                if (data.matchesTimestamp && matchTimestamp) {
                    matchTimestamp.textContent =
                        'Dernier appariement : ' + formatDateTime(new Date(data.matchesTimestamp));
                }
                refreshAllViews();
            }

            lastAutoSyncAt = Date.now();
            updateAutoSyncStatus();
            var rb = $('#refreshBtn');
            if (rb) {
                rb.classList.add('sync-pulse');
                setTimeout(function () {
                    rb.classList.remove('sync-pulse');
                }, 600);
            }
        } catch (e) {
            console.warn('Auto-sync:', e);
        }
    }

    function onVisibilityDataSync() {
        if (
            !document.hidden &&
            sessionStorage.getItem(AUTH_KEY) === 'true' &&
            Date.now() - lastAutoSyncAt > DATA_SYNC_MS / 2
        ) {
            runAutoSync();
        }
    }

    function startDataAutoSync() {
        stopDataAutoSync();
        updateAutoSyncStatus();
        runAutoSync();
        dataSyncTimerId = setInterval(runAutoSync, DATA_SYNC_MS);
        document.addEventListener('visibilitychange', onVisibilityDataSync);
    }

    function stopDataAutoSync() {
        if (dataSyncTimerId) {
            clearInterval(dataSyncTimerId);
            dataSyncTimerId = null;
        }
        document.removeEventListener('visibilitychange', onVisibilityDataSync);
    }

    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (loginPassword.value === ADMIN_PASSWORD || loginPassword.value === 'fightevent18admin') {
            sessionStorage.setItem(AUTH_KEY, 'true');
            sessionStorage.setItem('bt18_admin_pw', loginPassword.value);
            loginError.hidden = true;
            showAdmin();
        } else {
            loginError.hidden = false;
            loginPassword.value = '';
            loginPassword.focus();
        }
    });

    logoutBtn.addEventListener('click', function () {
        stopDataAutoSync();
        sessionStorage.removeItem(AUTH_KEY);
        sessionStorage.removeItem('bt18_admin_pw');
        showLogin();
        loginPassword.value = '';
    });

    const togglePasswordBtn = $('#togglePasswordBtn');
    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', function () {
            const type = loginPassword.getAttribute('type') === 'password' ? 'text' : 'password';
            loginPassword.setAttribute('type', type);
            
            if (type === 'text') {
                $('#eyeIcon').innerHTML = `
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                `;
            } else {
                $('#eyeIcon').innerHTML = `
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                `;
            }
        });
    }

    // ═══════════════════════════════════════════════════════
    //  TABS
    // ═══════════════════════════════════════════════════════
    let affichePosterClickBound = false;
    let fighterModalContext = { matchKey: null, side: null };
    let matchDetailContext = { matchKey: null };

    tabBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            const target = btn.dataset.tab;
            tabBtns.forEach(function (b) { b.classList.remove('active'); });
            tabContents.forEach(function (tc) { tc.classList.remove('active'); });
            btn.classList.add('active');
            document.getElementById('tab-' + target).classList.add('active');
            if (target === 'affiche') {
                renderAfficheTab();
            }
            if (target === 'whatsapp') {
                refreshWhatsAppStatus();
                startWhatsAppPolling();
            } else {
                stopWhatsAppPolling();
            }
        });
    });

    // ═══════════════════════════════════════════════════════
    //  DATA
    // ═══════════════════════════════════════════════════════
    async function loadData() {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('registrations')
                    .select('*');
                if (error) throw error;
                registrations = data || [];
                enrichMatchesFromRegistrations();
                return;
            } catch (e) {
                console.error("Supabase loadData error, falling back to LocalStorage:", e);
            }
        }
        try {
            registrations = JSON.parse(localStorage.getItem(REG_KEY)) || [];
        } catch (e) {
            registrations = [];
        }
        enrichMatchesFromRegistrations();
    }

    function saveRegistrations() {
        localStorage.setItem(REG_KEY, JSON.stringify(registrations));
    }

    async function saveMatches() {
        const ts = new Date().toISOString();
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                // Delete existing matches
                const { error: deleteError } = await supabaseClient
                    .from('matches')
                    .delete()
                    .neq('id', -1);
                if (deleteError) throw deleteError;

                // Prepare match rows to insert
                if (typeof GalaPoster !== 'undefined') {
                    GalaPoster.renumberPairMatches(matches);
                    GalaPoster.assignMatchMeta(matches);
                }
                const matchesToInsert = matches.map((m, index) => ({
                    type: m.type,
                    sexe: m.sexe,
                    categoriePoids: m.categoriePoids,
                    niveau: m.niveau,
                    fighter1: m.fighter1,
                    fighter2: m.fighter2,
                    sort_order: index,
                    match_number: m.match_number != null ? m.match_number : null,
                    tier: m.tier || null,
                    winner: m.winner || null
                }));

                if (matchesToInsert.length > 0) {
                    const { error: insertError } = await supabaseClient
                        .from('matches')
                        .insert(matchesToInsert);
                    if (insertError) throw insertError;
                }

                // Update metadata
                const { error: metaError } = await supabaseClient
                    .from('match_metadata')
                    .upsert({ key: 'matches_timestamp', value: ts });
                if (metaError) throw metaError;

                return;
            } catch (e) {
                console.error("Supabase saveMatches error, falling back to LocalStorage:", e);
            }
        }
        localStorage.setItem(MATCH_KEY, JSON.stringify(matches));
        localStorage.setItem(MATCH_TS_KEY, ts);
    }

    async function loadPublishedState() {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('match_metadata')
                    .select('key, value')
                    .in('key', [MATCH_PUBLISHED_KEY, MATCH_PUBLISHED_AT_KEY]);
                if (error) throw error;
                matchesPublished = false;
                matchesPublishedAt = null;
                (data || []).forEach(function (row) {
                    if (row.key === MATCH_PUBLISHED_KEY) matchesPublished = row.value === 'true';
                    if (row.key === MATCH_PUBLISHED_AT_KEY) matchesPublishedAt = row.value || null;
                });
                return;
            } catch (e) {
                console.warn('loadPublishedState:', e);
            }
        }
        matchesPublished = localStorage.getItem(LOCAL_PUBLISHED_KEY) === 'true';
        matchesPublishedAt = localStorage.getItem(LOCAL_PUBLISHED_KEY + '_at');
    }

    async function setMatchesPublished(published) {
        const ts = published ? new Date().toISOString() : '';
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const { error } = await supabaseClient.from('match_metadata').upsert([
                { key: MATCH_PUBLISHED_KEY, value: published ? 'true' : 'false' },
                { key: MATCH_PUBLISHED_AT_KEY, value: ts },
            ]);
            if (error) throw error;
        }
        if (published) {
            localStorage.setItem(LOCAL_PUBLISHED_KEY, 'true');
            localStorage.setItem(LOCAL_PUBLISHED_KEY + '_at', ts);
        } else {
            localStorage.removeItem(LOCAL_PUBLISHED_KEY);
            localStorage.removeItem(LOCAL_PUBLISHED_KEY + '_at');
        }
        matchesPublished = published;
        matchesPublishedAt = published ? ts : null;
        updatePublishStatusUI();
    }

    async function publishMatchesToSite() {
        enrichMatchesFromRegistrations();
        await saveMatches();
        await setMatchesPublished(true);
    }

    async function saveMatchesDraft() {
        enrichMatchesFromRegistrations();
        await saveMatches();
        updatePublishStatusUI();
    }

    function updatePublishStatusUI() {
        var badge = $('#publishStatusBadge');
        var publishBtn = $('#publishSiteBtn');
        var unpublishBtn = $('#unpublishSiteBtn');
        var pairs = getPairMatches();
        if (!pairs.length) {
            if (badge) badge.hidden = true;
            if (publishBtn) publishBtn.hidden = false;
            if (unpublishBtn) unpublishBtn.hidden = true;
            return;
        }
        if (badge) {
            badge.hidden = false;
            if (matchesPublished) {
                badge.textContent = matchesPublishedAt
                    ? '✓ Publié sur le site · ' +
                      new Date(matchesPublishedAt).toLocaleString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                      })
                    : '✓ Publié sur le site';
                badge.className = 'publish-status-badge publish-status-badge--on';
            } else {
                badge.textContent = '⚠ Brouillon — non visible sur le site public';
                badge.className = 'publish-status-badge publish-status-badge--draft';
            }
        }
        if (publishBtn) publishBtn.hidden = !!matchesPublished;
        if (unpublishBtn) unpublishBtn.hidden = !matchesPublished;
    }

    async function loadRegistrationsOpenState() {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('match_metadata')
                    .select('key, value')
                    .in('key', [REG_OPEN_KEY, REG_CLOSED_AT_KEY]);
                if (error) throw error;
                registrationsOpen = false;
                registrationsClosedAt = null;
                var hasOpenKey = false;
                (data || []).forEach(function (row) {
                    if (row.key === REG_OPEN_KEY) {
                        hasOpenKey = true;
                        registrationsOpen = row.value === 'true';
                    }
                    if (row.key === REG_CLOSED_AT_KEY) registrationsClosedAt = row.value || null;
                });
                if (!hasOpenKey) registrationsOpen = false;
                return;
            } catch (e) {
                console.warn('loadRegistrationsOpenState:', e);
            }
        }
        var local = localStorage.getItem(LOCAL_REG_OPEN_KEY);
        registrationsOpen = local === 'true';
        registrationsClosedAt = localStorage.getItem(LOCAL_REG_OPEN_KEY + '_closed_at');
    }

    async function setRegistrationsOpen(open) {
        var ts = open ? '' : new Date().toISOString();
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            const { error } = await supabaseClient.from('match_metadata').upsert([
                { key: REG_OPEN_KEY, value: open ? 'true' : 'false' },
                { key: REG_CLOSED_AT_KEY, value: ts },
            ]);
            if (error) throw error;
        }
        if (open) {
            localStorage.setItem(LOCAL_REG_OPEN_KEY, 'true');
            localStorage.removeItem(LOCAL_REG_OPEN_KEY + '_closed_at');
        } else {
            localStorage.setItem(LOCAL_REG_OPEN_KEY, 'false');
            if (ts) localStorage.setItem(LOCAL_REG_OPEN_KEY + '_closed_at', ts);
        }
        registrationsOpen = open;
        registrationsClosedAt = open ? null : ts;
        updateRegistrationsGateUI();
    }

    function updateRegistrationsGateUI() {
        var status = $('#registrationsGateStatus');
        var openBtn = $('#openRegistrationsBtn');
        var closeBtn = $('#closeRegistrationsBtn');
        if (!status) return;
        if (registrationsOpen) {
            status.textContent = 'Le formulaire public est ouvert — les visiteurs peuvent s\'inscrire.';
            status.style.color = 'var(--success, #4ade80)';
        } else {
            status.textContent = registrationsClosedAt
                ? 'Inscriptions fermées depuis le ' +
                  new Date(registrationsClosedAt).toLocaleString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                  }) +
                  '.'
                : 'Inscriptions fermées — le formulaire public est masqué.';
            status.style.color = 'var(--text-dim)';
        }
        if (openBtn) openBtn.hidden = !!registrationsOpen;
        if (closeBtn) closeBtn.hidden = !registrationsOpen;
    }

    function initRegistrationsGateHandlers() {
        var openBtn = $('#openRegistrationsBtn');
        var closeBtn = $('#closeRegistrationsBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', async function () {
                if (
                    !confirm(
                        'Fermer les inscriptions en ligne ? Le formulaire public sera masqué immédiatement.'
                    )
                ) {
                    return;
                }
                closeBtn.disabled = true;
                try {
                    await setRegistrationsOpen(false);
                } catch (e) {
                    alert('Erreur : ' + (e.message || e));
                } finally {
                    closeBtn.disabled = false;
                }
            });
        }
        if (openBtn) {
            openBtn.addEventListener('click', async function () {
                if (!confirm('Rouvrir les inscriptions en ligne sur le site public ?')) return;
                openBtn.disabled = true;
                try {
                    await setRegistrationsOpen(true);
                } catch (e) {
                    alert('Erreur : ' + (e.message || e));
                } finally {
                    openBtn.disabled = false;
                }
            });
        }
    }

    async function loadMatches() {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('matches')
                    .select('*')
                    .order('sort_order', { ascending: true });
                if (error) throw error;
                matches = data || [];
                if (typeof GalaPoster !== 'undefined') {
                    GalaPoster.normalizeMatches(matches);
                    GalaPoster.assignMatchMeta(matches);
                }

                const { data: metaData, error: metaError } = await supabaseClient
                    .from('match_metadata')
                    .select('value')
                    .eq('key', 'matches_timestamp')
                    .single();

                let ts = null;
                if (!metaError && metaData) {
                    ts = metaData.value;
                }

                if (ts) {
                    const d = new Date(ts);
                    matchTimestamp.textContent = 'Dernier appariement : ' + formatDateTime(d);
                } else {
                    matchTimestamp.textContent = '';
                }
                await loadPublishedState();
                renderMatches();
                renderAfficheTab();
                return;
            } catch (e) {
                console.error("Supabase loadMatches error, falling back to LocalStorage:", e);
            }
        }

        try {
            matches = JSON.parse(localStorage.getItem(MATCH_KEY)) || [];
        } catch (e) {
            matches = [];
        }
        if (typeof GalaPoster !== 'undefined') {
            GalaPoster.normalizeMatches(matches);
            GalaPoster.assignMatchMeta(matches);
        }
        const ts = localStorage.getItem(MATCH_TS_KEY);
        if (ts) {
            const d = new Date(ts);
            matchTimestamp.textContent = 'Dernier appariement : ' + formatDateTime(d);
        }
        await loadPublishedState();
        renderMatches();
        renderAfficheTab();
    }

    // ═══════════════════════════════════════════════════════
    //  DASHBOARD
    // ═══════════════════════════════════════════════════════
    function renderDashboard() {
        const total = registrations.length;
        const hommes = registrations.filter(function (r) { return r.sexe === 'Homme'; }).length;
        const femmes = registrations.filter(function (r) { return r.sexe === 'Femme'; }).length;
        const debutants = registrations.filter(function (r) { return r.niveau === 'Débutant'; }).length;
        const intermediaires = registrations.filter(function (r) { return r.niveau === 'Intermédiaire'; }).length;

        // Weight categories count
        const poidsMap = {};
        registrations.forEach(function (r) {
            if (r.categoriePoids) {
                poidsMap[r.categoriePoids] = (poidsMap[r.categoriePoids] || 0) + 1;
            }
        });
        const nbCategories = Object.keys(poidsMap).length;

        const nbCombats = matches.filter(m => m.type === 'pair').length;
        const nbAttente = matches.filter(m => m.type === 'waiting').length;

        // Stat cards
        statsGrid.innerHTML = '';
        var stats = [
            { label: 'Total inscriptions', value: total, cls: 'red' },
            { label: 'Combats confirmés', value: nbCombats, cls: 'green' },
            { label: 'En attente d\'adversaire', value: nbAttente, cls: 'gold' },
            { label: 'Hommes', value: hommes, cls: 'blue' },
            { label: 'Femmes', value: femmes, cls: 'gold' },
            { label: 'Catégories de poids', value: nbCategories, cls: 'blue' }
        ];
        stats.forEach(function (s) {
            var card = document.createElement('div');
            card.className = 'stat-card ' + s.cls;
            card.innerHTML =
                '<div class="stat-label">' + escapeHtml(s.label) + '</div>' +
                '<div class="stat-value">' + s.value + '</div>';
            statsGrid.appendChild(card);
        });

        // Breakdown by sexe
        breakdownSexe.innerHTML = '';
        [{ label: 'Homme', count: hommes }, { label: 'Femme', count: femmes }].forEach(function (item) {
            var pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
            breakdownSexe.innerHTML +=
                '<div class="breakdown-row">' +
                    '<span class="label">' + item.label + '</span>' +
                    '<div class="breakdown-bar"><div class="breakdown-bar-fill" style="width:' + pct + '%"></div></div>' +
                    '<span class="value">' + item.count + ' (' + pct + '%)</span>' +
                '</div>';
        });

        // Breakdown by niveau
        breakdownNiveau.innerHTML = '';
        [{ label: 'Débutant', count: debutants }, { label: 'Intermédiaire', count: intermediaires }].forEach(function (item) {
            var pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
            breakdownNiveau.innerHTML +=
                '<div class="breakdown-row">' +
                    '<span class="label">' + item.label + '</span>' +
                    '<div class="breakdown-bar"><div class="breakdown-bar-fill" style="width:' + pct + '%"></div></div>' +
                    '<span class="value">' + item.count + ' (' + pct + '%)</span>' +
                '</div>';
        });

        // Breakdown by poids
        breakdownPoids.innerHTML = '';
        var poidsKeys = Object.keys(poidsMap).sort();
        poidsKeys.forEach(function (key) {
            var count = poidsMap[key];
            var pct = total > 0 ? Math.round((count / total) * 100) : 0;
            breakdownPoids.innerHTML +=
                '<div class="breakdown-row">' +
                    '<span class="label">' + escapeHtml(key) + '</span>' +
                    '<div class="breakdown-bar"><div class="breakdown-bar-fill" style="width:' + pct + '%"></div></div>' +
                    '<span class="value">' + count + ' (' + pct + '%)</span>' +
                '</div>';
        });

        if (poidsKeys.length === 0) {
            breakdownPoids.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Aucune donnée</p>';
        }
    }

    function renderRecentRegistrations() {
        const body = $('#recentRegistrationsBody');
        if (!body) return;
        body.innerHTML = '';
        
        const sorted = [...registrations].sort((a, b) => {
            const dateA = new Date(a.dateInscription || 0);
            const dateB = new Date(b.dateInscription || 0);
            return dateB - dateA;
        });

        const recent = sorted.slice(0, 5);
        if (recent.length === 0) {
            body.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-dim); padding:16px;">Aucune inscription récente.</td></tr>';
            return;
        }

        recent.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = 
                '<td data-label="Nom">' + escapeHtml(r.nom || '') + '</td>' +
                '<td data-label="Prénom">' + escapeHtml(r.prenom || '') + '</td>' +
                '<td data-label="Sexe"><span class="badge badge-info badge-sexe">' + escapeHtml(r.sexe || '') + '</span></td>' +
                '<td data-label="Niveau">' + escapeHtml(r.niveau || '') + '</td>' +
                '<td data-label="Cat. Poids">' + escapeHtml(r.categoriePoids || '—') + '</td>' +
                '<td data-label="Club">' + escapeHtml(r.club || '—') + '</td>' +
                '<td data-label="Date inscription">' + escapeHtml(formatDate(r.dateInscription)) + '</td>';
            body.appendChild(tr);
        });
    }

    // ═══════════════════════════════════════════════════════
    //  REGISTRATIONS TABLE
    // ═══════════════════════════════════════════════════════


    let sortColumn = 'dateInscription';
    let sortDirection = 'desc';
    const REG_PER_PAGE = 10;
    let regCurrentPage = 1;

    function normalizeSearchText(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    function registrationMatchesSearch(reg, rawQuery) {
        var q = normalizeSearchText(rawQuery);
        if (!q) return true;
        var qDigits = rawQuery.replace(/\D/g, '');
        var fields = [
            reg.nom,
            reg.prenom,
            reg.email,
            reg.telephone,
            reg.club,
            reg.numeroLicence,
            reg.categoriePoids,
            reg.niveau,
            reg.discipline,
        ];
        var haystack = normalizeSearchText(fields.filter(Boolean).join(' '));
        if (haystack.indexOf(q) !== -1) return true;
        if (qDigits.length >= 3) {
            var tel = String(reg.telephone || '').replace(/\D/g, '');
            if (tel.indexOf(qDigits) !== -1) return true;
        }
        return false;
    }

    function updateRegSearchClearBtn() {
        var clearBtn = $('#filterSearchClear');
        if (!clearBtn || !filterSearch) return;
        clearBtn.hidden = !filterSearch.value.trim();
    }

    function getFilteredRegistrations() {
        var search = filterSearch ? filterSearch.value.trim() : '';
        var sexe = filterSexe.value;
        var niveau = filterNiveau.value;
        var poids = filterPoids.value;
        var licence = $('#filterLicence') ? $('#filterLicence').value : '';

        const filtered = registrations.filter(function (r) {
            if (sexe && r.sexe !== sexe) return false;
            if (niveau && r.niveau !== niveau) return false;
            if (poids && r.categoriePoids !== poids) return false;
            if (licence && r.licencie !== licence) return false;
            if (search && !registrationMatchesSearch(r, search)) return false;
            return true;
        });

        filtered.sort((a, b) => {
            let valA = a[sortColumn] || '';
            let valB = b[sortColumn] || '';
            
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();
            
            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }

    function resetRegPageAndRender() {
        regCurrentPage = 1;
        renderRegistrations();
    }

    function goRegPage(page) {
        var filtered = getFilteredRegistrations();
        var totalPages = Math.max(1, Math.ceil(filtered.length / REG_PER_PAGE));
        regCurrentPage = Math.min(Math.max(1, page), totalPages);
        renderRegistrations();
    }

    function renderRegistrations() {
        var filtered = getFilteredRegistrations();
        var totalPages = Math.max(1, Math.ceil(filtered.length / REG_PER_PAGE));
        if (regCurrentPage > totalPages) regCurrentPage = totalPages;
        if (regCurrentPage < 1) regCurrentPage = 1;

        var start = (regCurrentPage - 1) * REG_PER_PAGE;
        var pageItems = filtered.slice(start, start + REG_PER_PAGE);

        registrationsBody.innerHTML = '';

        var pagination = $('#regPagination');
        var scrollHost = $('#regTableScrollHost');
        if (filtered.length === 0) {
            if (scrollHost) scrollHost.style.display = 'none';
            noRegistrations.hidden = false;
            if (pagination) pagination.hidden = true;
        } else {
            if (scrollHost) scrollHost.style.display = '';
            noRegistrations.hidden = true;
            if (pagination) pagination.hidden = false;
        }

        filteredCount.textContent =
            filtered.length +
            ' inscription(s) sur ' +
            registrations.length +
            ' — page ' +
            regCurrentPage +
            '/' +
            totalPages;

        var pageInfo = $('#regPageInfo');
        if (pageInfo) {
            pageInfo.textContent = 'Page ' + regCurrentPage + ' / ' + totalPages;
        }
        ['regPageFirst', 'regPagePrev', 'regPageNext', 'regPageLast'].forEach(function (id) {
            var btn = $('#' + id);
            if (!btn) return;
            if (id === 'regPageFirst' || id === 'regPagePrev') {
                btn.disabled = regCurrentPage <= 1;
            } else {
                btn.disabled = regCurrentPage >= totalPages;
            }
        });

        pageItems.forEach(function (r) {
            var tr = document.createElement('tr');
            tr.className = 'reg-row-clickable';
            tr.innerHTML =
                '<td data-label="Nom">' + escapeHtml(r.nom || '') + '</td>' +
                '<td data-label="Prénom">' + escapeHtml(r.prenom || '') + '</td>' +
                '<td data-label="Naissance">' + escapeHtml(formatDate(r.dateNaissance)) + '</td>' +
                '<td data-label="Sexe"><span class="badge badge-info badge-sexe">' + escapeHtml(r.sexe || '') + '</span></td>' +
                '<td data-label="E-mail">' + escapeHtml(r.email || '—') + '</td>' +
                '<td data-label="Téléphone">' + escapeHtml(r.telephone || '—') + '</td>' +
                '<td data-label="Niveau">' + escapeHtml(r.niveau || '') + '</td>' +
                '<td data-label="Discipline">' + escapeHtml(r.discipline || '') + '</td>' +
                '<td data-label="Licencié">' + (r.licencie === 'Oui' || r.licencie === true ? '<span class="badge badge-success">Oui</span>' : '<span class="badge badge-warning">Non</span>') + '</td>' +
                '<td data-label="N° Licence">' + escapeHtml(r.numeroLicence || '—') + '</td>' +
                '<td data-label="Club">' + escapeHtml(r.club || '—') + '</td>' +
                '<td data-label="Poids">' + escapeHtml(r.categoriePoids || '—') + '</td>' +
                '<td data-label="Inscription">' + escapeHtml(formatDate(r.dateInscription)) + '</td>' +
                '<td data-label="Actions">' +
                    '<button class="btn-icon" title="Modifier" data-edit-id="' + r.id + '" style="margin-right:4px;" aria-label="Modifier">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
                    '</button>' +
                    '<button class="btn-icon danger" title="Supprimer" data-delete-id="' + r.id + '" aria-label="Supprimer">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>' +
                    '</button>' +
                '</td>';
            registrationsBody.appendChild(tr);
            tr.addEventListener('click', function (e) {
                if (e.target.closest('button')) return;
                openEditModal(r.id);
            });
        });

        registrationsBody.querySelectorAll('[data-edit-id]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                openEditModal(btn.dataset.editId);
            });
        });

        registrationsBody.querySelectorAll('[data-delete-id]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                openDeleteModal(btn.dataset.deleteId);
            });
        });

        syncRegTableHorizontalScroll();
    }

    function syncRegTableHorizontalScroll() {
        var table = $('#registrationsTable');
        var top = $('#regTableScrollTop');
        var topInner = $('#regTableScrollTopInner');
        var bottom = $('#regTableScrollBottom');
        if (!table || !top || !bottom || !topInner) return;

        requestAnimationFrame(function () {
            topInner.style.width = table.scrollWidth + 'px';
        });

        if (top.dataset.scrollSynced === '1') return;
        top.dataset.scrollSynced = '1';

        var lock = false;
        function link(from, to) {
            from.addEventListener('scroll', function () {
                if (lock) return;
                lock = true;
                to.scrollLeft = from.scrollLeft;
                lock = false;
            });
        }
        link(top, bottom);
        link(bottom, top);
    }

    // Pagination inscriptions
    (function initRegPagination() {
        var first = $('#regPageFirst');
        var prev = $('#regPagePrev');
        var next = $('#regPageNext');
        var last = $('#regPageLast');
        if (first) first.addEventListener('click', function () { goRegPage(1); });
        if (prev) prev.addEventListener('click', function () { goRegPage(regCurrentPage - 1); });
        if (next) next.addEventListener('click', function () { goRegPage(regCurrentPage + 1); });
        if (last) {
            last.addEventListener('click', function () {
                var total = Math.max(1, Math.ceil(getFilteredRegistrations().length / REG_PER_PAGE));
                goRegPage(total);
            });
        }
    })();

    // Filters & recherche
    if (filterSearch) {
        filterSearch.addEventListener('input', function () {
            updateRegSearchClearBtn();
            resetRegPageAndRender();
        });
        filterSearch.addEventListener('search', resetRegPageAndRender);
    }
    var filterSearchClear = $('#filterSearchClear');
    if (filterSearchClear && filterSearch) {
        filterSearchClear.addEventListener('click', function () {
            filterSearch.value = '';
            updateRegSearchClearBtn();
            filterSearch.focus();
            resetRegPageAndRender();
        });
    }
    updateRegSearchClearBtn();
    filterSexe.addEventListener('change', resetRegPageAndRender);
    filterNiveau.addEventListener('change', resetRegPageAndRender);
    filterPoids.addEventListener('change', resetRegPageAndRender);
    if ($('#filterLicence')) {
        $('#filterLicence').addEventListener('change', resetRegPageAndRender);
    }

    // ═══════════════════════════════════════════════════════
    //  DELETE
    // ═══════════════════════════════════════════════════════
    function openDeleteModal(id) {
        var reg = registrations.find(function (r) { return r.id === id; });
        if (!reg) return;
        pendingDeleteId = id;
        deleteModalText.textContent = 'Êtes-vous sûr de vouloir supprimer l\'inscription de ' + (reg.prenom || '') + ' ' + (reg.nom || '') + ' ?';
        deleteModal.classList.add('is-open');
    }

    function closeDeleteModalFn() {
        deleteModal.classList.remove('is-open');
        pendingDeleteId = null;
    }

    closeDeleteModal.addEventListener('click', closeDeleteModalFn);
    cancelDeleteBtn.addEventListener('click', closeDeleteModalFn);

    confirmDeleteBtn.addEventListener('click', async function () {
        if (!pendingDeleteId) return;
        
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('registrations')
                    .delete()
                    .eq('id', pendingDeleteId);
                if (error) throw error;
            } catch (e) {
                console.error("Supabase delete registration error:", e);
            }
        }
        
        registrations = registrations.filter(function (r) { return r.id !== pendingDeleteId; });
        saveRegistrations();
        closeDeleteModalFn();
        renderDashboard();
        renderRegistrations();
        renderRecentRegistrations();

        // Auto regenerate matches to keep consistency
        generateMatches();
        await saveMatches();
        renderMatches();
    });

    deleteModal.addEventListener('click', function (e) {
        if (e.target === deleteModal) closeDeleteModalFn();
    });

    // ── Edit Modal logic ──
    const editModal = $('#editModal');
    const closeEditModal = $('#closeEditModal');
    const cancelEditBtn = $('#cancelEditBtn');
    const editForm = $('#editForm');
    const editLicencie = $('#editLicencie');
    const editLicenceNumberGroup = $('#editLicenceNumberGroup');

    if (editLicencie) {
        editLicencie.addEventListener('change', () => {
            if (editLicencie.value === 'Oui') {
                editLicenceNumberGroup.style.display = '';
            } else {
                editLicenceNumberGroup.style.display = 'none';
                $('#editNumeroLicence').value = '';
            }
        });
    }

    var editPhotoUploadBtn = $('#editPhotoUploadBtn');
    var editPhotoFile = $('#editPhotoFile');
    var editPhotoClearBtn = $('#editPhotoClearBtn');

    if (editPhotoUploadBtn && editPhotoFile) {
        editPhotoUploadBtn.addEventListener('click', function () {
            editPhotoFile.click();
        });
        editPhotoFile.addEventListener('change', async function () {
            var file = editPhotoFile.files[0];
            if (!file) return;
            editPhotoUploadBtn.disabled = true;
            editPhotoUploadBtn.textContent = 'Envoi…';
            try {
                if (typeof BT18Cloudinary === 'undefined' || !BT18Cloudinary.getCloudinaryConfig().isConfigured()) {
                    throw new Error('Cloudinary non configuré (Paramètres)');
                }
                var adminPw = sessionStorage.getItem('bt18_admin_pw') || '';
                var url = await BT18Cloudinary.uploadFile(file, { adminPassword: adminPw });
                updateEditPhotoPreview(url);
                showNotification('✅ Photo prête — enregistrez le candidat');
            } catch (err) {
                showNotification('❌ ' + (err.message || 'Échec upload photo'));
            } finally {
                editPhotoUploadBtn.disabled = false;
                editPhotoUploadBtn.textContent = 'Choisir une image';
                editPhotoFile.value = '';
            }
        });
    }
    if (editPhotoClearBtn) {
        editPhotoClearBtn.addEventListener('click', function () {
            updateEditPhotoPreview('');
        });
    }

    function updateEditPhotoPreview(url) {
        var box = $('#editPhotoPreview');
        var hiddenUrl = $('#editPhotoUrl');
        if (hiddenUrl) hiddenUrl.value = url || '';
        if (!box) return;
        if (url) {
            box.style.backgroundImage = 'url("' + String(url).replace(/"/g, '') + '")';
            box.classList.add('has-photo');
        } else {
            box.style.backgroundImage = '';
            box.classList.remove('has-photo');
        }
    }

    function openEditModal(id) {
        const reg = registrations.find(r => r.id === id);
        if (!reg) return;

        $('#editId').value = reg.id;
        $('#editNom').value = reg.nom || '';
        $('#editPrenom').value = reg.prenom || '';
        $('#editDateNaissance').value = reg.dateNaissance ? reg.dateNaissance.split('T')[0] : '';
        $('#editSexe').value = reg.sexe || 'Homme';
        $('#editNiveau').value = reg.niveau || 'Débutant';
        $('#editDiscipline').value = reg.discipline || 'Boxe Anglaise';
        $('#editCategoriePoids').value = reg.categoriePoids || '-60kg';
        $('#editLicencie').value = reg.licencie === true ? 'Oui' : reg.licencie === false ? 'Non' : (reg.licencie || 'Non');
        $('#editNumeroLicence').value = reg.numeroLicence || '';
        $('#editEmail').value = reg.email || '';
        $('#editTelephone').value = reg.telephone || '';
        $('#editClub').value = reg.club || '';
        updateEditPhotoPreview(reg.photoUrl || '');

        if ($('#editLicencie').value === 'Oui') {
            editLicenceNumberGroup.style.display = '';
        } else {
            editLicenceNumberGroup.style.display = 'none';
        }

        editModal.classList.add('is-open');
    }

    function closeEditModalFn() {
        editModal.classList.remove('is-open');
    }

    closeEditModal.addEventListener('click', closeEditModalFn);
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditModalFn);
    var editDeleteBtn = $('#editDeleteBtn');
    if (editDeleteBtn) {
        editDeleteBtn.addEventListener('click', function () {
            var id = $('#editId').value;
            closeEditModalFn();
            if (id) openDeleteModal(id);
        });
    }
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModalFn();
    });

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = $('#editId').value;
        const regIndex = registrations.findIndex(r => r.id === id);
        if (regIndex === -1) return;

        if (!$('#editNom').value.trim() || !$('#editPrenom').value.trim() || !$('#editDateNaissance').value || !$('#editClub').value.trim() || !$('#editEmail').value.trim() || !$('#editTelephone').value.trim()) {
            alert('Veuillez remplir tous les champs obligatoires.');
            return;
        }

        const photoUrl = ($('#editPhotoUrl') && $('#editPhotoUrl').value.trim()) || null;
        const updatedData = {
            nom: $('#editNom').value.trim(),
            prenom: $('#editPrenom').value.trim(),
            dateNaissance: $('#editDateNaissance').value,
            sexe: $('#editSexe').value,
            niveau: $('#editNiveau').value,
            discipline: $('#editDiscipline').value.trim() || 'Boxe Anglaise',
            categoriePoids: $('#editCategoriePoids').value,
            licencie: $('#editLicencie').value,
            numeroLicence: $('#editLicencie').value === 'Oui' ? $('#editNumeroLicence').value.trim() : '',
            email: $('#editEmail').value.trim(),
            telephone: $('#editTelephone').value.trim(),
            club: $('#editClub').value.trim(),
            photoUrl: photoUrl
        };

        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                const { error } = await supabaseClient
                    .from('registrations')
                    .update(updatedData)
                    .eq('id', id);
                if (error) throw error;
            } catch (e) {
                console.error("Supabase update registration error:", e);
                showNotification('❌ Erreur Supabase : ' + (e.message || 'mise à jour impossible'));
                return;
            }
        }

        registrations[regIndex] = {
            ...registrations[regIndex],
            ...updatedData
        };

        saveRegistrations();
        enrichMatchesFromRegistrations();
        closeEditModalFn();
        renderDashboard();
        renderRegistrations();
        renderRecentRegistrations();
        renderAfficheTab();
        await saveMatches();
        renderMatches();
        showNotification('✅ Candidat mis à jour');
    });

    // ── Manual Match Modal logic ──
    const manualMatchModal = $('#manualMatchModal');
    const closeManualMatchModal = $('#closeManualMatchModal');
    const manualMatchSearch = $('#manualMatchSearch');
    let manualMatchSourceIndex = null;
    let manualMatchSearchVal = '';

    function getMatchedFighterIds() {
        const ids = new Set();
        matches.forEach(m => {
            if (m.type === 'pair') {
                if (m.fighter1) ids.add(m.fighter1.id);
                if (m.fighter2) ids.add(m.fighter2.id);
            }
        });
        return ids;
    }

    function openManualMatchModal(matchIdx) {
        manualMatchSourceIndex = matchIdx;
        const sourceMatch = matches[matchIdx];
        const sourceFighter = sourceMatch.fighter1;

        $('#manualMatchFighterInfo').textContent = `${sourceFighter.prenom} ${sourceFighter.nom} (${sourceFighter.club || '—'}) — ${sourceMatch.sexe} / ${sourceMatch.categoriePoids} / ${sourceMatch.niveau}`;
        $('#manualMatchSearch').value = '';
        manualMatchSearchVal = '';

        renderManualMatchList();
        manualMatchModal.classList.add('is-open');
    }

    function renderManualMatchList() {
        const list = $('#manualMatchList');
        list.innerHTML = '';

        const sourceMatch = matches[manualMatchSourceIndex];
        const sourceFighter = sourceMatch.fighter1;
        const matchedIds = getMatchedFighterIds();

        let candidates = registrations.filter(r => {
            if (r.id === sourceFighter.id) return false;
            if (r.sexe !== sourceMatch.sexe) return false; // MUST be same sex
            if (matchedIds.has(r.id)) return false; // MUST not be already matched in a pair
            
            if (manualMatchSearchVal) {
                const name = (r.prenom + ' ' + r.nom).toLowerCase();
                const club = (r.club || '').toLowerCase();
                const q = manualMatchSearchVal.toLowerCase();
                return name.indexOf(q) !== -1 || club.indexOf(q) !== -1;
            }
            return true;
        });

        candidates.sort((a, b) => {
            const aSamePoids = a.categoriePoids === sourceMatch.categoriePoids ? 1 : 0;
            const bSamePoids = b.categoriePoids === sourceMatch.categoriePoids ? 1 : 0;
            const aSameNiveau = a.niveau === sourceMatch.niveau ? 1 : 0;
            const bSameNiveau = b.niveau === sourceMatch.niveau ? 1 : 0;

            const scoreA = aSamePoids * 2 + aSameNiveau;
            const scoreB = bSamePoids * 2 + bSameNiveau;

            return scoreB - scoreA;
        });

        if (candidates.length === 0) {
            list.innerHTML = '<p style="color:var(--text-dim);font-size:13px;padding:12px;text-align:center;">Aucun combattant disponible pour association.</p>';
            return;
        }

        candidates.forEach(c => {
            const isIdeal = c.categoriePoids === sourceMatch.categoriePoids && c.niveau === sourceMatch.niveau;
            const badgeClass = isIdeal ? 'badge-success' : 'badge-warning';
            const matchStatusText = isIdeal ? 'Idéal' : 'Différent';

            const item = document.createElement('div');
            item.className = 'swap-item';
            item.style.padding = '12px';
            item.innerHTML = 
                '<div>' +
                    '<span class="swap-item-name">' + escapeHtml(c.prenom) + ' ' + escapeHtml(c.nom) + '</span>' +
                    '<span class="swap-item-detail"> — ' + escapeHtml(c.categoriePoids) + ' / ' + escapeHtml(c.niveau) + '</span>' +
                '</div>' +
                '<div style="display:flex; align-items:center; gap:8px;">' +
                    '<span class="badge ' + badgeClass + '" style="font-size:10px;">' + matchStatusText + '</span>' +
                    '<span class="badge badge-info" style="font-size:11px;">' + escapeHtml(c.club || '—') + '</span>' +
                '</div>';

            item.addEventListener('click', () => {
                performManualMatch(c);
            });
            list.appendChild(item);
        });
    }

    async function performManualMatch(selectedFighter) {
        const sourceMatch = matches[manualMatchSourceIndex];

        // Upgrade match type to pair
        sourceMatch.type = 'pair';
        sourceMatch.fighter2 = fighterSnapshot(selectedFighter);

        // Remove the target fighter from any standalone matches they had
        matches = matches.filter(m => {
            if (m.type === 'waiting' && m.fighter1.id === selectedFighter.id) {
                return false;
            }
            return true;
        });

        await saveMatches();
        renderMatches();
        renderAfficheTab();
        closeManualMatchModalFn();
        renderDashboard();

        // Visual feedback animation
        setTimeout(() => {
            const pairs = matchesContainer.querySelectorAll('.match-pair');
            pairs.forEach(pair => {
                const names = pair.textContent;
                if (names.indexOf(selectedFighter.nom) !== -1 && names.indexOf(sourceMatch.fighter1.nom) !== -1) {
                    pair.classList.add('match-updated');
                    setTimeout(() => {
                        pair.classList.remove('match-updated');
                    }, 1200);
                }
            });
        }, 50);
    }

    function closeManualMatchModalFn() {
        manualMatchModal.classList.remove('is-open');
        manualMatchSourceIndex = null;
    }

    closeManualMatchModal.addEventListener('click', closeManualMatchModalFn);
    manualMatchModal.addEventListener('click', (e) => {
        if (e.target === manualMatchModal) closeManualMatchModalFn();
    });
    manualMatchSearch.addEventListener('input', () => {
        manualMatchSearchVal = manualMatchSearch.value;
        renderManualMatchList();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (deleteModal.classList.contains('is-open')) closeDeleteModalFn();
        if (swapModal.classList.contains('is-open')) closeSwapModalFn();
        if (editModal.classList.contains('is-open')) closeEditModalFn();
        if (manualMatchModal.classList.contains('is-open')) closeManualMatchModalFn();
        if ($('#fighterDetailModal') && $('#fighterDetailModal').classList.contains('is-open')) closeFighterDetailModal();
        if ($('#matchDetailModal') && $('#matchDetailModal').classList.contains('is-open')) closeMatchDetailModal();
    });

    // ── Email Automation logic ──


    function showNotification(msg) {
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.bottom = '24px';
        toast.style.right = '24px';
        toast.style.background = 'rgba(20, 20, 30, 0.95)';
        toast.style.border = '1px solid var(--gold)';
        toast.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
        toast.style.color = '#fff';
        toast.style.padding = '16px 24px';
        toast.style.borderRadius = '8px';
        toast.style.zIndex = '9999';
        toast.style.fontSize = '14px';
        toast.style.fontWeight = '500';
        toast.style.transition = 'all 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.textContent = msg;

        document.body.appendChild(toast);
        void toast.offsetWidth;
        
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 4000);
    }

    // ── Export PDF Printing logic ──
    function printPage(title, subtitle) {
        const existing = $('.print-header');
        if (existing) existing.remove();

        const header = document.createElement('div');
        header.className = 'print-header';
        header.innerHTML = `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)} — Imprimé le ${formatDateTime(new Date())}</p>`;
        document.body.insertBefore(header, document.body.firstChild);

        window.print();
    }

    // ── Sorting init logic ──
    function initSorting() {
        const headers = $$('th.sortable');
        headers.forEach(h => {
            if (h.dataset.sort === sortColumn) {
                h.classList.add(sortDirection);
            }
            h.addEventListener('click', () => {
                const col = h.dataset.sort;
                if (sortColumn === col) {
                    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    sortColumn = col;
                    sortDirection = 'asc';
                }
                
                headers.forEach(el => {
                    el.classList.remove('asc', 'desc');
                    if (el.dataset.sort === sortColumn) {
                        el.classList.add(sortDirection);
                    }
                });
                
                regCurrentPage = 1;
                renderRegistrations();
            });
        });
    }

    // ── CRUD and Export Handlers init ──
    function initCRUDHandlers() {
        // Refresh button click handler
        const refreshBtn = $('#refreshBtn');
        const refreshBtnIcon = $('#refreshBtnIcon');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                if (refreshBtnIcon) refreshBtnIcon.classList.add('spinning');
                try {
                    await loadData();
                    await loadMatches();
                    renderDashboard();
                    renderRegistrations();
                    renderRecentRegistrations();
                    renderAfficheTab();
                    showNotification("🔄 Données actualisées avec succès !");
                } catch (err) {
                    console.error("Refresh error:", err);
                    showNotification("❌ Échec de l'actualisation.");
                } finally {
                    refreshBtn.disabled = false;
                    if (refreshBtnIcon) refreshBtnIcon.classList.remove('spinning');
                }
            });
        }

        $('#exportPdfBtn').addEventListener('click', () => {
            printPage("Boxing Trophy 18 — Liste des inscriptions", `${registrations.length} inscriptions enregistrées`);
        });

        $('#exportMatchesCsvBtn').addEventListener('click', () => {
            if (matches.length === 0) {
                alert('Aucun combat à exporter.');
                return;
            }
            var headers = ['Groupe', 'Sexe', 'Catégorie de poids', 'Niveau', 'Type', 'Combattant 1', 'Club 1', 'Combattant 2', 'Club 2'];
            var rows = matches.map(function (m) {
                const f1Name = m.fighter1 ? `${m.fighter1.prenom} ${m.fighter1.nom}` : '';
                const f1Club = m.fighter1 ? m.fighter1.club : '';
                const f2Name = m.fighter2 ? `${m.fighter2.prenom} ${m.fighter2.nom}` : 'En attente';
                const f2Club = m.fighter2 ? m.fighter2.club : '';
                return [
                    csvCell(`${m.sexe} - ${m.categoriePoids} - ${m.niveau}`),
                    csvCell(m.sexe),
                    csvCell(m.categoriePoids),
                    csvCell(m.niveau),
                    csvCell(m.type === 'pair' ? 'Combat' : 'Attente'),
                    csvCell(f1Name),
                    csvCell(f1Club),
                    csvCell(f2Name),
                    csvCell(f2Club)
                ].join(';');
            });

            var csv = '\uFEFF' + headers.join(';') + '\n' + rows.join('\n');
            var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'boxingtrophy18_combats_' + dateStamp() + '.csv';
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    // ═══════════════════════════════════════════════════════
    //  CSV EXPORT
    // ═══════════════════════════════════════════════════════
    exportCsvBtn.addEventListener('click', function () {
        if (registrations.length === 0) {
            alert('Aucune inscription à exporter.');
            return;
        }
        var headers = ['Nom', 'Prénom', 'Date de naissance', 'Sexe', 'E-mail', 'Téléphone', 'Niveau', 'Discipline', 'Licencié', 'N° Licence', 'Engagement Licence', 'Club', 'Catégorie de poids', 'Date inscription', 'Consentement RGPD'];
        var rows = registrations.map(function (r) {
            return [
                csvCell(r.nom),
                csvCell(r.prenom),
                csvCell(formatDate(r.dateNaissance)),
                csvCell(r.sexe),
                csvCell(r.email),
                csvCell(r.telephone),
                csvCell(r.niveau),
                csvCell(r.discipline),
                csvCell(r.licencie ? 'Oui' : 'Non'),
                csvCell(r.numeroLicence),
                csvCell(r.engagementLicence),
                csvCell(r.club),
                csvCell(r.categoriePoids),
                csvCell(formatDate(r.dateInscription)),
                csvCell(r.consentementRGPD ? 'Oui' : 'Non')
            ].join(';');
        });

        var csv = '\uFEFF' + headers.join(';') + '\n' + rows.join('\n');
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'boxingtrophy18_inscriptions_' + dateStamp() + '.csv';
        a.click();
        URL.revokeObjectURL(url);
    });

    // ═══════════════════════════════════════════════════════
    //  MATCHING ALGORITHM
    // ═══════════════════════════════════════════════════════
    generateMatchesBtn.addEventListener('click', async function () {
        generateMatchesBtn.disabled = true;
        const oldText = generateMatchesBtn.innerHTML;
        generateMatchesBtn.textContent = 'Génération...';

        await loadData();
        generateMatches();
        normalizeAllMatches();
        await saveMatches();
        renderMatches();
        renderAfficheTab();
        renderDashboard();
        showNotification('🥊 Combats générés — consultez l\'onglet Affiche');

        generateMatchesBtn.disabled = false;
        generateMatchesBtn.innerHTML = oldText;
    });

    function generateMatches() {
        matches = [];

        // Step 1: Group by sexe
        var bySexe = groupBy(registrations, 'sexe');

        Object.keys(bySexe).forEach(function (sexe) {
            // Step 2: Within each sex, group by categoriePoids
            var byPoids = groupBy(bySexe[sexe], 'categoriePoids');

            Object.keys(byPoids).forEach(function (poids) {
                // Step 3: Within each weight, group by niveau
                var byNiveau = groupBy(byPoids[poids], 'niveau');

                Object.keys(byNiveau).forEach(function (niveau) {
                    var fighters = byNiveau[niveau].slice();
                    // Shuffle for randomness
                    shuffleArray(fighters);

                    // Step 4: Form pairs
                    while (fighters.length >= 2) {
                        var f1 = fighters.shift();
                        var f2 = fighters.shift();
                        matches.push({
                            type: 'pair',
                            sexe: sexe,
                            categoriePoids: poids,
                            niveau: niveau,
                            fighter1: fighterSnapshot(f1),
                            fighter2: fighterSnapshot(f2)
                        });
                    }

                    // Step 5: Unpaired
                    if (fighters.length === 1) {
                        var f = fighters[0];
                        matches.push({
                            type: 'waiting',
                            sexe: sexe,
                            categoriePoids: poids,
                            niveau: niveau,
                            fighter1: fighterSnapshot(f),
                            fighter2: null
                        });
                    }
                });
            });
        });

        if (typeof GalaPoster !== 'undefined') {
            GalaPoster.renumberPairMatches(matches);
            GalaPoster.assignMatchMeta(matches);
        }

        // Update timestamp
        matchTimestamp.textContent = 'Dernier appariement : ' + formatDateTime(new Date());
    }

    // ═══════════════════════════════════════════════════════
    //  RENDER MATCHES
    // ═══════════════════════════════════════════════════════
    function renderMatches() {
        if (matches.length === 0) {
            noMatches.hidden = false;
            matchesContainer.hidden = true;
            return;
        }
        noMatches.hidden = true;
        matchesContainer.hidden = false;
        matchesContainer.innerHTML = '';

        // Group matches by sexe > poids > niveau for display
        var grouped = {};
        matches.forEach(function (m, idx) {
            var key = m.sexe + '||' + m.categoriePoids + '||' + m.niveau;
            if (!grouped[key]) {
                grouped[key] = { sexe: m.sexe, poids: m.categoriePoids, niveau: m.niveau, items: [] };
            }
            grouped[key].items.push({ match: m, index: idx });
        });

        Object.keys(grouped).forEach(function (key) {
            var g = grouped[key];
            var section = document.createElement('div');
            section.className = 'match-group';

            section.innerHTML =
                '<div class="match-group-header">' +
                    '<h3>' + escapeHtml(g.sexe) + ' — ' + escapeHtml(g.poids || 'N/A') + ' — ' + escapeHtml(g.niveau || 'N/A') + '</h3>' +
                    '<span class="tag tag-sexe">' + escapeHtml(g.sexe) + '</span>' +
                    '<span class="tag tag-poids">' + escapeHtml(g.poids || '—') + '</span>' +
                    '<span class="tag tag-niveau">' + escapeHtml(g.niveau || '—') + '</span>' +
                '</div>';

            var list = document.createElement('div');
            list.className = 'matches-list';

            g.items.sort(function (x, y) {
                if (typeof GalaPoster !== 'undefined' && GalaPoster.compareMatchOrder) {
                    return GalaPoster.compareMatchOrder(x.match, y.match);
                }
                return (x.match.match_number || 0) - (y.match.match_number || 0);
            });

            g.items.forEach(function (item) {
                var m = item.match;
                var idx = item.index;

                if (m.type === 'pair') {
                    var pairDiv = document.createElement('div');
                    pairDiv.className = 'match-pair match-pair-clickable';
                    pairDiv.dataset.matchIndex = String(idx);
                    var combatNum = m.match_number != null ? m.match_number : '';
                    pairDiv.innerHTML =
                        (combatNum
                            ? '<div class="match-combat-num">Combat ' + escapeHtml(String(combatNum)) + '</div>'
                            : '') +
                        '<div class="match-fighter fighter-red-corner">' +
                            '<div class="fighter-info">' +
                                '<div style="display:flex; align-items:center; gap:8px; margin-bottom: 2px;">' +
                                    '<span class="corner-badge red">Rouge</span>' +
                                    '<span class="fighter-name">' + escapeHtml(m.fighter1.prenom) + ' ' + escapeHtml(m.fighter1.nom) + '</span>' +
                                '</div>' +
                                '<span class="fighter-detail">' + escapeHtml(m.fighter1.club || '—') + '</span>' +
                            '</div>' +
                            '<button class="btn-icon swap" title="Échanger ce combattant" data-swap-match="' + idx + '" data-swap-side="1">' +
                                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>' +
                            '</button>' +
                        '</div>' +
                        '<div class="match-vs">VS</div>' +
                        '<div class="match-fighter fighter-blue-corner">' +
                            '<button class="btn-icon swap" title="Échanger ce combattant" data-swap-match="' + idx + '" data-swap-side="2">' +
                                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>' +
                            '</button>' +
                            '<div class="fighter-info" style="text-align:right;">' +
                                '<div style="display:flex; align-items:center; justify-content:flex-end; gap:8px; margin-bottom: 2px;">' +
                                    '<span class="fighter-name">' + escapeHtml(m.fighter2.prenom) + ' ' + escapeHtml(m.fighter2.nom) + '</span>' +
                                    '<span class="corner-badge blue">Bleu</span>' +
                                '</div>' +
                                '<span class="fighter-detail">' + escapeHtml(m.fighter2.club || '—') + '</span>' +
                            '</div>' +
                        '</div>';
                    pairDiv.addEventListener('click', function (e) {
                        if (e.target.closest('button')) return;
                        openMatchDetailModalByIndex(idx);
                    });
                    list.appendChild(pairDiv);
                } else {
                    // Waiting (unmatched)
                    var pairDiv = document.createElement('div');
                    pairDiv.className = 'match-pair match-pair-clickable';
                    pairDiv.dataset.matchIndex = String(idx);
                    pairDiv.innerHTML =
                        '<div class="match-fighter fighter-red-corner">' +
                            '<div class="fighter-info">' +
                                '<div style="display:flex; align-items:center; gap:8px; margin-bottom: 2px;">' +
                                    '<span class="corner-badge red">Rouge</span>' +
                                    '<span class="fighter-name">' + escapeHtml(m.fighter1.prenom) + ' ' + escapeHtml(m.fighter1.nom) + '</span>' +
                                '</div>' +
                                '<span class="fighter-detail">' + escapeHtml(m.fighter1.club || '—') + '</span>' +
                            '</div>' +
                            '<button class="btn-icon swap" title="Échanger ce combattant" data-swap-match="' + idx + '" data-swap-side="1">' +
                                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>' +
                            '</button>' +
                        '</div>' +
                        '<div class="match-vs">VS</div>' +
                        '<div class="match-fighter fighter-blue-corner empty-slot" data-manual-match="' + idx + '" style="cursor:pointer; display:flex; justify-content:center; align-items:center; min-height:48px;">' +
                            '<span>➕ Associer un adversaire</span>' +
                        '</div>';
                    pairDiv.addEventListener('click', function (e) {
                        if (e.target.closest('button')) return;
                        if (e.target.closest('[data-manual-match]')) {
                            openManualMatchModal(idx);
                            return;
                        }
                        openMatchDetailModalByIndex(idx);
                    });
                    list.appendChild(pairDiv);
                }
            });

            section.appendChild(list);
            matchesContainer.appendChild(section);
        });

        // Attach swap handlers
        matchesContainer.querySelectorAll('[data-swap-match]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var matchIdx = parseInt(btn.dataset.swapMatch, 10);
                var side = parseInt(btn.dataset.swapSide, 10);
                openSwapModal(matchIdx, side);
            });
        });

        // Attach manual match handlers
        matchesContainer.querySelectorAll('[data-manual-match]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var matchIdx = parseInt(btn.dataset.manualMatch, 10);
                openManualMatchModal(matchIdx);
            });
        });
    }

    // ═══════════════════════════════════════════════════════
    //  SWAP MODAL
    // ═══════════════════════════════════════════════════════
    function openSwapModal(matchIdx, side) {
        var match = matches[matchIdx];
        if (!match) return;

        var sourceFighter = side === 1 ? match.fighter1 : match.fighter2;
        swapSourceMatchIndex = matchIdx;
        swapSourceFighterId = sourceFighter.id;

        swapFighterInfo.textContent = sourceFighter.prenom + ' ' + sourceFighter.nom + ' (' + (sourceFighter.club || '—') + ')';
        swapSearch.value = '';

        renderSwapList('');
        swapModal.classList.add('is-open');
        swapSearch.focus();
    }

    function renderSwapList(query) {
        swapList.innerHTML = '';
        var q = query.toLowerCase().trim();

        var sourceMatch = matches[swapSourceMatchIndex];
        if (!sourceMatch) return;
        var sourceSexe = sourceMatch.sexe;

        // Collect all fighters from all matches of the SAME sex except the source fighter
        var candidates = [];
        matches.forEach(function (m, idx) {
            if (m.sexe !== sourceSexe) return; // Strict gender segregation

            if (m.fighter1 && m.fighter1.id !== swapSourceFighterId) {
                candidates.push({ matchIdx: idx, side: 1, fighter: m.fighter1, sexe: m.sexe, poids: m.categoriePoids, niveau: m.niveau });
            }
            if (m.fighter2 && m.fighter2.id !== swapSourceFighterId) {
                candidates.push({ matchIdx: idx, side: 2, fighter: m.fighter2, sexe: m.sexe, poids: m.categoriePoids, niveau: m.niveau });
            }
        });

        // Filter by search
        if (q) {
            candidates = candidates.filter(function (c) {
                var name = (c.fighter.prenom + ' ' + c.fighter.nom).toLowerCase();
                return name.indexOf(q) !== -1;
            });
        }

        if (candidates.length === 0) {
            swapList.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:12px;">Aucun combattant trouvé.</p>';
            return;
        }

        candidates.forEach(function (c) {
            var item = document.createElement('div');
            item.className = 'swap-item';
            item.innerHTML =
                '<div>' +
                    '<span class="swap-item-name">' + escapeHtml(c.fighter.prenom) + ' ' + escapeHtml(c.fighter.nom) + '</span>' +
                    '<span class="swap-item-detail"> — ' + escapeHtml(c.poids || '—') + ' / ' + escapeHtml(c.niveau || '—') + '</span>' +
                '</div>' +
                '<span class="badge badge-info" style="font-size:11px;">' + escapeHtml(c.fighter.club || '—') + '</span>';
            item.addEventListener('click', function () {
                performSwap(c.matchIdx, c.side);
            });
            swapList.appendChild(item);
        });
    }

    async function performSwap(targetMatchIdx, targetSide) {
        var sourceMatch = matches[swapSourceMatchIndex];
        if (!sourceMatch) return;
        var sourceSide = sourceMatch.fighter1.id === swapSourceFighterId ? 1 : 2;

        var targetMatch = matches[targetMatchIdx];
        if (!targetMatch || targetMatch.sexe !== sourceMatch.sexe) {
            alert("Erreur : Les combattants doivent être du même sexe.");
            return;
        }

        // Get references
        var sourceRef = sourceSide === 1 ? 'fighter1' : 'fighter2';
        var targetRef = targetSide === 1 ? 'fighter1' : 'fighter2';

        // Swap
        var temp = sourceMatch[sourceRef];
        sourceMatch[sourceRef] = targetMatch[targetRef];
        targetMatch[targetRef] = temp;

        await saveMatches();
        renderMatches();
        renderAfficheTab();
        closeSwapModalFn();
    }

    function closeSwapModalFn() {
        swapModal.classList.remove('is-open');
        swapSourceFighterId = null;
        swapSourceMatchIndex = null;
    }

    closeSwapModal.addEventListener('click', closeSwapModalFn);
    swapModal.addEventListener('click', function (e) {
        if (e.target === swapModal) closeSwapModalFn();
    });
    swapSearch.addEventListener('input', function () {
        renderSwapList(swapSearch.value);
    });

    // ═══════════════════════════════════════════════════════
    //  AFFICHE GALA PRO & RÉSULTATS (UX simplifiée)
    // ═══════════════════════════════════════════════════════
    function fighterSnapshot(reg) {
        return {
            id: reg.id,
            nom: reg.nom,
            prenom: reg.prenom,
            club: reg.club,
            photoUrl: reg.photoUrl || ''
        };
    }

    function enrichMatchesFromRegistrations() {
        matches.forEach(function (m) {
            ['fighter1', 'fighter2'].forEach(function (slot) {
                var f = m[slot];
                if (!f || !f.id) return;
                var reg = registrations.find(function (r) { return r.id === f.id; });
                if (!reg) return;
                m[slot] = Object.assign({}, reg, f, {
                    nom: f.nom || reg.nom,
                    prenom: f.prenom || reg.prenom,
                    club: f.club || reg.club,
                    photoUrl: f.photoUrl || reg.photoUrl || ''
                });
            });
        });
    }

    function normalizeAllMatches() {
        if (typeof GalaPoster !== 'undefined') {
            GalaPoster.normalizeMatches(matches);
        } else {
            matches.forEach(function (m) {
                if (m.fighter1 && m.fighter2) m.type = 'pair';
            });
        }
    }

    function getPairMatches() {
        normalizeAllMatches();
        if (typeof GalaPoster !== 'undefined') {
            return matches.filter(GalaPoster.isPairMatch);
        }
        return matches.filter(function (m) { return m.fighter1 && m.fighter2; });
    }

    function getMatchKey(m, index) {
        if (typeof GalaPoster !== 'undefined') return GalaPoster.getMatchKey(m, index);
        return m.id != null ? String(m.id) : 'idx_' + index;
    }

    function findMatchByKey(key) {
        if (String(key).indexOf('wait_') === 0) {
            var idPart = key.replace('wait_', '');
            var idx = matches.findIndex(function (m, i) {
                return m.type === 'waiting' && (String(m.id) === idPart || 'wait_' + i === key);
            });
            if (idx >= 0) return { match: matches[idx], index: idx, isWaiting: true };
        }
        var idx = matches.findIndex(function (m, i) { return getMatchKey(m, i) === key; });
        return idx >= 0 ? { match: matches[idx], index: idx, isWaiting: false } : null;
    }

    function updateAfficheStatusBar() {
        var bar = $('#afficheStatusBar');
        var progress = $('#resultsProgress');
        var hint = $('#afficheModeHint');
        var pairs = getPairMatches();
        var waiting = matches.filter(function (m) { return m.type === 'waiting'; }).length;
        var done = pairs.filter(function (m) { return m.winner === 'fighter1' || m.winner === 'fighter2'; }).length;
        var hasWinners = done > 0;

        if (bar) bar.hidden = pairs.length === 0;
        if (progress) {
            progress.textContent = pairs.length + ' combat(s) · ' + done + ' vainqueur(s) renseigné(s)' +
                (waiting ? ' · ' + waiting + ' en attente' : '');
        }
        if (hint) {
            var pub = matchesPublished ? ' · visible sur le site' : ' · brouillon (non publié)';
            hint.textContent = hasWinners
                ? '✓ Affiche en mode résultats (automatique)' + pub
                : 'Carte avant combat — déclarez des vainqueurs pour afficher les résultats' + pub;
            hint.className = 'affiche-mode-hint' + (hasWinners ? ' is-results' : '');
        }
        updatePublishStatusUI();
    }

    function renderAfficheTab() {
        enrichMatchesFromRegistrations();
        var noPoster = $('#noPosterMatches');
        var afficheContent = $('#afficheContent');
        var posterPreview = $('#posterPreview');

        if (!noPoster || !afficheContent) return;

        var pairs = getPairMatches();
        if (pairs.length === 0 && matches.filter(function (m) { return m.type === 'waiting'; }).length === 0) {
            noPoster.hidden = false;
            afficheContent.hidden = true;
            if ($('#afficheStatusBar')) $('#afficheStatusBar').hidden = true;
            return;
        }

        noPoster.hidden = true;
        afficheContent.hidden = false;
        updateAfficheStatusBar();
        updatePosterPreview();

        if (!affichePosterClickBound && posterPreview) {
            affichePosterClickBound = true;
            posterPreview.addEventListener('click', function (e) {
                var fighterEl = e.target.closest('.gala-fighter--interactive');
                if (fighterEl) {
                    openFighterDetailModal(fighterEl.dataset.matchKey, parseInt(fighterEl.dataset.side, 10));
                    return;
                }
                if (e.target.closest('.gala-bout-meta--interactive')) {
                    var bout = e.target.closest('.gala-bout[data-match-key]');
                    if (bout && bout.dataset.matchKey) {
                        openMatchDetailModal(bout.dataset.matchKey);
                    }
                }
            });
        }
    }

    function fighterDisplayName(f) {
        if (!f) return '—';
        return ((f.prenom || '') + ' ' + (f.nom || '')).trim() || '—';
    }

    function getWinnerLabel(m) {
        if (!m || !m.winner) return '';
        if (m.winner === 'fighter1' && m.fighter1) {
            return '🏆 ' + fighterDisplayName(m.fighter1) + ' (coin rouge)';
        }
        if (m.winner === 'fighter2' && m.fighter2) {
            return '🏆 ' + fighterDisplayName(m.fighter2) + ' (coin bleu)';
        }
        return '';
    }

    function openMatchDetailModalByIndex(idx) {
        var m = matches[idx];
        if (!m) return;
        openMatchDetailModal(getMatchKey(m, idx));
    }

    function openMatchDetailModal(matchKey) {
        var ctx = findMatchByKey(matchKey);
        if (!ctx) return;
        var m = ctx.match;
        matchDetailContext.matchKey = matchKey;

        var title = $('#matchDetailTitle');
        var summary = $('#matchDetailSummary');
        var fighters = $('#matchDetailFighters');
        var winnerEl = $('#matchDetailWinner');
        var openRed = $('#matchOpenRedBtn');
        var openBlue = $('#matchOpenBlueBtn');

        var num = m.match_number != null ? 'Combat ' + m.match_number : 'Combat';
        if (title) title.textContent = num;

        if (summary) {
            summary.innerHTML =
                '<dl class="match-detail-dl">' +
                detailRow('Catégorie', [m.sexe, m.categoriePoids, m.niveau].filter(Boolean).join(' · ')) +
                detailRow('Type', ctx.isWaiting || m.type === 'waiting' ? 'En attente d\'adversaire' : 'Combat confirmé') +
                (m.tier ? detailRow('Carte', String(m.tier).replace(/_/g, ' ')) : '') +
                '</dl>';
        }

        if (fighters) {
            var f1 = m.fighter1;
            var f2 = m.fighter2;
            fighters.innerHTML =
                '<div class="match-detail-corner match-detail-corner--red">' +
                '<span class="match-detail-corner-label">Coin rouge</span>' +
                '<strong>' + escapeHtml(fighterDisplayName(f1)) + '</strong>' +
                '<span>' + escapeHtml((f1 && f1.club) || '—') + '</span>' +
                '</div>' +
                '<div class="match-detail-corner match-detail-corner--blue">' +
                '<span class="match-detail-corner-label">Coin bleu</span>' +
                (f2
                    ? '<strong>' + escapeHtml(fighterDisplayName(f2)) + '</strong><span>' + escapeHtml(f2.club || '—') + '</span>'
                    : '<em class="match-detail-pending">Adversaire non associé</em>') +
                '</div>';
        }

        var winnerText = getWinnerLabel(m);
        if (winnerEl) {
            if (winnerText) {
                winnerEl.hidden = false;
                winnerEl.textContent = winnerText;
            } else {
                winnerEl.hidden = true;
                winnerEl.textContent = '';
            }
        }

        if (openRed) openRed.hidden = !m.fighter1;
        if (openBlue) openBlue.hidden = !(m.fighter2 && !ctx.isWaiting && m.type !== 'waiting');

        $('#matchDetailModal').classList.add('is-open');
    }

    function closeMatchDetailModal() {
        var modal = $('#matchDetailModal');
        if (modal) modal.classList.remove('is-open');
        matchDetailContext.matchKey = null;
    }

    function initMatchDetailModal() {
        var modal = $('#matchDetailModal');
        if (!modal || modal.dataset.bound === '1') return;
        modal.dataset.bound = '1';

        var closeBtn = $('#closeMatchDetailModal');
        var closeBtn2 = $('#closeMatchDetailBtn');
        var openRedBtn = $('#matchOpenRedBtn');
        var openBlueBtn = $('#matchOpenBlueBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeMatchDetailModal);
        if (closeBtn2) closeBtn2.addEventListener('click', closeMatchDetailModal);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeMatchDetailModal();
        });
        if (openRedBtn) {
            openRedBtn.addEventListener('click', function () {
                var key = matchDetailContext.matchKey;
                closeMatchDetailModal();
                if (key) openFighterDetailModal(key, 1);
            });
        }
        if (openBlueBtn) {
            openBlueBtn.addEventListener('click', function () {
                var key = matchDetailContext.matchKey;
                closeMatchDetailModal();
                if (key) openFighterDetailModal(key, 2);
            });
        }
    }

    function updatePosterPreview() {
        var posterPreview = $('#posterPreview');
        if (!posterPreview || typeof GalaPoster === 'undefined') return;
        var hasWinners = GalaPoster.hasWinners(matches);
        GalaPoster.renderPoster(posterPreview, matches, {
            interactive: true,
            showResults: hasWinners,
            includeWaiting: true
        });
        document.body.classList.toggle('printing-poster', false);
    }

    function getFighterFromContext(ctx, side) {
        if (!ctx || !ctx.match) return null;
        if (ctx.isWaiting) return ctx.match.fighter1;
        return side === 1 ? ctx.match.fighter1 : ctx.match.fighter2;
    }

    function openFighterDetailModal(matchKey, side) {
        var ctx = findMatchByKey(matchKey);
        if (!ctx) return;
        var f = getFighterFromContext(ctx, side);
        if (!f) return;

        fighterModalContext = { matchKey: matchKey, side: side };
        var reg = registrations.find(function (r) { return r.id === f.id; }) || f;

        $('#fighterDetailTitle').textContent = (reg.prenom || '') + ' ' + (reg.nom || '');
        $('#fighterPhotoUrl').value = f.photoUrl || reg.photoUrl || '';
        updateFighterPhotoPreview($('#fighterPhotoUrl').value);

        var info = $('#fighterDetailInfo');
        info.innerHTML =
            '<dl class="fighter-detail-dl">' +
            detailRow('Club', reg.club) +
            detailRow('Sexe', reg.sexe) +
            detailRow('Niveau', reg.niveau) +
            detailRow('Poids', reg.categoriePoids) +
            detailRow('Licence', reg.licencie === 'Oui' ? 'Oui' : 'Non') +
            detailRow('E-mail', reg.email) +
            detailRow('Téléphone', reg.telephone) +
            '</dl>';

        var winnerBlock = $('#fighterWinnerActions');
        var showWinner = typeof GalaPoster !== 'undefined'
            ? GalaPoster.isPairMatch(ctx.match)
            : !!(ctx.match.fighter1 && ctx.match.fighter2);
        if (winnerBlock) {
            if (showWinner) {
                winnerBlock.classList.remove('is-hidden');
                winnerBlock.removeAttribute('hidden');
            } else {
                winnerBlock.classList.add('is-hidden');
            }
        }

        $('#fighterDetailModal').classList.add('is-open');
    }

    function detailRow(label, value) {
        return '<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value || '—') + '</dd></div>';
    }

    function updateFighterPhotoPreview(url) {
        var box = $('#fighterDetailPhotoPreview');
        if (!box) return;
        if (url) {
            box.style.backgroundImage = 'url("' + url.replace(/"/g, '') + '")';
            box.classList.add('has-photo');
        } else {
            box.style.backgroundImage = '';
            box.classList.remove('has-photo');
        }
        syncFighterPhotoRemoveBtn(url);
    }

    function syncFighterPhotoRemoveBtn(url) {
        var removeBtn = $('#fighterPhotoRemoveBtn');
        if (!removeBtn) return;
        var hasPhoto = !!(url && String(url).trim());
        removeBtn.hidden = !hasPhoto;
    }

    function clearFighterPhotoInModal() {
        var photoUrlInput = $('#fighterPhotoUrl');
        var photoFile = $('#fighterPhotoFile');
        if (photoUrlInput) photoUrlInput.value = '';
        if (photoFile) photoFile.value = '';
        updateFighterPhotoPreview('');
    }

    function applyFighterPhotoToData(fighterId, photoUrl) {
        matches.forEach(function (m) {
            ['fighter1', 'fighter2'].forEach(function (slot) {
                if (m[slot] && m[slot].id === fighterId) m[slot].photoUrl = photoUrl;
            });
        });
        var reg = registrations.find(function (r) { return r.id === fighterId; });
        if (reg) reg.photoUrl = photoUrl;
    }

    async function persistFighterPhoto(fighterId, photoUrl) {
        applyFighterPhotoToData(fighterId, photoUrl);
        saveRegistrations();
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                await supabaseClient
                    .from('registrations')
                    .update({ photoUrl: photoUrl ? photoUrl : null })
                    .eq('id', fighterId);
            } catch (e) {
                console.error('Supabase photoUrl update:', e);
            }
        }
    }

    function closeFighterDetailModal() {
        $('#fighterDetailModal').classList.remove('is-open');
        fighterModalContext = { matchKey: null, side: null };
    }

    function setMatchWinner(matchKey, winner) {
        var ctx = findMatchByKey(matchKey);
        if (!ctx || ctx.match.type !== 'pair') return;
        ctx.match.winner = winner || null;
        updatePosterPreview();
        updateAfficheStatusBar();
        showNotification(winner ? '🏆 Vainqueur enregistré sur l\'affiche' : 'Résultat effacé');
    }

    function initAfficheTab() {
        var saveDraftBtn = $('#saveDraftBtn');
        var publishSiteBtn = $('#publishSiteBtn');
        var unpublishSiteBtn = $('#unpublishSiteBtn');
        var printPosterBtn = $('#printPosterBtn');
        var photoUrlInput = $('#fighterPhotoUrl');
        var photoUploadBtn = $('#fighterPhotoUploadBtn');
        var photoRemoveBtn = $('#fighterPhotoRemoveBtn');
        var photoFile = $('#fighterPhotoFile');

        if (saveDraftBtn) {
            saveDraftBtn.addEventListener('click', async function () {
                saveDraftBtn.disabled = true;
                try {
                    await saveMatchesDraft();
                    showNotification(
                        matchesPublished
                            ? '✅ Enregistré — republiez pour mettre le site à jour'
                            : '✅ Brouillon enregistré (non visible sur le site)'
                    );
                    updatePosterPreview();
                    updateAfficheStatusBar();
                } catch (e) {
                    showNotification('❌ Erreur lors de l\'enregistrement.');
                } finally {
                    saveDraftBtn.disabled = false;
                }
            });
        }

        if (publishSiteBtn) {
            publishSiteBtn.addEventListener('click', async function () {
                var pairs = getPairMatches();
                if (!pairs.length) {
                    showNotification('❌ Aucun combat à publier — générez les appariements d\'abord.');
                    return;
                }
                publishSiteBtn.disabled = true;
                var oldLabel = publishSiteBtn.innerHTML;
                publishSiteBtn.textContent = 'Publication…';
                try {
                    await publishMatchesToSite();
                    var done = pairs.filter(function (m) { return m.winner; }).length;
                    showNotification(
                        '✅ Publié ! Carte visible sur la page d\'accueil et la carte des combats' +
                        (done ? ' (' + done + ' vainqueur(s)).' : '.')
                    );
                    updatePosterPreview();
                    updateAfficheStatusBar();
                } catch (e) {
                    showNotification('❌ Erreur lors de la publication.');
                } finally {
                    publishSiteBtn.disabled = false;
                    publishSiteBtn.innerHTML = oldLabel;
                }
            });
        }

        if (unpublishSiteBtn) {
            unpublishSiteBtn.addEventListener('click', async function () {
                if (
                    !confirm(
                        'Retirer la carte des combats du site public ?\nLes visiteurs ne verront plus les combats jusqu\'à une nouvelle publication.'
                    )
                ) {
                    return;
                }
                unpublishSiteBtn.disabled = true;
                try {
                    await setMatchesPublished(false);
                    showNotification('✅ Publication annulée — carte retirée du site public');
                    updateAfficheStatusBar();
                } catch (e) {
                    showNotification('❌ Erreur lors de l\'annulation.');
                } finally {
                    unpublishSiteBtn.disabled = false;
                }
            });
        }

        if (printPosterBtn) {
            printPosterBtn.addEventListener('click', function () {
                var wrap = $('#posterPreview');
                var hasWinners = typeof GalaPoster !== 'undefined' && GalaPoster.hasWinners(matches);
                var screenOpts = {
                    interactive: true,
                    showResults: hasWinners,
                    includeWaiting: true
                };
                document.documentElement.classList.add('printing-poster');
                document.body.classList.add('printing-poster');
                function doPrint() {
                    window.print();
                    setTimeout(function () {
                        document.documentElement.classList.remove('printing-poster');
                        document.body.classList.remove('printing-poster');
                        if (wrap) {
                            if (typeof GalaPoster.restoreScreenPoster === 'function') {
                                GalaPoster.restoreScreenPoster(wrap, matches, screenOpts);
                            } else {
                                updatePosterPreview();
                            }
                        }
                    }, 800);
                }
                if (typeof GalaPoster !== 'undefined' && wrap) {
                    GalaPoster.preparePrintFit(wrap, matches, screenOpts, doPrint);
                } else {
                    doPrint();
                }
            });
        }

        $('#closeFighterDetailModal').addEventListener('click', closeFighterDetailModal);
        $('#cancelFighterDetailBtn').addEventListener('click', closeFighterDetailModal);
        $('#fighterDetailModal').addEventListener('click', function (e) {
            if (e.target === $('#fighterDetailModal')) closeFighterDetailModal();
        });

        if (photoRemoveBtn) {
            photoRemoveBtn.addEventListener('click', function () {
                clearFighterPhotoInModal();
                showNotification('Photo retirée — cliquez « Enregistrer ce boxeur » pour confirmer.');
            });
        }

        if (photoUploadBtn && photoFile) {
            photoUploadBtn.addEventListener('click', function () {
                photoFile.click();
            });
            photoFile.addEventListener('change', async function () {
                var file = photoFile.files[0];
                if (!file) return;
                photoUploadBtn.disabled = true;
                photoUploadBtn.textContent = 'Envoi…';
                try {
                    var url;
                    if (typeof BT18Cloudinary !== 'undefined' && BT18Cloudinary.getCloudinaryConfig().isConfigured()) {
                        var adminPw = sessionStorage.getItem('bt18_admin_pw') || '';
                        url = await BT18Cloudinary.uploadFile(file, { adminPassword: adminPw });
                    } else {
                        throw new Error(
                            'Cloudinary non configuré : Paramètres → Photos (cloud dhbh6wcak + preset).'
                        );
                    }
                    photoUrlInput.value = url;
                    updateFighterPhotoPreview(url);
                    showNotification('✅ Photo envoyée sur Cloudinary');
                } catch (err) {
                    showNotification('❌ ' + (err.message || 'Impossible d\'envoyer la photo.'));
                } finally {
                    photoUploadBtn.disabled = false;
                    photoUploadBtn.textContent = 'Choisir une image';
                    photoFile.value = '';
                }
            });
        }

        $('#saveFighterDetailBtn').addEventListener('click', async function () {
            var ctx = findMatchByKey(fighterModalContext.matchKey);
            if (!ctx) return;
            var f = getFighterFromContext(ctx, fighterModalContext.side);
            if (!f || !f.id) return;
            var url = $('#fighterPhotoUrl').value.trim();
            await persistFighterPhoto(f.id, url);
            closeFighterDetailModal();
            renderAfficheTab();
            showNotification('✅ Fiche boxeur enregistrée');
        });

        $('#setWinnerRedBtn').addEventListener('click', function () {
            setMatchWinner(fighterModalContext.matchKey, 'fighter1');
            closeFighterDetailModal();
        });
        $('#setWinnerBlueBtn').addEventListener('click', function () {
            setMatchWinner(fighterModalContext.matchKey, 'fighter2');
            closeFighterDetailModal();
        });
        $('#clearWinnerBtn').addEventListener('click', function () {
            setMatchWinner(fighterModalContext.matchKey, null);
            closeFighterDetailModal();
        });
    }

    // ═══════════════════════════════════════════════════════
    //  UTILITIES
    // ═══════════════════════════════════════════════════════
    function groupBy(arr, key) {
        var result = {};
        arr.forEach(function (item) {
            var k = item[key] || 'Non défini';
            if (!result[k]) result[k] = [];
            result[k].push(item);
        });
        return result;
    }

    function shuffleArray(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function formatDate(val) {
        if (!val) return '—';
        try {
            var d = new Date(val);
            if (isNaN(d.getTime())) return val;
            return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch (e) {
            return val;
        }
    }

    function formatDateTime(d) {
        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
               ' à ' +
               d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    function csvCell(val) {
        if (val === null || val === undefined) return '';
        var s = String(val);
        if (s.indexOf(';') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }

    function dateStamp() {
        var d = new Date();
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    // ═══════════════════════════════════════════════════════
    //  SETTINGS TAB & SUPABASE CONNECTIVITY
    // ═══════════════════════════════════════════════════════
    async function initSettingsTab() {
        updateSiteUrlDisplays();
        const urlInput = $('#supabaseUrlInput');
        const keyInput = $('#supabaseKeyInput');
        const configForm = $('#supabaseConfigForm');
        const clearBtn = $('#clearSupabaseConfigBtn');
        const statusBanner = $('#supabaseStatusBanner');
        const copySqlBtn = $('#copySqlBtn');
        const sqlSnippet = $('#sqlCodeSnippet');

        // Populate fields with current config
        const conf = getSupabaseConfig();
        if (conf.url !== 'YOUR_SUPABASE_URL') urlInput.value = conf.url;
        if (conf.key !== 'YOUR_SUPABASE_ANON_KEY') keyInput.value = conf.key;

        // Verify connection status
        async function checkConnection() {
            const currentConf = getSupabaseConfig();
            if (!currentConf.isValid) {
                statusBanner.className = 'supabase-status-banner warning';
                statusBanner.innerHTML = `
                    <span class="status-indicator-dot active" style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--gold); box-shadow: 0 0 8px var(--gold);"></span>
                    <span>Supabase n'est pas configuré. Utilisation du stockage local (Fallback LocalStorage).</span>
                `;
                return;
            }

            statusBanner.className = 'supabase-status-banner warning';
            statusBanner.innerHTML = `
                <span class="status-indicator-dot active" style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--gold); box-shadow: 0 0 8px var(--gold);"></span>
                <span id="supabaseStatusText">Vérification de la connexion à Supabase...</span>
            `;

            if (typeof supabaseClient === 'undefined' || !supabaseClient) {
                statusBanner.className = 'supabase-status-banner error';
                statusBanner.innerHTML = `
                    <span class="status-indicator-dot active" style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--danger); box-shadow: 0 0 8px var(--danger);"></span>
                    <span>Erreur : Le client Supabase n'est pas chargé.</span>
                `;
                return;
            }

            try {
                const { data, error } = await supabaseClient.from('registrations').select('id').limit(1);
                if (error) throw error;

                statusBanner.className = 'supabase-status-banner success';
                statusBanner.innerHTML = `
                    <span class="status-indicator-dot active" style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--green); box-shadow: 0 0 8px var(--green);"></span>
                    <span>Connecté à la base de données Supabase avec succès !</span>
                `;
            } catch (err) {
                console.error("Supabase test query failed:", err);
                statusBanner.className = 'supabase-status-banner error';
                statusBanner.innerHTML = `
                    <span class="status-indicator-dot active" style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--danger); box-shadow: 0 0 8px var(--danger);"></span>
                    <span>Erreur de connexion. Vérifiez vos identifiants ou si les tables existent (${err.message || err.details || JSON.stringify(err)}).</span>
                `;
            }
        }

        // Run check on initialization
        await checkConnection();

        // Handle Save Form
        configForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const url = urlInput.value.trim();
            const key = keyInput.value.trim();

            if (reinitSupabaseClient(url, key)) {
                showNotification("⚙️ Configuration enregistrée !");
                await checkConnection();
                // Reload data to match Supabase
                await loadData();
                renderDashboard();
                renderRegistrations();
                await loadMatches();
                renderRecentRegistrations();
            } else {
                showNotification("❌ Échec de la configuration.");
            }
        });

        // Handle Clear config
        clearBtn.addEventListener('click', async () => {
            localStorage.removeItem('supabase_url');
            localStorage.removeItem('supabase_anon_key');
            urlInput.value = '';
            keyInput.value = '';
            
            if (typeof window.supabase !== 'undefined') {
                supabaseClient = null;
            }

            showNotification("⚙️ Configuration réinitialisée. Retour au stockage LocalStorage.");
            await checkConnection();
            
            await loadData();
            renderDashboard();
            renderRegistrations();
            await loadMatches();
            renderRecentRegistrations();
        });

        // Cloudinary settings
        var cloudinaryForm = $('#cloudinaryConfigForm');
        if (cloudinaryForm && typeof BT18Cloudinary !== 'undefined') {
            var cConf = BT18Cloudinary.getCloudinaryConfig();
            $('#cloudinaryCloudInput').value = cConf.cloudName || '';
            $('#cloudinaryPresetInput').value = cConf.uploadPreset || '';
            cloudinaryForm.addEventListener('submit', function (e) {
                e.preventDefault();
                BT18Cloudinary.saveCloudinaryConfig(
                    $('#cloudinaryCloudInput').value,
                    $('#cloudinaryPresetInput').value
                );
                showNotification('📷 Cloudinary configuré');
            });
        }

        // Bot WhatsApp URL (KataBump)
        var waBotForm = $('#waBotConfigForm');
        var waBotSettingsInput = $('#settingsWaBotUrlInput');
        if (waBotForm && waBotSettingsInput) {
            waBotSettingsInput.value =
                localStorage.getItem(WA_BOT_URL_KEY) || envGetWa('WHATSAPP_BOT_URL') || '';
            waBotForm.addEventListener('submit', function (e) {
                e.preventDefault();
                saveWhatsAppBotUrl(waBotSettingsInput.value);
                updateWaBotUrlDisplay();
                showNotification('🤖 URL bot enregistrée');
            });
        }

        // Handle Copy SQL
        copySqlBtn.addEventListener('click', () => {
            sqlSnippet.select();
            document.execCommand('copy');
            copySqlBtn.textContent = 'Copié !';
            setTimeout(() => {
                copySqlBtn.textContent = 'Copier le SQL';
            }, 2000);
            showNotification("📋 Code SQL copié dans le presse-papiers.");
        });
    }

    // ═══════════════════════════════════════════════════════
    //  WHATSAPP BOT TAB
    // ═══════════════════════════════════════════════════════
    const WA_BOT_URL_KEY = 'bt18_bot_url';
    let waPollTimer = null;
    let waUserDismissedQr = false;
    let waUserDismissedPairCode = false;

    function envGetWa(key) {
        if (typeof window !== 'undefined' && window.__ENV__ && window.__ENV__[key]) {
            return String(window.__ENV__[key]).trim();
        }
        return '';
    }

    function getSiteUrl() {
        const fromEnv = envGetWa('SITE_URL').replace(/\/$/, '');
        if (fromEnv) return fromEnv;
        if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
            return window.location.origin.replace(/\/$/, '');
        }
        return 'https://boxing-trophy-18.vercel.app';
    }

    function updateSiteUrlDisplays() {
        const url = getSiteUrl();
        const settingsEl = $('#settingsSiteUrlDisplay');
        if (settingsEl) settingsEl.textContent = url;
        const waEl = $('#waSiteUrl');
        if (waEl && (!waEl.textContent || waEl.textContent === '—')) {
            waEl.textContent = url;
        }
    }

    function getWhatsAppBotBase() {
        const fromLs = (localStorage.getItem(WA_BOT_URL_KEY) || '').trim().replace(/\/$/, '');
        const fromEnv = envGetWa('WHATSAPP_BOT_URL').replace(/\/$/, '');
        return fromLs || fromEnv || '';
    }

    function saveWhatsAppBotUrl(url) {
        const u = (url || '').trim().replace(/\/$/, '');
        if (u) localStorage.setItem(WA_BOT_URL_KEY, u);
        else localStorage.removeItem(WA_BOT_URL_KEY);
        const settingsIn = $('#settingsWaBotUrlInput');
        if (settingsIn) settingsIn.value = u;
    }

    function updateWaBotUrlDisplay() {
        const el = $('#waBotUrlDisplay');
        if (!el) return;
        const url = getWhatsAppBotBase();
        if (url) {
            el.textContent = 'Serveur : ' + url;
            el.classList.remove('wa-muted');
        } else {
            el.textContent = 'URL non configurée → Paramètres → Bot WhatsApp';
            el.classList.add('wa-muted');
        }
    }

    function hideWaQrPanel() {
        waUserDismissedQr = true;
        const qrWrap = $('#waQrWrap');
        if (qrWrap) qrWrap.hidden = true;
    }

    function hideWaPairCodePanel() {
        waUserDismissedPairCode = true;
        const pairCode = $('#waPairCodeDisplay');
        if (pairCode) pairCode.hidden = true;
    }

    function mustUseVercelProxy() {
        return typeof location !== 'undefined' && location.protocol === 'https:';
    }

    function normalizeWaPhoneInput(raw) {
        var d = String(raw || '').replace(/\D/g, '');
        if (d.indexOf('0') === 0 && d.length === 10) d = '33' + d.slice(1);
        if (d.length === 9 && /^[67]/.test(d)) d = '33' + d;
        return d;
    }

    async function whatsAppApi(action, options) {
        options = options || {};
        const directBase = getWhatsAppBotBase();
        const method = options.method || 'GET';
        const body = options.body;
        var privileged = action === 'authorize' || action === 'deauthorize';
        var useDirect = directBase && !mustUseVercelProxy() && !privileged;

        if (useDirect) {
            var url = directBase + '/api/' + (action === 'status' ? 'status' : action);
            var fetchOpts = { method: method, headers: {} };
            if (body && method === 'POST') {
                fetchOpts.headers['Content-Type'] = 'application/json';
                fetchOpts.body = JSON.stringify(body);
            }
            try {
                var res = await fetch(url, fetchOpts);
                var data = await res.json().catch(function () { return {}; });
                if (!res.ok) {
                    var err = new Error(data.error || data.message || res.statusText);
                    err.data = data;
                    throw err;
                }
                return data;
            } catch (fetchErr) {
                var msg = fetchErr.message || String(fetchErr);
                if (msg === 'Failed to fetch' || msg.indexOf('NetworkError') !== -1) {
                    throw new Error(
                        'Impossible de joindre le bot en direct. Depuis le site HTTPS, utilisez le proxy (redéployez Vercel avec WHATSAPP_BOT_URL).'
                    );
                }
                throw fetchErr;
            }
        }

        var proxyUrl = '/api/admin/whatsapp?action=' + encodeURIComponent(action);
        var proxyOpts = { method: method, headers: {} };
        if (body && method === 'POST') {
            proxyOpts.headers['Content-Type'] = 'application/json';
            proxyOpts.body = JSON.stringify(body);
        }
        var pres = await fetch(proxyUrl, proxyOpts);
        var pdata = await pres.json().catch(function () { return {}; });
        if (!pres.ok) {
            var perr = new Error(pdata.error || pdata.message || pres.statusText);
            perr.data = pdata;
            if (pdata.hint) perr.message += ' — ' + pdata.hint;
            if (pres.status === 502 && pdata.botUrl) {
                perr.message = 'Bot injoignable (' + pdata.botUrl + '). Vérifiez que KataBump tourne (npm start) sur le port 20305.';
            }
            throw perr;
        }
        return pdata;
    }

    function renderWhatsAppStatus(data) {
        const dot = $('#waStatusDot');
        const label = $('#waStatusLabel');
        const hint = $('#waStatusHint');
        const qrWrap = $('#waQrWrap');
        const qrImg = $('#waQrImage');
        const pairCode = $('#waPairCodeDisplay');
        const pairCodeInner = $('#waPairCodeInner');
        const errEl = $('#waErrorText');
        const phonesList = $('#waPhonesList');
        const siteUrl = $('#waSiteUrl');

        if (errEl) errEl.hidden = true;

        if (data.connected) {
            waUserDismissedQr = false;
            waUserDismissedPairCode = false;
            dot.className = 'wa-status-dot wa-status-dot--on';
            label.textContent = 'Connecté';
            hint.textContent = 'Le bot peut envoyer des messages (.manquant, etc.)';
            if (qrWrap) qrWrap.hidden = true;
            if (pairCode) pairCode.hidden = true;
        } else if (data.connecting) {
            dot.className = 'wa-status-dot wa-status-dot--wait';
            label.textContent = 'Connexion en cours…';
            hint.textContent = 'Scannez le QR ou saisissez le code sur le téléphone';
        } else {
            dot.className = 'wa-status-dot wa-status-dot--off';
            label.textContent = 'Non connecté';
            hint.textContent = data.qrError || 'Cliquez sur « Générer le QR »';
        }

        if (data.qr && qrWrap && qrImg && !waUserDismissedQr) {
            qrWrap.hidden = false;
            qrImg.src = data.qr;
        } else if (qrWrap) {
            qrWrap.hidden = true;
        }

        if (data.pairingCode && pairCode && !waUserDismissedPairCode) {
            pairCode.hidden = false;
            if (pairCodeInner) {
                pairCodeInner.textContent = data.pairingCode;
            }
        } else if (pairCode) {
            pairCode.hidden = true;
        }

        if (data.qrError && errEl) {
            errEl.hidden = false;
            errEl.textContent = data.qrError;
        }

        if (phonesList && data.authorizedPhones) {
            const phones = Array.isArray(data.authorizedPhones)
                ? data.authorizedPhones
                : [data.mandatoryPhone].filter(Boolean);
            const mandatoryNorm = data.mandatoryPhone
                ? normalizeWaPhoneInput(data.mandatoryPhone)
                : '';
            phonesList.innerHTML = phones.length
                ? phones.map(function (p) {
                    const norm = normalizeWaPhoneInput(p);
                    const isPermanent = mandatoryNorm && norm === mandatoryNorm;
                    const tag = isPermanent ? ' <span class="wa-muted">(permanent)</span>' : '';
                    const removeBtn = isPermanent
                        ? ''
                        : '<button type="button" class="wa-phone-remove-btn" data-phone="' + norm + '" title="Retirer">×</button>';
                    return '<li class="wa-phone-row"><span>' + p + tag + '</span>' + removeBtn + '</li>';
                }).join('')
                : '<li class="wa-muted">—</li>';
        }

        if (siteUrl) siteUrl.textContent = data.siteUrl || getSiteUrl();
    }

    async function waSetAuthorizedPhone(phone, add) {
        const action = add ? 'authorize' : 'deauthorize';
        try {
            const data = await whatsAppApi(action, {
                method: 'POST',
                body: { phone: phone },
            });
            renderWhatsAppStatus(data);
            showNotification(add ? '✅ Numéro autorisé' : '✅ Numéro retiré');
            return data;
        } catch (e) {
            if (mustUseVercelProxy() && (e.message || '').indexOf('invalide') !== -1) {
                throw new Error(
                    (e.message || 'Échec') + ' — Redéployez le site sur Vercel pour activer authorize/deauthorize.',
                );
            }
            throw e;
        }
    }

    async function refreshWhatsAppStatus() {
        try {
            const data = await whatsAppApi('status');
            renderWhatsAppStatus(data);
        } catch (e) {
            var msg = e.message || 'Bot injoignable';
            if (msg === 'Failed to fetch' || msg.indexOf('fetch') !== -1) {
                msg = 'Impossible de joindre le bot (réseau ou serveur arrêté).';
            }
            if (mustUseVercelProxy()) {
                msg += ' Vérifiez : 1) KataBump en ligne (npm install + node index.js, port 20305). 2) Vercel → WHATSAPP_BOT_URL=http://51.75.118.169:20305 + redéploiement.';
            } else {
                msg += ' Testez http://51.75.118.169:20305/api/status dans le navigateur.';
            }
            var errEl = $('#waErrorText');
            if (errEl) {
                errEl.hidden = false;
                errEl.textContent = msg;
            }
            renderWhatsAppStatus({
                connected: false,
                connecting: false,
                qrError: msg,
            });
        }
    }

    function startWhatsAppPolling() {
        stopWhatsAppPolling();
        refreshWhatsAppStatus();
        waPollTimer = setInterval(refreshWhatsAppStatus, 3500);
    }

    function stopWhatsAppPolling() {
        if (waPollTimer) {
            clearInterval(waPollTimer);
            waPollTimer = null;
        }
    }

    function initWhatsAppTab() {
        updateSiteUrlDisplays();
        updateWaBotUrlDisplay();

        var closeQr = $('#waCloseQrBtn');
        if (closeQr) closeQr.addEventListener('click', hideWaQrPanel);

        var closePairCode = $('#waClosePairCodeBtn');
        if (closePairCode) closePairCode.addEventListener('click', hideWaPairCodePanel);

        var closePairBlock = $('#waClosePairingBlockBtn');
        var pairBlock = $('#waPairingBlock');
        if (closePairBlock && pairBlock) {
            closePairBlock.addEventListener('click', function () {
                pairBlock.hidden = true;
            });
        }

        var refreshBtn = $('#waRefreshBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', refreshWhatsAppStatus);

        var startQr = $('#waStartQrBtn');
        if (startQr) {
            startQr.addEventListener('click', async function () {
                if (!getWhatsAppBotBase() && mustUseVercelProxy()) {
                    showNotification('❌ Configurez WHATSAPP_BOT_URL sur Vercel ou dans Paramètres');
                    return;
                }
                waUserDismissedQr = false;
                try {
                    showNotification('⏳ Génération du QR…');
                    await whatsAppApi('start', { method: 'POST', body: { method: 'qr' } });
                    await refreshWhatsAppStatus();
                    startWhatsAppPolling();
                } catch (e) {
                    showNotification('❌ ' + (e.message || 'Échec'));
                    refreshWhatsAppStatus();
                }
            });
        }

        var startPair = $('#waStartPairBtn');
        if (startPair && pairBlock) {
            startPair.addEventListener('click', function () {
                pairBlock.hidden = !pairBlock.hidden;
            });
        }

        var pairSubmit = $('#waPairSubmitBtn');
        if (pairSubmit) {
            pairSubmit.addEventListener('click', async function () {
                var phoneIn = $('#waPairPhoneInput');
                var phone = phoneIn ? phoneIn.value.replace(/\D/g, '') : '';
                if (!phone) {
                    showNotification('❌ Indiquez un numéro');
                    return;
                }
                waUserDismissedPairCode = false;
                try {
                    await whatsAppApi('start', { method: 'POST', body: { method: 'pairing_code', phone: phone } });
                    await refreshWhatsAppStatus();
                    startWhatsAppPolling();
                } catch (e) {
                    showNotification('❌ ' + (e.message || 'Échec'));
                }
            });
        }

        var logoutBtnWa = $('#waLogoutBtn');
        if (logoutBtnWa) {
            logoutBtnWa.addEventListener('click', async function () {
                if (!confirm('Déconnecter WhatsApp sur le serveur bot ?')) return;
                try {
                    await whatsAppApi('logout', { method: 'POST' });
                    showNotification('✅ Session WhatsApp réinitialisée');
                    refreshWhatsAppStatus();
                } catch (e) {
                    showNotification('❌ ' + (e.message || 'Échec'));
                }
            });
        }

        var authPhoneIn = $('#waAuthPhoneInput');
        var authAddBtn = $('#waAuthAddBtn');
        var authRemoveBtn = $('#waAuthRemoveBtn');
        var phonesListEl = $('#waPhonesList');

        async function submitWaAuth(add) {
            var raw = authPhoneIn ? authPhoneIn.value : '';
            var phone = normalizeWaPhoneInput(raw);
            if (!phone || phone.length < 9 || phone.length > 13) {
                showNotification('❌ Numéro invalide (9–13 chiffres, ex. 33744977766)');
                return;
            }
            try {
                await waSetAuthorizedPhone(phone, add);
                if (authPhoneIn) authPhoneIn.value = '';
            } catch (e) {
                showNotification('❌ ' + (e.message || 'Échec'));
            }
        }

        if (authAddBtn) {
            authAddBtn.addEventListener('click', function () { submitWaAuth(true); });
        }
        if (authRemoveBtn) {
            authRemoveBtn.addEventListener('click', function () { submitWaAuth(false); });
        }
        if (authPhoneIn) {
            authPhoneIn.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    submitWaAuth(true);
                }
            });
        }
        if (phonesListEl) {
            phonesListEl.addEventListener('click', async function (ev) {
                var btn = ev.target.closest('.wa-phone-remove-btn');
                if (!btn || !btn.dataset.phone) return;
                if (!confirm('Retirer ' + btn.dataset.phone + ' ?')) return;
                try {
                    await waSetAuthorizedPhone(btn.dataset.phone, false);
                } catch (e) {
                    showNotification('❌ ' + (e.message || 'Échec'));
                }
            });
        }
    }

    // ═══════════════════════════════════════════════════════
    //  INIT
    // ═══════════════════════════════════════════════════════
    checkAuth();

})();
