import { motion, useAnimation, useReducedMotion } from 'framer-motion';
import type { CSSProperties, MutableRefObject, ReactNode } from 'react';

/**
 * Fades and lifts (or slides) content in as it enters the viewport. One
 * easing curve, used everywhere on the landing page, but duration/offset
 * vary per section so the page doesn't read as one looping animation.
 *
 * When `speedRef` is given, the reveal reads the visitor's current scroll
 * speed (px/ms, see useScrollVelocity) the instant it enters view and picks
 * a faster or slower duration accordingly — a fast scroller gets a snappy
 * reveal, a slow one gets more dwell time per step.
 */
function pickDuration(speed: number) {
  if (speed > 1.6) return 0.28;
  if (speed > 0.6) return 0.42;
  return 0.75;
}

export function ScrollReveal({
  children,
  delay = 0,
  y = 14,
  x = 0,
  duration = 0.6,
  className,
  style,
  as = 'div',
  speedRef,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  x?: number;
  duration?: number;
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'li';
  speedRef?: MutableRefObject<number>;
}) {
  const reduceMotion = useReducedMotion();
  const controls = useAnimation();
  const MotionTag = as === 'li' ? motion.li : motion.div;

  if (reduceMotion) {
    const Tag = as;
    return (
      <Tag className={className} style={style}>
        {children}
      </Tag>
    );
  }

  if (speedRef) {
    return (
      <MotionTag
        className={className}
        style={style}
        initial={{ opacity: 0, y, x }}
        animate={controls}
        viewport={{ once: true, margin: '-80px' }}
        onViewportEnter={() => {
          controls.start({
            opacity: 1,
            y: 0,
            x: 0,
            transition: { duration: pickDuration(speedRef.current), delay, ease: [0.16, 1, 0.3, 1] },
          });
        }}
      >
        {children}
      </MotionTag>
    );
  }

  return (
    <MotionTag
      className={className}
      style={style}
      initial={{ opacity: 0, y, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </MotionTag>
  );
}
