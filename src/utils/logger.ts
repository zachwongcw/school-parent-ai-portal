/**
 * Logging Utility for Google Sheets
 * 
 * To use this, you need a Google Apps Script Web App URL.
 * The script should handle POST requests and append data to a spreadsheet.
 */

const GOOGLE_SHEETS_URL = import.meta.env.VITE_LOGGING_ENDPOINT || "";

export type LogEntry = {
  timestamp: string;
  studentId: string;
  studentName: string;
  type: 'CHAT_LOG' | 'NOTIFICATION_REQUEST' | 'EMERGENCY_ALERT';
  content: string;
  metadata?: any;
};

export async function logToSheets(entry: LogEntry) {
  if (!GOOGLE_SHEETS_URL) {
    console.warn("Logging disabled: VITE_LOGGING_ENDPOINT is not set.");
    return false;
  }

  try {
    await fetch(GOOGLE_SHEETS_URL, {
      method: 'POST',
      mode: 'no-cors', // Apps Script usually requires no-cors if not handling preflight
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(entry),
    });
    return true;
  } catch (error) {
    console.error("Failed to log to Google Sheets:", error);
    return false;
  }
}
