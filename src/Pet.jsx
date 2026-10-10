import { useEffect, useState } from 'react';

/** Atlas sprite: six 512-square poses in a 3 × 2 PNG. Pass species, size, action,
 * walking, facing (-1 or 1), and optional pointer handlers. No image cropping. */
export default function Pet({ pet, size = 200, action = 'idle', walking = false, facing = 1, className = '', style, ...handlers }) {
  const [step, setStep] = useState(false);
  useEffect(() => {
    if (!walking) return;
    const timer = setInterval(() => setStep(previous => !previous), pet.id === 'parrot' ? 180 : pet.id === 'dog' ? 290 : 360);
    return () => clearInterval(timer);
  }, [walking, pet.id]);
  const pose = action === 'rest' ? 3 : action === 'play' ? 4 : action === 'pet' || action === 'feed' ? 5 : walking ? (pet.id === 'parrot' ? (step ? 4 : 1) : (step ? 1 : 2)) : 0;
  return <div
    className={`pet-sprite ${walking ? 'is-walking' : ''} ${pet.id === 'parrot' && walking ? 'is-flying' : ''} ${action === 'rest' ? 'is-sleeping' : ''} ${className}`}
    style={{ width: size, height: size, backgroundImage: `url("${import.meta.env.BASE_URL}${pet.asset}")`, backgroundPosition: `${(pose % 3) * 50}% ${Math.floor(pose / 3) * 100}%`, '--pet-facing': facing, ...style }}
    role="img" aria-label={`${pet.label}${action === 'rest' ? '正在睡觉' : walking ? '正在活动' : ''}`}
    {...handlers}
  />;
}
