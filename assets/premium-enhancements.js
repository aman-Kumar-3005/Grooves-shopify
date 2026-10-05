(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const revealSelector = [
    '.tr-section-badge-wrap', '.cps-heading', '.custom-section-header', '.tr-tabs-header',
    '.testi-header', '.shoppable-vids-heading', '.brand-marquee-heading', '.press-header-area',
    '.cps-card', '.tr-category-card', '.tr-product-mini-card', '.tr-showcase-banner',
    '.tr-speaker-card', '.testi-card', '.shoppable-card', '.tr-lifestyle-card',
    '.tr-blog-card', '.tr-support-card', '.press-logo-item'
  ].join(',');

  let observer;

  const setupPremiumMotion = (root = document) => {
    const items = [...root.querySelectorAll(revealSelector)].filter((item) => !item.hasAttribute('data-premium-reveal'));
    if (!items.length) return;

    items.forEach((item) => {
      item.setAttribute('data-premium-reveal', '');
      const siblings = item.parentElement ? [...item.parentElement.children] : [];
      const index = Math.max(0, siblings.indexOf(item));
      item.style.setProperty('--premium-delay', `${Math.min(index * 55, 275)}ms`);
    });

    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('is-visible'));
      return;
    }

    document.documentElement.classList.add('premium-motion-ready');
    observer ||= new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.08 });

    items.forEach((item) => observer.observe(item));
  };

  const init = () => setupPremiumMotion(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  document.addEventListener('shopify:section:load', (event) => setupPremiumMotion(event.target));
})();
