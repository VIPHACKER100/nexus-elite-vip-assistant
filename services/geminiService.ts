
import { GoogleGenAI, Type, GenerateContentResponse, Modality } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";
import { Memory, AppLanguage } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const buildContextualPrompt = (memories: Memory[], language: AppLanguage) => {
  const langInstructions = `CURRENT LINGUISTIC MODE: ${language.toUpperCase()}. Please ensure your response strictly matches this language style.`;
  
  if (memories.length === 0) return `${SYSTEM_PROMPT}\n\n${langInstructions}`;
  
  const memoryContext = memories.map(m => `- ${m.fact}`).join('\n');
  return `${SYSTEM_PROMPT}\n\n${langInstructions}\n\nUSER MEMORY CORE (Known Facts):\n${memoryContext}`;
};

export const generateAssistantResponseStream = async (
  prompt: string, 
  history: any[] = [], 
  memories: Memory[] = [],
  language: AppLanguage,
  onChunk: (text: string) => void
) => {
  const ai = getAI();
  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction: buildContextualPrompt(memories, language),
      thinkingConfig: { thinkingBudget: 16384 },
    },
    history: history.map(h => ({ 
      role: h.role === 'assistant' ? 'model' : h.role, 
      parts: [{ text: h.content }] 
    }))
  });

  const result = await chat.sendMessageStream({ message: prompt });
  let fullText = "";
  for await (const chunk of result) {
    const text = chunk.text || "";
    fullText += text;
    onChunk(fullText);
  }
  return fullText;
};

export const generateAssistantResponse = async (
  prompt: string, 
  history: any[] = [], 
  memories: Memory[] = [],
  language: AppLanguage,
  useSearch = false, 
  useMaps = false
) => {
  const ai = getAI();
  const tools: any[] = [];
  let model = 'gemini-3-pro-preview';

  if (useSearch) tools.push({ googleSearch: {} });
  if (useMaps) {
    model = 'gemini-2.5-flash';
    tools.push({ googleMaps: {} });
  }

  const response = await ai.models.generateContent({
    model: model,
    contents: [
        ...history.map(h => ({ 
          role: h.role === 'assistant' ? 'model' : h.role, 
          parts: [{ text: h.content }] 
        })),
        { role: 'user', parts: [{ text: prompt }] }
    ],
    config: {
      systemInstruction: buildContextualPrompt(memories, language),
      temperature: 0.8,
      tools: tools.length > 0 ? tools : undefined,
      thinkingConfig: { thinkingBudget: 4096 },
    },
  });

  const text = response.text || "";
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources = groundingChunks
    .map((chunk: any) => {
      if (chunk.web) return { title: chunk.web.title, uri: chunk.web.uri };
      if (chunk.maps) return { title: chunk.maps.title, uri: chunk.maps.uri };
      return null;
    })
    .filter(Boolean);

  return { text, sources };
};

export const generateSpeech = async (text: string): Promise<string | null> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say elegantly and naturally: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio || null;
  } catch (error) {
    return null;
  }
};

export const generateImage = async (prompt: string): Promise<string | null> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: `High quality cinematic digital art: ${prompt}` }]
      },
      config: {
        imageConfig: { aspectRatio: "1:1", imageSize: "1K" }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
  } catch (error) {}
  return null;
};

export const generateVideo = async (prompt: string): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: { numberOfVideos: 1, resolution: '1080p', aspectRatio: '16:9' }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 8000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) return null;
    
    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    return null;
  }
};
