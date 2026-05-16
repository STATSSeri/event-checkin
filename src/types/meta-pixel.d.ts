// Meta Pixel (fbq) のグローバル型定義
// 参考: https://developers.facebook.com/docs/meta-pixel/reference

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

export {};
