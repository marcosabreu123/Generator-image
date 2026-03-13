/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GenerationTemplate } from "./types";

export const PRESETS = {
  [GenerationTemplate.MINIMALIST]: {
    name: "Minimalista",
    description: "Espaços em branco, tipografia limpa e cores primárias.",
    promptSuffix: "Minimalist style, clean composition, high-key lighting, ample negative space, sharp focus, professional product photography, neutral background.",
  },
  [GenerationTemplate.EDITORIAL]: {
    name: "Editorial",
    description: "Iluminação dramática, estilo de revista e composição clássica.",
    promptSuffix: "Editorial fashion style, dramatic chiaroscuro lighting, high contrast, cinematic composition, classic magazine photography, rich textures, sophisticated atmosphere.",
  },
  [GenerationTemplate.DIGITAL_MODERN]: {
    name: "Digital Moderno",
    description: "Gradientes, elementos de UI modernos e alta saturação.",
    promptSuffix: "Modern digital aesthetic, vibrant gradients, futuristic UI elements, high saturation, soft glow, sleek surfaces, 3D render style, octane render, tech-focused.",
  },
};

export const ANALYSIS_SYSTEM_INSTRUCTION = `
Atue como um especialista em design de marca e identidade visual.
Analise a imagem de referência fornecida e extraia as seguintes informações:
1. Paleta de cores primárias em formato HEX (até 3 cores).
2. Estilo de fonte dominante (serif, sans-serif, script, display, etc.).
3. O segmento de mercado provável (ex: alimentício, automotivo, moda, tech).
4. Qualquer texto legível presente na imagem (ex: slogans, promoções, títulos).
5. A "vibe" ou abordagem geral do anúncio (ex: luxuoso, descontraído, urgente, minimalista).

Retorne APENAS um objeto JSON com as chaves: "colors" (array de strings), "fontStyle" (string), "segment" (string), "extractedText" (array de strings) e "vibe" (string).
Exemplo: {"colors": ["#FF0000", "#FFFFFF"], "fontStyle": "sans-serif", "segment": "tech", "extractedText": ["Promoção de Verão", "50% OFF"], "vibe": "urgente e vibrante"}
`;
