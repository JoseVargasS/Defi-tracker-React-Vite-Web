import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Header } from '@/components/layout/Header';

describe('Header', () => {
  it('renders the app title', () => {
    render(<Header />);
    expect(screen.getByText('Portfolio terminal')).toBeTruthy();
  });

  it('renders the header element', () => {
    const { container } = render(<Header />);
    const header = container.querySelector('header.app-header');
    expect(header).toBeTruthy();
  });

  it('renders the logo image', () => {
    render(<Header />);
    const img = screen.getByAltText('DeFi & Crypto Terminal');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toContain('flaticon.com');
  });
});
