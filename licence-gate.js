/**
 * Sas licence Trophy 20 : numero 6-7 chiffres ou paiement 50 EUR.
 * Debloque l'inscription combat dans sessionStorage (meme URL).
 */
(function (global) {
  'use strict';

  var GATE_KEY = 'bt20_gate';
  var LICENCE_RE = /^\d{6,7}$/;
  var BOUTIQUE_BASE =
    'https://boutique.boxingcenter.fr/inscription?product=licence-loisirs-trophy';

  function readGate() {
    try {
      var raw = sessionStorage.getItem(GATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function isUnlocked() {
    var g = readGate();
    if (!g || !g.kind) return false;
    if (g.kind === 'existing') return LICENCE_RE.test(String(g.numeroLicence || ''));
    return g.kind === 'paid_50';
  }

  function saveGate(data) {
    sessionStorage.setItem(GATE_KEY, JSON.stringify(data));
  }

  function consumePaidQuery() {
    var url = new URL(window.location.href);
    if (url.searchParams.get('paid') !== '1') return false;
    saveGate({
      kind: 'paid_50',
      order: url.searchParams.get('order') || '',
    });
    url.searchParams.delete('paid');
    url.searchParams.delete('order');
    var qs = url.searchParams.toString();
    var next = url.pathname + (qs ? '?' + qs : '');
    history.replaceState(null, '', next);
    return true;
  }

  function fillHidden(gate) {
    var licencie = document.getElementById('licencie');
    var numero = document.getElementById('numeroLicence');
    var lg = document.getElementById('licenceGate');
    if (!gate) return;
    if (lg) lg.value = gate.kind || '';
    if (gate.kind === 'existing') {
      if (licencie) licencie.value = 'Oui';
      if (numero) numero.value = gate.numeroLicence || '';
    } else if (gate.kind === 'paid_50') {
      if (licencie) licencie.value = 'Non';
      if (numero) numero.value = '';
    }
  }

  function showError(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('visible');
  }

  function hideError(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('visible');
  }

  function applyUI() {
    var unlocked = isUnlocked();
    var combatWrap = document.getElementById('combatFormWrap');
    var section = document.getElementById('inscription');
    var steps = document.querySelector('#inscription .form-steps');
    if (section) {
      if (unlocked) section.classList.remove('is-locked');
      else section.classList.add('is-locked');
    }
    if (combatWrap) combatWrap.hidden = !unlocked;
    if (steps) steps.hidden = !unlocked;
    fillHidden(readGate());
  }

  function goToInscription() {
    var target = document.getElementById('inscription');
    if (!target) return;
    var top = target.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  function goToLicence() {
    var target = document.getElementById('licence');
    if (!target) return;
    var top = target.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  function interceptInscriptionHash() {
    document.querySelectorAll('a[href="#inscription"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        if (isUnlocked()) return;
        e.preventDefault();
        goToLicence();
        if (history.pushState) history.pushState(null, '', '#licence');
      });
    });
  }

  function bindGate() {
    var yesPanel = document.getElementById('licenceGateYes');
    var noPanel = document.getElementById('licenceGateNo');
    var numberInput = document.getElementById('gateNumeroLicence');
    var continueBtn = document.getElementById('gateLicenceContinue');
    var payBtn = document.getElementById('licencePayBtn');

    document.querySelectorAll('input[name="gateLicencie"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        hideError('gateLicencie-error');
        if (radio.value === 'Oui') {
          if (yesPanel) yesPanel.classList.add('visible');
          if (noPanel) noPanel.classList.remove('visible');
        } else {
          if (noPanel) noPanel.classList.add('visible');
          if (yesPanel) yesPanel.classList.remove('visible');
        }
      });
    });

    if (numberInput) {
      numberInput.addEventListener('input', function () {
        numberInput.value = numberInput.value.replace(/\D/g, '').slice(0, 7);
        hideError('gateNumeroLicence-error');
      });
    }

    if (continueBtn) {
      continueBtn.addEventListener('click', function () {
        var val = numberInput ? numberInput.value.trim() : '';
        if (!LICENCE_RE.test(val)) {
          if (numberInput) numberInput.classList.add('error');
          showError('gateNumeroLicence-error');
          return;
        }
        if (numberInput) numberInput.classList.remove('error');
        hideError('gateNumeroLicence-error');
        saveGate({ kind: 'existing', numeroLicence: val });
        applyUI();
        goToInscription();
      });
    }

    if (payBtn) {
      payBtn.addEventListener('click', function () {
        var gym = Math.random() < 0.5 ? 'portet' : 'minimes';
        window.location.href =
          BOUTIQUE_BASE + '&gym=' + encodeURIComponent(gym);
      });
    }
  }

  function init() {
    var fromPay = consumePaidQuery();
    bindGate();
    interceptInscriptionHash();
    applyUI();
    if (fromPay && isUnlocked()) {
      goToInscription();
    } else if (window.location.hash === '#inscription' && !isUnlocked()) {
      goToLicence();
    }
  }

  global.BT20LicenceGate = {
    GATE_KEY: GATE_KEY,
    LICENCE_RE: LICENCE_RE,
    readGate: readGate,
    isUnlocked: isUnlocked,
    applyUI: applyUI,
    init: init,
  };
})(typeof window !== 'undefined' ? window : global);
