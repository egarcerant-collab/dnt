/** Fecha de hoy (yyyy-mm-dd) en hora de Colombia, independiente de la zona del servidor. */
export function hoyColombia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}
