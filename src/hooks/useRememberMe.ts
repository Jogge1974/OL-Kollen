import * as React from 'react';

export function useRememberMe(initialValue = true) {
  const [rememberMe, setRememberMe] = React.useState(initialValue);

  return {
    rememberMe,
    setRememberMe,
  };
}
