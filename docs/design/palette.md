# Workspace-designsprog — palet og kontrast

Kilde: kalenderens eksisterende, allerede implementerede tokens i `src/index.css`
(`--cal-*`, linje 342-358). Disse er de faktiske, afprøvede værdier — ikke aflæst
fra billedet igen, da koden allerede er den levende specifikation.

Power Dialer (og fremtidige sider) genbruger dem under rolle-navngivne
`--workspace-*`-tokens, defineret som aliaser af `--cal-*`, så der er én kilde
til sandhed. Se `src/index.css` og `tailwind.config.ts`.

## Rollenavne → værdi → rolle

| Token | Værdi | Rolle |
|---|---|---|
| `--workspace-frame` | `#0B0B0C` | Yderste mørke ramme/baggrund |
| `--workspace-panel` | `#1A1A1C` | Mørke venstrepaneler |
| `--workspace-panel-row` | `#2A2A2D` | Hover/valgt-tilstand i mørke paneler |
| `--workspace-ink-on-dark` | `#FFFFFF` | Overskriftstekst på mørk baggrund |
| `--workspace-label-on-dark` | `#D4D4D8` | Sekundær tekst på mørk baggrund |
| `--workspace-muted-on-dark` | `#5C5C61` | Dæmpet/udenfor-tekst på mørk baggrund (kun dekorativt, se kontrakttjek) |
| `--workspace-gradient` | `linear-gradient(110deg, #E4F17A 0%, #D9EBA0 30%, #CFDCE6 65%, #CBC9F0 100%)` | Hovedfladens diagonale gradient |
| `--workspace-accent` | `#8B7CF6` | Aktivt tal/lille markering (kun store/fede tal, se kontrakttjek) |
| `--workspace-today` | `#E5F160` | "I dag" / aktiv-markering (lime) |
| `--workspace-ink` | `#0A0A0A` | Tekst oven på gradient og pille-knapper |
| `--workspace-tile-active` | `#FFFFFF` | Aktiv flise-baggrund |
| `--workspace-tile-inactive` | `rgba(155,170,185,0.45)` | Inaktiv flise-baggrund |
| `--workspace-surface` | `#FFFFFF` | Hvid bund-flade |
| `--workspace-surface-line` | `#ECECEF` | Tynd skillelinje i bund-fladen |
| `--workspace-surface-label` | `#6B6B70` | Sekundær tekst på hvid bund |

## Udfaldsfarver (nye, Power Dialer-specifikke — dæmpet, ikke i kalenderen)

| Token | Værdi | Betydning |
|---|---|---|
| `--workspace-outcome-answered` | `#5BBF8A` | Besvaret / interesseret |
| `--workspace-outcome-none` | `#9A9AA3` | Intet svar |
| `--workspace-outcome-callback` | `#E3B34F` | Ring tilbage |
| `--workspace-outcome-negative` | `#D9695F` | Ikke interesseret / fejl |

Farve er aldrig eneste bærer af betydning — hvert udfald har også tekst/ikon
(se `OUTCOMES` i `ColdCallerPage.tsx`).

## Kontraktjek (WCAG, beregnet med standard relativ luminans)

| Par | Ratio | Status |
|---|---|---|
| Hvid tekst på `--workspace-frame` | 19.67:1 | ✅ AA/AAA |
| `--workspace-label-on-dark` på `--workspace-panel` | 11.76:1 | ✅ AA/AAA |
| `--workspace-muted-on-dark` på `--workspace-panel` | 2.61:1 | ❌ Under AA — **kun til dekorativ/udenfor-måned-tekst, aldrig til nødvendig tekst** (arvet fra kalenderens eksisterende brug) |
| `--workspace-ink` på gradient (gul-lime-ende) | 16.18:1 | ✅ AA/AAA |
| `--workspace-ink` på gradient (lavendel-ende) | 12.40:1 | ✅ AA/AAA |
| `--workspace-ink` på hvid flisebund | 18.88:1 | ✅ AA/AAA |
| `--workspace-accent` på hvid | 3.33:1 | ⚠️ Kun til store/fede tal (≥24px fed ≈ "large text", 3:1-krav) — **aldrig til normal brødtekst** |
| `--workspace-surface-label` på hvid | 5.30:1 | ✅ AA |

**Konsekvens for komponenterne:** `--workspace-accent` bruges udelukkende til
de store flisetal (som kalenderens `DayHeaderStrip`, der også kun bruger
`cal-purple` på det store 32px/fed tal). `--workspace-muted-on-dark` bruges
kun til ting, der allerede er dekorative i kalenderen (udenfor-måned-datoer).
Begge begrænsninger er arvet fra kalenderens eksisterende, afprøvede mønster —
ikke noget nyt, der introduceres her.

## Lys/mørk tilstand

Ligesom kalenderen har workspace-designsproget **sin egen faste mørke/gradient
palet, uafhængig af app-temaet** (se kommentar i `src/index.css` linje 339-341).
Det er en bevidst arvet beslutning, ikke en mangel: paneler og gradient skal se
ens ud i både lys og mørk app-tilstand, præcis som kalenderen gør i dag.
