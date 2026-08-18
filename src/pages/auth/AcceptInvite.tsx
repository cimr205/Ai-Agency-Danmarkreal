import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Mail } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from '@/lib/errors';

type InvitationPreview = {
  email: string;
  role: string;
  status: string;
  expires_at: string;
  company_name: string;
};

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { locale } = useParams();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [status, setStatus] = useState<"loading" | "ready" | "accepting" | "success" | "error">("loading");
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Fetch invitation details
  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("Intet invitation-token fundet i linket.");
      return;
    }

    supabase
      .rpc("get_invitation_by_token", { _token: token })
      .then(({ data, error }) => {
        const inv = data?.[0];
        if (error || !inv) {
          setStatus("error");
          setErrorMsg("Ugyldigt invitation-link.");
          return;
        }
        if (inv.status !== "pending") {
          setStatus("error");
          setErrorMsg("Denne invitation er allerede brugt eller tilbagekaldt.");
          return;
        }
        if (new Date(inv.expires_at) < new Date()) {
          setStatus("error");
          setErrorMsg("Denne invitation er udløbet.");
          return;
        }
        setInvitation(inv);
        setStatus("ready");
      });
  }, [token]);

  // If not authenticated, redirect to signup. The new account won't have a
  // live session until its email is confirmed, so the return trip through
  // /auth/callback can't carry a query param — stash the token and let
  // AuthContext accept it on the next real sign-in instead.
  useEffect(() => {
    if (authLoading || status === "loading") return;
    if (!isAuthenticated && status === "ready" && token) {
      localStorage.setItem('pending_invite_token', token);
      const returnUrl = `/${locale || "en"}/invite?token=${token}`;
      navigate(`/${locale || "en"}/auth/signup?redirect=${encodeURIComponent(returnUrl)}`);
    }
  }, [isAuthenticated, authLoading, status]);

  const handleAccept = async () => {
    if (!token) return;
    setStatus("accepting");
    try {
      const { error } = await supabase.rpc("accept_invitation", { invite_token: token });
      if (error) throw error;
      setStatus("success");
      toast.success("Du er nu tilknyttet virksomheden!");
      // Refresh profile and redirect after short delay
      setTimeout(() => {
        window.location.href = `/${locale || "en"}/app/dashboard`;
      }, 2000);
    } catch (error) {
      setStatus("error");
      setErrorMsg((getErrorMessage(error) || "Kunne ikke acceptere invitationen."));
    }
  };

  if (authLoading || status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const companyName = invitation?.company_name || "Virksomheden";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {status === "success" ? (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
              <CardTitle>Velkommen!</CardTitle>
              <CardDescription>Du er nu tilknyttet {companyName}. Du bliver omdirigeret...</CardDescription>
            </>
          ) : status === "error" ? (
            <>
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
              <CardTitle>Invitation fejlede</CardTitle>
              <CardDescription>{errorMsg}</CardDescription>
            </>
          ) : (
            <>
              <Mail className="h-12 w-12 text-primary mx-auto mb-2" />
              <CardTitle>Du er inviteret!</CardTitle>
              <CardDescription>
                Du er blevet inviteret til at slutte dig til <strong>{companyName}</strong> som{" "}
                <strong>{invitation?.role === "company_admin" ? "administrator" : "medarbejder"}</strong>.
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {status === "ready" && isAuthenticated && (
            <>
              <p className="text-sm text-muted-foreground text-center">
                Logget ind som <strong>{user?.email}</strong>
              </p>
              {user?.email?.toLowerCase() !== invitation?.email?.toLowerCase() && (
                <p className="text-sm text-amber-600 text-center">
                  ⚠️ Din e-mail matcher ikke invitationens e-mail ({invitation?.email}). Du skal logge ind med den korrekte e-mail.
                </p>
              )}
              <Button
                onClick={handleAccept}
                className="w-full"
                disabled={user?.email?.toLowerCase() !== invitation?.email?.toLowerCase()}
              >
                Acceptér invitation
              </Button>
            </>
          )}
          {status === "accepting" && (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          )}
          {status === "error" && (
            <Button variant="outline" onClick={() => navigate(`/${locale || "en"}/auth/login`)}>
              Gå til login
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
