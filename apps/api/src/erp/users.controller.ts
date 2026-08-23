import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser, Roles } from 'nest-keycloak-connect';
import { Throttle } from '@nestjs/throttler';

import { AdminAuditService } from './admin-audit.service';
import {
  CreateGroupDto,
  CreatePermissionDto,
  CreateRoleDto,
  CreateUserDto,
  UpdateGroupDto,
  UpdateRoleDto,
  UpdateUserDto,
} from './dto/admin.dto';
import { KeycloakAdminService } from './keycloak-admin.service';

@Controller('users')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class UsersController {
  constructor(
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly audit: AdminAuditService,
  ) {}

  private actor(user: Record<string, unknown>) {
    return String(user.sub ?? user.preferred_username ?? '');
  }

  @Get()
  @Roles({ roles: ['user_read'] })
  list() {
    return this.keycloakAdmin.listUsers();
  }

  @Get('catalog')
  @Roles({ roles: ['user_manage'] })
  catalog() {
    return this.keycloakAdmin.getCatalog();
  }

  @Post()
  @Roles({ roles: ['user_manage'] })
  async create(
    @Body() body: CreateUserDto,
    @AuthenticatedUser() user: Record<string, unknown>,
  ) {
    const result = await this.keycloakAdmin.createUser(body);
    await this.audit.log(
      'user.create',
      'user',
      result.id,
      { email: body.email, groupIds: body.groupIds },
      this.actor(user),
    );
    return result;
  }

  @Post('roles')
  @Roles({ roles: ['user_manage'] })
  async createRole(
    @Body() body: CreateRoleDto,
    @AuthenticatedUser() user: Record<string, unknown>,
  ) {
    const result = await this.keycloakAdmin.createRealmRole(body);
    await this.audit.log(
      'role.create',
      'role',
      result.name,
      { permissions: body.permissions },
      this.actor(user),
    );
    return result;
  }

  @Patch('roles/:name')
  @Roles({ roles: ['user_manage'] })
  async updateRole(
    @Param('name') name: string,
    @Body() body: UpdateRoleDto,
    @AuthenticatedUser() user: Record<string, unknown>,
  ) {
    const result = await this.keycloakAdmin.updateRealmRole(name, body);
    await this.audit.log('role.update', 'role', name, { ...body }, this.actor(user));
    return result;
  }

  @Delete('roles/:name')
  @Roles({ roles: ['user_manage'] })
  async deleteRole(
    @Param('name') name: string,
    @AuthenticatedUser() user: Record<string, unknown>,
  ) {
    const result = await this.keycloakAdmin.deleteRealmRole(name);
    await this.audit.log('role.delete', 'role', name, {}, this.actor(user));
    return result;
  }

  @Post('permissions')
  @Roles({ roles: ['user_manage'] })
  async createPermission(
    @Body() body: CreatePermissionDto,
    @AuthenticatedUser() user: Record<string, unknown>,
  ) {
    const result = await this.keycloakAdmin.createPermission(body);
    await this.audit.log(
      'permission.create',
      'permission',
      result.name,
      {},
      this.actor(user),
    );
    return result;
  }

  @Delete('permissions/:name')
  @Roles({ roles: ['user_manage'] })
  async deletePermission(
    @Param('name') name: string,
    @AuthenticatedUser() user: Record<string, unknown>,
  ) {
    const result = await this.keycloakAdmin.deletePermission(name);
    await this.audit.log(
      'permission.delete',
      'permission',
      name,
      {},
      this.actor(user),
    );
    return result;
  }

  @Post('groups')
  @Roles({ roles: ['user_manage'] })
  async createGroup(
    @Body() body: CreateGroupDto,
    @AuthenticatedUser() user: Record<string, unknown>,
  ) {
    const result = await this.keycloakAdmin.createGroup(body);
    await this.audit.log(
      'group.create',
      'group',
      result.id,
      { name: body.name },
      this.actor(user),
    );
    return result;
  }

  @Patch('groups/:id')
  @Roles({ roles: ['user_manage'] })
  async updateGroup(
    @Param('id') id: string,
    @Body() body: UpdateGroupDto,
    @AuthenticatedUser() user: Record<string, unknown>,
  ) {
    const result = await this.keycloakAdmin.updateGroup(id, body);
    await this.audit.log('group.update', 'group', id, { ...body }, this.actor(user));
    return result;
  }

  @Delete('groups/:id')
  @Roles({ roles: ['user_manage'] })
  async deleteGroup(
    @Param('id') id: string,
    @AuthenticatedUser() user: Record<string, unknown>,
  ) {
    const result = await this.keycloakAdmin.deleteGroup(id);
    await this.audit.log('group.delete', 'group', id, {}, this.actor(user));
    return result;
  }

  @Get(':id/group-ids')
  @Roles({ roles: ['user_manage'] })
  userGroupIds(@Param('id') id: string) {
    return this.keycloakAdmin.getUserGroupIds(id);
  }

  @Patch(':id')
  @Roles({ roles: ['user_manage'] })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @AuthenticatedUser() user: Record<string, unknown>,
  ) {
    const result = await this.keycloakAdmin.updateUser(id, body);
    await this.audit.log('user.update', 'user', id, { ...body }, this.actor(user));
    return result;
  }

  @Delete(':id')
  @Roles({ roles: ['user_manage'] })
  async deleteUser(
    @Param('id') id: string,
    @AuthenticatedUser() user: Record<string, unknown>,
  ) {
    const result = await this.keycloakAdmin.deleteUser(id);
    await this.audit.log('user.delete', 'user', id, {}, this.actor(user));
    return result;
  }
}
