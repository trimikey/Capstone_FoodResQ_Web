import { IsNumber, IsOptional, IsEnum, IsString, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FoodCategory, FoodGroup } from '@foodresq/types';

export class QueryListingDto {
  @ApiPropertyOptional({ example: 10.8231 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lat?: number;

  @ApiPropertyOptional({ example: 106.6297 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lng?: number;

  @ApiPropertyOptional({ example: 5, description: 'Bán kính tìm kiếm (km)' })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(50)
  @Type(() => Number)
  radiusKm?: number;

  @ApiPropertyOptional({ enum: FoodCategory, description: 'Lọc theo loại chi tiết' })
  @IsOptional()
  @IsEnum(FoodCategory)
  category?: FoodCategory;

  @ApiPropertyOptional({ enum: FoodGroup, description: 'Lọc theo nhóm lớn (ăn liền / nguyên liệu thô)' })
  @IsOptional()
  @IsEnum(FoodGroup)
  group?: FoodGroup;

  @ApiPropertyOptional({ example: 'cơm' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number = 20;
}
