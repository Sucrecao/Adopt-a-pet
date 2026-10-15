import { Footprints } from 'lucide-react';
import './stand-reminder.css';

export default function StandReminder({ reminder, onDismiss, compact = false, bubbleRef }) {
  if (!reminder) return null;
  return <div ref={bubbleRef} className={`stand-reminder ${compact ? 'is-compact' : ''}`} role="status" aria-label="起身提醒" aria-live="polite">
    <div className="stand-reminder-heading"><span className="stand-reminder-icon"><Footprints size={16} /></span><b>起来陪我站一会儿吧</b><button type="button" onClick={onDismiss} aria-label="知道啦">知道啦</button></div>
    <p>{reminder.text}</p>
  </div>;
}
