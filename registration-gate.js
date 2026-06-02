/**
 * Ouverture / fermeture des inscriptions publiques.
 * Clé match_metadata : registrations_open (true | false)
 */
(function (global) {
  'use strict';

  var OPEN_KEY = 'registrations_open';
  var CLOSED_AT_KEY = 'registrations_closed_at';
  var LOCAL_OPEN_KEY = 'boxingtrophy18_registrations_open';

  var state = { open: false, closedAt: null, loaded: false };

  function parseMetaRows(rows) {
    var open = false;
    var closedAt = null;
    var hasOpenKey = false;
    (rows || []).forEach(function (row) {
      if (row.key === OPEN_KEY) {
        hasOpenKey = true;
        open = row.value === 'true';
      }
      if (row.key === CLOSED_AT_KEY) closedAt = row.value || null;
    });
    if (!hasOpenKey) open = false;
    return { open: open, closedAt: closedAt };
  }

  async function fetchRegistrationOpenState() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      var res = await supabaseClient
        .from('match_metadata')
        .select('key, value')
        .in('key', [OPEN_KEY, CLOSED_AT_KEY]);
      if (res.error) throw res.error;
      var parsed = parseMetaRows(res.data);
      state.open = parsed.open;
      state.closedAt = parsed.closedAt;
      state.loaded = true;
      return { open: state.open, closedAt: state.closedAt };
    }
    var local = localStorage.getItem(LOCAL_OPEN_KEY);
    state.open = local === 'true';
    state.closedAt = localStorage.getItem(LOCAL_OPEN_KEY + '_closed_at');
    state.loaded = true;
    return { open: state.open, closedAt: state.closedAt };
  }

  function isRegistrationOpen() {
    return state.open;
  }

  function applyClosedUI() {
    var section = document.getElementById('inscription');
    if (!section) return;

    var tag = section.querySelector('.section-tag');
    if (tag) tag.textContent = 'Inscriptions fermées';

    var desc = section.querySelector('.section-desc');
    if (desc) {
      desc.textContent =
        'Les inscriptions au Boxing Trophy 18 sont closes. Rendez-vous sur place le vendredi 5 juin 2026 à partir de 19h.';
    }

    var steps = section.querySelector('.form-steps');
    var form = document.getElementById('registrationForm');
    var closed = document.getElementById('registrationsClosed');
    var success = document.getElementById('formSuccess');

    if (steps) steps.hidden = true;
    if (form) form.hidden = true;
    if (success) success.classList.remove('visible');
    if (closed) closed.hidden = false;

    document.querySelectorAll('a[href="#inscription"].nav-cta').forEach(function (a) {
      a.hidden = true;
    });
    var heroCta = document.querySelector('.hero-cta-group .btn-primary[href="#inscription"]');
    if (heroCta) heroCta.hidden = true;
  }

  function applyOpenUI() {
    var section = document.getElementById('inscription');
    if (!section) return;

    var tag = section.querySelector('.section-tag');
    if (tag) tag.textContent = 'Inscriptions ouvertes';

    var desc = section.querySelector('.section-desc');
    if (desc) {
      desc.textContent =
        'Remplis le formulaire ci-dessous pour t\'inscrire au Boxing Trophy 18. Boxe Anglaise uniquement.';
    }

    var steps = section.querySelector('.form-steps');
    var form = document.getElementById('registrationForm');
    var closed = document.getElementById('registrationsClosed');

    if (steps) steps.hidden = false;
    if (form) form.hidden = false;
    if (closed) closed.hidden = true;

    document.querySelectorAll('a[href="#inscription"].nav-cta').forEach(function (a) {
      a.hidden = false;
    });
    var heroCta = document.querySelector('.hero-cta-group .btn-primary[href="#inscription"]');
    if (heroCta) heroCta.hidden = false;
  }

  async function applyRegistrationGateUI() {
    await fetchRegistrationOpenState();
    if (state.open) {
      applyOpenUI();
    } else {
      applyClosedUI();
    }
    return state.open;
  }

  global.BT18RegistrationGate = {
    OPEN_KEY: OPEN_KEY,
    CLOSED_AT_KEY: CLOSED_AT_KEY,
    fetchRegistrationOpenState: fetchRegistrationOpenState,
    isRegistrationOpen: isRegistrationOpen,
    applyRegistrationGateUI: applyRegistrationGateUI,
    applyClosedUI: applyClosedUI,
    applyOpenUI: applyOpenUI,
  };
})(typeof window !== 'undefined' ? window : global);
