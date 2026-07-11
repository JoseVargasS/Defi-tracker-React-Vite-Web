import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ZeroValueToggle } from '@/components/wallet/ZeroValueToggle';

describe('ZeroValueToggle', () => {
  it('renders collapsed by default with count', () => {
    render(
      <table><tbody>
        <ZeroValueToggle count={5}>
          <tr><td>hidden row</td></tr>
        </ZeroValueToggle>
      </tbody></table>
    );
    expect(screen.getByText(/5 tokens sin valor/)).toBeTruthy();
    expect(screen.queryByText('hidden row')).toBeNull();
  });

  it('toggles open on click', () => {
    render(
      <table><tbody>
        <ZeroValueToggle count={3}>
          <tr><td>child row</td></tr>
        </ZeroValueToggle>
      </tbody></table>
    );
    const toggle = screen.getByText(/3 tokens sin valor/);
    fireEvent.click(toggle);
    expect(screen.getByText('child row')).toBeTruthy();
  });

  it('toggles closed on second click', () => {
    render(
      <table><tbody>
        <ZeroValueToggle count={2}>
          <tr><td>child row</td></tr>
        </ZeroValueToggle>
      </tbody></table>
    );
    const toggle = screen.getByText(/2 tokens sin valor/);
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.queryByText('child row')).toBeNull();
  });

  it('shows + when closed and x when open', () => {
    render(
      <table><tbody>
        <ZeroValueToggle count={1}>
          <tr><td>x</td></tr>
        </ZeroValueToggle>
      </tbody></table>
    );
    const icon = screen.getByText('+');
    expect(icon).toBeTruthy();
    fireEvent.click(screen.getByText(/1 tokens sin valor/));
    expect(screen.getByText('×')).toBeTruthy();
  });
});
