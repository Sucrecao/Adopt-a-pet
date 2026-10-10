import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ArrowDown, ArrowRight, BellOff, Check, ChevronRight, CircleHelp, Hand, Heart, Home, Leaf, Maximize2, Monitor, Moon, MousePointer2, PanelLeft, Pause, PawPrint, Play, Settings2, Sparkles, Volume2, X, Utensils, Circle, Bird } from 'lucide-react';
import { PETS } from './core/pets.js';
import { createState } from './core/state.js';
import { bridge } from './bridge.js';
import Pet, { useReducedMotion } from './Pet.jsx';
import { advanceMotion } from './core/motion.js';

const actions = [
  { id: 'pet', label: '抚摸', icon: Hand, detail: '挠挠小脑袋' },
  { id: 'feed', label: '喂食', icon: Utensils, detail: '来一点好吃的' },
  { id: 'play', label: '玩耍', icon: Circle, detail: '一起动起来' },
  { id: 'rest', label: '休息', icon: Moon, detail: '做个甜甜的梦' },
  { id: 'stretch', label: '伸懒腰', icon: Maximize2, detail: '舒展一下身体' },
  { id: 'trick', label: '小把戏', icon: Sparkles, detail: '给你一个小惊喜' },
];
const responses = {
  cat: { pet: '呼噜呼噜～ 就是这里！', feed: '好吃！还想再舔一舔碗。', play: '那根逗猫棒，让我抓到啦！', rest: '把爪爪收好，眯一会儿。', stretch: '爪爪伸长——今天也要软乎乎！', trick: '轻轻一跳，接住你的小开心！' },
  dog: { pet: '尾巴摇起来！最喜欢你啦。', feed: '汪！这顿饭也太香了。', play: '球球在哪里？我来追！', rest: '玩累了，在你身边打个盹。', stretch: '前爪伸一伸，尾巴也准备好啦！', trick: '汪！跳个小把戏，奖励一个摸摸吧！' },
  parrot: { pet: '啾～ 小脑袋也需要摸摸。', feed: '咔嚓咔嚓，种子真好吃！', play: '展开翅膀，飞一圈给你看！', rest: '晚安啾，翅膀收好啦。', stretch: '翅膀展开，伸个漂亮的小懒腰！', trick: '啾啾！扑腾一跳，给你看我的小把戏！' },
};

let audioContext;
function playResponse(species) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioContext ||= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    const start = audioContext.currentTime;
    const frequency = species === 'parrot' ? 1150 : species === 'dog' ? 310 : 540;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * (species === 'parrot' ? 1.4 : .75), start + .13);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(.045, start + .02);
    gain.gain.exponentialRampToValueAtTime(.001, start + .24);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(start); oscillator.stop(start + .25);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch { /* Sound is optional; interaction stays available. */ }
}

function useCompanion() {
  const [state, setState] = useState(() => createState(Date.now()));
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    bridge.getState().then(next => { if (alive) setState(next); }).catch(() => setError('暂时无法读取伙伴状态，请重新打开面板。'));
    const unsubscribe = bridge.onState(next => { if (alive) setState(next); });
    const timer = !bridge.isDesktop ? setInterval(() => bridge.dispatch({ type: 'tick' }).catch(() => {}), 15000) : null;
    return () => { alive = false; unsubscribe?.(); if (timer) clearInterval(timer); };
  }, []);
  async function dispatch(command) {
    try { const next = await bridge.dispatch(command); setState(next); setError(''); return next; }
    catch { setError('这次操作没有保存，请再试一次。'); return null; }
  }
  return { state, dispatch, error };
}

function Switch({ label, description, checked, onChange, icon: Icon }) {
  return <div className="setting-row"><div className="setting-label"><Icon size={17} /><div><span>{label}</span>{description && <small>{description}</small>}</div></div><button type="button" className="switch" role="switch" aria-label={label} aria-checked={checked} onClick={() => onChange(!checked)}><span /></button></div>;
}

function Stat({ label, value, icon: Icon, tone }) {
  const percent = Math.round(value);
  return <div className={`stat stat-${tone}`}><div className="stat-top"><span><Icon size={15} />{label}</span><strong>{percent}<small> / 100</small></strong></div><div className="stat-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></div></div>;
}

function Stage({ pet, state, speech, onInteract }) {
  const stageRef = useRef(null), anchorRef = useRef(null);
  const [position, setPosition] = useState({ x: 52, y: 68 });
  const [walking, setWalking] = useState(false);
  const [facing, setFacing] = useState(1);
  const [dragging, setDragging] = useState(false);
  const reducedMotion = useReducedMotion();
  const positionRef = useRef({ x: 52, y: 68, vx: 0, vy: 0 });
  const [toy, setToy] = useState({ x: 70, y: 68 });
  const target = useRef({ x: 52, y: 68 });
  const drag = useRef(null);
  const action = state.action?.until > Date.now() ? state.action.type : 'idle';
  function clampPosition(point) {
    const stage = stageRef.current, anchor = anchorRef.current;
    const sprite = anchor?.querySelector('.stage-pet');
    if (!stage || !anchor || !sprite) return point;
    const width = stage.clientWidth, height = stage.clientHeight;
    // Anchor translates by (-50%, -70%) of its own dimensions. Sprite scale
    // breathes upward; registered feet can shift down by up to 14% of its height.
    const left = anchor.offsetWidth * .5 - sprite.offsetLeft;
    const top = anchor.offsetHeight * .7 - sprite.offsetTop;
    const topMargin = 4 + 3 + sprite.offsetHeight * .008;
    const bottomMargin = 4 + sprite.offsetHeight * .14;
    const minimumX = (left + 4) / width * 100;
    const maximumX = (width - (sprite.offsetWidth - left) - 4) / width * 100;
    const minimumY = (top + topMargin) / height * 100;
    const maximumY = (height - (sprite.offsetHeight - top) - bottomMargin) / height * 100;
    const clamp = (value, minimum, maximum) => maximum < minimum ? (minimum + maximum) / 2 : Math.max(minimum, Math.min(maximum, value));
    return { x: clamp(point.x, minimumX, maximumX), y: clamp(point.y, minimumY, maximumY) };
  }
  useLayoutEffect(() => {
    const edge = state.settings.movement === 'edge';
    target.current = clampPosition({ x: 52, y: edge ? 81 : 68 });
    positionRef.current = { ...target.current, vx: 0, vy: 0 };
    setPosition(target.current);
    setWalking(false);
  }, [pet.id, state.settings.movement, state.settings.size]);
  useLayoutEffect(() => {
    function constrain() {
      const current = positionRef.current;
      const next = clampPosition(current);
      target.current = clampPosition(target.current);
      if (next.x === current.x && next.y === current.y) return;
      positionRef.current = { ...next, vx: 0, vy: 0 };
      setPosition(next);
      setWalking(false);
    }
    const resizeImmediately = () => flushSync(constrain);
    const resize = new ResizeObserver(constrain);
    resize.observe(stageRef.current);
    resize.observe(anchorRef.current);
    constrain();
    window.addEventListener('resize', resizeImmediately);
    return () => { resize.disconnect(); window.removeEventListener('resize', resizeImmediately); };
  }, [pet.id, state.settings.size]);
  useEffect(() => {
    const stationary = state.settings.paused || reducedMotion || (action !== 'idle' && action !== 'play');
    positionRef.current.vx = 0; positionRef.current.vy = 0;
    if (stationary) {
      target.current = { x: positionRef.current.x, y: positionRef.current.y };
      setWalking(false); return;
    }
    let request, previous = performance.now(), nextWander = previous + 4500 + Math.random() * 2000;
    function tick(now) {
      const dt = Math.min(.05, Math.max(0, (now - previous) / 1000));
      previous = now;
      if (!drag.current) {
        if (action !== 'play' && now >= nextWander) {
          target.current = clampPosition({ x: 25 + Math.random() * 50, y: state.settings.movement === 'edge' ? 81 : 59 + Math.random() * 15 });
          nextWander = now + 7000 + Math.random() * 5000;
        }
        target.current = clampPosition(target.current);
        const motion = advanceMotion(positionRef.current, target.current, 22, dt);
        const next = { ...motion, ...clampPosition(motion) };
        const moving = !next.arrived;
        if (moving && Math.abs(next.vx) > .4) setFacing(next.vx < 0 ? -1 : 1);
        positionRef.current = next;
        setPosition({ x: next.x, y: next.y });
        setWalking(moving);
      }
      request = requestAnimationFrame(tick);
    }
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [state.settings.paused, state.settings.movement, action, reducedMotion]);
  function point(event) {
    const rect = stageRef.current.getBoundingClientRect();
    return clampPosition({ x: (event.clientX - rect.left - stageRef.current.clientLeft) / stageRef.current.clientWidth * 100, y: (event.clientY - rect.top - stageRef.current.clientTop) / stageRef.current.clientHeight * 100 });
  }
  function move(event) {
    if (drag.current) { const next = point(event); setPosition(next); positionRef.current = { ...next, vx: 0, vy: 0 }; target.current = next; }
    else if (action === 'play' && !state.settings.paused && !reducedMotion) { const next = point(event); setToy(next); target.current = next; }
  }
  return <div ref={stageRef} style={{ '--stage-pet-size': `${210 * state.settings.size}px` }} className={`desktop-stage ${state.settings.movement === 'edge' ? 'edge-mode' : ''}`} onPointerMove={move}>
    <div className="stage-grid" /><div className="cloud cloud-one" /><div className="cloud cloud-two" /><div className="stage-sun" />
    <div className="stage-caption"><Monitor size={14} />{bridge.isDesktop ? '互动小桌面' : '你的桌面 · 互动预览'}</div>
    <span className="stage-range"><i />{state.settings.paused ? '活动已暂停' : state.settings.movement === 'edge' ? '沿着屏幕边缘散步' : '在桌面自在活动'}</span>
    <div className="wallpaper-type">make room<br /><em>for a little joy.</em></div>
    <div className="stage-flower flower-one"><Leaf /><Leaf /></div><div className="stage-flower flower-two"><Leaf /><Leaf /></div>
    <div ref={anchorRef} className="stage-pet-anchor" style={{ left: `${position.x}%`, top: `${position.y}%` }}>
      {(speech || action === 'rest') && <div className="speech-bubble" role="status">{speech || 'Z z z …'}{action === 'pet' && <Heart size={14} fill="currentColor" />}</div>}
      <div className="pet-shadow" />
      <Pet pet={pet} size={210 * state.settings.size} walking={walking && !dragging} facing={facing} action={action} paused={state.settings.paused || dragging} actionStartedAt={state.lastInteraction} className="stage-pet" tabIndex={0} aria-label={`抚摸${state.name || pet.defaultName}`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onInteract('pet'); } }} onDoubleClick={() => onInteract('pet')} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY }; setDragging(true); setWalking(false); }} onPointerUp={event => { if (drag.current && Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) < 7) onInteract('pet'); drag.current = null; setDragging(false); event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drag.current = null; setDragging(false); }} />
      <div className="stage-name">{state.name || pet.defaultName}<span>{state.adopted ? '你的伙伴' : '等待领养'}</span></div>
    </div>
    {action === 'play' && <div className={`stage-toy toy-${pet.id}`} style={{ left: `${toy.x}%`, top: `${toy.y}%` }}>{pet.id === 'cat' ? '〰' : pet.id === 'parrot' ? <Sparkles size={24} /> : <Circle size={28} fill="#f2a9b8" />}</div>}
    <div className="stage-hint"><MousePointer2 size={14} />{action === 'play' ? `移动鼠标，和${state.name}一起玩` : '轻点摸摸 · 拖动换个位置'}</div>
    <div className="desktop-dock"><span><Home size={17} /></span><span><Heart size={17} /></span><span><PawPrint size={18} /></span><span><Leaf size={17} /></span></div>
  </div>;
}

function PetOverlay({ state, dispatch }) {
  const pet = PETS.find(item => item.id === state.species) || PETS[0];
  const spriteRef = useRef(null), toolbarRef = useRef(null);
  const [speech, setSpeech] = useState('');
  const [toolbar, setToolbar] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const speechTimer = useRef(null);
  const action = state.action?.until > Date.now() ? state.action.type : 'idle';
  useEffect(() => {
    document.documentElement.classList.add('overlay-document');
    return () => document.documentElement.classList.remove('overlay-document');
  }, []);
  useEffect(() => () => clearTimeout(speechTimer.current), []);
  useEffect(() => {
    function report() {
      const sprite = spriteRef.current?.getBoundingClientRect();
      const bar = toolbarRef.current?.getBoundingClientRect();
      const regions = sprite ? [{ type: 'ellipse', x: sprite.x + sprite.width * .16, y: sprite.y + sprite.height * .14, width: sprite.width * .68, height: sprite.height * .8 }] : [];
      if (toolbar && bar) regions.push({ type: 'rect', x: bar.x, y: bar.y, width: bar.width, height: bar.height });
      bridge.setHitRegions(regions);
    }
    report();
    const resize = new ResizeObserver(report);
    if (spriteRef.current) resize.observe(spriteRef.current);
    window.addEventListener('resize', report);
    return () => { resize.disconnect(); window.removeEventListener('resize', report); };
  }, [toolbar, state.settings.size]);
  async function interact(type) {
    if (state.settings.paused) { setSpeech('先关闭暂停，再一起玩吧。'); return; }
    if (Date.now() - state.lastInteraction < 800) return;
    if (state.settings.sound) playResponse(pet.id);
    const next = await dispatch({ type: 'interact', action: type });
    if (!next || next.lastInteraction <= state.lastInteraction) return;
    setSpeech(responses[pet.id][type]);
    clearTimeout(speechTimer.current);
    speechTimer.current = setTimeout(() => setSpeech(''), 3600);
  }
  return <div className="pet-overlay" onPointerEnter={() => setToolbar(true)} onPointerLeave={() => { if (!drag.current) setToolbar(false); }}>
    {speech && <div className="overlay-speech" role="status">{speech}</div>}
    <div ref={spriteRef} className="overlay-sprite-box">
      <Pet pet={pet} size="100%" action={action} paused={state.settings.paused || dragging || state.motion?.dragging} actionStartedAt={state.lastInteraction} walking={Boolean(state.motion?.moving) && !state.settings.paused && !dragging && (action === 'idle' || action === 'play') && !state.motion?.dragging} facing={state.motion?.facing === 'left' ? -1 : 1} className="overlay-sprite" tabIndex={0} aria-label={`抚摸${state.name}`} onKeyDown={event => { if (event.key === 'Enter') interact('pet'); }} onDoubleClick={() => interact('pet')} onContextMenu={event => { event.preventDefault(); setToolbar(value => !value); }} onPointerDown={event => { if (event.button !== 0) return; drag.current = { x: event.clientX, y: event.clientY, active: false }; setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (!drag.current) return; if (!drag.current.active && Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) > 4) { drag.current.active = true; bridge.beginDrag(); } }} onPointerUp={event => { if (drag.current?.active) bridge.endDrag(); else if (drag.current) interact('pet'); drag.current = null; setDragging(false); event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { bridge.endDrag(); drag.current = null; setDragging(false); }} />
    </div>
    <div ref={toolbarRef} className={`overlay-toolbar ${toolbar ? 'visible' : ''}`} aria-label="伙伴互动">
      {actions.map(({ id, label, icon: Icon }) => <button key={id} title={label} aria-label={label} onClick={() => interact(id)}><Icon size={16} /></button>)}
      <button title="打开伙伴面板" aria-label="打开伙伴面板" onClick={() => bridge.showPanel()}><PanelLeft size={16} /></button>
      <button title="隐藏伙伴" aria-label="隐藏伙伴" onClick={() => bridge.hidePet()}><X size={16} /></button>
    </div>
  </div>;
}

export default function App() {
  const { state, dispatch, error } = useCompanion();
  const [selected, setSelected] = useState('cat');
  const [name, setName] = useState('');
  const [speech, setSpeech] = useState('');
  const [toast, setToast] = useState('');
  const [nav, setNav] = useState('home');
  const timer = useRef(null);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 500); return () => clearInterval(id); }, []);
  useEffect(() => { if (state.adopted) { setSelected(state.species); setName(state.name); } else if (!name) setName(PETS.find(p => p.id === selected)?.defaultName || ''); }, [state.adopted, state.species]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (!speech) return; const id = setTimeout(() => setSpeech(''), 5000); return () => clearTimeout(id); }, [speech]);
  const chosen = PETS.find(item => item.id === selected) || PETS[0];
  const activePet = state.adopted ? PETS.find(item => item.id === state.species) || chosen : chosen;
  if (new URLSearchParams(location.search).get('view') === 'pet') return <PetOverlay state={state} dispatch={dispatch} />;
  function notify(message) { setToast(message); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(''), 4500); }
  function selectPet(pet) { setSelected(pet.id); setName(pet.defaultName); }
  async function adopt(event) {
    event.preventDefault();
    const sameCompanion = state.adopted && selected === state.species;
    const next = await dispatch(sameCompanion ? { type: 'rename', name: name.trim() || chosen.defaultName } : { type: 'adopt', species: selected, name: name.trim() || chosen.defaultName });
    if (next) { setSpeech(sameCompanion ? `听到你叫我${next.name}，好开心！` : `你好，我是${next.name}。以后一起度过每个小日子吧！`); notify(sameCompanion ? `${next.name}，继续陪伴你。` : bridge.isDesktop ? `${next.name}已经来到你的桌面` : `${next.name}已在本地预览中领养`); }
  }
  async function interact(type) {
    if (!state.adopted) { notify('先为小伙伴起个名字，点击领养，就可以一起玩啦。'); return; }
    if (state.settings.paused) { notify('先关闭暂停，再和小伙伴一起玩吧。'); return; }
    if (Date.now() - state.lastInteraction < 800) { notify('稍等一下，小伙伴还在回应你～'); return; }
    if (state.settings.sound) playResponse(activePet.id);
    const next = await dispatch({ type: 'interact', action: type });
    if (next && next.lastInteraction > state.lastInteraction) { setSpeech(responses[activePet.id][type]); notify(`${next.name}：${responses[activePet.id][type]}`); }
  }
  async function settings(patch) { await dispatch({ type: 'settings', patch }); }
  function navigate(id) { setNav(id); document.getElementById(id === 'settings' ? 'companion-settings' : 'adoption')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }
  const stageState = state.adopted ? state : { ...state, species: selected, name, action: { type: 'idle', until: 0 } };
  const happy = state.stats.happiness > 70 ? '心情很棒' : state.stats.happiness > 40 ? '想和你玩' : '需要陪伴';
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#adoption" onClick={event => { event.preventDefault(); navigate('home'); }}><span className="brand-mark"><PawPrint size={23} /></span><span><b>PawPal</b><small>屏边小伙伴</small></span></a>
      <div className="sidebar-section">你的陪伴空间</div>
      <nav aria-label="主导航"><button className={nav === 'home' ? 'active' : ''} onClick={() => navigate('home')}><Home size={18} />我的小伙伴<ChevronRight size={14} /></button><button className={nav === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}><Settings2 size={18} />桌面设置</button></nav>
      <div className="sidebar-note"><div className="tiny-paws"><PawPrint size={17} /><PawPrint size={13} /></div><p>忙碌的日子里，<br />也有一份小小的陪伴。</p><span>A little friend. A lot of joy.</span></div>
      <div className="sidebar-bottom"><span className="local-indicator"><i />陪伴留在这台电脑</span><span className="version">PawPal · v0.2.2</span></div>
    </aside>
    <main className="main-content">
      <header className="page-header"><div><div className="eyebrow">YOUR LITTLE COMPANION</div><h1>让桌面，多一点可爱<span className="headline-star">✳</span></h1><p>选一位小伙伴，让它陪你工作、发呆，和度过每个小日子。</p></div><span className={`environment-badge ${bridge.isDesktop ? 'desktop' : ''}`}><Monitor size={14} />{bridge.isDesktop ? '桌面模式' : '浏览器预览'}</span></header>
      {!bridge.isDesktop && <div className="preview-notice"><CircleHelp size={15} /><span>这里可以试养和互动。使用桌面应用，小伙伴就能走到你的屏幕上。</span><span className="notice-tag">本地保存</span></div>}
      {error && <div className="error-notice" role="alert">{error}</div>}
      <section id="adoption" className="adoption-section" aria-label="领养伙伴"><div className="section-heading"><h2>遇见你的新朋友</h2><span>三种性格，一样治愈</span></div>
        <div className="adoption-grid">{PETS.map(pet => <button type="button" key={pet.id} aria-label={`选择${pet.label} ${pet.defaultName}`} aria-pressed={selected === pet.id} className={`adoption-card animal-${pet.id} ${selected === pet.id ? 'selected' : ''}`} onClick={() => selectPet(pet)}><span className="selection-dot">{selected === pet.id && <Check size={12} />}</span><div className="card-art"><Pet pet={pet} size={132} ambient={false} /><span className="card-art-shadow" /></div><div className="card-description"><span className="animal-type">{pet.label}</span><h3>{pet.defaultName}</h3><p>{pet.personality || pet.subtitle}</p><span className="card-trait">{pet.id === 'cat' ? '独立 · 爱撒娇' : pet.id === 'dog' ? '热情 · 爱玩球' : '灵巧 · 爱唱歌'}</span></div></button>)}</div>
        <form className="adoption-form" onSubmit={adopt}><div className="name-field"><PawPrint size={17} /><label htmlFor="pet-name">给伙伴起个名字</label><input id="pet-name" value={name} onChange={event => setName(event.target.value)} maxLength={24} placeholder={chosen.defaultName} required /></div><button className="primary-button" type="submit"><Heart size={16} />{state.adopted && selected === state.species ? (name.trim() === state.name ? `${state.name}，继续陪伴` : `为伙伴改名为${name.trim() || chosen.defaultName}`) : `${bridge.isDesktop ? '领养' : '在预览中领养'}${name.trim() || chosen.defaultName}`}<ArrowRight size={16} /></button></form>
      </section>
      <section className="play-section" aria-label="互动桌面"><div className="section-heading"><div className="heading-with-pill"><h2>{state.adopted ? `${state.name}的桌面` : '先和它打个招呼'}</h2>{state.adopted && <span className="mood-pill"><span />{happy}</span>}</div><span className="stage-meta"><span className="small-dot" />{activePet.toyLabel || '快乐小玩具'}</span></div>
        <Stage pet={activePet} state={stageState} speech={speech} onInteract={interact} />
        <div className="interaction-bar">{actions.map(({ id, label, detail, icon: Icon }) => <button type="button" key={id} onClick={() => interact(id)} aria-label={label} className={state.action?.type === id && state.action.until > clock ? 'action-active' : ''}><span className={`action-icon action-${id}`}><Icon size={21} /></span><span><b>{label}</b><small>{id === 'play' ? activePet.toyLabel || detail : detail}</small></span><ChevronRight size={14} /></button>)}</div>
      </section>
      <div className="details-grid">
        <section className="care-card"><div className="section-heading"><h2>小伙伴的今天</h2><Heart size={17} className="subtle-icon" /></div><p className="card-subtitle">好好吃饭，好好睡觉，也要好好玩。</p><div className="stats-grid"><Stat label="心情" value={state.stats.happiness} icon={Sparkles} tone="pink" /><Stat label="饱腹" value={state.stats.hunger} icon={Utensils} tone="green" /><Stat label="精力" value={state.stats.energy} icon={Moon} tone="purple" /><Stat label="亲密度" value={state.stats.bond} icon={Heart} tone="peach" /></div><div className="care-note"><Leaf size={16} /><span>{state.adopted ? `${state.name}会记住每一次温柔的互动。` : '领养后，每次陪伴都会让你们更亲近。'}</span></div></section>
        <section className="settings-card" id="companion-settings"><div className="section-heading"><h2>按你的节奏陪伴</h2><Settings2 size={17} className="subtle-icon" /></div><div className="movement-setting"><label>活动范围</label><div className="segmented"><button aria-pressed={state.settings.movement === 'free'} aria-label="在桌面自由活动" onClick={() => settings({ movement: 'free' })}><Maximize2 size={15} />自由活动</button><button aria-pressed={state.settings.movement === 'edge'} aria-label="贴着屏幕边缘" onClick={() => settings({ movement: 'edge' })}><PanelLeft size={15} />屏幕边缘</button></div></div><div className="size-setting"><label htmlFor="pet-size">伙伴大小<span>{Math.round(state.settings.size * 100)}%</span></label><div><PawPrint size={13} /><input aria-label="伙伴大小" id="pet-size" type="range" min="0.65" max="1.5" step="0.05" value={state.settings.size} onChange={event => settings({ size: Number(event.target.value) })} /><PawPrint size={19} /></div></div><Switch label="暂停活动" icon={state.settings.paused ? Play : Pause} checked={state.settings.paused} onChange={paused => settings({ paused })} /><Switch label="轻声回应" icon={Volume2} checked={state.settings.sound} onChange={sound => settings({ sound })} /><Switch label="始终在最上层" icon={Monitor} checked={state.settings.alwaysOnTop} onChange={alwaysOnTop => settings({ alwaysOnTop })} /></section>
      </div>
      <footer className="page-footer"><span><PawPrint size={13} />一点可爱，刚刚好。</span><span>{bridge.isDesktop ? '从系统托盘随时找回小伙伴' : '浏览器仅展示互动预览'}</span></footer>
    </main>
    {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><button aria-label="关闭提示" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>;
}
