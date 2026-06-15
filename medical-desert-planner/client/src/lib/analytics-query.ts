/** Hide stale or non-actionable analytics errors in the UI. */
export function visibleAnalyticsError(
  error: string | null | undefined,
  opts: { loading?: boolean; data?: unknown }
): string | null {
  if (!error || opts.loading) return null;
  if (opts.data != null) return null;
  if (/\baborted\b|\bcanceled\b|\bcancelled\b/i.test(error)) return null;
  return error;
}
