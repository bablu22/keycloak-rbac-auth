import { IsNumber, IsString } from 'class-validator';

export class AdjustInventoryDto {
  @IsString()
  sku!: string;

  @IsNumber()
  delta!: number;
}
