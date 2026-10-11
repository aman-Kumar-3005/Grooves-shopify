(() => {
  'use strict';

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_FILES = 5;

  const HOSTINGER_BASE = 'https://maroon-camel-617271.hostingersite.com';
  const VERIFY_URLS = [
    `${HOSTINGER_BASE}/api/verify.php`,
    `${HOSTINGER_BASE}/api/verify`,
    `${HOSTINGER_BASE}/verify.php`
  ];
  const DISCOVER_URLS = [
    `${HOSTINGER_BASE}/api/discover-orders.php`,
    `${HOSTINGER_BASE}/api/discover-orders`
  ];
  const REGISTER_URLS = [
    `${HOSTINGER_BASE}/api/register-warranty.php`,
    `${HOSTINGER_BASE}/api/register-warranty`,
    `${HOSTINGER_BASE}/register.php`
  ];
  const CREATE_TICKET_URLS = [
    `${HOSTINGER_BASE}/api/create-ticket.php`,
    `${HOSTINGER_BASE}/api/create-ticket`
  ];

  const getCandidateUrls = (attrValue, defaultList) => {
    if (attrValue && !attrValue.startsWith('/apps/')) {
      return [attrValue, ...defaultList];
    }
    return defaultList;
  };

  document.querySelectorAll('[data-g-track]').forEach((section) => {
    const lookupEndpoints = getCandidateUrls(section.dataset.endpoint, VERIFY_URLS);
    const discoverEndpoints = getCandidateUrls(section.dataset.discoverEndpoint, DISCOVER_URLS);
    const registerEndpoints = getCandidateUrls(section.dataset.registerEndpoint, REGISTER_URLS);
    const createEndpoints = getCandidateUrls(section.dataset.createEndpoint, CREATE_TICKET_URLS);

    const dropzone = section.querySelector('[data-dropzone]');
    const fileInput = section.querySelector('.g-track__file-input');
    const fileListContainer = section.querySelector('[data-file-list]');
    const registerForm = section.querySelector('[data-register-warranty]');
    const createForm = section.querySelector('[data-create-ticket]');
    const registerSection = section.querySelector('#register-warranty-section') || section.querySelector('.g-track__create-section');

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
      const orderNumber = data.orderNumber || data.order_number || data.name || '';
      const verifiedEmail = data.verifiedEmail || data.email || data.customer_email || '';
      const verifiedPhone = data.verifiedPhone || data.phone || data.customer_phone || '';
      const rawItems = Array.isArray(data.items)
        ? data.items
        : (Array.isArray(data.line_items) ? data.line_items : (Array.isArray(data.products) ? data.products : []));

      const normalizedItems = rawItems.map((item) => ({
        ...item,
        lineItemId: String(item.lineItemId || item.id || item.line_item_id || ''),
        title: item.title || item.name || 'Purchased Item',
        sku: item.sku || '',
        quantity: item.quantity || 1,
        registered: Boolean(item.registered || item.warranty_registered || item.warrantyId),
        warrantyId: item.warrantyId || item.warranty_id || ''
      }));

      verifiedOrder = {
        ...data,
        orderNumber,
        verifiedEmail,
        verifiedPhone,
        status: data.status || 'Active',
        items: normalizedItems
      };

      // Unlock 'REGISTER PRODUCT WARRANTY' section container
      if (registerSection) {
        registerSection.classList.remove('is-disabled');
        registerSection.classList.add('is-unlocked');
        registerSection.removeAttribute('aria-disabled');
      }

      // Populate & unlock register form and ticket form
      [registerForm, createForm].forEach((form) => {
        if (!form) return;
        const invoice = form.querySelector('[name="invoice_number"]');
        const email = form.querySelector('[name="customer_email"]');
        const phone = form.querySelector('[name="customer_phone"]');

        if (invoice) invoice.value = orderNumber;
        if (email) email.value = verifiedEmail;
        if (phone && verifiedPhone) phone.value = verifiedPhone;

        const select = form.querySelector('[data-order-product-select]');
        if (select) {
          select.innerHTML = '<option value="">Select a purchased product</option>';
          normalizedItems.forEach((item) => {
            const option = document.createElement('option');
            option.value = item.lineItemId;
            option.textContent = `${item.title}${item.sku ? ` — ${item.sku}` : ''}${item.registered ? ' — Warranty registered' : ''}`;
            select.appendChild(option);
          });
          select.disabled = !normalizedItems.length;
        }

        const submit = form.querySelector('[data-register-submit], [data-ticket-submit]');
        const registrationBlocked = form === registerForm && String(verifiedOrder.status).toLowerCase() !== 'active';
        if (submit) {
          submit.disabled = !normalizedItems.length || registrationBlocked;
        }
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

    const renderOrderChoices = (container, orders, referenceInput, phone) => {
      container.innerHTML = `<div class="g-status-card"><div class="g-status-header"><div><span class="g-status-kicker">Contact verified</span><h4 class="g-status-title">Select your order</h4></div><span class="g-status-badge g-status-badge--active">${orders.length} found</span></div><div class="g-order-items">${orders.map((order, index) => `<div class="g-order-product"><div><strong>${escapeHtml(order.orderNumber || order.order_number || order.name)}</strong><small>${formatDate(order.purchaseDate || order.created_at)} · ${(order.items || order.line_items || []).map((item) => escapeHtml(item.title || item.name)).join(', ')}</small></div><div class="g-order-product__actions"><button type="button" data-select-order="${index}">Select</button></div></div>`).join('')}</div></div>`;
      container.querySelectorAll('[data-select-order]').forEach((button) => button.addEventListener('click', () => {
        const order = orders[Number(button.dataset.selectOrder)];
        if (!order) return;
        order.verifiedPhone = phone;
        referenceInput.value = order.orderNumber || order.order_number || order.name || '';
        hydrateVerifiedOrder(order);
        renderWarrantyResult(container, verifiedOrder, prepareAction);
      }));
    };

    const fetchFirstAvailable = async (candidateUrls, options = {}) => {
      let lastResponse = null;
      let lastError = null;

      for (const url of candidateUrls) {
        try {
          const response = await fetch(url, options);
          lastResponse = response;
          if (response.status !== 404) {
            return response;
          }
        } catch (err) {
          lastError = err;
        }
      }

      if (lastResponse) return lastResponse;
      throw lastError || new RequestError(0, 'Network request failed. Please check your connection.');
    };

    section.querySelectorAll('[data-lookup]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const type = form.dataset.lookup;
        const referenceInput = form.querySelector('[name="reference"]');
        const emailInput = form.querySelector('[name="email"]');
        const phoneInput = form.querySelector('[name="phone"]');
        const button = form.querySelector('button[type="submit"]');
        const result = form.querySelector('[data-result]');
        const reference = referenceInput ? referenceInput.value.trim() : '';
        const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
        const phone = phoneInput?.value.trim() || '';

        result.hidden = false;
        result.innerHTML = '';
        const discoveringOrders = type === 'warranty' && !reference;
        if (reference.length > 80 || !EMAIL_PATTERN.test(email) || (discoveringOrders && phone.replace(/\D/g, '').length < 10) || (!discoveringOrders && !reference)) {
          result.dataset.state = 'error';
          result.textContent = discoveringOrders
            ? 'Orders fetch karne ke liye valid checkout email aur mobile number enter karein.'
            : 'Valid number aur registered email dono enter karein.';
          (!EMAIL_PATTERN.test(email) ? emailInput : (discoveringOrders ? phoneInput : referenceInput))?.focus();
          return;
        }

        setLoading(
          button,
          result,
          discoveringOrders
            ? 'Checkout contact se purchased products fetch ho rahe hain…'
            : (type === 'warranty' ? 'Shopify order securely verify ho raha hai…' : 'Ticket status load ho raha hai…')
        );

        try {
          const endpoints = discoveringOrders ? discoverEndpoints : lookupEndpoints;
          const payload = discoveringOrders
            ? { email, phone }
            : {
                type,
                reference,
                order_number: reference,
                orderNumber: reference,
                email
              };

          const response = await fetchFirstAvailable(endpoints, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const data = await readJson(response);

          if (!response.ok || data.success === false) {
            throw new RequestError(response.status, data.error || data.message);
          }

          result.dataset.state = 'success';
          if (discoveringOrders) {
            const orders = Array.isArray(data.orders) ? data.orders : (Array.isArray(data.data) ? data.data : []);
            if (!orders.length) throw new RequestError(404, 'No data found.');
            renderOrderChoices(result, orders, referenceInput, phone);
          } else if (type === 'warranty') {
            const orderData = data.order || data.data || data;
            const isRegistration = orderData.lookupType === 'registration' || Boolean(orderData.warrantyId && !orderData.items && !orderData.line_items);

            if (isRegistration) {
              renderWarrantyResult(result, orderData, prepareAction);
            } else {
              orderData.lookupType = 'order';
              orderData.verifiedPhone = phone || orderData.phone || orderData.customer_phone || '';
              orderData.verifiedEmail = email || orderData.email || orderData.customer_email || '';
              hydrateVerifiedOrder(orderData);
              renderWarrantyResult(result, verifiedOrder, prepareAction);
            }
          } else {
            const ticketData = data.ticket || data.data || data;
            renderTicketResult(result, ticketData);
          }
        } catch (error) {
          result.dataset.state = 'error';
          result.innerHTML = errorMessage(error);
        } finally {
          stopLoading(button);
        }
      });
    });

    if (registerForm) {
      registerForm.addEventListener('submit', async (event) => {
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
          order_number: valueOf(registerForm, 'invoice_number'),
          lineItemId: valueOf(registerForm, 'line_item_id'),
          line_item_id: valueOf(registerForm, 'line_item_id'),
          serialNumber: valueOf(registerForm, 'serial_number')
        };

        result.hidden = false;
        setLoading(submitButton, result, 'Warranty registration save ho rahi hai…');

        try {
          const response = await fetchFirstAvailable(registerEndpoints, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const data = await readJson(response);

          if (!response.ok || data.success === false) {
            throw new RequestError(response.status, data.error || data.message);
          }

          const warranty = data.warranty || data.data || {};
          result.dataset.state = 'success';
          result.innerHTML = `<div class="g-create-success-card"><span class="g-create-success-icon" aria-hidden="true">✓</span><h3>${data.created !== false ? 'Warranty registered' : 'Warranty already registered'}</h3><p>Your secure warranty ID:</p><div class="g-create-ticket-number">${escapeHtml(warranty.warrantyId || warranty.warranty_id || '')}</div><p>${escapeHtml(warranty.product || '')} — ${Number(warranty.remainingDays || warranty.remaining_days) || 0} coverage days remaining.</p><div class="g-create-actions"><button type="button" class="g-btn-copy" data-copy-value="${escapeHtml(warranty.warrantyId || warranty.warranty_id || '')}">Copy Warranty ID</button><button type="button" class="g-btn-track-now" data-claim-warranty>Raise Claim</button></div></div>`;
          bindCopyButton(result);

          result.querySelector('[data-claim-warranty]')?.addEventListener('click', () => prepareAction('warranty_claim', payload.lineItemId));

          const item = verifiedOrder.items?.find((entry) => entry.lineItemId === payload.lineItemId);
          if (item) {
            item.registered = true;
            item.warrantyId = warranty.warrantyId || warranty.warranty_id;
          }
        } catch (error) {
          result.dataset.state = 'error';
          result.innerHTML = errorMessage(error);
        } finally {
          stopLoading(submitButton);
        }
      });
    }

    if (createForm) {
      createForm.addEventListener('submit', async (event) => {
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
          order_number: valueOf(createForm, 'invoice_number'),
          lineItemId: valueOf(createForm, 'line_item_id'),
          line_item_id: valueOf(createForm, 'line_item_id'),
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

          const response = await fetchFirstAvailable(createEndpoints, {
            method: 'POST',
            body: payload
          });

          const data = await readJson(response);

          if (!response.ok || data.success === false) {
            throw new RequestError(response.status, data.error || data.message);
          }

          const ticketNumber = data.ticketNumber || data.ticket_number || '';
          const warrantyId = data.warrantyId || data.warranty_id || '';

          result.dataset.state = 'success';
          result.innerHTML = `<div class="g-create-success-card"><span class="g-create-success-icon" aria-hidden="true">✓</span><h3>Service request created</h3><p>${escapeHtml(formatRequestType(fields.requestType))} ticket safely save karein:</p><div class="g-create-ticket-number">${escapeHtml(ticketNumber)}</div>${warrantyId ? `<p>Linked warranty: <strong>${escapeHtml(warrantyId)}</strong></p>` : ''}<p>Status registered email ke saath securely track hoga.</p><div class="g-create-actions"><button type="button" class="g-btn-copy" data-copy-value="${escapeHtml(ticketNumber)}">Copy Ticket ID</button><button type="button" class="g-btn-track-now" data-track-now>Track Now</button></div></div>`;
          bindCopyButton(result);

          result.querySelector('[data-track-now]')?.addEventListener('click', () => {
            const ticketForm = section.querySelector('[data-lookup="ticket"]');
            if (ticketForm) {
              const refInput = ticketForm.querySelector('[name="reference"]');
              const emInput = ticketForm.querySelector('[name="email"]');
              if (refInput) refInput.value = ticketNumber;
              if (emInput) emInput.value = fields.email;
              ticketForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
              ticketForm.requestSubmit();
            }
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
    }
  });

  function renderWarrantyResult(container, data, prepareAction) {
    if (data.lookupType === 'registration') {
      const active = String(data.status).toLowerCase() === 'active';
      container.innerHTML = `<div class="g-status-card"><div class="g-status-header"><div><span class="g-status-kicker">Registered Warranty</span><h4 class="g-status-title">${escapeHtml(data.warrantyId || data.warranty_id)}</h4></div><span class="g-status-badge ${active ? 'g-status-badge--active' : 'g-status-badge--expired'}">● ${escapeHtml(data.status)}</span></div><div class="g-status-details-grid"><div class="g-status-detail-item"><span class="g-status-detail-label">Product</span><span class="g-status-detail-value">${escapeHtml(data.product || 'Grooves Product')}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Order</span><span class="g-status-detail-value">${escapeHtml(data.orderNumber || data.order_number)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Registered</span><span class="g-status-detail-value">${formatDate(data.registeredAt || data.created_at)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Coverage ends</span><span class="g-status-detail-value">${formatDate(data.expiresAt || data.expires_at)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Remaining</span><span class="g-status-detail-value ${active ? 'is-active' : 'is-expired'}">${Number(data.remainingDays || data.remaining_days) || 0} days</span></div></div></div>`;
      return;
    }

    const statusKey = String(data.status || 'Active').toLowerCase();
    const isActive = statusKey === 'active';
    const duration = Number(data.durationDays || data.duration_days) || 365;
    const remaining = Math.max(0, Number(data.remainingDays || data.remaining_days) || 0);
    const percent = Math.min(100, Math.round((remaining / duration) * 100));
    const total = data.total
      ? (typeof data.total === 'object' ? formatMoney(data.total.amount, data.total.currencyCode) : String(data.total))
      : '—';
    const items = Array.isArray(data.items) ? data.items : [];
    const returnEligible = Boolean(data.returnEligible ?? data.return_eligible);
    const returnDaysRemaining = Number(data.returnDaysRemaining ?? data.return_days_remaining) || 0;
    const returnText = returnEligible ? `${returnDaysRemaining} days remaining` : 'Window closed';

    container.innerHTML = `<div class="g-status-card"><div class="g-status-header"><div><span class="g-status-kicker">${data.testOrder ? 'Verified Shopify Test Order' : 'Verified Shopify Order'}</span><h4 class="g-status-title">${escapeHtml(data.orderNumber || data.order_number)}</h4></div><span class="g-status-badge ${isActive ? 'g-status-badge--active' : 'g-status-badge--expired'}">● ${escapeHtml(data.status)}</span></div><div class="g-status-details-grid"><div class="g-status-detail-item"><span class="g-status-detail-label">Purchase date</span><span class="g-status-detail-value">${formatDate(data.purchaseDate || data.created_at)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Order total</span><span class="g-status-detail-value">${escapeHtml(total)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Payment</span><span class="g-status-detail-value">${prettyStatus(data.financialStatus || data.financial_status)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Fulfilment</span><span class="g-status-detail-value">${prettyStatus(data.fulfillmentStatus || data.fulfillment_status)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Warranty remaining</span><span class="g-status-detail-value ${isActive ? 'is-active' : 'is-expired'}">${remaining} days</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Return eligibility</span><span class="g-status-detail-value ${returnEligible ? 'is-active' : 'is-expired'}">${returnText}</span></div></div><div class="g-warranty-progress-wrap"><div class="g-warranty-progress-label"><span>Warranty coverage</span><span>${percent}% remaining</span></div><div class="g-warranty-bar"><div class="g-warranty-fill ${!isActive ? 'g-warranty-fill--expired' : (percent < 25 ? 'g-warranty-fill--low' : '')}" style="width:${percent}%"></div></div></div>${items.length ? `<div class="g-order-items"><span class="g-status-detail-label">Purchased products</span>${items.map((item) => `<div class="g-order-product"><div><span>${escapeHtml(item.title)}</span><small>${item.sku ? `SKU: ${escapeHtml(item.sku)} · ` : ''}Qty ${Number(item.quantity) || 1}${item.registered ? ` · Warranty ${escapeHtml(item.warrantyId)}` : ''}</small></div><div class="g-order-product__actions">${item.registered || !isActive ? '' : `<button type="button" data-order-action="register" data-line-item="${escapeHtml(item.lineItemId)}">Register</button>`}${isActive ? `<button type="button" data-order-action="warranty_claim" data-line-item="${escapeHtml(item.lineItemId)}">Claim</button>` : ''}${returnEligible ? `<button type="button" data-order-action="return" data-line-item="${escapeHtml(item.lineItemId)}">Return</button>` : ''}</div></div>`).join('')}</div>` : ''}</div>`;

    container.querySelectorAll('[data-order-action]').forEach((button) => {
      button.addEventListener('click', () => prepareAction(button.dataset.orderAction, button.dataset.lineItem));
    });
  }

  function renderTicketResult(container, data) {
    const key = String(data.status || 'Open').toLowerCase();
    const badge = key.includes('review') || key.includes('transit') || key.includes('processing') || key.includes('scheduled')
      ? 'g-status-badge--in-progress'
      : (key.includes('resolved') || key.includes('closed') || key.includes('approved') ? 'g-status-badge--resolved' : 'g-status-badge--open');
    const timeline = Array.isArray(data.timeline) ? data.timeline : [];

    container.innerHTML = `<div class="g-status-card"><div class="g-status-header"><div><span class="g-status-kicker">${escapeHtml(formatRequestType(data.requestType || data.request_type || 'support'))}</span><h4 class="g-status-title">${escapeHtml(data.ticketNumber || data.ticket_number || '')}</h4></div><span class="g-status-badge ${badge}">● ${escapeHtml(data.status || 'Open')}</span></div><div class="g-status-details-grid"><div class="g-status-detail-item"><span class="g-status-detail-label">Product</span><span class="g-status-detail-value">${escapeHtml(data.product || data.category || 'Grooves Product')}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Order</span><span class="g-status-detail-value">${escapeHtml(data.orderNumber || data.order_number || data.invoice || '—')}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Created</span><span class="g-status-detail-value">${formatDate(data.createdAt || data.created_at, true)}</span></div><div class="g-status-detail-item"><span class="g-status-detail-label">Last updated</span><span class="g-status-detail-value">${formatDate(data.updatedAt || data.updated_at, true)}</span></div></div>${data.notes ? `<div class="g-status-note"><strong>Latest support update</strong>${escapeHtml(data.notes)}</div>` : ''}${timeline.length ? `<ol class="g-ticket-timeline">${timeline.map((entry) => `<li><span></span><div><strong>${escapeHtml(entry.status)}</strong><p>${escapeHtml(entry.note)}</p><small>${formatDate(entry.at || entry.created_at, true)}</small></div></li>`).join('')}</ol>` : ''}</div>`;
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
    if (error.status === 503) return 'Live service abhi configure nahi hai. Support team se contact karein.';
    return escapeHtml(error.message || 'Service abhi available nahi hai. Kripya kuch der baad try karein.');
  }

  async function readJson(response) {
    if (!response) return {};
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
