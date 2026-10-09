import { displayDate } from '../../lib/display-date';

/** Date-only input: UTC is an arithmetic calendar, never a conversion from a local timezone. */
function calendarDay(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  // setUTCFullYear avoids Date.UTC's special handling of years 00–99.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime() / 86400000;
}

export function contractExpiryLabel(expiryDate: string | null | undefined, reference: string | null | undefined): string {
  const expiry = calendarDay(expiryDate);
  const referenceDay = calendarDay(reference);
  if (expiry === null || referenceDay === null) return 'Data de vigência indisponível';
  const days = expiry - referenceDay;
  if (days === 0) return 'Vence hoje';
  const count = Math.abs(days);
  const duration = `${count} ${count === 1 ? 'dia' : 'dias'}`;
  return days > 0 ? `Vence em ${duration}` : `Vencido há ${duration}`;
}

export function FiscalContractExpiry({ expiryDate, reference, timezone }: {
  expiryDate: string | null; reference: string; timezone: string;
}) {
  return <div className="fiscal-contract-expiry">
    {calendarDay(expiryDate) === null ? <span>Indisponível</span> : <time dateTime={expiryDate!}>{displayDate(expiryDate, timezone)}</time>}
    <small>{contractExpiryLabel(expiryDate, reference)}</small>
  </div>;
}

export function FiscalExpiryReferenceNote({ reference }: { reference: string }) {
  return <p className="source-note">Contagem em dias de calendário em relação à referência {displayDate(reference)}. Refere-se à vigência contratual, não ao prazo de decisão fiscal.</p>;
}
