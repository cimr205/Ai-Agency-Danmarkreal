import { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export type StatCard = {
  title: string;
  value: string;
  change?: string;
};

function AnimatedNumber({ value }: { value: string }) {
  const [display, setDisplay] = useState('0');
  const ref = useRef<HTMLDivElement>(null);

  const animate = useCallback(() => {
    const numericMatch = value.match(/^([^0-9]*)(\d[\d.,]*)(.*)$/);
    if (!numericMatch) {
      setDisplay(value);
      return;
    }
    const [, prefix, numStr, suffix] = numericMatch;
    const cleanNum = parseFloat(numStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(cleanNum)) {
      setDisplay(value);
      return;
    }

    const duration = 800;
    const start = performance.now();
    const isDecimal = numStr.includes(',');

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = cleanNum * eased;

      if (isDecimal) {
        setDisplay(`${prefix}${current.toFixed(1).replace('.', ',')}${suffix}`);
      } else {
        const formatted = Math.round(current).toLocaleString('da-DK');
        setDisplay(`${prefix}${formatted}${suffix}`);
      }

      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);

  useEffect(() => {
    animate();
  }, [animate]);

  return <div ref={ref} className="stat-number text-foreground">{display}</div>;
}

export default function StatCards({ items }: { items: StatCard[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 stagger-fade-up">
      {items.map((item) => (
        <Card key={item.title}>
          <CardContent className="p-6">
            <AnimatedNumber value={item.value} />
            <p className="stat-label text-muted-foreground mt-2">{item.title}</p>
            {item.change && <p className="text-xs text-muted-foreground mt-1">{item.change}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
