(() => {
  document.querySelectorAll('[data-g-track]').forEach((section) => {
    const endpoint = section.dataset.endpoint;
    section.querySelectorAll('[data-lookup]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = form.querySelector('[name="reference"]');
        const button = form.querySelector('button[type="submit"]');
        const result = form.querySelector('[data-result]');
        const reference = input.value.trim();
        result.hidden = false;
        result.dataset.state = 'error';
        result.textContent = '';
        if (!reference || reference.length > 80) {
          result.textContent = 'Valid number enter karein.';
          input.focus();
          return;
        }
        button.disabled = true;
        result.dataset.state = 'loading';
        result.textContent = 'Status check ho raha hai…';
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ type: form.dataset.lookup, reference }),
            credentials: 'same-origin'
          });
          const data = await response.json();
          if (!response.ok || !data || typeof data.status !== 'string') throw new Error('lookup_failed');
          result.dataset.state = 'success';
          result.textContent = '';
          const label = document.createElement('span');
          label.textContent = 'Current status';
          const status = document.createElement('strong');
          status.textContent = data.status;
          result.append(label, status);
          if (typeof data.updatedAt === 'string' && !Number.isNaN(Date.parse(data.updatedAt))) {
            const date = document.createElement('small');
            date.textContent = `Last updated: ${new Date(data.updatedAt).toLocaleDateString('en-IN')}`;
            result.append(date);
          }
        } catch (_) {
          result.dataset.state = 'error';
          result.textContent = 'Status abhi nahi mil raha. Number check karein ya support se sampark karein.';
        } finally {
          button.disabled = false;
        }
      });
    });
  });
})();
