import { format, isToday, isYesterday, differenceInCalendarDays, isValid } from 'date-fns';

function isValidDate(date: any): boolean {
  if (!date) return false;
  const d = new Date(date);
  return !isNaN(d.getTime()) && isValid(d);
}

export function formatMessageTimestamp(timestamp: Date): string {
  if (!isValidDate(timestamp)) {
    return 'Just now';
  }
  
  const date = new Date(timestamp);
  const now = new Date();
  const daysDiff = differenceInCalendarDays(now, date);

  if (daysDiff === 0) {
    // Today: show time only
    return format(date, 'h:mm a');
  } else if (daysDiff < 7) {
    // Within last week: show day and time
    return format(date, 'EEE, h:mm a');
  } else {
    // Older: show month, day, and time
    return format(date, 'MMM d, h:mm a');
  }
}

export function formatDateDivider(timestamp: Date): string {
  if (!isValidDate(timestamp)) {
    return 'Recent';
  }
  
  const date = new Date(timestamp);
  
  if (isToday(date)) {
    return 'Today';
  } else if (isYesterday(date)) {
    return 'Yesterday';
  } else {
    return format(date, 'MMMM d, yyyy');
  }
}

export function shouldShowDateDivider(currentMsg: Date, previousMsg?: Date): boolean {
  if (!previousMsg) return true;
  if (!isValidDate(currentMsg) || !isValidDate(previousMsg)) return false;
  
  const current = new Date(currentMsg);
  const previous = new Date(previousMsg);
  
  // Show divider if messages are on different days
  return differenceInCalendarDays(current, previous) !== 0;
}
