import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAccessGuard, JwtPayload } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VaultService } from './vault.service';
import { VaultResponseDto } from './dto/vault-response.dto';

@Controller('vault')
@UseGuards(JwtAccessGuard)
export class VaultController {
  constructor(private readonly vaultService: VaultService) {}

  /**
   * GET /api/v1/vault
   *
   * Returns the unified Vault view for the authenticated user:
   * - Vault-level totals (usedBytes, limitBytes, freeBytes,
   *   largestFreeSlotBytes, percentUsed).
   * - Per-account breakdown ordered as Primary → Secondary-1 → Secondary-2.
   *
   * No secret or encrypted material is ever included.
   */
  @Get()
  getVault(@CurrentUser() user: JwtPayload): Promise<VaultResponseDto> {
    return this.vaultService.getVault(user.sub);
  }
}
