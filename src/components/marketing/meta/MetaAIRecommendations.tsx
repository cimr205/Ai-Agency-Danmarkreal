import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, Link2 } from "lucide-react";

export function MetaAIRecommendations({ compact }: { compact?: boolean }) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">AI-anbefalinger</CardTitle>
          <Badge variant="secondary" className="text-[10px]">Drevet af AI</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Link2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">Ingen anbefalinger endnu</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Forbind din Meta Ads konto – så analyserer AI dine kampagner og giver anbefalinger
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
