/** Timestamp of the API response, never a timestamp of database updates. */
export function displayGeneratedAt(value: string, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Indisponível';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, dateStyle: 'short', timeStyle: 'medium' }).format(date);
}
