(() => {
  'use strict';

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_FILES = 5;

  document.querySelectorAll('[data-g-track]').forEach((section) => {
    const lookupEndpoint = section.dataset.endpoint || '/apps/grooves-support/status';
    const registerEndpoint = section.dataset.registerEndpoint || '/apps/grooves-support/register-warranty';
    const createEndpoint = section.dataset.createEndpoint || '/apps/grooves-support/create-ticket';
    const dropzone = section.querySelector('[data-dropzone]');
    const fileInput = section.querySelector('.g-track__file-input');
    const fileListContainer = section.querySelector('[data-file-list]');
    const registerForm = section.querySelector('[data-register-warranty]');
    const createForm = section.querySelector('[data-create-ticket]');
    let attachedFiles = [];
    let verifiedOrder = null;

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
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type);
        if (!allowed || file.size > MAX_FILE_SIZE || attachedFiles.length >= MAX_FILES) return;
        const duplicate = attachedFiles.some((current) => current.name === file.name && current.size === file.size);
        if (!duplicate) attachedFiles.push(file);
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

    const hydrateVerifiedOrder = (data) => {
      verifiedOrder = data;
      [registerForm, createForm].forEach((form) => {
        if (!form) return;
        const invoice = form.querySelector('[name="invoice_number"]');
        const email = form.querySelector('[name="customer_email"]');
        if (invoice) invoice.value = data.orderNumber || '';
        if (email) email.value = data.verifiedEmail || '';
        const select = form.querySelector('[data-order-product-select]');
        if (select) {
          select.innerHTML = '<option value="">Select a purchased product</option>';
          (data.items || []).forEach((item) => {
            const option = document.createElement('option');
            option.value = item.lineItemId;
            option.textContent = `${item.title}${item.sku ? ` — ${item.sku}` : ''}${item.registered ? ' — Warranty registered' : ''}`;
            select.appendChild(option);
          });
          select.disabled = !(data.items || []).length;
        }
        const submit = form.querySelector('[data-register-submit], [data-ticket-submit]');
        const registrationBlocked = form === registerForm && String(data.status).toLowerCase() !== 'active';
        if (submit) submit.disabled = !(data.items || []).length || registrationBlocked;
      });
    };

    const prepareAction = (action, lineItemId) => {
      const form = action === 'register' ? registerForm : createForm;
      if (!form || !verifiedOrder) return;
      const select = form.querySelector('[data-order-product-select]');
      if (select && lineItemId) select.value = lineItemId;
      if (action !== 'register') {
        const requestType = form.querySelector('[name="request_type"]');
        if (requestType) requestType.value = action;
      }
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form.querySelector('[name="customer_name"]')?.focus({ preventScroll: true });
    };

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

        setLoading(button, result, type === 'warranty' ? 'Shopify order securely verify ho raha hai…' : 'Ticket status load ho raha hai…');
        try {
          const response = await fetch(lookupEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ type, reference, email }),
            credentials: 'same-origin'
          });
          const data = await readJson(response);
          if (!response.ok) throw new RequestError(response.status, data.error);
          if (!data?.status) throw new RequestError(502, 'Invalid server response.');
          result.dataset.state = 'success';
          if (type === 'warranty') {
            if (data.lookupType === 'order') hydrateVerifiedOrder(data);
            renderWarrantyResult(result, data, prepareAction);
          } else {
            renderTicketResult(result, data);
          }
        } catch (error) {
          result.dataset.state = 'error';
          result.innerHTML = errorMessage(error);
        } finally {
          stopLoading(button);
        }
      });
    });

    if (registerForm) registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitButton = registerForm.querySelector('button[type="submit"]');
      const result = section.querySelector('[data-register-result]');
      if (!verifiedOrder) {
        result.hidden = false;
        result.dataset.state = 'error';
        result.textContent = 'Pehle order number aur checkout email verify karein.';
        return;
      }
      if (!registerForm.reportValidity()) return;
      const payload = {
        name: valueOf(registerForm, 'customer_name'),
        email: valueOf(registerForm, 'customer_email').toLowerCase(),
        phone: valueOf(registerForm, 'customer_phone'),
        invoice: valueOf(registerForm, 'invoice_number'),
        lineItemId: valueOf(registerForm, 'line_item_id'),
        serialNumber: valueOf(registerForm, 'serial_number')
      };
      result.hidden = false;
      setLoading(submitButton, result, 'Warranty registration save ho rahi hai…');
      try {
        const response = await fetch(registerEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'same-origin'
        });
        const data = await readJson(response);
        if (!response.ok) throw new RequestError(response.status, data.error);
        const warranty = data.warranty || {};
        result.dataset.state = 'success';
        result.innerHTML = `<div class="g-create-success-card"><span class="g-create-success-icon" aria-hidden="true">✓</span><h3>${data.created ? 'Warranty registered' : 'Warranty already registered'}</h3><p>Your secure warranty ID:</p><div class="g-create-ticket-number">${escapeHtml(warranty.warrantyId)}</div><p>${escapeHtml(warranty.product || '')} — ${Number(warranty.remainingDays) || 0} coverage days remaining.</p><div class="g-create-actions"><button type="button" class="g-btn-copy" data-copy-value="${escapeHtml(warranty.warrantyId)}">Copy Warranty ID</button><button type="button" class="g-btn-track-now" data-claim-warranty>Raise Claim</button></div></div>`;
        bindCopyButton(result);
        result.querySelector('[data-claim-warranty]')?.addEventListener('click', () => prepareAction('warranty_claim', payload.lineItemId));
        const item = verifiedOrder.items?.find((entry) => entry.lineItemId === payload.lineItemId);
        if (item) {
          item.registered = true;
          item.warrantyId = warranty.warrantyId;
        }
      } catch (error) {
        result.dataset.state = 'error';
        result.innerHTML = errorMessage(error);
      } finally {
        stopLoading(submitButton);
      }
    });

    if (createForm) createForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitButton = createForm.querySelector('button[type="submit"]');
      const result = section.querySelector('[data-create-result]');
      if (!verifiedOrder) {
        result.hidden = false;
        result.dataset.state = 'error';
        result.textContent = 'Pehle order number aur checkout email verify karein.';
        return;
      }
      if (!createForm.reportValidity()) return;
      const fields = {
        name: valueOf(createForm, 'customer_name'),
        email: valueOf(createForm, 'customer_email').toLowerCase(),
        phone: valueOf(createForm, 'customer_phone'),
        invoice: valueOf(createForm, 'invoice_number'),
        lineItemId: valueOf(createForm, 'line_item_id'),
        requestType: valueOf(createForm, 'request_type'),
        category: valueOf(createForm, 'issue_category'),
        description: valueOf(createForm, 'issue_description'),
        serialNumber: valueOf(createForm, 'serial_number')
      };

      result.hidden = false;
      setLoading(submitButton, result, 'Order eligibility verify karke service request create ho rahi hai…');
      try {
        const payload = new FormData();
        Object.entries(fields).forEach(([key, value]) => payload.append(key, value));
        attachedFiles.forEach((file) => payload.append('attachments', file));
        const response = await fetch(createEndpoint, { method: 'POST', body: payload, credentials: 'same-origin' });
        const data = await readJson(response);
        if (!response.ok) throw new RequestError(response.status, data.error);
        result.dataset.state = 'success';
        result.innerHTML = `<div class="g-create-success-card"><span class="g-create-success-icon" aria-hidden="true">✓</span><h3>Service request created</h3><p>${escapeHtml(formatRequestType(fields.requestType))} ticket safely save karein:</p><div class="g-create-ticket-number">${escapeHtml(data.ticketNumber)}</div>${data.warrantyId ? `<p>Linked warranty: <strong>${escapeHtml(data.warrantyId)}</strong></p>` : ''}<p>Status registered email ke saath securely track hoga.</p><div class="g-create-actions"><button type="button" class="g-btn-copy" data-copy-value="${escapeHtml(data.ticketNumber)}">Copy Ticket ID</button><button type="button" class="g-btn-track-now" data-track-now>Track Now</button></div></div>`;
        bindCopyButton(result);
        result.querySelector('[data-track-now]')?.addEventListener('click', () => {
          const ticketForm = section.querySelector('[data-lookup="ticket"]');
          ticketForm.querySelector('[name="reference"]').value = data.ticketNumber;
          ticketForm.querySelector('[name="email"]').value = fields.email;
          ticketForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
          ticketForm.requestSubmit();
        });
        createForm.querySelector('[name="issue_description"]').value = '';
        createForm.querySelector('[name="serial_number"]').value = '';
        attachedFiles = [];
        if (fileInput) fileInput.value = '';
        updateFileChips();
      } catch (error) {
        result.dataset.state = 'error';
        result.innerHTML = errorMessage(error);
      } finally {
        stopLoading(submitButton);
      }
    });
  });

  function renderWarrantyResult(container, data, prepareAction) {
    if (data.lookupType === 'registration') {
      const active = String(data.status).toLowerCase() === 'active';
      container.innerHTML = `<div class="g-status-card"><div class="g-status-header"><div><span class="g-status-kicker">Registered Warranty</span><h4 class="g-status-title">${escapeHtml(data.warrantyId)}</h4></div><span class="g-status-badge ${active ? 'g-status-badge--active' : 'g-status-badge--expired'}">● ${escapeHtml(data.status)}</span></div><div class="g-status-details-grid"><div class="g-status-detail-item"><span class="g-status-detail-label">Product</span><span class="g-status-detail-value">${escapeHtml(data.product)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Order</span><span class="g-status-detail-value">${escapeHtml(data.orderNumber)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Registered</span><span class="g-status-detail-value">${formatDate(data.registeredAt)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Coverage ends</span><span class="g-status-detail-value">${formatDate(data.expiresAt)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Remaining</span><span class="g-status-detail-value ${active ? 'is-active' : 'is-expired'}">${Number(data.remainingDays) || 0} days</span></div></div></div>`;
      return;
    }

    const statusKey = String(data.status).toLowerCase();
    const isActive = statusKey === 'active';
    const duration = Number(data.durationDays) || 365;
    const remaining = Math.max(0, Number(data.remainingDays) || 0);
    const percent = Math.min(100, Math.round((remaining / duration) * 100));
    const total = data.total ? formatMoney(data.total.amount, data.total.currencyCode) : '—';
    const items = Array.isArray(data.items) ? data.items : [];
    const returnText = data.returnEligible ? `${Number(data.returnDaysRemaining) || 0} days remaining` : 'Window closed';
    container.innerHTML = `<div class="g-status-card"><div class="g-status-header"><div><span class="g-status-kicker">${data.testOrder ? 'Verified Shopify Test Order' : 'Verified Shopify Order'}</span><h4 class="g-status-title">${escapeHtml(data.orderNumber)}</h4></div><span class="g-status-badge ${isActive ? 'g-status-badge--active' : 'g-status-badge--expired'}">● ${escapeHtml(data.status)}</span></div><div class="g-status-details-grid"><div class="g-status-detail-item"><span class="g-status-detail-label">Purchase date</span><span class="g-status-detail-value">${formatDate(data.purchaseDate)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Order total</span><span class="g-status-detail-value">${escapeHtml(total)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Payment</span><span class="g-status-detail-value">${prettyStatus(data.financialStatus)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Fulfilment</span><span class="g-status-detail-value">${prettyStatus(data.fulfillmentStatus)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Warranty remaining</span><span class="g-status-detail-value ${isActive ? 'is-active' : 'is-expired'}">${remaining} days</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Return eligibility</span><span class="g-status-detail-value ${data.returnEligible ? 'is-active' : 'is-expired'}">${returnText}</span></div></div><div class="g-warranty-progress-wrap"><div class="g-warranty-progress-label"><span>Warranty coverage</span><span>${percent}% remaining</span></div><div class="g-warranty-bar"><div class="g-warranty-fill ${!isActive ? 'g-warranty-fill--expired' : (percent < 25 ? 'g-warranty-fill--low' : '')}" style="width:${percent}%"></div></div></div>${items.length ? `<div class="g-order-items"><span class="g-status-detail-label">Purchased products</span>${items.map((item) => `<div class="g-order-product"><div><span>${escapeHtml(item.title)}</span><small>${item.sku ? `SKU: ${escapeHtml(item.sku)} · ` : ''}Qty ${Number(item.quantity) || 1}${item.registered ? ` · Warranty ${escapeHtml(item.warrantyId)}` : ''}</small></div><div class="g-order-product__actions">${item.registered || !isActive ? '' : `<button type="button" data-order-action="register" data-line-item="${escapeHtml(item.lineItemId)}">Register</button>`}${isActive ? `<button type="button" data-order-action="warranty_claim" data-line-item="${escapeHtml(item.lineItemId)}">Claim</button>` : ''}${data.returnEligible ? `<button type="button" data-order-action="return" data-line-item="${escapeHtml(item.lineItemId)}">Return</button>` : ''}</div></div>`).join('')}</div>` : ''}</div>`;
    container.querySelectorAll('[data-order-action]').forEach((button) => button.addEventListener('click', () => prepareAction(button.dataset.orderAction, button.dataset.lineItem)));
  }

  function renderTicketResult(container, data) {
    const key = String(data.status).toLowerCase();
    const badge = key.includes('review') || key.includes('transit') || key.includes('processing') || key.includes('scheduled')
      ? 'g-status-badge--in-progress'
      : (key.includes('resolved') || key.includes('closed') || key.includes('approved') ? 'g-status-badge--resolved' : 'g-status-badge--open');
    const timeline = Array.isArray(data.timeline) ? data.timeline : [];
    container.innerHTML = `<div class="g-status-card"><div class="g-status-header"><div><span class="g-status-kicker">${escapeHtml(formatRequestType(data.requestType || 'support'))}</span><h4 class="g-status-title">${escapeHtml(data.ticketNumber)}</h4></div><span class="g-status-badge ${badge}">● ${escapeHtml(data.status)}</span></div><div class="g-status-details-grid"><div class="g-status-detail-item"><span class="g-status-detail-label">Product</span><span class="g-status-detail-value">${escapeHtml(data.product || data.category || 'Grooves Product')}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Order</span><span class="g-status-detail-value">${escapeHtml(data.orderNumber || '—')}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Created</span><span class="g-status-detail-value">${formatDate(data.createdAt, true)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Last updated</span><span class="g-status-detail-value">${formatDate(data.updatedAt, true)}</span></div></div>${data.notes ? `<div class="g-status-note"><strong>Latest support update</strong>${escapeHtml(data.notes)}</div>` : ''}${timeline.length ? `<ol class="g-ticket-timeline">${timeline.map((entry) => `<li><span></span><div><strong>${escapeHtml(entry.status)}</strong><p>${escapeHtml(entry.note)}</p><small>${formatDate(entry.at, true)}</small></div></li>`).join('')}</ol>` : ''}</div>`;
  }

  function valueOf(form, name) {
    return String(form.querySelector(`[name="${name}"]`)?.value || '').trim();
  }

  function setLoading(button, result, message) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    result.dataset.state = 'loading';
    result.textContent = message;
  }

  function stopLoading(button) {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }

  function bindCopyButton(root) {
    root.querySelector('[data-copy-value]')?.addEventListener('click', async (event) => {
      try {
        await navigator.clipboard.writeText(event.currentTarget.dataset.copyValue || '');
        event.currentTarget.textContent = 'Copied';
      } catch (_) {
        event.currentTarget.textContent = 'Copy unavailable';
      }
    });
  }

  function errorMessage(error) {
    if (error.status === 404) return '<strong>No data found.</strong><br>Order/ticket number aur registered email check karke dobara try karein.';
    if (error.status === 409) return `<strong>Request not eligible.</strong><br>${escapeHtml(error.message)}`;
    if (error.status === 429) return 'Bahut zyada attempts hue hain. Kripya thodi der baad try karein.';
    if (error.status === 503) return 'Live Shopify service abhi configure nahi hai. Support team se contact karein.';
    return escapeHtml(error.message || 'Service abhi available nahi hai. Kripya kuch der baad try karein.');
  }

  async function readJson(response) {
    try { return await response.json(); } catch (_) { return {}; }
  }

  function formatDate(value, includeTime = false) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    if (includeTime) Object.assign(options, { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('en-IN', options);
  }

  function formatMoney(amount, currency) {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR' }).format(Number(amount)); }
    catch (_) { return `${currency || ''} ${amount || ''}`.trim(); }
  }

  function prettyStatus(value) {
    return escapeHtml(String(value || 'Unknown').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()));
  }

  function formatRequestType(value) {
    return String(value || 'Support').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  class RequestError extends Error {
    constructor(status, message) {
      super(message || 'Request failed.');
      this.status = status;
    }
  }
})();
