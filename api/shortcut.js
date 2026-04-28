import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

function removeAccents(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalize(text) {
  return removeAccents(text);
}

function getValue(text) {
  const normalizedText = String(text || "").replace(",", ".");
  const match = normalizedText.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function detectAccount(text) {
  const t = normalize(text);

  if (t.includes("pix")) return "Pix";
  if (t.includes("debito")) return "Débito";
  if (t.includes("dinheiro")) return "Dinheiro";
  if (t.includes("cartao") || t.includes("credito")) return "Cartão";

  return "Cartão";
}

function detectCategory(text) {
  const t = normalize(text);

  if (
    t.includes("almoco") ||
    t.includes("janta") ||
    t.includes("jantar") ||
    t.includes("lanche") ||
    t.includes("restaurante") ||
    t.includes("comida") ||
    t.includes("ifood") ||
    t.includes("delivery") ||
    t.includes("mercado") ||
    t.includes("supermercado") ||
    t.includes("zaffari") ||
    t.includes("padaria") ||
    t.includes("cafe") ||
    t.includes("cafeteria") ||
    t.includes("sorvete") ||
    t.includes("acai") ||
    t.includes("hamburguer") ||
    t.includes("pizza")
  ) {
    return "Alimentação";
  }

  if (
    t.includes("uber") ||
    t.includes("99") ||
    t.includes("taxi") ||
    t.includes("corrida") ||
    t.includes("combustivel") ||
    t.includes("gasolina") ||
    t.includes("estacionamento") ||
    t.includes("passagem")
  ) {
    return "Transporte";
  }

  if (
    t.includes("farmacia") ||
    t.includes("remedio") ||
    t.includes("consulta") ||
    t.includes("medico") ||
    t.includes("dentista") ||
    t.includes("exame") ||
    t.includes("hospital")
  ) {
    return "Saúde";
  }

  if (
    t.includes("cinema") ||
    t.includes("show") ||
    t.includes("bar") ||
    t.includes("festa") ||
    t.includes("ingresso") ||
    t.includes("teatro")
  ) {
    return "Lazer";
  }

  if (
    t.includes("roupa") ||
    t.includes("tenis") ||
    t.includes("sapato") ||
    t.includes("shopping") ||
    t.includes("loja")
  ) {
    return "Compras";
  }

  if (
    t.includes("aluguel") ||
    t.includes("condominio") ||
    t.includes("luz") ||
    t.includes("agua") ||
    t.includes("internet") ||
    t.includes("telefone")
  ) {
    return "Casa";
  }

  return "Outros";
}

function detectReimbursement(text) {
  const t = normalize(text);

  if (t.includes("mae")) return "Mãe";
  if (t.includes("pai")) return "Pai";
  if (t.includes("aline")) return "Aline";

  return null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Use POST",
        message: "Rota /api/shortcut existe. Use POST para registrar um gasto."
      });
    }

    const token = req.headers["x-shortcut-token"];

    if (token !== process.env.SHORTCUT_TOKEN) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized"
      });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const originalText = String(body.text || "").trim();
    const userKey = body.userKey || body.userkey || "theo";

    if (!originalText) {
      return res.status(400).json({
        ok: false,
        error: "Texto vazio. Envie o campo text."
      });
    }

    const value = getValue(originalText);

    if (!value || value <= 0) {
      return res.status(400).json({
        ok: false,
        error: "Valor não identificado no texto."
      });
    }

    const account = detectAccount(originalText);
    const detectedCategory = detectCategory(originalText);
    const reimbursement = detectReimbursement(originalText);
    const finalCategory = reimbursement ? "Reembolso" : detectedCategory;

    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_key: userKey,
        date: new Date().toISOString().slice(0, 10),
        type: "Despesa",
        description: originalText,
        category: finalCategory,
        account,
        value,
        reimbursement_person: reimbursement
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        ok: false,
        error: error.message,
        details: error
      });
    }

    return res.status(200).json({
      ok: true,
      debugText: originalText,
      debugNormalizedText: normalize(originalText),
      debugCategory: finalCategory,
      debugAccount: account,
      data
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || "Erro inesperado"
    });
  }
}