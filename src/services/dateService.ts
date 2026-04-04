export function formatApiDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function formatExclusiveFromDateTime(date: string) {
  const previousDate = new Date(`${date}T12:00:00`);
  previousDate.setDate(previousDate.getDate() - 1);
  return `${formatApiDate(previousDate)} 23:59:00`;
}

export function formatApiDateTime(date: string, boundary: 'start' | 'end') {
  if (boundary === 'start') {
    const previousDate = new Date(`${date}T12:00:00`);
    previousDate.setDate(previousDate.getDate() - 1);
    return `${formatApiDate(previousDate)} 23:50:00`;
  }

  return `${date} 23:59:59`;
}

export function formatDisplayDate(date: string) {
  const parsedDate = new Date(`${date}T12:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  const dateLabel = new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
    weekday: 'long',
  }).format(parsedDate);

  return dateLabel;
}

export function getRelativeDate(referenceDate: Date, offsetDays: number) {
  const nextDate = new Date(referenceDate);
  nextDate.setDate(referenceDate.getDate() + offsetDays);
  return nextDate;
}

export function isValidIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
