import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SourceFunnelLine, SourceSelect } from './SourceFunnel';

describe('Pipeline source filter', () => {
  afterEach(cleanup);

  it('offers Meta ads and reports the chosen source', () => {
    const onChange = vi.fn();
    render(<SourceSelect value="all" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Filter by source', { selector: 'select' }), { target: { value: 'meta_ad' } });
    expect(onChange).toHaveBeenCalledWith('meta_ad');
  });

  it('shows how far the source got, step by step, and clears back to any source', () => {
    const onClear = vi.fn();
    render(
      <SourceFunnelLine
        filter="meta_ad"
        funnel={{ total: 6, reached: { outreach: 6, reply: 4, sample: 2, testing: 1, success: 1 }, lost: 2, parked: 1 }}
        onClear={onClear}
      />
    );

    const line = screen.getByTestId('source-funnel');
    expect(line.textContent).toContain('Meta ads');
    expect([...line.querySelectorAll('li')].map(li => li.textContent?.replace('→', '').trim()))
      .toEqual(['Outreach 6', 'Reply 4', 'Sample 2', 'Testing 1', 'Won 1']);
    expect(line.textContent).toContain('2 lost · 1 parked');

    fireEvent.click(screen.getByRole('button', { name: /Any source/ }));
    expect(onClear).toHaveBeenCalled();
  });

  it('says so when the source has no deals yet', () => {
    render(
      <SourceFunnelLine
        filter="meta_ad"
        funnel={{ total: 0, reached: { outreach: 0, reply: 0, sample: 0, testing: 0, success: 0 }, lost: 0, parked: 0 }}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText('No deals yet')).toBeTruthy();
  });
});
