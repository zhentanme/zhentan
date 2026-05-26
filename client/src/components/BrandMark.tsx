import Image from "next/image";
import Link from "next/link";
import { clsx } from "clsx";

export const brandTextClass = "font-bold text-gold-dark/90 tracking-tight";

type BrandMarkSize = "sm" | "md" | "lg" | "xl" | "hero";

const SIZE_CONFIG: Record<BrandMarkSize, { icon: number; text: string }> = {
  sm: { icon: 32, text: "text-base" },
  md: { icon: 40, text: "text-lg" },
  lg: { icon: 42, text: "text-xl" },
  xl: { icon: 48, text: "text-2xl" },
  hero: { icon: 72, text: "text-4xl sm:text-5xl" },
};

interface BrandMarkProps {
  href?: string;
  size?: BrandMarkSize;
  iconSize?: number;
  iconClassName?: string;
  textClassName?: string;
  className?: string;
  priority?: boolean;
  glow?: boolean;
}

export function BrandMark({
  href,
  size = "md",
  iconSize,
  iconClassName,
  textClassName,
  className,
  priority,
  glow,
}: BrandMarkProps) {
  const config = SIZE_CONFIG[size];
  const resolvedIconSize = iconSize ?? config.icon;
  const resolvedTextClassName =
    textClassName ?? clsx(brandTextClass, config.text);

  const content = (
    <>
      <Image
        src="/icon.png"
        alt=""
        width={resolvedIconSize}
        height={resolvedIconSize}
        className={clsx(
          "object-contain shrink-0",
          glow && "drop-shadow-[0_0_28px_rgba(229,168,50,0.3)]",
          iconClassName
        )}
        priority={priority}
      />
      <span className={resolvedTextClassName}>Zhentan</span>
    </>
  );

  const wrapperClass = clsx("flex items-center gap-2.5", className);

  if (href) {
    return (
      <Link href={href} className={wrapperClass} aria-label="Zhentan">
        {content}
      </Link>
    );
  }

  return <div className={wrapperClass}>{content}</div>;
}
