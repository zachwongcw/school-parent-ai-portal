// src/utils/safetyCheck.ts

const CRISIS_KEYWORDS = [
  '想死', '𠝹手', '跳樓', '唔想做人', '殺', // Self-harm/Suicide
  '俾人打', '流血', '救命', '家暴', // Violence/Abuse
  '不想活', '自殺' // Written Chinese equivalents
];

export function checkCrisisTrigger(message: string): boolean {
  if (!message) return false;
  const lowerMessage = message.toLowerCase();
  return CRISIS_KEYWORDS.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
}

export const EMERGENCY_PAYLOAD = {
  role: 'assistant',
  content: '⚠️ **緊急支援 / Emergency Support** ⚠️\n\n系統偵測到您可能面臨緊急情況。請立即尋求協助：\n\n* **報警求助 (Police):** 999\n* **生命熱線 (The Samaritan Befrienders):** 2389 2222\n* **社會福利署熱線 (SWD Hotline):** 2343 2255\n* **向晴熱線 (Family Crisis Centre):** 18288\n\n此對話已暫停，學校社工團隊已收到通知。',
  isEmergency: true
};
