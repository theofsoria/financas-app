import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const PEOPLE = ["Theo", "Aline"];
const COLORS = ["#7c3aed", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#64748b", "#ec4899"];

const categoryRules = [
  { category: "Alimentação", words: ["ifood", "mercado", "zaffari", "padaria", "restaurante", "cafe", "lanche", "supermercado", "jantar", "almoco", "delivery", "comida", "pizza", "sushi", "rappi"] },
  { category: "Transporte", words: ["uber", "99", "gasolina", "posto", "estacionamento", "pedagio", "taxi", "onibus", "metro", "corrida", "combustivel"] },
  { category: "Moradia", words: ["aluguel", "condominio", "luz", "agua", "internet", "energia", "ceee", "dmae", "claro", "vivo", "tim"] },
  { category: "Saúde", words: ["farmacia", "medico", "consulta", "exame", "remedio", "panvel", "drogaria", "dentista", "hospital", "laboratorio"] },
  { category: "Lazer", words: ["bar", "cinema", "show", "viagem", "hotel", "festa", "ingresso", "balada", "cerveja", "drink"] },
  { category: "Compras", words: ["amazon", "mercado livre", "magalu", "shein", "roupa", "tenis", "shopping", "loja", "presente"] },
  { category: "Educação", words: ["curso", "faculdade", "livro", "aula", "escola", "prova", "mentoria"] },
  { category: "Assinaturas", words: ["netflix", "spotify", "youtube", "icloud", "openai", "chatgpt", "prime", "assinatura"] },
  { category: "Trabalho", words: ["cliente", "servico", "freela", "projeto", "nota", "salario", "recebimento", "dna", "empresa", "trabalho", "pagamento", "honorario"] },
  { category: "Casal", words: ["casal", "aline", "theo", "namorada", "namorado", "split", "dividir", "rachado", "rachada"] },
  { category: "Reembolso", words: ["reembolso", "mae", "pai"] }
];

function brl(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function monthKey(date) {
  return String(date || "").slice(0, 7);
}

function monthLabel(key) {
  if (!key || key.length < 7) return "";
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const year = key.slice(0, 4);
  const month = Number(key.slice(5, 7));
  return (names[month - 1] || key) + "/" + year;
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replaceAll("á", "a")
    .replaceAll("à", "a")
    .replaceAll("ã", "a")
    .replaceAll("â", "a")
    .replaceAll("é", "e")
    .replaceAll("ê", "e")
    .replaceAll("í", "i")
    .replaceAll("ó", "o")
    .replaceAll("ô", "o")
    .replaceAll("õ", "o")
    .replaceAll("ú", "u")
    .replaceAll("ç", "c");
}

function inferCategory(text) {
  const normalized = normalizeText(text);
  const explicitCategory = normalized.match(/categoria ([a-z0-9 ]+)/);
  if (explicitCategory && explicitCategory[1]) {
    const raw = explicitCategory[1].trim();
    const known = categoryRules.find((rule) => normalizeText(rule.category) === raw);
    if (known) return known.category;
  }
  const found = categoryRules.find((rule) => rule.words.some((word) => normalized.includes(normalizeText(word))));
  return found ? found.category : "Outros";
}

function parseMoney(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  let cleaned = "";
  for (const char of raw) {
    if ("0123456789,.-".includes(char)) cleaned += char;
  }
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let normalized = cleaned;
  if (hasComma && hasDot) normalized = cleaned.split(".").join("").replace(",", ".");
  else if (hasComma) normalized = cleaned.replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function getFirstMoneyFromText(text) {
  const parts = String(text || "").split(" ");
  for (const part of parts) {
    const number = parseMoney(part);
    if (number > 0) return number;
  }
  return 0;
}

function detectAccount(text, isIncome) {
  const lower = normalizeText(text);
  if (lower.includes("pix")) return "Pix";
  if (lower.includes("dinheiro") || lower.includes("cash")) return "Dinheiro";
  if (lower.includes("debito")) return "Débito";
  if (lower.includes("credito") || lower.includes("cartao") || lower.includes("visa") || lower.includes("master")) return "Cartão";
  if (lower.includes("pj") || lower.includes("empresa")) return "Conta PJ";
  if (isIncome) return "Conta";
  return "Cartão";
}

function getFamilyReimbursementPerson(text) {
  const lower = normalizeText(text);
  if (lower.includes("mae")) return "Mãe";
  if (lower.includes("pai")) return "Pai";
  return "";
}

function getPaidBy(text, fallback = "Theo") {
  const lower = normalizeText(text);
  if (lower.includes("aline")) return "Aline";
  if (lower.includes("theo")) return "Theo";
  return fallback;
}

function getUserNameFromEmail(email) {
  const lower = normalizeText(email || "");
  if (lower.includes("aline")) return "Aline";
  return "Theo";
}

function getUserKeyFromEmail(email) {
  return getUserNameFromEmail(email).toLowerCase();
}

function parseSplitFromText(text, total, paidBy) {
  const lower = normalizeText(text);
  const parts = lower.split(" ");
  const ratio = parts.find((part) => part.includes("/") && part.split("/").length === 2);
  if (ratio) {
    const items = ratio.split("/");
    const first = Number(items[0]);
    const second = Number(items[1]);
    const sum = first + second;
    if (sum > 0) {
      if (paidBy === "Theo") return { splitType: "Percentual", theoShare: total * (first / sum), alineShare: total * (second / sum) };
      return { splitType: "Percentual", theoShare: total * (second / sum), alineShare: total * (first / sum) };
    }
  }
  return { splitType: "Igual", theoShare: total / 2, alineShare: total / 2 };
}

function parseQuickEntry(text, fallbackPaidBy = "Theo") {
  const lower = normalizeText(text);
  const value = getFirstMoneyFromText(text);
  const isCouple = lower.includes("aline") || lower.includes("theo") || lower.includes("casal") || lower.includes("split") || lower.includes("dividir") || lower.includes("namorada") || lower.includes("namorado");
  const isIncome = lower.includes("recebi") || lower.includes("recebimento") || lower.includes("ganhei") || lower.includes("entrada") || lower.includes("receita") || lower.includes("salario") || lower.includes("pagamento recebido") || lower.includes("deposito");
  const familyReimbursement = getFamilyReimbursementPerson(text);

  let type = isIncome ? "Receita" : "Despesa";
  let category = inferCategory(text);

  if (isIncome && !familyReimbursement) category = "Trabalho";
  if (familyReimbursement) {
    type = "Despesa";
    category = "Reembolso";
  }

  const account = detectAccount(text, isIncome);
  const paidBy = getPaidBy(text, fallbackPaidBy);
  const split = parseSplitFromText(text, value, paidBy);
  return { value, type, category, account, isCouple, paidBy, familyReimbursement, ...split };
}

function calculateCoupleBalance(expenses) {
  return expenses.reduce((balance, expense) => {
    if (expense.paidBy === "Theo") return balance + Number(expense.alineShare || 0);
    return balance - Number(expense.theoShare || 0);
  }, 0);
}

function getBalanceText(balance) {
  if (balance > 0) return "Aline deve " + brl(balance) + " para Theo";
  if (balance < 0) return "Theo deve " + brl(Math.abs(balance)) + " para Aline";
  return "Tudo zerado entre Theo e Aline";
}

function getPersonalTotals(transactions) {
  const income = transactions.filter((t) => t.type === "Receita").reduce((sum, t) => sum + Number(t.value || 0), 0);
  const expense = transactions.filter((t) => t.type === "Despesa").reduce((sum, t) => sum + Number(t.value || 0), 0);
  const pixExpense = transactions.filter((t) => t.type === "Despesa" && t.account === "Pix").reduce((sum, t) => sum + Number(t.value || 0), 0);
  const debitExpense = transactions.filter((t) => t.type === "Despesa" && t.account === "Débito").reduce((sum, t) => sum + Number(t.value || 0), 0);
  const cashExpense = transactions.filter((t) => t.type === "Despesa" && t.account === "Dinheiro").reduce((sum, t) => sum + Number(t.value || 0), 0);
  const cardExpense = transactions.filter((t) => t.type === "Despesa" && t.account === "Cartão").reduce((sum, t) => sum + Number(t.value || 0), 0);
  const momReimbursement = transactions.filter((t) => t.type === "Despesa" && t.reimbursementPerson === "Mãe").reduce((sum, t) => sum + Number(t.value || 0), 0);
  const dadReimbursement = transactions.filter((t) => t.type === "Despesa" && t.reimbursementPerson === "Pai").reduce((sum, t) => sum + Number(t.value || 0), 0);
  const familyReimbursement = momReimbursement + dadReimbursement;
  return { income, expense, balance: income - expense, pixExpense, debitExpense, cashExpense, cardExpense, momReimbursement, dadReimbursement, familyReimbursement };
}

function getCreditCardDueLabel(month) {
  if (!month || month.length < 7) return "Vence dia 10";
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextYear = monthNumber === 12 ? year + 1 : year;
  return "Fatura estimada com vencimento em 10/" + String(nextMonth).padStart(2, "0") + "/" + nextYear;
}

function getCoupleTotals(expenses) {
  const total = expenses.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const theoPaid = expenses.filter((item) => item.paidBy === "Theo").reduce((sum, item) => sum + Number(item.total || 0), 0);
  const alinePaid = expenses.filter((item) => item.paidBy === "Aline").reduce((sum, item) => sum + Number(item.total || 0), 0);
  const theoShare = expenses.reduce((sum, item) => sum + Number(item.theoShare || 0), 0);
  const alineShare = expenses.reduce((sum, item) => sum + Number(item.alineShare || 0), 0);
  return { total, theoPaid, alinePaid, theoShare, alineShare };
}

function PieChart({ data }) {
  const total = data.reduce((sum, d) => sum + Number(d.value || 0), 0);
  if (!total) return <p className="text-sm text-slate-400">Sem dados para exibir.</p>;
  let cumulative = 0;
  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 items-center">
      <div className="relative flex items-center justify-center">
        <svg width="178" height="178" viewBox="0 0 32 32" className="drop-shadow-sm -rotate-90 rounded-full">
          {data.map((d, i) => {
            const value = Number(d.value || 0) / total;
            const start = cumulative;
            cumulative += value;
            const x1 = 16 + 16 * Math.cos(2 * Math.PI * start);
            const y1 = 16 + 16 * Math.sin(2 * Math.PI * start);
            const x2 = 16 + 16 * Math.cos(2 * Math.PI * cumulative);
            const y2 = 16 + 16 * Math.sin(2 * Math.PI * cumulative);
            const largeArc = value > 0.5 ? 1 : 0;
            const path = "M16 16 L" + x1 + " " + y1 + " A16 16 0 " + largeArc + " 1 " + x2 + " " + y2 + " Z";
            return <path key={d.name} d={path} fill={COLORS[i % COLORS.length]} />;
          })}
          <circle cx="16" cy="16" r="8" fill="white" />
        </svg>
        <div className="absolute text-center">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Total</p>
          <p className="text-sm font-bold text-slate-900">{brl(total)}</p>
        </div>
      </div>
      <div className="space-y-3">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
            <span className="flex items-center gap-2 min-w-0">
              <span className="h-3 w-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="text-sm font-medium truncate">{d.name}</span>
            </span>
            <span className="text-right text-sm font-semibold whitespace-nowrap">{Math.round((Number(d.value || 0) / total) * 100)}% · {brl(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ children, className = "" }) {
  return <div className={"rounded-[28px] bg-white/90 shadow-sm ring-1 ring-black/5 p-5 " + className}>{children}</div>;
}

function StatCard({ label, value, icon, dark = false }) {
  return (
    <div className={(dark ? "bg-slate-950 text-white" : "bg-white text-slate-950 ring-1 ring-black/5") + " rounded-[28px] p-5 shadow-sm"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={(dark ? "text-white/60" : "text-slate-500") + " text-xs font-medium"}>{label}</p>
          <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
        </div>
        <span className={(dark ? "bg-white/10" : "bg-slate-100") + " inline-flex h-10 w-10 items-center justify-center rounded-2xl"}>{icon}</span>
      </div>
    </div>
  );
}

function Input(props) {
  return <input {...props} className={"w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 " + (props.className || "")} />;
}

function Select(props) {
  return <select {...props} className={"w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 " + (props.className || "")} />;
}

function Button({ children, className = "", variant = "primary", ...props }) {
  const styles = variant === "secondary" ? "bg-white text-slate-900 ring-1 ring-black/10 hover:bg-slate-50" : "bg-violet-600 text-white hover:bg-violet-700 shadow-sm shadow-violet-200";
  return <button {...props} className={"rounded-2xl px-4 py-3 text-sm font-bold active:scale-[0.99] disabled:opacity-40 " + styles + " " + className}>{children}</button>;
}

function SectionTitle({ title, subtitle }) {
  return (
    <div>
      <h2 className="text-lg font-black tracking-tight text-slate-950">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

export default function ControleFinanceiroApp() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState("Casal");
  const [activeMonth, setActiveMonth] = useState("2026-04");
  const [closedMonths, setClosedMonths] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [coupleExpenses, setCoupleExpenses] = useState([]);
  const [quickText, setQuickText] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ date: "2026-04-27", type: "Despesa", description: "", category: "Outros", account: "Cartão", value: "" });
  const [coupleForm, setCoupleForm] = useState({ date: "2026-04-27", description: "", category: "Alimentação", paidBy: "Theo", total: "", splitType: "Igual", theoShare: "", alineShare: "" });

  const currentUserId = user ? getUserKeyFromEmail(user.email) : "theo";
  const currentUserName = user ? getUserNameFromEmail(user.email) : "Theo";
  const currentMonthIsClosed = Boolean(closedMonths[activeMonth]);

  useEffect(() => {
    async function initAuth() {
      const { data } = await supabase.auth.getSession();
      setUser(data.session?.user || null);
      setAuthLoading(false);
    }

    initAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    loadSupabaseData();

    const channel = supabase
      .channel("finance-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => loadSupabaseData())
      .on("postgres_changes", { event: "*", schema: "public", table: "couple_expenses" }, () => loadSupabaseData())
      .subscribe((status) => console.log("REALTIME STATUS:", status));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  async function loadSupabaseData() {
    const { data: transactionData, error: transactionError } = await supabase.from("transactions").select("*").order("date", { ascending: false });
    const { data: coupleData, error: coupleError } = await supabase.from("couple_expenses").select("*").order("date", { ascending: false });

    if (transactionError || coupleError) {
      console.log("SUPABASE LOAD ERROR", transactionError, coupleError);
      setMessage("Erro ao carregar dados do Supabase.");
      return;
    }

    setTransactions((transactionData || []).map((item) => ({
      id: item.id,
      userId: item.user_key || "theo",
      date: item.date,
      type: item.type,
      description: item.description,
      category: item.category,
      account: item.account,
      value: Number(item.value || 0),
      reimbursementPerson: item.reimbursement_person || ""
    })));

    setCoupleExpenses((coupleData || []).map((item) => ({
      id: item.id,
      date: item.date,
      description: item.description,
      category: item.category,
      paidBy: item.paid_by,
      total: Number(item.total || 0),
      splitType: item.split_type || "Igual",
      theoShare: Number(item.theo_share || 0),
      alineShare: Number(item.aline_share || 0)
    })));
  }

  const monthTransactions = useMemo(() => transactions.filter((t) => t.userId === currentUserId && monthKey(t.date) === activeMonth), [transactions, activeMonth, currentUserId]);
  const monthCoupleExpenses = useMemo(() => coupleExpenses.filter((t) => monthKey(t.date) === activeMonth), [coupleExpenses, activeMonth]);
  const personalTotals = useMemo(() => getPersonalTotals(monthTransactions), [monthTransactions]);
  const coupleTotals = useMemo(() => getCoupleTotals(monthCoupleExpenses), [monthCoupleExpenses]);
  const coupleBalance = useMemo(() => calculateCoupleBalance(monthCoupleExpenses), [monthCoupleExpenses]);

  const byCategory = useMemo(() => {
    const source = activeTab === "Casal" ? monthCoupleExpenses.map((item) => ({ category: item.category, value: item.total })) : monthTransactions.filter((t) => t.type === "Despesa");
    const map = {};
    source.forEach((t) => {
      map[t.category] = (map[t.category] || 0) + Number(t.value || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => Number(b.value) - Number(a.value));
  }, [activeTab, monthCoupleExpenses, monthTransactions]);

  const personalByPayment = useMemo(() => {
    const expenses = monthTransactions.filter((t) => t.type === "Despesa");
    const map = {};
    expenses.forEach((t) => {
      const key = t.account || "Outros";
      map[key] = (map[key] || 0) + Number(t.value || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => Number(b.value) - Number(a.value));
  }, [monthTransactions]);

  const familyReimbursements = useMemo(() => monthTransactions.filter((t) => t.type === "Despesa" && t.reimbursementPerson).map((t) => ({ ...t, value: Number(t.value || 0) })), [monthTransactions]);
  const filteredTransactions = monthTransactions.filter((t) => (t.description + " " + t.category + " " + t.account + " " + t.type).toLowerCase().includes(search.toLowerCase()));
  const filteredCoupleExpenses = monthCoupleExpenses.filter((t) => (t.description + " " + t.category + " " + t.paidBy + " " + t.splitType).toLowerCase().includes(search.toLowerCase()));

  const annualRows = useMemo(() => {
    const months = Array.from(new Set([...transactions.map((t) => monthKey(t.date)), ...coupleExpenses.map((t) => monthKey(t.date)), activeMonth])).sort();
    return months.map((key) => {
      const pt = getPersonalTotals(transactions.filter((t) => t.userId === currentUserId && monthKey(t.date) === key));
      const ce = coupleExpenses.filter((t) => monthKey(t.date) === key);
      const ct = getCoupleTotals(ce);
      const cb = calculateCoupleBalance(ce);
      return { key, personalExpense: pt.expense, personalIncome: pt.income, coupleTotal: ct.total, coupleBalance: cb, theoPaid: ct.theoPaid, alinePaid: ct.alinePaid, closed: Boolean(closedMonths[key]) };
    });
  }, [transactions, coupleExpenses, closedMonths, activeMonth, currentUserId]);

  async function handleLogin() {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage("Erro no login: confira e-mail e senha.");
      return;
    }
    setUser(data.user);
    setMessage("");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setTransactions([]);
    setCoupleExpenses([]);
  }

  function guardClosedMonth(date) {
    if (closedMonths[monthKey(date)]) {
      setMessage("Este mês está fechado. Reabra ou escolha outro mês antes de alterar.");
      return false;
    }
    return true;
  }

  function closeMonth() {
    if (closedMonths[activeMonth]) {
      setMessage("Mês já está fechado.");
      return;
    }
    setClosedMonths((prev) => ({ ...prev, [activeMonth]: true }));
    setMessage("Mês fechado com sucesso: " + monthLabel(activeMonth) + ".");
  }

  function reopenMonth() {
    setClosedMonths((prev) => ({ ...prev, [activeMonth]: false }));
    setMessage("Mês reaberto: " + monthLabel(activeMonth) + ".");
  }

  async function addPersonalTransaction(data) {
    const value = parseMoney(data.value);
    if (!data.description || !value) {
      setMessage("Preencha uma descrição e um valor válido.");
      return false;
    }
    if (!guardClosedMonth(data.date)) return false;

    const { data: inserted, error } = await supabase
      .from("transactions")
      .insert({
        user_key: currentUserId,
        date: data.date,
        type: data.type,
        description: data.description,
        category: data.category,
        account: data.account,
        value,
        reimbursement_person: data.reimbursementPerson || null
      })
      .select()
      .single();

    if (error) {
      console.log("SUPABASE INSERT TRANSACTION ERROR", error);
      setMessage("Erro ao salvar lançamento pessoal.");
      return false;
    }

    setTransactions((prev) => [{
      id: inserted.id,
      userId: inserted.user_key,
      date: inserted.date,
      type: inserted.type,
      description: inserted.description,
      category: inserted.category,
      account: inserted.account,
      value: Number(inserted.value || 0),
      reimbursementPerson: inserted.reimbursement_person || ""
    }, ...prev]);

    setMessage("Lançamento pessoal salvo para " + currentUserName + ".");
    return true;
  }

  async function addCoupleExpense(data) {
    const total = parseMoney(data.total);
    if (!data.description || !total) {
      setMessage("Preencha uma descrição e um valor válido para o casal.");
      return false;
    }
    if (!guardClosedMonth(data.date)) return false;

    let theoShare = parseMoney(data.theoShare);
    let alineShare = parseMoney(data.alineShare);
    const splitType = data.splitType || "Igual";
    if (splitType === "Igual") {
      theoShare = total / 2;
      alineShare = total / 2;
    }
    if (splitType === "Personalizada" && Math.round((theoShare + alineShare) * 100) !== Math.round(total * 100)) {
      setMessage("Na divisão personalizada, Theo + Aline precisa fechar o valor total.");
      return false;
    }

    const { data: inserted, error } = await supabase
      .from("couple_expenses")
      .insert({
        date: data.date,
        description: data.description,
        category: data.category,
        paid_by: data.paidBy,
        total,
        theo_share: theoShare,
        aline_share: alineShare,
        split_type: splitType
      })
      .select()
      .single();

    if (error) {
      console.log("SUPABASE INSERT COUPLE ERROR", error);
      setMessage("Erro ao salvar despesa do casal.");
      return false;
    }

    setCoupleExpenses((prev) => [{
      id: inserted.id,
      date: inserted.date,
      description: inserted.description,
      category: inserted.category,
      paidBy: inserted.paid_by,
      total: Number(inserted.total || 0),
      theoShare: Number(inserted.theo_share || 0),
      alineShare: Number(inserted.aline_share || 0),
      splitType: inserted.split_type || "Igual"
    }, ...prev]);

    setMessage("Despesa do casal salva.");
    return true;
  }

  async function handleQuickAdd() {
    const parsed = parseQuickEntry(quickText, currentUserName);
    const date = activeMonth + "-27";
    if (parsed.isCouple) {
      const saved = await addCoupleExpense({ date, description: quickText, category: parsed.category === "Casal" ? "Alimentação" : parsed.category, paidBy: parsed.paidBy, total: parsed.value, splitType: parsed.splitType, theoShare: parsed.theoShare, alineShare: parsed.alineShare });
      if (saved) {
        setQuickText("");
        setActiveTab("Casal");
      }
      return;
    }
    const saved = await addPersonalTransaction({ date, type: parsed.type, description: quickText, category: parsed.familyReimbursement ? "Reembolso" : parsed.category, account: parsed.account, value: parsed.value, reimbursementPerson: parsed.familyReimbursement });
    if (saved) setQuickText("");
  }

  async function handleManualAdd() {
    const saved = await addPersonalTransaction(form);
    if (saved) setForm({ ...form, description: "", value: "", category: "Outros" });
  }

  async function handleCoupleManualAdd() {
    const saved = await addCoupleExpense(coupleForm);
    if (saved) setCoupleForm({ ...coupleForm, description: "", total: "", splitType: "Igual", theoShare: "", alineShare: "" });
  }

  async function settleBalance() {
    if (currentMonthIsClosed) {
      setMessage("Este mês está fechado. Reabra para registrar acerto.");
      return;
    }
    if (coupleBalance === 0) {
      setMessage("O saldo do casal já está zerado.");
      return;
    }
    const payer = coupleBalance > 0 ? "Aline" : "Theo";
    const receiver = coupleBalance > 0 ? "Theo" : "Aline";
    const amount = Math.abs(coupleBalance);
    await addCoupleExpense({ date: activeMonth + "-28", description: "Acerto: " + payer + " pagou " + receiver, category: "Reembolso", paidBy: payer, total: amount, splitType: "Acerto", theoShare: payer === "Aline" ? amount : 0, alineShare: payer === "Theo" ? amount : 0 });
  }

  async function removePersonalTransaction(item) {
    if (!guardClosedMonth(item.date)) return;
    const { error } = await supabase.from("transactions").delete().eq("id", item.id);
    if (error) {
      setMessage("Erro ao remover lançamento pessoal.");
      return;
    }
    setTransactions((prev) => prev.filter((t) => t.id !== item.id));
    setMessage("Lançamento pessoal removido.");
  }

  async function removeCoupleExpense(item) {
    if (!guardClosedMonth(item.date)) return;
    const { error } = await supabase.from("couple_expenses").delete().eq("id", item.id);
    if (error) {
      setMessage("Erro ao remover despesa do casal.");
      return;
    }
    setCoupleExpenses((prev) => prev.filter((t) => t.id !== item.id));
    setMessage("Despesa do casal removida.");
  }

  function syncFormMonth(nextMonth) {
    setActiveMonth(nextMonth);
    setForm((prev) => ({ ...prev, date: nextMonth + "-27" }));
    setCoupleForm((prev) => ({ ...prev, date: nextMonth + "-27" }));
  }

  if (authLoading) {
    return <div className="min-h-screen bg-slate-100 p-6 text-slate-900">Carregando...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-100 p-4 md:p-8 text-slate-900">
        <div className="mx-auto max-w-md space-y-4">
          <div className="rounded-[36px] bg-slate-950 p-8 text-white shadow-xl">
            <p className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-violet-100 ring-1 ring-white/10">Theo & Aline</p>
            <h1 className="text-4xl font-black tracking-tight">Entrar</h1>
            <p className="mt-3 text-sm text-white/60">A aba pessoal é privada por usuário. A aba casal é compartilhada.</p>
          </div>

          {message ? <div className="rounded-3xl bg-slate-950 px-5 py-4 text-sm font-medium text-white shadow-sm">{message}</div> : null}

          <Card>
            <div className="space-y-3">
              <Input placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button type="button" onClick={handleLogin} className="w-full">Entrar</Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-[36px] bg-slate-950 p-6 text-white shadow-xl shadow-violet-100 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-violet-100 ring-1 ring-white/10">Logado como {currentUserName}</p>
              <h1 className="text-4xl font-black tracking-tight md:text-5xl">Finanças sem planilha.</h1>
              <p className="mt-3 max-w-2xl text-sm text-white/60">Pessoal privado + casal compartilhado com Supabase.</p>
            </div>
            <Button type="button" className="bg-white text-slate-950 hover:bg-violet-50 shadow-none" onClick={handleLogout}>Sair</Button>
          </div>
        </div>

        <Card>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <SectionTitle title="Competência" subtitle="Escolha o mês de trabalho e feche quando terminar." />
              <p className="mt-2 text-sm font-bold text-slate-700">Status: {currentMonthIsClosed ? "Fechado" : "Aberto"}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
              <Input type="month" value={activeMonth} onChange={(e) => syncFormMonth(e.target.value)} className="w-full min-w-0" />
              {currentMonthIsClosed ? <Button type="button" variant="secondary" onClick={reopenMonth} className="w-full sm:w-auto">Reabrir mês</Button> : <Button type="button" onClick={closeMonth} className="w-full sm:w-auto">Fechar mês</Button>}
            </div>
          </div>
        </Card>

        <div className="sticky top-3 z-10 rounded-[24px] bg-white/70 p-2 shadow-sm ring-1 ring-black/5 backdrop-blur">
          <div className="grid grid-cols-3 gap-2">
            <Button type="button" variant={activeTab === "Casal" ? "primary" : "secondary"} onClick={() => setActiveTab("Casal")}>Casal</Button>
            <Button type="button" variant={activeTab === "Pessoal" ? "primary" : "secondary"} onClick={() => setActiveTab("Pessoal")}>Pessoal</Button>
            <Button type="button" variant={activeTab === "Anual" ? "primary" : "secondary"} onClick={() => setActiveTab("Anual")}>Anual</Button>
          </div>
        </div>

        {message ? <div className="rounded-3xl bg-slate-950 px-5 py-4 text-sm font-medium text-white shadow-sm">{message}</div> : null}

        {activeTab !== "Anual" ? (
          <Card className="bg-white/80 backdrop-blur">
            <SectionTitle title="Lançamento inteligente" subtitle="Ex: recebimento DNA 3000 reais / jantar 120 pago pelo Theo / 120 zaffari para mãe" />
            <div className="mt-4 flex flex-col gap-3 md:flex-row">
              <Input value={quickText} onChange={(e) => setQuickText(e.target.value)} placeholder="Digite o lançamento" />
              <Button onClick={handleQuickAdd} type="button" className="md:w-44" disabled={currentMonthIsClosed}>Adicionar</Button>
            </div>
          </Card>
        ) : null}

        {activeTab === "Casal" ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <StatCard dark label="Saldo do casal" value={getBalanceText(coupleBalance)} icon="🤝" />
              <StatCard label="Total compartilhado" value={brl(coupleTotals.total)} icon="Σ" />
              <StatCard label="Pago por Theo" value={brl(coupleTotals.theoPaid)} icon="T" />
              <StatCard label="Pago por Aline" value={brl(coupleTotals.alinePaid)} icon="A" />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
              <Card className="lg:col-span-2">
                <SectionTitle title="Nova despesa do casal" subtitle="Use 50/50 ou personalize a parte de cada um." />
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Input type="date" value={coupleForm.date} onChange={(e) => setCoupleForm({ ...coupleForm, date: e.target.value })} />
                  <Select value={coupleForm.paidBy} onChange={(e) => setCoupleForm({ ...coupleForm, paidBy: e.target.value })}>{PEOPLE.map((person) => <option key={person}>{person}</option>)}</Select>
                  <Input placeholder="Descrição" value={coupleForm.description} onChange={(e) => setCoupleForm({ ...coupleForm, description: e.target.value, category: inferCategory(e.target.value) })} className="col-span-2" />
                  <Input placeholder="Valor total" value={coupleForm.total} onChange={(e) => setCoupleForm({ ...coupleForm, total: e.target.value })} />
                  <Input placeholder="Categoria" value={coupleForm.category} onChange={(e) => setCoupleForm({ ...coupleForm, category: e.target.value })} />
                  <Select value={coupleForm.splitType} onChange={(e) => setCoupleForm({ ...coupleForm, splitType: e.target.value })} className="col-span-2"><option>Igual</option><option>Personalizada</option></Select>
                  {coupleForm.splitType === "Personalizada" ? <><Input placeholder="Parte Theo" value={coupleForm.theoShare} onChange={(e) => setCoupleForm({ ...coupleForm, theoShare: e.target.value })} /><Input placeholder="Parte Aline" value={coupleForm.alineShare} onChange={(e) => setCoupleForm({ ...coupleForm, alineShare: e.target.value })} /></> : null}
                </div>
                <div className="mt-4 grid gap-3"><Button onClick={handleCoupleManualAdd} type="button" disabled={currentMonthIsClosed}>Salvar despesa</Button><Button onClick={settleBalance} variant="secondary" type="button" disabled={currentMonthIsClosed}>Registrar acerto e zerar saldo</Button></div>
              </Card>

              <Card className="lg:col-span-3">
                <SectionTitle title={"Gastos do casal em " + monthLabel(activeMonth)} subtitle="Distribuição proporcional do mês." />
                <div className="mt-5"><PieChart data={byCategory} /></div>
                <div className="mt-6 grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-3xl bg-violet-50 p-4"><p className="text-xs font-bold text-violet-500">Parte Theo</p><p className="mt-1 text-lg font-black">{brl(coupleTotals.theoShare)}</p></div>
                  <div className="rounded-3xl bg-cyan-50 p-4"><p className="text-xs font-bold text-cyan-500">Parte Aline</p><p className="mt-1 text-lg font-black">{brl(coupleTotals.alineShare)}</p></div>
                </div>
              </Card>
            </div>

            <Card>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><SectionTitle title="Histórico do casal" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar" className="md:max-w-xs" /></div>
              <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-slate-400"><th className="py-3">Data</th><th>Descrição</th><th>Categoria</th><th>Pagou</th><th>Divisão</th><th>Theo</th><th>Aline</th><th className="text-right">Total</th><th></th></tr></thead><tbody>{filteredCoupleExpenses.map((t) => <tr key={t.id} className="border-b last:border-0"><td className="py-4 whitespace-nowrap">{String(t.date).split("-").reverse().join("/")}</td><td className="font-bold">{t.description}</td><td>{t.category}</td><td>{t.paidBy}</td><td>{t.splitType}</td><td>{brl(t.theoShare)}</td><td>{brl(t.alineShare)}</td><td className="text-right font-black whitespace-nowrap">{brl(t.total)}</td><td className="text-right"><button onClick={() => removeCoupleExpense(t)} className="rounded-xl p-2 hover:bg-slate-100" type="button">🗑️</button></td></tr>)}</tbody></table></div>
            </Card>
          </>
        ) : null}

        {activeTab === "Pessoal" ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <StatCard label={"Receitas de " + currentUserName} value={brl(personalTotals.income)} icon="↗" />
              <StatCard label="Pix / Débito / Dinheiro" value={brl(personalTotals.pixExpense + personalTotals.debitExpense + personalTotals.cashExpense)} icon="⚡" />
              <StatCard label="Cartão do mês" value={brl(personalTotals.cardExpense)} icon="💳" />
              <StatCard label="Reembolso mãe/pai" value={brl(personalTotals.familyReimbursement)} icon="👪" />
              <StatCard dark label="Saldo pessoal" value={brl(personalTotals.balance)} icon="💰" />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card><SectionTitle title="Gastos por forma de pagamento" subtitle="Separação entre Pix, débito, dinheiro e cartão." /><div className="mt-5"><PieChart data={personalByPayment} /></div></Card>
              <Card><SectionTitle title="Fatura do cartão" subtitle={getCreditCardDueLabel(activeMonth)} /><div className="mt-5 rounded-[28px] bg-slate-950 p-6 text-white"><p className="text-sm text-white/60">Total estimado no cartão</p><p className="mt-2 text-4xl font-black tracking-tight">{brl(personalTotals.cardExpense)}</p></div></Card>
              <Card><SectionTitle title="Reembolso mãe/pai" subtitle="Compras pessoais que você fez para seus pais no mês." /><div className="mt-5 grid grid-cols-2 gap-3 text-center"><div className="rounded-3xl bg-rose-50 p-4"><p className="text-xs font-bold text-rose-500">Mãe</p><p className="mt-1 text-xl font-black">{brl(personalTotals.momReimbursement)}</p></div><div className="rounded-3xl bg-blue-50 p-4"><p className="text-xs font-bold text-blue-500">Pai</p><p className="mt-1 text-xl font-black">{brl(personalTotals.dadReimbursement)}</p></div></div><div className="mt-4 rounded-[28px] bg-slate-950 p-5 text-white"><p className="text-sm text-white/60">Total a pedir no mês</p><p className="mt-1 text-3xl font-black">{brl(personalTotals.familyReimbursement)}</p></div><div className="mt-4 space-y-2">{familyReimbursements.length === 0 ? <p className="text-sm text-slate-400">Nenhum reembolso familiar neste mês.</p> : null}{familyReimbursements.map((item) => <div key={item.id} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3 text-sm"><span><b>{item.reimbursementPerson}</b> · {item.description}</span><span className="font-black">{brl(item.value)}</span></div>)}</div></Card>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
              <Card className="lg:col-span-2"><SectionTitle title={"Novo lançamento pessoal de " + currentUserName} subtitle="Privado: só aparece para o usuário logado." /><div className="mt-4 grid grid-cols-2 gap-3"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>Despesa</option><option>Receita</option></Select><Input placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value, category: inferCategory(e.target.value) })} className="col-span-2" /><Input placeholder="Valor" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /><Input placeholder="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /><Select value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} className="col-span-2"><option>Cartão</option><option>Pix</option><option>Débito</option><option>Dinheiro</option><option>Conta PJ</option><option>Conta</option></Select></div><Button onClick={handleManualAdd} className="mt-4 w-full" type="button" disabled={currentMonthIsClosed}>Salvar lançamento</Button></Card>
              <Card className="lg:col-span-3"><SectionTitle title={"Gastos pessoais em " + monthLabel(activeMonth)} subtitle="Pizza de distribuição das despesas." /><div className="mt-5"><PieChart data={byCategory} /></div></Card>
            </div>

            <Card><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><SectionTitle title={"Lançamentos pessoais de " + currentUserName} /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar" className="md:max-w-xs" /></div><div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-slate-400"><th className="py-3">Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th className="text-right">Valor</th><th></th></tr></thead><tbody>{filteredTransactions.map((t) => <tr key={t.id} className="border-b last:border-0"><td className="py-4 whitespace-nowrap">{String(t.date).split("-").reverse().join("/")}</td><td>{t.type}</td><td className="font-bold">{t.description}</td><td>{t.category}</td><td>{t.account}</td><td className="text-right font-black whitespace-nowrap">{brl(t.value)}</td><td className="text-right"><button onClick={() => removePersonalTransaction(t)} className="rounded-xl p-2 hover:bg-slate-100" type="button">🗑️</button></td></tr>)}</tbody></table></div></Card>
          </>
        ) : null}

        {activeTab === "Anual" ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4"><StatCard dark label="Meses no painel" value={String(annualRows.length)} icon="📅" /><StatCard label="Gasto casal no ano" value={brl(annualRows.reduce((s, r) => s + r.coupleTotal, 0))} icon="🤝" /><StatCard label={"Despesa pessoal de " + currentUserName} value={brl(annualRows.reduce((s, r) => s + r.personalExpense, 0))} icon="↘" /><StatCard label={"Receita pessoal de " + currentUserName} value={brl(annualRows.reduce((s, r) => s + r.personalIncome, 0))} icon="↗" /></div>
            <Card><SectionTitle title="Visão anual" subtitle="Resumo por mês, com pessoal privado do usuário logado e casal compartilhado." /><div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-slate-400"><th className="py-3">Mês</th><th>Status</th><th>Gasto casal</th><th>Despesa pessoal</th><th>Receita pessoal</th><th>Pago Theo</th><th>Pago Aline</th><th>Saldo casal</th></tr></thead><tbody>{annualRows.map((row) => <tr key={row.key} className="border-b last:border-0"><td className="py-4 font-bold">{monthLabel(row.key)}</td><td>{row.closed ? "Fechado" : "Aberto"}</td><td>{brl(row.coupleTotal)}</td><td>{brl(row.personalExpense)}</td><td>{brl(row.personalIncome)}</td><td>{brl(row.theoPaid)}</td><td>{brl(row.alinePaid)}</td><td className="font-bold">{getBalanceText(row.coupleBalance)}</td></tr>)}</tbody></table></div></Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
