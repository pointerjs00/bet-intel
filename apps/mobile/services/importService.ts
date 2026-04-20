import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './apiClient';
import { boletinQueryKeys } from './boletinService';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedBetclicItem {
  homeTeam: string;
  homeTeamImageUrl?: string | null;
  awayTeam: string;
  awayTeamImageUrl?: string | null;
  competition: string;
  sport: string;
  market: string;
  selection: string;
  oddValue: number;
  /** ISO date string for the individual event (may differ from boletin betDate) */
  eventDate?: string;
  /** Individual selection result — only present on resolved bets */
  result?: 'WON' | 'LOST' | 'VOID' | 'PENDING';
}

export interface ParsedBetclicBoletin {
  reference: string;
  betDate: string;
  stake: number;
  totalOdds: number;
  potentialReturn: number;
  status: string;
  items: ParsedBetclicItem[];
  parseError: boolean;
  parseErrorReason?: string;
}

export interface BetclicPdfResult {
  boletins: ParsedBetclicBoletin[];
  totalFound: number;
  errorCount: number;
}

export interface BulkImportResult {
  imported: number;
  duplicates: number;
  errors: number;
  errorDetails?: string[];
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
}

// ─── API Calls ───────────────────────────────────────────────────────────────

/** Sends a base64-encoded PDF to the backend for parsing. */
export async function parseBetclicPdfRequest(pdfBase64: string): Promise<BetclicPdfResult> {
  const response = await apiClient.post<ApiEnvelope<BetclicPdfResult>>(
    '/boletins/import/pdf',
    { pdfBase64, source: 'betclic' },
  );
  return response.data.data;
}

/** Sends a screenshot image to the backend for AI-powered parsing (Gemini Vision). */
export async function scanImageAiRequest(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg',
): Promise<BetclicPdfResult> {
  const response = await apiClient.post<ApiEnvelope<BetclicPdfResult>>(
    '/boletins/import/scan-ai',
    { imageBase64, mimeType },
    { timeout: 60000 }, // Gemini Vision can take up to 30s
  );
  return response.data.data;
}

/** Fetches bet history from the Betclic API using the user's session token. */
export async function fetchBetclicApiRequest(
  authToken: string,
  maxBets?: number,
): Promise<BetclicPdfResult> {
  const response = await apiClient.post<ApiEnvelope<BetclicPdfResult>>(
    '/boletins/import/betclic-api',
    { authToken, maxBets },
  );
  return response.data.data;
}

/** Sends the selected parsed boletins for bulk creation. */
export async function bulkImportRequest(
  boletins: ParsedBetclicBoletin[],
): Promise<BulkImportResult> {
  const response = await apiClient.post<ApiEnvelope<BulkImportResult>>(
    '/boletins/import/bulk',
    { boletins, source: 'betclic' },
  );
  return response.data.data;
}

// ─── AI scan feedback (fine-tuning data collection) ──────────────────────────

interface ScanFeedbackContext {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  aiOutput: BetclicPdfResult;
}

/** Module-level store — carries scan context from scan.tsx to import-review.tsx. */
let _pendingScanFeedback: ScanFeedbackContext | null = null;

/** Call in scan.tsx immediately after a successful AI scan, before navigating. */
export function storeScanFeedbackContext(ctx: ScanFeedbackContext): void {
  _pendingScanFeedback = ctx;
}

/**
 * Call in import-review.tsx after a successful bulk import.
 * Returns the stored context and clears the module-level variable.
 */
export function consumeScanFeedbackContext(): ScanFeedbackContext | null {
  const ctx = _pendingScanFeedback;
  _pendingScanFeedback = null;
  return ctx;
}

/**
 * Silently sends the original AI output + user-corrected output to the backend
 * for fine-tuning data collection. Fire-and-forget — never throw.
 */
export async function submitScanFeedbackRequest(
  imageBase64: string,
  mimeType: string,
  aiOutput: BetclicPdfResult,
  correctedOutput: BetclicPdfResult,
): Promise<void> {
  await apiClient.post(
    '/boletins/import/scan-feedback',
    { imageBase64, mimeType, aiOutput, correctedOutput },
    { timeout: 30000 },
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** Mutation hook for parsing a Betclic PDF. */
export function useParseBetclicPdfMutation() {
  return useMutation({
    mutationFn: parseBetclicPdfRequest,
  });
}

/** Mutation hook for AI vision scanning of bet slip screenshots. */
export function useScanImageAiMutation() {
  return useMutation({
    mutationFn: ({ imageBase64, mimeType }: { imageBase64: string; mimeType?: 'image/jpeg' | 'image/png' | 'image/webp' }) =>
      scanImageAiRequest(imageBase64, mimeType),
  });
}

/** Mutation hook for fetching bets from the Betclic API. */
export function useFetchBetclicApiMutation() {
  return useMutation({
    mutationFn: ({ authToken, maxBets }: { authToken: string; maxBets?: number }) =>
      fetchBetclicApiRequest(authToken, maxBets),
  });
}

/** Mutation hook for bulk-importing reviewed boletins. */
export function useBulkImportMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bulkImportRequest,
    onSuccess: () => {
      // Invalidate boletins and stats so list, journal, and stats reflect new data
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.mine() });
      void queryClient.invalidateQueries({ queryKey: boletinQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
