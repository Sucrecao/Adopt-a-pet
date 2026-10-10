const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function clampWindow(bounds, workArea) {
  const width = clamp(bounds.width, 0, workArea.width);
  const height = clamp(bounds.height, 0, workArea.height);
  return { x: clamp(bounds.x, workArea.x, workArea.x + workArea.width - width),
    y: clamp(bounds.y, workArea.y, workArea.y + workArea.height - height), width, height };
}

export function chooseTarget(bounds, workArea, mode, random = Math.random) {
  const size = clampWindow(bounds, workArea);
  const sample = () => clamp(random(), 0, 1);
  return { x: workArea.x + sample() * (workArea.width - size.width),
    y: workArea.y + (mode === 'edge' ? 1 : sample()) * (workArea.height - size.height) };
}
