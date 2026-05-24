/**
 * Request body for PATCH /api/v1/cloudinary-accounts/:id/swap-order.
 *
 * No fields are required — the swap operation is fully determined by the
 * current user's Secondary-1 and Secondary-2 accounts. This class exists
 * to satisfy the module's DTO layer convention and to allow future
 * extension (e.g. a dry-run flag) without a breaking API change.
 */
export class SwapSecondaryOrderDto {}
