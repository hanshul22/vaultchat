import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  CloudinaryAccount,
  CloudinaryAccountRole,
} from '../cloudinary-accounts/entities/cloudinary-account.entity';
import { VaultAccountDto, VaultResponseDto } from './dto/vault-response.dto';

@Injectable()
export class VaultService {
  constructor(
    @InjectRepository(CloudinaryAccount)
    private readonly repo: Repository<CloudinaryAccount>,
  ) {}

  /**
   * Builds the unified Vault view for the authenticated user.
   *
   * - Only active accounts are included.
   * - Accounts are ordered: Primary → Secondary-1 → Secondary-2.
   * - All arithmetic uses BigInt to avoid 53-bit JS number precision loss.
   * - Never touches apiKey, apiSecretEncrypted, or userId in the output.
   */
  async getVault(userId: string): Promise<VaultResponseDto> {
    const rows = await this.repo.find({
      where: { userId, isActive: true },
      select: [
        'id',
        'cloudName',
        'role',
        'secondaryOrder',
        'storageUsedBytes',
        'storageLimitBytes',
      ],
    });

    // ── Canonical sort: primary first, then by secondaryOrder asc ────────────
    rows.sort((a, b) => {
      const w = (r: CloudinaryAccount) =>
        r.role === CloudinaryAccountRole.PRIMARY ? 0 : 1;
      const diff = w(a) - w(b);
      if (diff !== 0) return diff;
      return (a.secondaryOrder ?? 0) - (b.secondaryOrder ?? 0);
    });

    // ── Per-account breakdown ─────────────────────────────────────────────────
    const accounts: VaultAccountDto[] = rows.map((row) => {
      const used = BigInt(row.storageUsedBytes);
      const limit = BigInt(row.storageLimitBytes);
      const free = limit > used ? limit - used : BigInt(0);
      const percent =
        limit > BigInt(0)
          ? Math.round((Number(used) / Number(limit)) * 10_000) / 100
          : 0;

      const dto = new VaultAccountDto();
      dto.id = row.id;
      dto.cloudName = row.cloudName;
      dto.role = row.role;
      dto.secondaryOrder = row.secondaryOrder;
      dto.usedBytes = used.toString();
      dto.limitBytes = limit.toString();
      dto.freeBytes = free.toString();
      dto.percentUsed = percent;
      dto.isFull = free === BigInt(0);
      return dto;
    });

    // ── Vault-level aggregates ────────────────────────────────────────────────
    let totalUsed = BigInt(0);
    let totalLimit = BigInt(0);
    let largestFree = BigInt(0);

    for (const a of accounts) {
      totalUsed += BigInt(a.usedBytes);
      totalLimit += BigInt(a.limitBytes);
      const free = BigInt(a.freeBytes);
      if (free > largestFree) largestFree = free;
    }

    const totalFree =
      totalLimit > totalUsed ? totalLimit - totalUsed : BigInt(0);

    const vaultPercent =
      totalLimit > BigInt(0)
        ? Math.round((Number(totalUsed) / Number(totalLimit)) * 10_000) / 100
        : 0;

    const response = new VaultResponseDto();
    response.usedBytes = totalUsed.toString();
    response.limitBytes = totalLimit.toString();
    response.freeBytes = totalFree.toString();
    response.largestFreeSlotBytes = largestFree.toString();
    response.percentUsed = vaultPercent;
    response.accounts = accounts;

    return response;
  }
}
