/**
 * Sas licence Trophy 20 : numero 6-7 chiffres ou paiement 50 EUR.
 * Debloque l'inscription combat dans sessionStorage (meme URL).
 */
(function (global) {
  'use strict';

  var GATE_KEY = 'bt20_gate';
  var LICENCE_RE = /^\d{6,7}$/;
  // Paiement licence : API du site Trophy, salle Portet → PayPal Noble Art Portésien.
  var CHECKOUT_API = '/api/licence/checkout';

  function isPaypalUrl(url) {
    try {
      var u = new URL(url);
      return u.protocol === 'https:' &&
        (u.hostname === 'paypal.com' || /\.paypal\.com$/.test(u.hostname));
    } catch (e) {
      return false;
    }
  }

  function adultAge(dateStr) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var now = new Date();
    var age = now.getFullYear() - y;
    if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age -= 1;
    return age;
  }

  function checkPayFields(v) {
    var fields = [], messages = [];
    if (!v.payPrenom) { fields.push('payPrenom'); messages.push('Prénom requis'); }
    if (!v.payNom) { fields.push('payNom'); messages.push('Nom requis'); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.payEmail)) {
      fields.push('payEmail'); messages.push('E-mail invalide');
    }
    var tel = v.payTel.replace(/[\s.\-()]/g, '').replace(/^(\+33|0033)/, '0');
    if (!/^0[67]\d{8}$/.test(tel)) {
      fields.push('payTel'); messages.push('Téléphone mobile (06 ou 07) requis');
    }
    var age = adultAge(v.payNaissance);
    if (age == null) { fields.push('payNaissance'); messages.push('Date de naissance requise'); }
    else if (age < 18) { fields.push('payNaissance'); messages.push('Licence loisirs réservée aux majeurs'); }
    return { fields: fields, messages: messages };
  }

  function setPayError(msg) {
    var el = document.getElementById('licencePay-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('visible', !!msg);
  }

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
    var gate = readGate();
    var engage = document.getElementById('engagementFFBGroup');
    var engageBox = document.getElementById('engagementFFB');
    var mustEngage = !!(gate && gate.kind === 'paid_50');
    if (engage) engage.hidden = !mustEngage;
    if (engageBox) engageBox.required = mustEngage;
    fillHidden(gate);
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
      var payFields = ['payPrenom', 'payNom', 'payEmail', 'payTel', 'payNaissance'];
      payFields.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', function () {
          el.classList.remove('error');
          setPayError('');
        });
      });
      payBtn.addEventListener('click', function () {
        if (payBtn.disabled) return;
        var v = {};
        payFields.forEach(function (id) {
          var el = document.getElementById(id);
          v[id] = el ? el.value.trim() : '';
        });
        var bad = checkPayFields(v);
        payFields.forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.classList.toggle('error', bad.fields.indexOf(id) !== -1);
        });
        if (bad.messages.length) {
          setPayError(bad.messages.join(' · '));
          return;
        }
        setPayError('');
        var label = payBtn.textContent;
        payBtn.disabled = true;
        payBtn.textContent = 'Redirection vers PayPal…';
        fetch(CHECKOUT_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: v.payPrenom,
            last_name: v.payNom,
            email: v.payEmail,
            phone: v.payTel,
            birthdate: v.payNaissance,
          }),
        })
          .then(function (r) {
            return r.json().catch(function () { return {}; });
          })
          .then(function (data) {
            if (data && data.ok && isPaypalUrl(data.url)) {
              window.location.href = data.url;
              return;
            }
            var msg = (data && (data.error || (data.errors && data.errors.join(' · ')))) ||
              'Le paiement est momentanément indisponible. Réessayez dans un instant.';
            throw new Error(msg);
          })
          .catch(function (err) {
            setPayError(err && err.message ? err.message : 'Connexion impossible. Réessayez.');
            payBtn.disabled = false;
            payBtn.textContent = label;
          });
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
