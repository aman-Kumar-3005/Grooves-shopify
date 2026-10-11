(() => {
  'use strict';

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  document.querySelectorAll('[data-g-track]').forEach((section) => {
    const lookupEndpoint = section.dataset.endpoint || '/apps/grooves-support/status';
    const createEndpoint = section.dataset.createEndpoint || '/apps/grooves-support/create-ticket';
    const dropzone = section.querySelector('[data-dropzone]');
    const fileInput = section.querySelector('.g-track__file-input');
    const fileListContainer = section.querySelector('[data-file-list]');
    let attachedFiles = [];

    const updateFileChips = () => {
      if (!fileListContainer) return;
      fileListContainer.innerHTML = '';
      attachedFiles.forEach((file, index) => {
        const chip = document.createElement('span');
        chip.className = 'g-track__file-chip';
        chip.innerHTML = `<span>📄 ${escapeHtml(file.name)} (${Math.ceil(file.size / 1024)} KB)</span><button type="button" class="g-track__file-chip-remove" aria-label="Remove ${escapeHtml(file.name)}">&times;</button>`;
        chip.querySelector('button').addEventListener('click', (event) => {
          event.stopPropagation();
          attachedFiles.splice(index, 1);
          updateFileChips();
        });
        fileListContainer.appendChild(chip);
      });
    };

    const addFiles = (files) => {
      [...files].forEach((file) => {
        const allowed = file.type.startsWith('image/') || file.type === 'application/pdf';
        if (!allowed || file.size > 10 * 1024 * 1024 || attachedFiles.length >= 5) return;
        attachedFiles.push(file);
      });
      updateFileChips();
    };

    if (dropzone && fileInput) {
      fileInput.addEventListener('change', () => addFiles(fileInput.files || []));
      ['dragenter', 'dragover'].forEach((name) => dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.add('is-dragover');
      }));
      ['dragleave', 'drop'].forEach((name) => dropzone.addEventListener(name, (event) => {
        event.preventDefault();
        dropzone.classList.remove('is-dragover');
      }));
      dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer?.files || []));
    }

    section.querySelectorAll('[data-lookup]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const type = form.dataset.lookup;
        const referenceInput = form.querySelector('[name="reference"]');
        const emailInput = form.querySelector('[name="email"]');
        const button = form.querySelector('button[type="submit"]');
        const result = form.querySelector('[data-result]');
        const reference = referenceInput.value.trim();
        const email = emailInput.value.trim().toLowerCase();

        result.hidden = false;
        result.innerHTML = '';
        if (!reference || reference.length > 80 || !EMAIL_PATTERN.test(email)) {
          result.dataset.state = 'error';
          result.textContent = 'Valid number aur registered email dono enter karein.';
          (!reference ? referenceInput : emailInput).focus();
          return;
        }

        setLoading(button, result, type === 'warranty' ? 'Shopify order verify ho raha hai…' : 'Ticket verify ho raha hai…');
        try {
          const response = await fetch(lookupEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ type, reference, email }),
            credentials: 'same-origin'
          });
          const data = await readJson(response);
          if (!response.ok) throw new LookupError(response.status, data.error);
          if (!data?.status) throw new LookupError(502, 'Invalid server response.');
          result.dataset.state = 'success';
          if (type === 'warranty') renderWarrantyResult(result, data, section);
          else renderTicketResult(result, data);
        } catch (error) {
          result.dataset.state = 'error';
          if (error.status === 404) result.innerHTML = '<strong>No data found.</strong><br>Order/ticket number aur registered email check karke dobara try karein.';
          else if (error.status === 429) result.textContent = 'Bahut zyada attempts hue hain. Kripya thodi der baad try karein.';
          else if (error.status === 503) result.textContent = 'Live order service abhi configure nahi hai. Support team se contact karein.';
          else result.textContent = 'Status service abhi available nahi hai. Kripya kuch der baad try karein.';
        } finally {
          button.disabled = false;
          button.removeAttribute('aria-busy');
        }
      });
    });

    const createForm = section.querySelector('[data-create-ticket]');
    if (createForm) createForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitButton = createForm.querySelector('button[type="submit"]');
      const result = section.querySelector('[data-create-result]');
      if (!createForm.reportValidity()) return;
      const fields = {
        name: createForm.querySelector('[name="customer_name"]').value.trim(),
        email: createForm.querySelector('[name="customer_email"]').value.trim().toLowerCase(),
        invoice: createForm.querySelector('[name="invoice_number"]').value.trim(),
        product: createForm.querySelector('[name="product_name"]').value,
        category: createForm.querySelector('[name="issue_category"]').value,
        description: createForm.querySelector('[name="issue_description"]').value.trim()
      };

      result.hidden = false;
      setLoading(submitButton, result, 'Order verify karke support ticket create ho raha hai…');
      try {
        const payload = new FormData();
        Object.entries(fields).forEach(([key, value]) => payload.append(key, value));
        attachedFiles.forEach((file) => payload.append('attachments', file));
        const response = await fetch(createEndpoint, { method: 'POST', body: payload, credentials: 'same-origin' });
        const data = await readJson(response);
        if (!response.ok) throw new LookupError(response.status, data.error);
        result.dataset.state = 'success';
        result.innerHTML = `<div class="g-create-success-card"><span class="g-create-success-icon" aria-hidden="true">✓</span><h3>Support ticket created</h3><p>Is number ko safely save karein:</p><div class="g-create-ticket-number">${escapeHtml(data.ticketNumber)}</div><p>Ticket status registered email ke saath securely check hoga.</p><div class="g-create-actions"><button type="button" class="g-btn-copy" data-copy-btn>Copy Ticket ID</button><button type="button" class="g-btn-track-now" data-track-now>Track Now</button></div></div>`;
        result.querySelector('[data-copy-btn]')?.addEventListener('click', async (copyEvent) => {
          await navigator.clipboard.writeText(data.ticketNumber);
          copyEvent.currentTarget.textContent = 'Copied';
        });
        result.querySelector('[data-track-now]')?.addEventListener('click', () => {
          const ticketForm = section.querySelector('[data-lookup="ticket"]');
          ticketForm.querySelector('[name="reference"]').value = data.ticketNumber;
          ticketForm.querySelector('[name="email"]').value = fields.email;
          ticketForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
          ticketForm.requestSubmit();
        });
        createForm.reset();
        attachedFiles = [];
        updateFileChips();
      } catch (error) {
        result.dataset.state = 'error';
        result.textContent = error.status === 404 ? 'No matching Shopify order found. Order number aur checkout email verify karein.' : (error.message || 'Ticket create nahi ho paya. Kripya dobara try karein.');
      } finally {
        submitButton.disabled = false;
        submitButton.removeAttribute('aria-busy');
      }
    });
  });

  function renderWarrantyResult(container, data, section) {
    const statusKey = String(data.status).toLowerCase();
    const isActive = statusKey === 'active';
    const statusLabel = isActive ? '● Active Warranty' : (statusKey === 'expired' ? '● Warranty Expired' : '● Warranty Unavailable');
    const duration = Number(data.durationDays) || 365;
    const remaining = Math.max(0, Number(data.remainingDays) || 0);
    const percent = Math.min(100, Math.round((remaining / duration) * 100));
    const total = data.total ? formatMoney(data.total.amount, data.total.currencyCode) : '—';
    const items = Array.isArray(data.items) ? data.items : [];
    container.innerHTML = `<div class="g-status-card"><div class="g-status-header"><div><span class="g-status-kicker">Verified Shopify Order</span><h4 class="g-status-title">${escapeHtml(data.orderNumber)}</h4></div><span class="g-status-badge ${isActive ? 'g-status-badge--active' : 'g-status-badge--expired'}">${statusLabel}</span></div><div class="g-status-details-grid"><div class="g-status-detail-item"><span class="g-status-detail-label">Purchase date</span><span class="g-status-detail-value">${formatDate(data.purchaseDate)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Order total</span><span class="g-status-detail-value">${escapeHtml(total)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Payment</span><span class="g-status-detail-value">${prettyStatus(data.financialStatus)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Fulfilment</span><span class="g-status-detail-value">${prettyStatus(data.fulfillmentStatus)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Warranty term</span><span class="g-status-detail-value">${duration} days</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Remaining coverage</span><span class="g-status-detail-value ${isActive ? 'is-active' : 'is-expired'}">${remaining} days</span></div></div>${items.length ? `<div class="g-order-items"><span class="g-status-detail-label">Products</span>${items.map((item) => `<div><span>${escapeHtml(item.title)}</span><strong>× ${Number(item.quantity) || 1}</strong></div>`).join('')}</div>` : ''}<div class="g-warranty-progress-wrap"><div class="g-warranty-progress-label"><span>Warranty coverage</span><span>${percent}% remaining</span></div><div class="g-warranty-bar"><div class="g-warranty-fill ${!isActive ? 'g-warranty-fill--expired' : (percent < 25 ? 'g-warranty-fill--low' : '')}" style="width:${percent}%"></div></div></div>${isActive ? '<button type="button" class="g-btn-action-inline" data-claim-btn>Raise warranty ticket</button>' : ''}</div>`;
    container.querySelector('[data-claim-btn]')?.addEventListener('click', () => {
      const createSection = section.querySelector('#create-ticket-section');
      if (!createSection) return;
      createSection.querySelector('[name="invoice_number"]').value = data.orderNumber;
      createSection.querySelector('[name="customer_email"]').value = data.verifiedEmail || '';
      createSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderTicketResult(container, data) {
    const key = String(data.status).toLowerCase();
    const badge = key.includes('progress') ? 'g-status-badge--in-progress' : (key.includes('resolved') || key.includes('closed') ? 'g-status-badge--resolved' : 'g-status-badge--open');
    container.innerHTML = `<div class="g-status-card"><div class="g-status-header"><h4 class="g-status-title">${escapeHtml(data.ticketNumber)}</h4><span class="g-status-badge ${badge}">● ${escapeHtml(data.status)}</span></div><div class="g-status-details-grid"><div class="g-status-detail-item"><span class="g-status-detail-label">Product / subject</span><span class="g-status-detail-value">${escapeHtml(data.product || data.category || 'Grooves Product')}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Last updated</span><span class="g-status-detail-value">${formatDate(data.updatedAt, true)}</span></div></div>${data.notes ? `<div class="g-status-note"><strong>Support update</strong>${escapeHtml(data.notes)}</div>` : ''}</div>`;
  }

  function setLoading(button, result, message) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    result.dataset.state = 'loading';
    result.textContent = message;
  }
  async function readJson(response) { try { return await response.json(); } catch (_) { return {}; } }
  function formatDate(value, includeTime = false) {
    if (!value) return '—';
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    if (includeTime) Object.assign(options, { hour: '2-digit', minute: '2-digit' });
    return new Date(value).toLocaleDateString('en-IN', options);
  }
  function formatMoney(amount, currency) { try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR' }).format(Number(amount)); } catch (_) { return `${currency || ''} ${amount || ''}`.trim(); } }
  function prettyStatus(value) { return escapeHtml(String(value || 'Unknown').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
  class LookupError extends Error { constructor(status, message) { super(message || 'Request failed.'); this.status = status; } }
})();
