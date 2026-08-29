'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TextRevealProps {
  text: string;
  className?: string;
  delay?: number;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';
}

export function TextReveal({ text, className, delay = 0, as = 'div' }: TextRevealProps) {
  const words = text.split(' ');
  const Component = motion[as];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: (i = 1) => ({
      opacity: 1,
      transition: { staggerChildren: 0.05, delayChildren: delay * i },
    }),
  };

  const childVariants = {
    hidden: {
      opacity: 0,
      y: '70%',
      rotate: 2,
    },
    visible: {
      opacity: 1,
      y: '0%',
      rotate: 0,
      transition: {
        type: 'spring' as const,
        damping: 18,
        stiffness: 90,
      },
    },
  };

  return (
    <Component
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      className={cn('inline-block overflow-hidden', className)}
    >
      {words.map((word, index) => (
        <span key={index} className="inline-block whitespace-nowrap overflow-hidden mr-[0.25em] align-bottom">
          <motion.span variants={childVariants} className="inline-block">
            {word}
          </motion.span>
        </span>
      ))}
    </Component>
  );
}
