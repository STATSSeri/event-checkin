'use client';

/**
 * パスワード入力中にリアルタイムでポリシー充足状況を表示する小コンポーネント。
 *
 * 表示要件は IS10 #19 準拠（10文字以上 + 4種類のうち3種類）。
 */

import {
  CLASS_LABELS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIRED_CLASS_COUNT,
  checkPassword,
  type PasswordClass,
} from '@/lib/password-policy';

interface Props {
  password: string;
}

const ALL_CLASSES: PasswordClass[] = ['upper', 'lower', 'digit', 'special'];

export function PasswordStrengthHint({ password }: Props) {
  const r = checkPassword(password);

  return (
    <div className="text-[11px] leading-relaxed space-y-1 mt-1">
      <Row
        ok={r.hasMinLength}
        label={`${PASSWORD_MIN_LENGTH}文字以上`}
        detail={password ? `現在 ${r.length} 文字` : undefined}
      />
      <Row
        ok={r.hasEnoughClasses}
        label={`大/小/数字/記号のうち ${PASSWORD_REQUIRED_CLASS_COUNT} 種類以上`}
        detail={
          password
            ? `${r.classesPresent.length} 種類含まれています`
            : undefined
        }
      />
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pl-3 mt-1">
        {ALL_CLASSES.map((cls) => {
          const present = r.classesPresent.includes(cls);
          return (
            <div
              key={cls}
              className={present ? 'text-emerald-700' : 'text-forest-60'}
            >
              {present ? '✓' : '·'} {CLASS_LABELS[cls]}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <div className={ok ? 'text-emerald-700' : 'text-forest-60'}>
      <span className="inline-block w-4">{ok ? '✓' : '·'}</span>
      <span>{label}</span>
      {detail && <span className="ml-2 text-forest-60">（{detail}）</span>}
    </div>
  );
}
