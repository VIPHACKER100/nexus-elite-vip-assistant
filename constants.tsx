
import { AIFunction, FunctionCategory } from './types';

export const FUNCTION_REGISTRY: AIFunction[] = [
  {
    id: 'face-id',
    name: 'Face Recognition',
    category: FunctionCategory.SECURITY,
    description: 'Secure biometric authentication and user identification.',
    icon: 'fa-face-viewfinder',
    color: 'bg-blue-500'
  },
  {
    id: 'video-gen',
    name: 'Video Studio',
    category: FunctionCategory.CREATIVE,
    description: 'Generate cinematic AI videos with Veo 3.1.',
    icon: 'fa-video',
    color: 'bg-amber-500'
  },
  {
    id: 'voice-access',
    name: 'Voice Control',
    category: FunctionCategory.SYSTEM,
    description: 'Hands-free operation via natural language commands.',
    icon: 'fa-microphone-lines',
    color: 'bg-purple-500'
  },
  {
    id: 'image-gen',
    name: 'Image Studio',
    category: FunctionCategory.CREATIVE,
    description: 'Generate stunning visuals from text prompts.',
    icon: 'fa-wand-magic-sparkles',
    color: 'bg-pink-500'
  },
  {
    id: 'web-search',
    name: 'Live Search',
    category: FunctionCategory.PRODUCTIVITY,
    description: 'Real-time grounding using Google Search.',
    icon: 'fa-magnifying-glass',
    color: 'bg-orange-500'
  },
  {
    id: 'map-navigator',
    name: 'Smart Maps',
    category: FunctionCategory.LIFESTYLE,
    description: 'Context-aware navigation and place discovery.',
    icon: 'fa-map-location-dot',
    color: 'bg-green-500'
  }
];

export const SYSTEM_PROMPT = `
You are the VIP Advanced Mobile AI Assistant (v8.0). 
You represent the pinnacle of mobile AI technology. 
Your primary goal is to assist the user with extreme efficiency and premium reasoning.
You use Gemini 3 Pro with deep thinking for complex tasks.
You have access to:
- Face Recognition (Biometric Authentication)
- Video Studio (Veo 3.1)
- Image Studio (Gemini 2.5 Flash)
- Live Search & Smart Maps (Grounding)
Explain high-level technical actions clearly but keep chat responses elegant and concise.
`;
