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

  var ALL_STEPS = [
    'step-start','first-step', 'pl-step','2-nd step','3rd-step',
    '4-th step','5th-step','6th-step','7th-step',
    '8th-step','9th-step',
  ];

  var HIDDEN_STEPS = ['step-start', '9th-step'];

  var quizData = {
    weightKg:      null,
    weightUnit:    'kg',
    weightDisplay: null
  };

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
      if (raw) {
        var parsed = JSON.parse(raw);
        quizAnswers = parsed;
      }
    } catch (e) {
      console.warn('[QuizFlow] Could not load existing answers:', e);
    }
  }

  /* ─────────────────────────────────────────────────────────
     TEXT EXTRACTION HELPERS
  ───────────────────────────────────────────────────────── */

  function getQuestionText(sec) {
    var selectors = [
      '[class*="qes-heading"]', '[class*="qes-title"]',
      '[class*="question-heading"]', '[class*="question-title"]',
      '[class*="quiz-heading"]', '[class*="quiz-title"]',
      '[class*="step-heading"]', '[class*="step-title"]',
      '[class*="gp-heading"]',
      'h1', 'h2', 'h3', 'h4'
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
    var title   = '';
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
    console.log('[QuizFlow] Step "' + stepId + '" -> "' + answerText + '"');
  }

  function saveCheckboxAnswers(sec) {
    var stepId = sec.getAttribute('data-step');
    if (!stepId) return;
    var selected = [];
    sec.querySelectorAll('.single-qes.qes-cb-selected').forEach(function (card) {
      var labelEl = card.querySelector('.qes-text');
      if (labelEl) selected.push(labelEl.textContent.trim());
    });
    if (quizAnswers.stepOrder.indexOf(stepId) === -1) quizAnswers.stepOrder.push(stepId);
    if (!quizAnswers.steps[stepId]) quizAnswers.steps[stepId] = { stepId: stepId };
    quizAnswers.steps[stepId].stepId     = stepId;
    quizAnswers.steps[stepId].question   = getQuestionText(sec);
    quizAnswers.steps[stepId].answers    = selected;
    quizAnswers.steps[stepId].answeredAt = new Date().toISOString();
    saveQuizAnswers();
    console.log('[QuizFlow] Checkbox "' + stepId + '" ->', selected);
  }

  function saveInputAnswers(sec) {
    var stepId = sec.getAttribute('data-step');
    if (!stepId) return;
    if (sec.querySelector('[class*="gp-inp-"]')) return; // GP sections handle their own saving
    var inputValues = {};
    sec.querySelectorAll(
      'input.inp-place, input[class*="wt-inp"], input.gp-inp,' +
      'input[type="text"], input[type="number"], input[type="email"]'
    ).forEach(function (inp) {
      var panel = inp.closest('[class*="wt-tab-inputs"]');
      if (panel && panel.classList.contains('hidden')) return;
      if (inp.value.trim() === '') return;
      var label = inp.getAttribute('placeholder') || inp.getAttribute('name') || inp.getAttribute('id') || inp.getAttribute('aria-label') || 'value';
      inputValues[label] = inp.value.trim();
    });
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
    console.log('[QuizFlow] Inputs "' + stepId + '" ->', inputValues);
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

  function saveWeightAndBmi() {
    quizAnswers.weight = {
      kg:      Math.round((quizData.weightKg || 0) * 10) / 10,
      display: quizData.weightDisplay,
      unit:    quizData.weightUnit
    };
    var sw   = quizData.weightDisplay;
    var unit = quizData.weightUnit;
    if (sw) {
      var loss = unit === 'kg'
        ? Math.min(Math.round(sw * 0.20), 18)
        : Math.min(Math.round(sw * 0.20), 40);
      quizAnswers.bmi = {
        startWeight:     Math.round(sw),
        endWeight:       Math.round(sw - loss),
        lossAmount:      loss,
        unit:            unit,
        projectedMonths: 10
      };
      var sid = 'sec-step';
      if (!quizAnswers.steps[sid]) quizAnswers.steps[sid] = { stepId: sid };
      if (!quizAnswers.steps[sid].question) {
        var ws = document.querySelector('.new-qes-section[data-step="sec-step"]');
        if (ws) quizAnswers.steps[sid].question = getQuestionText(ws);
      }
      quizAnswers.steps[sid].inputValues = {
        weight:   sw + unit,
        weightKg: Math.round((quizData.weightKg || 0) * 10) / 10 + 'kg',
        unit:     unit
      };
    }
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
      '.single-qes.qes-selected .inp-svg,.single-qes.qes-selected .inp-svgg { background: #4C3E79 !important; border-color: #4C3E79 !important; position: relative; }',
      '.single-qes.qes-selected .inp-svg::after,.single-qes.qes-selected .inp-svgg::after { content: ""; width: 8px; height: 8px; background: #FFF; border-radius: 50%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }',
      '.single-qes.qes-selected .qes-text { font-weight: 500; color: #4C3E79; }',
      '.single-qes.qes-cb-selected { border: 1.5px solid #111 !important; background: #FFF; }',
      '.single-qes.qes-cb-selected .inp-svg,.single-qes.qes-cb-selected .inp-svgg { background: #111 !important; border-color: #111 !important; position: relative !important; display: flex !important; align-items: center !important; justify-content: center !important; }',
      '.single-qes.qes-cb-selected .inp-svg::after,.single-qes.qes-cb-selected .inp-svgg::after { content: "" !important; display: block !important; width: 10px !important; height: 6px !important; border-left: 2px solid #fff !important; border-bottom: 2px solid #fff !important; transform: rotate(-45deg) translateY(-1px) !important; position: absolute !important; }',
      '@keyframes qf-in-right { from { opacity:0; transform:translateX(30px); } to { opacity:1; transform:translateX(0); } }',
      '@keyframes qf-in-left  { from { opacity:0; transform:translateX(-30px);} to { opacity:1; transform:translateX(0); } }',
      '.qf-animate-in   { animation: qf-in-right 0.35s cubic-bezier(0.22,1,0.36,1) both; }',
      '.qf-animate-back { animation: qf-in-left  0.35s cubic-bezier(0.22,1,0.36,1) both; }',
      '[popup-name] { display: none !important; }',
      '[popup-name].qf-popup-open { display: flex !important; position: fixed; inset: 0; z-index: 9999; justify-content: center; align-items: center; padding: 20px; box-sizing: border-box; background: rgba(0,0,0,0.45); }',
      '.progressbar-first .progress-bar-active { max-width: 100% !important; width: 0%; transition: width 0.5s cubic-bezier(0.4,0,0.2,1); }',
      'button.qf-btn-disabled { opacity: 0.45 !important; cursor: not-allowed !important; pointer-events: none !important; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ─────────────────────────────────────────
     AUTO-PLAN
  ───────────────────────────────────────── */
  function initAutoPlan() {
    document.querySelectorAll('.new-qes-section[auto-plan="true"]').forEach(function (sec) {
      var observer = new MutationObserver(function () {
        var isVisible = sec.style.display !== 'none' && sec.style.display !== '';
        if (isVisible) {
          var nextStep = (sec.getAttribute('next-step') || '').trim();
          if (nextStep) setTimeout(function () { showStep(nextStep, 'forward'); }, 2000);
        }
      });
      observer.observe(sec, { attributes: true, attributeFilter: ['style'] });
    });
  }

  /* ─────────────────────────────────────────
     PROGRESS BAR
  ───────────────────────────────────────── */
  function updateProgressBar(stepId) {
    var pb = document.querySelector('.progressbar-first');
    if (!pb) return;
    var progressSection = pb.closest('[id*="shopify-section"]') || pb.closest('section') || pb.parentElement;
    if (!progressSection) return;
    var bar1 = pb.querySelector('.progress-bar-active');
    if (HIDDEN_STEPS.indexOf(stepId) !== -1) {
      progressSection.style.setProperty('display', 'none', 'important');
      return;
    }
    progressSection.style.removeProperty('display');
    var idx = ALL_STEPS.indexOf(stepId);
    if (idx !== -1) {
      var pct = Math.round(((idx + 1) / ALL_STEPS.length) * 100);
      if (bar1) bar1.style.width = pct + '%';
      pb.style.opacity = '1';
    }
  }

  /* ─────────────────────────────────────────
     BACK BUTTON
  ───────────────────────────────────────── */
  function updateBackButton(stepId) {
    var backBtn = document.querySelector('.qes-back-btn');
    if (!backBtn) return;
    if (stepId === 'step-start' || stepId === 'n-1st-step') {
      backBtn.style.opacity       = '0';
      backBtn.style.pointerEvents = 'none';
    } else {
      backBtn.style.opacity       = '1';
      backBtn.style.pointerEvents = '';
    }
  }

  /* ─────────────────────────────────────────
     INPUT VALIDATION (weight / generic inputs)
  ───────────────────────────────────────── */
  function setupInputValidation(sec) {
    if (sec.querySelector('[id^="gp-file-"]'))         return; // GP file sections handle own logic
    if (sec.querySelector('[class*="ue-file-input"]')) return; // Evidence upload handles own logic
    if (sec.querySelector('[class*="gp-inp-"]'))       return; // GP text sections handled in initGPUpload

    var allInputs = sec.querySelectorAll('input.inp-place, input[class*="wt-inp"], input.gp-inp');
    if (!allInputs.length) return;

    var btn = null;
    var buttons = sec.querySelectorAll('button');
    for (var b = 0; b < buttons.length; b++) {
      var cls = buttons[b].className || '';
      if (cls.indexOf('gp-submit-btn') === -1 && cls.indexOf('ue-submit-btn') === -1) {
        btn = buttons[b];
        break;
      }
    }
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
     SELECTION VALIDATION (radio / checkbox)
  ───────────────────────────────────────── */
  function setupSelectionValidation(sec) {
    if (sec.querySelector('[class*="gp-submit-btn-"]')) return;
    if (sec.querySelector('[class*="ue-submit-btn"]'))  return;

    var hasRadio    = sec.querySelectorAll('input.qes-inp[type="radio"]').length    > 0;
    var hasCheckbox = sec.querySelectorAll('input.qes-inp[type="checkbox"]').length > 0;
    if (!hasRadio && !hasCheckbox) return;

    var nextBtn = null;
    sec.querySelectorAll('button').forEach(function(b) {
      if (nextBtn) return;
      var cls = b.className || '';
      if (cls.indexOf('wt-unit-tab')   !== -1) return;
      if (cls.indexOf('gp-id-tab')     !== -1) return;
      if (cls.indexOf('gp-submit-btn') !== -1) return;
      if (cls.indexOf('ue-submit-btn') !== -1) return;
      nextBtn = b;
    });
    if (!nextBtn) return;

    function refreshBtn() {
      var anySelected = sec.querySelector('.single-qes.qes-selected, .single-qes.qes-cb-selected');
      if (anySelected) {
        nextBtn.classList.remove('qf-btn-disabled');
        nextBtn.disabled      = false;
        nextBtn.style.opacity = '';
        nextBtn.style.cursor  = '';
      } else {
        nextBtn.classList.add('qf-btn-disabled');
        nextBtn.disabled      = true;
        nextBtn.style.opacity = '0.45';
        nextBtn.style.cursor  = 'not-allowed';
      }
    }

    refreshBtn();
    sec.addEventListener('click', function(e) {
      if (e.target.closest('.single-qes')) setTimeout(refreshBtn, 30);
    });
  }

  /* ─────────────────────────────────────────
     WEIGHT COLLECTION
  ───────────────────────────────────────── */
  function collectWeightData() {
    var weightSection = document.querySelector('.new-qes-section[data-step="sec-step"]');
    if (!weightSection) return;
    var activePanel = weightSection.querySelector('[class*="wt-tab-inputs"]:not(.hidden)');
    if (!activePanel) return;
    var activeTab = weightSection.querySelector('[class*="wt-unit-tab"].active');
    var tabLabel  = activeTab ? activeTab.textContent.trim().toLowerCase() : 'st/lb';
    var inputs    = activePanel.querySelectorAll('input[class*="wt-inp"]');
    var val1      = inputs[0] ? parseFloat(inputs[0].value) || 0 : 0;
    var val2      = inputs[1] ? parseFloat(inputs[1].value) || 0 : 0;
    if (tabLabel === 'kg') {
      quizData.weightKg = val1; quizData.weightDisplay = val1; quizData.weightUnit = 'kg';
    } else {
      var totalLbs = (val1 * 14) + val2;
      quizData.weightKg = totalLbs * 0.453592; quizData.weightDisplay = totalLbs; quizData.weightUnit = 'lb';
    }
    saveWeightAndBmi();
  }

  /* ─────────────────────────────────────────
     BMI CHART
  ───────────────────────────────────────── */
  function updateBmiChart() {
    if (!quizData.weightDisplay) return;
    var canvas = document.querySelector('[id^="bmiChart-"]');
    if (!canvas) return;
    var startWeight = quizData.weightDisplay;
    var lossAmount  = quizData.weightUnit === 'kg'
      ? Math.min(Math.round(startWeight * 0.20), 18)
      : Math.min(Math.round(startWeight * 0.20), 40);
    var endWeight = startWeight - lossAmount;
    var topbarValue = document.querySelector('[class*="bmi-topbar-value"]');
    if (topbarValue) topbarValue.innerHTML = Math.round(startWeight) + '<span>' + quizData.weightUnit + '</span>';
    var lossPill = document.querySelector('[class*="bmi-loss-pill"]');
    if (lossPill) lossPill.textContent = lossAmount + quizData.weightUnit;
    quizAnswers.bmi = { startWeight: Math.round(startWeight), endWeight: Math.round(endWeight), lossAmount: lossAmount, unit: quizData.weightUnit, projectedMonths: 10 };
    saveQuizAnswers();
    var existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();
    var ctx  = canvas.getContext('2d');
    var data = [
      startWeight,
      startWeight - (startWeight - endWeight) * 0.08,
      startWeight - (startWeight - endWeight) * 0.28,
      startWeight - (startWeight - endWeight) * 0.78,
      endWeight
    ];
    var gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0,   'rgba(140,120,180,0.6)');
    gradient.addColorStop(0.5, 'rgba(180,160,140,0.4)');
    gradient.addColorStop(1,   'rgba(255,230,100,0.7)');
    var startIdx = 0, midIdx = 3, unit = quizData.weightUnit, sw = Math.round(startWeight);
    new Chart(ctx, {
      type: 'line',
      data: { labels: ['Start','Month 1','Month 3','Month 8','Month 10'], datasets: [{ data: data, fill: true, backgroundColor: gradient, borderColor: 'transparent', tension: 0.5, pointRadius: function(c){ return (c.dataIndex===startIdx||c.dataIndex===midIdx)?5:0; }, pointBackgroundColor: '#FFF', pointBorderColor: '#4C3E79', pointBorderWidth: 2 }] },
      plugins: [{ id: 'customTooltipBoxes', afterDatasetsDraw: function(chart) {
        var c = chart.ctx, meta = chart.getDatasetMeta(0);
        function drawBox(idx, label) {
          var pt = meta.data[idx]; if(!pt) return;
          var x=pt.x,y=pt.y,bW=52,bH=24,bX=x-bW/2,bY=y-bH-10;
          c.save(); c.fillStyle='#4C3E79'; c.beginPath();
          if(c.roundRect) c.roundRect(bX,bY,bW,bH,6); else c.rect(bX,bY,bW,bH);
          c.fill(); c.beginPath(); c.moveTo(x-5,bY+bH); c.lineTo(x+5,bY+bH); c.lineTo(x,bY+bH+6); c.closePath(); c.fill();
          c.fillStyle='#FFF'; c.font='bold 11px -apple-system,sans-serif'; c.textAlign='center'; c.textBaseline='middle';
          c.fillText(label,x,bY+bH/2); c.restore();
        }
        drawBox(startIdx, sw+unit); drawBox(midIdx, Math.round(data[midIdx])+unit);
      }}],
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top:40,left:4,right:4,bottom:0 } }, scales: { x:{display:false}, y:{display:true,grid:{color:'rgba(0,0,0,0.06)',drawBorder:false},ticks:{display:false},border:{display:false}} }, plugins:{legend:{display:false},tooltip:{enabled:false}}, elements:{line:{borderWidth:0}} }
    });
  }

  /* ─────────────────────────────────────────
     POPUP HELPERS
  ───────────────────────────────────────── */
  function getAllPopups()  { return document.querySelectorAll('[popup-name]'); }
  function hideAllPopups() {
    getAllPopups().forEach(function (p) {
      p.classList.remove('qf-popup-open');
      p.style.removeProperty('display');
    });
  }
  function showPopup(popupName, triggerStepId) {
    if (!popupName || !popupName.trim()) return;
    popupName = popupName.trim();
    var found = false;
    getAllPopups().forEach(function (el) {
      if (el.getAttribute('popup-name') === popupName) {
        el.style.setProperty('display', 'flex', 'important');
        el.classList.add('qf-popup-open');
        found = true;
      }
    });
    if (found) savePopupOpen(popupName, triggerStepId || getCurrentStepId());
    else console.warn('[QuizFlow] No popup with popup-name="' + popupName + '"');
  }

  /* ─────────────────────────────────────────
     SECTION NAVIGATION
  ───────────────────────────────────────── */
  function hideAllSections() {
    document.querySelectorAll('.new-qes-section[data-step]').forEach(function (s) { s.style.display = 'none'; });
  }

  function revealSection(sec, direction) {
    sec.style.display = 'block';
    sec.classList.remove('qf-animate-in', 'qf-animate-back');
    void sec.offsetWidth;
    sec.classList.add(direction === 'back' ? 'qf-animate-back' : 'qf-animate-in');
  }

  function showStep(stepId, direction) {
    if (!stepId || !stepId.trim()) return;
    stepId    = stepId.trim();
    direction = direction || 'forward';
    if (direction === 'forward') {
      saveCurrentStepInputs();
      var current = document.querySelector('.new-qes-section[data-step][style*="block"], .new-qes-section[data-step][style*="flex"]');
      if (current && current.getAttribute('data-step') !== stepId) {
        stepHistory.push(current.getAttribute('data-step'));
      }
    }
    if (stepId === 'four-step') collectWeightData();
    var found = false;
    document.querySelectorAll('.new-qes-section[data-step]').forEach(function (sec) {
      if (sec.getAttribute('data-step') === stepId) {
        hideAllSections();
        hideAllPopups();
        revealSection(sec, direction);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        updateProgressBar(stepId);
        updateBackButton(stepId);
        if (stepId === 'four-step') setTimeout(updateBmiChart, 50);
        recordStepVisit(stepId);

        /* ── FINAL STEP — send all data via email ── */
        if (stepId === '9th-step') {
          quizAnswers.completedAt = new Date().toISOString();
          saveQuizAnswers();
          console.log('[QuizFlow] Final step reached — sending email...');
          var latest = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
          /* Ensure upload URL is included */
          if (window._quizUploadUrl) {
            if (!latest.evidenceUpload) latest.evidenceUpload = {};
            latest.evidenceUpload.uploadedUrl = window._quizUploadUrl;
            if (latest.steps && latest.steps['evi-step']) {
              latest.steps['evi-step'].answer = window._quizUploadUrl;
            }
          }
          sendQuizEmail(latest);
        }

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
      updateBackButton(prev);
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
     CHECKBOX SELECTION
  ───────────────────────────────────────── */
  function handleCheckboxSelect(card) {
    var checkbox = card.querySelector('input.qes-inp[type="checkbox"]');
    if (!checkbox) return;
    var parentSection = card.closest('.new-qes-section');
    if (!parentSection) return;
    var isSelected = card.classList.contains('qes-cb-selected');
    if (isSelected) {
      card.classList.remove('qes-cb-selected');
      checkbox.checked = false;
    } else {
      card.classList.add('qes-cb-selected');
      checkbox.checked = true;
      var popupStep = (checkbox.getAttribute('popup-step') || '').trim();
      if (popupStep !== '') {
        var currentStepId = parentSection.getAttribute('data-step');
        var popupEl = document.querySelector('[popup-name="' + popupStep + '"]');
        if (popupEl) {
          popupEl.setAttribute('data-return-step', currentStepId);
          /* Store which checkbox label triggered this popup */
          var labelEl = card.querySelector('.qes-text');
          var cardLabel = labelEl ? labelEl.textContent.trim() : '';
          popupEl.setAttribute('data-trigger-label', cardLabel);
          /* Clear textarea so each checkbox gets a fresh input */
          var ta = popupEl.querySelector('textarea');
          if (ta) ta.value = '';
        }
        setTimeout(function () { showPopup(popupStep, currentStepId); }, 150);
      }
    }
    saveCheckboxAnswers(parentSection);
  }

  /* ─────────────────────────────────────────
     EVENT LISTENERS
  ───────────────────────────────────────── */
  function initRadios() {
    document.addEventListener('click', function (e) {
      var card = e.target.closest('.single-qes');
      if (!card || !card.closest('.new-qes-section')) return;
      var radio    = card.querySelector('input.qes-inp[type="radio"]');
      var checkbox = card.querySelector('input.qes-inp[type="checkbox"]');
      if (radio)    handleOptionSelect(card);
      if (checkbox) handleCheckboxSelect(card);
    });
    document.addEventListener('change', function (e) {
      if (!e.target.matches('input.qes-inp[type="radio"]')) return;
      var card = e.target.closest('.single-qes');
      if (card) handleOptionSelect(card);
    });
  }

  function initButtons() {
    document.addEventListener('click', function (e) {

      /* 1. POPUP CLOSE */
      var closeBtn = e.target.closest('[popup-name] [class*="close"]');
      if (closeBtn) {
        savePopupAction(getOpenPopupName(), 'closed', '');
        hideAllPopups();
        return;
      }

      /* 2. POPUP NEXT */
      var popupNextBtn = e.target.closest('[popup-name] [class*="next-btn"]');
      if (popupNextBtn) {
        var popupEl    = popupNextBtn.closest('[popup-name]');
        var pName      = popupEl.getAttribute('popup-name');
        var nextStep   = (popupEl.getAttribute('next-step') || '').trim();
        var returnStep = popupEl.getAttribute('data-return-step') || '';
        var triggerLabel = popupEl.getAttribute('data-trigger-label') || '';
        var textarea   = popupEl.querySelector('textarea');
        var extraInfo  = textarea ? textarea.value.trim() : '';

        /* Save per-checkbox: key = "popupName__checkboxLabel" */
        var saveKey = pName + (triggerLabel ? '__' + triggerLabel : '');
        savePopupAction(saveKey, 'continued', nextStep || returnStep, extraInfo);

        /* Also store in the trigger step's data for easy email access */
        if (returnStep) {
  if (!quizAnswers.steps[returnStep]) quizAnswers.steps[returnStep] = { stepId: returnStep };
  if (!quizAnswers.steps[returnStep].popupDetails) quizAnswers.steps[returnStep].popupDetails = {};
  /* ★ Always save even if empty — so it always prints in email */
  quizAnswers.steps[returnStep].popupDetails[triggerLabel] = extraInfo || '';
  saveQuizAnswers();
  console.log('[QuizFlow] Popup detail saved for "' + triggerLabel + '":', extraInfo || '(none)');
}

        /* Clear textarea for next use */
        if (textarea) textarea.value = '';

        hideAllPopups();
        if (nextStep) showStep(nextStep, 'forward');
        return;
      }

      /* 3. CHECKBOX SUBMIT */
      var submitBtn = e.target.closest('button.submitt-btn');
      if (submitBtn && !submitBtn.disabled && !submitBtn.classList.contains('qf-btn-disabled')) {
        var sec = submitBtn.closest('.new-qes-section[data-step]');
        if (sec) {
          saveCheckboxAnswers(sec);
          var next = (sec.getAttribute('next-step') || '').trim();
          if (next) { showStep(next, 'forward'); return; }
        }
      }

      /* 4. GENERAL BUTTONS */
      var anyBtn = e.target.closest('button');
      if (anyBtn && !anyBtn.disabled && !anyBtn.classList.contains('qf-btn-disabled')) {
        var sec = anyBtn.closest('.new-qes-section[data-step]');
        if (sec) {
          var cls         = anyBtn.className || '';
          var isInternal  = cls.indexOf('wt-unit-tab')   !== -1 || cls.indexOf('gp-id-tab') !== -1;
          var isGPSubmit  = cls.indexOf('gp-submit-btn') !== -1;
          var isEviSubmit = cls.indexOf('ue-submit-btn') !== -1;
          var isSubmitBtn = cls.indexOf('submitt-btn')   !== -1;
          if (!isInternal && !isGPSubmit && !isEviSubmit && !isSubmitBtn) {
            var next = (sec.getAttribute('next-step') || '').trim();
            if (next) { showStep(next, 'forward'); return; }
          }
        }
      }

      /* 5. PATIENT CONSENT — triggers email send */
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
            console.log('[QuizFlow] Quiz complete! Sending email...');
            setTimeout(function() { var latest = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); sendQuizEmail(latest); }, 8000);
            showStep(next, 'forward');
          }
        }
      }

    });
  }

  function initBackButton() {
    var backBtn = document.querySelector('.qes-back-btn');
    if (!backBtn) return;
    backBtn.style.cursor = 'pointer';
    backBtn.addEventListener('click', goBack);
  }

  /* ─────────────────────────────────────────
     SEND ALL DATA VIA SHOPIFY CONTACT FORM
  ───────────────────────────────────────── */
  function sendQuizEmail(quiz) {
  try {
    var lines = [];
    var qNum  = 1;
    var steps = quiz.steps   || {};
    var order = (quiz.stepOrder && quiz.stepOrder.length) ? quiz.stepOrder : Object.keys(steps);

    /* ── All answered steps ── */
    order.forEach(function(stepId) {
      var step = steps[stepId];
      if (!step) return;

      /* ★ Skip evi-step here — printed once in its own section below */
      if (stepId === 'evi-step') return;

      var question = (step.question || stepId).replace(/\s+/g, ' ').trim();
      var value    = '';

      if (step.answer && step.answer !== 'Shown') {
        value = step.answer;

      } else if (step.answers && step.answers.length) {
        value = step.answers.join(', ');

        /* ★ If this step has per-checkbox popup details, print inline */
        if (step.popupDetails && Object.keys(step.popupDetails).length) {
          lines.push('Q' + qNum + '. ' + question + ': ' + value);
          Object.keys(step.popupDetails).forEach(function(label) {
            var detail = (step.popupDetails[label] || '').trim();
            lines.push('   Extra Detail (' + label + '): ' + (detail || 'none provided'));
          });
          qNum++;
          return; /* skip generic push below */
        }

      } else if (step.inputValues && Object.keys(step.inputValues).length) {
        var iv    = step.inputValues;
        var parts = [];

        if (iv['Full Name'] || iv['NHS Number'] || iv['Email']) {
          ['Full Name','Email','NHS Number','Phone Number','Address','Town','Postcode','ID Type','ID Image'].forEach(function(f) {
            if (iv[f]) parts.push(f + ': ' + iv[f]);
          });
          value = parts.join(' | ');
        } else {
          Object.keys(iv).forEach(function(k) {
            if (k !== 'unit') parts.push(iv[k]);
          });
          value = parts.join(' ');
        }
      }

      if (value) {
        lines.push('Q' + qNum + '. ' + question + ': ' + value);
        qNum++;
      }
    });

    /* ── Evidence upload — printed ONCE, never duplicated ── */
    var evidenceUrl = '';
    if (window._quizUploadUrl) {
      evidenceUrl = window._quizUploadUrl;
    } else if (quiz.evidenceUpload && quiz.evidenceUpload.uploadedUrl) {
      evidenceUrl = quiz.evidenceUpload.uploadedUrl;
    } else if (quiz.steps && quiz.steps['evi-step'] && quiz.steps['evi-step'].answer) {
      evidenceUrl = quiz.steps['evi-step'].answer;
    }
    var evidenceStep = (quiz.steps && quiz.steps['evi-step']) || {};
    lines.push('');
    lines.push('Q' + qNum + '. Evidence of Previous Use:');
    if (evidenceUrl) {
      var fileName = (evidenceStep.inputValues && evidenceStep.inputValues.fileName) ? evidenceStep.inputValues.fileName : '';
      if (fileName) lines.push('   File: ' + fileName);
      lines.push('   URL:  ' + evidenceUrl);
    } else {
      lines.push('   (processing — check Shopify Files)');
    }
    qNum++;

    /* ── BMI ── */
    if (quiz.bmi && quiz.bmi.startWeight) {
      lines.push('');
      lines.push('── Weight & BMI ──────────────────');
      lines.push('Start Weight:         ' + quiz.bmi.startWeight + (quiz.bmi.unit || ''));
      lines.push('Projected End Weight: ' + quiz.bmi.endWeight   + (quiz.bmi.unit || ''));
      lines.push('Projected Loss:       ' + quiz.bmi.lossAmount  + (quiz.bmi.unit || '') + ' over ' + (quiz.bmi.projectedMonths || 10) + ' months');
    }

    /* ── Submission timestamps ── */
    lines.push('');
    lines.push('── Submission Info ───────────────');
    if (quiz.startedAt)   lines.push('Started:   ' + new Date(quiz.startedAt).toLocaleString('en-GB'));
    if (quiz.completedAt) lines.push('Completed: ' + new Date(quiz.completedAt).toLocaleString('en-GB'));

    /* ── Pull name + email from pl-step or first-step ── */
    var nameVal  = '';
    var emailVal = '';
    ['pl-step', 'first-step'].forEach(function(sid) {
      var s = steps[sid];
      if (!s) return;
      if (s.inputValues) {
        Object.keys(s.inputValues).forEach(function(k) {
          var kl = k.toLowerCase();
          if (!nameVal  && (kl === 'full name'  || kl.indexOf('name')  !== -1)) nameVal  = s.inputValues[k];
          if (!emailVal && (kl === 'email'       || kl.indexOf('email') !== -1)) emailVal = s.inputValues[k];
        });
      }
    });
    nameVal  = nameVal  || 'Quiz Submission';
    emailVal = emailVal || 'noreply@pharmazon.com';

    var body = lines.join('\n');
    console.log('[QuizFlow] Sending email...\n', body.slice(0, 5000));

    var contactForm = document.getElementById('ContactForm');
    if (!contactForm) { console.warn('[QuizFlow] ContactForm not found'); return; }

    var nameInput  = contactForm.querySelector('input[name="contact[Name]"], input[name="contact[name]"], #ContactForm-name');
    var emailInput = contactForm.querySelector('input[name="contact[email]"], #ContactForm-email');
    var msgInput   = contactForm.querySelector('textarea[name="contact[Comment]"], textarea[name="contact[body]"], #ContactForm-body');

    if (nameInput)  nameInput.value  = nameVal;
    if (emailInput) emailInput.value = emailVal;
    if (msgInput)   msgInput.value   = body;

    var formData = new FormData(contactForm);
    var action   = (contactForm.getAttribute('action') || '/contact').split('#')[0];

    fetch(action, {
      method: 'POST', body: formData, credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
    .then(function(res) {
      if (res.ok) console.log('[QuizFlow] Email sent!');
      else        console.warn('[QuizFlow] Email POST failed:', res.status);
    })
    .catch(function(err) {
      console.warn('[QuizFlow] Email fetch error:', err.message);
    });

  } catch(e) {
    console.warn('[QuizFlow] sendQuizEmail error:', e.message);
  }
}

  /* ─────────────────────────────────────────
     SHOPIFY FILE UPLOAD (shared)
  ───────────────────────────────────────── */
  var UPLOAD_PROXY_URL = 'https://winter-sunset-dea7.ahsanikhlaq59.workers.dev';

  function getStagedTarget(file) {
    var mimeType = file.type || 'application/octet-stream';
    var filename = 'evidence_' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    return fetch(UPLOAD_PROXY_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'staged', filename: filename, mimeType: mimeType, fileSize: file.size })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) { if (!data.ok) throw new Error('Step 1 failed: ' + data.error); return data.target; });
  }

  function uploadToStage(target, file) {
    var formData = new FormData();
    target.parameters.forEach(function(p) { formData.append(p.name, p.value); });
    formData.append('file', file);
    return fetch(target.url, { method: 'POST', body: formData })
      .then(function(res) { if (!res.ok && res.status !== 204) throw new Error('Step 2 failed: HTTP ' + res.status); return target.resourceUrl; });
  }

  function registerFile(resourceUrl, mimeType) {
    return fetch(UPLOAD_PROXY_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', resourceUrl: resourceUrl, mimeType: mimeType })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) { if (!data.ok) throw new Error('Step 3 failed: ' + data.error); if (data.immediateUrl) data.file._immediateUrl = data.immediateUrl; return data.file; });
  }

  function pollFileReady(fileId, attempt) {
    attempt = attempt || 1;
    if (attempt > 20) { console.warn('[QuizFlow] Poll timeout'); return Promise.resolve(''); }
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        fetch(UPLOAD_PROXY_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'poll', fileId: fileId })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (!data.ok) throw new Error(data.error);
          if (data.url) resolve(data.url);
          else pollFileReady(fileId, attempt + 1).then(resolve).catch(reject);
        })
        .catch(function(err) { pollFileReady(fileId, attempt + 1).then(resolve).catch(reject); });
      }, 2000);
    });
  }

  function uploadToShopify(file) {
    console.log('[QuizFlow] Upload started:', file.name);
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
                    if (stored.steps && stored.steps['evi-step']) {
                      stored.steps['evi-step'].answer = retryUrl;
                      if (stored.steps['evi-step'].inputValues) stored.steps['evi-step'].inputValues.uploadedUrl = retryUrl;
                    }
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
     EVIDENCE UPLOAD
  ───────────────────────────────────────── */
  function saveEvidenceUpload(fileName, fileType, fileSize, uploadedUrl) {
    var stepId = 'evi-step';
    if (quizAnswers.stepOrder.indexOf(stepId) === -1) quizAnswers.stepOrder.push(stepId);
    if (!quizAnswers.steps[stepId]) quizAnswers.steps[stepId] = { stepId: stepId };
    quizAnswers.steps[stepId].stepId      = stepId;
    quizAnswers.steps[stepId].question    = 'Please Upload Evidence Of Previous Use';
    quizAnswers.steps[stepId].answer      = uploadedUrl;
    quizAnswers.steps[stepId].inputValues = { fileName: fileName, fileType: fileType, fileSizeKb: Math.round(fileSize/1024)+'kb', uploadedUrl: uploadedUrl };
    quizAnswers.steps[stepId].answeredAt  = new Date().toISOString();
    quizAnswers.evidenceUpload = { fileName: fileName, fileType: fileType, fileSizeKb: Math.round(fileSize/1024)+'kb', uploadedUrl: uploadedUrl, uploadedAt: new Date().toISOString() };
    saveQuizAnswers();
  }

  function initEvidenceUpload() {
    var fileInput  = document.querySelector('[class*="ue-file-input"]');
    var submitBtn  = document.querySelector('[class*="ue-submit-btn"]');
    var defaultUI  = document.querySelector('[class*="ue-default-ui"]');
    var previewUI  = document.querySelector('[class*="ue-preview-"]');
    var previewImg = document.querySelector('[class*="ue-preview-img"]');
    var previewName= document.querySelector('[class*="ue-preview-name"]');
    var removeBtn  = document.querySelector('[class*="ue-preview-remove"]');
    var dropzone   = document.querySelector('[class*="ue-card"]');
    if (!fileInput || !submitBtn) return;
    var selectedFile = null;
    fileInput.addEventListener('change', function(e) {
      var file = e.target.files[0]; if (!file) return; selectedFile = file;
      if (previewName) previewName.textContent = file.name;
      if (previewImg && file.type.indexOf('image/') === 0) { var r = new FileReader(); r.onload = function(ev) { previewImg.src = ev.target.result; previewImg.style.display = 'block'; }; r.readAsDataURL(file); } else if (previewImg) previewImg.style.display = 'none';
      if (defaultUI) defaultUI.style.display = 'none';
      if (previewUI) { previewUI.classList.add('visible'); previewUI.style.display = 'flex'; }
      submitBtn.disabled = false; submitBtn.style.opacity = '1'; submitBtn.style.cursor = 'pointer';
    });
    if (dropzone) {
      dropzone.addEventListener('dragover',  function(e) { e.preventDefault(); dropzone.style.borderColor = '#4C3E79'; });
      dropzone.addEventListener('dragleave', function()  { dropzone.style.borderColor = ''; });
      dropzone.addEventListener('drop', function(e) { e.preventDefault(); dropzone.style.borderColor = ''; var file = e.dataTransfer && e.dataTransfer.files[0]; if (file) { var dt = new DataTransfer(); dt.items.add(file); fileInput.files = dt.files; fileInput.dispatchEvent(new Event('change')); } });
    }
    if (removeBtn) {
      removeBtn.addEventListener('click', function() {
        selectedFile = null; fileInput.value = '';
        if (previewImg)  { previewImg.src = ''; previewImg.style.display = 'none'; }
        if (previewName) previewName.textContent = '';
        if (previewUI)   { previewUI.classList.remove('visible'); previewUI.style.display = 'none'; }
        if (defaultUI)   defaultUI.style.display = '';
        submitBtn.disabled = true; submitBtn.style.opacity = '0.45'; submitBtn.style.cursor = 'not-allowed';
      });
    }
    submitBtn.disabled = true; submitBtn.style.opacity = '0.45'; submitBtn.style.cursor = 'not-allowed';
    submitBtn.addEventListener('click', function(e) {
      e.stopPropagation(); if (!selectedFile) return;
      var sec      = submitBtn.closest('.new-qes-section[data-step]');
      var nextStep = sec ? (sec.getAttribute('next-step') || '').trim() : '';
      var origText = submitBtn.textContent;
      submitBtn.disabled = true; submitBtn.textContent = 'Uploading...'; submitBtn.style.opacity = '0.7';
      uploadToShopify(selectedFile)
        .then(function(url) {
          saveEvidenceUpload(selectedFile.name, selectedFile.type, selectedFile.size, url);
          submitBtn.textContent = 'Uploaded!'; submitBtn.style.opacity = '1'; submitBtn.style.background = '#2e7d32';
          window._quizUploadUrl = url;
          console.log('[QuizFlow] Upload complete, URL:', url);
          /* Only move to next step AFTER URL is saved — email will always have it */
          setTimeout(function() { if (nextStep) showStep(nextStep, 'forward'); }, 600);
        })
        .catch(function(err) {
          submitBtn.disabled = false; submitBtn.textContent = origText; submitBtn.style.opacity = '1';
          var errBox = document.querySelector('[class*="ue-card"]');
          if (errBox) { var prev = errBox.querySelector('.qf-upload-error'); if (prev) prev.remove(); var msg = document.createElement('p'); msg.className = 'qf-upload-error'; msg.style.cssText = 'color:#c0392b;font-size:12px;margin:8px 0 0;background:#fff0f0;padding:8px;border-radius:6px;'; msg.textContent = 'Error: ' + (err.message || String(err)); errBox.appendChild(msg); }
        });
    });
  }

  /* ─────────────────────────────────────────
     GP UPLOAD  — handles BOTH:
       • text-only sections (e.g. pl-step: Name + Email, no file)
       • file + text sections (ID upload)
  ───────────────────────────────────────── */
  function initGPUpload() {
    document.querySelectorAll('.new-qes-section[data-step]').forEach(function(sec) {
      var stepId    = sec.getAttribute('data-step');
      var submitBtn = sec.querySelector('[class*="gp-submit-btn-"]');
      if (!submitBtn) return; // not a GP section

      var fileInput = sec.querySelector('[id^="gp-file-"]');
      var gpInputs  = sec.querySelectorAll('[class*="gp-inp-"]');

      /* ── Shared: start disabled ── */
      submitBtn.disabled = true;
      submitBtn.classList.add('qf-btn-disabled');
      submitBtn.style.opacity = '0.45';
      submitBtn.style.cursor  = 'not-allowed';

      /* ── Shared: field validation ── */
      function checkForm() {
        var allFilled = true;
        gpInputs.forEach(function(inp) {
          if (inp.value.trim() === '') allFilled = false;
        });
        if (fileInput && !selectedFile) allFilled = false;
        if (allFilled) {
          submitBtn.disabled = false;
          submitBtn.classList.remove('qf-btn-disabled');
          submitBtn.style.opacity = '1';
          submitBtn.style.cursor  = 'pointer';
        } else {
          submitBtn.disabled = true;
          submitBtn.classList.add('qf-btn-disabled');
          submitBtn.style.opacity = '0.45';
          submitBtn.style.cursor  = 'not-allowed';
        }
      }

      gpInputs.forEach(function(inp) {
        inp.addEventListener('input',  checkForm);
        inp.addEventListener('change', checkForm);
      });

      /* ── TEXT-ONLY section (no file input — e.g. pl-step) ── */
      if (!fileInput) {
        submitBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          if (submitBtn.disabled || submitBtn.classList.contains('qf-btn-disabled')) return;
          var fieldValues = {};
          sec.querySelectorAll('[class*="gp-inp-"]').forEach(function(inp) {
            var label = (inp.getAttribute('placeholder') || inp.getAttribute('name') || 'field').trim();
            var val   = inp.value.trim();
            if (val) fieldValues[label] = val;
          });
          saveGPData(stepId, sec, fieldValues, '');
          var nextStep = (sec.getAttribute('next-step') || '').trim();
          if (nextStep) showStep(nextStep, 'forward');
        });
        checkForm();
        console.log('[QuizFlow] GP text-only handler ready:', stepId);
        return; // skip file logic below
      }

      /* ── FILE + TEXT section ── */
      var selectedFile   = null;
      var selectedIdType = '';

      var sId        = fileInput.id.replace('gp-file-', '');
      var defaultUi  = document.getElementById('gp-default-ui-'  + sId);
      var previewUi  = document.getElementById('gp-preview-ui-'  + sId);
      var previewImg = document.getElementById('gp-preview-img-' + sId);
      var previewName= document.getElementById('gp-preview-name-'+ sId);
      var removeBtn  = document.getElementById('gp-remove-'      + sId);
      var dropzone   = document.getElementById('gp-dropzone-'    + sId);

      var tabs = sec.querySelectorAll('[class*="gp-id-tab-"]');
      if (tabs.length) selectedIdType = tabs[0].textContent.trim();
      tabs.forEach(function(tab) {
        if ((tab.getAttribute('class') || '').indexOf('active') !== -1) selectedIdType = tab.textContent.trim();
        tab.addEventListener('click', function() { selectedIdType = tab.textContent.trim(); });
      });

      fileInput.addEventListener('change', function() {
        var file = this.files && this.files[0]; if (!file) return; selectedFile = file;
        if (previewName) previewName.textContent = file.name;
        if (defaultUi)   defaultUi.style.display = 'none';
        if (previewUi)   previewUi.style.display  = 'flex';
        if (previewImg && file.type.startsWith('image/')) { var r = new FileReader(); r.onload = function(e) { previewImg.src = e.target.result; previewImg.style.display = 'block'; }; r.readAsDataURL(file); } else if (previewImg) previewImg.style.display = 'none';
        checkForm();
      });

      if (removeBtn) {
        removeBtn.addEventListener('click', function() {
          selectedFile = null; fileInput.value = '';
          if (previewImg)  { previewImg.src = ''; previewImg.style.display = 'none'; }
          if (previewName) previewName.textContent = '';
          if (previewUi)   previewUi.style.display = 'none';
          if (defaultUi)   defaultUi.style.display = '';
          checkForm();
        });
      }

      if (dropzone) {
        dropzone.addEventListener('dragover',  function(e) { e.preventDefault(); dropzone.style.borderColor = '#4C3E79'; });
        dropzone.addEventListener('dragleave', function()  { dropzone.style.borderColor = ''; });
        dropzone.addEventListener('drop', function(e) { e.preventDefault(); dropzone.style.borderColor = ''; var file = e.dataTransfer && e.dataTransfer.files[0]; if (file) { var dt = new DataTransfer(); dt.items.add(file); fileInput.files = dt.files; fileInput.dispatchEvent(new Event('change')); } });
      }

      submitBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (submitBtn.disabled || submitBtn.classList.contains('qf-btn-disabled')) return;
        var nextStep = (sec.getAttribute('next-step') || '').trim();
        var fieldValues = {};
        gpInputs.forEach(function(inp) {
          var label = inp.getAttribute('placeholder') || inp.getAttribute('name') || 'field';
          if (inp.value.trim()) fieldValues[label] = inp.value.trim();
        });
        tabs.forEach(function(t) {
          if ((t.getAttribute('class') || '').indexOf('active') !== -1) selectedIdType = t.textContent.trim();
        });
        if (selectedIdType) fieldValues['ID Type'] = selectedIdType;
        if (!selectedFile) {
          saveGPData(stepId, sec, fieldValues, '');
          if (nextStep) showStep(nextStep, 'forward');
          return;
        }
        var origText       = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Uploading ID...';
        var capturedFields = JSON.parse(JSON.stringify(fieldValues));
        uploadToShopify(selectedFile)
          .then(function(url) {
            var finalFields = JSON.parse(JSON.stringify(capturedFields));
            finalFields['ID Image'] = url || '';
            saveGPData(stepId, sec, finalFields, url);
            submitBtn.textContent = 'Done!'; submitBtn.style.opacity = '1';
            setTimeout(function() { submitBtn.disabled = false; submitBtn.textContent = origText; if (nextStep) showStep(nextStep, 'forward'); }, 600);
          })
          .catch(function(err) {
            var finalFields = JSON.parse(JSON.stringify(capturedFields));
            finalFields['ID Image'] = 'Upload failed: ' + err.message;
            saveGPData(stepId, sec, finalFields, '');
            submitBtn.disabled = false; submitBtn.textContent = origText; submitBtn.style.opacity = '1';
            alert('ID upload failed: ' + err.message + '\nPlease try again.');
          });
      });

      checkForm();
      console.log('[QuizFlow] GP file handler ready:', stepId);
    });
  }

  function saveGPData(stepId, sec, fieldValues, imageUrl) {
    if (!stepId) return;
    if (quizAnswers.stepOrder.indexOf(stepId) === -1) quizAnswers.stepOrder.push(stepId);
    if (!quizAnswers.steps[stepId]) quizAnswers.steps[stepId] = { stepId: stepId };
    quizAnswers.steps[stepId].stepId      = stepId;
    quizAnswers.steps[stepId].question    = getQuestionText(sec) || 'Patient Information';
    quizAnswers.steps[stepId].inputValues = fieldValues;
    quizAnswers.steps[stepId].answeredAt  = new Date().toISOString();
    delete quizAnswers.steps[stepId].answer;
    saveQuizAnswers();
    console.log('[QuizFlow] GP data saved:', stepId, fieldValues);
  }

  /* ─────────────────────────────────────────
     INIT
  ───────────────────────────────────────── */
  function init() {
    injectStyles();
    hideAllPopups();

    var sections = document.querySelectorAll('.new-qes-section[data-step]');
    if (sections.length === 0) { loadQuizAnswers(); return; }

    resetQuizAnswers();

    var entryFound = false;
    var entryStep  = null;

    sections.forEach(function (sec) {
      var s = sec.getAttribute('style') || '';
      if (!entryFound && (s.indexOf('display: flex') !== -1 || s.indexOf('display:flex') !== -1)) {
        sec.style.display = 'block';
        entryStep  = sec.getAttribute('data-step');
        entryFound = true;
      } else {
        sec.style.display = 'none';
      }
      setupInputValidation(sec);
      setupSelectionValidation(sec);
    });

    if (!entryFound && sections.length > 0) {
      sections[0].style.display = 'block';
      entryStep = sections[0].getAttribute('data-step');
    }

    if (entryStep) {
      updateProgressBar(entryStep);
      updateBackButton(entryStep);
      recordStepVisit(entryStep);
    }

    initRadios();
    initButtons();
    initBackButton();
    initAutoPlan();
    initEvidenceUpload();
    initGPUpload();

    console.log('[QuizFlow] Ready — ' + sections.length + ' sections | entry: ' + entryStep);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ─────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────── */
  window.QuizFlow = {
    goTo:         function (id)   { showStep(id, 'forward'); },
    showPopup:    function (name) { showPopup(name); },
    hidePopups:   hideAllPopups,
    back:         goBack,
    getAnswers:   function () { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch(e) { return {}; } },
    clearAnswers: function () { localStorage.removeItem(STORAGE_KEY); },
    sendEmail:    function ()     { sendQuizEmail(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); }
  };

})();