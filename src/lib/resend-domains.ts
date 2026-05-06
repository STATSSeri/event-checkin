/**
 * Resend Domains API ラッパー
 *
 * Resend SDK v6 の Domains API を、本アプリの型に合わせて薄くラップする。
 * 各メソッドはエラー時に { ok: false, error } を返し、API ルート側で 4xx/5xx を返す。
 *
 * セキュリティ：
 *  - RESEND_API_KEY はサーバー専用環境変数（クライアントに漏れない）
 *  - 呼び出し元は API ルート（認証・認可済み）のみを想定
 */

import { Resend } from 'resend';
import type { DnsRecord, SenderDomainStatus } from '@/types';

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/** 成功 / 失敗のユニオン結果 */
export type ResendResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; statusCode?: number };

/** ドメイン作成時の Resend レスポンス（このアプリで使う部分のみ） */
export interface CreatedDomain {
  resendDomainId: string;
  status: SenderDomainStatus;
  records: DnsRecord[];
}

/** ドメイン取得・検証後のレスポンス */
export interface DomainState {
  resendDomainId: string;
  status: SenderDomainStatus;
  records: DnsRecord[];
}

/**
 * Resend SDK のレコード形を、このアプリの DnsRecord 型に正規化する
 */
function normalizeRecords(records: unknown[] | undefined): DnsRecord[] {
  if (!Array.isArray(records)) return [];
  return records.map((r) => {
    const rec = r as Record<string, unknown>;
    return {
      record: String(rec.record ?? ''),
      name: String(rec.name ?? ''),
      value: String(rec.value ?? ''),
      type: String(rec.type ?? ''),
      ttl: typeof rec.ttl === 'string' ? rec.ttl : undefined,
      status:
        typeof rec.status === 'string'
          ? (rec.status as SenderDomainStatus)
          : undefined,
      priority: typeof rec.priority === 'number' ? rec.priority : undefined,
    };
  });
}

/**
 * 新規ドメインを Resend に作成
 * 既に同名ドメインが Resend 側に存在する場合はエラーで返る
 */
export async function createResendDomain(
  domain: string,
): Promise<ResendResult<CreatedDomain>> {
  try {
    const { data, error } = await getResend().domains.create({ name: domain });
    if (error || !data) {
      return {
        ok: false,
        error: error?.message ?? 'Failed to create domain',
        statusCode: 502,
      };
    }
    return {
      ok: true,
      data: {
        resendDomainId: data.id,
        status: data.status as SenderDomainStatus,
        records: normalizeRecords(data.records as unknown[]),
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      statusCode: 500,
    };
  }
}

/**
 * ドメインの最新状態を Resend から取得
 */
export async function getResendDomain(
  resendDomainId: string,
): Promise<ResendResult<DomainState>> {
  try {
    const { data, error } = await getResend().domains.get(resendDomainId);
    if (error || !data) {
      return {
        ok: false,
        error: error?.message ?? 'Failed to get domain',
        statusCode: 502,
      };
    }
    return {
      ok: true,
      data: {
        resendDomainId: data.id,
        status: data.status as SenderDomainStatus,
        records: normalizeRecords(data.records as unknown[]),
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      statusCode: 500,
    };
  }
}

/**
 * ドメインの検証を Resend に依頼
 */
export async function verifyResendDomain(
  resendDomainId: string,
): Promise<ResendResult<{ status: SenderDomainStatus }>> {
  try {
    const { data, error } = await getResend().domains.verify(resendDomainId);
    if (error || !data) {
      return {
        ok: false,
        error: error?.message ?? 'Failed to verify domain',
        statusCode: 502,
      };
    }
    // verify の戻りには status が含まれないバージョンがあるため、改めて get する
    const fresh = await getResendDomain(resendDomainId);
    if (!fresh.ok) return fresh;
    return { ok: true, data: { status: fresh.data.status } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      statusCode: 500,
    };
  }
}

/**
 * ドメインを Resend から削除
 */
export async function removeResendDomain(
  resendDomainId: string,
): Promise<ResendResult<{ deleted: true }>> {
  try {
    const { error } = await getResend().domains.remove(resendDomainId);
    if (error) {
      return {
        ok: false,
        error: error.message ?? 'Failed to remove domain',
        statusCode: 502,
      };
    }
    return { ok: true, data: { deleted: true } };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      statusCode: 500,
    };
  }
}
