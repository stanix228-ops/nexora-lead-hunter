'use client';

import React, { useEffect, useState } from 'react';
import { motion, useSpring, useMotionValue } from 'framer-motion';

export function CustomCursor() {
  const [mounted, setMounted] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [cursorText, setCursorText] = useState('');
  const [cursorVariant, setCursorVariant] = useState<'default' | 'button' | 'image' | 'view'>('default');
  const [isTouch, setIsTouch] = useState(true);

  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);

  const springConfig = { damping: 28, stiffness: 260, mass: 0.5 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);

  useEffect(() => {
    // Detect touch device
    if (window.matchMedia('(pointer: coarse)').matches) {
      setIsTouch(true);
      return;
    }
    setIsTouch(false);
    setMounted(true);

    const moveCursor = (e: MouseEvent) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const interactiveEl = target.closest('button, a, input, textarea, [data-cursor]');
      const customCursorData = target.closest('[data-cursor-text]')?.getAttribute('data-cursor-text');
      const cursorVariantData = target.closest('[data-cursor-variant]')?.getAttribute('data-cursor-variant');

      if (customCursorData) {
        setCursorText(customCursorData);
        setCursorVariant('view');
        setIsHovered(true);
      } else if (cursorVariantData === 'image') {
        setCursorText('VIEW');
        setCursorVariant('image');
        setIsHovered(true);
      } else if (interactiveEl) {
        setCursorText('');
        setCursorVariant('button');
        setIsHovered(true);
      } else {
        setCursorText('');
        setCursorVariant('default');
        setIsHovered(false);
      }
    };

    window.addEventListener('mousemove', moveCursor);
    document.addEventListener('mouseover', handleMouseOver);

    return () => {
      window.removeEventListener('mousemove', moveCursor);
      document.removeEventListener('mouseover', handleMouseOver);
    };
  }, [cursorX, cursorY]);

  if (isTouch || !mounted) return null;

  return (
    <>
      {/* Outer subtle follower ring */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999] rounded-full mix-blend-difference flex items-center justify-center font-sans tracking-widest text-[9px] font-semibold text-bg uppercase border border-gold-400"
        style={{
          x: cursorXSpring,
          y: cursorYSpring,
          translateX: '-50%',
          translateY: '-50%',
        }}
        animate={{
          width: cursorVariant === 'view' || cursorVariant === 'image' ? 76 : isHovered ? 48 : 28,
          height: cursorVariant === 'view' || cursorVariant === 'image' ? 76 : isHovered ? 48 : 28,
          backgroundColor: cursorVariant === 'view' || cursorVariant === 'image' ? '#d4af37' : isHovered ? 'rgba(212, 175, 55, 0.2)' : 'transparent',
          borderColor: isHovered ? '#d4af37' : 'rgba(212, 175, 55, 0.4)',
        }}
        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
      >
        {cursorText && (
          <motion.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-black font-bold tracking-widest"
          >
            {cursorText}
          </motion.span>
        )}
      </motion.div>

      {/* Center pinpoint */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999] w-1.5 h-1.5 rounded-full bg-gold-400"
        style={{
          x: cursorX,
          y: cursorY,
          translateX: '-50%',
          translateY: '-50%',
        }}
        animate={{
          scale: isHovered ? 0 : 1,
          opacity: isHovered ? 0 : 1,
        }}
        transition={{ duration: 0.2 }}
      />
    </>
  );
}
