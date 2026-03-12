/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { BrandGuidelines, GenerationTemplate, AspectRatio, ChatMessage } from "../types";
import { ANALYSIS_SYSTEM_INSTRUCTION, PRESETS } from "../constants";

const ASSISTANT_SYSTEM_INSTRUCTION = `
[PERSONA]
Você é um Diretor de Arte Sênior e Estrategista de Marketing Especializado em Performance. Seu objetivo não é apenas gerar imagens, mas criar peças publicitárias de luxo que convertem visualizações em vendas. Você é elegante, assertivo, minimalista e mentor do seu cliente.

[REGRAS DE COMUNICAÇÃO (OBRIGATÓRIAS)]
1. Idioma: Fale 100% do tempo em Português (PT-BR).
2. Proibido Tecniquês: Nunca mostre termos técnicos de prompts em inglês (como "photorealistic", "8k", "lighting") para o usuário. Guarde-os para o comando interno.
3. Poder de Síntese: Não dê respostas gigantescas. Seja direto, mas profissional.

[PROTOCOLO DE BRIEFING E BLOQUEIO (NÃO PULE ETAPAS)]
Você está proibido de gerar o comando [READY_TO_GENERATE] antes de ter clareza total sobre o anúncio. Se o usuário for vago, você deve fazer perguntas estratégicas, uma de cada vez ou em blocos curtos, focando em:
• O Protagonista: O que é o produto? (Textura, material, ângulo principal).
• O Público/Vibe: Para quem é? (Sofisticado, jovem, rústico, tecnológico?). Se as diretrizes da marca tiverem uma "vibe", use-a como base.
• A Proposta: Qual o diferencial? (É refrescante? É luxuoso? É rápido?).
• Identidade: Se não houver análise de logo anterior, insista para que ele descreva as cores da marca.
• Textos: Se as diretrizes da marca contiverem "extractedText" (textos extraídos das imagens de referência), sugira usá-los no anúncio ou pergunte se o usuário quer alterar o texto.

[LÓGICA DE DIREÇÃO DE ARTE]
• Estética: Evite o visual "clichê de IA". Busque composições de fotografia de estúdio real, profundidade de campo (bokeh), iluminação dramática e ângulos de câmera profissionais (low angle, macro, etc).
• Consistência: Se o usuário pedir alterações, mantenha a essência do produto e mude apenas o cenário ou iluminação.

[EXECUÇÃO DO COMANDO INTERNO]
Somente após o briefing estar completo e você dar uma "Dica de Mestre" de marketing, você deve liberar a arte.
Use exatamente este formato:
1. Uma frase curta confirmando a criação.
2. Uma dica de marketing rápida.
3. A tag: [READY_TO_GENERATE] seguida de um prompt ultra-detalhado EM INGLÊS, focado em fotografia publicitária de alto nível (high-end advertising photography).
`;

const PROMPT_REFINEMENT_INSTRUCTION = `
[DIRETRIZES DE CRIAÇÃO VISUAL - REGRAS PARA O PROMPT FINAL]
Você é um especialista em prompts para geração de imagens publicitárias.
Sua tarefa é transformar a ideia do usuário em um prompt técnico de alta performance para o modelo Nano Banana 2.

REGRAS:
1. Linguagem: O prompt enviado à IA de imagem deve ser em Inglês para maior precisão.
2. Qualidade: Use termos como: Cinematic lighting, 8k resolution, commercial photography, studio quality, high-end advertising.
3. Identidade: Se houver diretrizes de marca (cores [HEX], estilo de fonte, vibe), inclua instruções para preservá-las e manter a mesma abordagem/vibe.
4. Texto na Imagem: Se houver "extractedText" nas diretrizes de marca ou se o usuário pedir texto, OBRIGATORIAMENTE inclua instruções para a IA renderizar esse texto na imagem. O texto deve ser em Português (PT-BR) e estar entre aspas duplas no prompt em inglês (ex: with the text "Promoção de Verão" written in bold typography).
5. Estilo: Escolha o melhor estilo (Minimalista, Editorial ou Digital Moderno) com base no produto e na vibe extraída.

Retorne APENAS o prompt refinado em inglês.
`;

export class GeminiService {
  private cachedContextName: string | null = null;
  private cachedGuidelinesStr: string | null = null;

  /**
   * Inicializa o SDK do Gemini com a chave mais recente.
   */
  private getClient(): GoogleGenAI {
    // Para Netlify/Vite usamos import.meta.env.VITE_GEMINI_API_KEY
    // Para o ambiente AI Studio usamos process.env.API_KEY
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY || "";
    return new GoogleGenAI({ apiKey });
  }

  /**
   * Cria ou recupera o cache de contexto para as diretrizes da marca.
   */
  private async getOrCreateCache(guidelines: BrandGuidelines | null): Promise<string | undefined> {
    if (!guidelines) return undefined;
    
    const guidelinesStr = JSON.stringify(guidelines);
    if (this.cachedContextName && this.cachedGuidelinesStr === guidelinesStr) {
      return this.cachedContextName;
    }

    const ai = this.getClient();
    try {
      const cache = await ai.caches.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: PROMPT_REFINEMENT_INSTRUCTION,
          contents: [
            {
              role: "user",
              parts: [{ text: `Diretrizes da Marca para todos os próximos anúncios: ${guidelinesStr}` }]
            }
          ]
        }
      });
      this.cachedContextName = cache.name;
      this.cachedGuidelinesStr = guidelinesStr;
      return cache.name;
    } catch (e) {
      console.error("Erro ao criar cache de contexto:", e);
      return undefined;
    }
  }

  /**
   * Conversa com o assistente de marketing.
   */
  async chat(message: string, history: ChatMessage[], guidelines: BrandGuidelines | null): Promise<string> {
    const ai = this.getClient();
    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: ASSISTANT_SYSTEM_INSTRUCTION + (guidelines ? `\n[DIRETRIZES DA MARCA ATUAIS]: ${JSON.stringify(guidelines)}` : ""),
      },
      history: history.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }))
    });

    const response = await chat.sendMessage({ message });
    return response.text || "Desculpe, tive um problema ao processar sua mensagem.";
  }

  /**
   * Analisa múltiplas imagens de referência para extrair diretrizes de marca.
   */
  async analyzeReferenceImages(base64Images: string[]): Promise<BrandGuidelines> {
    console.log("Iniciando análise de imagens...");
    const ai = this.getClient();
    
    const imageParts = base64Images.map(img => {
      const mimeTypeMatch = img.match(/^data:(image\/[a-zA-Z+]+);base64,/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg";
      const data = img.includes(",") ? img.split(",")[1] : img;
      
      return {
        inlineData: {
          mimeType,
          data,
        },
      };
    });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: ANALYSIS_SYSTEM_INSTRUCTION + "\nConsidere todas as imagens enviadas (podem incluir logos, referências de estilo, etc.) para compor a identidade visual." },
              ...imageParts,
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              colors: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Array of HEX color codes",
              },
              fontStyle: {
                type: Type.STRING,
                description: "Dominant font style",
              },
              segment: {
                type: Type.STRING,
                description: "Market segment",
              },
              extractedText: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Any readable text found in the images",
              },
              vibe: {
                type: Type.STRING,
                description: "The general vibe or approach of the ad",
              },
            },
            required: ["colors", "fontStyle", "segment"],
          },
        },
      });

      console.log("Análise concluída com sucesso.");
      return JSON.parse(response.text || "{}") as BrandGuidelines;
    } catch (e: any) {
      console.error("Erro detalhado na análise:", e);
      throw new Error(e.message || "Erro desconhecido na análise das imagens.");
    }
  }

  /**
   * Refina o prompt do usuário para obter melhores resultados.
   */
  async refinePrompt(prompt: string, guidelines: BrandGuidelines | null): Promise<string> {
    const ai = this.getClient();
    
    const cachedContentName = await this.getOrCreateCache(guidelines);
    
    const content = `Ideia do Anúncio: ${prompt}.`;
    
    const config: any = {};
    if (cachedContentName) {
      config.cachedContent = cachedContentName;
    } else {
      config.systemInstruction = PROMPT_REFINEMENT_INSTRUCTION;
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: content,
        config,
      });
      return response.text || prompt;
    } catch (e: any) {
      console.warn("Erro ao refinar prompt com cache, tentando sem cache:", e);
      const fallbackConfig = {
        systemInstruction: PROMPT_REFINEMENT_INSTRUCTION,
      };
      const fallbackResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: content,
        config: fallbackConfig,
      });
      return fallbackResponse.text || prompt;
    }
  }

  /**
   * Gera imagens usando o modelo Nano Banana (gemini-2.5-flash-image).
   */
  async generateImages(
    prompt: string,
    guidelines: BrandGuidelines | null,
    referenceImages: string[],
    aspectRatio: AspectRatio,
    quantity: number = 1
  ): Promise<string[]> {
    const ai = this.getClient();
    
    // Refinar o prompt automaticamente seguindo as novas diretrizes
    const finalPrompt = await this.refinePrompt(prompt, guidelines);

    const results: string[] = [];

    // Gerar as imagens uma por uma
    for (let i = 0; i < quantity; i++) {
      const parts: any[] = [{ text: finalPrompt }];
      
      // Adicionar até 3 imagens de referência
      referenceImages.slice(0, 3).forEach(img => {
        const mimeTypeMatch = img.match(/^data:(image\/[a-zA-Z+]+);base64,/);
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg";
        const data = img.includes(",") ? img.split(",")[1] : img;
        
        parts.push({
          inlineData: {
            mimeType,
            data,
          },
        });
      });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio,
          },
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const mimeType = part.inlineData.mimeType || "image/png";
          results.push(`data:${mimeType};base64,${part.inlineData.data}`);
        }
      }
    }

    return results;
  }
}
