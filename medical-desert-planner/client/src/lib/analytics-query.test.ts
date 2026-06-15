import { describe, expect, it } from 'vitest';
import { visibleAnalyticsError } from './analytics-query';

describe('visibleAnalyticsError', () => {
  it('hides abort and cancel errors without data', () => {
    expect(visibleAnalyticsError('Statement failed: The operation was aborted.', {})).toBeNull();
    expect(visibleAnalyticsError('Statement was canceled', {})).toBeNull();
  });

  it('hides errors while loading or after data arrives', () => {
    expect(visibleAnalyticsError('boom', { loading: true })).toBeNull();
    expect(visibleAnalyticsError('boom', { data: [] })).toBeNull();
  });

  it('shows real failures', () => {
    expect(visibleAnalyticsError('Permission denied', {})).toBe('Permission denied');
  });
});
