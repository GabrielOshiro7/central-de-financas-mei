import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BrandSymbol } from "@/components/brand/BrandSymbol";
import { BRAND_NAME, MIN_FULL_LOGO_HEIGHT } from "@/lib/brand";
import * as paths from "@/components/brand/brandPaths";

// O desenho da marca é do dono: os paths e os viewBox dos componentes têm de ser IDÊNTICOS aos dos SVGs
// em mywallet-brand/ (comparação das strings "d" e do viewBox), e a conferência por hash fixo vale mesmo
// que a pasta mywallet-brand/ não seja versionada.
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

const GOLDEN: Record<string, string> = {
  LOGO_VIEWBOX: "b3a76db8c7acf5d4fdd40233ee95986f5c28886a1fa5f9396f8180a44dfe85dd",
  SYMBOL_VIEWBOX: "bce9a1206388fe15ef51f5966abd3b75f55b894a8a2eb2978bfeca7bc63e3085",
  SYMBOL_STROKE_D: "f5974461b01d22e102b7f9f9d7bebf6d304f1f87d6b4bf740df206b5e35df714",
  WORDMARK_DARK_D: "70f6fb0d15e2cb173f4e3695922f93cadc814ab99226a7348ff988fc0ab67048",
  WORDMARK_ACCENT_D: "eede5151bcb81937eb4304b6be31ed74aa48831e723eac82aca204f61bdd4eef",
  CLIP_A_POINTS: "3bf161b02db670d1234bf02e84242425ea61a33a7510e95d383df84d94644dee",
  CLIP_B_POINTS: "6fe3e4623bc8481ce8b5044e97b5e9b05e67fb721f4a21f4d079cb81dbaf46ec",
};

const BRAND_DIRS = [join(process.cwd(), "mywallet-brand", "mywallet-brand"), join(process.cwd(), "mywallet-brand")];
const brandDir = BRAND_DIRS.find((dir) => existsSync(join(dir, "mywallet-logo-currentcolor.svg")));
const read = (file: string) => readFileSync(join(brandDir!, file), "utf8");
const match = (re: RegExp, text: string) => {
  const m = re.exec(text);
  if (!m) throw new Error(`não achei ${re}`);
  return m[1];
};

describe("desenho da marca: constantes x hashes fixos (valem sem a pasta mywallet-brand)", () => {
  it.each(Object.keys(GOLDEN))("%s tem o hash esperado", (name) => {
    expect(sha256((paths as unknown as Record<string, string>)[name])).toBe(GOLDEN[name]);
  });

  it("proporções e traço vêm do desenho original", () => {
    expect(paths.LOGO_VIEWBOX).toBe("59 37 386 75");
    expect(paths.SYMBOL_VIEWBOX).toBe("59.5 20.5 108.5 108.5");
    expect(paths.LOGO_ASPECT).toBeCloseTo(386 / 75, 10);
    expect(paths.SYMBOL_ASPECT).toBe(1);
    expect([paths.SYMBOL_STROKE_WIDTH, paths.SYMBOL_STROKE_LINECAP, paths.SYMBOL_STROKE_LINEJOIN]).toEqual(["9.3", "round", "round"]);
    expect(paths.DIVIDER).toEqual({ x: "191.0", y: "37.9", width: "1.6", height: "73" });
  });
});

describe.runIf(brandDir)("desenho da marca: componentes x SVGs de mywallet-brand/ (strings d e viewBox idênticas)", () => {
  it("constantes == mywallet-logo-currentcolor.svg", () => {
    const logo = read("mywallet-logo-currentcolor.svg");
    expect(paths.LOGO_VIEWBOX).toBe(match(/viewBox="([^"]+)"/, logo));
    expect(paths.CLIP_A_POINTS).toBe(match(/id="mw-a"><polygon points="([^"]+)"/, logo));
    expect(paths.CLIP_B_POINTS).toBe(match(/id="mw-b"><polygon points="([^"]+)"/, logo));
    expect(paths.SYMBOL_STROKE_D).toBe(match(/class="mw-d"[^>]* d="([^"]+)"/, logo));
    expect(paths.WORDMARK_DARK_D).toBe(match(/<path fill="currentColor" fill-rule="evenodd" d="([^"]+)"/, logo));
    expect(paths.WORDMARK_ACCENT_D).toBe(match(/<path fill="#D9541E" fill-rule="evenodd" d="([^"]+)"/, logo));
    const rect = /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" fill="currentColor"/.exec(logo)!;
    expect(paths.DIVIDER).toEqual({ x: rect[1], y: rect[2], width: rect[3], height: rect[4] });
  });

  it("constantes do símbolo == mywallet-symbol-currentcolor.svg", () => {
    const symbol = read("mywallet-symbol-currentcolor.svg");
    expect(paths.SYMBOL_VIEWBOX).toBe(match(/viewBox="([^"]+)"/, symbol));
    expect(paths.SYMBOL_STROKE_D).toBe(match(/class="mw-d"[^>]* d="([^"]+)"/, symbol));
    expect(paths.SYMBOL_STROKE_D).toBe(match(/<path clip-path="url\(#mw-b\)" stroke="#D9541E" d="([^"]+)"/, symbol));
  });

  it("o SVG renderizado pelo BrandLogo contém EXATAMENTE as strings d do arquivo", () => {
    const logo = read("mywallet-logo-currentcolor.svg");
    const html = renderToStaticMarkup(<BrandLogo height={40} />);
    expect(html).toContain(`viewBox="${match(/viewBox="([^"]+)"/, logo)}"`);
    expect(html).toContain(`d="${match(/<path fill="currentColor" fill-rule="evenodd" d="([^"]+)"/, logo)}"`);
    expect(html).toContain(`d="${match(/<path fill="#D9541E" fill-rule="evenodd" d="([^"]+)"/, logo)}"`);
    expect(html).toContain(`d="${match(/class="mw-d"[^>]* d="([^"]+)"/, logo)}"`);
  });

  it("o SVG renderizado pelo BrandSymbol contém EXATAMENTE o viewBox e o traço do arquivo", () => {
    const symbol = read("mywallet-symbol-currentcolor.svg");
    const html = renderToStaticMarkup(<BrandSymbol height={32} />);
    expect(html).toContain(`viewBox="${match(/viewBox="([^"]+)"/, symbol)}"`);
    expect(html).toContain(`d="${match(/class="mw-d"[^>]* d="([^"]+)"/, symbol)}"`);
  });
});

describe("BrandLogo e BrandSymbol", () => {
  it("logo completa: viewBox, nome acessível, partes escuras em currentColor e laranja pelo token de acento", () => {
    const html = renderToStaticMarkup(<BrandLogo height={40} />);
    expect(html).toContain('viewBox="59 37 386 75"');
    expect(html).toContain('role="img"');
    expect(html).toContain(`aria-label="${BRAND_NAME}"`);
    expect(html).toContain('data-brand="logo"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain('class="fill-ember"');
    expect(html).toContain('class="stroke-ember"');
    expect(html).not.toMatch(/#D9541E/i); // o laranja vem do token, nunca de uma cor digitada no componente
    expect(html).not.toContain("<title>");
    expect(html).toContain('height="40"');
    expect(html).toContain(`width="${Math.round(40 * (386 / 75) * 100) / 100}"`);
  });

  it("símbolo: viewBox, nome acessível, quadrado (largura = altura)", () => {
    const html = renderToStaticMarkup(<BrandSymbol height={32} />);
    expect(html).toContain('viewBox="59.5 20.5 108.5 108.5"');
    expect(html).toContain('role="img"');
    expect(html).toContain(`aria-label="${BRAND_NAME}"`);
    expect(html).toContain('data-brand="symbol"');
    expect(html).toContain('width="32"');
    expect(html).toContain('height="32"');
    expect(html).not.toMatch(/#D9541E/i);
  });

  it("regra dos 28 px: abaixo de MIN_FULL_LOGO_HEIGHT a logo vira só o símbolo; a partir dele, logo completa", () => {
    expect(MIN_FULL_LOGO_HEIGHT).toBe(28);
    expect(renderToStaticMarkup(<BrandLogo height={27} />)).toContain('data-brand="symbol"');
    expect(renderToStaticMarkup(<BrandLogo height={16} />)).toContain('data-brand="symbol"');
    expect(renderToStaticMarkup(<BrandLogo height={28} />)).toContain('data-brand="logo"');
    expect(renderToStaticMarkup(<BrandLogo height={64} />)).toContain('data-brand="logo"');
  });

  it("ids dos clipPath vêm de useId: duas logos e um símbolo na mesma página não repetem id, e cada url(#) aponta para um id existente", () => {
    const html = renderToStaticMarkup(
      <div>
        <BrandLogo height={32} />
        <BrandLogo height={40} />
        <BrandSymbol height={32} />
      </div>
    );
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(6); // 3 instâncias x 2 clipPath
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^mw-[ab]-[A-Za-z0-9_-]+$/);
    const refs = [...html.matchAll(/clip-path="url\(#([^)]+)\)"/g)].map((m) => m[1]);
    expect(refs).toHaveLength(6);
    for (const ref of refs) expect(ids).toContain(ref);
  });

  it("dentro de um link, o nome acessível sai só da logo (um aria-label, sem texto repetido)", () => {
    const html = renderToStaticMarkup(
      <a href="https://example.com/" title={BRAND_NAME}>
        <BrandLogo height={40} />
      </a>
    );
    expect(html.match(/aria-label=/g)).toHaveLength(1);
    expect(html.replace(/<svg[\s\S]*<\/svg>/, "")).toBe(`<a href="https://example.com/" title="${BRAND_NAME}"></a>`);
  });
});
