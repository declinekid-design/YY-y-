export enum Role {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system'
}

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  timestamp: number;
  images?: string[]; // Base64 strings
  isError?: boolean;
}

export enum AppMode {
  CHAT = 'CHAT',
  IMAGE_GEN = 'IMAGE_GEN',
  SETTINGS = 'SETTINGS'
}

// Keep Gemini constants for system usage
export enum ModelName {
  FLASH = 'gemini-2.5-flash',
  PRO = 'gemini-3-pro-preview',
  IMAGEN = 'imagen-4.0-generate-001'
}

export interface ImageGenerationConfig {
  aspectRatio: string;
  numberOfImages: number;
}

// New Types for Multi-Provider Support
export type ProviderType = 'gemini' | 'openai';

export interface AIProvider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string; // For OpenAI compatible APIs
  apiKey?: string; // User provided key
  modelId: string; // The model ID string to send to API
  isSystem?: boolean; // If true, uses the built-in env API_KEY (Gemini only)
}

export const DEFAULT_PROVIDERS: AIProvider[] = [
  {
    id: 'gemini-flash',
    name: 'Gemini 2.5 Flash (内置)',
    type: 'gemini',
    modelId: 'gemini-2.5-flash',
    isSystem: true
  },
  {
    id: 'gemini-pro',
    name: 'Gemini 3.0 Pro (内置)',
    type: 'gemini',
    modelId: 'gemini-3-pro-preview',
    isSystem: true
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek V3 (配置)',
    type: 'openai',
    baseUrl: 'https://api.deepseek.com',
    modelId: 'deepseek-chat',
    isSystem: false
  },
  {
    id: 'kimi-8k',
    name: 'Kimi / Moonshot (配置)',
    type: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    modelId: 'moonshot-v1-8k',
    isSystem: false
  }
];