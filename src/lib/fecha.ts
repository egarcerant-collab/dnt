/** Fecha de hoy (yyyy-mm-dd) en hora de Colombia, independiente de la zona del servidor. */
export function hoyColombia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

/** Hora actual (HHhMM, 24 h) en hora de Colombia, para nombres de archivo. */
export function horaColombia(): string {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date())
    .replace(':', 'h');
}
