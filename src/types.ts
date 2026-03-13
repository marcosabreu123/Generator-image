/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum GenerationTemplate {
  MINIMALIST = "minimalist",
  EDITORIAL = "editorial",
  DIGITAL_MODERN = "digital_modern",
}

export interface BrandGuidelines {
  colors: string[];
  fontStyle: string;
  segment: string;
  extractedText?: string[];
  vibe?: string;
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
}

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export interface GenerationState {
  isAnalyzing: boolean;
  isGenerating: boolean;
  progress: number;
  error: string | null;
  results: GeneratedImage[];
  aspectRatio: AspectRatio;
  chatHistory: ChatMessage[];
}
