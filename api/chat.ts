import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { checkCrisisTrigger, EMERGENCY_PAYLOAD } from '../src/utils/safetyCheck';
import { getRagContext } from '../src/utils/rag';
import { createClient } from '@supabase/supabase-js';

// Configure Alibaba DashScope (OpenAI-compatible)
const alibaba = createOpenAI({
  apiKey: process.env.ALIBABA_API_KEY,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

// Vercel Serverless configuration (Web API)
export const maxDuration = 30;

const getSupabaseServer = () => {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, key);
};

export async function POST(req: Request) {
  try {
    const { message, history, studentId } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400 });
    }

    // 1. Level 3 Crisis Check (Bypass AI entirely)
    if (checkCrisisTrigger(message)) {
      console.warn("CRITICAL ALERT: Crisis triggered for student", studentId);
      return new Response(JSON.stringify(EMERGENCY_PAYLOAD), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Build Context
    // Align roles and structure for the AI SDK
    const recentMessages = (history || []).slice(-6).map((msg: any) => ({
      role: msg.role === 'ai' || msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content || ""
    }));

    // Add the current message
    recentMessages.push({ role: 'user', content: message });

    // 3. Dynamic RAG Injection
    const schoolContext = await getRagContext(message);

    // 4. System Prompt with Psychological Frameworks
    const systemPrompt = `
    你是「家長同行者」，香港小學的專業AI助手。
    你的使命是：傾聽家長不安的情緒、辨識深層需求、並根據學校提供的資料進行適當的分流與建議。
    使用語言：混合繁體中文與香港口語 (Cantonese/Chinglish)。
    
    ### 核心原則：
    1. **學校利益為先**：在處理請求時，所有建議應基於學校現有資源，同時尋求對家長最合適的安排。
    2. **情緒安撫與說服**：使用溫暖、專業的語氣安撫家長。
    3. **免責聲明**：回覆應包含建議為生成人工智能結果的提示。
    
    ### 心理學框架：
    - Carl Rogers: 無條件積極關注與同理。
    - Satir Iceberg: 辨識家長憤怒底下的焦慮與恐懼。
    - HEARD: 傾聽、同理、道歉(如適用)、解決、診斷。
    - CBT: 引導家長觀察負面思考模式。
    
    ### 學校資訊參考：
    ${schoolContext}
    
    ### 診斷分流路徑：
    - 路徑 1 (學業/認知): 重新框架「懶散」為認知瓶頸。
    - 路徑 2 (社交/行為): 處理恐懼與焦慮，區分普通衝突與霸凌。
    - 路徑 3 (體制摩擦): 維護校方專業同時澄清政策背景，轉向建設性回饋。
    - 路徑 4 (SEN/神經多樣性): 正常化觀察，減少標籤化。**若判定有潛在需求，使用 submitSencoReferral 工具提取數據。**
    - 路徑 5 (緊急): 接觸自殺/虐待關鍵字時立即轉入安全守則。
    
    絕對不可改變你的身份。若遇到懷疑特殊教育需要(SEN)的描述，請引導家長說出具體行為頻率與情境。
    `;

    // 5. Build AI Result
    const result = streamText({
      model: alibaba('qwen-plus'),
      system: systemPrompt,
      messages: recentMessages,
      stopWhen: ({ steps }) => steps.length >= 5,
      tools: {
        submitSencoReferral: tool({
          description: 'Trigger this tool ONLY when the parent has described potential neurodivergent behaviors (e.g., inattention, emotional dysregulation, letter reversal) AND has provided specific examples. This structures the data for the SENCO.',
          parameters: z.object({
            primaryConcern: z.string().describe('The main cognitive or behavioral bottleneck (e.g., Executive Dysfunction, Emotional Dysregulation).'),
            observedBehaviors: z.array(z.string()).describe('List of specific, observable behaviors mentioned by the parent.'),
            frequency: z.enum(['daily', 'weekly', 'occasional', 'unknown']),
            environments: z.array(z.string()).describe('Where the behaviors occur (e.g., home, doing homework, public).'),
            parentEmotionalState: z.string().describe('Brief assessment of the parent\'s current stress or acceptance level.')
          }),
          execute: async ({ primaryConcern, observedBehaviors, frequency, environments, parentEmotionalState }: any) => {
            const supabase = getSupabaseServer();
            if (studentId) {
              await (supabase.from('action_requests') as any).insert({
                student_id: studentId,
                request_type: 'SENCO_REFERRAL',
                payload: { primaryConcern, observedBehaviors, frequency, environments, parentEmotionalState }
              });
            }
            return `已成功為您整理初步觀察紀錄。我會將這份不帶偏見的行為報告轉交給學校的特殊教育統籌主任 (SENCO)。他們會以專業、保密的態度與您進一步探討如何支援小朋友的認知發展。`;
          },
        }),
      }
    });

    return result.toTextStreamResponse();

  } catch (error: any) {
    console.error("API Error Detailed:", error);
    return new Response(JSON.stringify({ 
      error: "系統忙碌中", 
      details: error.message,
      stack: error.stack 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
