import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{title}</h1>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="h-5 w-5" />
            Under udvikling
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Denne sektion forbindes til din eksterne backend API.
            Data vil blive hentet fra dit GitHub-repository.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
