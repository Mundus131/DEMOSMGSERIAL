'use client';

import { useEffect, useRef } from 'react';
import { API_BASE_URL } from './api';

export default function useBackendEvents(onEvent) {
  const handlerRef = useRef(onEvent);

  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!handlerRef.current) return undefined;

    const source = new EventSource(`${API_BASE_URL}/api/events/stream`);
    source.onmessage = (event) => {
      try {
        handlerRef.current?.(JSON.parse(event.data));
      } catch (error) {
        console.error('Backend event parse error:', error);
      }
    };
    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, []);
}
