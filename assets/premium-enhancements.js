(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const revealSelector = [
    '.tr-section-badge-wrap', '.cps-heading', '.custom-section-header', '.tr-tabs-header',
    '.testi-header', '.shoppable-vids-heading', '.brand-marquee-heading', '.press-header-area',
    '.cps-card', '.tr-category-card', '.tr-product-mini-card', '.tr-showcase-banner',
    '.tr-speaker-card', '.testi-card', '.shoppable-card', '.tr-lifestyle-card',
    '.tr-blog-card', '.tr-support-card', '.press-logo-item', '.product-grid__item',
    '.blog-post-item', '.cart-page__summary', '.facets-controls-wrapper'
  ].join(',');

  let observer;

  const setupPremiumMotion = (root = document) => {
    // Keep mobile's critical path lean; the content remains immediately visible
    // and desktop users still receive the progressive reveal treatment.
    if (reducedMotion.matches || matchMedia('(max-width: 749px)').matches) return;
    const items = [...root.querySelectorAll(revealSelector)].filter((item) => !item.hasAttribute('data-premium-reveal'));
    if (!items.length) return;

    items.forEach((item) => {
      item.setAttribute('data-premium-reveal', '');
      const siblings = item.parentElement ? [...item.parentElement.children] : [];
      const index = Math.max(0, siblings.indexOf(item));
      item.style.setProperty('--premium-delay', `${Math.min(index * 55, 275)}ms`);
    });

    if (!('IntersectionObserver' in window)) {
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
    if (reducedMotion.matches || matchMedia('(max-width: 749px)').matches) return;
    const media = [...root.querySelectorAll([
      '.tr-showcase-banner', '.tr-speaker-card', '.tr-lifestyle-img-wrap',
      '.tr-blog-img-wrap', '.tr-reel-card', '.cps-image-wrapper',
      '.product-media-container', '.product-gallery__image'
    ].join(','))].filter((item) => !item.classList.contains('premium-media'));
    if (!media.length) return;
    media.forEach((item) => item.classList.add('premium-media', 'is-media-visible'));

    if (reducedMotion.matches || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
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
    if (reducedMotion.matches || matchMedia('(max-width: 989px)').matches) return;
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
    requestAnimationFrame(update);
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

/* Shopping carousel upgrade 2026-11-02. */
(() => {
  const style = document.createElement('style');
  style.textContent = `
    .tr-theme .cps-tools{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 18px;color:#17243d;font-size:13px}
    .tr-theme .cps-stock-filter{display:inline-flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;font-weight:600}
    .tr-theme .cps-stock-filter input{width:18px;height:18px;accent-color:#17243d}
    .tr-theme .cps-navigation{display:flex;align-items:center;gap:10px}
    .tr-theme .cps-navigation button{display:grid;place-items:center;width:44px;height:44px;border:1px solid #d8dee8;border-radius:50%;background:#fff;color:#17243d;font-size:22px;cursor:pointer;transition:background .2s,transform .2s}
    .tr-theme .cps-navigation button:hover:not(:disabled){background:#17243d;color:#fff;transform:translateY(-2px)}
    .tr-theme .cps-navigation button:disabled{opacity:.35;cursor:default}
    .tr-theme .cps-range{font-variant-numeric:tabular-nums;min-width:76px;text-align:center}
    .tr-theme .cps-progress{height:3px;background:#e7ebf1;border-radius:8px;overflow:hidden;margin:16px 0 0}
    .tr-theme .cps-progress-fill{height:100%;background:linear-gradient(90deg,#17243d,#45a8e8);width:var(--cps-progress,0%);transition:width .2s}
    .tr-theme .cps-card[hidden]{display:none!important}
    .tr-theme .cps-track:focus-visible,.tr-theme .cps-tools :focus-visible{outline:3px solid #45a8e8;outline-offset:4px}
    .tr-theme .cps-card{border:1px solid #e5e9ef!important;border-radius:16px!important;overflow:hidden;transition:box-shadow .2s,border-color .2s}
    @media(hover:hover){.tr-theme .cps-card:hover{border-color:#adc2d9!important;box-shadow:0 12px 30px rgba(23,36,61,.1)!important}}
    @media(max-width:749px){.tr-theme .cps-tools{gap:6px;font-size:12px}.tr-theme .cps-navigation{gap:6px}.tr-theme .cps-range{min-width:65px}.tr-theme .cps-navigation button{width:44px;height:44px}}
    @media(prefers-reduced-motion:reduce){.tr-theme .cps-navigation button,.tr-theme .cps-card,.tr-theme .cps-progress-fill{transition:none}}
  `;
  document.head.appendChild(style);
  let sequence = 0;
  const setup = (root = document) => {
    root.querySelectorAll('.custom-product-slider-wrapper').forEach(section => {
      const track = section.querySelector('.cps-track');
      if (!track || track.dataset.shoppingUpgrade) return;
      const cards = [...track.querySelectorAll('.cps-card')];
      if (!cards.length) return;
      track.dataset.shoppingUpgrade = 'true';
      const heading = section.querySelector('.cps-heading');
      const name = heading?.textContent.trim() || 'Products';
      track.id ||= 'shopping-carousel-' + (++sequence);
      track.tabIndex = 0;
      track.setAttribute('role','region');
      track.setAttribute('aria-label',name + ' — use arrow keys to browse');
      const tools = document.createElement('div');
      tools.className = 'cps-tools';
      const label = document.createElement('label');
      label.className = 'cps-stock-filter';
      const stock = document.createElement('input');
      stock.type = 'checkbox';
      label.append(stock,document.createTextNode('In stock only'));
      const nav = document.createElement('div');
      nav.className = 'cps-navigation';
      const prev = document.createElement('button');
      const next = document.createElement('button');
      [prev,next].forEach(button => { button.type='button';button.setAttribute('aria-controls',track.id); });
      prev.textContent='←';next.textContent='→';
      prev.setAttribute('aria-label','Previous products in ' + name);
      next.setAttribute('aria-label','Next products in ' + name);
      const count = document.createElement('span');count.className='cps-range';
      nav.append(prev,count,next);tools.append(label,nav);track.before(tools);
      const progress = document.createElement('div');progress.className='cps-progress';progress.setAttribute('aria-hidden','true');
      const fill = document.createElement('div');fill.className='cps-progress-fill';progress.append(fill);track.after(progress);
      const soldOut = card => [...card.querySelectorAll('button:disabled')].some(button => /sold out/i.test(button.textContent));
      label.hidden = !cards.some(soldOut);
      let frame=0;
      const update = () => {
        frame=0;
        const visible=cards.filter(card=>!card.hidden);
        const bounds=track.getBoundingClientRect();
        const shown=visible.map((card,index)=>({index,rect:card.getBoundingClientRect()})).filter(item=>item.rect.right>bounds.left+8 && item.rect.left<bounds.right-8);
        count.textContent=shown.length ? (shown[0].index+1)+'–'+(shown[shown.length-1].index+1)+' of '+visible.length : '0 products';
        const max=Math.max(0,track.scrollWidth-track.clientWidth);
        prev.disabled=track.scrollLeft<=2;next.disabled=track.scrollLeft>=max-2;
        fill.style.setProperty('--cps-progress',max ? Math.min(100,((track.scrollLeft+track.clientWidth)/track.scrollWidth)*100)+'%' : '100%');
      };
      const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
      const move=direction=>track.scrollBy({left:direction*Math.max(1,track.clientWidth*.85),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      prev.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
      stock.addEventListener('change',()=>{cards.forEach(card=>{card.hidden=stock.checked&&soldOut(card);});track.scrollLeft=0;schedule();});
      track.addEventListener('scroll',schedule,{passive:true});
      track.addEventListener('keydown',event=>{
        if(event.target!==track)return;
        if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}
        if(event.key==='Home'||event.key==='End'){event.preventDefault();track.scrollTo({left:event.key==='Home'?0:track.scrollWidth,behavior:'instant'});}
      });
      const resize = new ResizeObserver(schedule);resize.observe(track);
      const cleanup=event=>{if(event.target.contains(section)){resize.disconnect();cancelAnimationFrame(frame);document.removeEventListener('shopify:section:unload',cleanup);}};
      document.addEventListener('shopify:section:unload',cleanup);
      schedule();
    });
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setup(),{once:true});else setup();
  document.addEventListener('shopify:section:load',event=>setup(event.target));
})();
