/**
 * Telegram Notification Dispatcher
 * Sends real-time alerts for orders, TP/SL executions, news blackouts, and daily profit summaries.
 * Direct integration with Telegram Bot API (https://api.telegram.org/bot<token>/sendMessage).
 */

export interface TelegramMessagePayload {
  title: string;
  type: 'ORDER_OPEN' | 'TP_HIT' | 'SL_HIT' | 'NEWS_BLACKOUT' | 'DAILY_SUMMARY' | 'RISK_ALERT' | 'TEST';
  details: Record<string, string | number>;
}

export function formatTelegramMessage(payload: TelegramMessagePayload): string {
  const icon = {
    ORDER_OPEN: '⚡',
    TP_HIT: '🎯',
    SL_HIT: '🛑',
    NEWS_BLACKOUT: '⚠️',
    DAILY_SUMMARY: '📊',
    RISK_ALERT: '🚨',
    TEST: '🔔',
  }[payload.type] || '🤖';

  let msg = `<b>${icon} QuantumTrade AI | ${payload.title}</b>\n`;
  msg += `─────────────────────\n`;

  for (const [key, val] of Object.entries(payload.details)) {
    msg += `<b>${key}:</b> <code>${val}</code>\n`;
  }

  msg += `─────────────────────\n`;
  msg += `<i>🕒 ${new Date().toLocaleTimeString('th-TH')} | 24/7 Google Cloud Free Tier</i>`;
  return msg;
}

/**
 * Sends a message to Telegram Bot API
 */
export async function sendTelegramAlert(
  botToken: string,
  chatId: string,
  payload: TelegramMessagePayload
): Promise<{ success: boolean; error?: string }> {
  if (!botToken || !chatId) {
    return { success: false, error: 'Telegram Bot Token and Chat ID are required.' };
  }

  const text = formatTelegramMessage(payload);
  const url = `https://api.telegram.org/bot${botToken.trim()}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId.trim(),
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json();
    if (data.ok) {
      return { success: true };
    } else {
      return { success: false, error: data.description || 'Failed to dispatch Telegram message' };
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error reaching Telegram API' };
  }
}
