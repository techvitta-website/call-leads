// Gemini AI service for lead generation
// Add VITE_GEMINI_API_KEY to your .env file

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-latest:generateContent";

export interface AIGeneratedLead {
  id: string; // client-side only, for checkbox tracking
  company_name: string;
  contact_name: string;
  designation: string;
  email: string;
  phone: string;
  industry: string;
  city: string;
  country: string;
  priority: "urgent" | "high" | "medium" | "low";
  notes: string;
  software_category: string;
  source: string;
  product_fit: string; // Why this company fits the product
}

export interface GenerateLeadsOptions {
  products: string[]; // e.g. ["TrustDoc.in", "ChainTrack - TrustChainVault"]
  industry: string;
  region: string;
  count: number;
  companySize?: string;
}

export const generateLeadsWithAI = async (
  options: GenerateLeadsOptions
): Promise<AIGeneratedLead[]> => {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "Gemini API key not configured. Add VITE_GEMINI_API_KEY to your .env file."
    );
  }

  const productDescriptions = options.products
    .map((p) => {
      if (p === "TrustDoc.in")
        return "TrustDoc.in — Blockchain-based document verification & management system. Helps companies issue, verify and track tamper-proof digital certificates, invoices, contracts and compliance documents on the blockchain.";
      if (p === "ChainTrack")
        return "ChainTrack (trustchainvault.com) — Blockchain supply chain tracking system. End-to-end traceability for raw materials, manufacturing, logistics and retail using immutable blockchain ledger.";
      return p;
    })
    .join("\n");

  const prompt = `You are an expert B2B sales lead generator for blockchain-based enterprise software.

PRODUCTS TO SELL:
${productDescriptions}

TASK: Generate ${options.count} realistic, high-quality B2B sales leads for the ${options.industry} industry in ${options.region}.

TARGET CRITERIA:
- Companies that handle high-value documents, contracts or compliance (TrustDoc fit)
- Companies with complex supply chains, logistics or multi-tier sourcing (ChainTrack fit)
- Company size: ${options.companySize || "SME to Enterprise"}
- Decision makers: CEO, CTO, Operations Manager, Supply Chain Director, Compliance Officer

Return ONLY a valid JSON array (no markdown, no explanation) with exactly ${options.count} objects. Each object must have ALL these fields:
- company_name: string (realistic company name for the region)
- contact_name: string (full name of the decision maker)
- designation: string (job title)
- email: string (professional email, format: firstname.lastname@companydomain.com)
- phone: string (local format phone for ${options.region})
- industry: string (specific sub-industry, e.g. "Automotive Manufacturing")
- city: string (city in ${options.region})
- country: string (country)
- priority: "high" | "medium" | "low" (based on urgency of their need)
- notes: string (2 sentences explaining why they need blockchain ERP — be specific to their business)
- software_category: "blockchain_erp"
- source: "AI Generated"
- product_fit: string (which product fits best: "TrustDoc.in", "ChainTrack", or "Both")

JSON array only, starting with [ and ending with ]`;

  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const rawText =
    data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Parse JSON — strip any markdown fences if present
  const jsonStr = rawText
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  let leads: Omit<AIGeneratedLead, "id">[];
  try {
    leads = JSON.parse(jsonStr);
  } catch {
    throw new Error(
      "Gemini returned invalid JSON. Try again or reduce lead count."
    );
  }

  if (!Array.isArray(leads)) {
    throw new Error("Gemini response was not a JSON array.");
  }

  // Attach client-side IDs for checkbox tracking
  return leads.map((lead, i) => ({
    ...lead,
    id: `ai-lead-${Date.now()}-${i}`,
    priority: (["urgent", "high", "medium", "low"].includes(lead.priority)
      ? lead.priority
      : "medium") as AIGeneratedLead["priority"],
  }));
};
