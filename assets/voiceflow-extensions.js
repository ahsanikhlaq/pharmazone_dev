// voiceflow-extensions.js
window.VoiceflowExtensions = window.VoiceflowExtensions || {};

// Multiselect Extension
window.VoiceflowExtensions.multiselect = {
  name: 'multiselect',
  type: 'response',
  match: ({ trace }) => trace.type === 'ext_multiselect' || trace.payload?.name === 'ext_multiselect',
  render: ({ trace, element }) => {
    // Parse the payload to get options and settings
    const config = trace.payload || {};
    const options = config.options || [];
    const maxSelections = config.maxSelections || options.length;
    const title = config.title || 'Select options';
    const submitText = config.submitText || 'Submit';
    const color = config.color || '#51c3be';
    
    // Create form container
    const formContainer = document.createElement('form');
    formContainer.innerHTML = `
      <style>
        .vf-multiselect {
          font-family: Arial, sans-serif;
          padding: 20px;
          background: #f9f9f9;
          border-radius: 8px;
          max-width: 400px;
        }
        .vf-multiselect h3 {
          margin: 0 0 15px 0;
          color: #333;
          font-size: 18px;
        }
        .vf-multiselect .option-item {
          display: flex;
          align-items: center;
          padding: 10px;
          margin: 8px 0;
          background: white;
          border: 2px solid #ddd;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .vf-multiselect .option-item:hover {
          border-color: ${color};
          background: #f0f0f0;
        }
        .vf-multiselect .option-item.selected {
          border-color: ${color};
          background: ${color}22;
        }
        .vf-multiselect input[type="checkbox"] {
          margin-right: 10px;
          width: 18px;
          height: 18px;
          cursor: pointer;
        }
        .vf-multiselect label {
          cursor: pointer;
          flex: 1;
          font-size: 14px;
          user-select: none;
        }
        .vf-multiselect button {
          background: ${color};
          color: #fff;
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          width: 100%;
          margin-top: 15px;
          font-weight: 600;
        }
        .vf-multiselect button:hover {
          opacity: 0.9;
        }
        .vf-multiselect button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .vf-multiselect .error-message {
          color: #d32f2f;
          font-size: 12px;
          margin-top: 5px;
          display: none;
        }
      </style>
      <div class="vf-multiselect">
        <h3>${title}</h3>
        <div class="options-container">
          ${options.map((option, index) => `
            <div class="option-item" data-index="${index}">
              <input type="checkbox" id="option-${index}" name="options" value="${option}">
              <label for="option-${index}">${option}</label>
            </div>
          `).join('')}
        </div>
        <div class="error-message">Please select at least one option</div>
        <button type="submit">${submitText}</button>
      </div>
    `;

    // Add click handlers for option items
    const optionItems = formContainer.querySelectorAll('.option-item');
    optionItems.forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') {
          const checkbox = item.querySelector('input[type="checkbox"]');
          checkbox.checked = !checkbox.checked;
        }
        
        // Update visual state
        if (item.querySelector('input[type="checkbox"]').checked) {
          item.classList.add('selected');
        } else {
          item.classList.remove('selected');
        }
        
        // Check max selections
        const checkedBoxes = formContainer.querySelectorAll('input[type="checkbox"]:checked');
        if (checkedBoxes.length > maxSelections) {
          item.querySelector('input[type="checkbox"]').checked = false;
          item.classList.remove('selected');
        }
      });
    });

    // Handle form submission
    formContainer.addEventListener('submit', (event) => {
      event.preventDefault();
      
      const checkedBoxes = formContainer.querySelectorAll('input[type="checkbox"]:checked');
      const selectedOptions = Array.from(checkedBoxes).map(cb => cb.value);
      
      const errorMessage = formContainer.querySelector('.error-message');
      
      if (selectedOptions.length === 0) {
        errorMessage.style.display = 'block';
        return;
      }
      
      errorMessage.style.display = 'none';
      
      console.log('[VF] Multiselect submitted:', selectedOptions);

      // Send response back to Voiceflow
      window.voiceflow.chat.interact({
        type: 'complete',
        payload: { selections: selectedOptions }
      });
    });

    element.appendChild(formContainer);
  }
};

// AddToCart Extension - Sends questionnaire data to cart
window.VoiceflowExtensions.addToCart = {
  name: 'addToCart',
  type: 'effect',
  match: ({ trace }) => trace.type === 'addToCart',
  effect: async ({ trace }) => {
    console.log('[VF] addToCart trace received:', trace);

    const { variantId, quantity, properties } = trace.payload || {};

    console.log('[VF] Sending VF_ADD_TO_CART message');

    // Send message to cart-from-chat.js
    window.postMessage({
      type: 'VF_ADD_TO_CART',
      payload: {
        variantId: variantId,
        quantity: quantity || 1,
        properties: properties || {}
      }
    }, '*');
  }
};

// BMI Calculator Extension
window.VoiceflowExtensions.bmiCalculator = {
  name: 'BMICalculator',
  type: 'response',
  match: ({ trace }) => trace.type === 'ext_bmiCalculator' || trace.payload?.name === 'ext_bmiCalculator',
  render: ({ trace, element }) => {
    // Parse the payload to get configuration
    const config = trace.payload || {};
    const color = config.color || '#51c3be';
    const title = config.title || 'BMI Calculator';
    const bmiThreshold = config.bmiThreshold || 27;
    const submitText = config.submitText || 'Calculate BMI';
    const cancelText = config.cancelText || 'Cancel';
    const successMessage = config.successMessage || 'Checking eligibility...';
    const eligibleMessage = config.eligibleMessage || 'You are eligible!';
    const ineligibleMessage = config.ineligibleMessage || 'You are not eligible';
    const metricHeightLabel = config.metricHeightLabel || 'Height (cm)';
    const metricWeightLabel = config.metricWeightLabel || 'Weight (kg)';
    const imperialHeightLabel = config.imperialHeightLabel || 'Height';
    const imperialWeightLabel = config.imperialWeightLabel || 'Weight';
    const switchToImperialText = config.switchToImperialText || 'Switch to Imperial';
    const switchToMetricText = config.switchToMetricText || 'Switch to Metric';
    
    // Create form container
    const formContainer = document.createElement('form');
    
    // State management
    let isMetric = true;
    
    formContainer.innerHTML = `
      <style>
        .vf-bmi-calculator {
          font-family: Arial, sans-serif;
          padding: 20px;
          background: #f9f9f9;
          border-radius: 8px;
          max-width: 400px;
        }
        .vf-bmi-calculator h3 {
          margin: 0 0 15px 0;
          color: #333;
          font-size: 18px;
          text-align: center;
        }
        .vf-bmi-calculator .input-group {
          margin-bottom: 15px;
        }
        .vf-bmi-calculator label {
          display: block;
          font-size: 14px;
          color: #555;
          margin-bottom: 5px;
          font-weight: 500;
        }
        .vf-bmi-calculator input[type="number"] {
          width: 100%;
          padding: 10px;
          border: 2px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          box-sizing: border-box;
          transition: border-color 0.2s;
        }
        .vf-bmi-calculator input[type="number"]:focus {
          outline: none;
          border-color: ${color};
        }
        .vf-bmi-calculator input[type="number"].invalid {
          border-color: #d32f2f;
        }
        .vf-bmi-calculator .imperial-height {
          display: flex;
          gap: 10px;
        }
        .vf-bmi-calculator .imperial-height input {
          flex: 1;
        }
        .vf-bmi-calculator .unit-toggle {
          text-align: center;
          margin-bottom: 15px;
        }
        .vf-bmi-calculator .unit-toggle button {
          background: transparent;
          border: none;
          color: ${color};
          text-decoration: underline;
          cursor: pointer;
          font-size: 12px;
          padding: 5px;
        }
        .vf-bmi-calculator .unit-toggle button:hover {
          opacity: 0.8;
        }
        .vf-bmi-calculator .button-group {
          display: flex;
          gap: 10px;
          margin-top: 20px;
        }
        .vf-bmi-calculator button[type="submit"] {
          flex: 1;
          background: ${color};
          color: #fff;
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
        }
        .vf-bmi-calculator button[type="submit"]:hover {
          opacity: 0.9;
        }
        .vf-bmi-calculator button[type="submit"]:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .vf-bmi-calculator .cancel-btn {
          flex: 1;
          background: #fff;
          color: #666;
          padding: 12px 24px;
          border: 2px solid #ddd;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
        }
        .vf-bmi-calculator .cancel-btn:hover {
          background: #f5f5f5;
        }
        .vf-bmi-calculator .error-message {
          color: #d32f2f;
          font-size: 12px;
          margin-top: 5px;
          display: none;
        }
        .vf-bmi-calculator .result-message {
          text-align: center;
          padding: 15px;
          border-radius: 6px;
          margin-top: 15px;
          font-weight: 600;
        }
        .vf-bmi-calculator .result-message.success {
          background: #e8f5e9;
          color: #2e7d32;
        }
        .vf-bmi-calculator .result-message.error {
          background: #ffebee;
          color: #c62828;
        }
        .vf-bmi-calculator .result-message.info {
          background: #e3f2fd;
          color: #1565c0;
        }
      </style>
      <div class="vf-bmi-calculator">
        <h3>${title}</h3>
        
        <div class="unit-toggle">
          <button type="button" class="toggle-unit-btn">${switchToImperialText}</button>
        </div>
        
        <div class="metric-inputs">
          <div class="input-group">
            <label for="height-metric">${metricHeightLabel}</label>
            <input type="number" id="height-metric" name="height-metric" placeholder="170" min="0" step="0.1">
            <div class="error-message">Please enter a valid height</div>
          </div>
          
          <div class="input-group">
            <label for="weight-metric">${metricWeightLabel}</label>
            <input type="number" id="weight-metric" name="weight-metric" placeholder="70" min="0" step="0.1">
            <div class="error-message">Please enter a valid weight</div>
          </div>
        </div>
        
        <div class="imperial-inputs" style="display: none;">
          <div class="input-group">
            <label>${imperialHeightLabel}</label>
            <div class="imperial-height">
              <input type="number" id="height-feet" name="height-feet" placeholder="Feet" min="0" step="1">
              <input type="number" id="height-inches" name="height-inches" placeholder="Inches" min="0" max="11" step="0.1">
            </div>
            <div class="error-message">Please enter a valid height</div>
          </div>
          
          <div class="input-group">
            <label for="weight-imperial">${imperialWeightLabel}</label>
            <input type="number" id="weight-imperial" name="weight-imperial" placeholder="Pounds" min="0" step="0.1">
            <div class="error-message">Please enter a valid weight</div>
          </div>
        </div>
        
        <div class="button-group">
          <button type="button" class="cancel-btn">${cancelText}</button>
          <button type="submit">${submitText}</button>
        </div>
        
        <div class="result-message" style="display: none;"></div>
      </div>
    `;
    
    // Get elements
    const toggleBtn = formContainer.querySelector('.toggle-unit-btn');
    const metricInputs = formContainer.querySelector('.metric-inputs');
    const imperialInputs = formContainer.querySelector('.imperial-inputs');
    const cancelBtn = formContainer.querySelector('.cancel-btn');
    const resultMessage = formContainer.querySelector('.result-message');
    
    // Toggle between metric and imperial
    toggleBtn.addEventListener('click', () => {
      isMetric = !isMetric;
      
      if (isMetric) {
        metricInputs.style.display = 'block';
        imperialInputs.style.display = 'none';
        toggleBtn.textContent = switchToImperialText;
      } else {
        metricInputs.style.display = 'none';
        imperialInputs.style.display = 'block';
        toggleBtn.textContent = switchToMetricText;
      }
    });
    
    // Cancel button
    cancelBtn.addEventListener('click', () => {
      window.voiceflow.chat.interact({
        type: 'complete',
        payload: { action: 'cancelled' }
      });
    });
    
    // Form submission
    formContainer.addEventListener('submit', (event) => {
      event.preventDefault();
      
      let heightCm, weightKg;
      let originalFeet, originalInches, originalPounds;
      
      // Get values based on current unit system
      if (isMetric) {
        heightCm = parseFloat(formContainer.querySelector('#height-metric').value);
        weightKg = parseFloat(formContainer.querySelector('#weight-metric').value);
      } else {
        originalFeet = parseFloat(formContainer.querySelector('#height-feet').value) || 0;
        originalInches = parseFloat(formContainer.querySelector('#height-inches').value) || 0;
        originalPounds = parseFloat(formContainer.querySelector('#weight-imperial').value);
        
        heightCm = (originalFeet * 30.48) + (originalInches * 2.54);
        weightKg = originalPounds * 0.453592;
      }
      
      // Validate inputs
      if (!heightCm || heightCm <= 0 || !weightKg || weightKg <= 0) {
        alert('Please enter valid height and weight values');
        return;
      }
      
      // Calculate BMI
      const heightM = heightCm / 100;
      const bmi = weightKg / (heightM * heightM);
      const bmiRounded = Math.round(bmi * 10) / 10;
      
      console.log('[VF] BMI Calculated:', {
        height: heightCm + ' cm',
        weight: weightKg + ' kg',
        bmi: bmiRounded,
        threshold: bmiThreshold,
        eligible: bmi >= bmiThreshold
      });
      
      // Show processing message
      resultMessage.textContent = successMessage;
      resultMessage.className = 'result-message info';
      resultMessage.style.display = 'block';
      
      // Simulate processing delay
      setTimeout(() => {
        const isEligible = bmi >= bmiThreshold;
        
        // Show result
        resultMessage.textContent = isEligible ? eligibleMessage : ineligibleMessage;
        resultMessage.className = isEligible ? 'result-message success' : 'result-message error';
        
        // Prepare height and weight data with formatting
        let heightData, weightData;
        
        if (isMetric) {
          heightData = {
            value: heightCm,
            unit: 'cm',
            formatted: heightCm.toFixed(1) + ' cm'
          };
          weightData = {
            value: weightKg,
            unit: 'kg',
            formatted: weightKg.toFixed(1) + ' kg'
          };
        } else {
          heightData = {
            value: { feet: originalFeet, inches: originalInches },
            unit: 'ft/in',
            formatted: `${originalFeet}' ${originalInches}"`
          };
          weightData = {
            value: originalPounds,
            unit: 'lb',
            formatted: originalPounds.toFixed(1) + ' lb'
          };
        }
        
        // Send result back to Voiceflow after a short delay
        setTimeout(() => {
          window.voiceflow.chat.interact({
            type: 'complete',
            payload: {
              action: 'calculated',
              bmi: bmiRounded,
              eligible: isEligible,
              unit: isMetric ? 'metric' : 'imperial',
              height: heightData,
              weight: weightData,
              threshold: bmiThreshold
            }
          });
        }, 1500);
      }, 500);
    });
    
    element.appendChild(formContainer);
  }
};