(() => {
  'use strict';
  const login = document.querySelector('#login');
  const workspace = document.querySelector('#workspace');
  const content = document.querySelector('#content');
  const message = document.querySelector('#message');
  const logout = document.querySelector('#logout');
  let adminKey = '';
  let view = 'tickets';
  const statuses = ['Open','Under Review','In Progress','Awaiting Customer','Approved','Pickup Scheduled','In Transit','Replacement Shipped','Refund Processing','Resolved','Rejected','Closed'];

  document.querySelector('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    adminKey = document.querySelector('#admin-key').value.trim();
    if (await load()) { login.hidden = true; workspace.hidden = false; logout.hidden = false; }
  });
  logout.addEventListener('click', () => { adminKey = ''; content.replaceChildren(); workspace.hidden = true; logout.hidden = true; login.hidden = false; document.querySelector('#admin-key').value = ''; });
  document.querySelector('#refresh').addEventListener('click', load);
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
    view = button.dataset.view;
    document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item === button));
    load();
  }));

  async function load() {
    setMessage('Loading…');
    try {
      const response = await fetch(`/api/admin/${view}`, { headers: { Authorization: `Bearer ${adminKey}`, Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load data.');
      if (view === 'settings') {
        renderSettings(data.settings || {});
        setMessage('Current settings loaded.', 'success');
      } else {
        render(data[view] || []);
        setMessage(`${data[view]?.length || 0} ${view} loaded.`, 'success');
      }
      return true;
    } catch (error) {
      setMessage(error.message, 'error');
      return false;
    }
  }

  function render(records) {
    content.replaceChildren();
    if (!records.length) { const empty = element('div', 'empty', `No ${view} found.`); content.append(empty); return; }
    records.forEach((record) => content.append(view === 'tickets' ? ticketCard(record) : warrantyCard(record)));
  }

  function ticketCard(ticket) {
    const card = element('article');
    const top = element('div', 'top');
    const heading = element('div');
    heading.append(element('div', 'meta', label(ticket.requestType)), element('h2', '', ticket.ticketNumber), element('div', 'meta', `${ticket.name} · ${ticket.email}`));
    top.append(heading, element('span', 'badge', ticket.status));
    card.append(top, details([['Product', ticket.product], ['Order', ticket.invoice], ['Created', date(ticket.createdAt)]]));
    const form = element('form', 'update');
    const selectWrap = element('div'); selectWrap.append(element('label', '', 'New status'));
    const select = element('select'); statuses.forEach((status) => { const option = element('option', '', status); option.value = status; option.selected = status === ticket.status; select.append(option); }); selectWrap.append(select);
    const noteWrap = element('div'); noteWrap.append(element('label', '', 'Customer update note')); const note = element('textarea'); note.required = true; note.maxLength = 1200; note.placeholder = 'Clear update visible to customer'; noteWrap.append(note);
    const submit = element('button', '', 'Save update'); submit.type = 'submit';
    form.append(selectWrap, noteWrap, submit);
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); submit.disabled = true;
      try {
        const response = await fetch(`/api/admin/tickets/${encodeURIComponent(ticket.ticketNumber)}`, { method: 'PATCH', headers: { Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: select.value, note: note.value, public: true }) });
        const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Update failed.');
        setMessage(`${ticket.ticketNumber} updated.`, 'success'); await load();
      } catch (error) { setMessage(error.message, 'error'); } finally { submit.disabled = false; }
    });
    card.append(form); return card;
  }

  function warrantyCard(warranty) {
    const card = element('article'); const top = element('div', 'top'); const heading = element('div');
    heading.append(element('div', 'meta', 'REGISTERED WARRANTY'), element('h2', '', warranty.warrantyId), element('div', 'meta', `${warranty.name} · ${warranty.email}`));
    top.append(heading, element('span', 'badge', warranty.status));
    card.append(top, details([['Product', warranty.product], ['Order', warranty.orderNumber], ['Coverage ends', date(warranty.expiresAt)]])); return card;
  }

  function renderSettings(settings) {
    content.replaceChildren();
    const card = element('article');
    const form = element('form', 'settings');
    const domain = field('Permanent Shopify domain', 'text', settings.shopifyStoreDomain || '', 'your-store.myshopify.com');
    const warranty = field('Warranty duration (days)', 'number', settings.warrantyDays || 365);
    warranty.input.min = '1'; warranty.input.max = '3650';
    const returns = field('Return window (days)', 'number', settings.returnWindowDays || 7);
    returns.input.min = '1'; returns.input.max = '365';
    const basisWrap = element('div'); basisWrap.append(element('label', '', 'Return window starts from'));
    const basis = element('select');
    [['delivery', 'Delivered date'], ['purchase', 'Purchase date']].forEach(([value, text]) => {
      const option = element('option', '', text); option.value = value; option.selected = value === (settings.returnWindowBasis || 'delivery'); basis.append(option);
    });
    basisWrap.append(basis);
    const checkLabel = element('label', 'check full');
    const checkbox = element('input'); checkbox.type = 'checkbox';
    checkLabel.append(checkbox, document.createTextNode('Apply the new warranty duration to existing registrations too. Leave unchecked to preserve their original end date.'));
    const submit = element('button', 'full', 'Save settings'); submit.type = 'submit';
    form.append(domain.wrap, warranty.wrap, returns.wrap, basisWrap, checkLabel, submit);
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); submit.disabled = true;
      try {
        const response = await fetch('/api/admin/settings', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopifyStoreDomain: domain.input.value.trim(),
            warrantyDays: Number(warranty.input.value),
            returnWindowDays: Number(returns.input.value),
            returnWindowBasis: basis.value,
            applyWarrantyToExisting: checkbox.checked
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Settings update failed.');
        renderSettings(data.settings);
        setMessage('Settings saved and active for customer requests.', 'success');
      } catch (error) { setMessage(error.message, 'error'); } finally { submit.disabled = false; }
    });
    card.append(element('h2', '', 'Store & policy settings'), element('p', 'meta', 'Saved values automatically apply to new customer lookups and requests.'), form);
    content.append(card);
  }

  function field(labelText, type, value, placeholder = '') {
    const wrap = element('div'); const labelNode = element('label', '', labelText); const input = element('input');
    input.type = type; input.required = true; input.value = value; input.placeholder = placeholder;
    wrap.append(labelNode, input); return { wrap, input };
  }

  function details(items) { const box = element('div', 'details'); items.forEach(([key,value]) => { const item = element('div'); item.append(element('small', '', key), element('strong', '', value || '—')); box.append(item); }); return box; }
  function element(tag, className = '', text = '') { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
  function label(value) { return String(value || 'Support').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
  function date(value) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('en-IN'); }
  function setMessage(text, state = '') { message.textContent = text; message.className = state; }
})();
