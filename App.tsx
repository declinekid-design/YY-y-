import React, { useState, useRef, useEffect, useCallback } from 'react';
import { streamChatResponse, generateImage } from './services/geminiService';
import { ChatMessage, Role, AppMode, AIProvider, DEFAULT_PROVIDERS, ProviderType } from './types';
import { 
  IconMessage, IconImage, IconSend, IconPlus, IconSparkles, 
  IconTrash, IconDownload, IconSettings, IconEdit, IconCheck, IconX 
} from './components/Icons';
import MarkdownView from './components/MarkdownView';

// --- Helper Functions ---
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const rawBase64 = base64String.split(',')[1];
      resolve(rawBase64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const displayBase64 = (raw: string) => `data:image/jpeg;base64,${raw}`;

function App() {
  // --- Global State ---
  const [mode, setMode] = useState<AppMode>(AppMode.CHAT);
  const [providers, setProviders] = useState<AIProvider[]>(DEFAULT_PROVIDERS);
  const [activeProviderId, setActiveProviderId] = useState<string>(DEFAULT_PROVIDERS[0].id);

  // --- Settings State ---
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);

  // --- Chat State ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Image Gen State ---
  const [imgPrompt, setImgPrompt] = useState('');
  const [generatedImg, setGeneratedImg] = useState<string | null>(null);
  const [isImgLoading, setIsImgLoading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('1:1');

  // --- Initialization ---
  useEffect(() => {
    const saved = localStorage.getItem('ai_providers');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge with defaults to ensure system providers exist
        const merged = [...DEFAULT_PROVIDERS];
        parsed.forEach((p: AIProvider) => {
          if (!merged.find(m => m.id === p.id)) {
            merged.push(p);
          } else {
             // Update default if user modified it (e.g. key)
             const idx = merged.findIndex(m => m.id === p.id);
             if (idx !== -1 && !merged[idx].isSystem) {
                 merged[idx] = p;
             }
             // For existing system defaults (like Kimi preset), load user key if saved
             if (idx !== -1 && !merged[idx].isSystem && p.apiKey) {
               merged[idx].apiKey = p.apiKey;
             }
          }
        });
        setProviders(merged);
      } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    if (providers.length > 0) {
      localStorage.setItem('ai_providers', JSON.stringify(providers.filter(p => !p.isSystem || p.type === 'openai'))); 
      // We save 'openai' types even if system preset so we keep the API KEY
    }
  }, [providers]);

  const activeProvider = providers.find(p => p.id === activeProviderId) || providers[0];

  // --- Logic ---
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const base64 = await blobToBase64(file);
        setAttachedImages(prev => [...prev, base64]);
      } catch (err) {
        console.error("上传失败", err);
      }
    }
  };

  const handleSendChat = useCallback(async () => {
    if ((!input.trim() && attachedImages.length === 0) || isLoading) return;
    
    // Check key for custom providers
    if (!activeProvider.isSystem && !activeProvider.apiKey) {
      alert("请先在设置中配置该模型的 API Key");
      setMode(AppMode.SETTINGS);
      setEditingProvider(activeProvider);
      return;
    }

    const newUserMsg: ChatMessage = {
      id: Date.now().toString(),
      role: Role.USER,
      text: input,
      timestamp: Date.now(),
      images: [...attachedImages]
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInput('');
    setAttachedImages([]);
    setIsLoading(true);

    const aiMsgId = (Date.now() + 1).toString();
    const newAiMsg: ChatMessage = {
      id: aiMsgId,
      role: Role.MODEL,
      text: '',
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, newAiMsg]);

    try {
      await streamChatResponse(
        [...messages, newUserMsg],
        newUserMsg.text,
        newUserMsg.images || [],
        activeProvider,
        (textChunk) => {
          setMessages(prev => prev.map(msg => 
            msg.id === aiMsgId ? { ...msg, text: textChunk } : msg
          ));
        }
      );
    } catch (error: any) {
      setMessages(prev => prev.map(msg => 
        msg.id === aiMsgId ? { ...msg, text: `错误: ${error.message || '请求失败'}`, isError: true } : msg
      ));
    } finally {
      setIsLoading(false);
    }
  }, [input, attachedImages, isLoading, messages, activeProvider]);

  const handleGenerateImage = async () => {
    if (!imgPrompt.trim() || isImgLoading) return;
    setIsImgLoading(true);
    setGeneratedImg(null);

    try {
      const result = await generateImage(imgPrompt, aspectRatio);
      setGeneratedImg(result);
    } catch (e) {
      alert("生成失败，请稍后重试。");
    } finally {
      setIsImgLoading(false);
    }
  };

  const saveProviderSettings = (p: AIProvider) => {
    setProviders(prev => {
      const exists = prev.find(item => item.id === p.id);
      if (exists) {
        return prev.map(item => item.id === p.id ? p : item);
      }
      return [...prev, p];
    });
    setEditingProvider(null);
  };

  // --- Render Functions ---
  const renderSettings = () => (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div className="border-b border-white/10 pb-4">
        <h2 className="text-2xl font-bold text-white">模型配置</h2>
        <p className="text-gray-400 text-sm mt-1">管理 API 接口与密钥 (Gemini, DeepSeek, Kimi 等)</p>
      </div>

      <div className="grid gap-4">
        {providers.map(p => (
          <div key={p.id} className="bg-[#1a1a1a] p-4 rounded-xl border border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                 p.type === 'gemini' ? 'bg-blue-600/20 text-blue-400' : 'bg-green-600/20 text-green-400'
               }`}>
                 {p.type === 'gemini' ? 'G' : 'AI'}
               </div>
               <div>
                 <h3 className="font-semibold text-gray-200">{p.name}</h3>
                 <p className="text-xs text-gray-500">{p.isSystem ? '内置 System Key' : (p.baseUrl || 'Custom URL')}</p>
               </div>
            </div>
            
            <div className="flex gap-2">
              {!p.isSystem && (
                <button 
                  onClick={() => setEditingProvider(p)}
                  className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition"
                >
                  <IconSettings className="w-5 h-5" />
                </button>
              )}
              {p.isSystem && (
                 <span className="text-xs px-2 py-1 rounded bg-white/5 text-gray-500">默认</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {editingProvider && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1e1e1e] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold">编辑模型配置</h3>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">名称</label>
                <input 
                  value={editingProvider.name}
                  onChange={e => setEditingProvider({...editingProvider, name: e.target.value})}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-sm text-white focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">API Key</label>
                <input 
                  type="password"
                  value={editingProvider.apiKey || ''}
                  onChange={e => setEditingProvider({...editingProvider, apiKey: e.target.value})}
                  placeholder="sk-..."
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-sm text-white focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Base URL</label>
                <input 
                  value={editingProvider.baseUrl || ''}
                  onChange={e => setEditingProvider({...editingProvider, baseUrl: e.target.value})}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-sm text-white focus:border-blue-500 outline-none"
                />
              </div>
               <div>
                <label className="text-xs text-gray-500 block mb-1">Model ID</label>
                <input 
                  value={editingProvider.modelId}
                  onChange={e => setEditingProvider({...editingProvider, modelId: e.target.value})}
                  className="w-full bg-[#0a0a0a] border border-white/10 rounded-lg p-2 text-sm text-white focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setEditingProvider(null)}
                className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300"
              >
                取消
              </button>
              <button 
                onClick={() => saveProviderSettings(editingProvider)}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-[#0a0a0a] text-white font-sans overflow-hidden">
      
      {/* Sidebar */}
      <div className="w-16 md:w-64 flex-shrink-0 border-r border-white/10 flex flex-col bg-[#121212]">
        <div className="p-4 flex items-center justify-center md:justify-start gap-3 border-b border-white/10 h-16">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <IconSparkles className="text-white w-5 h-5" />
          </div>
          <span className="hidden md:block font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            AI Studio
          </span>
        </div>

        <nav className="flex-1 p-2 space-y-1 mt-4">
          <button
            onClick={() => setMode(AppMode.CHAT)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group ${
              mode === AppMode.CHAT 
                ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' 
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
          >
            <IconMessage className="w-5 h-5" />
            <span className="hidden md:block font-medium">智能对话</span>
          </button>
          
          <button
            onClick={() => setMode(AppMode.IMAGE_GEN)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group ${
              mode === AppMode.IMAGE_GEN 
                ? 'bg-purple-600/10 text-purple-400 border border-purple-500/20' 
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
          >
            <IconImage className="w-5 h-5" />
            <span className="hidden md:block font-medium">图像创作</span>
          </button>

          <button
            onClick={() => setMode(AppMode.SETTINGS)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group ${
              mode === AppMode.SETTINGS
                ? 'bg-green-600/10 text-green-400 border border-green-500/20' 
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
          >
            <IconSettings className="w-5 h-5" />
            <span className="hidden md:block font-medium">模型设置</span>
          </button>
        </nav>

        <div className="p-4 border-t border-white/10">
           <div className="text-xs text-gray-600 text-center md:text-left">
             <p className="hidden md:block">Google GenAI & OpenAI API</p>
           </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative">
        
        {/* Header */}
        <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#0a0a0a]/80 backdrop-blur-md z-10 sticky top-0">
          <h2 className="text-lg font-semibold text-gray-200">
            {mode === AppMode.CHAT ? 'AI 助手' : mode === AppMode.IMAGE_GEN ? '创意工坊' : '设置'}
          </h2>
          
          {mode === AppMode.CHAT && (
             <div className="flex items-center gap-2">
               <span className="text-xs text-gray-500 mr-2 hidden md:inline">当前模型:</span>
               <select 
                 value={activeProviderId}
                 onChange={(e) => setActiveProviderId(e.target.value)}
                 className="bg-[#1a1a1a] text-xs md:text-sm text-white border border-white/10 rounded-lg px-3 py-1.5 focus:border-blue-500 outline-none max-w-[150px] md:max-w-xs"
               >
                 {providers.map(p => (
                   <option key={p.id} value={p.id}>{p.name}</option>
                 ))}
               </select>
             </div>
          )}
        </header>

        {/* View: Settings */}
        {mode === AppMode.SETTINGS && (
           <div className="flex-1 overflow-y-auto">
             {renderSettings()}
           </div>
        )}

        {/* View: Chat */}
        {mode === AppMode.CHAT && (
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-60">
                   <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-6">
                      <IconSparkles className="w-10 h-10 text-gray-400" />
                   </div>
                   <p className="text-lg font-medium">你好，我是你的 AI 助手。</p>
                   <p className="text-sm">支持 Gemini, Kimi, DeepSeek 等模型</p>
                </div>
              )}
              
              {messages.map((msg) => (
                <div key={msg.id} className={`flex w-full ${msg.role === Role.USER ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl p-4 shadow-sm ${
                    msg.role === Role.USER 
                      ? 'bg-[#1a1a1a] border border-white/10 rounded-br-none' 
                      : 'bg-transparent pr-8'
                  }`}>
                    {msg.role === Role.MODEL && (
                      <div className="flex items-center gap-2 mb-2 text-xs text-blue-400 font-bold uppercase tracking-wider">
                        <IconSparkles className="w-3 h-3" /> AI
                      </div>
                    )}
                    
                    {msg.images && msg.images.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {msg.images.map((img, idx) => (
                          <img key={idx} src={displayBase64(img)} alt="Attachment" className="w-32 h-32 object-cover rounded-lg border border-white/10" />
                        ))}
                      </div>
                    )}
                    
                    {msg.isError ? (
                       <p className="text-red-400">{msg.text}</p>
                    ) : (
                       <MarkdownView content={msg.text} />
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-[#0a0a0a] border-t border-white/10">
              {attachedImages.length > 0 && (
                 <div className="flex gap-3 mb-3 px-2 overflow-x-auto pb-2">
                    {attachedImages.map((img, i) => (
                      <div key={i} className="relative group">
                        <img src={displayBase64(img)} className="h-16 w-16 rounded-md object-cover border border-white/20" />
                        <button 
                          onClick={() => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 text-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <IconTrash className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                 </div>
              )}
              
              <div className="max-w-4xl mx-auto flex gap-3 items-end bg-[#1a1a1a] p-2 rounded-2xl border border-white/10 focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all">
                <label className={`p-2.5 rounded-xl transition-colors ${
                  activeProvider.type === 'openai' ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer'
                }`}>
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleFileUpload} 
                    className="hidden" 
                    disabled={activeProvider.type === 'openai'} 
                  />
                  <IconPlus className="w-6 h-6" />
                </label>
                
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendChat();
                    }
                  }}
                  placeholder={activeProvider.type === 'openai' ? "输入消息 (暂不支持图片)..." : "输入消息..."}
                  className="flex-1 bg-transparent text-white placeholder-gray-500 text-base p-2.5 max-h-32 min-h-[48px] resize-none focus:outline-none"
                  rows={1}
                />
                
                <button
                  onClick={handleSendChat}
                  disabled={isLoading || (!input.trim() && attachedImages.length === 0)}
                  className={`p-2.5 rounded-xl transition-all duration-200 ${
                    isLoading || (!input.trim() && attachedImages.length === 0)
                      ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20'
                  }`}
                >
                  <IconSend className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View: Image Gen */}
        {mode === AppMode.IMAGE_GEN && (
          <div className="flex-1 overflow-y-auto p-6 md:p-12">
             <div className="max-w-4xl mx-auto space-y-8">
               <div className="text-center space-y-2 mb-10">
                 <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                   Imagen Studio
                 </h1>
                 <p className="text-gray-400">输入描述，即刻生成专业级图像 (Powered by Google Imagen)</p>
               </div>

               <div className="bg-[#1a1a1a] rounded-3xl p-6 border border-white/10 shadow-2xl">
                 <div className="flex flex-col gap-4">
                   <div className="relative">
                     <textarea 
                        value={imgPrompt}
                        onChange={(e) => setImgPrompt(e.target.value)}
                        placeholder="请详细描述你想生成的画面..."
                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl p-4 text-lg text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 h-32 resize-none"
                     />
                     <div className="absolute bottom-4 right-4 flex gap-2">
                       <select 
                         value={aspectRatio}
                         onChange={(e) => setAspectRatio(e.target.value)}
                         className="bg-white/10 text-xs text-white rounded-lg px-2 py-1 border border-white/10 outline-none"
                       >
                         <option value="1:1">正方形 (1:1)</option>
                         <option value="16:9">横屏 (16:9)</option>
                         <option value="9:16">竖屏 (9:16)</option>
                         <option value="3:4">相框 (3:4)</option>
                       </select>
                     </div>
                   </div>

                   <button 
                     onClick={handleGenerateImage}
                     disabled={isImgLoading || !imgPrompt}
                     className={`w-full py-4 rounded-xl font-bold text-lg tracking-wide transition-all ${
                       isImgLoading 
                         ? 'bg-purple-900/30 text-purple-300 animate-pulse'
                         : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-90 shadow-lg shadow-purple-600/20'
                     }`}
                   >
                     {isImgLoading ? '正在生成...' : '立即生成'}
                   </button>
                 </div>
               </div>

               <div className="min-h-[400px] flex items-center justify-center rounded-3xl border-2 border-dashed border-white/5 bg-white/5 relative overflow-hidden group">
                 {generatedImg ? (
                   <>
                    <img src={generatedImg} alt="Generated" className="max-w-full max-h-[600px] object-contain shadow-2xl" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                      <a href={generatedImg} download={`imagen-${Date.now()}.jpg`} className="p-4 bg-white text-black rounded-full hover:scale-110 transition-transform">
                        <IconDownload className="w-6 h-6" />
                      </a>
                    </div>
                   </>
                 ) : (
                   <div className="text-center text-gray-500">
                     <IconImage className="w-16 h-16 mx-auto mb-4 opacity-20" />
                     <p>生成的作品将显示在这里</p>
                   </div>
                 )}
               </div>
             </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;