import type { LocationKind } from '../types';

const numberFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });
const dateFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const shortDateFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
});

export function formatQuantity(value: number, unit?: string): string {
  const text = numberFormat.format(value);
  return unit ? `${text} ${unit}` : text;
}

export function formatMoney(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(value);
}

export function formatDate(value: string | null): string {
  if (!value) return '–';
  return dateFormat.format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

export function formatShortDate(value: string): string {
  return shortDateFormat.format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

export function formatDateTime(value: string): string {
  return dateTimeFormat.format(new Date(value));
}

/** Tage bis zum Mindesthaltbarkeitsdatum; negativ bedeutet abgelaufen. */
export function daysUntil(date: string): number {
  const target = new Date(`${date.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export type ExpiryLevel = 'expired' | 'today' | 'soon' | 'ok' | 'none';

export function expiryLevel(bestBefore: string | null, warnDays: number): ExpiryLevel {
  if (!bestBefore) return 'none';
  const days = daysUntil(bestBefore);
  if (days < 0) return 'expired';
  if (days === 0) return 'today';
  if (days <= warnDays) return 'soon';
  return 'ok';
}

/** Klartext statt reiner Farbcodierung – Farbe trägt nirgends allein die Aussage. */
export function expiryText(bestBefore: string | null): string {
  if (!bestBefore) return 'ohne MHD';
  const days = daysUntil(bestBefore);
  if (days < -1) return `seit ${Math.abs(days)} Tagen abgelaufen`;
  if (days === -1) return 'gestern abgelaufen';
  if (days === 0) return 'läuft heute ab';
  if (days === 1) return 'läuft morgen ab';
  if (days <= 31) return `noch ${days} Tage`;
  return `bis ${formatDate(bestBefore)}`;
}

export const LOCATION_LABELS: Record<LocationKind, string> = {
  fridge: 'Kühlschrank',
  freezer: 'Gefrierfach',
  pantry: 'Vorratskammer',
  cellar: 'Keller',
  kitchen: 'Küche',
  other: 'Sonstiges',
};

export const MOVEMENT_LABELS: Record<string, string> = {
  purchase: 'Eingang',
  consume: 'Verbraucht',
  waste: 'Entsorgt',
  move: 'Umgelagert',
  correction: 'Korrektur',
};

/** Erlaubt Komma als Dezimaltrennzeichen, wie auf deutschen Tastaturen üblich. */
export function parseDecimal(value: string): number | null {
  const normalized = value.replace(',', '.').trim();
  if (normalized === '') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function todayIso(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export function addDaysIso(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() + days);
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}
