import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

function normalize(text) {
  return text.toLowerCase();
}

function getValue(text) {
  const match = text.match(/(\d+[.,]?\d*)/);
  return match ? Number(match[1].replace(",", ".")) : 0;
}

function detectAccount(text) {
  if (text.includes("pix")) return "Pix";
  if (text.includes("debito")) return "Débito";
  if (text.includes("dinheiro")) return "Dinheiro";
  return "Cartão";
}

function detectCategory(text) {
  if (text.includes("mercado") || text.includes("zaffari")) return "Alimentação";
  if (text.includes("uber")) return "Transporte";
  if (text.includes("farmacia")) return "Saúde";
  return "Outros";
}

function detectReimbursement(text) {
  if (text.includes("mae")) return "Mãe";
  if (text.includes("pai")) return "Pai";
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const token = req.headers["x-shortcut-token"];
  if (token !== process.env.SHORTCUT_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

  const text = normalize(body.text || "");
  const userKey = body.userKey || "theo";

  const value = getValue(text);
  const account = detectAccount(text);
  const category = detectCategory(text);
  const reimbursement = detectReimbursement(text);

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_key: userKey,
      date: new Date().toISOString().slice(0, 10),
      type: "Despesa",
      description: text,
      category: reimbursement ? "Reembolso" : category,
      account,
      value,
      reimbursement_person: reimbursement
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error });

  return res.status(200).json({ ok: true, data });
}