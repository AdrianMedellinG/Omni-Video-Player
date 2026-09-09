export const SEEK_STEP_OPTIONS = Object.freeze([10, 30]);

export function normalizeSeekStep(value, fallback = 10) {
  const candidate = Number(value);
  if (SEEK_STEP_OPTIONS.includes(candidate)) return candidate;
  return Number(fallback) === 30 ? 30 : 10;
}

export function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return '00:00';
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}
