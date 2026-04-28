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

function isCoupleExpense(text) {
  const t = normalize(text);

  const hasSplitWord =
    t.includes("dividido") ||
    t.includes("dividir") ||
    t.includes("divisao") ||
    t.includes("rachado") ||
    t.includes("rachada") ||
    t.includes("rachar") ||
    t.includes("rateado") ||
    t.includes("rateada") ||
    t.includes("ratear") ||
    t.includes("meio a meio") ||
    t.includes("metade") ||
    t.includes("50/50") ||
    t.includes("casal");

  const hasPaymentExpression =
    t.includes("pago por mim") ||
    t.includes("paguei") ||
    t.includes("pago por theo") ||
    t.includes("pago pelo theo") ||
    t.includes("pago por aline") ||
    t.includes("pago pela aline");

  return (
    hasSplitWord ||
    (hasPaymentExpression && (t.includes("com theo") || t.includes("com aline")))
  );
}

function detectPaidBy(text, userKey) {
  const t = normalize(text);

  if (t.includes("pago por mim") || t.includes("paguei")) {
    return userKey;
  }

  if (t.includes("pago por theo") || t.includes("pago pelo theo")) {
    return "theo";
  }

  if (t.includes("pago por aline") || t.includes("pago pela aline")) {
    return "aline";
  }

  return userKey;
}

function parseSettlement(text, value) {
  const t = normalize(text);

  const theoOwesAline =
    t.includes("theo deve") &&
    (t.includes("para aline") || t.includes("pra aline") || t.includes("a aline"));

  const alineOwesTheo =
    t.includes("aline deve") &&
    (t.includes("para theo") || t.includes("pra theo") || t.includes("ao theo"));

  const theoPaidAline =
    t.includes("theo pagou") &&
    (t.includes("para aline") || t.includes("pra aline") || t.includes("a aline"));

  const alinePaidTheo =
    t.includes("aline pagou") &&
    (t.includes("para theo") || t.includes("pra theo") || t.includes("ao theo"));

  if (theoOwesAline) {
    return {
      kind: "debt",
      paidBy: "Aline",
      theoShare: value,
      alineShare: 0
    };
  }

  if (alineOwesTheo) {
    return {
      kind: "debt",
      paidBy: "Theo",
      theoShare: 0,
      alineShare: value
    };
  }

  if (theoPaidAline) {
    return {
      kind: "payment",
      paidBy: "Theo",
      theoShare: 0,
      alineShare: value
    };
  }

  if (alinePaidTheo) {
    return {
      kind: "payment",
      paidBy: "Aline",
      theoShare: value,
      alineShare: 0
    };
  }

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
    const today = new Date().toISOString().slice(0, 10);

    const settlement = parseSettlement(originalText, value);

    if (settlement) {
      const { data, error } = await supabase
        .from("couple_expenses")
        .insert({
          date: today,
          description: originalText,
          category: "Reembolso",
          paid_by: settlement.paidBy,
          total: value,
          theo_share: settlement.theoShare,
          aline_share: settlement.alineShare,
          split_type: "Acerto"
        })
        .select()
        .single();

      if (error) {
        return res.status(400).json({
          ok: false,
          table: "couple_expenses",
          error: error.message,
          details: error
        });
      }

      return res.status(200).json({
        ok: true,
        version: "atalho-v4-acertos",
        table: "couple_expenses",
        kind: settlement.kind,
        debugText: originalText,
        debugNormalizedText: normalize(originalText),
        debugPaidBy: settlement.paidBy,
        debugTheoShare: settlement.theoShare,
        debugAlineShare: settlement.alineShare,
        data
      });
    }

    if (isCoupleExpense(originalText)) {
      const paidBy = detectPaidBy(originalText, userKey);

      const { data, error } = await supabase
        .from("couple_expenses")
        .insert({
          date: today,
          description: originalText,
          category: finalCategory,
          paid_by: paidBy,
          total: value,
          theo_share: value / 2,
          aline_share: value / 2,
          split_type: "50/50"
        })
        .select()
        .single();

      if (error) {
        return res.status(400).json({
          ok: false,
          table: "couple_expenses",
          error: error.message,
          details: error
        });
      }

      return res.status(200).json({
        ok: true,
        version: "atalho-v4-acertos",
        table: "couple_expenses",
        kind: "couple_expense",
        debugText: originalText,
        debugNormalizedText: normalize(originalText),
        debugCategory: finalCategory,
        debugPaidBy: paidBy,
        data
      });
    }

    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_key: userKey,
        date: today,
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
        table: "transactions",
        error: error.message,
        details: error
      });
    }

    return res.status(200).json({
      ok: true,
      version: "atalho-v4-acertos",
      table: "transactions",
      kind: "personal_transaction",
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