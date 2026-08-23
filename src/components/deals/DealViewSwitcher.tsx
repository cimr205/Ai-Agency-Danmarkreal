import { Button } from '@/components/ui/button';
import { LayoutGrid, List, CalendarDays } from 'lucide-react';

export type DealView = 'board' | 'list' | 'calendar';

export function DealViewSwitcher({ view, onChange }: { view: DealView; onChange: (view: DealView) => void }) {
  return (
    <div className="flex gap-1 border rounded-md">
      <Button variant={view === 'board' ? 'secondary' : 'ghost'} size="sm" onClick={() => onChange('board')}>
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => onChange('list')}>
        <List className="h-4 w-4" />
      </Button>
      <Button variant={view === 'calendar' ? 'secondary' : 'ghost'} size="sm" onClick={() => onChange('calendar')}>
        <CalendarDays className="h-4 w-4" />
      </Button>
    </div>
  );
}
