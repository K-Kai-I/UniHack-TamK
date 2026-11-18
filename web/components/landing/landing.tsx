// Landing "Dải tiền cọc" cho người chưa đăng nhập. Phần tĩnh render phía server;
// chỉ dải hành trình, so ảnh, mô phỏng im lặng và nút đăng nhập chạy ở client.
import "server-only";
import { Suspense, type ReactNode } from "react";
import { ExternalLink, Plus, ShieldCheck } from "lucide-react";
import { AuthCta, StickyCta } from "./auth";
import { CompareSlider } from "./compare-slider";
import { EXAMPLE, POSITIONS, PRICE_LIST, WINDOWS, hasPhoto, vnd } from "./data";
import { Hero } from "./hero";
import { JourneyRail } from "./journey-rail";
import { RoomPlate } from "./room-plates";
import { SilenceSim } from "./silence-sim";
import { UnderWater } from "./under-water";
import s from "./landing.module.css";


function photoMap() {
  const m: Record<string, boolean> = {};
  for (const p of POSITIONS) for (const k of ["checkin", "checkout"]) m[`${p.id}-${k}`] = hasPhoto(`${p.id}-${k}`);
  return m;
}

const TEAM = [
  { slug: "khai", name: "Lê Quang Khải", role: "Contract + Backend", work: "Hợp đồng giữ cọc, hạn chót, con dấu AI, API và bot xử lý quá hạn." },
  { slug: "khanh", name: "Nguyễn Quốc Khánh", role: "Frontend", work: "Mọi màn hình, camera trong app, đăng nhập Google và luồng ký." },
  { slug: "khoa", name: "Lê Đăng Khoa", role: "AI", work: "So ảnh trước và sau, prompt, bộ đánh giá trên các cặp ảnh." },
];

export function Landing() {
  const photos = photoMap();
  return (
    <div className={s.page}>
      <a href="#noi-dung" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-3">Bỏ qua tới nội dung</a>
      <Header />
      <main id="noi-dung">
        <Hero />
        <Problem />
        <Journey photos={photos} />
        <Landlord />
        <Suspense fallback={<section className={`${s.deep} h-[40rem]`} aria-label="Đang đọc chuỗi" />}>
          <UnderWater />
        </Suspense>
        <Limits />
        <Faq />
        <Team />
        <Close />
      </main>
      <Footer />
      <StickyCta />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/85">
      <div className={`${s.wrap} flex h-16 items-center justify-between gap-4 md:h-18`}>
        <a href="#" className="flex items-center gap-2 text-primary">
          <ShieldCheck className="size-7 shrink-0" aria-hidden="true" />
          <span className="text-lg font-extrabold tracking-tight">Két Cọc Trọ</span>
        </a>
        <nav aria-label="Trên trang này" className="hidden items-center gap-1 lg:flex">
          {[["#hanh-trinh", "Cách hoạt động"], ["#chu-tro", "Cho chủ trọ"], ["#kiem-chung", "Kiểm chứng"], ["#hoi-dap", "Hỏi đáp"]].map(([href, label]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-2 text-[0.95rem] font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-primary">{label}</a>
          ))}
        </nav>
        <AuthCta guest="Đăng nhập" size="default" variant="outline" memberVariant="default" arrow={false} />
      </div>
    </header>
  );
}

function SectionHead({ id, title, children, className }: { id: string; title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`max-w-[44rem] space-y-4 ${className ?? ""}`}>
      <h2 id={id} className="text-[2.1rem] leading-[1.06] font-extrabold tracking-[-0.035em] text-balance text-primary md:text-[3.25rem]">{title}</h2>
      {children && <div className="text-lg text-muted-foreground [&>p+p]:mt-3">{children}</div>}
    </div>
  );
}

/* ---------- Vấn đề: cọc kiểu cũ là dải đứt ---------- */
function Problem() {
  const rows = [
    ["Tiền cọc nằm ở đâu", "Trong tài khoản của một bên", "Trong hợp đồng tự chạy, không bên nào tự rút"],
    ["Tình trạng phòng lúc nhận", "Trí nhớ, vài tin nhắn", "Ảnh chụp trong app, có thời điểm, không sửa được về sau"],
    ["Mức trừ khi trả phòng", "Báo miệng lúc trả phòng", "Theo bảng giá chốt từ lúc đăng phòng"],
    ["Khi một bên im lặng", "Tiền kẹt, phải đi đòi", "Tới hạn, tiền tự đi theo luật đã chốt"],
    ["Khi không đồng ý", "Thương lượng, hoặc ra tòa", "Kháng nghị, bồi thẩm chọn một trong hai con số"],
  ];
  return (
    <section aria-labelledby="problem-title" className="py-20 md:py-28">
      <div className={`${s.wrap} space-y-12`}>
        <SectionHead id="problem-title" title="Cọc kiểu cũ: tiền ở một phía, bằng chứng ở trí nhớ.">
          <p>Người thuê thường là bên yếu thế. Vài triệu đồng không đáng để ra tòa, nên khi bị trừ cọc không rõ lý do, phần lớn đành chịu.</p>
        </SectionHead>

        <div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Clipping
              source="Tuổi Trẻ"
              date="28/08/2026"
              href="https://tuoitre.vn/tan-sinh-vien-tim-phong-tro-coi-chung-mat-tien-vi-hieu-nham-dieu-khoan-100260828112104934.htm"
              text="Một người thuê ở Tân Bình mất 3,8 triệu đồng tiền cọc khi hết hợp đồng, còn bị yêu cầu trả thêm gần 2 triệu đồng sửa vòi nước, sơn lại tường mà không có hóa đơn cụ thể."
            />
            <Clipping
              source="Thanh Niên"
              date="03/06/2022"
              href="https://thanhnien.vn/chu-nha-tro-khong-tra-hon-150-trieu-dong-tien-coc-nhieu-sinh-vien-dh-quoc-gia-tp-hcm-cau-cuu-1851465052.htm"
              text="Nhiều sinh viên ĐHQG-HCM ở một khu trọ tại Dĩ An chưa được hoàn hơn 150 triệu đồng tiền cọc. Mỗi người đã đóng từ 3 đến 4,5 triệu."
            />
          </div>
        </div>

        <dl className="divide-y border-y md:hidden">
          {rows.map(([k, old, ket]) => (
            <div key={k} className="space-y-2 py-5">
              <dt className="font-bold">{k}</dt>
              <dd className="text-muted-foreground"><span className="font-semibold">Kiểu cũ:</span> {old}</dd>
              <dd className="font-semibold text-primary">Trong Két: <span className="text-foreground">{ket}</span></dd>
            </div>
          ))}
        </dl>
        <div className="hidden md:block">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">So sánh cọc kiểu cũ và cọc trong Két Cọc Trọ</caption>
            <thead>
              <tr className="border-b-2 border-primary">
                <th scope="col" className="w-[26%] py-4 pr-6 text-sm font-semibold text-muted-foreground"><span className="sr-only">Tiêu chí</span></th>
                <th scope="col" className="w-[30%] py-4 pr-6 text-lg font-bold text-muted-foreground">Cọc kiểu cũ</th>
                <th scope="col" className="py-4 text-lg font-extrabold text-primary">Cọc trong Két</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, old, ket]) => (
                <tr key={k} className="border-b">
                  <th scope="row" className="py-5 pr-6 align-top font-bold">{k}</th>
                  <td className="py-5 pr-6 align-top text-muted-foreground">{old}</td>
                  <td className="py-5 align-top font-semibold">{ket}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Clipping({ source, date, href, text }: { source: string; date: string; href: string; text: string }) {
  return (
    <figure className="flex flex-col justify-between gap-6 rounded-2xl bg-secondary p-6 md:p-8">
      <blockquote className="text-xl leading-snug font-semibold text-pretty md:text-2xl">{text}</blockquote>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span><cite className="font-semibold text-foreground not-italic">{source}</cite>, {date} (tóm tắt)</span>
        <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline">
          Đọc bài gốc <ExternalLink className="size-4" aria-hidden="true" /><span className="sr-only">(mở thẻ mới)</span>
        </a>
      </figcaption>
    </figure>
  );
}

/* ---------- Hành trình: dải liền đi qua từng mốc ---------- */
function Step({ date, title, children, wide }: { date: string; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <section aria-label={title} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-4 pb-20 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-x-8 md:pb-28">
      <div className="relative flex items-start pt-2 max-md:justify-center md:pt-3 md:pl-4">
        <span data-rail-node className="relative z-10 block size-5 shrink-0 rounded-full border-4 border-background bg-warning md:size-8" />
        <span className="mt-1 ml-11 hidden text-base font-bold whitespace-nowrap text-muted-foreground tabular-nums md:block">{date}</span>
      </div>
      <div className={`min-w-0 space-y-8 ${wide ? "" : "max-w-[52rem]"}`}>
        <h3 className="text-[1.9rem] leading-[1.08] font-extrabold tracking-[-0.03em] text-balance text-primary md:text-[2.75rem]">
          <span className="font-bold text-muted-foreground tabular-nums md:hidden">{date} · </span>
          {title}
        </h3>
        {children}
      </div>
    </section>
  );
}

function Journey({ photos }: { photos: Record<string, boolean> }) {
  return (
    <div id="hanh-trinh" className="scroll-mt-20 pt-4">
      <div className={`${s.wrap} mb-14 md:mb-20`}>
        <SectionHead id="journey-title" title="Đi theo tiền cọc, từ lúc gửi tới lúc chia.">
          <p>Ví dụ minh họa: {EXAMPLE.room}, cọc {vnd(EXAMPLE.deposit)}, ở 6 tháng.</p>
        </SectionHead>
      </div>
      <div className={s.wrap}>
        <JourneyRail share={(EXAMPLE.deposit - EXAMPLE.deduction) / EXAMPLE.deposit}>
          <Step date={EXAMPLE.moveIn} title="Gửi cọc. Tiền khóa trong hợp đồng sau 1–2 giây.">
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-end">
              <div className="space-y-2 rounded-2xl border p-6">
                <p className="text-sm font-semibold text-muted-foreground">Tiền cọc</p>
                <p className="text-4xl font-extrabold tracking-tight tabular-nums md:text-5xl">{vnd(EXAMPLE.deposit)}</p>
                <p className="font-semibold text-success">Đã khóa trong hợp đồng</p>
              </div>
              <p className="text-lg text-muted-foreground">
                Từ đây, không ai tự rút được, kể cả nhóm làm app. Tiền chỉ ra khỏi hợp đồng theo đúng luật hai bên đã thấy trước khi gửi: điều khoản, bảng giá và hạn chót.
              </p>
            </div>
          </Step>

          <Step date={EXAMPLE.moveIn} title="Nhận phòng. Chụp 3 góc chủ trọ đã chỉ sẵn." wide>
            <ul className="-mx-[var(--gutter)] flex snap-x snap-mandatory gap-4 overflow-x-auto px-[var(--gutter)] pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
              {POSITIONS.map((p) => (
                <li key={p.id} className="w-[78%] shrink-0 snap-start space-y-2 sm:w-auto">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                    {photos[`${p.id}-checkin`] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/landing/${p.id}-checkin.webp`} alt={`${p.name}, lúc nhận phòng (ảnh minh họa)`} loading="lazy" className="size-full object-contain" />
                    ) : (
                      <RoomPlate id={p.id} className="size-full" />
                    )}
                    <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2.5 py-0.5 text-xs text-muted-foreground">
                      {photos[`${p.id}-checkin`] ? "Ảnh minh họa" : "Hình vẽ minh họa"}
                    </span>
                  </div>
                  <p className="font-bold">{p.name}</p>
                  <p className="text-sm text-muted-foreground">{p.instruction}</p>
                </li>
              ))}
            </ul>
            <p className="max-w-[62ch] text-lg text-muted-foreground">
              Ảnh chỉ chụp bằng camera trong app, không chọn từ thư viện. Mã của bộ ảnh được ghi lại cùng hợp đồng, nên ảnh không thể bị thay sau này.
            </p>
          </Step>

          <Step date="6 tháng" title="Đang ở. Tiền nằm yên.">
            <p className="max-w-[62ch] text-lg text-muted-foreground">
              Không có gì phải làm. Bạn mở app lúc nào cũng thấy cọc đang ở đâu, bao nhiêu, và khi nào về.
            </p>
          </Step>

          <Step date={EXAMPLE.leaseEnd} title="Trả phòng. AI so ảnh trước và sau, theo bảng giá có sẵn." wide>
            <CompareSlider photos={photos} />
          </Step>

          <Step date={`+${WINDOWS.propose}`} title="Đề xuất và phản hồi. Mỗi bước có hạn chót." wide>
            <p className="max-w-[62ch] text-lg text-muted-foreground">
              Chủ trọ đề xuất mức trừ, người thuê đồng ý hoặc kháng nghị. Bên nào im lặng tới hạn thì bên đó chịu, nên tiền không bao giờ kẹt. Thử chọn:
            </p>
            <SilenceSim />
          </Step>

          <Step date="kết thúc" title="Chia tiền. Mỗi bên nhận đúng phần của mình." wide>
            <Outcome />
          </Step>
        </JourneyRail>
      </div>
    </div>
  );
}

function Outcome() {
  const tenant = EXAMPLE.deposit - EXAMPLE.deduction;
  return (
    <div className="space-y-6">
      {/* dải hành trình rẽ vào đây và tách đôi (vẽ trong JourneyRail) */}
      <div data-rail-end aria-hidden="true" className="h-36 md:h-52" />
      <dl className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-muted-foreground">Về người thuê</dt>
          <dd className="text-4xl font-extrabold tracking-tight text-success tabular-nums md:text-5xl">{vnd(tenant)}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">Về chủ trọ</dt>
          <dd className="text-4xl font-extrabold tracking-tight tabular-nums md:text-5xl">{vnd(EXAMPLE.deduction)}</dd>
        </div>
      </dl>
      <p className="max-w-[62ch] text-lg text-muted-foreground">
        Tiền về thẳng tài khoản trong app của mỗi bên, trong cùng một lần chia. Biên nhận ghi rõ từng khoản và có đường dẫn để ai cũng tự kiểm tra được.
      </p>
    </div>
  );
}

/* ---------- Chủ trọ ---------- */
function Landlord() {
  const points = [
    ["Bảng giá rõ từ đầu", "Người thuê thấy giá sửa từng hạng mục trước khi gửi cọc, nên lúc trả phòng ít phải giải thích."],
    ["Ảnh bảo vệ cả hai bên", "Hư hỏng mới có ảnh trước và sau làm căn cứ, không còn là lời người này với người kia."],
    ["Bỏ ngang cũng có luật", "Người thuê bỏ đi không báo, chủ trọ báo trong app. Người thuê im lặng tới hạn thì chủ trọ nhận cọc."],
    ["Chỉ ký 2 lần", "Một lần lúc đăng phòng, một lần lúc đề xuất mức trừ. Phần còn lại hợp đồng tự lo."],
  ];
  return (
    <section id="chu-tro" aria-labelledby="landlord-title" className="scroll-mt-20 border-t py-20 md:py-28">
      <div className={`${s.wrap} grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16`}>
        <div className="space-y-10">
          <SectionHead id="landlord-title" title="Chủ trọ cũng bớt được một cuộc cãi nhau.">
            <p>Két không đứng về phía nào. Luật chốt trước, áp như nhau cho cả hai bên.</p>
          </SectionHead>
          <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {points.map(([k, v]) => (
              <div key={k} className="space-y-2 border-t-2 border-primary pt-4">
                <dt className="text-lg font-extrabold">{k}</dt>
                <dd className="text-muted-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <figure className="self-start rounded-2xl border p-6">
          <figcaption className="mb-2 flex items-baseline justify-between gap-2">
            <span className="font-extrabold">Bảng giá sửa chữa</span>
            <span className="text-sm text-muted-foreground">ví dụ minh họa</span>
          </figcaption>
          <table className="w-full text-left">
            <thead className="sr-only"><tr><th scope="col">Hạng mục</th><th scope="col">Giá</th></tr></thead>
            <tbody>
              {PRICE_LIST.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-4 pr-4">{r.item}<span className="block text-sm text-muted-foreground">mỗi {r.unit}</span></td>
                  <td className="py-4 text-right font-bold tabular-nums">{vnd(r.vnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm text-muted-foreground">Chốt lúc đăng phòng, không sửa được sau khi người thuê đã cọc.</p>
        </figure>
      </div>
    </section>
  );
}

/* ---------- Giới hạn nói thật ---------- */
function Limits() {
  const items = [
    ["Bồi thẩm do nhóm thêm.", "Nhóm vẫn ảnh hưởng được kết quả tranh chấp, nhưng không lấy được tiền, vì tiền chỉ về hai bên. Hướng sau: bồi thẩm đặt cọc và nhận thưởng khi bỏ phiếu đúng."],
    ["AI chưa được đo trên ảnh phòng trọ thật.", "AI chỉ đề xuất và là một phiếu. Người thuê luôn kháng nghị được."],
    ["Ảnh vẫn có thể bị dàn dựng.", "Camera trong app, thời điểm chụp và mã ảnh trên chuỗi làm việc gian lận khó hơn, chứ không loại bỏ hẳn."],
    ["Mới là bản thử nghiệm.", "Chỉ dùng tiền thử trên Avalanche Fuji. Luật chia tiền cần luật sư xem trước khi dùng tiền thật."],
  ];
  return (
    <section aria-labelledby="limits-title" className="py-20 md:py-28">
      <div className={`${s.wrap} grid gap-12 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-16`}>
        <SectionHead id="limits-title" title="Những gì chưa làm được.">
          <p>Nói trước để bạn quyết định có căn cứ.</p>
        </SectionHead>
        <ul className="divide-y border-y">
          {items.map(([k, v]) => (
            <li key={k} className="grid gap-2 py-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-8">
              <p className="text-lg font-bold">{k}</p>
              <p className="text-muted-foreground">{v}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Hỏi đáp ---------- */
function Faq() {
  const qa = [
    ["AI so sai thì sao?", "AI không chạm vào tiền. Nó chỉ trả kết luận và hạng mục bảng giá, rồi ký con dấu. Chủ trọ vẫn tự đề xuất, người thuê vẫn kháng nghị được, và khi tranh chấp, con dấu AI chỉ là một phiếu."],
    ["Nhóm làm app có rút được tiền cọc không?", "Không. Hợp đồng không có hàm nào cho nhóm, server hay AI rút tiền. Tiền chỉ đi tới người thuê, chủ trọ, ví phí (chỉ phí trên tiền lãi) và két lãi."],
    ["Mất điện thoại thì cọc có mất không?", "Không. Cọc nằm trong hợp đồng, không nằm trong điện thoại. Đăng nhập lại bằng Google trên máy khác là thấy đủ."],
    ["Bao lâu thì nhận lại cọc?", `Trả phòng xong, chủ trọ có ${WINDOWS.propose} để đề xuất mức trừ, người thuê có ${WINDOWS.respond} để phản hồi. Ai im lặng tới hạn thì tiền đi theo luật, không phải chờ.`],
    ["Tôi không biết gì về tiền mã hóa, có dùng được không?", "Được. Bạn đăng nhập bằng Google, ví được tạo ngầm. Trên màn hình chỉ có tiền cọc bằng VND, việc cần làm và hạn chót."],
    ["Chủ trọ không đồng ý dùng thì sao?", "Két cần cả hai bên đồng ý từ đầu. Chủ trọ đăng phòng kèm điều khoản và bảng giá; người thuê thấy hết trước khi gửi cọc."],
  ];
  return (
    <section id="hoi-dap" aria-labelledby="faq-title" className="scroll-mt-20 border-t py-20 md:py-28">
      <div className={`${s.wrap} grid gap-12 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-16`}>
        <SectionHead id="faq-title" title="Hỏi đáp" />
        <div className={`${s.faq} divide-y border-y`}>
          {qa.map(([q, a]) => (
            <details key={q} className="group">
              <summary className="flex min-h-16 cursor-pointer items-center justify-between gap-6 py-4 text-lg font-bold">
                {q}
                <Plus className={`${s.chev} size-6 shrink-0 text-primary transition-transform duration-200`} aria-hidden="true" />
              </summary>
              <p className="max-w-[62ch] pb-6 text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Đội ngũ ---------- */
function Team() {
  return (
    <section aria-labelledby="team-title" className="border-t py-20 md:py-28">
      <div className={`${s.wrap} space-y-12`}>
        <SectionHead id="team-title" title="Ba người làm Két Cọc Trọ.">
          <p>Sinh viên, dự thi Team1 Vietnam UniHack 2026.</p>
        </SectionHead>
        {TEAM.every((m) => hasPhoto(`team/${m.slug}`)) ? (
          <ul className="grid gap-10 sm:grid-cols-3">
            {TEAM.map((m) => (
              <li key={m.slug} className="space-y-4">
                <div className="aspect-[4/5] overflow-hidden rounded-2xl bg-secondary">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/landing/team/${m.slug}.webp`} alt={`Chân dung ${m.name}`} loading="lazy" className="size-full object-cover" />
                </div>
                <div className="space-y-1">
                  <p className="text-xl font-extrabold">{m.name}</p>
                  <p className="font-semibold text-primary">{m.role}</p>
                  <p className="text-muted-foreground">{m.work}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          // Chưa đủ ảnh chân dung: danh sách kẻ dòng, không dựng ô trống thay ảnh.
          <ul className="divide-y border-y">
            {TEAM.map((m) => (
              <li key={m.slug} className="grid gap-1 py-6 md:grid-cols-[minmax(0,18rem)_minmax(0,12rem)_minmax(0,1fr)] md:items-baseline md:gap-8">
                <p className="text-xl font-extrabold">{m.name}</p>
                <p className="font-semibold text-primary">{m.role}</p>
                <p className="text-muted-foreground">{m.work}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ---------- Lời kết ---------- */
function Close() {
  return (
    <section aria-labelledby="close-title" className="relative overflow-hidden bg-secondary py-20 md:py-28">
      <svg viewBox="0 0 1440 200" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 top-1/2 h-40 w-full -translate-y-1/2 md:h-52" aria-hidden="true">
        <path d="M-20 140 C300 140 420 60 760 60" fill="none" stroke="var(--ink)" strokeWidth={46} opacity={0.1} />
        <path d="M760 60 C1040 60 1160 40 1460 40" fill="none" stroke="var(--keep)" strokeWidth={43} opacity={0.14} />
        <path d="M760 60 C1040 60 1160 150 1460 150" fill="none" stroke="var(--ink)" strokeWidth={3} opacity={0.18} />
      </svg>
      <div className={`${s.wrap} relative space-y-8 text-center`}>
        <h2 id="close-title" className="mx-auto max-w-[18ch] text-[2.4rem] leading-[1.04] font-extrabold tracking-[-0.04em] text-balance text-primary md:text-[4.25rem]">
          Tiền cọc rõ ràng, từ nhận đến trả phòng.
        </h2>
        <div id="close-cta" className="flex flex-col items-center gap-3">
          <AuthCta className="min-h-16 px-8 text-lg" />
          <p className="text-sm text-muted-foreground">
            <span data-when-guest>Đăng nhập bằng Google là dùng được, không cần cài thêm gì.</span>
            <span data-when-session>Bạn đã đăng nhập. Vào app để xem hợp đồng và việc cần làm.</span>
          </p>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t py-10 text-sm text-muted-foreground">
      <div className={`${s.wrap} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
        <p><span className="font-bold text-primary">Két Cọc Trọ</span> · Team1 Vietnam UniHack 2026 · Bản thử nghiệm trên Avalanche Fuji, chỉ dùng tiền thử.</p>
        <a href="https://github.com/K-Kai-I/UniHack-TamK" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline">
          Mã nguồn <ExternalLink className="size-4" aria-hidden="true" /><span className="sr-only">(mở thẻ mới)</span>
        </a>
      </div>
    </footer>
  );
}
