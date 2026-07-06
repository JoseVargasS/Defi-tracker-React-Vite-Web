import { useState } from 'react';

export function ZeroValueToggle({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr className="tx-zero-toggle" onClick={() => setOpen(v => !v)} style={{ cursor: 'pointer' }}>
        <td colSpan={4}>
          <span className="tx-zero-icon">{open ? '×' : '+'}</span>
          {' '}{count} tokens sin valor
        </td>
      </tr>
      {open && children}
    </>
  );
}
