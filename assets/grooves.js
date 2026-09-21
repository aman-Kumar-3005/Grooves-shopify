/* Grooves components extend the existing Savor purchase flow. */
import { StandardEvents } from '@shopify/events';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
class GroovesElement extends HTMLElement {
  connectedCallback() { this.abort?.abort(); this.abort = new AbortController(); this.setup(); }
  on(target, name, handler, options = {}) { target?.addEventListener(name, handler, { ...options, signal: this.abort.signal }); }
  disconnectedCallback() { this.abort?.abort(); this.observer?.disconnect(); clearInterval(this.timer); }
}
class GroovesHeader extends GroovesElement {
  setup() {
    const dialog = this.querySelector('dialog');
    const trigger = this.querySelector('[data-menu-open]');
    const close = () => dialog.close();
    this.on(trigger, 'click', () => { dialog.showModal(); trigger.setAttribute('aria-expanded', 'true'); document.documentElement.classList.add('g-menu-open'); });
    this.on(this.querySelector('[data-menu-close]'), 'click', close);
    this.on(dialog, 'click', e => { if (e.target === dialog && e.clientX > dialog.getBoundingClientRect().right) close(); });
    this.on(dialog, 'close', () => { trigger.setAttribute('aria-expanded', 'false'); document.documentElement.classList.remove('g-menu-open'); trigger.focus(); });
    this.on(this, 'keydown', e => { if (e.key === 'Escape') this.querySelectorAll('.g-desktop-nav details[open]').forEach(d => d.open = false); });
    this.observer = new ResizeObserver(() => {
      const height = this.offsetHeight;
      document.body.style.setProperty('--header-height', `${height}px`);
      document.body.style.setProperty('--header-group-height', `${height}px`);
      document.body.style.setProperty('--g-bottom-height', `${this.querySelector('.g-bottom-nav')?.offsetHeight || 0}px`);
    });
    this.observer.observe(this);
    if (this.querySelector('.g-bottom-nav')) this.observer.observe(this.querySelector('.g-bottom-nav'));
  }
  disconnectedCallback() { super.disconnectedCallback(); document.documentElement.classList.remove('g-menu-open'); document.body.style.setProperty('--g-bottom-height', '0px'); }
}
class GroovesAnnouncement extends GroovesElement {
  setup() {
    const messages = [...this.querySelectorAll('[data-message]')];
    this.index = 0; this.paused = reducedMotion.matches; this.hover = false; this.focused = false;
    const button = this.querySelector('[data-pause]');
    const renderButton = () => { if (button) { button.textContent = this.paused ? '▶' : 'Ⅱ'; button.setAttribute('aria-label', `${this.paused ? 'Play' : 'Pause'} announcements`); } };
    const play = () => { clearInterval(this.timer); if (this.paused || this.hover || this.focused || document.hidden || messages.length < 2) return; this.timer = setInterval(() => { messages[this.index].hidden = true; this.index = (this.index + 1) % messages.length; messages[this.index].hidden = false; }, Number(this.dataset.interval) || 5000); };
    this.on(button, 'click', () => { this.paused = !this.paused; renderButton(); play(); });
    this.on(this, 'mouseenter', () => { this.hover = true; play(); }); this.on(this, 'mouseleave', () => { this.hover = false; play(); });
    this.on(this, 'focusin', () => { this.focused = true; play(); }); this.on(this, 'focusout', e => { if (!this.contains(e.relatedTarget)) { this.focused = false; play(); } });
    this.on(document, 'visibilitychange', play);
    this.on(document, 'shopify:block:select', e => { const i = messages.findIndex(m => m.contains(e.target) || m === e.target); if (i < 0) return; messages.forEach((m,n) => m.hidden = i !== n); this.index = i; this.paused = true; renderButton(); play(); });
    renderButton(); play();
  }
}
class GroovesHero extends GroovesElement {
  setup() {
    this.slides = [...this.querySelectorAll('[data-slide]')]; this.index = 0;
    this.paused = this.dataset.autoplay !== 'true' || reducedMotion.matches;
    this.focused = false; this.hover = false; this.visible = true; this.editorSelected = false;
    const next = n => { this.show(this.index + n); this.schedule(); };
    this.on(this.querySelector('[data-next]'), 'click', () => next(1));
    this.on(this.querySelector('[data-prev]'), 'click', () => next(-1));
    this.querySelectorAll('[data-dot]').forEach(button => this.on(button, 'click', () => { this.show(Number(button.dataset.dot)); this.schedule(); }));
    this.on(this.querySelector('[data-pause]'), 'click', () => { this.paused = !this.paused; this.updateButton(); this.schedule(); this.media(); });
    this.on(this, 'mouseenter', () => { this.hover = true; this.schedule(); }); this.on(this, 'mouseleave', () => { this.hover = false; this.schedule(); });
    this.on(this, 'focusin', () => { this.focused = true; this.schedule(); }); this.on(this, 'focusout', e => { if (!this.contains(e.relatedTarget)) { this.focused = false; this.schedule(); } });
    this.on(this, 'keydown', e => { if (e.target.closest('video')) return; if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); next(e.key === 'ArrowRight' ? 1 : -1); } });
    let start;
    this.on(this, 'touchstart', e => { start = [e.touches[0].clientX,e.touches[0].clientY]; }, {passive:true});
    this.on(this, 'touchend', e => { if (!start) return; const x=start[0]-e.changedTouches[0].clientX,y=start[1]-e.changedTouches[0].clientY; if(Math.abs(x)>45 && Math.abs(x)>Math.abs(y)) next(x>0?1:-1); start=null; }, {passive:true});
    this.on(document, 'visibilitychange', () => { this.schedule(); this.media(); });
    this.on(reducedMotion, 'change', () => { this.paused = reducedMotion.matches || this.dataset.autoplay !== 'true'; this.updateButton(); this.schedule(); this.media(); });
    this.on(matchMedia('(max-width:749px)'), 'change', () => this.media());
    this.on(document, 'shopify:block:select', e => { const i=this.slides.findIndex(s=>s===e.target || s.contains(e.target)); if(i<0)return; this.editorSelected=true; this.show(i); this.schedule(); });
    this.on(document, 'shopify:block:deselect', e => { if(this.contains(e.target)){this.editorSelected=false;this.schedule();} });
    this.observer = new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;this.schedule();this.media();},{threshold:0.1});this.observer.observe(this);
    this.show(0); this.updateButton(); this.schedule();
  }
  show(i) {
    if (!this.slides.length) return;
    this.index=(i+this.slides.length)%this.slides.length;
    this.querySelector('[data-track]').style.transform=`translateX(-${this.index*100}%)`;
    this.slides.forEach((s,n)=>{s.inert=n!==this.index;s.setAttribute('aria-hidden',String(n!==this.index));});
    this.querySelectorAll('[data-dot]').forEach((d,n)=>d.setAttribute('aria-current',String(n===this.index)));
    this.media();
  }
  updateButton(){const b=this.querySelector('[data-pause]');if(b){b.textContent=this.paused?'▶':'Ⅱ';b.setAttribute('aria-label',`${this.paused?'Play':'Pause'} slideshow`);}}
  schedule(){clearInterval(this.timer);if(this.paused||this.hover||this.focused||this.editorSelected||document.hidden||!this.visible||this.slides.length<2)return;this.timer=setInterval(()=>this.show(this.index+1),Number(this.dataset.interval)||5000);}
  media(){this.slides.forEach((s,i)=>s.querySelectorAll('video').forEach(v=>{if(i===this.index&&!this.paused&&!document.hidden&&this.visible&&v.getClientRects().length&&!reducedMotion.matches)v.play()?.catch(()=>{});else v.pause();}));}
  disconnectedCallback(){super.disconnectedCallback();this.querySelectorAll('video').forEach(v=>v.pause());}
}
class GroovesRail extends GroovesElement {
  setup(){const rail=this.querySelector('[data-rail]');const move=direction=>rail.scrollBy({left:direction*rail.clientWidth*0.85,behavior:reducedMotion.matches?'instant':'smooth'});this.on(this.querySelector('[data-prev]'),'click',()=>move(-1));this.on(this.querySelector('[data-next]'),'click',()=>move(1));}
}
class GroovesFooterMenu extends GroovesElement {
  setup(){const mq=matchMedia('(min-width:750px)'),details=this.querySelector('details');const update=()=>details.open=mq.matches;this.on(mq,'change',update);this.on(details.querySelector('summary'),'click',e=>{if(mq.matches)e.preventDefault();});update();}
}
class GroovesCoupon extends GroovesElement {
  setup(){this.on(this.querySelector('[data-copy]'),'click',async e=>{const status=this.querySelector('[data-status]');try{await navigator.clipboard.writeText(e.currentTarget.dataset.copy);status.textContent='Code copied. Apply it at checkout.';}catch{status.textContent='Select and copy the code above to use it at checkout.';}});}
}
class GroovesDelivery extends GroovesElement {
  setup(){this.on(this.querySelector('form'),'submit',async e=>{
    e.preventDefault();const form=e.currentTarget,input=form.elements.pincode,status=this.querySelector('[data-status]'),button=form.querySelector('button');
    if(!/^[1-9][0-9]{5}$/.test(input.value.trim())){status.textContent='Enter a valid 6-digit Indian pincode.';return;}
    button.disabled=true;status.textContent='Checking delivery…';
    try{
      const endpoint=this.dataset.endpoint.trim();
      if(endpoint){const url=new URL(endpoint,location.origin);if(url.origin!==location.origin||!url.pathname.startsWith('/apps/'))throw new Error('Invalid provider');url.searchParams.set('pincode',input.value.trim());const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Provider unavailable');const data=await response.json();if(typeof data.available!=='boolean'||typeof data.message!=='string')throw new Error('Invalid response');status.textContent=data.message;}
      else{const codes=this.dataset.pincodes.split(/[\s,]+/).filter(Boolean);status.textContent=codes.length?(codes.includes(input.value.trim())?this.dataset.estimate:'Delivery is not available to this pincode. Contact support for help.'):'Enter your address at checkout to confirm delivery availability and dates.';}
    }catch{status.textContent='Delivery checker is temporarily unavailable. Please confirm delivery at checkout.';}finally{button.disabled=false;}
  });}
}
for(const [name,component] of Object.entries({'grooves-header':GroovesHeader,'grooves-announcement':GroovesAnnouncement,'grooves-hero':GroovesHero,'grooves-rail':GroovesRail,'grooves-footer-menu':GroovesFooterMenu,'grooves-coupon':GroovesCoupon,'grooves-delivery':GroovesDelivery}))if(!customElements.get(name))customElements.define(name,component);
document.addEventListener(StandardEvents.cartLinesUpdate,event=>{
  if(event.action!=='add'||document.body.dataset.groovesConfetti!=='true'||reducedMotion.matches)return;
  event.promise?.then(({detail})=>{if(detail?.didError)return;const host=document.querySelector('#cart-drawer dialog[open]')||document.body;const celebration=document.createElement('div');celebration.className='g-confetti';celebration.setAttribute('aria-hidden','true');for(let i=0;i<18;i++){const p=document.createElement('i');p.style.setProperty('--x',`${Math.random()*100}%`);p.style.setProperty('--delay',`${Math.random()*0.3}s`);p.style.setProperty('--rotation',`${Math.random()*600}deg`);celebration.append(p);}host.append(celebration);setTimeout(()=>celebration.remove(),1800);}).catch(()=>{});
});
