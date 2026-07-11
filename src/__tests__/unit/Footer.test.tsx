import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Footer } from '@/components/layout/Footer';

describe('Footer', () => {
  it('renders the footer element', () => {
    const { container } = render(<Footer />);
    expect(container.querySelector('footer')).toBeTruthy();
  });

  it('renders Usual Money link', () => {
    render(<Footer />);
    const link = screen.getByText('Usual Money');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('https://usual.money');
  });

  it('renders Josesitooo link', () => {
    render(<Footer />);
    const link = screen.getByText('Josesitooo');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('https://github.com/Josesitooo');
  });

  it('renders attribution text', () => {
    const { container } = render(<Footer />);
    const footer = container.querySelector('footer');
    expect(footer?.textContent).toContain('Inspirado en');
    expect(footer?.textContent).toContain('Hecho por');
  });
});
