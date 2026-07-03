import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RecipeDifficulty } from '@foodresq/types';

export class RecipeIngredientDto {
  @ApiProperty({ example: 'Gạo tẻ' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ example: '2' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  quantity?: string;

  @ApiPropertyOptional({ example: 'kg' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @ApiPropertyOptional({ example: 'Vo sạch trước khi nấu' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class CreateRecipeDto {
  @ApiProperty({ example: 'Cơm thịt kho tàu' })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ example: 'Món chính đậm đà, hợp khẩu vị số đông.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 50, description: 'Số khẩu phần chuẩn của công thức' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  @Type(() => Number)
  servings?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  @Type(() => Number)
  prepMinutes?: number;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  @Type(() => Number)
  cookMinutes?: number;

  @ApiPropertyOptional({ enum: RecipeDifficulty, example: RecipeDifficulty.MEDIUM })
  @IsOptional()
  @IsEnum(RecipeDifficulty)
  difficulty?: RecipeDifficulty;

  @ApiPropertyOptional({ example: '1. Sơ chế...\n2. Kho thịt...' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  instructions?: string;

  @ApiPropertyOptional({ example: ['/uploads/recipes/abc.jpg'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  imageUrls?: string[];

  @ApiPropertyOptional({ example: true, description: 'Công khai cho các bếp khác dùng lại' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isPublic?: boolean;

  @ApiPropertyOptional({ type: [RecipeIngredientDto], description: 'Danh sách nguyên liệu' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients?: RecipeIngredientDto[];
}

export class UpdateRecipeDto extends PartialType(CreateRecipeDto) {}
