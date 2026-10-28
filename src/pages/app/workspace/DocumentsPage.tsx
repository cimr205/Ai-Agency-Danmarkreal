import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { FileText, Loader2, ExternalLink, Plug } from "lucide-react";
import { useModuleAvailability, useDocuments } from "@/hooks/api/useIntegrations";
import { useI18n } from "@/lib/i18n";
import { dateLocaleTag, t3, tx } from '@/lib/inlineI18n';

// The first product module built on top of the Capability Engine
// (Connected Apps → capabilities → module). This page never mentions
// "Notion" or any other provider by name in its logic — it only asks the
// engine "is documents.read available?" and renders whatever normalized
// data comes back. Add a new document-source provider by extending the
// list-documents action server-side; this page needs no changes.
export default function DocumentsPage() {
  const { locale } = useI18n();
  const { data: availability, isLoading: availabilityLoading } = useModuleAvailability();
  const documentsModule = availability?.modules.find((m) => m.module === "documents");
  const isAvailable = !!documentsModule?.available;

  const { data, isLoading: documentsLoading, error } = useDocuments(isAvailable);

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" /> {tx("Dokumenter", "Documents")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {tx("Gennemse dokumenter fra jeres forbundne kilder ét sted.", "Browse documents from your connected sources in one place.")}
        </p>
      </div>

      {availabilityLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : !isAvailable ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Plug className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="font-medium">{tx("Ingen dokumentkilde forbundet", "No document source connected")}</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {tx("Forbind Notion, Google Drive eller en lignende tjeneste for at aktivere dette modul.", "Connect Notion, Google Drive or a similar service to enable this module.")}
            </p>
            <Button asChild size="sm" className="gap-2">
              <Link to={`/${locale}/app/workspace/connected-apps`}>
                <Plug className="h-4 w-4" /> {tx("Gå til Forbundne apps", "Go to Connected apps")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Kilde: {data?.provider ?? documentsModule?.resolvedConnections[0]?.provider}
            </Badge>
          </div>

          {documentsLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t3("Henter dokumenter…", "Loading documents…", "Dokumente werden geladen…")}
            </div>
          )}

          {error && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-4 text-sm text-destructive">
                {error instanceof Error ? error.message : tx("Kunne ikke hente dokumenter", "Could not load documents")}
              </CardContent>
            </Card>
          )}

          {data && data.documents.length === 0 && !documentsLoading && (
            <p className="text-sm text-muted-foreground">{tx("Ingen dokumenter fundet i den forbundne konto.", "No documents found in the connected account.")}</p>
          )}

          {data && data.documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{data.documents.length} dokumenter</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/40">
                  {data.documents.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 px-4 py-3 hover:bg-card/40 transition-colors"
                    >
                      <div className="h-8 w-8 rounded-lg border border-border/40 bg-card/50 flex items-center justify-center shrink-0 text-sm">
                        {doc.icon ?? <FileText className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{doc.title}</p>
                        {doc.lastEditedAt && (
                          <p className="text-xs text-muted-foreground">
                            {t3("Redigeret", "Edited", "Bearbeitet")} {new Date(doc.lastEditedAt).toLocaleDateString(dateLocaleTag(), { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        )}
                      </div>
                      {doc.url && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
