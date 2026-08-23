import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AiChatPanel from '@/components/ai/AiChatPanel';
import { useMarketStore } from '@/store/useMarketStore';

vi.mock('@/api/opencode', () => ({
  goChatCompletion: vi.fn(),
  buildTechnicalPrompt: vi.fn().mockResolvedValue(''),
  buildExternalPrompt: vi.fn().mockResolvedValue(''),
  systemPromptForTechnical: vi.fn().mockReturnValue('sys'),
  SYSTEM_PROMPT_EXTERNAL: 'ext',
  searchWeb: vi.fn(),
  DEFAULT_MODEL: 'hy3-free',
  FREE_MODELS: [
    { id: 'hy3-free', label: 'Hy3', provider: 'Tencent' },
    { id: 'x-preview-f-free', label: 'Ox Alpha', provider: 'OpenCode' },
    { id: 'mimo-v2.5-free', label: 'MiMo V2.5', provider: 'Xiaomi' },
    { id: 'big-pickle', label: 'Big Pickle', provider: 'OpenCode' },
    { id: 'nemotron-3-ultra-free', label: 'Nemotron 3 Ultra', provider: 'NVIDIA' },
    { id: 'nemotron-3.5-lightning-free', label: 'Nemotron 3.5 Lightning', provider: 'NVIDIA' },
  ],
}));

import { goChatCompletion, searchWeb } from '@/api/opencode';

describe('AiChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMarketStore.setState({ currentPair: null });
    Element.prototype.scrollIntoView = vi.fn();
  });

  function openPanel() {
    render(<AiChatPanel />);
    fireEvent.click(screen.getByTitle('Abrir asistente IA'));
  }

  it('muestra selector con todos los modelos free y usa el elegido', async () => {
    vi.mocked(searchWeb).mockResolvedValue('');
    vi.mocked(goChatCompletion).mockResolvedValue('ok');

    openPanel();
    const select = screen.getByLabelText('Modelo de IA') as HTMLSelectElement;
    expect(select.value).toBe('hy3-free');
    expect(select.options.length).toBe(6);

    fireEvent.change(select, { target: { value: 'big-pickle' } });
    fireEvent.change(screen.getByPlaceholderText('Escribe un mensaje...'), { target: { value: 'hola' } });
    fireEvent.click(screen.getByText('→'));

    await waitFor(() =>
      expect(goChatCompletion).toHaveBeenCalledWith(
        expect.any(Array),
        { model: 'big-pickle' },
      ),
    );
  });

  it('envia pregunta custom y muestra la respuesta aunque searchWeb falle', async () => {
    vi.mocked(searchWeb).mockRejectedValue(new Error('timeout'));
    vi.mocked(goChatCompletion).mockResolvedValue('Respuesta IA');

    openPanel();
    fireEvent.change(screen.getByPlaceholderText('Escribe un mensaje...'), { target: { value: 'que es staking?' } });
    fireEvent.click(screen.getByText('→'));

    await waitFor(() => expect(screen.getByText('que es staking?')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Respuesta IA')).toBeTruthy());
    expect(goChatCompletion).toHaveBeenCalledTimes(1);
  });

  it('muestra el error real cuando goChatCompletion falla', async () => {
    vi.mocked(searchWeb).mockResolvedValue('');
    vi.mocked(goChatCompletion).mockRejectedValue(new Error('HTTP 429'));

    openPanel();
    fireEvent.change(screen.getByPlaceholderText('Escribe un mensaje...'), { target: { value: 'hola' } });
    fireEvent.click(screen.getByText('→'));

    await waitFor(() =>
      expect(screen.getByText('⚠️ HTTP 429')).toBeTruthy(),
    );
  });
});
