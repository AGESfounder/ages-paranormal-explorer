import { useState, useEffect, useCallback } from 'react';

export default function useGhostVoice() {
  const [voice, setVoice] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const loadVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;

      // Priority order: deep male voices best for ghostly narration
      const ghostVoice =
        voices.find(v => v.name.includes('Google UK English Male') || v.name.includes('Daniel') || v.name.includes('Gordon')) ||
        voices.find(v => v.name.includes('English (United Kingdom)') && v.name.includes('Male')) ||
        voices.find(v => v.name.toLowerCase().includes('british') && v.name.toLowerCase().includes('male')) ||
        voices.find(v => v.name.includes('Male') && !v.name.includes('Female')) ||
        voices.find(v => v.name.includes('James') || v.name.includes('David') || v.name.includes('Oliver')) ||
        voices.find(v => v.name.includes('English') && v.name.includes('Male')) ||
        voices[0];

      setVoice(ghostVoice);
    };

    loadVoice();
    window.speechSynthesis.onvoiceschanged = loadVoice;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const speak = useCallback((text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.82;
    utter.pitch = 0.5;
    utter.volume = 1;
    if (voice) utter.voice = voice;
    utter.onend = () => setIsSpeaking(false);
    utter.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utter);
  }, [voice]);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  const narrate = useCallback((text) => {
    if (isSpeaking) stop();
    else speak(text);
  }, [isSpeaking, speak, stop]);

  return { isSpeaking, narrate, stop };
}