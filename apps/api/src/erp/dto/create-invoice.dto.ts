import { IsNumber, IsString, MinLength } from 'class-validator';

export class CreateInvoiceDto {
  @IsString()
  @MinLength(1)
  vendor!: string;

  @IsNumber()
  amount!: number;
}
