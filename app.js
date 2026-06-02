/* ============================================
   Boxing Trophy 18 — Main Application Logic
   ============================================ */

function migrateLocalStorage() {
  const migrations = [
    { old: 'fightevent18_registrations', newKey: 'boxingtrophy18_registrations' },
    { old: 'fightevent18_matches', newKey: 'boxingtrophy18_matches' },
    { old: 'fightevent18_unmatched', newKey: 'boxingtrophy18_unmatched' },
    { old: 'fightevent18_lastMatching', newKey: 'boxingtrophy18_lastMatching' }
  ];
  migrations.forEach(m => {
    const oldVal = localStorage.getItem(m.old);
    if (oldVal !== null && localStorage.getItem(m.newKey) === null) {
      localStorage.setItem(m.newKey, oldVal);
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  migrateLocalStorage();
  initNavigation();
  initAnchorScroll();
  initCountdown();
  initScrollReveal();
  if (typeof BT18RegistrationGate !== 'undefined') {
    try {
      await BT18RegistrationGate.applyRegistrationGateUI();
    } catch (e) {
      console.warn('registration gate:', e);
    }
  }
  initForm();
  initStatCounters();
});

/* ============================================
   NAVIGATION
   ============================================ */
const NAV_SCROLL_OFFSET = 96;

function revealInSection(section) {
  if (!section) return;
  section.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach((el) => {
    el.classList.add('visible');
  });
}

function scrollToSection(target) {
  if (!target) return;
  const top = target.getBoundingClientRect().top + window.scrollY - NAV_SCROLL_OFFSET;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function initNavigation() {
  const nav = document.getElementById('navbar');
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (!nav || !toggle || !links) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 60) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
    nav.classList.remove('nav-hidden', 'nav-visible');
  }, { passive: true });

  toggle.addEventListener('click', () => {
    toggle.classList.toggle('active');
    links.classList.toggle('open');
    nav.classList.toggle('nav-open');
    document.body.style.overflow = links.classList.contains('open') ? 'hidden' : '';
  });

  function closeMobileNav() {
    toggle.classList.remove('active');
    links.classList.remove('open');
    nav.classList.remove('nav-open');
    document.body.style.overflow = '';
  }

  links.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      closeMobileNav();
    });
  });
}

function initAnchorScroll() {
  function goToHash(hash) {
    if (!hash || hash === '#') return;
    const target = document.querySelector(hash);
    if (!target) return;
    revealInSection(target);
    requestAnimationFrame(() => scrollToSection(target));
  }

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href === '#') return;
    link.addEventListener('click', (e) => {
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      goToHash(href);
      if (history.pushState) {
        history.pushState(null, '', href);
      } else {
        window.location.hash = href;
      }
    });
  });

  if (window.location.hash) {
    window.addEventListener('load', () => {
      setTimeout(() => goToHash(window.location.hash), 80);
    });
  }
}

/* ============================================
   COUNTDOWN — Target: 5 June 2026, 19:00 CET
   ============================================ */
function initCountdown() {
  const targetDate = new Date('2026-06-05T19:00:00+02:00').getTime();
  const countdownEl = document.getElementById('countdown');
  const daysEl = document.getElementById('cd-days');
  const hoursEl = document.getElementById('cd-hours');
  const minutesEl = document.getElementById('cd-minutes');
  const secondsEl = document.getElementById('cd-seconds');
  let timerInterval;

  function updateDigit(el, newValue) {
    const oldValue = el.getAttribute('data-value');
    if (oldValue === newValue) return;

    el.setAttribute('data-value', newValue);

    // Initial load: set value without animation to avoid slide-in on load
    if (oldValue === null) {
      el.innerHTML = `<span class="digit-current">${newValue}</span>`;
      return;
    }

    // Set structure for sliding roll
    el.innerHTML = `
      <span class="digit-container-roll">
        <span class="digit-old">${oldValue}</span>
        <span class="digit-new">${newValue}</span>
      </span>
    `;

    const rollContainer = el.querySelector('.digit-container-roll');
    // Force a reflow to start transition
    void rollContainer.offsetWidth;
    rollContainer.classList.add('roll-active');

    // Clean up to stable state once transition ends
    setTimeout(() => {
      if (el.getAttribute('data-value') === newValue) {
        el.innerHTML = `<span class="digit-current">${newValue}</span>`;
      }
    }, 450);
  }

  function update() {
    const now = Date.now();
    const diff = targetDate - now;

    if (diff <= 0) {
      updateDigit(daysEl, '00');
      updateDigit(hoursEl, '00');
      updateDigit(minutesEl, '00');
      updateDigit(secondsEl, '00');
      if (countdownEl) {
        countdownEl.classList.add('is-finished');
      }
      if (timerInterval) {
        clearInterval(timerInterval);
      }
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    updateDigit(daysEl, String(days).padStart(2, '0'));
    updateDigit(hoursEl, String(hours).padStart(2, '0'));
    updateDigit(minutesEl, String(minutes).padStart(2, '0'));
    updateDigit(secondsEl, String(seconds).padStart(2, '0'));
  }

  update();
  timerInterval = setInterval(update, 1000);
}

/* ============================================
   SCROLL REVEAL (Intersection Observer)
   ============================================ */
function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
  });

  reveals.forEach(el => observer.observe(el));
}

/* ============================================
   STAT COUNTERS ANIMATION
   ============================================ */
function initStatCounters() {
  const stats = document.querySelectorAll('.stat-value[data-count]');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  stats.forEach(stat => observer.observe(stat));
}

function animateCounter(el) {
  const target = parseInt(el.dataset.count, 10);
  const duration = 2000;
  const startTime = performance.now();

  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(eased * target);

    el.textContent = current >= 1000 ? current.toLocaleString('fr-FR') : current;

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      // Add + sign for larger numbers
      if (target >= 100) {
        el.textContent = target.toLocaleString('fr-FR') + '+';
      }
    }
  }

  requestAnimationFrame(step);
}

/* ============================================
   MULTI-STEP FORM
   ============================================ */
function initForm() {
  const form = document.getElementById('registrationForm');
  if (!form || form.hidden) return;
  let currentStep = 1;

  // Step navigation
  document.querySelectorAll('.btn-next').forEach(btn => {
    btn.addEventListener('click', async () => {
      const nextStep = parseInt(btn.dataset.next, 10);
      if (currentStep === 1) {
        btn.disabled = true;
        const initialText = btn.textContent;
        btn.textContent = 'Vérification...';
        try {
          const isValid = await validateStep1Async();
          if (isValid) {
            goToStep(nextStep);
          }
        } finally {
          btn.disabled = false;
          btn.textContent = initialText;
        }
      } else {
        if (validateStep(currentStep)) {
          goToStep(nextStep);
        }
      }
    });
  });

  document.querySelectorAll('.btn-prev').forEach(btn => {
    btn.addEventListener('click', () => {
      const prevStep = parseInt(btn.dataset.prev, 10);
      goToStep(prevStep);
    });
  });

  // Licence conditional logic
  const licenceRadios = document.querySelectorAll('input[name="licencie"]');
  const licenceField = document.getElementById('licenceField');
  const engagementField = document.getElementById('engagementField');

  licenceRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'Oui') {
        licenceField.classList.add('visible');
        engagementField.classList.remove('visible');
        document.getElementById('engagementLicence').checked = false;
      } else {
        licenceField.classList.remove('visible');
        engagementField.classList.add('visible');
        document.getElementById('numeroLicence').value = '';
      }
    });
  });

  initRegPhoto();

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (validateStep(3)) {
      const step1Ok = await validateStep1Async();
      if (!step1Ok) {
        goToStep(1);
        return;
      }
      submitForm();
    }
  });

  function goToStep(step) {
    // Update form steps
    document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
    document.querySelector(`.form-step[data-step="${step}"]`).classList.add('active');

    // Update indicators
    document.querySelectorAll('.step-indicator').forEach(ind => {
      const s = parseInt(ind.dataset.step, 10);
      ind.classList.remove('active', 'completed');
      if (s === step) ind.classList.add('active');
      if (s < step) ind.classList.add('completed');
    });

    // Update connectors
    const connectors = document.querySelectorAll('.step-connector');
    connectors.forEach((conn, i) => {
      if (i < step - 1) {
        conn.classList.add('active');
      } else {
        conn.classList.remove('active');
      }
    });

    currentStep = step;

    // Scroll to form
    document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function validateStep(step) {
    let valid = true;

    if (step === 1) {
      valid = validateField('nom') && valid;
      valid = validateField('prenom') && valid;
      valid = validateField('dateNaissance') && valid;
      valid = validateRadio('sexe', 'sexe-error') && valid;
      valid = validateEmailField('email') && valid;
      valid = validatePhoneField('telephone') && valid;
    }

    if (step === 2) {
      valid = validateField('niveau') && valid;
      valid = validateRadio('licencie', 'licencie-error') && valid;

      const licencie = document.querySelector('input[name="licencie"]:checked');
      if (licencie) {
        if (licencie.value === 'Oui') {
          valid = validateField('numeroLicence') && valid;
        } else {
          const engagement = document.getElementById('engagementLicence');
          if (!engagement.checked) {
            showError('engagementLicence-error');
            valid = false;
          } else {
            hideError('engagementLicence-error');
          }
        }
      }
    }

    if (step === 3) {
      valid = validateField('club') && valid;
      valid = validateField('categoriePoids') && valid;

      const rgpd = document.getElementById('consentementRGPD');
      if (!rgpd.checked) {
        showError('consentementRGPD-error');
        valid = false;
      } else {
        hideError('consentementRGPD-error');
      }
    }

    return valid;
  }

  function validateField(id) {
    const field = document.getElementById(id);
    const errorId = id + '-error';

    if (!field.value.trim()) {
      field.classList.add('error');
      showError(errorId);
      return false;
    }

    field.classList.remove('error');
    hideError(errorId);
    return true;
  }

  function validateEmailField(id) {
    const field = document.getElementById(id);
    const errorId = id + '-error';
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!field.value.trim() || !emailPattern.test(field.value.trim())) {
      field.classList.add('error');
      showError(errorId);
      return false;
    }

    field.classList.remove('error');
    hideError(errorId);
    return true;
  }

  function validatePhoneField(id) {
    const field = document.getElementById(id);
    const errorId = id + '-error';
    const phonePattern = /^[\d\s+\-()]{8,}$/;

    if (!field.value.trim() || !phonePattern.test(field.value.trim())) {
      field.classList.add('error');
      showError(errorId);
      return false;
    }

    field.classList.remove('error');
    hideError(errorId);
    return true;
  }

  async function checkDuplicates(emailVal, phoneVal) {
    const clean = (num) => num ? num.replace(/[\s.\-_()+]/g, '') : '';
    const inputPhoneClean = clean(phoneVal);
    const inputEmailClean = emailVal.toLowerCase().trim();
    
    let registrations = [];
    
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('registrations')
          .select('email, telephone');
        if (error) throw error;
        if (data) registrations = data;
      } catch (err) {
        console.error("Error checking duplicates from Supabase, relying on LocalStorage:", err);
        registrations = JSON.parse(localStorage.getItem('boxingtrophy18_registrations') || '[]');
      }
    } else {
      registrations = JSON.parse(localStorage.getItem('boxingtrophy18_registrations') || '[]');
    }
    
    const isEmailDup = registrations.some(r => r.email && r.email.toLowerCase().trim() === inputEmailClean);
    const isPhoneDup = registrations.some(r => r.telephone && clean(r.telephone) === inputPhoneClean);
    
    return { isEmailDup, isPhoneDup };
  }

  async function validateStep1Async() {
    hideError('email-duplicate-error');
    hideError('telephone-duplicate-error');
    
    const isBasicValid = validateStep(1);
    if (!isBasicValid) return false;
    
    const emailVal = getValue('email');
    const phoneVal = getValue('telephone');
    
    const { isEmailDup, isPhoneDup } = await checkDuplicates(emailVal, phoneVal);
    
    let ok = true;
    if (isEmailDup) {
      showError('email-duplicate-error');
      document.getElementById('email').classList.add('error');
      ok = false;
    }
    if (isPhoneDup) {
      showError('telephone-duplicate-error');
      document.getElementById('telephone').classList.add('error');
      ok = false;
    }
    return ok;
  }

  function validateRadio(name, errorId) {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    if (!checked) {
      showError(errorId);
      return false;
    }
    hideError(errorId);
    return true;
  }

  function showError(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('visible');
  }

  function hideError(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('visible');
  }

  async function submitForm() {
    if (
      typeof BT18RegistrationGate !== 'undefined' &&
      !BT18RegistrationGate.isRegistrationOpen()
    ) {
      return;
    }
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Envoi en cours…';
    }

    let photoUrl = (document.getElementById('regPhotoUrl') || {}).value || '';
    const photoFile = document.getElementById('regPhotoFile');
    const pendingFile = photoFile && photoFile.files && photoFile.files[0];
    const photoStatus = document.getElementById('regPhotoStatus');

    if (pendingFile && !photoUrl) {
      if (typeof BT18Cloudinary === 'undefined' || !BT18Cloudinary.getCloudinaryConfig().isConfigured()) {
        if (photoStatus) {
          photoStatus.textContent =
            '⚠️ Envoi photo impossible : Cloudinary non configuré (relancez npm run config / vérifiez le preset bt18_unsigned).';
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
        }
        return;
      }
      if (photoStatus) photoStatus.textContent = 'Envoi de la photo…';
      try {
        photoUrl = await BT18Cloudinary.uploadFile(pendingFile);
        if (photoStatus) photoStatus.textContent = '✓ Photo enregistrée';
        const urlInput = document.getElementById('regPhotoUrl');
        if (urlInput) urlInput.value = photoUrl;
      } catch (err) {
        if (photoStatus) photoStatus.textContent = '❌ ' + (err.message || 'Échec upload');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
        }
        return;
      }
    }

    const formData = {
      id: generateId(),
      nom: getValue('nom'),
      prenom: getValue('prenom'),
      dateNaissance: getValue('dateNaissance'),
      sexe: getRadioValue('sexe'),
      niveau: getValue('niveau'),
      discipline: 'Boxe Anglaise',
      licencie: getRadioValue('licencie'),
      numeroLicence: getValue('numeroLicence') || '',
      engagementLicence: document.getElementById('engagementLicence').checked,
      club: getValue('club'),
      categoriePoids: getValue('categoriePoids'),
      email: getValue('email'),
      telephone: getValue('telephone'),
      consentementRGPD: document.getElementById('consentementRGPD').checked,
      dateInscription: new Date().toISOString(),
      photoUrl: photoUrl ? photoUrl : null
    };

    let savedToCloud = false;

    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
        const { error } = await supabaseClient
          .from('registrations')
          .insert([formData]);
        if (error) throw error;
        savedToCloud = true;
      } catch (err) {
        console.error("Supabase insert error, falling back to LocalStorage:", err);
      }
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }

    if (!savedToCloud) {
      // Save to localStorage
      const registrations = JSON.parse(localStorage.getItem('boxingtrophy18_registrations') || '[]');
      registrations.push(formData);
      localStorage.setItem('boxingtrophy18_registrations', JSON.stringify(registrations));

      // Run matching
      runMatching(registrations);
    }

    // Show success
    form.style.display = 'none';
    document.querySelector('.form-steps').style.display = 'none';
    document.getElementById('formSuccess').classList.add('visible');

    // Reset form for next use
    setTimeout(() => {
      form.reset();
    }, 500);
  }

  function getValue(id) {
    return document.getElementById(id).value.trim();
  }

  function getRadioValue(name) {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    return checked ? checked.value : '';
  }

  function generateId() {
    return 'reg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  function initRegPhoto() {
    const fileInput = document.getElementById('regPhotoFile');
    const pickBtn = document.getElementById('regPhotoBtn');
    const clearBtn = document.getElementById('regPhotoClearBtn');
    const preview = document.getElementById('regPhotoPreview');
    const urlInput = document.getElementById('regPhotoUrl');
    if (!fileInput || !pickBtn) return;

    let objectUrl = null;

    function revokeObjectUrl() {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    }

    function setPreviewFromUrl(url) {
      if (!preview) return;
      const has = !!(url && String(url).trim());
      if (has) {
        preview.style.backgroundImage = 'url("' + String(url).replace(/"/g, '') + '")';
        preview.setAttribute('aria-hidden', 'false');
        preview.classList.add('has-photo');
      } else {
        preview.style.backgroundImage = '';
        preview.setAttribute('aria-hidden', 'true');
        preview.classList.remove('has-photo');
      }
      if (clearBtn) clearBtn.hidden = !has;
    }

    pickBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
      revokeObjectUrl();
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (urlInput) urlInput.value = '';
      objectUrl = URL.createObjectURL(file);
      setPreviewFromUrl(objectUrl);
      const st = document.getElementById('regPhotoStatus');
      if (st) st.textContent = '';
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        revokeObjectUrl();
        fileInput.value = '';
        if (urlInput) urlInput.value = '';
        setPreviewFromUrl('');
        const st = document.getElementById('regPhotoStatus');
        if (st) st.textContent = 'Photo retirée';
      });
    }
  }
}

/* ============================================
   MATCHING SYSTEM
   ============================================ */
function runMatching(registrations) {
  if (!registrations || registrations.length < 2) return;

  const matches = [];
  const unmatched = [];

  // Group by sexe → categoriePoids → niveau
  const groups = {};

  registrations.forEach(reg => {
    const key = `${reg.sexe}|${reg.categoriePoids}|${reg.niveau}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(reg);
  });

  // Create pairs within each group
  Object.keys(groups).forEach(key => {
    const group = groups[key];
    const shuffled = [...group].sort(() => Math.random() - 0.5);

    for (let i = 0; i < shuffled.length - 1; i += 2) {
      matches.push({
        id: 'match_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        fighter1: shuffled[i],
        fighter2: shuffled[i + 1],
        sexe: shuffled[i].sexe,
        categoriePoids: shuffled[i].categoriePoids,
        niveau: shuffled[i].niveau,
        status: 'Prévu'
      });
    }

    // Odd one out
    if (shuffled.length % 2 !== 0) {
      unmatched.push(shuffled[shuffled.length - 1]);
    }
  });

  // Save matches
  localStorage.setItem('boxingtrophy18_matches', JSON.stringify(matches));
  localStorage.setItem('boxingtrophy18_unmatched', JSON.stringify(unmatched));
  localStorage.setItem('boxingtrophy18_lastMatching', new Date().toISOString());
}

/* ============================================
   REMOVE INPUT ERROR ON INTERACTION
   ============================================ */
document.addEventListener('input', (e) => {
  if (e.target.classList.contains('form-input') || e.target.classList.contains('form-select')) {
    e.target.classList.remove('error');
    const errorEl = document.getElementById(e.target.id + '-error');
    if (errorEl) errorEl.classList.remove('visible');
    
    // Clear duplicate errors
    const dupErrorEl = document.getElementById(e.target.id + '-duplicate-error');
    if (dupErrorEl) dupErrorEl.classList.remove('visible');
  }
});

document.addEventListener('change', (e) => {
  if (e.target.type === 'radio' || e.target.type === 'checkbox') {
    // Hide related error
    const name = e.target.name;
    const errorEl = document.getElementById(name + '-error');
    if (errorEl) errorEl.classList.remove('visible');

    // Also check for combined id pattern
    const idError = document.getElementById(e.target.id + '-error');
    if (idError) idError.classList.remove('visible');
  }
});
