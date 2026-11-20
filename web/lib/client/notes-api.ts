// Lý do kèm đề xuất mức trừ (chủ trọ) / kháng nghị (người thuê): POST /deals/:dealId/notes (docs/api-contract.md).
// Gửi TRƯỚC khi ký giao dịch; giao dịch lên chuỗi rồi thì lý do bị khóa.
import { apiFetch } from "./api";

export type NoteKind = "proposal" | "dispute";
export interface DealNote { text: string; author: string; at: string }

export async function saveNote(dealId: number, kind: NoteKind, text: string, token: string | null): Promise<void> {
  await apiFetch(`/deals/${dealId}/notes`, { method: "POST", body: { kind, text }, token });
}
