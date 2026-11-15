import type { ApiAccess, HealthState } from '../../hooks/useRuntime';
import type { Tone } from '../common/ui';

export function healthTone(h: HealthState): Tone {
  return h === 'ok' ? 'ok' : h === 'degraded' ? 'warn' : h === 'down' ? 'danger' : 'muted';
}

export function healthLabel(h: HealthState): string {
  switch (h) {
    case 'ok':
      return 'Runtime healthy';
    case 'degraded':
      return 'No model loaded';
    case 'down':
      return 'Runtime unreachable';
    default:
      return 'Connecting…';
  }
}

export function accessLabel(a: ApiAccess, h: HealthState): string {
  if (h === 'down') return 'Disconnected';
  switch (a) {
    case 'open':
      return 'Connected · open';
    case 'key':
      return 'Connected · API key';
    case 'required':
      return 'API key required';
    default:
      return 'Connecting…';
  }
}
