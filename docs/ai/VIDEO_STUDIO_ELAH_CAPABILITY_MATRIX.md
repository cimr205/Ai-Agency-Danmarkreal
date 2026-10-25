# Video Studio — elah kapabilitetsmatrix (Fase 0a)

**Metode**: Alt nedenfor er læst direkte fra `node_modules/@elah/{core,editor,timeline,react}/dist/*.d.ts`
(ikke fra ejer-noter, ikke antaget). Filer læst i fuld længde:
- `@elah/core/dist/index.d.ts` (82 linjer, fuld eksport-liste)
- `@elah/core/dist/editor/TimelineEngine.d.ts` (71 linjer, alle metoder på `TimelineEngine`)
- `@elah/core/dist/types/index.d.ts` (168 linjer, alle data-typer: `Clip`, `Transform`, `Transition`, `Project` osv.)
- `@elah/timeline/dist/index.d.ts` (16 linjer)
- `@elah/react/dist/index.d.ts` (12 linjer)
- `@elah/editor/dist/index.d.ts` (set tidligere i sessionen, genbrugt her)

**Licens**: `@elah/core`, `@elah/editor`, `@elah/timeline`, `@elah/react` er alle **Apache-2.0**
(bekræftet i hver pakkes `package.json`). `@elah/cli@0.1.2` er også Apache-2.0 (bekræftet via npm).
Apache-2.0 tillader kommerciel SaaS-brug uden begrænsning — **ingen ejer-eskalering nødvendig** for
selve elah-afhængigheden (masterprompt §4 rule 2 er dermed opfyldt for elah selv).

Status-koder: ✅ Findes i elah · 🟡 Findes delvist · ❌ Skal bygges selv

---

## 1. Kerneredigering (masterpromptens punkt 1–10)

| # | Funktion | Status | Bevis / note |
|---|----------|--------|---------------|
| 1 | Flere clips pr. track | ✅ | `Project.clips: Record<string, Clip[]>`, `engine.addClip()` |
| 2 | Flere video-tracks/lag + compositing | ✅ | `engine.addTrack()`, `TrackKind = 'video'\|'audio'\|'elements'`, `GpuRenderer` komposit flere tracks |
| 3 | Klip-hastighed | ✅ | `TimelineEngine.setClipSpeed(clipId, trackId, speed)` — ægte metode, ikke kun et felt |
| 4 | Crop/position/scale/rotation i preview | 🟡 | `Transform {x,y,scale,rotation,anchor,scaleX,scaleY}` + `crop {x,y,width,height}` findes på `Clip`, og `resolveDrawRect`/`transformFromContainRect`/`transformFromCoverRect`/`normalizeCrop` findes som renderer-hjælpere. **Håndtag-UI i preview til at trække/rotere findes ikke i elah selv** — skal bygges i vores `VideoEditorWorkspace.tsx` oven på disse primitiver. |
| 5 | Keyframe-animation (position/scale/opacity over tid) | ❌ | **Vigtigt fund**: `Transform` er en **statisk** struktur pr. klip, ikke en keyframe-liste. `TextAnimation`/`shapeAnimation` findes, men dækker kun ind/ud-bevægelse (`in`, `out`, `durationFrames`, `inMotion`, `outMotion` via `MotionSpec`) — **ikke** fri keyframing midt i et klip. Generel keyframe-animation for position/scale/opacity skal bygges selv (egen datastruktur i `project_json` + egen interpolation, der også skal virke i eksport — se §4 nedenfor). |
| 6 | Undo/redo | ✅ | `TimelineEngine.undo()/redo()/canUndo()/canRedo()`, event `history:change` |
| 7 | Copy/paste/duplicate | ✅ | `TimelineEngine.cloneClip(clipId, trackId, startFrame)` — paste/duplicate er direkte understøttet; "copy" (til clipboard) er egen UI-state oven på `cloneClip` |
| 8 | Snap (grid/playhead/klip-kanter) | ✅ | `snapFrame`, `buildSnapPoints`, `resolveOverlapEdgeSnap`, `DEFAULT_OVERLAP_TOLERANCE` — native engine-niveau snap |
| 9 | Timeline-zoom | 🟡 | Ingen dedikeret zoom-API fundet i `@elah/timeline`'s eksporter — `Timeline`-komponenten tager sandsynligvis en zoom/pixel-per-frame prop, men ikke bekræftet i `.d.ts`. Skal verificeres i `@elah/timeline/dist/Timeline.d.ts` (ikke læst endnu) eller bygges som egen wrapper. |
| 10 | Split + ripple-trim | ✅ | `TimelineEngine.splitClip(clipId, trackId, atFrame)` (standalone `splitClipAtPlayhead` findes også) for split. **Ripple-trim** (at efterfølgende klip automatisk flytter sig ved trim) er ikke en separat metode — kun almindelig `trimClip`. Ripple-adfærd skal bygges selv oven på `trimClip` + `moveClip` i batch. |

## 2. Overgange/effekter/tekst (punkt 11–25)

| # | Funktion | Status | Bevis / note |
|---|----------|--------|---------------|
| 11 | Transitions (fade, dissolve, wipe, slide) | 🟡 | `TransitionKind = 'fade' \| 'slide' \| 'wipe'` — native CRUD via `engine.addTransition/removeTransition/updateTransition`. **"Dissolve" findes ikke som egen type** — skal evt. bygges som en fade-variant, eller tilføjes via `gl-transitions` hvis det kan integreres i `GpuRenderer`'s pipeline (uafklaret, kræver dybere kig i renderer-koden). |
| 12 | Flere transition-typer/retning/easing | 🟡 | `TransitionDirection = 'left'\|'right'\|'up'\|'down'`, `TransitionEasing = 'linear'\|'ease-in'\|'ease-out'` findes, men er begrænsede sæt — bredere bibliotek (fx `gl-transitions`'s ~70 effekter) er ikke indbygget. |
| 13–18 | Farvefiltre/LUT, blend modes, vignette/blur, PiP/split-screen, chroma key, masking | ❌ | Intet af dette findes i `Clip`-typen eller i de eksporterede renderer-hjælpere. Skal bygges som egne WebGL/canvas-effekter oven på `GpuRenderer`, eller afvises med dokumenteret begrundelse jf. masterprompt §4 rule 3. |
| 19 | Tekst-overlay | ✅ | `createTextClip`, `ClipType` inkl. `'text'`, fulde tekst-felter på `Clip` (`fontSize`, `color`, `fontFamily`, `textAlign` osv.) |
| 20 | Tekst-animationer | ✅ | `BUILT_IN_TEXT_TEMPLATES`, `applyTextTemplate`, `findTextTemplate`, `TEXT_ANIMATION_KINDS` (`fade`, `spin`, `slide-up/down/left/right`), `textStylePresetsStore` + `BUILT_IN_TEXT_STYLE_PRESETS` |
| 21 | Fonte inkl. licenserede Google Fonts | ❌ | Ingen font-loading-mekanisme i elah — `fontFamily` er bare en streng, skal selv indlæse/licensere fonte |
| 22–23 | Manuel undertekst-editor + SRT import/eksport | ❌ | Ingen SRT-parser eller undertekst-specifik UI i elah — tekstklip kan genbruges, men SRT I/O skal bygges selv |
| 24–25 | Auto-captions (dansk STT) | ❌ | Ingen STT i elah — kræver ekstern model (`whisper.cpp`/`transformers.js`), kun i edge function pga. API-nøgler/ydeevne |

## 3. Lyd (punkt 26–31)

| # | Funktion | Status | Bevis / note |
|---|----------|--------|---------------|
| 26 | Waveforms | ❌ | Ikke fundet i eksportlisten — skal bygges (Web Audio `AnalyserNode`/offline decode) |
| 27 | Volumen-keyframes | 🟡 | `Clip.volume?: number` er statisk pr. klip; `Track.volume` findes også. Ingen keyframe-liste for volumen over tid — samme begrænsning som pkt. 5 |
| 28 | Auto-ducking | ❌ | Ikke fundet — skal bygges (sandsynligvis ved at generere volumen-keyframes automatisk, som i sig selv kræver pkt. 27 først) |
| 29 | Multi-track mixer | ✅ | `useAudioMixer`, `useMasterVolume`, `useTrackLevels` fra `@elah/react` — native mixer-hooks findes |
| 30 | Noise reduction | ❌ | Ikke fundet — kræver ekstern DSP/model |
| 31 | Licenseret musik/SFX-bibliotek | ❌ (forretning, ikke kode) | Ingen indbygget bibliotek — kræver egen licenseret kilde eller kundens egne uploads, jf. masterprompt §4 rule 2 |

## 4. AI og ydeevne (punkt 32–38, 44–45)

| # | Funktion | Status | Bevis / note |
|---|----------|--------|---------------|
| 32–37 | Auto-reframe, baggrundsfjernelse, AI-billeder, text-to-video, highlight reel, auto farvekorrektion | ❌ | Ingen ML-modeller i elah — alt skal bygges/integreres eksternt (MediaPipe/ONNX for segmentering, `ai_generations` for billeder) |
| 38 | TTS/voice cloning | ❌ | Ikke i elah — ekstern API, kun med dokumenteret samtykke (masterprompt §5 Fase 5) |
| 44 | Server-side rendering | ✅ (pakke findes) | `@elah/cli@0.1.2`, Apache-2.0, beskrives som headless split/trim/export runtime oven på `@elah/core`. Ikke installeret/afprøvet endnu — kun eksistens og licens bekræftet. |
| 45 | Proxy editing | ❌ | Ikke fundet i eksportlisten |

## 5. Projekt-infrastruktur (relevant for Fase 0)

| Funktion | Status | Bevis / note |
|---|--------|---------------|
| Gem/indlæs projekt | ✅ | `serializeProject`/`deserializeProject` (allerede i brug) |
| **Relink af ødelagte/udløbne medier** | ❌ (ikke hvad vi troede) | `relinkProjectMedia` blev først antaget at løse signed-URL-udløb, men **løser det ikke**: den matcher kun på eksakt `src`-streng-lighed og omskriver kun `assetId` — en frisk-signeret URL har aldrig samme streng som den udløbne (token ændrer sig), så matchet fejler altid. `isRecoverableMediaSrc` tæller desuden en udløbet-men-stadig-velformet signed URL som "recoverable" (den tjekker kun `blob:`/`data:`), så `missingMediaSummary` ville aldrig advare om problemet. **Egen fix implementeret** i stedet: `resignProjectMedia()` i `useVideoStudio.ts` udtrækker storage-path direkte fra den signerede URLs path-segment (kun query-token udløber) og gensigninerer hvert klips `src`, før `deserializeProject` kaldes (se `VideoEditorWorkspace.tsx`). Bekræftet ved at læse `@elah/core`'s `serialization.js` (`serializeProject = JSON.stringify(engine.getProject())`) og `@elah/timeline`'s `insertAsset.js` (`addMediaClip` sætter `clip.src = asset.src` — den rå signerede URL vi selv gav `importUrl()`). |
| Thumbnails | ✅ | `scheduleThumbnailById`, `refreshMissingThumbnails` — native, men ubrugt i vores kode i dag (`thumbnail_path`-kolonnen står tom) |
| Media-bibliotek hydrering | ✅ | `hydrateMediaLibrary`, `snapshotMediaLibrary` — relevant for at genskabe biblioteket korrekt ved projekt-åbning |
| Eksport | ✅ | `exportVideo`, `lazyExportVideo` (ny-fundet variant, formodentlig lazy-loaded for bundle-størrelse — ikke afprøvet) |

---

## Opsummering — hvad dette betyder for fase-rækkefølgen

- **Fase 0 (nuværende)**: `relinkProjectMedia`/`hydrateMediaLibrary` er sandsynligvis den rigtige
  løsning til signed-URL-udløb (gap #1) i stedet for en håndrullet re-sign — skal verificeres mod
  faktisk `project_json`-indhold før implementering (næste konkrete skridt).
- **Fase 1**: punkt 1,2,3,6,7,8,10 er solidt native — lav risiko. Punkt 4 kræver UI oven på native
  primitiver (medium risiko). **Punkt 5 (keyframes) er den største unknown i hele Fase 1** — ingen
  native understøttelse, kræver egen datamodel og egen interpolation, der skal virke identisk i
  preview og eksport. Dette bør flages som et åbent spørgsmål/estimat til ejeren inden Fase 1 startes.
- **Fase 3**: transitions er delvist native (fade/slide/wipe), men mange punkter (farvefiltre, blend
  modes, chroma key, masking, fonte, SRT, auto-captions) skal bygges fra bunden — bekræfter
  masterpromptens eget forbehold om at "vi vinder ikke på bredden af effekter."
- **Fase 4**: mixer-infrastruktur (`useAudioMixer`) findes native, men waveforms/ducking/noise
  reduction skal bygges selv.
- **Fase 5**: kun `@elah/cli` (server-side rendering) har en bekræftet eksisterende pakke at bygge på;
  resten er fuldt eksternt arbejde.

**Ikke endnu verificeret** (skal følges op før de respektive punkter påbegyndes):
- `@elah/timeline/dist/Timeline.d.ts`'s faktiske props (zoom-kontrol, punkt 9) er ikke læst i denne
  omgang — kun pakkens top-level re-eksporter.
- `GpuRenderer`'s interne shader-pipeline (relevant for om `gl-transitions`/LUT kan integreres uden
  at bryde preview=eksport-kravet) er ikke læst.
- `@elah/cli`'s faktiske CLI-flader er ikke afprøvet, kun bekræftet at eksistere på npm med Apache-2.0.
