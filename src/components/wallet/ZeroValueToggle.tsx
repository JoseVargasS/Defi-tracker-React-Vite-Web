import { useState } from 'react';

export function ZeroValueToggle({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        className="tx-zero-toggle"
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v); } }}
      >
        <td colSpan={4}>
          <span className="tx-zero-icon">{open ? '×' : '+'}</span>
          {' '}{count} tokens sin valor
        </td>
      </tr>
      {open && children}
    </>
  );
}
