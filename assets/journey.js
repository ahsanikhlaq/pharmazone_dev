/*
  ============================================================
  PHARMAZON QUIZ FLOW — quiz-flow.js
  Upload to: Shopify Admin > Themes > Assets
  Add before </body> in theme.liquid:
    <script src="{{ 'quiz-flow.js' | asset_url }}" defer></script>
  ============================================================
*/

(function () {

  var stepHistory = [];

  /* ★ FIX: Single declaration of quizData with ALL fields */
  var quizData = {
    weightKg:      null,
    weightUnit:    'kg',
    weightDisplay: null,
    heightCm:      null
  };

  var PHASE1_STEPS = [
    'step-start','first-step','sec-step','thir-step',
    'four-step','fiv-step','six-step','sev-step'
  ];

  var PHASE2_STEPS = [
    'eig-step','nin-step','ten-step',
    'ele-step','twe-step','thrteen-step'
  ];

  var HIDDEN_STEPS = ['n-1st-step','per-step','p-step','not-eligible','2-start-step','evi-step','person-plan'];

  /* ═══════════════════════════════════════════════════════════
     STORAGE SYSTEM
  ═══════════════════════════════════════════════════════════ */
  var STORAGE_KEY = 'pharmazon_quiz_answers';

  var quizAnswers = {
    startedAt:   null,
    completedAt: null,
    weight:      {},
    bmi:         {},
    stepOrder:   [],
    steps:       {},
    popups:      {}
  };

  function resetQuizAnswers() {
    quizAnswers = {
      startedAt:   new Date().toISOString(),
      completedAt: null,
      weight:      {},
      bmi:         {},
      stepOrder:   [],
      steps:       {},
      popups:      {}
    };
    saveQuizAnswers();
    console.log('[QuizFlow] Fresh quiz started — previous data cleared.');
  }

  function saveQuizAnswers() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(quizAnswers));
    } catch (e) {
      console.warn('[QuizFlow] localStorage save failed:', e);
    }
  }

  function loadQuizAnswers() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) quizAnswers = JSON.parse(raw);
    } catch (e) {
      console.warn('[QuizFlow] Could not load existing answers:', e);
    }
  }

  /* ─────────────────────────────────────────────────────────
     TEXT EXTRACTION HELPERS
  ───────────────────────────────────────────────────────── */
  function getQuestionText(sec) {
    var selectors = [
      '[class*="qes-heading"]','[class*="qes-title"]',
      '[class*="question-heading"]','[class*="question-title"]',
      '[class*="quiz-heading"]','[class*="quiz-title"]',
      '[class*="step-heading"]','[class*="step-title"]',
      '[class*="wt-heading"]','[class*="gp-heading"]',
      'h1','h2','h3','h4'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = sec.querySelector(selectors[i]);
      if (el) {
        var txt = el.textContent.trim().replace(/\s+/g, ' ');
        if (txt) return txt;
      }
    }
    return '';
  }

  function getPopupTexts(popupEl) {
    var title = '';
    var content = '';
    var titleSelectors = ['h1','h2','h3','h4','[class*="popup-title"]','[class*="popup-heading"]','[class*="modal-title"]'];
    for (var i = 0; i < titleSelectors.length; i++) {
      var el = popupEl.querySelector(titleSelectors[i]);
      if (el) { title = el.textContent.trim().replace(/\s+/g, ' '); break; }
    }
    var bodyParts = [];
    var bodySelectors = ['[class*="popup-body"]','[class*="popup-content"]','[class*="popup-desc"]','p'];
    for (var j = 0; j < bodySelectors.length; j++) {
      var els = popupEl.querySelectorAll(bodySelectors[j]);
      if (els.length) {
        els.forEach(function(el) {
          var t = el.textContent.trim().replace(/\s+/g, ' ');
          if (t && bodyParts.indexOf(t) === -1) bodyParts.push(t);
        });
        if (bodyParts.length) break;
      }
    }
    content = bodyParts.join(' | ').slice(0, 300);
    return { title: title, content: content };
  }

  function getCurrentStepId() {
    var sec = document.querySelector('.new-qes-section[data-step][style*="block"], .new-qes-section[data-step][style*="flex"]');
    return sec ? sec.getAttribute('data-step') : null;
  }

  /* ─────────────────────────────────────────────────────────
     SAVE FUNCTIONS
  ───────────────────────────────────────────────────────── */
  function recordStepVisit(stepId) {
    if (!stepId) return;
    if (quizAnswers.stepOrder.indexOf(stepId) === -1) {
      quizAnswers.stepOrder.push(stepId);
    }
    if (!quizAnswers.steps[stepId]) {
      quizAnswers.steps[stepId] = { stepId: stepId };
    }
    var sec = document.querySelector('.new-qes-section[data-step="' + stepId + '"]');
    if (sec) {
      var q = getQuestionText(sec);
      if (q) quizAnswers.steps[stepId].question = q;

      /* ★ FIX: Auto-plan steps have no user input — save 'Shown' as answer
         so they appear in Q numbering and don't shift all subsequent numbers */
      var isAutoPlan = sec.getAttribute('auto-plan') === 'true';
      if (isAutoPlan && !quizAnswers.steps[stepId].answer) {
        quizAnswers.steps[stepId].answer = 'Shown';
      }
    }
    saveQuizAnswers();
  }

  function saveRadioAnswer(sec, answerText) {
    var stepId = sec.getAttribute('data-step');
    if (!stepId) return;
    if (quizAnswers.stepOrder.indexOf(stepId) === -1) quizAnswers.stepOrder.push(stepId);
    if (!quizAnswers.steps[stepId]) quizAnswers.steps[stepId] = { stepId: stepId };
    quizAnswers.steps[stepId].stepId     = stepId;
    quizAnswers.steps[stepId].question   = getQuestionText(sec);
    quizAnswers.steps[stepId].answer     = answerText;
    quizAnswers.steps[stepId].answeredAt = new Date().toISOString();
    delete quizAnswers.steps[stepId].inputValues;
    saveQuizAnswers();
    console.log('[QuizFlow] ✓ Step "' + stepId + '" → "' + answerText + '"');
  }

  /* ★ FIX: Save weight inputs — only active tab, labelled clearly */
  function saveWeightInputs(sec) {
    var stepId = sec.getAttribute('data-step');
    if (!stepId) return;

    /* Find active tab */
    var activeTab = sec.querySelector('[class*="wt-unit-tab"].active, [class*="wt-unit-tab"][class*="active"]');
    var unit = activeTab ? activeTab.textContent.trim() : 'st/lb';

    /* Find active (non-hidden) input panel */
    var activePanel = sec.querySelector('[class*="wt-tab-inputs"]:not(.hidden)');
    if (!activePanel) return;

    var inputs = activePanel.querySelectorAll('input[class*="wt-inp"]');
    var val1 = inputs[0] ? (inputs[0].value.trim() || '') : '';
    var val2 = inputs[1] ? (inputs[1].value.trim() || '') : '';

    /* Build clean display string */
    var displayVal = '';
    if (unit.toLowerCase() === 'kg') {
      displayVal = val1 + ' kg';
    } else {
      displayVal = val1 + ' st ' + (val2 ? val2 + ' lbs' : '');
    }

    if (!val1) return;

    if (quizAnswers.stepOrder.indexOf(stepId) === -1) quizAnswers.stepOrder.push(stepId);
    if (!quizAnswers.steps[stepId]) quizAnswers.steps[stepId] = { stepId: stepId };

    quizAnswers.steps[stepId].stepId      = stepId;
    quizAnswers.steps[stepId].question    = getQuestionText(sec);
    quizAnswers.steps[stepId].answer      = displayVal.trim();
    quizAnswers.steps[stepId].answeredAt  = new Date().toISOString();
    delete quizAnswers.steps[stepId].inputValues;

    saveQuizAnswers();
    console.log('[QuizFlow] ✓ Weight saved:', displayVal);
  }

  /* ★ FIX: Save height inputs — only active tab, labelled clearly */
  function saveHeightInputs(sec) {
    var stepId = sec.getAttribute('data-step');
    if (!stepId) return;

    var activeTab = sec.querySelector('[class*="wt-unit-tab"].active, [class*="wt-unit-tab"][class*="active"]');
    var unit = activeTab ? activeTab.textContent.trim() : 'cm';

    var activePanel = sec.querySelector('[class*="wt-tab-inputs"]:not(.hidden)');
    if (!activePanel) return;

    var inputs = activePanel.querySelectorAll('input[class*="wt-inp"]');
    var val1 = inputs[0] ? (inputs[0].value.trim() || '') : '';
    var val2 = inputs[1] ? (inputs[1].value.trim() || '') : '';

    var displayVal = '';
    if (unit.toLowerCase() === 'cm') {
      displayVal = val1 + ' cm';
    } else {
      displayVal = val1 + ' ft ' + (val2 ? val2 + ' in' : '');
    }

    if (!val1) return;

    if (quizAnswers.stepOrder.indexOf(stepId) === -1) quizAnswers.stepOrder.push(stepId);
    if (!quizAnswers.steps[stepId]) quizAnswers.steps[stepId] = { stepId: stepId };

    quizAnswers.steps[stepId].stepId      = stepId;
    quizAnswers.steps[stepId].question    = getQuestionText(sec);
    quizAnswers.steps[stepId].answer      = displayVal.trim();
    quizAnswers.steps[stepId].answeredAt  = new Date().toISOString();
    delete quizAnswers.steps[stepId].inputValues;

    saveQuizAnswers();
    console.log('[QuizFlow] ✓ Height saved:', displayVal);
  }

  function saveInputAnswers(sec) {
    var stepId = sec.getAttribute('data-step');
    if (!stepId) return;

    /* ★ Weight step — use dedicated saver */
    if (stepId === 'sec-step') { saveWeightInputs(sec); return; }

    /* ★ Height step — use dedicated saver */
    if (stepId === 'thir-step') { saveHeightInputs(sec); return; }

    /* ★ GP step — handled entirely by saveGPData on submit, skip generic saver */
    if (sec.querySelector('[class*="gp-inp-"]')) return;

    var inputValues = {};
    sec.querySelectorAll(
      'input.inp-place, input[class*="wt-inp"], input.gp-inp,' +
      'input[type="text"], input[type="number"], input[type="email"]'
    ).forEach(function (inp) {
      var panel = inp.closest('[class*="wt-tab-inputs"]');
      if (panel && panel.classList.contains('hidden')) return;
      if (inp.value.trim() === '') return;
      var label = inp.getAttribute('placeholder')
               || inp.getAttribute('name')
               || inp.getAttribute('id')
               || inp.getAttribute('aria-label')
               || 'value';
      inputValues[label] = inp.value.trim();
    });

    /* ★ FIX: Only use wt-unit-tab for 'unit' — gp-id-tab is handled by saveGPData */
    var activeTab = sec.querySelector('[class*="wt-unit-tab"].active');
    if (activeTab) inputValues['unit'] = activeTab.textContent.trim();

    if (!Object.keys(inputValues).length) return;

    if (quizAnswers.stepOrder.indexOf(stepId) === -1) quizAnswers.stepOrder.push(stepId);
    if (!quizAnswers.steps[stepId]) quizAnswers.steps[stepId] = { stepId: stepId };

    quizAnswers.steps[stepId].stepId      = stepId;
    quizAnswers.steps[stepId].question    = getQuestionText(sec);
    quizAnswers.steps[stepId].inputValues = inputValues;
    quizAnswers.steps[stepId].answeredAt  = new Date().toISOString();

    saveQuizAnswers();
    console.log('[QuizFlow] ✓ Step "' + stepId + '" inputs →', inputValues);
  }

  function savePopupOpen(popupName, triggerStepId) {
    if (!popupName) return;
    var popupEl = document.querySelector('[popup-name="' + popupName + '"]');
    var texts   = popupEl ? getPopupTexts(popupEl) : { title: '', content: '' };
    if (!quizAnswers.popups[popupName]) quizAnswers.popups[popupName] = {};
    quizAnswers.popups[popupName].popupName   = popupName;
    quizAnswers.popups[popupName].title       = texts.title;
    quizAnswers.popups[popupName].content     = texts.content;
    quizAnswers.popups[popupName].triggerStep = triggerStepId || getCurrentStepId() || '';
    quizAnswers.popups[popupName].openedAt    = new Date().toISOString();
    quizAnswers.popups[popupName].action      = 'opened';
    saveQuizAnswers();
  }

  function savePopupAction(popupName, action, nextStep, extraInfo) {
    if (!popupName) return;
    if (!quizAnswers.popups[popupName]) quizAnswers.popups[popupName] = { popupName: popupName };
    quizAnswers.popups[popupName].action   = action;
    quizAnswers.popups[popupName].nextStep = nextStep || '';
    quizAnswers.popups[popupName].actedAt  = new Date().toISOString();
    if (extraInfo) {
      quizAnswers.popups[popupName].userInput = extraInfo;
      var triggerStep = quizAnswers.popups[popupName].triggerStep;
      if (triggerStep && quizAnswers.steps[triggerStep]) {
        quizAnswers.steps[triggerStep].popupInfo = extraInfo;
      }
    }
    saveQuizAnswers();
  }

  function getOpenPopupName() {
    var open = document.querySelector('[popup-name].qf-popup-open');
    return open ? open.getAttribute('popup-name') : null;
  }

  /* ★ FIX: saveWeightAndBmi — stores clean BMI data, no loss/target */
  function saveWeightAndBmi() {
    quizAnswers.weight = {
      kg:      Math.round((quizData.weightKg || 0) * 10) / 10,
      display: quizData.weightDisplay,
      unit:    quizData.weightUnit
    };
    saveQuizAnswers();
  }

  function saveCurrentStepInputs() {
    var current = document.querySelector(
      '.new-qes-section[data-step][style*="block"],' +
      '.new-qes-section[data-step][style*="flex"]'
    );
    if (!current) return;
    var inputs = current.querySelectorAll(
      'input.inp-place, input[class*="wt-inp"], input.gp-inp,' +
      'input[type="text"], input[type="number"], input[type="email"]'
    );
    if (inputs.length) saveInputAnswers(current);
  }

  /* ─────────────────────────────────────────
     CSS INJECTION
  ───────────────────────────────────────── */
  function injectStyles() {
    var style = document.createElement('style');
    style.textContent = [
      '.single-qes { border: 1.5px solid transparent; cursor: pointer; }',
      '.single-qes:hover { border-color: #D0C8ED; }',
      '.single-qes.qes-selected { border: 1.5px solid #4C3E79; background: linear-gradient(107deg, rgba(244,239,253,0.4) 0.38%, rgba(255,245,191,0.3) 100%), #FFF; }',
      '.single-qes.qes-selected .inp-svg { background: #4C3E79 !important; border-color: #4C3E79 !important; position: relative; }',
      '.single-qes.qes-selected .inp-svg::after { content: ""; width: 8px; height: 8px; background: #FFF; border-radius: 50%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }',
      '.single-qes.qes-selected .qes-text { font-weight: 500; color: #4C3E79; }',
      '@keyframes qf-in-right { from { opacity:0; transform:translateX(30px); } to { opacity:1; transform:translateX(0); } }',
      '@keyframes qf-in-left  { from { opacity:0; transform:translateX(-30px);} to { opacity:1; transform:translateX(0); } }',
      '.qf-animate-in   { animation: qf-in-right 0.35s cubic-bezier(0.22,1,0.36,1) both; }',
      '.qf-animate-back { animation: qf-in-left  0.35s cubic-bezier(0.22,1,0.36,1) both; }',
      '[popup-name] { display: none !important; }',
      '[popup-name].qf-popup-open { display: flex !important; position: fixed; inset: 0; z-index: 9999; justify-content: center; align-items: center; padding: 20px; box-sizing: border-box; background: rgba(0,0,0,0.45); }',
      '.progressbar-first .progress-bar-active, .progressbar-second .progress-bar-active { max-width: 100% !important; width: 0%; transition: width 0.5s cubic-bezier(0.4,0,0.2,1); }',
      'button.qf-btn-disabled { opacity: 0.45 !important; cursor: not-allowed !important; pointer-events: none !important; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ─────────────────────────────────────────
     AUTO-PLAN
  ───────────────────────────────────────── */




  function initAutoPlan() {
  document.querySelectorAll('.new-qes-section[auto-plan="true"]').forEach(function(sec) {
    var observer = new MutationObserver(function() {
      var isVisible = sec.style.display !== 'none' && sec.style.display !== '';
      if (!isVisible) return;

      var stepId   = sec.getAttribute('data-step');
      var nextAttr = (sec.getAttribute('next-step') || '').trim();

      /* ── Special case: "both" step — check order history first ── */
      if (stepId === 'both') {
        /* Get email saved from per-step */
        var email = '';
        if (quizAnswers.steps && quizAnswers.steps['per-step']) {
          var perStepData = quizAnswers.steps['per-step'];
          /* Try inputValues first */
          if (perStepData.inputValues) {
            var vals = perStepData.inputValues;
            for (var key in vals) {
              var val = vals[key].toLowerCase ? vals[key] : '';
              var k   = key.toLowerCase();
              if (k.indexOf('email') !== -1 || (vals[key] && vals[key].indexOf('@') !== -1)) {
                email = vals[key];
                break;
              }
            }
          }
          /* Fallback: check answer field */
          if (!email && perStepData.answer && perStepData.answer.indexOf('@') !== -1) {
            email = perStepData.answer;
          }
        }

        /* Also try scanning DOM directly as fallback */
        if (!email) {
          var perSec = document.querySelector('.new-qes-section[data-step="per-step"]');
          if (perSec) {
            perSec.querySelectorAll('input.inp-place').forEach(function(inp) {
              if (!email && inp.value && inp.value.indexOf('@') !== -1) {
                email = inp.value.trim();
              }
            });
          }
        }

        console.log('[QuizFlow] "both" step — email found:', email || 'NONE');

        /* Parse next-step — format is "not-eligible, order-his" */
        var parts        = nextAttr.split(',');
        var notEligible  = (parts[0] || '').trim(); // not-eligible
        var orderHisStep = (parts[1] || '').trim(); // order-his

        if (!email) {
          /* No email found — go to not-eligible */
          console.warn('[QuizFlow] No email found — going to not-eligible');
          setTimeout(function() { showStep(notEligible, 'forward'); }, 2000);
          return;
        }

        setTimeout(function() {
          checkEmailOrderHistory(email, orderHisStep, notEligible);
        }, 2000);
        return;
      }

      /* ── Default auto-plan behaviour ── */
      if (nextAttr) {
        setTimeout(function() { showStep(nextAttr, 'forward'); }, 2000);
      }
    });

    observer.observe(sec, { attributes: true, attributeFilter: ['style'] });
  });



  /* ─────────────────────────────────────────
   ORDER HISTORY DISPLAY — order-his step
   Auto-populates table from localStorage
───────────────────────────────────────── */

}



function initOrderHistoryDisplay() {
  var sec = document.querySelector('.new-qes-section[data-step="order-his"]');
  if (!sec) return;

  function populateOrderTable() {
    try {
      var stored = JSON.parse(localStorage.getItem('pharmazon_quiz_answers') || '{}');
      var oh     = stored.orderHistory;

      var tableWrap = sec.querySelector('[id^="ne-order-table-"]');
      var loading   = sec.querySelector('[id^="ne-order-loading-"]');
      var table     = sec.querySelector('[id^="ne-table-"]');
      var errorEl   = sec.querySelector('[id^="ne-order-error-"]');
      var valDate   = sec.querySelector('[id^="ne-val-date-"]');
      var valInject = sec.querySelector('[id^="ne-val-injection-"]');
      var valDose   = sec.querySelector('[id^="ne-val-dose-"]');
      var doseRow   = sec.querySelector('[id^="ne-dose-row-"]');
      var cusNameEl = document.querySelector('.new-cus-name');
      if (cusNameEl) {
  var firstName = (oh && oh.customerFirstName) ? oh.customerFirstName : '';
  cusNameEl.textContent = firstName;
  console.log('[QuizFlow] ✓ Customer name set to:', firstName || '(empty)');
}

      if (!tableWrap) return;

      tableWrap.style.display = 'block';
      if (loading) loading.style.display = 'none';
      if (errorEl) errorEl.style.display = 'none';
      if (table)   table.style.display   = 'none';

      if (!oh || !oh.lastOrderDate) {
        if (errorEl) { errorEl.style.display = 'block'; errorEl.textContent = 'No recent order found.'; }
        return;
      }

      if (valDate)   valDate.textContent   = oh.lastOrderDate || '—';
      if (valInject) valInject.textContent = oh.injectionName || '—';

      if (oh.dose && doseRow && valDose) {
        valDose.textContent   = oh.dose;
        doseRow.style.display = '';
      } else if (doseRow) {
        doseRow.style.display = 'none';
      }

      if (table) table.style.display = 'table';

      console.log('[QuizFlow] ✓ Order history table populated');

    } catch(e) {
      console.error('[QuizFlow] Order history display failed:', e);
    }
  }

  /* Run immediately if already visible */
  if (sec.style.display !== 'none' && sec.style.display !== '') {
    populateOrderTable();
  }

  /* Watch for when QuizFlow shows this step */
  var observer = new MutationObserver(function() {
    var isVisible = sec.style.display !== 'none' && sec.style.display !== '';
    if (isVisible) populateOrderTable();
  });

  observer.observe(sec, { attributes: true, attributeFilter: ['style'] });
}



  /* ─────────────────────────────────────────
     PROGRESS BAR
  ───────────────────────────────────────── */
  function updateProgressBar(stepId) {
    var progressSection = document.querySelector('[class*="progress_bar"]');
    if (!progressSection) return;
    var bar1  = progressSection.querySelector('.progressbar-first .progress-bar-active');
    var bar2  = progressSection.querySelector('.progressbar-second .progress-bar-active');
    var wrap1 = progressSection.querySelector('.progressbar-first');
    var wrap2 = progressSection.querySelector('.progressbar-second');
    if (HIDDEN_STEPS.indexOf(stepId) !== -1) { progressSection.style.display = 'none'; return; }
    progressSection.style.display = '';
    var p1 = PHASE1_STEPS.indexOf(stepId);
    var p2 = PHASE2_STEPS.indexOf(stepId);
    if (p1 !== -1) {
      var pct1 = Math.round(((p1 + 1) / PHASE1_STEPS.length) * 100);
      if (bar1) bar1.style.width = pct1 + '%'; if (bar2) bar2.style.width = '0%';
      if (wrap1) wrap1.style.opacity = '1'; if (wrap2) wrap2.style.opacity = '1';
    } else if (p2 !== -1) {
      var pct2 = Math.round(((p2 + 1) / PHASE2_STEPS.length) * 100);
      if (bar1) bar1.style.width = '100%'; if (bar2) bar2.style.width = pct2 + '%';
      if (wrap1) wrap1.style.opacity = '1'; if (wrap2) wrap2.style.opacity = '1';
    }
  }

  /* ─────────────────────────────────────────
     INPUT VALIDATION
  ───────────────────────────────────────── */
  function setupInputValidation(sec) {
    var allInputs = sec.querySelectorAll('input.inp-place, input[class*="wt-inp"], input.gp-inp');
    if (!allInputs.length) return;
    var btn = sec.querySelector('button');
    if (!btn) return;

    function checkInputs() {
      var valid = true;
      allInputs.forEach(function (inp) {
        var panel = inp.closest('[class*="wt-tab-inputs"]');
        if (panel && panel.classList.contains('hidden')) return;
        if (inp.value.trim() === '') valid = false;
      });
      if (valid) { btn.classList.remove('qf-btn-disabled'); btn.disabled = false; }
      else       { btn.classList.add('qf-btn-disabled');    btn.disabled = true;  }
    }

    checkInputs();
    allInputs.forEach(function (inp) {
      inp.addEventListener('input',  checkInputs);
      inp.addEventListener('change', checkInputs);
    });
    sec.querySelectorAll('[class*="wt-unit-tab"], [class*="gp-id-tab"]').forEach(function (tab) {
      tab.addEventListener('click', function () { setTimeout(checkInputs, 50); });
    });
  }

  /* ─────────────────────────────────────────
     WEIGHT COLLECTION — sec-step
  ───────────────────────────────────────── */
  function collectWeightData() {
    var sec = document.querySelector('.new-qes-section[data-step="sec-step"]');
    if (!sec) return;

    var activeTab = sec.querySelector('[class*="wt-unit-tab"][class*="active"], [class*="wt-unit-tab"].active');
    var tabLabel  = activeTab ? activeTab.textContent.trim().toLowerCase() : 'st/lb';

    var activePanel = sec.querySelector('[class*="wt-tab-inputs"]:not(.hidden)');
    if (!activePanel) return;

    var inputs = activePanel.querySelectorAll('input[class*="wt-inp"]');
    var val1   = inputs[0] ? parseFloat(inputs[0].value) || 0 : 0;
    var val2   = inputs[1] ? parseFloat(inputs[1].value) || 0 : 0;

    if (tabLabel === 'kg') {
      quizData.weightKg      = val1;
      quizData.weightDisplay = val1;
      quizData.weightUnit    = 'kg';
    } else {
      var totalLbs           = (val1 * 14) + val2;
      quizData.weightKg      = totalLbs * 0.453592;
      quizData.weightDisplay = totalLbs;
      quizData.weightUnit    = 'lbs';
    }

    console.log('[QuizFlow] ✓ Weight collected:', quizData.weightDisplay, quizData.weightUnit, '|', quizData.weightKg.toFixed(1), 'kg');
  }

  // Add this new function
function initPerStepOverride() {
  var n1stStepSec = document.querySelector('.new-qes-section[data-step="n-1st-step"]');
  if (!n1stStepSec) return;

  var perStepRadio = n1stStepSec.querySelector('input.qes-inp[next-step="per-step"]');
  if (!perStepRadio) return;

  var card = perStepRadio.closest('.single-qes');
  if (!card) return;

  card.addEventListener('click', function() {

    // eig-step: radio with next-step="ten-step" → ele-step
    var eigStepSec = document.querySelector('.new-qes-section[data-step="eig-step"]');
    if (eigStepSec) {
      var tenRadio = eigStepSec.querySelector('input.qes-inp[next-step="ten-step"]');
      if (tenRadio) tenRadio.setAttribute('next-step', 'ele-step');
    }

    // nin-step: radio with next-step="ten-step" → ele-step
    var ninStepSec = document.querySelector('.new-qes-section[data-step="nin-step"]');
    if (ninStepSec) {
      var tenRadioNin = ninStepSec.querySelector('input.qes-inp[next-step="ten-step"]');
      if (tenRadioNin) tenRadioNin.setAttribute('next-step', 'ele-step');
    }

    console.log('[QuizFlow] "per-step" selected → ten-step radios in eig-step & nin-step overridden to ele-step');
  });
}

  /* ─────────────────────────────────────────
     HEIGHT COLLECTION — thir-step
  ───────────────────────────────────────── */
  function collectHeightData() {
    var sec = document.querySelector('.new-qes-section[data-step="thir-step"]');
    if (!sec) return;

    var activeTab = sec.querySelector('[class*="wt-unit-tab"][class*="active"], [class*="wt-unit-tab"].active');
    var tabLabel  = activeTab ? activeTab.textContent.trim().toLowerCase() : 'cm';

    var activePanel = sec.querySelector('[class*="wt-tab-inputs"]:not(.hidden)');
    if (!activePanel) return;

    var inputs = activePanel.querySelectorAll('input[class*="wt-inp"]');
    var val1   = inputs[0] ? parseFloat(inputs[0].value) || 0 : 0;
    var val2   = inputs[1] ? parseFloat(inputs[1].value) || 0 : 0;

    if (tabLabel === 'cm') {
      quizData.heightCm = val1;
    } else {
      quizData.heightCm = (val1 * 30.48) + (val2 * 2.54);
    }

    console.log('[QuizFlow] ✓ Height collected:', quizData.heightCm.toFixed(1), 'cm');
  }

  /* ─────────────────────────────────────────
     BMI STEP — four-step
     ★ FIX: Only saves BMI score + eligibility.
       No loss amount / target weight in cart.
  ───────────────────────────────────────── */
  function handleBmiStep() {
    var sec = document.querySelector('.new-qes-section[data-step="four-step"]');
    if (!sec) return;

    collectWeightData();
    collectHeightData();

    var weightKg = quizData.weightKg  || 0;
    var heightCm = quizData.heightCm  || 0;
    var heightM  = heightCm / 100;

    var bmi = 0;
    if (heightM > 0 && weightKg > 0) {
      bmi = Math.round((weightKg / (heightM * heightM)) * 10) / 10;
    }

    sec.setAttribute('cal-bmi', bmi);

    var minBmi       = parseFloat(sec.getAttribute('min-bmi'))    || 0;
    var maxBmi       = parseFloat(sec.getAttribute('max-bmi'))    || 999;
    var eligibleStep = (sec.getAttribute('eligible-step') || '').trim();
    var nextStep     = (sec.getAttribute('next-step')     || '').trim();

    console.log('[QuizFlow] BMI:', bmi, '| min:', minBmi, '| max:', maxBmi);

    var destination = (bmi >= minBmi && bmi <= maxBmi) ? nextStep : eligibleStep;

    /* Update topbar */
    var topbarValue = sec.querySelector('[class*="bmi-topbar-value"]');
    if (topbarValue) topbarValue.innerHTML = bmi + '<span></span>';

    /* ★ Save ONLY BMI score + height + weight — no loss/target */
    quizAnswers.bmi = {
      bmi:      bmi,
      eligible: (bmi >= minBmi && bmi <= maxBmi),
      weight:   Math.round(quizData.weightDisplay || 0) + quizData.weightUnit,
      weightKg: Math.round((quizData.weightKg || 0) * 10) / 10 + 'kg',
      heightCm: Math.round(quizData.heightCm || 0) + 'cm'
    };
    saveQuizAnswers();

    setTimeout(updateBmiChart, 50);

    /* Wire CONTINUE button */
    var continueBtn = sec.querySelector('button');
    if (continueBtn) {
      var newBtn = continueBtn.cloneNode(true);
      continueBtn.parentNode.replaceChild(newBtn, continueBtn);
      newBtn.addEventListener('click', function () {
        console.log('[QuizFlow] CONTINUE clicked → going to:', destination);
        showStep(destination, 'forward');
      });
    }
  }

  /* ─────────────────────────────────────────
     BMI CHART
  ───────────────────────────────────────── */
  function updateBmiChart() {
    if (!quizData.weightDisplay) return;
    var canvas = document.querySelector('[id^="bmiChart-"]');
    if (!canvas) return;

    var startWeight = quizData.weightDisplay;
    var lossDisplay = Math.round(startWeight * 0.20);
    var endWeight   = startWeight - lossDisplay;

    var topbarValue = document.querySelector('[class*="bmi-topbar-valuee"]');
    if (topbarValue) {
      topbarValue.innerHTML = Math.round(startWeight) + '<span>' + quizData.weightUnit + '</span>';
    }

    var lossPill = document.querySelector('[class*="bmi-loss-pill"]');
    if (lossPill) lossPill.textContent = lossDisplay + quizData.weightUnit;

    var existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    var ctx = canvas.getContext('2d');

    var data = [
      startWeight,
      startWeight - (startWeight - endWeight) * 0.08,
      startWeight - (startWeight - endWeight) * 0.30,
      startWeight - (startWeight - endWeight) * 0.75,
      endWeight
    ];

    var gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0,   'rgba(140,120,180,0.6)');
    gradient.addColorStop(0.5, 'rgba(180,160,140,0.4)');
    gradient.addColorStop(1,   'rgba(255,230,100,0.7)');

    var startIdx = 0;
    var midIdx   = 3;
    var unit     = quizData.weightUnit;
    var sw       = Math.round(startWeight);

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Start', 'Month 2', 'Month 4', 'Month 8', 'Month 12'],
        datasets: [{
          data: data,
          fill: true,
          backgroundColor: gradient,
          borderColor: 'transparent',
          tension: 0.5,
          pointRadius: function(c) {
            return (c.dataIndex === startIdx || c.dataIndex === midIdx) ? 5 : 0;
          },
          pointBackgroundColor: '#FFF',
          pointBorderColor:     '#4C3E79',
          pointBorderWidth:     2
        }]
      },
      plugins: [{
        id: 'customTooltipBoxes',
        afterDatasetsDraw: function(chart) {
          var c    = chart.ctx;
          var meta = chart.getDatasetMeta(0);
          function drawBox(idx, label) {
            var pt = meta.data[idx];
            if (!pt) return;
            var x = pt.x, y = pt.y;
            var bW = 52, bH = 24;
            var bX = x - bW / 2, bY = y - bH - 10;
            c.save();
            c.fillStyle = '#4C3E79';
            c.beginPath();
            if (c.roundRect) c.roundRect(bX, bY, bW, bH, 6);
            else c.rect(bX, bY, bW, bH);
            c.fill();
            c.beginPath();
            c.moveTo(x - 5, bY + bH); c.lineTo(x + 5, bY + bH); c.lineTo(x, bY + bH + 6);
            c.closePath(); c.fill();
            c.fillStyle = '#FFF';
            c.font = 'bold 11px -apple-system, sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(label, x, bY + bH / 2);
            c.restore();
          }
          drawBox(startIdx, sw + unit);
          drawBox(midIdx,   Math.round(data[midIdx]) + unit);
        }
      }],
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 40, left: 4, right: 4, bottom: 0 } },
        scales: {
          x: { display: false },
          y: { display: true, grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false }, ticks: { display: false }, border: { display: false } }
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        elements: { line: { borderWidth: 0 } }
      }
    });
  }

  /* ─────────────────────────────────────────
     POPUP HELPERS
  ───────────────────────────────────────── */
  function getAllPopups() { return document.querySelectorAll('[popup-name]'); }

  function hideAllPopups() {
    getAllPopups().forEach(function (p) {
      p.classList.remove('qf-popup-open');
      if (p.style.display && p.style.display !== 'none') p.style.display = '';
    });
  }

  function showPopup(popupName, triggerStepId) {
    if (!popupName || !popupName.trim()) return;
    popupName = popupName.trim();
    var found = false;
    getAllPopups().forEach(function (el) {
      if (el.getAttribute('popup-name') === popupName) { el.classList.add('qf-popup-open'); found = true; }
    });
    if (found) savePopupOpen(popupName, triggerStepId || getCurrentStepId());
    else console.warn('[QuizFlow] No popup with popup-name="' + popupName + '"');
  }

  /* ─────────────────────────────────────────
     SECTION NAVIGATION
  ───────────────────────────────────────── */
  function hideAllSections() {
    document.querySelectorAll('.new-qes-section[data-step]').forEach(function (s) {
      s.style.setProperty('display', 'none', 'important');
    });
  }

  function revealSection(sec, direction) {
  sec.style.setProperty('display', 'block', 'important');
  sec.classList.remove('qf-animate-in', 'qf-animate-back');
  void sec.offsetWidth;
  sec.classList.add(direction === 'back' ? 'qf-animate-back' : 'qf-animate-in');

  /* ── Fix: remove animation class after it ends so position:fixed works ── */
  sec.addEventListener('animationend', function handler() {
    sec.classList.remove('qf-animate-in', 'qf-animate-back');
    sec.removeEventListener('animationend', handler);
  });
}

 function showStep(stepId, direction) {
  if (!stepId || !stepId.trim()) return;
  stepId    = stepId.trim();
  direction = direction || 'forward';

   if (stepId === 'consent-step') {
    var fixedBtn = document.querySelector('[id^="pc-submit-fixed-"]');
    if (fixedBtn && fixedBtn.parentElement !== document.body) {
      document.body.appendChild(fixedBtn);
    }
  }

  /* ── Update URL with current step name, no page reload ── */
  try {
    var url = new URL(window.location.href);
    url.searchParams.set('step', stepId);
    history.replaceState(null, '', url.toString());
  } catch(e) {}

  if (direction === 'forward') {
    saveCurrentStepInputs();
    var current = document.querySelector(
      '.new-qes-section[data-step][style*="block"],' +
      '.new-qes-section[data-step][style*="flex"]'
    );
    if (current && current.getAttribute('data-step') !== stepId) {
      stepHistory.push(current.getAttribute('data-step'));
    }
  }

  if (stepId === 'four-step' && direction === 'forward') handleBmiStep();

  var found = false;
  document.querySelectorAll('.new-qes-section[data-step]').forEach(function (sec) {
    if (sec.getAttribute('data-step') === stepId) {
      hideAllSections();
      hideAllPopups();
      revealSection(sec, direction);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      updateProgressBar(stepId);
      recordStepVisit(stepId);
      updateBackButton();
      found = true;
    }
  });

  if (!found) console.warn('[QuizFlow] No section with data-step="' + stepId + '"');
}

  function goBack() {
    if (stepHistory.length === 0) return;
    var prev = stepHistory.pop();
    hideAllSections();
    hideAllPopups();
    var target = document.querySelector('.new-qes-section[data-step="' + prev + '"]');
    if (target) {
      revealSection(target, 'back');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      updateProgressBar(prev);
      updateBackButton();

      /* ── Update URL to reflect previous step ── */
      try {
        var url = new URL(window.location.href);
        url.searchParams.set('step', prev);
        history.replaceState(null, '', url.toString());
      } catch(e) {}
    }
  }

  /* ─────────────────────────────────────────
     RADIO SELECTION
  ───────────────────────────────────────── */
  function handleOptionSelect(card) {
    var radio = card.querySelector('input.qes-inp[type="radio"]');
    if (!radio) return;
    var parentSection = card.closest('.new-qes-section');
    if (!parentSection) return;

    parentSection.querySelectorAll('.single-qes').forEach(function (item) {
      item.classList.remove('qes-selected');
      var r = item.querySelector('input.qes-inp');
      if (r) r.checked = false;
    });

    radio.checked = true;
    card.classList.add('qes-selected');

    var labelEl = card.querySelector('.qes-text, [class*="qes-label"], [class*="option-text"], [class*="card-label"]');
    if (!labelEl) {
      var nodes = card.querySelectorAll('span, p, div');
      for (var i = 0; i < nodes.length; i++) {
        var t = nodes[i].textContent.trim();
        if (t && nodes[i].children.length === 0) { labelEl = nodes[i]; break; }
      }
    }
    var answerText = labelEl ? labelEl.textContent.trim() : (radio.value || radio.getAttribute('value') || '');

    saveRadioAnswer(parentSection, answerText);

    var nextStep  = (radio.getAttribute('next-step')  || '').trim();
    var popupStep = (radio.getAttribute('popup-step') || '').trim();
    var urlStep   = (radio.getAttribute('url')        || '').trim();

    /* ── If url attribute is set, navigate to that page ── */
    if (urlStep !== '') {
      setTimeout(function () {
    /* Save current step answer first */
    saveRadioAnswer(parentSection, answerText);
    saveQuizAnswers();

    /* Pass origin step in URL so new page doesn't reset */
    var dest = new URL(urlStep, window.location.origin);
    dest.searchParams.set('from', parentSection.getAttribute('data-step') || '');
    window.location.href = dest.toString();
  }, 220);
  return;
    }

    if (popupStep !== '') {
      var currentStepId = parentSection.getAttribute('data-step');
      setTimeout(function () { showPopup(popupStep, currentStepId); }, 150);
      return;
    }
    if (nextStep !== '') {
      setTimeout(function () { showStep(nextStep, 'forward'); }, 220);
    }
  }

  /* ─────────────────────────────────────────
     EVENT LISTENERS
  ───────────────────────────────────────── */
  function initRadios() {
    document.addEventListener('click', function (e) {
      var card = e.target.closest('.single-qes');
      if (card && card.closest('.new-qes-section')) handleOptionSelect(card);
    });
    document.addEventListener('change', function (e) {
      if (!e.target.matches('input.qes-inp[type="radio"]')) return;
      var card = e.target.closest('.single-qes');
      if (card) handleOptionSelect(card);
    });
  }

  function initButtons() {
    document.addEventListener('click', function (e) {

      /* ── 1. POPUP CLOSE ── */
      var closeBtn = e.target.closest('[popup-name] [class*="close"]');
      if (closeBtn) {
        var openName = getOpenPopupName();
        savePopupAction(openName, 'closed', '');
        hideAllPopups();
        return;
      }

      /* ── 2. POPUP NEXT/CONTINUE ── */
      var popupNextBtn = e.target.closest('[popup-name] [class*="next-btn"]');
      if (popupNextBtn) {
        var popupEl  = popupNextBtn.closest('[popup-name]');
        var pName    = popupEl.getAttribute('popup-name');
        var nextStep = (popupEl.getAttribute('next-step') || '').trim();
        var textarea  = popupEl.querySelector('textarea');
        var extraInfo = textarea ? textarea.value.trim() : '';
        savePopupAction(pName, 'continued', nextStep, extraInfo);
        hideAllPopups();
        if (nextStep) showStep(nextStep, 'forward');
        return;
      }

      /* ── 3. BUTTONS INSIDE data-step SECTIONS ── */
      var anyBtn = e.target.closest('button');
if (anyBtn && !anyBtn.disabled && !anyBtn.classList.contains('qf-btn-disabled')) {
  /* ★ Skip Phase 1 upload button — handled by initWeightPhotoUpload */
  if (anyBtn.id && anyBtn.id.indexOf('pcc-submit-fixed-') === 0) return;

  var sec = anyBtn.closest('.new-qes-section[data-step]');
  if (sec) {
    var stepId = sec.getAttribute('data-step');
    if (stepId === 'four-step') return;

    var cls = anyBtn.className || '';
    var isInternal  = cls.indexOf('wt-unit-tab') !== -1 || cls.indexOf('gp-id-tab') !== -1;
    var isGPSubmit  = cls.indexOf('gp-submit-btn') !== -1;
    var isEviSubmit = cls.indexOf('ue-submit-btn') !== -1;

    if (!isInternal && !isGPSubmit && !isEviSubmit) {
      var next = (sec.getAttribute('next-step') || '').trim();
      if (next) { showStep(next, 'forward'); return; }
    }
  }
}

      /* ── 4. PATIENT CONSENT fixed/mobile buttons ── */
      var consentBtn = e.target.closest('[id^="pc-submit-fixed-"],[id^="pc-submit-mobile-"]');
      if (consentBtn && !consentBtn.disabled) {
        var rawId      = consentBtn.id.replace('pc-submit-fixed-','').replace('pc-submit-mobile-','');
        var wrapper    = document.getElementById('shopify-section-' + rawId);
        var consentSec = wrapper ? wrapper.querySelector('.new-qes-section[data-step]') : null;
        if (consentSec) {
          var next = (consentSec.getAttribute('next-step') || '').trim();
          if (next) {
            saveCurrentStepInputs();
            quizAnswers.completedAt = new Date().toISOString();
            saveQuizAnswers();
            showStep(next, 'forward');
          }
        }
      }
    });
  }


  function updateBackButton() {
  var backBtns = document.querySelectorAll('.qes-back-btn');
  backBtns.forEach(function(backBtn) {
    if (stepHistory.length === 0) {
      backBtn.style.opacity       = '0';
      backBtn.style.pointerEvents = 'none';
    } else {
      backBtn.style.opacity       = '1';
      backBtn.style.pointerEvents = '';
    }
  });
}

  function initBackButton() {
  var backBtns = document.querySelectorAll('.qes-back-btn');
  if (!backBtns.length) return;
  backBtns.forEach(function(backBtn) {
    backBtn.style.cursor = 'pointer';
    backBtn.addEventListener('click', goBack);
  });
  updateBackButton();
}

  /* ─────────────────────────────────────────
     FILE UPLOAD SYSTEM
  ───────────────────────────────────────── */
  var UPLOAD_PROXY_URL = 'https://winter-sunset-dea7.ahsanikhlaq59.workers.dev';

  function getStagedTarget(file) {
    var mimeType = file.type || 'application/octet-stream';
    var filename = 'evidence_' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    return fetch(UPLOAD_PROXY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'staged', filename: filename, mimeType: mimeType, fileSize: file.size })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.ok) throw new Error('Step 1 failed: ' + data.error);
      return data.target;
    });
  }

  function uploadToStage(target, file) {
    var formData = new FormData();
    target.parameters.forEach(function(p) { formData.append(p.name, p.value); });
    formData.append('file', file);
    return fetch(target.url, { method: 'POST', body: formData })
    .then(function(res) {
      if (!res.ok && res.status !== 204) throw new Error('Step 2 failed: HTTP ' + res.status);
      return target.resourceUrl;
    });
  }

  function registerFile(resourceUrl, mimeType) {
    return fetch(UPLOAD_PROXY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'register', resourceUrl: resourceUrl, mimeType: mimeType })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.ok) throw new Error('Step 3 failed: ' + data.error);
      if (data.immediateUrl) data.file._immediateUrl = data.immediateUrl;
      return data.file;
    });
  }

  function pollFileReady(fileId, attempt) {
    attempt = attempt || 1;
    if (attempt > 20) return Promise.resolve('');
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        fetch(UPLOAD_PROXY_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ action: 'poll', fileId: fileId })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (!data.ok) throw new Error(data.error);
          if (data.url) resolve(data.url);
          else pollFileReady(fileId, attempt + 1).then(resolve).catch(reject);
        })
        .catch(function() {
          pollFileReady(fileId, attempt + 1).then(resolve).catch(reject);
        });
      }, 2000);
    });
  }

  function uploadToShopify(file) {
    return getStagedTarget(file)
      .then(function(target) {
        return uploadToStage(target, file).then(function(resourceUrl) {
          return registerFile(resourceUrl, file.type);
        });
      })
      .then(function(fileObj) {
        var immediateUrl = fileObj._immediateUrl || (fileObj.image && fileObj.image.url) || fileObj.url || '';
        if (immediateUrl) return immediateUrl;
        return pollFileReady(fileObj.id).then(function(url) {
          if (!url && fileObj.id) {
            setTimeout(function() {
              pollFileReady(fileObj.id, 1).then(function(retryUrl) {
                if (retryUrl) {
                  try {
                    var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                    if (stored.evidenceUpload) stored.evidenceUpload.uploadedUrl = retryUrl;
                    if (stored.steps && stored.steps['evi-step']) stored.steps['evi-step'].answer = retryUrl;
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
                  } catch(e) {}
                }
              });
            }, 15000);
          }
          return url;
        });
      });
  }

  /* ─────────────────────────────────────────
     WEIGHT PHOTO UPLOAD (consent-step)
     ★ FIX: Saves front + side as SEPARATE fields
  ───────────────────────────────────────── */
 function initWeightPhotoUpload() {
  var sec = document.querySelector('.new-qes-section[data-step="consent-step"]');
  if (!sec) return;

var frontInput  = document.querySelector('[id^="wp-input-front-"]');
  var sideInput   = document.querySelector('[id^="wp-input-side-"]');
var videoInput = null; /* video now handled by MediaRecorder — see _videoFile_ below */
var fixedBtn    = document.querySelector('[id^="pcc-submit-fixed-"]');
  var mobileWpBtn = document.querySelector('[id^="wp-submit-mobile-"]');

  if (!frontInput || !sideInput) return;

  var frontFile = null, sideFile = null, videoFile = null;
  var frontUrl  = '', sideUrl = '', videoUrl = '';

 function checkPhotoForm() {
    var hasFiles = frontFile && sideFile; // video optional
    [fixedBtn, mobileWpBtn].forEach(function(btn) {
      if (!btn) return;
     if (hasFiles) {
        btn.disabled = false;
        btn.classList.remove('qf-btn-disabled');
        btn.style.setProperty('opacity', '1', 'important');
        btn.style.setProperty('cursor', 'pointer', 'important');
        btn.style.setProperty('pointer-events', 'auto', 'important');
         btn.style.setProperty('background-color', 'rgb(76, 62, 121)', 'important');
      } else {
        btn.disabled = true;
        btn.classList.add('qf-btn-disabled');
        btn.style.opacity       = '0.45';
        btn.style.cursor        = 'not-allowed';
        btn.style.pointerEvents = 'none';
      }
    });
  }

checkPhotoForm(); // run on load — buttons start disabled

// Keep interval only to pick up recorded video if present (no longer required)
setInterval(function() {
  var sId = (document.querySelector('.new-qes-section[data-step="consent-step"]')
    ? document.querySelector('.new-qes-section[data-step="consent-step"]')
        .closest('[id^="shopify-section-"]').id.replace('shopify-section-','')
    : '');
  var recorded = window['_videoFile_' + sId] || null;
  if (recorded && recorded !== videoFile) {
    videoFile = recorded;
    // no checkPhotoForm() call — video doesn't affect button state
  }
}, 500);
  frontInput.addEventListener('change', function() {
    frontFile = this.files && this.files[0] ? this.files[0] : null;
    if (!frontFile) frontUrl = '';
    checkPhotoForm();
  });

  sideInput.addEventListener('change', function() {
    sideFile = this.files && this.files[0] ? this.files[0] : null;
    if (!sideFile) sideUrl = '';
    checkPhotoForm();
  });

  var frontRemove = document.querySelector('[id^="wp-remove-front-"]');
  var sideRemove  = document.querySelector('[id^="wp-remove-side-"]');

  if (videoInput) {
    videoInput.addEventListener('change', function() {
      videoFile = this.files && this.files[0] ? this.files[0] : null;
      if (!videoFile) videoUrl = '';
      checkPhotoForm();
    });
  }

  var videoRemove = document.querySelector('[id^="wp-remove-video-"]');
  if (videoRemove) videoRemove.addEventListener('click', function() {
    videoFile = null; videoUrl = '';
    checkPhotoForm();
  });

  if (frontRemove) frontRemove.addEventListener('click', function() {
    frontFile = null; frontUrl = ''; checkPhotoForm();
  });
  if (sideRemove) sideRemove.addEventListener('click', function() {
    sideFile = null; sideUrl = ''; checkPhotoForm();
  });

  function handlePhase1Submit(e) {
    var wpPhase = document.querySelector('[id^="wp-phase-"]');
    if (!wpPhase || wpPhase.style.display === 'none') return;
    if (!frontFile && !sideFile) { saveWeightPhotos('', '', ''); return; }

    e.stopImmediatePropagation();
    var btn = e.currentTarget;
    var origText = btn.textContent;
    btn.disabled = true; btn.textContent = 'Uploading...';

    var frontPromise = frontFile ? uploadToShopify(frontFile).then(function(url) { frontUrl = url; return url; }) : Promise.resolve('');
    var sidePromise  = sideFile  ? uploadToShopify(sideFile).then(function(url)  { sideUrl  = url; return url; }) : Promise.resolve('');
   var recordedVideo = window['_videoFile_' + /* sId */
  (document.querySelector('.new-qes-section[data-step="consent-step"]')
    ? document.querySelector('.new-qes-section[data-step="consent-step"]')
        .closest('[id^="shopify-section-"]').id.replace('shopify-section-','')
    : '')] || null;
videoFile = videoFile || recordedVideo;
var videoPromise = videoFile ? uploadToShopify(videoFile).then(function(url) { videoUrl = url; return url; }) : Promise.resolve('');

    Promise.all([frontPromise, sidePromise, videoPromise])
      .then(function(urls) {
        frontUrl = urls[0]; sideUrl = urls[1]; videoUrl = urls[2] || '';
        saveWeightPhotos(frontUrl, sideUrl, videoUrl);
        btn.textContent = '✓ Done!';
        setTimeout(function() {
          btn.disabled = false; btn.textContent = origText;
          var wpPhaseEl      = document.querySelector('[id^="wp-phase-"]');
          var consentPhaseEl = document.querySelector('[id^="consent-phase-"]');
          if (wpPhaseEl)      wpPhaseEl.style.display      = 'none';
          if (consentPhaseEl) consentPhaseEl.style.display = 'block';
          if (fixedBtn) { fixedBtn.textContent = 'YES I AGREE'; fixedBtn.disabled = true; fixedBtn.style.opacity = '1'; }
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 600);
      })
      .catch(function(err) {
  console.error('[QuizFlow] Weight photo upload FAILED:', err);
  btn.disabled = false;
  btn.textContent = origText;
  alert('Photo upload failed: ' + (err && err.message ? err.message : 'Please check your connection and try again.') + '\n\nPlease re-select your photos and try again.');
  /* ★ DO NOT proceed to consent phase — user must retry */
});
  }

  if (fixedBtn)    fixedBtn.addEventListener('click',    handlePhase1Submit, true);
  if (mobileWpBtn) mobileWpBtn.addEventListener('click', handlePhase1Submit, true);
}

  /* ★ FIX: Weight photos saved as SEPARATE fields */
  function saveWeightPhotos(frontUrl, sideUrl, videoUrl) {
    var stepId = 'consent-step';
    if (quizAnswers.stepOrder.indexOf(stepId) === -1) quizAnswers.stepOrder.push(stepId);
    if (!quizAnswers.steps[stepId]) quizAnswers.steps[stepId] = { stepId: stepId };

    quizAnswers.steps[stepId].stepId      = stepId;
    quizAnswers.steps[stepId].question    = 'Weight Verification Photos';
    quizAnswers.steps[stepId].answeredAt  = new Date().toISOString();
    quizAnswers.steps[stepId].frontPhotoUrl = frontUrl;
    quizAnswers.steps[stepId].sidePhotoUrl  = sideUrl;
    quizAnswers.steps[stepId].videoUrl      = videoUrl || '';
    delete quizAnswers.steps[stepId].inputValues;
    delete quizAnswers.steps[stepId].answer;

    quizAnswers.weightPhotos = {
      frontPhotoUrl: frontUrl,
      sidePhotoUrl:  sideUrl,
      videoUrl:      videoUrl || '',
      uploadedAt:    new Date().toISOString()
    };

    saveQuizAnswers();
    console.log('[QuizFlow] ✓ Weight photos saved — front:', frontUrl, '| side:', sideUrl, '| video:', videoUrl || 'none');
  }

  /* ─────────────────────────────────────────
     EVIDENCE UPLOAD (evi-step)
  ───────────────────────────────────────── */
  function saveEvidenceUpload(fileName, fileType, fileSize, uploadedUrl) {
    var stepId = 'evi-step';
    if (quizAnswers.stepOrder.indexOf(stepId) === -1) quizAnswers.stepOrder.push(stepId);
    if (!quizAnswers.steps[stepId]) quizAnswers.steps[stepId] = { stepId: stepId };
    quizAnswers.steps[stepId].stepId      = stepId;
    quizAnswers.steps[stepId].question    = 'Please Upload Evidence Of Previous Use';
    quizAnswers.steps[stepId].answer      = uploadedUrl;
    quizAnswers.steps[stepId].answeredAt  = new Date().toISOString();
    delete quizAnswers.steps[stepId].inputValues;
    quizAnswers.evidenceUpload = { fileName: fileName, fileType: fileType, fileSizeKb: Math.round(fileSize / 1024) + 'kb', uploadedUrl: uploadedUrl, uploadedAt: new Date().toISOString() };
    saveQuizAnswers();
  }

  function initEvidenceUpload() {
    var fileInput  = document.querySelector('[class*="ue-file-input"]');
    var submitBtn  = document.querySelector('[class*="ue-submit-btn"]');
    var defaultUI  = document.querySelector('[class*="ue-default-ui"]');
    var previewUI  = document.querySelector('[class*="ue-preview"]');
    var previewImg = document.querySelector('[class*="ue-preview-img"]');
    var previewName= document.querySelector('[class*="ue-preview-name"]');
    var removeBtn  = document.querySelector('[class*="ue-preview-remove"]');
    var dropzone   = document.querySelector('[class*="ue-card"]');

    if (!fileInput || !submitBtn) return;

    var selectedFile = null;

    fileInput.addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;
      selectedFile = file;
      if (previewName) previewName.textContent = file.name;
      if (previewImg && file.type.indexOf('image/') === 0) {
        var reader = new FileReader();
        reader.onload = function(ev) { previewImg.src = ev.target.result; previewImg.style.display = 'block'; };
        reader.readAsDataURL(file);
      } else if (previewImg) previewImg.style.display = 'none';
      if (defaultUI) defaultUI.style.display = 'none';
      if (previewUI) previewUI.style.display  = 'flex';
      submitBtn.disabled = false; submitBtn.style.opacity = '1'; submitBtn.style.cursor = 'pointer';
    });

    if (dropzone) {
      dropzone.addEventListener('dragover',  function(e) { e.preventDefault(); dropzone.style.borderColor = '#4C3E79'; });
      dropzone.addEventListener('dragleave', function()  { dropzone.style.borderColor = ''; });
      dropzone.addEventListener('drop', function(e) {
        e.preventDefault(); dropzone.style.borderColor = '';
        var file = e.dataTransfer && e.dataTransfer.files[0];
        if (file) { var dt = new DataTransfer(); dt.items.add(file); fileInput.files = dt.files; fileInput.dispatchEvent(new Event('change')); }
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', function() {
        selectedFile = null; fileInput.value = '';
        if (previewImg)  { previewImg.src = ''; previewImg.style.display = 'none'; }
        if (previewName) previewName.textContent = '';
        if (defaultUI)   defaultUI.style.display = 'block';
        if (previewUI)   previewUI.style.display  = 'none';
        submitBtn.disabled = true; submitBtn.style.opacity = '0.45'; submitBtn.style.cursor = 'not-allowed';
      });
    }

    submitBtn.disabled = true; submitBtn.style.opacity = '0.45'; submitBtn.style.cursor = 'not-allowed';

    submitBtn.addEventListener('click', function() {
      if (!selectedFile) return;
      var sec = document.querySelector('.new-qes-section[data-step="evi-step"]');
      var nextStep = sec ? (sec.getAttribute('next-step') || '').trim() : '';
      var origText = submitBtn.textContent;
      submitBtn.disabled = true; submitBtn.textContent = 'Uploading...'; submitBtn.style.opacity = '0.7';

      uploadToShopify(selectedFile)
        .then(function(url) {
          saveEvidenceUpload(selectedFile.name, selectedFile.type, selectedFile.size, url);
          submitBtn.textContent = '✓ Uploaded!'; submitBtn.style.opacity = '1'; submitBtn.style.background = '#2e7d32';
          setTimeout(function() { if (nextStep) showStep(nextStep, 'forward'); }, 600);
        })
        .catch(function(err) {
  console.error('[QuizFlow] Evidence upload FAILED:', err);
  submitBtn.disabled = false;
  submitBtn.textContent = origText;
  submitBtn.style.opacity = '1';
  alert('Evidence upload failed: ' + (err && err.message ? err.message : 'Please check your connection and try again.') + '\n\nPlease re-select your file and try again.');
  /* ★ nextStep is NOT called — user stays on this step */
});
    });
  }

  /* ─────────────────────────────────────────
     GP SECTION UPLOAD
     ★ FIX: Saves ALL text fields as named key-value
       pairs PLUS the ID image URL separately
  ───────────────────────────────────────── */
  function initGPUpload() {
    var gpSections = document.querySelectorAll('.new-qes-section[data-step]');

    gpSections.forEach(function(sec) {
      var stepId    = sec.getAttribute('data-step');
      var fileInput = sec.querySelector('[id^="gp-file-"]');
      var submitBtn = sec.querySelector('[class*="gp-submit-btn-"]');

      if (!fileInput || !submitBtn) return;

      var selectedFile   = null;
      var selectedIdType = '';

      submitBtn.disabled = true;
      submitBtn.classList.add('qf-btn-disabled');
      submitBtn.style.opacity = '0.45';
      submitBtn.style.cursor  = 'not-allowed';

      function checkGPForm() {
  var allFilled = true;
  sec.querySelectorAll('[class*="gp-inp-"]').forEach(function(inp) {
    // Skip NHS Number — it's optional
    if ((inp.getAttribute('placeholder') || '').toLowerCase().indexOf('nhs') !== -1) return;
    if (inp.value.trim() === '') allFilled = false;
  });
  // if (fileInput && !selectedFile) allFilled = false;
  if (allFilled) {
    submitBtn.disabled = false; submitBtn.classList.remove('qf-btn-disabled');
    submitBtn.style.opacity = '1'; submitBtn.style.cursor = 'pointer';
  } else {
    submitBtn.disabled = true; submitBtn.classList.add('qf-btn-disabled');
    submitBtn.style.opacity = '0.45'; submitBtn.style.cursor = 'not-allowed';
  }
}

      sec.querySelectorAll('[class*="gp-inp-"]').forEach(function(inp) {
        inp.addEventListener('input',  checkGPForm);
        inp.addEventListener('change', checkGPForm);
      });

      var tabs = sec.querySelectorAll('[class*="gp-id-tab-"]');
      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() { selectedIdType = tab.textContent.trim(); });
      });
      if (!selectedIdType && tabs.length) selectedIdType = tabs[0].textContent.trim();

      fileInput.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;
        selectedFile = file;
        checkGPForm();

        var previewImg  = sec.querySelector('[id^="gp-preview-img-"]');
        var previewName = sec.querySelector('[id^="gp-preview-name-"]');
        var defaultUi   = sec.querySelector('[id^="gp-default-ui-"]');
        var previewUi   = sec.querySelector('[id^="gp-preview-ui-"]');

        if (file.type.indexOf('image/') === 0) {
          var reader = new FileReader();
          reader.onload = function(ev) {
            if (previewImg)  { previewImg.src = ev.target.result; previewImg.style.display = 'block'; }
            if (previewName) previewName.textContent = file.name;
            if (defaultUi)   defaultUi.style.display = 'none';
            if (previewUi)   previewUi.style.display  = 'flex';
          };
          reader.readAsDataURL(file);
        } else {
          if (previewName) previewName.textContent = file.name;
          if (defaultUi)   defaultUi.style.display = 'none';
          if (previewUi)   previewUi.style.display  = 'flex';
        }
      });

      var removeBtn = sec.querySelector('[id^="gp-remove-"]');
      if (removeBtn) {
        removeBtn.addEventListener('click', function() {
          selectedFile = null; fileInput.value = '';
          var previewImg  = sec.querySelector('[id^="gp-preview-img-"]');
          var previewName = sec.querySelector('[id^="gp-preview-name-"]');
          var defaultUi   = sec.querySelector('[id^="gp-default-ui-"]');
          var previewUi   = sec.querySelector('[id^="gp-preview-ui-"]');
          if (previewImg)  { previewImg.src = ''; previewImg.style.display = 'none'; }
          if (previewName) previewName.textContent = '';
          if (defaultUi)   defaultUi.style.display = '';
          if (previewUi)   previewUi.style.display  = 'none';
          checkGPForm();
        });
      }

      var dropzone = sec.querySelector('[id^="gp-dropzone-"]');
      if (dropzone) {
        dropzone.addEventListener('dragover',  function(e) { e.preventDefault(); dropzone.style.borderColor = '#4C3E79'; });
        dropzone.addEventListener('dragleave', function()  { dropzone.style.borderColor = ''; });
        dropzone.addEventListener('drop', function(e) {
          e.preventDefault(); dropzone.style.borderColor = '';
          var file = e.dataTransfer && e.dataTransfer.files[0];
          if (file) { var dt = new DataTransfer(); dt.items.add(file); fileInput.files = dt.files; fileInput.dispatchEvent(new Event('change')); }
        });
      }

      submitBtn.addEventListener('click', function() {
        if (submitBtn.disabled || submitBtn.classList.contains('qf-btn-disabled')) return;

        var nextStep = (sec.getAttribute('next-step') || '').trim();

        /* Collect GP text fields — placeholder as label */
        var fieldValues = {};
        sec.querySelectorAll('[class*="gp-inp-"]').forEach(function(inp) {
          var label = inp.getAttribute('placeholder') || inp.getAttribute('name') || 'field';
          if (inp.value.trim()) fieldValues[label] = inp.value.trim();
        });

        /* ★ FIX: Remove 'unit' key if it crept in — replace with ID Type */
        delete fieldValues['unit'];

        /* ★ FIX: Active ID type detection — try 4 methods in order */
        var foundIdType = '';

        /* Method 1: element has class ending in 'active' or contains word 'active' */
        sec.querySelectorAll('[class*="gp-id-tab-"]').forEach(function(t) {
          var cls = t.getAttribute('class') || '';
          if (cls.split(' ').indexOf('active') !== -1) foundIdType = t.textContent.trim();
        });

        /* Method 2: tracked variable from tab click listener */
        if (!foundIdType) foundIdType = selectedIdType || '';

        /* Method 3: first tab as default (Passport) */
        if (!foundIdType) {
          var firstTab = sec.querySelector('[class*="gp-id-tab-"]');
          if (firstTab) foundIdType = firstTab.textContent.trim();
        }

        console.log('[QuizFlow] GP ID type detected:', foundIdType);
        if (foundIdType) fieldValues['ID Type'] = foundIdType;

        if (!selectedFile) {
          saveGPData(stepId, sec, fieldValues, '');
          if (nextStep) showStep(nextStep, 'forward');
          return;
        }

        var origText = submitBtn.textContent;
        submitBtn.disabled = true; submitBtn.style.opacity = '0.7';
        submitBtn.textContent = 'Uploading ID...';

        /* ★ FIX: Capture all field values including ID type into a plain object */
        var capturedFields = JSON.parse(JSON.stringify(fieldValues));

        uploadToShopify(selectedFile)
          .then(function(url) {
            /* ★ Build final object fresh so ID Image URL is guaranteed present */
            var finalFields = JSON.parse(JSON.stringify(capturedFields));
            finalFields['ID Image URL'] = url || '';
            console.log('[QuizFlow] GP image URL saved:', url);
            console.log('[QuizFlow] Final GP fields:', finalFields);
            saveGPData(stepId, sec, finalFields, url);
            submitBtn.textContent = '✓ Done!'; submitBtn.style.opacity = '1';
            setTimeout(function() {
              submitBtn.disabled = false; submitBtn.textContent = origText;
              if (nextStep) showStep(nextStep, 'forward');
            }, 600);
          })
          .catch(function(err) {
  console.error('[QuizFlow] GP image upload FAILED:', err);
  /* ★ Clear the bad URL — don't save "Upload failed" string as URL */
  delete capturedFields['ID Image URL'];
  saveGPData(stepId, sec, capturedFields, '');
  submitBtn.disabled = false;
  submitBtn.textContent = origText;
  submitBtn.style.opacity = '1';
  alert('ID image upload failed: ' + (err && err.message ? err.message : 'Please check your connection and try again.') + '\n\nPlease re-select your ID image and try again.');
  /* ★ DO NOT call showStep — user stays here to retry */
});
      });

      checkGPForm();
    });
  }

  /* ★ FIX: saveGPData — stores each field as a named inputValue */
  function saveGPData(stepId, sec, fieldValues, imageUrl) {
    if (!stepId) return;
    if (quizAnswers.stepOrder.indexOf(stepId) === -1) quizAnswers.stepOrder.push(stepId);
    if (!quizAnswers.steps[stepId]) quizAnswers.steps[stepId] = { stepId: stepId };

    quizAnswers.steps[stepId].stepId      = stepId;
    quizAnswers.steps[stepId].question    = getQuestionText(sec) || 'GP Information';
    quizAnswers.steps[stepId].inputValues = fieldValues;
    quizAnswers.steps[stepId].answeredAt  = new Date().toISOString();
    /* Don't set .answer to imageUrl — keep image URL inside inputValues only */
    delete quizAnswers.steps[stepId].answer;

    saveQuizAnswers();
    console.log('[QuizFlow] ✓ GP data saved:', fieldValues);
  }

  /* ─────────────────────────────────────────
     DOB VALIDATION
  ───────────────────────────────────────── */
  function initDOBValidation() {
    document.querySelectorAll('.new-qes-section[data-step]').forEach(function (sec) {
      var dobInput = sec.querySelector('input[type="date"][min-age]');
      if (!dobInput) return;
      var btn        = sec.querySelector('button');
      if (!btn) return;
      var nonEliStep = (dobInput.getAttribute('non-eli-step') || '').trim();
      var minAge     = parseInt(dobInput.getAttribute('min-age'), 10) || 18;
      var maxAge     = parseInt(dobInput.getAttribute('max-age'), 10) || 75;
      var nextStep   = (sec.getAttribute('next-step') || '').trim();

      btn.classList.add('qf-btn-disabled'); btn.disabled = true;

      dobInput.addEventListener('change', function () {
        if (dobInput.value) { btn.classList.remove('qf-btn-disabled'); btn.disabled = false; }
        else                { btn.classList.add('qf-btn-disabled');    btn.disabled = true;  }
      });

      btn.addEventListener('click', function (e) {
        e.stopImmediatePropagation();
        if (!dobInput.value) return;
        var today = new Date(), dob = new Date(dobInput.value);
        var age = today.getFullYear() - dob.getFullYear();
        var mDiff = today.getMonth() - dob.getMonth();
        var dDiff = today.getDate()  - dob.getDate();
        if (mDiff < 0 || (mDiff === 0 && dDiff < 0)) age--;

        /* Save DOB + age as clean answer */
        var dobFormatted = dobInput.value; /* YYYY-MM-DD */
        saveRadioAnswer(sec, dobFormatted + ' (age: ' + age + ')');

        if (age < minAge || age > maxAge) { if (nonEliStep) showStep(nonEliStep, 'forward'); }
        else                              { if (nextStep)   showStep(nextStep,   'forward'); }
      }, true);
    });
  }



  /* ─────────────────────────────────────────
   PATIENT CONSENT CHECKBOXES
   Enables submit button only when ALL
   pc-card-check boxes are checked
───────────────────────────────────────── */
function initConsentCheckboxes() {
  document.querySelectorAll('.new-qes-section[data-step]').forEach(function(sec) {
    var checkboxes = sec.querySelectorAll('input.pc-card-check[type="checkbox"]');
    if (!checkboxes.length) return;

    /* Find the fixed submit button scoped to this section's Shopify section ID */
    var sectionId  = sec.closest('[id^="shopify-section-"]');
    var rawId      = sectionId ? sectionId.id.replace('shopify-section-', '') : '';
    var submitBtn  = rawId
      ? document.getElementById('pc-submit-new-' + rawId)
      : sec.querySelector('[id^="pc-submit-new-"]');

    if (!submitBtn) return;

    function checkAllConsent() {
      var allChecked = true;
      checkboxes.forEach(function(cb) {
        if (!cb.checked) allChecked = false;
      });
      if (allChecked) {
        submitBtn.disabled      = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor  = 'pointer';
      } else {
        submitBtn.disabled      = true;
        submitBtn.style.opacity = '0.45';
        submitBtn.style.cursor  = 'not-allowed';
      }
    }

    checkAllConsent(); // run on load
    checkboxes.forEach(function(cb) {
      cb.addEventListener('change', checkAllConsent);
    });
  });
}


/* ─────────────────────────────────────────
   ORDER HISTORY CHECK — both step
   Checks if email has order in last 3 months
───────────────────────────────────────── */
function checkEmailOrderHistory(email, eligibleStep, notEligibleStep) {
  console.log('[QuizFlow] Checking order history for:', email);

  fetch('https://winter-sunset-dea7.ahsanikhlaq59.workers.dev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get_order', email: email })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    console.log('[QuizFlow] Order history response:', data);

    var hasRecentOrder = false;

    if (data.ok && data.orders && data.orders.length) {
      var threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      for (var i = 0; i < data.orders.length; i++) {
        var orderDate = new Date(data.orders[i].createdAt);
        if (orderDate >= threeMonthsAgo) {
          hasRecentOrder = true;
          console.log('[QuizFlow] Recent order found:', data.orders[i].name, data.orders[i].createdAt);
          break;
        }
      }
    }

    if (hasRecentOrder) {
      console.log('[QuizFlow] ✅ Recent order found (within 3 months) → going to:', eligibleStep);
      saveOrderHistoryData(data.orders); // ← save order data before navigating
      showStep(eligibleStep, 'forward');
    } else {
      console.log('[QuizFlow] ❌ No order within last 3 months → going to:', notEligibleStep);
      showStep(notEligibleStep, 'forward');
    }
  })
  .catch(function(err) {
    console.error('[QuizFlow] Order check failed:', err);
    // On error — go to not-eligible to be safe
    showStep(notEligibleStep, 'forward');
  });
}

/* ─────────────────────────────────────────
   SAVE ORDER HISTORY DATA
   Stores last order details into quizAnswers
───────────────────────────────────────── */
function saveOrderHistoryData(orders) {
  if (!orders || !orders.length) return;

  var lastOrder = orders[0];

  var d = new Date(lastOrder.createdAt);
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var formattedDate = d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();

  var injectionName = '';
  var dose          = '';

  if (lastOrder.lineItems && lastOrder.lineItems.nodes && lastOrder.lineItems.nodes.length) {
    var item = lastOrder.lineItems.nodes[0];
    injectionName = (item.variant && item.variant.product && item.variant.product.title)
                    ? item.variant.product.title
                    : (item.title || '');
    var combined = (item.variant ? item.variant.title : '') + ' ' + (item.title || '');
    var match    = combined.match(/(\d+\.?\d*\s?mg)/i);
    dose         = match ? match[1].trim() : '';
  }

  // ── Extract customer first name from order ──
  var customerFirstName = '';
  if (lastOrder.customer) {
    customerFirstName = lastOrder.customer.firstName
                     || (lastOrder.customer.displayName || '').split(' ')[0]
                     || '';
  }
  // Fallback: shipping address name
  if (!customerFirstName && lastOrder.shippingAddress) {
    customerFirstName = lastOrder.shippingAddress.firstName
                     || (lastOrder.shippingAddress.name || '').split(' ')[0]
                     || '';
  }
  // ────────────────────────────────────────────

  quizAnswers.orderHistory = {
    lastOrderDate:     formattedDate,
    lastOrderName:     lastOrder.name,
    injectionName:     injectionName,
    dose:              dose,
    orderId:           lastOrder.id,
    customerFirstName: customerFirstName,   // ← saved here
    fetchedAt:         new Date().toISOString()
  };

  saveQuizAnswers();
  console.log('[QuizFlow] ✓ Order history saved:', quizAnswers.orderHistory);
}

/* ─────────────────────────────────────────
   TEXTAREA BLOCKS
───────────────────────────────────────── */
function initTextareaBlocks() {
  document.querySelectorAll('[class*="qes-ta-btn-"]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var blockId  = btn.getAttribute('data-block');
      var ta       = document.getElementById('qes-ta-' + blockId);
      var nextStep = (btn.getAttribute('next-step') || '').trim();
      var sec      = btn.closest('.new-qes-section[data-step]');
      var answer   = ta ? ta.value.trim() : '';

      if (sec) saveRadioAnswer(sec, answer);
      if (nextStep) showStep(nextStep, 'forward');
    });
  });
}





  /* ─────────────────────────────────────────
     INIT
  ───────────────────────────────────────── */
  function init() {
  injectStyles();
  hideAllPopups();

  var sections = document.querySelectorAll('.new-qes-section[data-step]');

  if (sections.length === 0) {
    loadQuizAnswers();
    console.log('[QuizFlow] No quiz sections — data preserved.');
    return;
  }

  /* ── Check URL ?step= FIRST before deciding to reset ── */
  var urlParams = new URLSearchParams(window.location.search);
  var urlStep   = (urlParams.get('step') || '').trim();

  /* ── Check if THIS group owns the URL step ── */
  var thisGroupHasStep = false;
  sections.forEach(function(sec) {
    if (sec.getAttribute('data-step') === urlStep) thisGroupHasStep = true;
  });

  console.log('[QuizFlow] urlStep:', urlStep, '| thisGroupHasStep:', thisGroupHasStep);

  /* ── URL step exists but NOT in this group — bail immediately BEFORE hiding anything ── */
  if (urlStep !== '' && !thisGroupHasStep) {
  loadQuizAnswers();
  console.log('[QuizFlow] URL step "' + urlStep + '" not in this group — leaving DOM untouched.');
  return;
}

  /* ── Setup validation + hide all sections in THIS group only ── */
  sections.forEach(function(sec) {
    setupInputValidation(sec);
    sec.style.setProperty('display', 'none', 'important');
  });

  /* ── URL step IS in this group — preserve data and show it ── */
  if (urlStep !== '' && thisGroupHasStep) {
    loadQuizAnswers();
    console.log('[QuizFlow] URL step "' + urlStep + '" found in this group — preserving data.');

    var targetSec = document.querySelector('.new-qes-section[data-step="' + urlStep + '"]');
    if (targetSec) {
      targetSec.style.setProperty('display', 'block', 'important');
      updateProgressBar(urlStep);
      recordStepVisit(urlStep);
      try {
        var url = new URL(window.location.href);
        url.searchParams.set('step', urlStep);
        history.replaceState(null, '', url.toString());
      } catch(e) {}
    }

  /* ── No URL step at all — fresh start, show first section ── */
  } else {

    /* If we arrived from another page via url-step, preserve data */
    var fromStep = urlParams.get('from') || '';
    if (fromStep) {
      loadQuizAnswers();
      console.log('[QuizFlow] Arrived from "' + fromStep + '" — data preserved.');

      /* Show first section of this page */
      var firstSec = sections[0];
      if (firstSec) {
        firstSec.style.setProperty('display', 'block', 'important');
        var firstStepId = firstSec.getAttribute('data-step');
        updateProgressBar(firstStepId);
        recordStepVisit(firstStepId);
        try {
          var url = new URL(window.location.href);
          url.searchParams.set('step', firstStepId);
          history.replaceState(null, '', url.toString());
        } catch(e) {}
      }

    } else {
      resetQuizAnswers();

      var entryStep  = null;
      var entryFound = false;
      sections.forEach(function(sec) {
        if (!entryFound) {
          entryStep  = sec.getAttribute('data-step');
          entryFound = true;
          sec.style.setProperty('display', 'block', 'important');
          updateProgressBar(entryStep);
          recordStepVisit(entryStep);
          try {
            var url = new URL(window.location.href);
            url.searchParams.set('step', entryStep);
            history.replaceState(null, '', url.toString());
          } catch(e) {}
        }
      });

      console.log('[QuizFlow] Fresh start — entry: ' + entryStep);
    }

  } // ← closes the outer else

  initRadios();
  initButtons();
  initBackButton();
  initAutoPlan();
  initEvidenceUpload();
  initGPUpload();
  initDOBValidation();
  initWeightPhotoUpload();
  initPerStepOverride();
  initOrderHistoryDisplay();
  initTextareaBlocks();
  initConsentCheckboxes();

  console.log('[QuizFlow] Ready — ' + sections.length + ' sections');
}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.QuizFlow = {
    goTo:         function (id)   { showStep(id, 'forward'); },
    showPopup:    function (name) { showPopup(name); },
    hidePopups:   hideAllPopups,
    back:         goBack,
    getAnswers:   function () { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (e) { return {}; } },
    clearAnswers: function () { localStorage.removeItem(STORAGE_KEY); }
  };

})();