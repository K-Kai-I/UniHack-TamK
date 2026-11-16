import { z } from "zod";

const common = {
  name: z.string().trim().min(1), positionId: z.string().min(1), positionName: z.string().min(1),
  before: z.string().min(1), after: z.string().min(1),
  labelStatus: z.enum(["reviewed", "provisional"]).default("provisional"),
  source: z.string().optional(),
};
export const casesSchema = z.array(z.discriminatedUnion("task", [
  z.object({ ...common, task: z.literal("damage"),
    expectVerdict: z.enum(["NEW_DAMAGE", "WEAR", "NO_CHANGE", "UNCLEAR"]),
    expectPriceItemId: z.string().nullable(),
    expectQuantity: z.number().int().nonnegative().optional(),
    expectOutsidePriceList: z.boolean().optional(),
  }),
  z.object({ ...common, task: z.literal("listing"), expectVerdict: z.enum(["MATCH", "MISMATCH", "UNCLEAR"]) }),
])).min(1).superRefine((cases, ctx) => {
  if (new Set(cases.map(c => c.name)).size !== cases.length) ctx.addIssue({ code: "custom", message: "Tên ca phải duy nhất" });
  cases.forEach((c, i) => {
    if (c.task === "damage" && c.expectVerdict !== "NEW_DAMAGE" &&
        (c.expectPriceItemId !== null || (c.expectQuantity ?? 0) !== 0 || c.expectOutsidePriceList === true)) {
      ctx.addIssue({ code: "custom", path: [i], message: "Nhãn không hư hỏng không được có mục khấu trừ" });
    }
  });
});
export type EvalCase = z.infer<typeof casesSchema>[number];
export type EvalRow = {
  name: string; task: string; model: string; promptVersion: string; expected: string;
  predicted: string | null; labelStatus: string; labelMatch: boolean; fieldsMatch: boolean;
  durationMs: number; error: string | null; output: unknown;
};
export function score(c: EvalCase, out: { verdict: string; priceItemId?: string | null; quantity?: number; outsidePriceList?: boolean }) {
  const labelMatch = c.expectVerdict === out.verdict;
  return { labelMatch, fieldsMatch: labelMatch && (c.task === "listing" ||
    (c.expectPriceItemId === out.priceItemId &&
     (c.expectQuantity === undefined || c.expectQuantity === out.quantity) &&
     (c.expectOutsidePriceList === undefined || c.expectOutsidePriceList === out.outsidePriceList))) };
}
export function summarize(rows: EvalRow[]) {
  return [...new Set(rows.map(r => `${r.model}/${r.task}`))].map(group => {
    const all = rows.filter(r => `${r.model}/${r.task}` === group);
    const valid = all.filter(r => r.error === null);
    const times = valid.map(r => r.durationMs).sort((a,b) => a-b);
    return { group, total: all.length, valid: valid.length, errors: all.length-valid.length,
      labelMatches: valid.filter(r => r.labelMatch).length, fieldMatches: valid.filter(r => r.fieldsMatch).length,
      labelAccuracyOnValid: valid.length ? valid.filter(r => r.labelMatch).length / valid.length : null,
      successAndLabelRate: all.length ? valid.filter(r => r.labelMatch).length / all.length : null,
      reviewed: all.filter(r => r.labelStatus === "reviewed").length,
      medianMs: times.length ? (times[Math.floor((times.length-1)/2)] + times[Math.floor(times.length/2)])/2 : null,
      confusion: all.reduce<Record<string, Record<string, number>>>((m,r) => {
        const key = r.predicted ?? "ERROR";
        m[r.expected] ??= {}; m[r.expected][key] = (m[r.expected][key] ?? 0)+1; return m;
      }, {}),
    };
  });
}
export function toCsv(rows: EvalRow[]) {
  const keys = ["name", "task", "model", "promptVersion", "expected", "predicted", "labelStatus", "labelMatch", "fieldsMatch", "durationMs", "error"] as const;
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + [keys.join(","), ...rows.map(r => keys.map(k => cell(r[k])).join(","))].join("\n");
}
