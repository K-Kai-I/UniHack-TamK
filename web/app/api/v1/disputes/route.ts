// GET /api/v1/disputes?juror=0x...: các vụ đang chờ phiếu mà bồi thẩm này chưa bỏ.
import { addresses, escrowAbi } from "@/lib/chain";
import { publicClient, readDeals, readIsJuror } from "@/lib/server/chain";
import { ApiErr, json, route } from "@/lib/server/http";
import { listBoundListings } from "@/lib/server/repo";
import { DISPUTE_KINDS, type Address } from "@/lib/types";

export const GET = route(async (req: Request) => {
  const juror = (new URL(req.url).searchParams.get("juror") ?? "").toLowerCase() as Address;
  if (!/^0x[0-9a-f]{40}$/.test(juror)) throw new ApiErr("BAD_REQUEST", "Cần ?juror=0x...");
  if (!(await readIsJuror(juror))) return json({ items: [], isJuror: false });

  const rows = await listBoundListings();
  const deals = (await readDeals(rows.map((r) => BigInt(r.deal_id!)))).map((d, i) => ({ d, r: rows[i] }));
  const open = deals.filter(({ d }) => d.stateName === "DISPUTED" && d.landlord !== juror && d.tenant !== juror);
  const voted = await Promise.all(
    open.map(({ d }) =>
      publicClient.readContract({ address: addresses.escrow, abi: escrowAbi, functionName: "hasVoted", args: [d.id, juror] }),
    ),
  );

  const items = open
    .filter((_, i) => !voted[i])
    .map(({ d, r }) => ({
      dealId: Number(d.id),
      title: r.terms.room.title,
      kind: DISPUTE_KINDS[d.disputeKind],
      deadline: new Date(Number(d.deadline) * 1000).toISOString(),
      votes: { landlord: d.votesLandlord, tenant: d.votesTenant },
    }));
  return json({ items, isJuror: true });
});
