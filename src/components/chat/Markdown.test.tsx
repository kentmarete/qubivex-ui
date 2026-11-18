import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown';

const reply = 'Here:\n\n```py\nprint("hi")\n```\n';

describe('Markdown code blocks', () => {
  it('shows highlighted text while the reply streams', () => {
    render(<Markdown text={reply} streaming />);
    expect(screen.queryByTestId('code-editor')).toBeNull();
    expect(screen.getByText('print').closest('pre')).not.toBeNull();
    expect(screen.getByText('py')).toBeInTheDocument();
  });

  it('becomes an editor in the fence language once the reply is complete', async () => {
    render(<Markdown text={reply} />);
    const ed = await screen.findByTestId('code-editor');
    expect(ed).toHaveAttribute('data-language', 'python');
    expect(ed).toHaveTextContent('print("hi")');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('treats an untagged fence as plain text', async () => {
    render(<Markdown text={'```\nls -la\n```'} />);
    expect(await screen.findByTestId('code-editor')).toHaveAttribute('data-language', 'plaintext');
  });
});
