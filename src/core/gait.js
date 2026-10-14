import { PETS } from './pets.js';

// Keep this in sync with the overlay's 6px horizontal padding and76% sprite.
export const desktopSpriteSize = windowWidth => (windowWidth - 12) * .76;

// Scaling accepted travel with the visible pet keeps resizing from accelerating
// its gait. The controller still advances only from actual native displacement.
export function gaitSpeedDip(species, action, spriteSizeDip) {
  const kind = PETS.find(pet => pet.id === species)?.kind ?? species;
  const speed = kind === 'parrot' ? 85 : kind === 'dog' ? 58 : 42;
  return speed * (action === 'play' ? 1.7 : 1) * spriteSizeDip / desktopSpriteSize(340);
}
