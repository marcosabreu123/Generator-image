/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { 
  Image as ImageIcon, 
  Upload, 
  Download, 
  RefreshCw, 
  Settings, 
  Palette, 
  Type as TypeIcon, 
  Layers, 
  CheckCircle2, 
  AlertCircle,
  Trash2,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Zap,
  Layout
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import JSZip from "jszip";
import { GeminiService } from "./services/gemini";
import { BrandGuidelines, GeneratedImage, GenerationState, AspectRatio, ChatMessage } from "./types";
import { PRESETS } from "./constants";

// Extend window for AI Studio API
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [chatInput, setChatInput] = useState("");
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [guidelines, setGuidelines] = useState<BrandGuidelines | null>(null);
  const [mobileTab, setMobileTab] = useState<"brand" | "chat" | "gallery">("chat");
  const [state, setState] = useState<GenerationState>({
    isAnalyzing: false,
    isGenerating: false,
    progress: 0,
    error: null,
    results: [],
    aspectRatio: "1:1",
    chatHistory: [
      { role: "model", text: "Olá! Sou seu Estrategista de Marketing e Diretor de Arte. O que vamos vender hoje?" }
    ],
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const geminiService = useRef<GeminiService | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkApiKey();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.chatHistory]);

  const checkApiKey = async () => {
    if (window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setHasApiKey(hasKey);
    } else {
      setHasApiKey(true);
    }
  };

  const handleOpenKeyDialog = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      try {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
        setState(prev => ({ ...prev, error: null }));
      } catch (err: any) {
        console.error("Erro ao abrir seletor:", err);
        setState(prev => ({ ...prev, error: "Não foi possível abrir o seletor de projetos." }));
      }
    } else {
      setHasApiKey(true);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newImages: string[] = [];
      let processed = 0;

      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64 = event.target?.result as string;
          newImages.push(base64);
          processed++;
          
          if (processed === files.length) {
            const updatedImages = [...referenceImages, ...newImages].slice(0, 5);
            setReferenceImages(updatedImages);
            analyzeImages(updatedImages);
          }
        };
        reader.readAsDataURL(file as Blob);
      });
    }
  };

  const analyzeImages = async (images: string[]) => {
    if (images.length === 0) return;
    setState(prev => ({ ...prev, isAnalyzing: true, error: null }));
    try {
      geminiService.current = new GeminiService();
      const result = await geminiService.current.analyzeReferenceImages(images);
      setGuidelines(result);
      
      // Notificar o usuário no chat
      setState(prev => ({
        ...prev,
        chatHistory: [
          ...prev.chatHistory,
          { role: "model", text: "Recebi suas imagens! Já extraí a identidade visual (cores e estilo) para garantir que o anúncio siga sua marca." }
        ]
      }));
    } catch (err: any) {
      console.error("Erro na análise:", err);
      setState(prev => ({ 
        ...prev, 
        error: `Erro na análise: ${err.message || "Verifique sua conexão e API Key."}` 
      }));
    } finally {
      setState(prev => ({ ...prev, isAnalyzing: false }));
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || state.isGenerating) return;

    const userMessage = chatInput.trim();
    const normalizedMessage = userMessage.toLowerCase();
    setChatInput("");
    
    // Gestão de Histórico: Reconhecer comandos de limpeza
    if (
      normalizedMessage.includes("excluir chat") || 
      normalizedMessage.includes("trocar de conversa") || 
      normalizedMessage.includes("limpar histórico") ||
      normalizedMessage.includes("limpar chat")
    ) {
      setState(prev => ({
        ...prev,
        chatHistory: [
          { role: "model", text: "Contexto limpo! Como posso ajudar você com um novo anúncio agora?" }
        ]
      }));
      return;
    }

    const updatedHistory = [...state.chatHistory, { role: "user", text: userMessage } as ChatMessage];
    setState(prev => ({
      ...prev,
      chatHistory: updatedHistory
    }));

    try {
      if (!geminiService.current) geminiService.current = new GeminiService();
      
      // Pass state.chatHistory (which doesn't have the new user message yet) 
      // so the API receives alternating roles correctly.
      const response = await geminiService.current.chat(userMessage, state.chatHistory, guidelines);
      
      let displayText = response;
      let promptForGeneration = "";

      if (response.includes("[READY_TO_GENERATE]")) {
        const parts = response.split("[READY_TO_GENERATE]");
        displayText = parts[0].trim();
        if (!displayText) {
          displayText = "🚀 Preparando seu anúncio...";
        }
        promptForGeneration = parts[1].trim();
      }
      
      setState(prev => ({
        ...prev,
        chatHistory: [...prev.chatHistory, { role: "model", text: displayText }]
      }));

      if (promptForGeneration) {
        generate(promptForGeneration);
      }
    } catch (err: any) {
      console.error(err);
      setState(prev => ({ ...prev, error: "Erro ao conversar com o assistente." }));
    }
  };

  const generate = async (generationPrompt: string) => {
    setState(prev => ({ ...prev, isGenerating: true, progress: 0, error: null }));
    
    try {
      if (!geminiService.current) geminiService.current = new GeminiService();
      
      const urls = await geminiService.current.generateImages(
        generationPrompt,
        guidelines,
        referenceImages,
        aspectRatio,
        quantity
      );

      const newResults: GeneratedImage[] = urls.map(url => ({
        id: Math.random().toString(36).substring(7),
        url,
        prompt: generationPrompt,
        timestamp: Date.now(),
      }));

      setState(prev => ({
        ...prev,
        results: [...newResults, ...prev.results],
        progress: 100,
      }));
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        setState(prev => ({ ...prev, error: "API Key expirada ou inválida. Por favor, selecione novamente." }));
      } else {
        setState(prev => ({ ...prev, error: "Erro ao gerar imagem. Tente novamente." }));
      }
    } finally {
      setState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  const downloadSingle = (image: GeneratedImage) => {
    const link = document.createElement("a");
    link.href = image.url;
    link.download = `brandgenius-${image.id}.png`;
    link.click();
  };

  const downloadBatch = async () => {
    if (state.results.length === 0) return;
    
    const zip = new JSZip();
    state.results.forEach((img, index) => {
      const base64Data = img.url.split(",")[1];
      zip.file(`image-${index + 1}.png`, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = url;
    link.download = "brandgenius-batch.zip";
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearResults = () => {
    setState(prev => ({ ...prev, results: [] }));
  };

  if (hasApiKey === false) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl"
        >
          <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Zap className="text-emerald-500 w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">Configuração Necessária</h1>
          <p className="text-neutral-400 mb-8 leading-relaxed">
            Para utilizar o modelo <span className="text-emerald-400 font-mono">Nano Banana 2</span> (Gemini 3.1 Flash Image), você precisa selecionar uma API Key de um projeto Google Cloud com faturamento ativo.
          </p>
          <button
            onClick={handleOpenKeyDialog}
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 group"
          >
            Selecionar API Key
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <a 
            href="https://ai.google.dev/gemini-api/docs/billing" 
            target="_blank" 
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Saiba mais sobre faturamento <ExternalLink className="w-3 h-3" />
          </a>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="h-16 border-bottom border-neutral-800 flex items-center justify-between px-6 bg-neutral-950/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <Sparkles className="text-neutral-950 w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">BrandGenius <span className="text-emerald-500">AI</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-4">
            {state.results.length > 0 && (
              <button 
                onClick={downloadBatch}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-sm font-medium transition-all"
              >
                <Download className="w-4 h-4" />
                Download Lote ({state.results.length})
              </button>
            )}
            <button 
              onClick={handleOpenKeyDialog}
              className="p-2 text-neutral-400 hover:text-white transition-colors"
              title="Alterar API Key"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
          <button 
            onClick={handleOpenKeyDialog}
            className="md:hidden p-2 text-neutral-400 hover:text-white transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex h-[calc(100vh-64px)] md:h-[calc(100vh-64px)] overflow-hidden relative">
        {/* Main Content: 3-Column System */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Column 1: Brand & Settings (Left) */}
          <aside className={`
            fixed inset-0 z-40 bg-neutral-950 md:relative md:inset-auto md:z-0
            w-full md:w-72 border-r border-neutral-800 bg-neutral-900/30 overflow-y-auto p-6 flex flex-col gap-8
            transition-transform duration-300 md:translate-x-0
            ${mobileTab === "brand" ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          `}>
            <div className="md:hidden flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Configurações de Marca</h2>
              <button onClick={() => setMobileTab("chat")} className="p-2 bg-neutral-800 rounded-full">
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
            </div>
            {/* Reference Image Section */}
            <section>
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-4 block">Referências de Marca</label>
              
              <div className="grid grid-cols-2 gap-2 mb-4">
                {referenceImages.map((img, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-neutral-800 group">
                    <img src={img} alt={`Ref ${idx}`} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => {
                        const updated = referenceImages.filter((_, i) => i !== idx);
                        setReferenceImages(updated);
                        if (updated.length > 0) analyzeImages(updated);
                        else setGuidelines(null);
                      }}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {referenceImages.length < 5 && (
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-neutral-800 flex flex-col items-center justify-center gap-2 text-neutral-500 hover:border-emerald-500/50 hover:text-emerald-500 transition-all bg-neutral-900/50"
                  >
                    <Upload className="w-5 h-5" />
                    <span className="text-[10px] font-bold">Add</span>
                  </button>
                )}
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                className="hidden" 
                multiple
                accept="image/*" 
              />
              <p className="text-[10px] text-neutral-600 leading-tight">Envie logos ou referências para extrair cores e estilo.</p>
            </section>

            {/* Brand Guidelines Status */}
            {guidelines && (
              <section className="space-y-4">
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block">Identidade Extraída</label>
                <div className="p-4 bg-neutral-900 rounded-2xl border border-neutral-800 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {guidelines.colors.map((color, i) => (
                      <div 
                        key={i} 
                        className="w-6 h-6 rounded-full border border-white/10 shadow-sm" 
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                      <TypeIcon className="w-3 h-3" />
                      <span className="font-medium">{guidelines.fontStyle}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                      <Layers className="w-3 h-3" />
                      <span className="font-medium">{guidelines.segment}</span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Generation Settings */}
            <section className="space-y-6">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-4 block">Formato da Imagem</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["1:1", "16:9", "9:16", "4:3", "3:4"] as AspectRatio[]).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setAspectRatio(ratio)}
                      className={`py-2 rounded-xl text-[10px] font-bold border transition-all ${
                        aspectRatio === ratio 
                          ? 'bg-emerald-500 border-emerald-500 text-neutral-950' 
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-4 block">Quantidade</label>
                <div className="flex items-center gap-4 bg-neutral-900 border border-neutral-800 rounded-xl p-2 px-4 justify-between">
                  <button 
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="text-neutral-400 hover:text-white"
                  >
                    -
                  </button>
                  <span className="text-xs font-mono font-bold w-4 text-center">{quantity}</span>
                  <button 
                    onClick={() => setQuantity(Math.min(4, quantity + 1))}
                    className="text-neutral-400 hover:text-white"
                  >
                    +
                  </button>
                </div>
              </div>
            </section>
          </aside>

          {/* Column 2: Chat Assistant (Center) */}
          <div className={`
            flex-1 flex flex-col relative bg-neutral-950 border-r border-neutral-800
            ${mobileTab === "chat" ? "flex" : "hidden md:flex"}
          `}>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
              <div className="max-w-2xl mx-auto space-y-6">
                {state.chatHistory.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                      msg.role === "user" 
                        ? "bg-emerald-500 text-neutral-950 font-medium rounded-tr-none" 
                        : "bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-tl-none"
                    }`}>
                      {msg.text.split("\n").map((line, i) => (
                        <p key={i} className={i > 0 ? "mt-2" : ""}>
                          {line.replace("[READY_TO_GENERATE]", "🚀 Preparando seu anúncio...")}
                        </p>
                      ))}
                    </div>
                  </motion.div>
                ))}
                {state.error && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center"
                  >
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2 max-w-[85%]">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <p>{state.error}</p>
                    </div>
                  </motion.div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Chat Input Area */}
            <div className="p-4 md:p-6 border-t border-neutral-800 bg-neutral-950/80 backdrop-blur-md">
              <div className="max-w-2xl mx-auto relative">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Responda ao assistente..."
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-4 pr-16 md:pr-32 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all resize-none h-20"
                />
                <div className="absolute bottom-4 right-4 flex items-center gap-2">
                  <button
                    onClick={handleSendMessage}
                    disabled={state.isGenerating || !chatInput.trim()}
                    className={`p-2.5 md:px-6 md:py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${
                      state.isGenerating || !chatInput.trim()
                        ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-neutral-950 shadow-lg shadow-emerald-500/20'
                    }`}
                  >
                    {state.isGenerating ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                    <span className="hidden md:inline">Enviar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Column 3: Gallery (Right) */}
          <aside className={`
            fixed inset-0 z-40 bg-neutral-950 md:relative md:inset-auto md:z-0
            w-full md:w-80 bg-neutral-900/30 overflow-y-auto p-6 flex flex-col gap-6
            transition-transform duration-300 md:translate-x-0
            ${mobileTab === "gallery" ? "translate-x-0" : "translate-x-full md:translate-x-0"}
          `}>
            <div className="md:hidden flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Galeria de Anúncios</h2>
              <button onClick={() => setMobileTab("chat")} className="p-2 bg-neutral-800 rounded-full">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Galeria de Anúncios</label>
              {state.results.length > 0 && (
                <button 
                  onClick={clearResults} 
                  className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors"
                >
                  Limpar
                </button>
              )}
            </div>

            {state.results.length === 0 && !state.isGenerating ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30">
                <ImageIcon className="w-10 h-10 mb-4" />
                <p className="text-xs font-medium">Nenhum anúncio gerado ainda.</p>
              </div>
            ) : (
              <div className="space-y-4 pb-10">
                {state.isGenerating && (
                  <div className="aspect-square bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden relative animate-pulse">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
                    </div>
                  </div>
                )}
                {state.results.map((image) => (
                  <motion.div
                    key={image.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="group relative aspect-square bg-neutral-900 rounded-2xl overflow-hidden border border-neutral-800 shadow-xl"
                  >
                    <img 
                      src={image.url} 
                      alt={image.prompt} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-4">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => downloadSingle(image)}
                          className="flex-1 py-2 bg-white text-neutral-950 rounded-lg text-[10px] font-bold flex items-center justify-center gap-2 hover:bg-emerald-400 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          Download
                        </button>
                        <button 
                          onClick={() => {
                            setState(prev => ({
                              ...prev,
                              results: prev.results.filter(r => r.id !== image.id)
                            }));
                          }}
                          className="p-2 bg-neutral-800/80 backdrop-blur-md text-neutral-400 hover:text-red-400 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </main>

      {/* Mobile Navigation Bar */}
      <nav className="md:hidden h-16 border-t border-neutral-800 bg-neutral-950 flex items-center justify-around px-4 sticky bottom-0 z-50">
        <button 
          onClick={() => setMobileTab("brand")}
          className={`flex flex-col items-center gap-1 transition-colors ${mobileTab === "brand" ? "text-emerald-500" : "text-neutral-500"}`}
        >
          <Palette className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase">Marca</span>
        </button>
        <button 
          onClick={() => setMobileTab("chat")}
          className={`flex flex-col items-center gap-1 transition-colors ${mobileTab === "chat" ? "text-emerald-500" : "text-neutral-500"}`}
        >
          <Zap className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase">Chat</span>
        </button>
        <button 
          onClick={() => setMobileTab("gallery")}
          className={`flex flex-col items-center gap-1 transition-colors ${mobileTab === "gallery" ? "text-emerald-500" : "text-neutral-500"}`}
        >
          <div className="relative">
            <ImageIcon className="w-5 h-5" />
            {state.results.length > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 text-neutral-950 text-[8px] font-bold rounded-full flex items-center justify-center">
                {state.results.length}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold uppercase">Galeria</span>
        </button>
      </nav>

      <footer className="hidden md:flex h-10 border-t border-neutral-800 bg-neutral-950 items-center justify-between px-6 text-[10px] text-neutral-500 font-medium">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Motor: Nano Banana 2
              </span>
              <span>•</span>
              <span>Imagens Geradas: {state.results.length}</span>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={clearResults} className="hover:text-neutral-300 transition-colors">Limpar Canvas</button>
              <span>•</span>
              <span>v1.0.0</span>
            </div>
          </footer>

          <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
