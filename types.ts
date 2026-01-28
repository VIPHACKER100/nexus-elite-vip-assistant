
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

export interface UserProfile {
  name: string;
  isAuthenticated: boolean;
  avatar?: string;
}
