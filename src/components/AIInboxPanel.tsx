import { Card } from '@/components/ui/card';

export type AIItem = {
  id: string;
  title: string;
  action: string;
  bucket: string;
};

export default function AIInboxPanel({ items, emptyLabel }: { items: AIItem[]; emptyLabel: string }) {
  return (
    <Card className="p-4 bg-card/70 backdrop-blur border-border">
      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">{emptyLabel}</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="font-medium">{item.title}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {item.action} · {item.bucket}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
