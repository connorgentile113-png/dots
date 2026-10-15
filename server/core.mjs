import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { CronExpressionParser } from 'cron-parser';

export const MIN_INTERVAL = 30 * 60_000;
export const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export const monthKey = (now = Date.now()) => dayKey(now).slice(0, 7);
export const nextUtcDay = now => Date.parse(dayKey(now)) + 86400_000;
export const nextUtcMonth = now => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };
export function text(value, max = 6000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Expected text between 1 and ${max} characters`);
  return value.trim();
}
export function identifier(value) {
  if (typeof value !== 'string' || !/^[\w-]{1,128}$/.test(value)) throw new Error('Invalid identifier');
  return value;
}
export function scheduleSpec(value, now = Date.now()) {
  const timezone = value.timezone || 'UTC';
  new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  const kind = value.kind || 'interval';
  if (kind === 'once') {
    const at = Number(value.at);
    if (!Number.isFinite(at) || at < now + 1000) throw new Error('One-time schedule must be in the future');
    return { kind, at, timezone };
  }
  if (kind === 'cron') {
    const cron = text(value.cron, 100);
    if (cron.split(/\s+/).length !== 5) throw new Error('Use a five-field cron expression');
    const interval = CronExpressionParser.parse(cron, { currentDate: now, tz: timezone });
    let previous = interval.next().getTime();
    for (let i = 0; i < 64; i++) {
      const next = interval.next().getTime();
      if (next - previous < MIN_INTERVAL) throw new Error('Cron jobs must be at least 30 minutes apart');
      previous = next;
    }
    return { kind, cron, timezone };
  }
  const minutes = Number(value.minutes ?? 30);
  if (!Number.isInteger(minutes) || minutes < 30 || minutes > 525600) throw new Error('Interval must be 30–525600 minutes');
  return { kind: 'interval', minutes, timezone };
}
export function nextOccurrence(spec, after) {
  if (spec.kind === 'once') return null;
  if (spec.kind === 'cron') return CronExpressionParser.parse(spec.cron, { currentDate: after, tz: spec.timezone }).next().getTime();
  return after + spec.minutes * 60000;
}
export function firstOccurrence(spec, now) { return spec.kind === 'once' ? spec.at : nextOccurrence(spec, now); }
export function occurrenceId(schedule, at) { return hash(`${schedule}:${at}`).slice(0, 32); }
export function retryAt(headers, attempt, now = Date.now(), random = Math.random) {
  const raw = headers?.get?.('retry-after');
  if (raw) {
    const seconds = Number(raw);
    const date = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(raw);
    if (Number.isFinite(date) && date > now) return date;
  }
  return now + Math.min(3600_000, 60_000 * 2 ** Math.min(attempt, 6)) + Math.floor(random() * 10000);
}
export class DeferredError extends Error {
  constructor(message, until, scope = 'nvidia') { super(message); this.until = until; this.scope = scope; }
}
export function chooseModel(models, preference, task, metrics = {}) {
  if (!models.length) throw new Error('No NVIDIA models configured');
  if (preference && preference !== 'auto') {
    if (!models.some(m => m.id === preference)) throw new Error('Selected model is not in the allowed registry');
    return { id: preference, reason: 'Your pinned model' };
  }
  const coding = /code|terminal|script|debug|compile|test/i.test(task);
  const reasoning = /research|compare|plan|analy[sz]|investigate/i.test(task);
  const scored = models.filter(m => m.tools !== false).map(m => ({ ...m, score:
    (coding && m.coding ? 4 : 0) + (reasoning && m.reasoning ? 3 : 0) +
    (m.fast ? 1 : 0) - (metrics[m.id]?.failures || 0) * 2 }));
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) throw new Error('No tool-capable model configured');
  return { id: scored[0].id, reason: coding ? 'Code-oriented task, filtered by availability' : reasoning ? 'Planning task, filtered by availability' : 'Available general-purpose model' };
}
export function retrieveMemories(memories, goal, limit = 6) {
  const words = new Set(goal.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  return memories.filter(m => !m.expiresAt || m.expiresAt > Date.now()).map(m => ({ ...m, score:
    (m.pinned ? 10 : 0) + [...words].filter(w => m.text?.toLowerCase().includes(w)).length
  })).filter(m => m.score > 0).sort((a, b) => b.score - a.score || b.createdAt - a.createdAt).slice(0, limit);
}
export function compactContext(history, budget = 24000) {
  // Keep complete assistant/tool groups. Never leave orphaned tool responses.
  const groups = [];
  for (const message of history) {
    if (message.role === 'tool' && groups.length) groups.at(-1).push(message);
    else groups.push([message]);
  }
  const kept = []; let size = 0;
  for (let i = groups.length - 1; i >= 0; i--) {
    const bytes = JSON.stringify(groups[i]).length;
    if (size + bytes > budget) break;
    kept.unshift(...groups[i]); size += bytes;
  }
  return kept;
}
export function encryptSnapshot(data, keyBase64) {
  const key = Buffer.from(keyBase64 || '', 'base64');
  if (key.length !== 32) throw new Error('BACKUP_KEY_BASE64 must contain exactly 32 random bytes');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  return { version: 1, algorithm: 'AES-256-GCM', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}
export function decryptSnapshot(data, keyBase64) {
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyBase64, 'base64'), Buffer.from(data.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.ciphertext, 'base64')), decipher.final()]).toString());
}
