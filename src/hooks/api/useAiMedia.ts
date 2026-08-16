import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface AiGeneration {
  id: string;
  company_id: string;
  user_id: string;
  generation_type: string;
  prompt: string;
  negative_prompt: string | null;
  model_used: string | null;
  status: string;
  output_url: string | null;
  output_storage_path: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
}

export function useAiGenerations(type?: string) {
  return useQuery({
    queryKey: ['ai-generations', type],
    queryFn: async () => {
      let query = supabase
        .from('ai_generations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (type) {
        query = query.eq('generation_type', type);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AiGeneration[];
    },
  });
}

export function useAiGenerate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { prompt: string; generation_type?: string; negative_prompt?: string; reference_image?: string }) => {
      const { data, error } = await supabase.functions.invoke('ai-generate', {
        body: input,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { id: string; status: string; output_url: string; duration_ms: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-generations'] });
    },
  });
}

export function useDeleteAiGeneration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Get the record first to delete storage
      const { data: gen } = await supabase
        .from('ai_generations')
        .select('output_storage_path')
        .eq('id', id)
        .single();

      if (gen?.output_storage_path) {
        await supabase.storage.from('ai-media').remove([gen.output_storage_path]);
      }

      const { error } = await supabase.from('ai_generations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-generations'] });
    },
  });
}
