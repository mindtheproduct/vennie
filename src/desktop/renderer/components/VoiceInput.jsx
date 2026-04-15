import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '../lib/utils.js';

const SAMPLE_RATE = 16000;

export default function VoiceInput({ onTranscript, disabled, className }) {
  const [recording, setRecording] = useState(false);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState(null);
  const [duration, setDuration] = useState(0);
  const streamRef = useRef(null);
  const contextRef = useRef(null);
  const processorRef = useRef(null);
  const timerRef = useRef(null);
  const unsubRef = useRef(null);

  const stop = useCallback(() => {
    // Stop audio capture
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (contextRef.current) {
      contextRef.current.close().catch(() => {});
      contextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Tell main process to finalize
    window.vennie.voiceStop();

    setRecording(false);
    setDuration(0);
    // Keep partial visible briefly so user sees the final text land
    setTimeout(() => setPartial(''), 300);
  }, []);

  const start = useCallback(async () => {
    if (disabled || recording) return;
    setError(null);
    setPartial('');

    try {
      // Start the transcriber process
      const result = await window.vennie.voiceStart(SAMPLE_RATE);
      if (result.error) {
        setError(result.error);
        setTimeout(() => setError(null), 5000);
        return;
      }

      // Listen for streaming results
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = window.vennie.onVoiceResult((data) => {
        if (data.partial) {
          setPartial(data.partial);
        }
        if (data.final) {
          onTranscript(data.final + ' ');
          setPartial('');
        }
        if (data.error) {
          setError(data.error);
          setTimeout(() => setError(null), 5000);
          stop();
        }
      });

      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // Set up Web Audio pipeline: mic → ScriptProcessor → PCM chunks → IPC
      const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
      contextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);

      // ScriptProcessorNode: 4096 frames per buffer, mono in, mono out
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const float32 = e.inputBuffer.getChannelData(0);
        // Convert Float32Array to base64
        const bytes = new Uint8Array(float32.buffer, float32.byteOffset, float32.byteLength);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        window.vennie.voiceChunk(base64);
      };

      source.connect(processor);
      processor.connect(audioCtx.destination); // Required for ScriptProcessor to fire

      setRecording(true);
      setDuration(0);

      // Duration counter + auto-stop at 2 min
      timerRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev >= 120) {
            stop();
            return 0;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied');
      } else {
        setError('Could not start voice input');
      }
      setTimeout(() => setError(null), 5000);
      window.vennie.voiceStop();
    }
  }, [disabled, recording, onTranscript, stop]);

  function toggle() {
    if (recording) {
      stop();
    } else {
      start();
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (processorRef.current) processorRef.current.disconnect();
      if (contextRef.current) contextRef.current.close().catch(() => {});
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (unsubRef.current) unsubRef.current();
      window.vennie.voiceStop();
    };
  }, []);

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={toggle}
        disabled={disabled}
        title={error || (recording ? 'Stop recording' : 'Voice input')}
        className={cn(
          'p-2 rounded-lg transition-all relative',
          recording
            ? 'text-[var(--danger)] bg-[rgba(239,68,68,0.1)]'
            : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-tertiary)]',
          disabled && 'opacity-40 cursor-not-allowed'
        )}
        style={recording ? {
          animation: 'voice-pulse 1.5s ease-in-out infinite',
        } : {}}
      >
        {recording ? <MicOff size={16} /> : <Mic size={16} />}
      </button>

      {/* Live transcription + duration */}
      {recording && (
        <div className="absolute bottom-full mb-2 right-0 min-w-[200px] max-w-[360px] px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)] animate-pulse shrink-0" />
            <span className="text-[10px] font-mono text-[var(--danger)]">{formatTime(duration)}</span>
            <span className="text-[10px] text-[var(--text-tertiary)] ml-auto">listening...</span>
          </div>
          {partial && (
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{partial}</p>
          )}
        </div>
      )}

      {/* Error tooltip */}
      {error && !recording && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-[var(--danger)] text-white text-xs whitespace-nowrap max-w-[300px] text-center">
          {error}
        </div>
      )}

      <style>{`
        @keyframes voice-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
        }
      `}</style>
    </div>
  );
}
