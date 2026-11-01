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

/* Homepage interaction upgrade — 2026-11-02. */
(() => {
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 let nextId=0;
 const rail=(track,name)=>{
  if(track.dataset.upgradeRail)return;track.dataset.upgradeRail='true';track.id||='upgrade-rail-'+(++nextId);track.tabIndex=0;track.setAttribute('role','region');track.setAttribute('aria-label',name+' — use arrow keys to browse');
  const tools=document.createElement('div');tools.className='upgrade-rail-tools';const prev=document.createElement('button'),next=document.createElement('button'),count=document.createElement('span');count.className='upgrade-rail-count';prev.textContent='←';next.textContent='→';[prev,next].forEach(b=>{b.type='button';b.setAttribute('aria-controls',track.id)});prev.setAttribute('aria-label','Previous '+name);next.setAttribute('aria-label','Next '+name);tools.append(prev,count,next);track.before(tools);
  let frame=0;const update=()=>{frame=0;const cards=[...track.children],rect=track.getBoundingClientRect();const shown=cards.map((c,i)=>({i,r:c.getBoundingClientRect()})).filter(c=>c.r.right>rect.left+8&&c.r.left<rect.right-8);count.textContent=shown.length?(shown[0].i+1)+'–'+(shown[shown.length-1].i+1)+' of '+cards.length:'0 items';prev.disabled=track.scrollLeft<=2;next.disabled=track.scrollLeft>=track.scrollWidth-track.clientWidth-2;tools.hidden=track.scrollWidth<=track.clientWidth+2;};const schedule=()=>{if(!frame)frame=requestAnimationFrame(update)};const move=dir=>track.scrollBy({left:dir*track.clientWidth*.85,behavior:motion.matches?'instant':'smooth'});prev.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));track.addEventListener('scroll',schedule,{passive:true});track.addEventListener('keydown',e=>{if(e.target!==track)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowRight'?1:-1)}if(e.key==='Home'||e.key==='End'){e.preventDefault();track.scrollTo({left:e.key==='Home'?0:track.scrollWidth,behavior:'instant'})}});const resize=new ResizeObserver(schedule);resize.observe(track);schedule();document.addEventListener('shopify:section:unload',function cleanup(e){if(e.target.contains(track)){resize.disconnect();cancelAnimationFrame(frame);document.removeEventListener('shopify:section:unload',cleanup)}});
 };
 let dialog;
 const videoDialog=(card,trigger)=>{
  if(!dialog){dialog=document.createElement('dialog');dialog.className='upgrade-video-dialog';dialog.setAttribute('aria-labelledby','upgrade-video-title');dialog.innerHTML='<header><h2 id="upgrade-video-title"></h2><button type="button" aria-label="Close video preview">×</button></header><video controls playsinline preload="none"></video><a class="upgrade-button">View product ↗</a>';document.body.append(dialog);dialog.querySelector('button').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});dialog.addEventListener('close',()=>{const video=dialog.querySelector('video');video.pause();video.removeAttribute('src');video.load();dialog.returnFocus?.focus()});}
  document.querySelectorAll('.shoppable-card video').forEach(v=>v.pause());const shell=card.querySelector('.html5-video-shell'),video=dialog.querySelector('video');dialog.querySelector('h2').textContent=card.querySelector('.shoppable-glass-title')?.textContent||'Product video';video.src=shell.dataset.videoSrc;const poster=card.querySelector('img.shoppable-video-poster');if(poster)video.poster=poster.src;else video.removeAttribute('poster');const link=dialog.querySelector('a');link.href=card.href;dialog.returnFocus=trigger;dialog.showModal();video.play().catch(()=>{});
 };
 const setup=(root=document)=>{
  root.querySelectorAll('.upgrade-audio').forEach(section=>{if(section.dataset.tabsReady)return;section.dataset.tabsReady='true';const tabs=[...section.querySelectorAll('[role=tab]')],panels=[...section.querySelectorAll('[role=tabpanel]')];const activate=index=>{tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1});panels.forEach((panel,i)=>panel.hidden=i!==index)};tabs.forEach((tab,i)=>{tab.addEventListener('click',()=>activate(i));tab.addEventListener('keydown',e=>{let target=i;if(e.key==='ArrowRight')target=(i+1)%tabs.length;else if(e.key==='ArrowLeft')target=(i-1+tabs.length)%tabs.length;else if(e.key==='Home')target=0;else if(e.key==='End')target=tabs.length-1;else return;e.preventDefault();activate(target);tabs[target].focus()})})});
  root.querySelectorAll('.shoppable-track').forEach(track=>{track.querySelectorAll('.shoppable-card[data-video-type="html5"]').forEach(card=>{if(card.parentElement.classList.contains('upgrade-video-item'))return;const shell=card.querySelector('.html5-video-shell');if(!shell?.dataset.videoSrc)return;const wrap=document.createElement('div');wrap.className='upgrade-video-item';card.before(wrap);wrap.append(card);const button=document.createElement('button');button.type='button';button.className='upgrade-video-preview';button.textContent='▶ Watch';button.setAttribute('aria-label','Watch '+(card.querySelector('.shoppable-glass-title')?.textContent||'product video'));button.setAttribute('aria-haspopup','dialog');button.addEventListener('click',()=>videoDialog(card,button));wrap.append(button)});rail(track,'product videos')});
  root.querySelectorAll('.tr-blogs-grid').forEach(track=>rail(track,'buying guides')); root.querySelectorAll('.upgrade-format-products').forEach(track=>rail(track,'audio products')); root.querySelectorAll('.upgrade-logo-pause').forEach(button=>{if(button.dataset.ready)return;button.dataset.ready='true';button.addEventListener('click',()=>{const paused=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(paused));button.textContent=paused?'Resume motion':'Pause motion';button.setAttribute('aria-label',paused?'Resume brand logo animation':'Pause brand logo animation');button.closest('.upgrade-brand').querySelector('.upgrade-logo-track').style.animationPlayState=paused?'paused':''})});
  root.querySelectorAll('.custom-marquee').forEach(section=>{if(section.querySelector('.upgrade-marquee-pause'))return;section.style.position='relative';const track=section.querySelector('.track');if(!track)return;const button=document.createElement('button');button.className='upgrade-marquee-pause';button.type='button';button.textContent='Pause';button.setAttribute('aria-label','Pause scrolling text');button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>{const paused=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(paused));button.textContent=paused?'Play':'Pause';button.setAttribute('aria-label',paused?'Play scrolling text':'Pause scrolling text');track.style.animationPlayState=paused?'paused':''});section.append(button)});
  root.querySelectorAll('.press-slider-track').forEach(track=>{if(track.dataset.keyboardReady)return;track.dataset.keyboardReady='true';track.tabIndex=0;track.setAttribute('role','region');track.setAttribute('aria-label','Publication logos — use arrow keys to browse');track.addEventListener('keydown',e=>{if(e.target===track&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){e.preventDefault();track.scrollBy({left:(e.key==='ArrowRight'?1:-1)*250,behavior:motion.matches?'instant':'smooth'})}})});
  root.querySelectorAll('.grooves-answer-guide').forEach(guide=>{if(guide.dataset.accordionReady)return;guide.dataset.accordionReady='true';[...guide.querySelectorAll(':scope > h2')].forEach(heading=>{const paragraph=heading.nextElementSibling;if(paragraph?.tagName!=='P')return;const details=document.createElement('details'),summary=document.createElement('summary');details.className='upgrade-guide-details';heading.before(details);summary.append(heading);details.append(summary,paragraph)});});
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setup(),{once:true});else setup();document.addEventListener('shopify:section:load',event=>setup(event.target));document.addEventListener('click',event=>{const link=event.target.closest('a[href^="#"]');if(!link)return;const target=document.getElementById(link.getAttribute('href').slice(1));const details=target?.closest('details');if(details)details.open=true});document.addEventListener('visibilitychange',()=>{if(document.hidden){document.querySelectorAll('.shoppable-card video').forEach(v=>v.pause());if(dialog?.open)dialog.querySelector('video').pause()}});
})();
