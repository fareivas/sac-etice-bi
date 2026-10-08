/** Formats API date-only values without shifting their calendar day. */
export function displayDate(value: string | null | undefined, timezone = 'America/Fortaleza'): string {
  if (!value) return 'Indisponível';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Indisponível' :
    new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: timezone }).format(date);
}
