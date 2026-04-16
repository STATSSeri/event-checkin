import QRCode from 'qrcode';

// サーバー側でQRコードをBuffer(PNG)として生成
export async function generateQRBuffer(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { width: 400, margin: 2, type: 'png' });
}
