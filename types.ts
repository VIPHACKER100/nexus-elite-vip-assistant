
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  type?: 'text' | 'image' | 'audio' | 'video';
  imageUrl?: string;
  videoUrl?: string;
  isStreaming?: boolean;
  groundingSources?: Array<{
    title: string;
    uri: string;
  }>;
}

export type AppLanguage = 'en' | 'hi' | 'hinglish';

export interface Memory {
  id: string;
  fact: string;
  timestamp: number;
  category: 'personal' | 'preference' | 'habit';
}

export interface UserProfile {
  name: string;
  isAuthenticated: boolean;
  language: AppLanguage;
  memories: Memory[];
  avatar?: string;
}

export interface AIFunction {
  id: string;
  name: string;
  category: FunctionCategory;
  description: string;
  icon: string;
  color: string;
}

export enum FunctionCategory {
  PRODUCTIVITY = 'Productivity',
  CREATIVE = 'Creative',
  SYSTEM = 'System',
  LIFESTYLE = 'Lifestyle',
  SECURITY = 'Security'
}
