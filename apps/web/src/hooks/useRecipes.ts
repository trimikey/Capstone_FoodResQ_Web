import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { RecipeDifficulty } from '@foodresq/types';

export interface RecipeIngredient {
  id?: string;
  name: string;
  quantity?: string | null;
  unit?: string | null;
  note?: string | null;
}

export interface RecipeListItem {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  difficulty: RecipeDifficulty;
  imageUrls: string[];
  timesUsed: number;
  isPublic: boolean;
  createdAt: string;
  ingredientCount: number;
  authorName: string;
  authorAvatar: string | null;
}

export interface RecipeDetail {
  id: string;
  createdByUserId: string;
  name: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  difficulty: RecipeDifficulty;
  instructions: string | null;
  imageUrls: string[];
  isPublic: boolean;
  timesUsed: number;
  createdAt: string;
  ingredients: RecipeIngredient[];
  createdBy: { fullName: string; avatarUrl: string | null };
}

export interface RecipeListResult {
  items: RecipeListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface RecipeInput {
  name: string;
  description?: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  difficulty?: RecipeDifficulty;
  instructions?: string;
  imageUrls?: string[];
  isPublic?: boolean;
  ingredients?: RecipeIngredient[];
}

export function useRecipes(search = '', page = 1) {
  return useQuery({
    queryKey: ['recipes', 'list', { search, page }],
    queryFn: async () =>
      (await api.get('/recipes', { params: { search: search || undefined, page } })).data.data as RecipeListResult,
    staleTime: 30_000,
  });
}

export function useMyRecipes(enabled = true) {
  return useQuery({
    queryKey: ['recipes', 'mine'],
    queryFn: async () => (await api.get('/recipes/mine')).data.data as RecipeListResult,
    enabled,
    staleTime: 30_000,
  });
}

export function useRecipe(id: string) {
  return useQuery({
    queryKey: ['recipes', 'detail', id],
    queryFn: async () => (await api.get(`/recipes/${id}`)).data.data as RecipeDetail,
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecipeInput) => (await api.post('/recipes', input)).data.data as RecipeDetail,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['recipes'] }),
  });
}

export function useUpdateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; input: RecipeInput }) =>
      (await api.patch(`/recipes/${p.id}`, p.input)).data.data as RecipeDetail,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['recipes'] }),
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/recipes/${id}`)).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['recipes'] }),
  });
}

export function useUploadRecipeImage() {
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await api.post('/recipes/upload-image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data as { url: string };
    },
  });
}
