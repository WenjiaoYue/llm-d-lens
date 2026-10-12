import React from 'react';
import { Spinner } from './Spinner';
import { EmptyState } from './EmptyState';
import { Button } from './Button';

export function AsyncState({ loading = false, error = null, empty = false, onRetry, emptyTitle = 'No data', loadingContent, errorContent, emptyContent, children }) {
  if (loading) return loadingContent ?? <div className="flex justify-center p-8"><Spinner /></div>;
  if (error) return errorContent ?? <EmptyState title="Unable to load data" message={error.message || String(error)} action={onRetry ? <Button variant="secondary" onClick={onRetry}>Retry</Button> : undefined} />;
  if (empty) return emptyContent ?? <EmptyState title={emptyTitle} />;
  return children;
}
