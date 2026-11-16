// Gom dữ liệu một deal: trạng thái trên chuỗi + điều khoản trong database (đã đối chiếu termsHash).
import "server-only";
import { requireDeal, type OnchainDeal } from "./chain";
import { ApiErr } from "./http";
import { getListingByDeal, type ListingRow } from "./repo";
import type { Address } from "../types";

export async function dealContext(dealId: bigint): Promise<{ deal: OnchainDeal; listing: ListingRow }> {
  const [deal, listing] = await Promise.all([requireDeal(dealId), getListingByDeal(dealId)]);
  if (!listing) throw new ApiErr("NOT_FOUND", `Hợp đồng #${dealId} chưa có điều khoản trong database`);
  if (listing.terms_hash.toLowerCase() !== deal.termsHash.toLowerCase()) {
    throw new ApiErr("CHAIN_MISMATCH", "termsHash trên chuỗi không khớp điều khoản đã lưu");
  }
  return { deal, listing };
}

export function isParty(deal: OnchainDeal, wallet: Address): "tenant" | "landlord" | null {
  if (wallet === deal.tenant) return "tenant";
  if (wallet === deal.landlord) return "landlord";
  return null;
}
