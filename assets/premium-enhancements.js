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
  let mediaObserver;

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

  const setupMediaMotion = (root = document) => {
    const media = [...root.querySelectorAll([
      '.tr-showcase-banner', '.tr-speaker-card', '.tr-lifestyle-img-wrap',
      '.tr-blog-img-wrap', '.tr-reel-card', '.cps-image-wrapper',
      '.product-media-container', '.product-gallery__image'
    ].join(','))].filter((item) => !item.classList.contains('premium-media'));
    if (!media.length) return;
    media.forEach((item) => item.classList.add('premium-media'));

    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
      media.forEach((item) => item.classList.add('is-media-visible'));
      return;
    }
    mediaObserver ||= new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-media-visible');
      mediaObserver.unobserve(entry.target);
    }), { rootMargin: '0px 0px -5% 0px', threshold: .08 });
    media.forEach((item) => mediaObserver.observe(item));

    if (!matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    media.filter((item) => item.matches('.tr-showcase-banner,.tr-speaker-card,.tr-reel-card')).forEach((item) => {
      item.addEventListener('pointermove', (event) => {
        const rect = item.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        item.style.setProperty('--premium-media-x', `${(x - .5) * -10}px`);
        item.style.setProperty('--premium-media-y', `${(y - .5) * -8}px`);
        item.style.setProperty('--premium-pointer-x', `${x * 100}%`);
        item.style.setProperty('--premium-pointer-y', `${y * 100}%`);
      }, { passive: true });
      item.addEventListener('pointerleave', () => {
        item.style.setProperty('--premium-media-x', '0px');
        item.style.setProperty('--premium-media-y', '0px');
      });
    });
  };

  const setupScrollProgress = () => {
    if (document.querySelector('.premium-scroll-progress')) return;
    const progress = document.createElement('div');
    progress.className = 'premium-scroll-progress';
    progress.setAttribute('aria-hidden', 'true');
    document.body.appendChild(progress);
    const scroller = matchMedia('(min-width: 990px)').matches
      ? (document.querySelector('.page-wrapper') || document.documentElement)
      : document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = scroller === document.documentElement ? window.scrollY : scroller.scrollTop;
      const total = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
      progress.style.setProperty('--premium-scroll', Math.min(1, top / total));
    };
    scroller.addEventListener('scroll', () => {
      if (!frame) frame = requestAnimationFrame(update);
    }, { passive: true });
    update();
  };

  const init = () => {
    setupPremiumMotion(document);
    setupMediaMotion(document);
    setupScrollProgress();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  document.addEventListener('shopify:section:load', (event) => {
    setupPremiumMotion(event.target);
    setupMediaMotion(event.target);
  });
})();
