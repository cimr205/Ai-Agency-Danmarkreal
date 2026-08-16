import { Card } from '@/components/ui/card';

export type KanbanColumn = {
  title: string;
  items: { id: string; title: string; value?: string }[];
};

export default function KanbanPipeline({ columns }: { columns: KanbanColumn[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {columns.map((column) => (
        <Card key={column.title} className="p-4 bg-card/70 backdrop-blur border-border">
          <div className="text-sm font-semibold mb-3">{column.title}</div>
          <div className="space-y-2">
            {column.items.length === 0 ? (
              <div className="text-xs text-muted-foreground">—</div>
            ) : (
              column.items.map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="font-medium">{item.title}</div>
                  {item.value && <div className="text-xs text-muted-foreground mt-1">{item.value}</div>}
                </div>
              ))
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
