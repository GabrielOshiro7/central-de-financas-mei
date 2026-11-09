import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// Consultas da escolha de cliente da Agenda (ClientPicker): os "recentes" e a
// busca. Sempre escopadas por businessId (resolvido da sessao pela rota) e so
// com clientes ATIVOS. Nada aqui carrega a lista inteira de clientes.
export type ClientPickerOption = { id: string; name: string; tradeName: string };

export const RECENT_CLIENTS_LIMIT = 3;
export const CLIENT_SEARCH_LIMIT = 8;

// Dobra de acentos sem a extensao `unaccent` (instala-la seria migracao): o
// mesmo mapa vale para a coluna (translate no SQL) e para o termo (aqui).
// Cobre latim (pt/es/fr/de) e macrons do romaji japones (Tōkyō).
const ACCENT_PAIRS: [string, string][] = [
  ["ÁÀÂÃÄÅĀ", "A"],
  ["áàâãäåā", "a"],
  ["ÉÈÊËĒ", "E"],
  ["éèêëē", "e"],
  ["ÍÌÎÏĪ", "I"],
  ["íìîïī", "i"],
  ["ÓÒÔÕÖŌ", "O"],
  ["óòôõöō", "o"],
  ["ÚÙÛÜŪ", "U"],
  ["úùûüū", "u"],
  ["Çç", "Cc"],
  ["Ññ", "Nn"],
];
const ACCENTED = ACCENT_PAIRS.map(([from]) => from).join("");
const PLAIN = ACCENT_PAIRS.map(([from, to]) => (to.length === 1 ? to.repeat(from.length) : to)).join("");

const FOLD_MAP = new Map([...ACCENTED].map((char, index) => [char, PLAIN[index]] as const));

// Termo no mesmo formato da coluna dobrada: minusculas, sem acentos.
export function foldSearchTerm(term: string): string {
  return [...term.normalize("NFC")].map((char) => FOLD_MAP.get(char) ?? char).join("").toLowerCase();
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

type PickerRow = { id: string; name: string; tradeName: string | null };
const toOption = (row: PickerRow): ClientPickerOption => ({ id: row.id, name: row.name, tradeName: row.tradeName ?? "" });

// Os RECENTES: os 3 clientes ativos com o atendimento OU a venda registrado
// mais recentemente (data de criacao do registro); se houver menos de 3,
// completa com os ativos cadastrados mais recentemente. Uma consulta: agrega
// por cliente o ultimo registro de appointments/sales da empresa (varredura
// pelos indices por business_id) e junta com clients (indice business_id,
// active).
export async function listRecentClients(businessId: string): Promise<ClientPickerOption[]> {
  const rows = await prisma.$queryRaw<PickerRow[]>(Prisma.sql`
    WITH used AS (
      SELECT client_id, MAX(created_at) AS last_used
      FROM (
        SELECT client_id, created_at FROM appointments WHERE business_id = ${businessId}
        UNION ALL
        SELECT client_id, created_at FROM sales WHERE business_id = ${businessId}
      ) registros
      GROUP BY client_id
    )
    SELECT c.id, c.name, c.trade_name AS "tradeName"
    FROM clients c
    LEFT JOIN used ON used.client_id = c.id
    WHERE c.business_id = ${businessId} AND c.active
    ORDER BY used.last_used DESC NULLS LAST, c.created_at DESC, c.id ASC
    LIMIT ${RECENT_CLIENTS_LIMIT}
  `);
  return rows.map(toOption);
}

// A BUSCA: ate 8 clientes ativos cujo nome ou nome fantasia contem o termo,
// ignorando maiusculas e acentos; quem COMECA com o termo vem primeiro.
export async function searchClientsForPicker(businessId: string, term: string): Promise<ClientPickerOption[]> {
  const folded = foldSearchTerm(term.trim());
  if (!folded) return [];
  const contains = `%${escapeLike(folded)}%`;
  const startsWith = `${escapeLike(folded)}%`;

  const rows = await prisma.$queryRaw<PickerRow[]>(Prisma.sql`
    SELECT c.id, c.name, c.trade_name AS "tradeName"
    FROM clients c
    WHERE c.business_id = ${businessId} AND c.active
      AND (
        lower(translate(c.name, ${ACCENTED}, ${PLAIN})) LIKE ${contains} ESCAPE '\\'
        OR lower(translate(coalesce(c.trade_name, ''), ${ACCENTED}, ${PLAIN})) LIKE ${contains} ESCAPE '\\'
      )
    ORDER BY (lower(translate(c.name, ${ACCENTED}, ${PLAIN})) LIKE ${startsWith} ESCAPE '\\') DESC, c.name ASC, c.id ASC
    LIMIT ${CLIENT_SEARCH_LIMIT}
  `);
  return rows.map(toOption);
}

// Cliente ja escolhido (prefill e edicao): da empresa, ativo ou nao - o
// agendamento mostra o cliente dele mesmo se foi inativado depois.
export async function getClientPickerOption(businessId: string, id: string): Promise<ClientPickerOption | null> {
  const client = await prisma.client.findFirst({ where: { id, businessId }, select: { id: true, name: true, tradeName: true } });
  return client ? toOption(client) : null;
}
