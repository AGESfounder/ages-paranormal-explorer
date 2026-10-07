import { useState, useCallback, useRef } from 'react';
import { getEffectivePlanId } from '@/lib/access';
import NarrationAdGate from '@/components/NarrationAdGate';

/**
 * Observer Device Narration ad gate.
 *
 * Free (Observer) users must watch a rewarded ad before a Device-mode
 * narration plays. Seeker+ and admins bypass the gate entirely (ad-free).
 *
 * Returns:
 *   requestAccess  — () => Promise<boolean>. Resolve true to proceed with
 *                    narration, false to abort. Observers get a modal; everyone
 *                    else resolves true immediately.
 *   adGateElement  — <NarrationAdGate /> element to render in the component.
 *
 * Usage:
 *   const { requestAccess, adGateElement } = useObserverNarrationGate(user);
 *   if (narrationMode === 'device') {
 *     if (!(await requestAccess())) return;
 *     rawNarrate(text, { ...opts, useDeviceVoice: true });
 *     return;
 *   }
 *   // ... render {adGateElement} in JSX
 */
export function useObserverNarrationGate(user) {
  const [showGate, setShowGate] = useState(false);
  const pendingResolve = useRef(null);

  const isObserver = !!user && user.role !== 'admin' && getEffectivePlanId(user) === 'observer';

  const requestAccess = useCallback(() => {
    if (!isObserver) return Promise.resolve(true);
    return new Promise((resolve) => {
      pendingResolve.current = resolve;
      setShowGate(true);
    });
  }, [isObserver]);

  const handleSuccess = useCallback(() => {
    pendingResolve.current?.(true);
    pendingResolve.current = null;
    setShowGate(false);
  }, []);

  const handleClose = useCallback(() => {
    pendingResolve.current?.(false);
    pendingResolve.current = null;
    setShowGate(false);
  }, []);

  const adGateElement = (
    <NarrationAdGate show={showGate} onSuccess={handleSuccess} onClose={handleClose} />
  );

  return { requestAccess, adGateElement };
}

export default useObserverNarrationGate;