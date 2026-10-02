import { describe, expect, it } from 'vitest';
import { noteText } from './status';

describe('noteText', () => {
  it('drops a first line that repeats the title', () => {
    expect(noteText('Board', 'Board\nwith notes')).toEqual({
      lead: 'Board',
      continuation: '',
      rest: 'with notes',
    });
    expect(noteText('Board', 'Board')).toEqual({ lead: 'Board', continuation: '', rest: '' });
  });

  it('reads a truncated title straight into the rest of its line', () => {
    expect(noteText('a long first…', 'a long first line that goes on\nsecond line')).toEqual({
      lead: 'a long first',
      continuation: 'line that goes on',
      rest: 'second line',
    });
  });

  it('shows the whole body under an unrelated title', () => {
    expect(noteText('Renamed', 'original text')).toEqual({
      lead: 'Renamed',
      continuation: '',
      rest: 'original text',
    });
    expect(noteText('Renamed…', 'original text').rest).toBe('original text');
  });
});
