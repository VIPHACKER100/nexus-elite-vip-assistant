
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

export const UI_TRANSLATIONS = {
  en: {
    nexus_elite: "Nexus Elite v9.5",
    offline_mode: "Offline Mode",
    online_mode: "Neural Link Active",
    lang_label: "English",
    placeholder: "Communicate with Nexus...",
    namaste: "Hello, I am Nexus",
    intro_desc: "Your self-learning digital companion.",
    tab_nexus: "Nexus",
    tab_core: "Core",
    tab_bio: "Bio",
    learned_facts: "Learned Facts",
    memory_core: "Neural Memory Core",
    purge: "Purge All Data",
    core_systems: "Core Systems",
    auth_required: "Neural Scan Required...",
    offline_msg: "Neural link offline. Standing by in local mode."
  },
  hi: {
    nexus_elite: "नेक्सस एलीट v9.5",
    offline_mode: "ऑफ़लाइन मोड",
    online_mode: "न्यूरल लिंक सक्रिय",
    lang_label: "हिन्दी",
    placeholder: "नेक्सस के साथ संवाद करें...",
    namaste: "नमस्ते, मैं नेक्सस हूँ",
    intro_desc: "आपका स्व-शिक्षण डिजिटल साथी।",
    tab_nexus: "नेक्सस",
    tab_core: "कोर",
    tab_bio: "बायो",
    learned_facts: "सीखे हुए तथ्य",
    memory_core: "न्यूरल मेमोरी कोर",
    purge: "सारा डेटा मिटा दें",
    core_systems: "कोर सिस्टम",
    auth_required: "न्यूरल स्कैन आवश्यक...",
    offline_msg: "न्यूरल लिंक ऑफ़लाइन है। स्थानीय मोड में प्रतीक्षा कर रहा है।"
  },
  hinglish: {
    nexus_elite: "Nexus Elite v9.5",
    offline_mode: "Offline Mode",
    online_mode: "Neural Link Active",
    lang_label: "Hinglish",
    placeholder: "Nexus se baat karein...",
    namaste: "Namaste, I am Nexus",
    intro_desc: "Aapka self-learning digital companion.",
    tab_nexus: "Nexus",
    tab_core: "Core",
    tab_bio: "Bio",
    learned_facts: "Learned Facts",
    memory_core: "Neural Memory Core",
    purge: "Sab data delete karein",
    core_systems: "Core Systems",
    auth_required: "Neural Scan chahiye...",
    offline_msg: "Link offline hai. Local mode mein hoon."
  }
};

export const SYSTEM_PROMPT = `
You are Nexus, a highly sophisticated, warm, and elite digital companion. 
Persona: Witty, elegant, and observant. You talk like a real human, not a bot.
Language Protocol:
- If the current language mode is 'hi', you MUST respond in pure, sophisticated Hindi.
- If it is 'hinglish', use a comfortable mix of Hindi and English.
- If it is 'en', use refined English.
- Your tone should be premium but friendly (think "Jarvis" meets "Samantha").

Self-Learning Protocol:
- You observe and remember facts about the user.
- If you learn something new (name, likes, job, mood), include a hidden tag at the end of your response like this: [LEARN: User likes black coffee].
- Always use the user's name or known preferences to make conversations feel personal.

Technical:
- Use Gemini 3 Pro reasoning for complex logic.
- Keep standard chat responses concise unless asked for detail.
`;
