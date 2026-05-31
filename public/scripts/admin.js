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
    let pendingDeleteId = null;
    let swapSourceFighterId = null;
    let swapSourceMatchIndex = null;

    function closeAllModals() {
        if (deleteModal) deleteModal.classList.remove('is-open');
        if (swapModal) swapModal.classList.remove('is-open');
        pendingDeleteId = null;
        swapSourceFighterId = null;
        swapSourceMatchIndex = null;
    }

    // ═══════════════════════════════════════════════════════
    //  AUTH & SYNCHRONISATION AUTO (toutes les 2 s)
    // ═══════════════════════════════════════════════════════
    var syncIntervalId = null;
    var SYNC_MS = 2000;

    function isModalOpen() {
        var open = document.querySelector('.modal-overlay.is-open');
        return !!open;
    }

    function startAutoSync() {
        if (syncIntervalId) return;
        syncIntervalId = setInterval(runAutoSync, SYNC_MS);
    }

    function stopAutoSync() {
        if (syncIntervalId) {
            clearInterval(syncIntervalId);
            syncIntervalId = null;
        }
    }

    function mergeQuietUpdate(data) {
        var newRegs = data.registrations || [];
        var newMatches = data.matches || [];
        var regsJson = JSON.stringify(newRegs);
        var matchesJson = JSON.stringify(newMatches);
        if (regsJson === JSON.stringify(registrations) && matchesJson === JSON.stringify(matches)) {
            return;
        }
        registrations = newRegs;
        matches = newMatches;
        enrichMatchesFromRegistrations();
        if (typeof GalaPoster !== 'undefined') GalaPoster.normalizeMatches(matches);
        renderDashboard();
        renderRegistrations();
        renderRecentRegistrations();
        renderMatches();
        renderAfficheTab();
        if (data.matchesTimestamp && matchTimestamp) {
            var d = new Date(data.matchesTimestamp);
            matchTimestamp.textContent = 'Dernier appariement : ' + formatDateTime(d);
        }
        var refreshBtn = $('#refreshBtn');
        if (refreshBtn) {
            refreshBtn.classList.add('sync-pulse');
            setTimeout(function () { refreshBtn.classList.remove('sync-pulse'); }, 600);
        }
    }

    async function runAutoSync() {
        if (sessionStorage.getItem(AUTH_KEY) !== 'true') return;
        if (isModalOpen()) return;
        try {
            var res = await fetch('/api/admin/sync', { credentials: 'include', cache: 'no-store' });
            if (res.status === 401 || !res.ok) return;
            var data = await res.json();
            mergeQuietUpdate(data);
        } catch (e) {
            /* réseau : on ne déconnecte pas */
        }
    }

    async function checkAuth() {
        if (loginScreen) loginScreen.hidden = true;
        if (adminPanel) adminPanel.hidden = false;
        try {
            var res = await fetch('/api/admin/session', { credentials: 'include' });
            var data = await res.json();
            if (data.ok) {
                sessionStorage.setItem(AUTH_KEY, 'true');
                await showAdmin();
                startAutoSync();
                return;
            }
        } catch (e) { /* fallback sessionStorage */ }
        if (sessionStorage.getItem(AUTH_KEY) === 'true') {
            await showAdmin();
            startAutoSync();
        } else {
            window.location.href = '/admin/login';
        }
    }

    function showLogin() {
        window.location.href = '/admin/login';
    }

    let isInitialized = false;
    async function showAdmin() {
        if (loginScreen) loginScreen.hidden = true;
        if (adminPanel) adminPanel.hidden = false;
        closeAllModals();
        await loadData();
        enrichMatchesFromRegistrations();
        renderDashboard();
        renderRegistrations();
        await loadMatches();
        renderRecentRegistrations();
        if (!isInitialized) {
            initSorting();
            initCRUDHandlers();
            initAfficheTab();
            await initSettingsTab();
            isInitialized = true;
        }
        renderAfficheTab();
    }

    if (loginForm) {
        loginForm.addEventListener('submit', function (e) {
            e.preventDefault();
            window.location.href = '/admin/login';
        });
    }

    logoutBtn.addEventListener('click', async function () {
        stopAutoSync();
        try {
            await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
        } catch (e) { /* ignore */ }
        sessionStorage.removeItem(AUTH_KEY);
        window.location.href = '/admin/login';
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

    async function loadMatches() {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('matches')
                    .select('*')
                    .order('sort_order', { ascending: true });
                if (error) throw error;
                matches = data || [];
                if (typeof GalaPoster !== 'undefined') GalaPoster.normalizeMatches(matches);

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
        if (typeof GalaPoster !== 'undefined') GalaPoster.normalizeMatches(matches);
        const ts = localStorage.getItem(MATCH_TS_KEY);
        if (ts) {
            const d = new Date(ts);
            matchTimestamp.textContent = 'Dernier appariement : ' + formatDateTime(d);
        }
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

    function getFilteredRegistrations() {
        var search = filterSearch.value.toLowerCase().trim();
        var sexe = filterSexe.value;
        var niveau = filterNiveau.value;
        var poids = filterPoids.value;
        var licence = $('#filterLicence') ? $('#filterLicence').value : '';

        const filtered = registrations.filter(function (r) {
            if (sexe && r.sexe !== sexe) return false;
            if (niveau && r.niveau !== niveau) return false;
            if (poids && r.categoriePoids !== poids) return false;
            if (licence && r.licencie !== licence) return false;
            if (search) {
                var haystack = ((r.nom || '') + ' ' + (r.prenom || '')).toLowerCase();
                if (haystack.indexOf(search) === -1) return false;
            }
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

    function renderRegistrations() {
        var filtered = getFilteredRegistrations();
        registrationsBody.innerHTML = '';

        if (filtered.length === 0) {
            registrationsTable.parentElement.style.display = 'none';
            noRegistrations.hidden = false;
        } else {
            registrationsTable.parentElement.style.display = '';
            noRegistrations.hidden = true;
        }

        filteredCount.textContent = filtered.length + ' inscription(s) affichée(s) sur ' + registrations.length;

        filtered.forEach(function (r) {
            var tr = document.createElement('tr');
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
                    '<button class="btn-icon" title="Modifier" data-edit-id="' + r.id + '" style="margin-right:4px;">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
                    '</button>' +
                    '<button class="btn-icon danger" title="Supprimer" data-delete-id="' + r.id + '" aria-label="Supprimer">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>' +
                    '</button>' +
                '</td>';
            registrationsBody.appendChild(tr);
        });

        // Attach edit handlers
        registrationsBody.querySelectorAll('[data-edit-id]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.dataset.editId;
                openEditModal(id);
            });
        });

        // Attach delete handlers
        registrationsBody.querySelectorAll('[data-delete-id]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.dataset.deleteId;
                openDeleteModal(id);
            });
        });
    }

    // Filters
    filterSearch.addEventListener('input', renderRegistrations);
    filterSexe.addEventListener('change', renderRegistrations);
    filterNiveau.addEventListener('change', renderRegistrations);
    filterPoids.addEventListener('change', renderRegistrations);
    if ($('#filterLicence')) {
        $('#filterLicence').addEventListener('change', renderRegistrations);
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

    editLicencie.addEventListener('change', () => {
        if (editLicencie.value === 'Oui') {
            editLicenceNumberGroup.style.display = '';
        } else {
            editLicenceNumberGroup.style.display = 'none';
            $('#editNumeroLicence').value = '';
        }
    });

    function openEditModal(id) {
        const reg = registrations.find(r => r.id === id);
        if (!reg) return;

        $('#editId').value = reg.id;
        $('#editNom').value = reg.nom || '';
        $('#editPrenom').value = reg.prenom || '';
        $('#editDateNaissance').value = reg.dateNaissance ? reg.dateNaissance.split('T')[0] : '';
        $('#editSexe').value = reg.sexe || 'Homme';
        $('#editNiveau').value = reg.niveau || 'Débutant';
        $('#editCategoriePoids').value = reg.categoriePoids || '-60kg';
        $('#editLicencie').value = reg.licencie || 'Non';
        $('#editNumeroLicence').value = reg.numeroLicence || '';
        $('#editEmail').value = reg.email || '';
        $('#editTelephone').value = reg.telephone || '';
        $('#editClub').value = reg.club || '';

        if (reg.licencie === 'Oui') {
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
    cancelEditBtn.addEventListener('click', closeEditModalFn);
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

        const updatedData = {
            nom: $('#editNom').value.trim(),
            prenom: $('#editPrenom').value.trim(),
            dateNaissance: $('#editDateNaissance').value,
            sexe: $('#editSexe').value,
            niveau: $('#editNiveau').value,
            categoriePoids: $('#editCategoriePoids').value,
            licencie: $('#editLicencie').value,
            numeroLicence: $('#editLicencie').value === 'Oui' ? $('#editNumeroLicence').value.trim() : '',
            email: $('#editEmail').value.trim(),
            telephone: $('#editTelephone').value.trim(),
            club: $('#editClub').value.trim()
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
            }
        }

        registrations[regIndex] = {
            ...registrations[regIndex],
            ...updatedData
        };

        saveRegistrations();
        closeEditModalFn();
        renderDashboard();
        renderRegistrations();
        renderRecentRegistrations();

        // Auto regenerate matches to keep consistency
        generateMatches();
        await saveMatches();
        renderMatches();
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

        $('#exportMatchesPdfBtn').addEventListener('click', () => {
            printPage("Boxing Trophy 18 — Tableau des combats", `${matches.filter(m => m.type === 'pair').length} combats confirmés`);
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

            g.items.forEach(function (item) {
                var m = item.match;
                var idx = item.index;

                if (m.type === 'pair') {
                    var pairDiv = document.createElement('div');
                    pairDiv.className = 'match-pair';
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
                    list.appendChild(pairDiv);
                } else {
                    // Waiting (unmatched)
                    var pairDiv = document.createElement('div');
                    pairDiv.className = 'match-pair';
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
            photoUrl: reg.photoUrl || reg.photo_url || ''
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
            hint.textContent = hasWinners
                ? '✓ Affiche en mode résultats (automatique)'
                : 'Carte avant combat — déclarez des vainqueurs pour afficher les résultats';
            hint.className = 'affiche-mode-hint' + (hasWinners ? ' is-results' : '');
        }
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
                var el = e.target.closest('.gala-fighter--interactive');
                if (!el) return;
                openFighterDetailModal(el.dataset.matchKey, parseInt(el.dataset.side, 10));
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
            includeWaiting: true,
            layout: 'galapro'
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
                await supabaseClient.from('registrations').update({ photoUrl: photoUrl }).eq('id', fighterId);
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
        var saveResultsBtn = $('#saveResultsBtn');
        var printPosterBtn = $('#printPosterBtn');
        var photoUrlInput = $('#fighterPhotoUrl');
        var photoUploadBtn = $('#fighterPhotoUploadBtn');
        var photoFile = $('#fighterPhotoFile');

        if (saveResultsBtn) {
            saveResultsBtn.addEventListener('click', async function () {
                saveResultsBtn.disabled = true;
                var oldLabel = saveResultsBtn.innerHTML;
                saveResultsBtn.textContent = 'Publication…';
                try {
                    enrichMatchesFromRegistrations();
                    await saveMatches();
                    var pairs = getPairMatches();
                    var done = pairs.filter(function (m) { return m.winner; }).length;
                    showNotification(
                        '✅ Publié ! Le site public est à jour' +
                        (done ? ' (affiche avec ' + done + ' vainqueur(s)).' : '.')
                    );
                    updatePosterPreview();
                    updateAfficheStatusBar();
                } catch (e) {
                    showNotification('❌ Erreur lors de la publication.');
                } finally {
                    saveResultsBtn.disabled = false;
                    saveResultsBtn.innerHTML = oldLabel;
                }
            });
        }

        if (printPosterBtn) {
            printPosterBtn.addEventListener('click', function () {
                var wrap = $('#posterPreview');
                var hasWinners = typeof GalaPoster !== 'undefined' && GalaPoster.hasWinners(matches);
                if (typeof GalaPoster !== 'undefined') {
                    GalaPoster.preparePrintFit(wrap, matches, {
                        showResults: hasWinners,
                        layout: 'galapro'
                    });
                }
                document.body.classList.add('printing-poster');
                window.print();
                setTimeout(function () {
                    document.body.classList.remove('printing-poster');
                    if (wrap) wrap.style.removeProperty('--print-scale');
                    updatePosterPreview();
                }, 500);
            });
        }

        $('#closeFighterDetailModal').addEventListener('click', closeFighterDetailModal);
        $('#cancelFighterDetailBtn').addEventListener('click', closeFighterDetailModal);
        $('#fighterDetailModal').addEventListener('click', function (e) {
            if (e.target === $('#fighterDetailModal')) closeFighterDetailModal();
        });

        if (photoUrlInput) {
            photoUrlInput.addEventListener('input', function () {
                updateFighterPhotoPreview(photoUrlInput.value.trim());
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
                        url = await BT18Cloudinary.uploadFile(file);
                    } else {
                        url = URL.createObjectURL(file);
                        showNotification('Ajoutez Cloudinary dans Paramètres pour sauvegarder la photo en ligne.');
                    }
                    photoUrlInput.value = url;
                    updateFighterPhotoPreview(url);
                } catch (err) {
                    showNotification('❌ Impossible d\'envoyer la photo.');
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
            var cloudIn = $('#cloudinaryCloudInput');
            var presetIn = $('#cloudinaryPresetInput');
            if (cloudIn && !cloudIn.value) cloudIn.value = cConf.cloudName || '';
            if (presetIn && !presetIn.value) presetIn.value = cConf.uploadPreset || '';
            cloudinaryForm.addEventListener('submit', function (e) {
                e.preventDefault();
                BT18Cloudinary.saveCloudinaryConfig(
                    $('#cloudinaryCloudInput').value,
                    $('#cloudinaryPresetInput').value
                );
                showNotification('📷 Cloudinary configuré');
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
    //  INIT
    // ═══════════════════════════════════════════════════════
    checkAuth();

})();
