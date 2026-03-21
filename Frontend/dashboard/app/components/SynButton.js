'use client';

import { useEffect, useRef } from 'react';

export default function SynButton({ onPress, children, disabled, ...props }) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.disabled = Boolean(disabled);
    if (disabled) {
      element.setAttribute('disabled', '');
    } else {
      element.removeAttribute('disabled');
    }
  }, [disabled]);

  useEffect(() => {
    const element = ref.current;
    if (!element || !onPress) return;

    const handleClick = (event) => {
      if (disabled || element.disabled) return;
      onPress(event);
    };

    element.addEventListener('click', handleClick);
    return () => {
      element.removeEventListener('click', handleClick);
    };
  }, [onPress, disabled]);

  return (
    <syn-button ref={ref} {...props}>
      {children}
    </syn-button>
  );
}
