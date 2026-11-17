# Built from the bundle that scripts/growth-os/railway-bundle.sh assembles
# (the repo paths are kept, so the imports resolve unchanged).
FROM denoland/deno:2.9.8
WORKDIR /app
COPY supabase/functions/_shared/growth-os supabase/functions/_shared/growth-os
COPY growth-os/service growth-os/service
COPY growth-os/service/deno.lock deno.lock
RUN deno cache --lock=deno.lock growth-os/service/main.ts
USER deno
EXPOSE 8080
CMD ["deno", "run", "--lock=deno.lock", "--cached-only", "--allow-net", "--allow-env", "growth-os/service/main.ts"]
