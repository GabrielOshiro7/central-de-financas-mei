import { expect, type Locator, type Page } from "@playwright/test";

// "Modo card" das tabelas (.rtable, src/app/globals.css, Lote 3): abaixo de 768px
// cada <tr> vira um card empilhado - CSS puro sobre o MESMO DOM. Estas checagens
// leem os estilos COMPUTADOS que o CSS realmente aplica no modo card (e que
// voltam ao normal no desktop):
//
//                          card (< 768px)                tabela (desktop)
//   table                  display: block                table
//   thead                  display: none                 table-header-group
//   tbody                  flex, column                  table-row-group
//   tr                     grid de 2 colunas, borda 1px  table-row, sem borda
//                          solida, padding e fundo
//   td[data-label]         block, ::before com o rotulo  table-cell, sem ::before
//   .rt-sr (rotulo p/ SR)  absoluto 1x1px recortado      display: none
//
// (O raio dos cantos NAO e mais criterio: o app usa cantos retos.)

export async function expectHeaderRemoved(table: Locator) {
  const thead = table.locator("thead");
  expect(await thead.evaluate((el) => getComputedStyle(el).display), "cabeçalho (thead) fora do layout").toBe("none");
  await expect(thead).toBeHidden();
}

export async function expectStackedRows(table: Locator) {
  const layout = await table.evaluate((el) => {
    const body = el.querySelector("tbody")!;
    return {
      table: getComputedStyle(el).display,
      body: getComputedStyle(body).display,
      direction: getComputedStyle(body).flexDirection,
    };
  });
  expect(layout.table, "tabela vira bloco").toBe("block");
  expect([layout.body, layout.direction], "linhas empilhadas em coluna").toEqual(["flex", "column"]);
}

export async function expectCardRow(card: Locator) {
  const row = await card.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      display: style.display,
      columns: style.gridTemplateColumns === "none" ? 0 : style.gridTemplateColumns.split(" ").filter(Boolean).length,
      borderWidth: parseFloat(style.borderTopWidth),
      borderStyle: style.borderTopStyle,
      padding: parseFloat(style.paddingTop),
      background: style.backgroundColor,
    };
  });
  expect(row.display, "linha vira grid").toBe("grid");
  expect(row.columns, "grid de 2 colunas").toBe(2);
  expect([row.borderWidth > 0, row.borderStyle], "contorno do card (borda sólida)").toEqual([true, "solid"]);
  expect(row.padding, "respiro interno do card").toBeGreaterThan(0);
  expect(row.background, "fundo próprio do card").not.toBe("rgba(0, 0, 0, 0)");
}

// Rotulo VISIVEL de cada campo: td em bloco com o data-label no ::before.
export async function expectFieldLabels(card: Locator) {
  const fields = await card.evaluate((row) =>
    Array.from(row.querySelectorAll("td[data-label]"))
      .filter((td) => getComputedStyle(td).display !== "none")
      .map((td) => ({
        label: td.getAttribute("data-label") ?? "",
        display: getComputedStyle(td).display,
        beforeContent: getComputedStyle(td, "::before").content,
        beforeDisplay: getComputedStyle(td, "::before").display,
      }))
  );
  expect(fields.length, "campos com rótulo visível no card").toBeGreaterThanOrEqual(2);
  for (const field of fields) {
    expect(field.display, `célula "${field.label}" em bloco`).toBe("block");
    expect(field.beforeContent, `rótulo "${field.label}" exibido (::before)`).toContain(field.label);
    expect(field.beforeDisplay, `rótulo "${field.label}" em linha própria`).toBe("block");
  }
}

// Rotulo para leitor de tela: o <span class="rt-sr"> dentro da celula fica
// invisivel (1x1px, recortado) mas FORA de display:none - e continua na arvore
// de acessibilidade, ja que o thead (display:none) nao e mais lido.
export async function expectScreenReaderLabels(card: Locator) {
  const labels = await card.evaluate((row) =>
    Array.from(row.querySelectorAll(".rt-sr")).map((el) => {
      const style = getComputedStyle(el);
      return { display: style.display, position: style.position, width: style.width, height: style.height, overflow: style.overflow, clip: style.clip };
    })
  );
  expect(labels.length, "rótulos para leitor de tela (.rt-sr) no card").toBeGreaterThan(0);
  for (const label of labels) {
    expect(label.display, ".rt-sr presente na árvore de acessibilidade (não display:none)").not.toBe("none");
    expect(label, ".rt-sr só visualmente oculto").toMatchObject({ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0px, 0px, 0px, 0px)" });
  }
}

export async function expectFitsViewport(page: Page, table: Locator) {
  const box = await table.boundingBox();
  expect(box!.x + box!.width, "a tabela cabe na largura (sem rolagem lateral)").toBeLessThanOrEqual(page.viewportSize()!.width);
}

// O layout de card em si. Devolve a primeira linha (o card).
export async function expectCards(page: Page, table: Locator) {
  await expectHeaderRemoved(table);
  await expectStackedRows(table);
  const card = table.locator("tbody tr").first();
  await expect(card).toBeVisible();
  await expectCardRow(card);
  await expectFieldLabels(card);
  await expectScreenReaderLabels(card);
  await expectFitsViewport(page, table);
  return card;
}
