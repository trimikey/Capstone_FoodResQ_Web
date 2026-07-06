import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';
import type { CapturedImage } from '../services/faceCapture';

/** Độ khó công thức (khớp enum RecipeDifficulty backend). */
export type RecipeDifficulty = 'easy' | 'medium' | 'hard';

/** Nhãn + màu cho độ khó. */
export const DIFFICULTY_META: Record<RecipeDifficulty, { label: string; color: string; bg: string }> = {
  easy: { label: 'Dễ', color: '#059669', bg: '#ecfdf5' },
  medium: { label: 'Trung bình', color: '#d97706', bg: '#fffbeb' },
  hard: { label: 'Khó', color: '#dc2626', bg: '#fef2f2' },
};
export function difficultyMeta(d: RecipeDifficulty) {
  return DIFFICULTY_META[d] ?? DIFFICULTY_META.medium;
}

/** Một nguyên liệu trong công thức. */
export interface RecipeIngredient {
  id?: string;
  name: string;
  quantity?: string | null;
  unit?: string | null;
  note?: string | null;
}

/** Item trong danh sách công thức (GET /recipes, /recipes/mine). */
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

/** Chi tiết công thức (GET /recipes/:id). */
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

/** Body POST/PATCH /recipes. */
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

interface Paginated<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Thư viện công thức công khai. GET /recipes?search=&page= */
export function useRecipes(search = '', page = 1) {
  return useQuery({
    queryKey: ['recipes', 'list', { search, page }],
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Paginated<RecipeListItem>>>(endpoints.recipes.list, {
        params: { search: search || undefined, page },
      });
      return res.data.data;
    },
  });
}

/** Công thức của tôi. GET /recipes/mine */
export function useMyRecipes(enabled = true) {
  return useQuery({
    queryKey: ['recipes', 'mine'],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Paginated<RecipeListItem>>>(endpoints.recipes.mine);
      return res.data.data;
    },
  });
}

/** Chi tiết 1 công thức. GET /recipes/:id */
export function useRecipeDetail(id?: string) {
  return useQuery({
    queryKey: ['recipes', 'detail', id],
    enabled: !!id,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<RecipeDetail>>(endpoints.recipes.detail(id!));
      return res.data.data;
    },
  });
}

/** Tạo công thức mới (chef/admin). POST /recipes */
export function useCreateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecipeInput) => {
      const res = await apiClient.post<ApiResponse<RecipeDetail>>(endpoints.recipes.create, input);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  });
}

/** Sửa công thức (chủ sở hữu/admin). PATCH /recipes/:id */
export function useUpdateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: RecipeInput }) => {
      const res = await apiClient.patch<ApiResponse<RecipeDetail>>(endpoints.recipes.update(id), input);
      return res.data.data;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      qc.invalidateQueries({ queryKey: ['recipes', 'detail', id] });
    },
  });
}

/** Xoá công thức (chủ sở hữu/admin). DELETE /recipes/:id */
export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.delete<ApiResponse<unknown>>(endpoints.recipes.delete(id));
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  });
}

/** Upload 1 ảnh cho công thức → trả URL để gắn vào imageUrls. POST /recipes/upload-image */
export function useUploadRecipeImage() {
  return useMutation({
    mutationFn: async (photo: CapturedImage) => {
      const form = new FormData();
      form.append('image', photo as unknown as Blob);
      const res = await apiClient.post<ApiResponse<{ url: string }>>(endpoints.recipes.uploadImage, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
  });
}
