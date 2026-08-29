'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { FadeIn } from '@/components/animations/FadeIn';

interface SectionHeaderProps {
  number?: string;
  subtitle?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
  dark?: boolean;
}

export function SectionHeader({
  number,
  subtitle,
  title,
  description,
  align = 'left',
  className,
}: SectionHeaderProps) {
  const isCenter = align === 'center';
  const isRight = align === 'right';

  return (
    <div
      className={cn(
        'relative mb-12 sm:mb-16',
        isCenter && 'text-center mx-auto max-w-3xl',
        isRight && 'text-right ml-auto max-w-3xl',
        !isCenter && !isRight && 'max-w-3xl',
        className
      )}
    >
      {/* Editorial Number & Subtitle */}
      {(number || subtitle) && (
        <FadeIn direction="up" delay={0.1} distance={15}>
          <div
            className={cn(
              'flex items-center gap-3 mb-3 text-xs uppercase tracking-ultra-wide font-sans font-medium text-gold-400',
              isCenter && 'justify-center',
              isRight && 'justify-end'
            )}
          >
            {number && <span className="font-mono text-gold-500 font-semibold">{number}</span>}
            {number && subtitle && <span className="w-6 h-[1px] bg-gold-400/40" />}
            {subtitle && <span>{subtitle}</span>}
          </div>
        </FadeIn>
      )}

      {/* Main Title */}
      <FadeIn direction="up" delay={0.2} distance={20}>
        <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-serif font-normal text-cream-DEFAULT tracking-tight leading-[1.15] mb-4">
          {title}
        </h2>
      </FadeIn>

      {/* Narrative Description */}
      {description && (
        <FadeIn direction="up" delay={0.3} distance={20}>
          <p className="text-sm sm:text-base md:text-lg text-zinc-400 font-light leading-relaxed max-w-2xl">
            {description}
          </p>
        </FadeIn>
      )}

      {/* Hairline decorative line */}
      <FadeIn direction="up" delay={0.4} distance={10}>
        <div
          className={cn(
            'w-16 h-[1px] bg-gradient-to-r from-gold-400/60 to-transparent mt-6',
            isCenter && 'mx-auto from-transparent via-gold-400/60 to-transparent',
            isRight && 'ml-auto from-transparent to-gold-400/60'
          )}
        />
      </FadeIn>
    </div>
  );
}
