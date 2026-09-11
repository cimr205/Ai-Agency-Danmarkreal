import { Link, useLocation, useParams } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { isLocale } from "@/lib/i18n";

const NotFound = () => {
  const location = useLocation();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : "da";
  const isDa = locale === "da";

  useEffect(() => {
    console.error("404:", location.pathname);
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Minimal nav stripe */}
      <header className="border-b border-foreground/[0.06] px-5 lg:px-10 h-[54px] flex items-center">
        <Link
          to={`/${locale}`}
          className="font-display text-[14px] font-semibold text-foreground tracking-[-0.025em]"
        >
          AI Agency<span className="text-primary">.</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-5">
        <div className="max-w-[560px] w-full py-24">
          {/* Editorial section marker */}
          <div className="flex items-center gap-3 mb-10">
            <span className="font-mono text-[10.5px] tracking-[0.22em] text-muted-foreground/70 uppercase">
              404
            </span>
            <div className="h-px w-10 bg-foreground/20" />
          </div>

          <h1 className="font-display text-[clamp(2.4rem,6vw,4rem)] text-foreground tracking-[-0.04em] leading-[0.95] mb-6">
            {isDa ? (
              <>Siden{" "}
                <span
                  className="italic font-normal text-foreground/70"
                  style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
                >
                  findes ikke
                </span>
                <span className="text-primary">.</span>
              </>
            ) : (
              <>Page{" "}
                <span
                  className="italic font-normal text-foreground/70"
                  style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
                >
                  not found
                </span>
                <span className="text-primary">.</span>
              </>
            )}
          </h1>

          <p className="text-[15px] text-muted-foreground leading-[1.6] mb-12 max-w-[400px]">
            {isDa
              ? "Adressen eksisterer ikke eller er blevet flyttet. Gå tilbage til forsiden og prøv igen."
              : "That address doesn't exist or has moved. Head back to the home page and try again."}
          </p>

          <Link
            to={`/${locale}`}
            className="group inline-flex items-center gap-2 text-[13.5px] font-medium text-foreground border-b border-foreground/20 hover:border-foreground transition-colors pb-px"
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" strokeWidth={2} />
            {isDa ? "Tilbage til forsiden" : "Back to home"}
          </Link>

          {/* Bottom marker */}
          <div className="mt-24 pt-8 border-t border-foreground/[0.06]">
            <span className="text-[11px] font-mono text-muted-foreground/40">
              {isDa ? "Koden: 404 — ikke en fejl fra din side" : "Code: 404 — not your fault"}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
