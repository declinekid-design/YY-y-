import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { ChatMessage, Role, ModelName, AIProvider } from "../types";

// --- Google Gemini Logic ---
const getGeminiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("System API_KEY missing.");
  }
  return new GoogleGenAI({ apiKey: apiKey });
};

const streamGemini = async (
  history: ChatMessage[],
  newMessage: string,
  newImages: string[],
  modelName: string,
  onChunk: (text: string) => void
): Promise<string> => {
  const ai = getGeminiClient();
  
  // Transform history for the SDK
  const prevHistory = history.slice(0, -1).map(msg => ({
    role: msg.role === Role.USER ? 'user' : 'model',
    parts: msg.images && msg.images.length > 0 
      ? [
          { text: msg.text }, 
          ...msg.images.map(img => ({ inlineData: { mimeType: 'image/jpeg', data: img } }))
        ]
      : [{ text: msg.text }]
  }));

  const chat = ai.chats.create({
    model: modelName,
    history: prevHistory,
    config: {
      temperature: 0.7,
      systemInstruction: "You are a helpful, professional AI assistant in a studio application. Use Markdown for formatting.",
    }
  });

  const parts: any[] = [{ text: newMessage }];
  if (newImages.length > 0) {
    newImages.forEach(img => {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: img
        }
      });
    });
  }

  let responseText = "";
  try {
    const streamResult = await chat.sendMessageStream({ 
      message: parts.length === 1 ? parts[0].text : parts 
    });

    for await (const chunk of streamResult) {
      const c = chunk as GenerateContentResponse;
      if (c.text) {
        responseText += c.text;
        onChunk(responseText);
      }
    }
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    throw error;
  }
  return responseText;
};

// --- OpenAI / Custom Logic (Kimi, DeepSeek) ---
const streamOpenAI = async (
  history: ChatMessage[],
  newMessage: string,
  provider: AIProvider,
  onChunk: (text: string) => void
): Promise<string> => {
  if (!provider.apiKey || !provider.baseUrl) {
    throw new Error("API Key or Base URL missing for custom provider.");
  }

  // Construct standard OpenAI Messages
  // Note: For broad compatibility with text-only providers (DeepSeek/Kimi), we strip images for now 
  // unless we add specific logic for their vision endpoints.
  const apiMessages = history.map(msg => ({
    role: msg.role === Role.MODEL ? 'assistant' : 'user',
    content: msg.text // Focusing on text for compatibility
  }));

  // Add the new message
  apiMessages.push({ role: 'user', content: newMessage });

  // Append system instruction if possible
  const messagesWithSystem = [
    { role: 'system', content: 'You are a helpful, professional AI assistant. Output in Markdown.' },
    ...apiMessages
  ];

  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.modelId,
        messages: messagesWithSystem,
        stream: true,
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Provider Error (${response.status}): ${err}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let done = false;
    let fullText = '';
    let buffer = '';

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        const lines = buffer.split('\n');
        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
            try {
              const json = JSON.parse(trimmed.replace('data: ', ''));
              const content = json.choices?.[0]?.delta?.content || '';
              if (content) {
                fullText += content;
                onChunk(fullText);
              }
            } catch (e) {
               // Ignore parse errors from non-json lines
            }
          }
        }
      }
    }
    return fullText;

  } catch (error) {
    console.error("OpenAI/Custom Chat Error:", error);
    throw error;
  }
};

// --- Main Facade ---
export const streamChatResponse = async (
  history: ChatMessage[],
  newMessage: string,
  newImages: string[], 
  provider: AIProvider,
  onChunk: (text: string) => void
): Promise<string> => {
  if (provider.type === 'gemini') {
    return streamGemini(history, newMessage, newImages, provider.modelId, onChunk);
  } else {
    // OpenAI compatible
    return streamOpenAI(history, newMessage, provider, onChunk);
  }
};

export const generateImage = async (
  prompt: string,
  aspectRatio: string = "1:1"
): Promise<string> => {
  // Only supported on Gemini Imagen currently
  const ai = getGeminiClient();
  try {
    const response = await ai.models.generateImages({
      model: ModelName.IMAGEN,
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: aspectRatio,
      },
    });

    const base64EncodeString = response.generatedImages?.[0]?.image?.imageBytes;
    if (!base64EncodeString) {
      throw new Error("No image generated");
    }
    return `data:image/jpeg;base64,${base64EncodeString}`;
  } catch (error) {
    console.error("Image Gen Error:", error);
    throw error;
  }
};