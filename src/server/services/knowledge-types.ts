import type { ProposedAssociation } from "@/core/knowledge/extraction";

/** La proposition d'association telle qu'on la garde : ce que le document dit, et les produits retrouvés dans les stocks des pharmacies. */
export type StoredAssociation = ProposedAssociation & {
  triggerEan?: string | null;
  triggerResolvedName?: string | null;
  adviceEan?: string | null;
  adviceResolvedName?: string | null;
};

export type KnowledgeProposalView = {
  id: string;
  kind: "ASSOCIATION" | "RULE";
  title: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  problem: string | null;
  quote: string;
  payload: unknown;
  decidedByName: string | null;
  decidedAt: Date | null;
};
export type KnowledgeDocumentView = {
  id: string;
  title: string;
  sourceType: string;
  fileName: string | null;
  sizeBytes: number;
  note: string | null;
  status: string;
  analysisError: string | null;
  analysedAt: Date | null;
  discardedCount: number;
  createdByName: string | null;
  createdAt: Date;
  excerpt: string;
  proposals: KnowledgeProposalView[];
};

