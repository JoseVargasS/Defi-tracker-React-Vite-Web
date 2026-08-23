import { useState, useRef, useEffect } from 'react';
import { useMarketStore } from '@/store/useMarketStore';
import { goChatCompletion, buildTechnicalPrompt, buildExternalPrompt, systemPromptForTechnical, SYSTEM_PROMPT_EXTERNAL, searchWeb, FREE_MODELS, DEFAULT_MODEL } from '@/api/opencode';
import { readAiModel, writeAiModel } from '@/lib/storage';
import MarkdownText from '@/components/ai/MarkdownText';
import '@/styles/ai.css';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

const DEFAULT_SYSTEM = 'Eres un asistente experto en criptomonedas y trading. Responde preguntas sobre el mercado, analisis tecnico, wallets, y el ecosistema crypto. Usa la informacion proporcionada si esta disponible.';

export default function AiChatPanel() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [modelId, setModelId] = useState<string>(() => {
    const stored = readAiModel();
    return stored && FREE_MODELS.some((m) => m.id === stored) ? stored : DEFAULT_MODEL;
  });
  const currentPair = useMarketStore((s) => s.currentPair);
  const msgsEndRef = useRef<HTMLDivElement>(null);

  function handleModelChange(id: string) {
    setModelId(id);
    writeAiModel(id);
  }

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  function addMsg(role: 'user' | 'assistant', content: string) {
    setMsgs((prev) => [...prev, { role, content }]);
  }

  async function doSend(text: string, system: string, enrich?: () => Promise<string>) {
    if (!text || loading) return;
    setOpen(true);
    addMsg('user', text);
    setLoading(true);
    try {
      const data = enrich
        ? await enrich().catch(() => '')
        : undefined;
      const userContent = data ? `Datos:\n${data}\n\nAnaliza:\n${text}` : text;
      const context = msgs.slice(-8).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      const reply = await goChatCompletion(
        [
          { role: 'system', content: system },
          ...context,
          { role: 'user', content: userContent },
        ],
        { model: modelId },
      );
      addMsg('assistant', reply);
    } catch (err) {
      addMsg('assistant', err instanceof Error ? `⚠️ ${err.message}` : 'Error.');
    } finally {
      setLoading(false);
    }
  }

  async function handleTechnical() {
    if (!currentPair) {
      addMsg('assistant', 'Selecciona un par primero.');
      setOpen(true);
      return;
    }
    await doSend(`📊 Analisis tecnico de ${currentPair}`, systemPromptForTechnical(currentPair), () => buildTechnicalPrompt(currentPair));
  }

  async function handleExternal() {
    await doSend('🌍 Factores externos y macro', SYSTEM_PROMPT_EXTERNAL, buildExternalPrompt);
  }

  async function handleSend() {
    if (loading) return;
    const text = input.trim();
    if (!text) return;
    setInput('');
    await doSend(text, DEFAULT_SYSTEM, async () => {
      const web = await searchWeb(text);
      return web ? `Informacion de la web:\n${web}` : '';
    });
  }

  const buttonLabel = currentPair
    ? currentPair.replace('USDT', '') + '/USDT'
    : 'IA';

  return (
    <>
      {!open && (
        <button className="ai-fab" onClick={() => setOpen(true)} title="Abrir asistente IA">
          <span className="ai-fab-icon">AI</span>
        </button>
      )}
      {open && (
        <aside className="ai-panel">
          <div className="ai-header">
            <div className="ai-header-info">
              <span className="ai-header-title">Asistente IA</span>
              <select
                className="ai-model-select"
                value={modelId}
                onChange={(e) => handleModelChange(e.target.value)}
                aria-label="Modelo de IA"
                title="Modelo y proveedor"
                disabled={loading}
              >
                {FREE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label} · {m.provider}</option>
                ))}
              </select>
            </div>
            <button className="ai-close" onClick={() => setOpen(false)} aria-label="Cerrar">&times;</button>
          </div>
          <div className="ai-quick-buttons">
            <button className="ai-qb" onClick={handleTechnical} disabled={loading}>
              📊 Analisis Tecnico
            </button>
            <button className="ai-qb" onClick={handleExternal} disabled={loading}>
              🌍 Factores Externos
            </button>
          </div>
          <div className="ai-msgs">
            {msgs.length === 0 && (
              <div className="ai-empty">
                Usa los botones rapidos o escribe una pregunta.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`ai-msg ai-msg-${m.role}`}>
                <div className="ai-msg-text"><MarkdownText content={m.content} /></div>
              </div>
            ))}
            {loading && <div className="ai-msg ai-msg-assistant"><div className="ai-msg-text ai-thinking">Pensando...</div></div>}
            <div ref={msgsEndRef} />
          </div>
          <div className="ai-input-row">
            <input
              className="ai-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={currentPair ? `Pregunta sobre ${buttonLabel}...` : 'Escribe un mensaje...'}
              disabled={loading}
            />
            <button className="ai-send" onClick={handleSend} disabled={loading || !input.trim()}>
              &rarr;
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
