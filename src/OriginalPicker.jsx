import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, PawPrint, X } from 'lucide-react';
import './original-picker.css';

export const ORIGINAL_LABELS = ['爱心', '送心', '抱心', '鲜花', '贴贴', '拥抱', '招手', '疑问', '玩闹', '委屈', '探头', '紧张', '面壁', '难过', '撒娇', '开心', '惊讶', '哭哭', '零食', '运动', '开饭', '歇歇', '哈欠', '睡觉'];

const metadataCache = new Map();
const assetUrl = asset => `${import.meta.env.BASE_URL}${asset}`;

function loadMetadata(asset) {
  if (!metadataCache.has(asset)) {
    const request = fetch(assetUrl(asset)).then(async response => {
      if (!response.ok) throw new Error('Original thumbnails unavailable');
      const metadata = await response.json();
      if (metadata.version !== 1 || metadata.mode !== 'original-apng-v1' || !Array.isArray(metadata.clips)) {
        throw new Error('Invalid original thumbnail metadata');
      }
      return metadata;
    }).catch(error => { metadataCache.delete(asset); throw error; });
    metadataCache.set(asset, request);
  }
  return metadataCache.get(asset);
}

export default function OriginalPicker({ pet, clip, onSelect, onClose, compact = false, menuRef }) {
  const localRef = useRef(null), closeRef = useRef(null), closeCallback = useRef(onClose);
  const [metadata, setMetadata] = useState(null), [loadState, setLoadState] = useState('loading');
  closeCallback.current = onClose;

  useEffect(() => {
    let alive = true;
    setMetadata(null); setLoadState('loading');
    loadMetadata(pet.originalMetaAsset).then(value => {
      if (alive) { setMetadata(value); setLoadState('ready'); }
    }).catch(() => { if (alive) setLoadState('error'); });
    return () => { alive = false; };
  }, [pet.originalMetaAsset]);

  useLayoutEffect(() => {
    if (compact || !localRef.current) return;
    const menu = localRef.current;
    const reveal = () => menu.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    reveal();
    const resize = new ResizeObserver(reveal);
    resize.observe(menu);
    window.addEventListener('resize', reveal);
    return () => { resize.disconnect(); window.removeEventListener('resize', reveal); };
  }, [compact, loadState]);

  useEffect(() => {
    const menu = localRef.current;
    const active = document.activeElement;
    const trigger = active?.closest?.('[data-expression-trigger]')
      || menu?.parentElement?.querySelector('[data-expression-trigger]')
      || document.querySelector('[data-expression-trigger]');
    closeRef.current?.focus({ preventScroll: true });
    function outside(event) {
      if (!menu?.contains(event.target) && !event.target.closest?.('[data-expression-trigger]')) {
        closeCallback.current?.();
      }
    }
    function keyboard(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); closeCallback.current?.();
    }
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keyboard, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', keyboard, true);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return <div ref={element => {
    localRef.current = element;
    if (typeof menuRef === 'function') menuRef(element);
    else if (menuRef) menuRef.current = element;
  }} className={`original-expression-picker ${compact ? 'is-compact' : ''}`}
    role="dialog" aria-label="换个表情">
    <div className="expression-picker-heading">
      <div><b>换个表情</b><span>{compact ? '选个小心情，陪你一会儿' : '挑一个小心情，我演给你看。'}</span></div>
      <button ref={closeRef} type="button" className="expression-picker-close" aria-label="关闭表情选择" onClick={onClose}><X size={16} /></button>
    </div>
    {loadState !== 'ready' && <p className="expression-picker-status" role="status">{loadState === 'error' ? '小图暂时没赶来，点名字也能播放。' : '小表情正在赶来…'}</p>}
    <div className="expression-picker-scroll">
      <div className="expression-picker-grid">{ORIGINAL_LABELS.map((label, index) => {
        const id = index + 1, source = metadata?.clips.find(item => item.id === id);
        const thumbnail = source && typeof source.asset === 'string'
          && Number.isInteger(source.columns) && source.columns > 0
          && Number.isInteger(source.rows) && source.rows > 0
          && source.frameSize?.[0] === 320 && source.frameSize?.[1] === 300;
        return <button type="button" className="expression-picker-choice" key={id}
          aria-label={`播放${label}`} aria-pressed={clip === id}
          onClick={() => { onSelect(id); onClose?.(); }}>
          <span className="expression-picker-thumbnail" aria-hidden="true" style={thumbnail ? {
            backgroundImage: `url("${assetUrl(source.asset)}")`,
            backgroundSize: `${source.columns * 100}% ${source.rows * 100}%`,
          } : undefined}>{!thumbnail && <PawPrint size={20} />}</span>
          <span className="expression-picker-label">{label}</span>
          {clip === id && <Check className="expression-picker-check" size={11} aria-hidden="true" />}
        </button>;
      })}</div>
    </div>
  </div>;
}
