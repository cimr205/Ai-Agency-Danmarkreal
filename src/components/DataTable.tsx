import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Column<T> = {
  key: keyof T;
  label: string;
};

export default function DataTable<T extends Record<string, string | number | undefined>>({
  columns,
  rows,
  emptyLabel,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/70 backdrop-blur">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={String(col.key)}>{col.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-muted-foreground">
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow key={index}>
                {columns.map((col) => (
                  <TableCell key={String(col.key)}>{row[col.key]}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
