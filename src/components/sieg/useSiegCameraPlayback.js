import useInlineCameraPlayback from '@/hooks/useInlineCameraPlayback';

// Keep SIEG's existing call site while both cameras use the same recovery path.
export default function useSiegCameraPlayback(videoRef, active, setError, setAvailability) {
  useInlineCameraPlayback(videoRef, active, setError, setAvailability);
}