'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function AmbientAudio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const oscillatorRefs = useRef<OscillatorNode[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Synthesize soft warm lounge acoustic pad using Web Audio API
  const startAtmosphereSynth = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
      masterGain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 3); // Soft ambient volume
      masterGain.connect(ctx.destination);
      gainNodeRef.current = masterGain;

      // Soft filter for warm analog vinyl feel
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, ctx.currentTime);
      filter.Q.setValueAtTime(1.5, ctx.currentTime);
      filter.connect(masterGain);

      // Warm chord progression notes (Frequencies for Dmaj9 / F#m7 / A)
      const chordProgressions = [
        [146.83, 220.0, 277.18, 369.99], // D maj9
        [185.0, 220.0, 277.18, 329.63],  // F# min7
        [164.81, 246.94, 329.63, 392.0], // E min7
        [220.0, 277.18, 329.63, 440.0],  // A maj
      ];

      let chordIdx = 0;

      const playChord = () => {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') return;
        const currentCtx = audioCtxRef.current;
        const freqs = chordProgressions[chordIdx % chordProgressions.length];
        chordIdx++;

        // Stop previous oscillators smoothly
        oscillatorRefs.current.forEach((osc) => {
          try {
            osc.stop(currentCtx.currentTime + 1.5);
          } catch {}
        });
        oscillatorRefs.current = [];

        freqs.forEach((freq) => {
          const osc = currentCtx.createOscillator();
          const oscGain = currentCtx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, currentCtx.currentTime);

          // Subtle detune for rich spatial warmth
          osc.detune.setValueAtTime((Math.random() - 0.5) * 8, currentCtx.currentTime);

          oscGain.gain.setValueAtTime(0.001, currentCtx.currentTime);
          oscGain.gain.exponentialRampToValueAtTime(0.03, currentCtx.currentTime + 2);
          oscGain.gain.exponentialRampToValueAtTime(0.001, currentCtx.currentTime + 6.5);

          osc.connect(oscGain);
          oscGain.connect(filter);

          osc.start(currentCtx.currentTime);
          osc.stop(currentCtx.currentTime + 7);
          oscillatorRefs.current.push(osc);
        });
      };

      playChord();
      intervalRef.current = setInterval(playChord, 6000);
    } catch (e) {
      console.warn('Web Audio Ambient not supported:', e);
    }
  };

  const stopAtmosphereSynth = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (gainNodeRef.current && audioCtxRef.current) {
      try {
        gainNodeRef.current.gain.exponentialRampToValueAtTime(0.0001, audioCtxRef.current.currentTime + 1);
        setTimeout(() => {
          audioCtxRef.current?.close();
          audioCtxRef.current = null;
        }, 1200);
      } catch {
        audioCtxRef.current?.close();
        audioCtxRef.current = null;
      }
    }
  };

  const toggleAudio = () => {
    setHasInteracted(true);
    if (!isPlaying) {
      startAtmosphereSynth();
      setIsPlaying(true);
    } else {
      stopAtmosphereSynth();
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    return () => {
      stopAtmosphereSynth();
    };
  }, []);

  return (
    <div className="fixed bottom-6 left-6 z-40 flex items-center gap-3">
      <button
        onClick={toggleAudio}
        aria-label={isPlaying ? 'Отключить атмосферную музыку' : 'Включить атмосферную музыку'}
        className="group relative flex items-center gap-2.5 px-3 py-2 rounded-full bg-bg-surface/80 backdrop-blur-md border border-white/10 hover:border-gold-400/50 transition-all duration-300 shadow-luxury"
      >
        <div className="relative flex items-center justify-center w-6 h-6 rounded-full bg-gold-400/10 text-gold-400 group-hover:bg-gold-400 group-hover:text-black transition-colors duration-300">
          {isPlaying ? (
            <Volume2 className="w-3.5 h-3.5 animate-pulse" />
          ) : (
            <VolumeX className="w-3.5 h-3.5 text-zinc-400 group-hover:text-black" />
          )}
        </div>

        <div className="flex flex-col text-left pr-1">
          <span className="text-[10px] uppercase font-sans tracking-widest text-zinc-400 group-hover:text-gold-400 transition-colors">
            {isPlaying ? 'Атмосфера ресторана' : 'Включить звук'}
          </span>
        </div>

        {/* Equalizer bars animation */}
        {isPlaying && (
          <div className="flex items-end gap-0.5 h-3 px-1">
            <span className="w-0.5 bg-gold-400 h-2 animate-[pulseSlow_1s_ease-in-out_infinite]" />
            <span className="w-0.5 bg-gold-400 h-3 animate-[pulseSlow_1.4s_ease-in-out_infinite]" />
            <span className="w-0.5 bg-gold-400 h-1.5 animate-[pulseSlow_0.8s_ease-in-out_infinite]" />
            <span className="w-0.5 bg-gold-400 h-2.5 animate-[pulseSlow_1.2s_ease-in-out_infinite]" />
          </div>
        )}
      </button>

      {/* First-time hint tooltip */}
      <AnimatePresence>
        {!hasInteracted && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ delay: 2, duration: 0.6 }}
            className="hidden sm:flex items-center gap-1.5 text-[11px] text-zinc-400 bg-bg-card/90 border border-gold-400/20 px-3 py-1.5 rounded-full backdrop-blur-md"
          >
            <Sparkles className="w-3 h-3 text-gold-400" />
            <span>Погрузитесь в атмосферу зала</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
