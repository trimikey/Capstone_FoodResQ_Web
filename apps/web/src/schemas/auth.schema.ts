import { z } from 'zod';
import { UserRole } from '@foodresq/types';

export const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
});

export const registerSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z
    .string()
    .min(8, 'Mật khẩu tối thiểu 8 ký tự')
    .regex(/(?=.*[A-Z])/, 'Cần ít nhất 1 chữ hoa')
    .regex(/(?=.*[0-9])/, 'Cần ít nhất 1 chữ số'),
  fullName: z.string().min(2, 'Họ tên tối thiểu 2 ký tự'),
  role: z.enum([UserRole.PROVIDER, UserRole.RECEIVER, UserRole.VOLUNTEER]),
  phone: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
