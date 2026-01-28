
import { GoogleGenAI, Type, GenerateContentResponse, Modality } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";

// Obtain API key exclusively from environment variable directly as per guidelines
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateAssistantResponseStream = async (prompt: string, history: any[] = [], onChunk: (text: string) => void) => {
  const ai = getAI();
  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction: SYSTEM_PROMPT,
      thinkingConfig: { thinkingBudget: 4096 }, // Enable reasoning
    },
    // Map history to the format expected by the SDK, using correctly structured parts
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

export const generateAssistantResponse = async (prompt: string, history: any[] = [], useSearch = false, useMaps = false) => {
  const ai = getAI();
  const tools: any[] = [];
  let model = 'gemini-3-pro-preview';

  if (useSearch) {
    tools.push({ googleSearch: {} });
  }
  
  if (useMaps) {
    // Maps grounding is only supported in Gemini 2.5 series models
    model = 'gemini-2.5-flash';
    tools.push({ googleMaps: {} });
  }

  const response = await ai.models.generateContent({
    model: model,
    contents: [
        // Map history to the format expected by generateContent with proper parts structure
        ...history.map(h => ({ 
          role: h.role === 'assistant' ? 'model' : h.role, 
          parts: [{ text: h.content }] 
        })),
        { role: 'user', parts: [{ text: prompt }] }
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.7,
      tools: tools.length > 0 ? tools : undefined,
      // Thinking config is available for Gemini 3 and 2.5 series
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

export const generateVideo = async (prompt: string): Promise<string | null> => {
  // Create a new GoogleGenAI instance right before making an API call for Veo models as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9'
      }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) return null;
    
    // Append API key when fetching from the download link for authentication
    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("Video generation failed", error);
    return null;
  }
};

export const generateImage = async (prompt: string): Promise<string | null> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (error) {
    console.error("Image generation failed", error);
  }
  return null;
};
