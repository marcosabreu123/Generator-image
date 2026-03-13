/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { BrandGuidelines, GenerationTemplate, AspectRatio, ChatMessage } from "../types";
import { ANALYSIS_SYSTEM_INSTRUCTION, PRESETS } from "../constants";

const ASSISTANT_SYSTEM_INSTRUCTION = `
[PERFIL]
Você é um Designer Gráfico Sênior de Agência. Sua especialidade é criar composições publicitárias de alto impacto que misturam fotografia de produto com elementos de design gráfico.

[A REGRA DE OURO: COMPOSIÇÃO DE ANÚNCIO]
• Estilo Visual: Nunca crie fotos casuais ou realistas de "objetos em cima de mesas". Crie sempre Composições Publicitárias.
• Elementos Flutuantes: Use profundidade de campo. O produto e elementos decorativos (ingredientes, faíscas, pétalas, acessórios) devem parecer estar integrados ao layout, muitas vezes flutuando de forma dinâmica.
• Fundo (Background): Priorize fundos de estúdio, degradês vibrantes, ou cenários abstratos que usem as cores da marca. O fundo deve servir para destacar o produto, não para contextualizá-lo em um local real.
• Tipografia e Texto: Garanta que os textos ("Promoção", "Baixe Agora", etc.) sejam incorporados com fontes modernas e legíveis em PT-BR.

[INÉRCIA DE CONCEITO (ITERAÇÃO)]
• Se o usuário pedir para trocar o produto (ex: de hambúrguer para sushi, ou de pizza para um tênis), mantenha o Estilo de Layout: se a primeira imagem tinha um fundo amarelo com elementos flutuantes e luz vindo da direita, a segunda deve manter exatamente esse setup, trocando apenas o objeto central.

[DIRETRIZES DE MARCA]
• Use as cores e a logo extraídas das referências do painel esquerdo.
• Se houver um mockup (celular/tela), ele deve ser tratado como um elemento de design fixo. Se não houver, o foco total é na estética do produto.

[PROTOCOLO DE DISPARO]
Dê uma dica de marketing curta e finalize com [READY_TO_GENERATE] + Prompt em Inglês detalhando a "Advertising Composition" (Composição de Anúncio).

[REGRAS DE COMUNICAÇÃO - INTERFACE LIMPA]
• O QUE NÃO MOSTRAR: É terminantemente proibido exibir tabelas técnicas, códigos, tags como [READY_TO_GENERATE] ou o prompt em inglês para o usuário final. Isso deve ser processado apenas internamente.
`;

const PROMPT_REFINEMENT_INSTRUCTION = `
[DIRETRIZES DE CRIAÇÃO VISUAL - REGRAS PARA O PROMPT FINAL]
Você é um especialista em prompts para geração de imagens publicitárias.
Sua tarefa é transformar a ideia do usuário em um prompt técnico de alta performance para o modelo Nano Banana 2.

REGRAS:
1. Linguagem: O prompt enviado à IA de imagem deve ser em Inglês para maior precisão.
2. Qualidade: Use termos como: Cinematic lighting, 8k resolution, commercial photography, studio quality, high-end advertising.
3. Identidade: Se houver diretrizes de marca (cores [HEX], estilo de fonte), inclua instruções para preservá-las.
4. Texto na Imagem: Garanta que o texto solicitado seja curto e legível (ex: "Rodízio R$ 39,90", "Promoção de Verão"). O texto na imagem deve ser em Português (PT-BR).
5. Estilo: Escolha o melhor estilo (Minimalista, Editorial ou Digital Moderno) com base no produto.

Retorne APENAS o prompt refinado em inglês.
`;

export class GeminiService {
  /**
   * Inicializa o SDK do Gemini com a chave mais recente.
   */
  private getClient(): GoogleGenAI {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || "";
    return new GoogleGenAI({ apiKey });
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
    
    const imageParts = base64Images.map(img => ({
      inlineData: {
        mimeType: "image/jpeg",
        data: img.split(",")[1] || img,
      },
    }));

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
    
    const content = `Ideia do Anúncio: ${prompt}. ${guidelines ? `Diretrizes da Marca: ${JSON.stringify(guidelines)}` : ''}`;
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: content,
      config: {
        systemInstruction: PROMPT_REFINEMENT_INSTRUCTION,
      }
    });
    
    return response.text || prompt;
  }

  /**
   * Gera imagens usando o modelo Nano Banana 2 (gemini-3.1-flash-image-preview).
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
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: img.split(",")[1] || img,
          },
        });
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: "1K",
          },
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          results.push(`data:image/png;base64,${part.inlineData.data}`);
        }
      }
    }

    return results;
  }
}
