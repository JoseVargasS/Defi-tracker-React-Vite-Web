import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MarkdownText from '@/components/ai/MarkdownText';

describe('MarkdownText', () => {
  it('renderiza negritas como strong', () => {
    render(<MarkdownText content="Escenario **LONG** confirmado" />);
    expect(screen.getByText('LONG').tagName).toBe('STRONG');
  });

  it('renderiza titulos ## con clase de encabezado', () => {
    const { container } = render(<MarkdownText content='## Recomendacion de Entrada' />);
    expect(container.querySelector('.ai-md-h2')?.textContent).toBe('Recomendacion de Entrada');
  });

  it('agrupa lineas con guion en lista', () => {
    const { container } = render(<MarkdownText content={'- TP1: 0.01369\n- TP2: 0.01423'} />);
    expect(container.querySelectorAll('li').length).toBe(2);
  });

  it('renderiza codigo inline como code', () => {
    render(<MarkdownText content='nivel `0.01295` clave' />);
    expect(screen.getByText('0.01295').tagName).toBe('CODE');
  });

  it('lineas vacias separan parrafos', () => {
    const { container } = render(<MarkdownText content={'Parrafo uno\n\nParrafo dos'} />);
    expect(container.querySelectorAll('p').length).toBe(2);
  });
});
