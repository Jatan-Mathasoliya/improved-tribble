/**
 * Backwards-compatible ActiveKG client wrapper.
 *
 * The canonical implementation now lives in `./services/activekg-client`.
 * This file keeps the older sync-oriented call signatures working so we do
 * not drift into two separate implementations again.
 */

import {
  ActiveKGClientError,
  createEdge as createEdgeCanonical,
  createNode as createNodeCanonical,
  getNodeByExternalId as getNodeByExternalIdCanonical,
  type ActiveKGEdgeCreateRequest,
  type ActiveKGNodeByExternalIdResponse,
  type ActiveKGNodeCreateRequest,
  type ActiveKGNodeCreateResponse,
} from './services/activekg-client';

export type ActiveKGNodePayload = ActiveKGNodeCreateRequest;
export type ActiveKGEdgePayload = ActiveKGEdgeCreateRequest;

export interface ActiveKGNodeResponse extends ActiveKGNodeCreateResponse {
  tenant_id?: string;
  classes?: string[];
  props?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  payload_ref?: string | null;
  embedding_status?: string;
  job_id?: string;
}

export { ActiveKGClientError };

export async function createNode(
  payload: ActiveKGNodePayload,
  tenantId: string,
): Promise<ActiveKGNodeResponse> {
  return createNodeCanonical(tenantId, payload);
}

export async function createEdge(
  payload: ActiveKGEdgePayload,
  tenantId: string,
): Promise<void> {
  await createEdgeCanonical(tenantId, payload);
}

export async function getNodeByExternalId(
  externalId: string,
  tenantId: string,
): Promise<ActiveKGNodeByExternalIdResponse | null> {
  return getNodeByExternalIdCanonical(tenantId, externalId);
}
