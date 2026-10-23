import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

const BUCKET = 'video-assets';
const MAX_FILE_BYTES = 500 * 1024 * 1024; // mirrors the bucket's file_size_limit
const ACCEPTED_PREFIXES = ['video/', 'audio/', 'image/'];

export interface VideoProject {
  id: string;
  company_id: string;
  created_by: string;
  name: string;
  project_json: Json;
  status: 'draft' | 'exporting' | 'exported' | 'failed';
  duration_frames: number | null;
  thumbnail_path: string | null;
  exported_video_path: string | null;
  exported_at: string | null;
  created_at: string;
  updated_at: string;
}

async function getCompanyId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', session.user.id)
    .single();
  if (!profile?.company_id) throw new Error('No company');
  return profile.company_id;
}

export class VideoAssetValidationError extends Error {}

function assertValidMediaFile(file: File) {
  if (!ACCEPTED_PREFIXES.some((p) => file.type.startsWith(p))) {
    throw new VideoAssetValidationError(`Unsupported file type: ${file.type || 'unknown'}`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new VideoAssetValidationError(`File too large (max ${MAX_FILE_BYTES / (1024 * 1024)}MB)`);
  }
}

/** Uploads a raw media file to the tenant's video-assets folder and returns a usable URL
 *  (signed, 24h) for elah's `importUrl()`. Validates type + size before upload. */
export function useUploadVideoAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<{ path: string; url: string; file: File }> => {
      assertValidMediaFile(file);
      const companyId = await getCompanyId();
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
      const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 60 * 60 * 24);
      if (signError || !data) throw signError ?? new Error('Could not sign upload URL');
      return { path, url: data.signedUrl, file };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video-assets'] }),
  });
}

export interface VideoAssetListEntry {
  path: string;
  name: string;
  sizeBytes: number | null;
  createdAt: string | null;
  mimeType: string | null;
}

/** Lists previously uploaded media for the current company (excludes the exports/ subfolder). */
export function useVideoAssetList() {
  return useQuery({
    queryKey: ['video-assets'],
    queryFn: async (): Promise<VideoAssetListEntry[]> => {
      const companyId = await getCompanyId();
      const { data, error } = await supabase.storage.from(BUCKET).list(companyId, {
        sortBy: { column: 'created_at', order: 'desc' },
        limit: 200,
      });
      if (error) throw error;
      return (data ?? [])
        .filter((f) => f.id) // storage.list() also returns the "exports" pseudo-folder as an entry with id=null
        .map((f) => ({
          path: `${companyId}/${f.name}`,
          name: f.name,
          sizeBytes: (f.metadata as { size?: number } | null)?.size ?? null,
          createdAt: f.created_at,
          mimeType: (f.metadata as { mimetype?: string } | null)?.mimetype ?? null,
        }));
    },
  });
}

/** Re-signs a stored video-asset path (signed URLs expire; call before re-opening a project). */
export async function signVideoAssetUrl(path: string, expiresInSeconds = 60 * 60 * 24): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw error ?? new Error('Could not sign URL');
  return data.signedUrl;
}

export function useVideoProjects() {
  return useQuery({
    queryKey: ['video-projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('video_projects')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as VideoProject[];
    },
  });
}

export function useVideoProject(id: string | undefined) {
  return useQuery({
    queryKey: ['video-project', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('video_projects').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as VideoProject;
    },
  });
}

export function useCreateVideoProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; project_json: Json }) => {
      const companyId = await getCompanyId();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('video_projects')
        .insert({ company_id: companyId, created_by: session.user.id, name: input.name, project_json: input.project_json })
        .select('*')
        .single();
      if (error) throw error;
      return data as VideoProject;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video-projects'] }),
  });
}

export function useSaveVideoProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, project_json, name, duration_frames }: { id: string; project_json: Json; name?: string; duration_frames?: number }) => {
      const update: Record<string, unknown> = { project_json };
      if (name !== undefined) update.name = name;
      if (duration_frames !== undefined) update.duration_frames = duration_frames;
      const { data, error } = await supabase.from('video_projects').update(update).eq('id', id).select('*').single();
      if (error) throw error;
      return data as VideoProject;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['video-projects'] });
      qc.invalidateQueries({ queryKey: ['video-project', data.id] });
    },
  });
}

export function useDeleteVideoProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('video_projects').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video-projects'] }),
  });
}

/** Uploads the rendered export Blob and marks the project as exported. */
export function useUploadExportedVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, blob }: { projectId: string; blob: Blob }) => {
      const companyId = await getCompanyId();
      const path = `${companyId}/exports/${projectId}-${Date.now()}.mp4`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: 'video/mp4',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data, error } = await supabase
        .from('video_projects')
        .update({ status: 'exported', exported_video_path: path, exported_at: new Date().toISOString() })
        .eq('id', projectId)
        .select('*')
        .single();
      if (error) throw error;
      return data as VideoProject;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['video-projects'] });
      qc.invalidateQueries({ queryKey: ['video-project', data.id] });
    },
  });
}
