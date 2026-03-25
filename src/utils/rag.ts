// src/utils/rag.ts
import { supabase } from './supabase';

/**
 * Fetches relevant school knowledge from Supabase.
 * For now, it returns a consolidated string from the 'knowledge_base' table (or fallback).
 */
export async function getRagContext(query: string): Promise<string> {
    try {
        // In a real RAG implementation, we would use vector search here.
        // For the current requirement, we'll fetch from a structured knowledge table.
        const { data, error } = await supabase
            .from('knowledge_base')
            .select('content')
            .limit(10);
        
        if (data && !error) {
            return data.map((item: any) => item.content).join('\n\n');
        }

        // Fallback to static knowledge if Supabase isn't populated yet
        return `
### 學校基本資料
- 學校名稱：何東東小學 (Mock School)
- 地址：香港九龍尖沙咀某處
- 電話：2345 6789
- 辦公時間：週一至五 08:00 - 17:00

### 2023-2024 重要校曆
- 9月1日：開學日
- 12月22日 - 1月2日：聖誕假期
- 2月8日 - 2月19日：農曆新年假期
- 7月12日：學年最後一天

### 學生支援流程
- 若學生感到壓力，可聯繫駐校社工 (陳主任)。
- 課外活動報名截止日期：每年 9 月 15 日。
- 請假手續：需於當天早上 8:30 前致電校務處，並於回校後提交病假證明。
        `;
    } catch (error) {
        console.error("RAG Error:", error);
        return "";
    }
}
