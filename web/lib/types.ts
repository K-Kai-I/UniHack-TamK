// Kiểu dùng chung cho API, frontend và module AI.
// Khớp docs/api-contract.md và docs/data-contract.md. Sửa docs trước, rồi mới sửa file này.

/** Số tiền: chuỗi số nguyên theo đơn vị nhỏ nhất của token (6 số lẻ). "230000000" = 230 mUSDC. */
export type Amount = string;
/** Hex 32 byte có 0x. */
export type Hash = `0x${string}`;
/** Địa chỉ ví, chữ thường. */
export type Address = `0x${string}`;
/** ISO 8601 theo UTC. */
export type IsoTime = string;

/** Thứ tự cố định, khớp enum State trong contract. */
export const DEAL_STATES = [
  "OPEN",
  "RESERVED",
  "ACTIVE",
  "CHECKED_OUT",
  "PROPOSED",
  "DISPUTED",
  "SETTLED",
  "REFUNDED",
  "CANCELLED",
  "MISMATCH_REPORTED",
  "ABANDON_REPORTED",
] as const;
export type DealState = (typeof DEAL_STATES)[number];

export const DISPUTE_KINDS = ["NONE", "DEDUCTION", "MISMATCH"] as const;
export type DisputeKind = (typeof DISPUTE_KINDS)[number];

// ------------------------------------------------------------------ kct.terms/1

export interface PhotoRef {
  photoId: string;
  sha256: Hash;
}

export interface Position {
  id: string; // p1, p2...
  name: string;
  instruction: string;
  examplePhoto: PhotoRef;
}

export interface PriceItem {
  id: string; // i1, i2...
  item: string;
  unit: string;
  priceAmount: Amount;
}

export interface Terms {
  schema: "kct.terms/1";
  createdAt: IsoTime;
  landlord: Address;
  room: { title: string; address: string; rentVnd: number; amenities: string[] };
  listingPhotos: PhotoRef[];
  money: {
    token: Address;
    decimals: 6;
    depositAmount: Amount;
    reserveFeeAmount: Amount;
    vndPerToken: number;
  };
  dates: { moveInDate: IsoTime; leaseEnd: IsoTime };
  positions: Position[];
  priceList: PriceItem[];
  yieldEnabled: boolean;
}

// ------------------------------------------------------------------ kct.photoset/1

export type PhotoSetKind = "checkin" | "checkout" | "mismatch";

export interface PhotoSetItem {
  positionId: string;
  sha256: Hash;
  capturedAt: IsoTime;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
}

export interface PhotoSetManifest {
  schema: "kct.photoset/1";
  dealId: number;
  kind: PhotoSetKind;
  takenBy: Address;
  createdAt: IsoTime;
  items: PhotoSetItem[];
}

// ------------------------------------------------------------------ báo cáo AI

export type DamageVerdict = "NEW_DAMAGE" | "WEAR" | "NO_CHANGE" | "UNCLEAR";

/** Một vị trí trong báo cáo hư hỏng. Module AI điền mọi trường trừ amount (API điền). */
export interface DamagePosition {
  positionId: string;
  verdict: DamageVerdict;
  confidence: number; // 0..1
  description: string; // 1 câu tiếng Việt
  priceItemId: string | null;
  quantity: number;
  outsidePriceList: boolean;
  amount: Amount; // API điền: đơn giá × quantity
}

export interface DamageReport {
  schema: "kct.report.damage/1";
  dealId: number;
  checkInHash: Hash;
  checkOutHash: Hash;
  model: string;
  promptVersion: string;
  createdAt: IsoTime;
  positions: DamagePosition[];
  totalAmount: Amount;
  sealedAmount: Amount;
}

export type ListingVerdict = "MATCH" | "UNCLEAR" | "MISMATCH";
/** Số dùng khi ký con dấu và trong contract. */
export const LISTING_VERDICT_CODE: Record<ListingVerdict, 0 | 1 | 2> = { MATCH: 0, UNCLEAR: 1, MISMATCH: 2 };

export interface MismatchReport {
  schema: "kct.report.mismatch/1";
  dealId: number;
  termsHash: Hash;
  evidenceHash: Hash;
  model: string;
  promptVersion: string;
  createdAt: IsoTime;
  verdict: ListingVerdict;
  confidence: number;
  reasons: string[];
}

// ------------------------------------------------------------------ API

export interface ApiError {
  error: { code: ApiErrorCode; message: string };
}

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "WRONG_STATE"
  | "CHAIN_MISMATCH"
  | "FILE_TOO_LARGE"
  | "MISSING_POSITIONS"
  | "RATE_LIMITED"
  | "AI_FAILED";

export interface Timeouts {
  moveInGrace: number;
  checkInObjection: number;
  mismatchWindow: number;
  abandonWindow: number;
  checkOutGrace: number;
  proposeWindow: number;
  respondWindow: number;
  juryWindow: number;
}

export interface ConfigResponse {
  chainId: number;
  contracts: { escrow: Address; token: Address; vault: Address | null };
  aiSigner: Address;
  tokenDecimals: 6;
  vndPerToken: number;
  feeBps: number;
  timeouts: Timeouts;
  explorerTxUrl: string;
}

export interface DamageSeal {
  dealId: number;
  checkInHash: Hash;
  checkOutHash: Hash;
  aiAmount: Amount;
  reportHash: Hash;
  signature: Hash;
  signer: Address;
}

export interface MismatchSeal {
  dealId: number;
  termsHash: Hash;
  evidenceHash: Hash;
  verdict: 0 | 1 | 2;
  reportHash: Hash;
  signature: Hash;
}

export type AiJobStatus = "processing" | "done" | "failed";
