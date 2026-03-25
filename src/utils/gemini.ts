export async function getChatResponse(message: string, history: any[] = [], studentId?: string): Promise<ReadableStream<Uint8Array>> {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, history, studentId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch response');
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    return response.body as ReadableStream<Uint8Array>;
  } catch (error) {
    console.error("Chat Error:", error);
    throw error;
  }
}
