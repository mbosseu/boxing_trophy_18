(function () {
  'use strict';

  function adminPw() {
    return sessionStorage.getItem('boxingtrophy19_admin_auth') ? document.getElementById('loginPassword') : null;
  }

  function password() {
    if (typeof getAdminPasswordFromEnv === 'function') {
      var envPw = getAdminPasswordFromEnv();
      if (envPw) return envPw;
    }
    try {
      return sessionStorage.getItem('bt19_admin_pw') || '';
    } catch (e) {
      return '';
    }
  }

  async function api(path, body) {
    var res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': password()
      },
      body: JSON.stringify(body || {})
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || 'Erreur API');
    return data;
  }

  function initPasswordCapture() {
    var form = document.getElementById('loginForm');
    var input = document.getElementById('loginPassword');
    if (!form || !input) return;
    form.addEventListener('submit', function () {
      try { sessionStorage.setItem('bt19_admin_pw', input.value); } catch (e) {}
    });
  }

  async function loadLists() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    var f = await supabaseClient.from('trophyrec_fighters').select('id,prenom,nom,alias,slug,email');
    var c = await supabaseClient.from('trophyrec_coaches').select('*').order('name');
    var b = await supabaseClient.from('trophyrec_bouts').select('*');
    window.__trFighters = f.data || [];
    window.__trCoaches = c.data || [];
    window.__trBouts = b.data || [];
    fillFighterSelects();
    renderCoaches();
    renderBouts();
  }

  function nameOf(id) {
    var f = (window.__trFighters || []).find(function (x) { return x.id === id; });
    return f ? ((f.prenom || '') + ' ' + (f.nom || '')).trim() : id;
  }

  function fillFighterSelects() {
    var opts = '<option value="">—</option>' + (window.__trFighters || []).map(function (f) {
      return '<option value="' + f.id + '">' + ((f.prenom || '') + ' ' + (f.nom || '')).replace(/</g, '') + '</option>';
    }).join('');
    ['trFighterA', 'trFighterB'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = opts;
    });
  }

  function renderCoaches() {
    var ul = document.getElementById('trCoachList');
    if (!ul) return;
    ul.innerHTML = (window.__trCoaches || []).map(function (c) {
      return '<li>' + String(c.name).replace(/</g, '') + ' · ' + (c.gym_id || '') + '</li>';
    }).join('') || '<li>Aucun coach. Ajoutez-en un.</li>';
  }

  function renderBouts() {
    var tb = document.getElementById('trBoutsBody');
    if (!tb) return;
    tb.innerHTML = (window.__trBouts || []).map(function (b) {
      return '<tr><td>' + nameOf(b.fighter_a) + '</td><td>' + nameOf(b.fighter_b) + '</td><td>' +
        (b.result || '') + '</td><td>' + (b.method || '') + '</td><td>' + (b.categorie_poids || '') + '</td></tr>';
    }).join('');
  }

  function init() {
    initPasswordCapture();
    var tab = document.getElementById('tab-trophyrec');
    if (!tab) return;

    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.getAttribute('data-tab') === 'trophyrec') loadLists();
      });
    });

    var syncBtn = document.getElementById('trSyncBtn');
    if (syncBtn) {
      syncBtn.addEventListener('click', async function () {
        var st = document.getElementById('trAdminStatus');
        try {
          var r = await api('/api/trophyrec/sync-fighters', {});
          st.textContent = 'Fiches creees : ' + r.created + ' (deja la : ' + r.skipped + ').';
          await loadLists();
        } catch (e) {
          st.textContent = e.message;
        }
      });
    }

    var boutForm = document.getElementById('trBoutForm');
    if (boutForm) {
      boutForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var st = document.getElementById('trAdminStatus');
        try {
          await api('/api/trophyrec/result', {
            fighter_a: document.getElementById('trFighterA').value,
            fighter_b: document.getElementById('trFighterB').value,
            result: document.getElementById('trResult').value,
            method: document.getElementById('trMethod').value,
            discipline: document.getElementById('trDiscipline').value,
            sexe: document.getElementById('trSexe').value,
            categorie_poids: document.getElementById('trPoids').value,
            source_match_id: document.getElementById('trMatchId').value.trim() || null,
            sync_affiche: true
          });
          st.textContent = 'Resultat enregistre. Classement public mis a jour.';
          boutForm.reset();
          await loadLists();
        } catch (err) {
          st.textContent = err.message;
        }
      });
    }

    var coachForm = document.getElementById('trCoachForm');
    if (coachForm) {
      coachForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var st = document.getElementById('trAdminStatus');
        try {
          await api('/api/trophyrec/coach', {
            name: document.getElementById('trCoachName').value.trim(),
            gym_id: document.getElementById('trCoachGym').value
          });
          st.textContent = 'Coach ajoute.';
          coachForm.reset();
          await loadLists();
        } catch (err) {
          st.textContent = err.message;
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
