import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsString()
  @MinLength(8)
  temporaryPassword!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  groupIds!: string[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateUserDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];
}

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  realmRoles!: string[];

  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

export class UpdateGroupDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  realmRoles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class CreateRoleDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_.:-]+$/)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

export class CreatePermissionDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_.:-]+$/)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
